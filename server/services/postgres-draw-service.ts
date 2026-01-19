/**
 * PostgreSQL draw service implementation
 */

import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/postgres.js';
import type {
  DrawService,
  Draw,
  Match,
  Standing,
  DrawWithMatches,
  CreateDrawInput,
  UpdateMatchInput,
  RecordResultInput,
  DrawResult,
  DrawType,
  DrawStatus,
  MatchStatus,
  SetScore,
  MatchSeed,
  DrawConfig,
} from './draw-service.js';

interface DbDraw {
  id: string;
  division_id: string;
  draw_type: string;
  status: string;
  config: DrawConfig | null;
  created_at: Date;
  updated_at: Date;
}

interface DbMatch {
  id: string;
  draw_id: string;
  round_number: number;
  match_number: number;
  entry1_id: string | null;
  entry2_id: string | null;
  winner_entry_id: string | null;
  score: SetScore[] | null;
  status: string;
  scheduled_time: Date | null;
  court: string | null;
  source_match1_id: string | null;
  source_match2_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DbStanding {
  id: string;
  draw_id: string;
  entry_id: string;
  wins: number;
  losses: number;
  games_won: number;
  games_lost: number;
  points: number;
  position: number | null;
  updated_at: Date;
}

interface DbEntry {
  id: string;
  division_id: string;
  entry_type: string;
  player_id: string | null;
  team_id: string | null;
  seed: number | null;
}

export class PostgresDrawService implements DrawService {
  private mapRowToDraw(row: DbDraw): Draw {
    return {
      id: row.id,
      divisionId: row.division_id,
      drawType: row.draw_type as DrawType,
      status: row.status as DrawStatus,
      config: row.config,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToMatch(row: DbMatch): Match {
    return {
      id: row.id,
      drawId: row.draw_id,
      roundNumber: row.round_number,
      matchNumber: row.match_number,
      entry1Id: row.entry1_id,
      entry2Id: row.entry2_id,
      winnerEntryId: row.winner_entry_id,
      score: row.score,
      status: row.status as MatchStatus,
      scheduledTime: row.scheduled_time ? new Date(row.scheduled_time) : null,
      court: row.court,
      sourceMatch1Id: row.source_match1_id,
      sourceMatch2Id: row.source_match2_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToStanding(row: DbStanding): Standing {
    return {
      id: row.id,
      drawId: row.draw_id,
      entryId: row.entry_id,
      wins: row.wins,
      losses: row.losses,
      gamesWon: row.games_won,
      gamesLost: row.games_lost,
      points: row.points,
      position: row.position,
      updatedAt: new Date(row.updated_at),
    };
  }

  // Draw generation helpers
  private generateSeedPositions(bracketSize: number): number[] {
    if (bracketSize === 2) return [0, 1];

    const positions: number[] = [];
    const half = bracketSize / 2;
    const subPositions = this.generateSeedPositions(half);

    for (let i = 0; i < half; i++) {
      positions.push(subPositions[i] * 2);
      positions.push(bracketSize - 1 - subPositions[i] * 2);
    }

    return positions;
  }

  private generateSingleEliminationMatches(entries: DbEntry[]): MatchSeed[] {
    const n = entries.length;
    if (n < 2) return [];

    const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
    const totalRounds = Math.log2(bracketSize);

    const seededEntries = [...entries].sort((a, b) => {
      if (a.seed === null && b.seed === null) return 0;
      if (a.seed === null) return 1;
      if (b.seed === null) return -1;
      return a.seed - b.seed;
    });

    const seedPositions = this.generateSeedPositions(bracketSize);

    const bracket: (string | null)[] = new Array(bracketSize).fill(null);
    for (let i = 0; i < n; i++) {
      bracket[seedPositions[i]] = seededEntries[i].id;
    }

    const matches: MatchSeed[] = [];

    for (let i = 0; i < bracketSize / 2; i++) {
      const entry1Idx = i * 2;
      const entry2Idx = i * 2 + 1;
      const entry1Id = bracket[entry1Idx];
      const entry2Id = bracket[entry2Idx];

      matches.push({
        roundNumber: 1,
        matchNumber: i + 1,
        entry1Id,
        entry2Id,
        isBye: entry1Id === null || entry2Id === null,
      });
    }

    let matchesInRound = bracketSize / 4;
    let matchNumberOffset = bracketSize / 2;

    for (let round = 2; round <= totalRounds; round++) {
      for (let i = 0; i < matchesInRound; i++) {
        const sourceMatch1 = matchNumberOffset - matchesInRound * 2 + i * 2 + 1;
        const sourceMatch2 = sourceMatch1 + 1;

        matches.push({
          roundNumber: round,
          matchNumber: matchNumberOffset + i + 1,
          entry1Id: null,
          entry2Id: null,
          sourceMatch1Num: sourceMatch1,
          sourceMatch2Num: sourceMatch2,
        });
      }
      matchNumberOffset += matchesInRound;
      matchesInRound = matchesInRound / 2;
    }

    return matches;
  }

  private generateRoundRobinMatches(entries: DbEntry[]): MatchSeed[] {
    const n = entries.length;
    if (n < 2) return [];

    const matches: MatchSeed[] = [];
    const ids = entries.map(e => e.id);

    const numRounds = n % 2 === 0 ? n - 1 : n;
    const half = Math.ceil(n / 2);

    const participants = n % 2 === 0 ? [...ids] : [...ids, null];
    const fixed = participants[0];
    const rotating = participants.slice(1);

    let matchNumber = 1;

    for (let round = 1; round <= numRounds; round++) {
      if (fixed !== null && rotating[0] !== null) {
        matches.push({
          roundNumber: round,
          matchNumber: matchNumber++,
          entry1Id: fixed,
          entry2Id: rotating[0],
        });
      }

      for (let i = 1; i < half; i++) {
        const top = rotating[i];
        const bottom = rotating[rotating.length - i];
        if (top !== null && bottom !== null) {
          matches.push({
            roundNumber: round,
            matchNumber: matchNumber++,
            entry1Id: top,
            entry2Id: bottom,
          });
        }
      }

      rotating.unshift(rotating.pop()!);
    }

    return matches;
  }

  async createDraw(divisionId: string, input: CreateDrawInput): Promise<DrawResult<Draw>> {
    const pool = getPool();

    // Verify division exists
    const divisionResult = await pool.query('SELECT id FROM divisions WHERE id = $1', [divisionId]);
    if (divisionResult.rows.length === 0) {
      return { success: false, error: 'division_not_found', message: 'Division not found' };
    }

    // Get entries for this division
    const entriesResult = await pool.query<DbEntry>('SELECT * FROM entries WHERE division_id = $1', [divisionId]);
    const entries = entriesResult.rows;

    if (entries.length < 2) {
      return { success: false, error: 'insufficient_entries', message: 'At least 2 entries required to create a draw' };
    }

    const validDrawTypes: DrawType[] = ['single_elimination', 'double_elimination', 'round_robin'];
    if (!validDrawTypes.includes(input.drawType)) {
      return { success: false, error: 'invalid_draw_type', message: 'Invalid draw type' };
    }

    const drawId = uuidv4();

    let config: DrawConfig | null = input.config || null;
    if (input.drawType === 'single_elimination' || input.drawType === 'double_elimination') {
      const bracketSize = Math.pow(2, Math.ceil(Math.log2(entries.length)));
      config = { ...config, bracketSize };
    }

    // Create the draw
    await pool.query(`
      INSERT INTO draws (id, division_id, draw_type, status, config)
      VALUES ($1, $2, $3, 'draft', $4)
    `, [drawId, divisionId, input.drawType, config ? JSON.stringify(config) : null]);

    // Generate matches based on draw type
    let matchSeeds: MatchSeed[];
    if (input.drawType === 'round_robin') {
      matchSeeds = this.generateRoundRobinMatches(entries);
    } else {
      matchSeeds = this.generateSingleEliminationMatches(entries);
    }

    const matchIdMap: Map<number, string> = new Map();

    // First pass: create all matches
    for (const seed of matchSeeds) {
      const matchId = uuidv4();
      matchIdMap.set(seed.matchNumber, matchId);

      const status = seed.isBye ? 'walkover' : 'pending';
      const winnerId = seed.isBye ? (seed.entry1Id || seed.entry2Id) : null;

      await pool.query(`
        INSERT INTO matches (id, draw_id, round_number, match_number, entry1_id, entry2_id, winner_entry_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [matchId, drawId, seed.roundNumber, seed.matchNumber, seed.entry1Id, seed.entry2Id, winnerId, status]);
    }

    // Second pass: link source matches
    for (const seed of matchSeeds) {
      if (seed.sourceMatch1Num || seed.sourceMatch2Num) {
        const matchId = matchIdMap.get(seed.matchNumber)!;
        const source1Id = seed.sourceMatch1Num ? matchIdMap.get(seed.sourceMatch1Num) || null : null;
        const source2Id = seed.sourceMatch2Num ? matchIdMap.get(seed.sourceMatch2Num) || null : null;
        await pool.query(`
          UPDATE matches SET source_match1_id = $1, source_match2_id = $2 WHERE id = $3
        `, [source1Id, source2Id, matchId]);
      }
    }

    // For elimination draws, advance bye winners to next round
    if (input.drawType === 'single_elimination' || input.drawType === 'double_elimination') {
      for (const seed of matchSeeds) {
        if (seed.isBye) {
          const winnerId = seed.entry1Id || seed.entry2Id;
          if (winnerId) {
            const matchId = matchIdMap.get(seed.matchNumber)!;
            await this.advanceWinnerInternal(matchId, winnerId);
          }
        }
      }
    }

    // For round robin, initialize standings
    if (input.drawType === 'round_robin') {
      for (const entry of entries) {
        await pool.query(`
          INSERT INTO standings (id, draw_id, entry_id, wins, losses, games_won, games_lost, points, position)
          VALUES ($1, $2, $3, 0, 0, 0, 0, 0, NULL)
        `, [uuidv4(), drawId, entry.id]);
      }
    }

    const draw = await this.getDraw(drawId);
    return { success: true, data: draw! };
  }

  private async advanceWinnerInternal(matchId: string, winnerId: string): Promise<void> {
    const pool = getPool();

    const matchResult = await pool.query<DbMatch>('SELECT * FROM matches WHERE id = $1', [matchId]);
    if (matchResult.rows.length === 0) return;
    const match = matchResult.rows[0];

    const nextMatchResult = await pool.query<DbMatch>(`
      SELECT * FROM matches
      WHERE draw_id = $1 AND (source_match1_id = $2 OR source_match2_id = $2)
    `, [match.draw_id, matchId]);

    if (nextMatchResult.rows.length === 0) return;
    const nextMatch = nextMatchResult.rows[0];

    if (nextMatch.source_match1_id === matchId) {
      await pool.query('UPDATE matches SET entry1_id = $1 WHERE id = $2', [winnerId, nextMatch.id]);
    } else if (nextMatch.source_match2_id === matchId) {
      await pool.query('UPDATE matches SET entry2_id = $1 WHERE id = $2', [winnerId, nextMatch.id]);
    }
  }

  async getDraw(drawId: string): Promise<Draw | null> {
    const pool = getPool();
    const result = await pool.query<DbDraw>('SELECT * FROM draws WHERE id = $1', [drawId]);
    return result.rows.length > 0 ? this.mapRowToDraw(result.rows[0]) : null;
  }

  async getDrawWithMatches(drawId: string): Promise<DrawWithMatches | null> {
    const draw = await this.getDraw(drawId);
    if (!draw) return null;

    const matches = await this.getDrawMatches(drawId);
    return { ...draw, matches };
  }

  async getDivisionDraws(divisionId: string): Promise<Draw[]> {
    const pool = getPool();
    const result = await pool.query<DbDraw>(
      'SELECT * FROM draws WHERE division_id = $1 ORDER BY created_at DESC',
      [divisionId]
    );
    return result.rows.map(row => this.mapRowToDraw(row));
  }

  async activateDraw(drawId: string): Promise<DrawResult<Draw>> {
    const pool = getPool();
    const draw = await this.getDraw(drawId);

    if (!draw) {
      return { success: false, error: 'draw_not_found', message: 'Draw not found' };
    }

    if (draw.status === 'active') {
      return { success: false, error: 'draw_already_active', message: 'Draw is already active' };
    }

    if (draw.status === 'completed') {
      return { success: false, error: 'draw_is_completed', message: 'Cannot activate a completed draw' };
    }

    await pool.query('UPDATE draws SET status = $1 WHERE id = $2', ['active', drawId]);

    const updated = await this.getDraw(drawId);
    return { success: true, data: updated! };
  }

  async deleteDraw(drawId: string): Promise<DrawResult<void>> {
    const pool = getPool();
    const draw = await this.getDraw(drawId);

    if (!draw) {
      return { success: false, error: 'draw_not_found', message: 'Draw not found' };
    }

    if (draw.status !== 'draft') {
      return { success: false, error: 'draw_is_active', message: 'Can only delete draft draws' };
    }

    await pool.query('DELETE FROM standings WHERE draw_id = $1', [drawId]);
    await pool.query('DELETE FROM matches WHERE draw_id = $1', [drawId]);
    await pool.query('DELETE FROM draws WHERE id = $1', [drawId]);

    return { success: true, data: undefined };
  }

  async getMatch(matchId: string): Promise<Match | null> {
    const pool = getPool();
    const result = await pool.query<DbMatch>('SELECT * FROM matches WHERE id = $1', [matchId]);
    return result.rows.length > 0 ? this.mapRowToMatch(result.rows[0]) : null;
  }

  async getDrawMatches(drawId: string): Promise<Match[]> {
    const pool = getPool();
    const result = await pool.query<DbMatch>(
      'SELECT * FROM matches WHERE draw_id = $1 ORDER BY round_number, match_number',
      [drawId]
    );
    return result.rows.map(row => this.mapRowToMatch(row));
  }

  async updateMatch(matchId: string, input: UpdateMatchInput): Promise<DrawResult<Match>> {
    const pool = getPool();
    const match = await this.getMatch(matchId);

    if (!match) {
      return { success: false, error: 'match_not_found', message: 'Match not found' };
    }

    const updates: string[] = [];
    const values: (string | null | Date)[] = [];
    let paramIndex = 1;

    if (input.scheduledTime !== undefined) {
      updates.push(`scheduled_time = $${paramIndex++}`);
      values.push(input.scheduledTime);
    }

    if (input.court !== undefined) {
      updates.push(`court = $${paramIndex++}`);
      values.push(input.court);
    }

    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (updates.length > 0) {
      values.push(matchId);
      await pool.query(
        `UPDATE matches SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    }

    const updated = await this.getMatch(matchId);
    return { success: true, data: updated! };
  }

  async recordResult(matchId: string, input: RecordResultInput): Promise<DrawResult<Match>> {
    const pool = getPool();
    const match = await this.getMatch(matchId);

    if (!match) {
      return { success: false, error: 'match_not_found', message: 'Match not found' };
    }

    const draw = await this.getDraw(match.drawId);
    if (!draw) {
      return { success: false, error: 'draw_not_found', message: 'Draw not found' };
    }

    if (draw.status !== 'active') {
      return { success: false, error: 'draw_not_active', message: 'Draw must be active to record results' };
    }

    if (['completed', 'walkover', 'retired'].includes(match.status)) {
      return { success: false, error: 'match_already_completed', message: 'Match already has a result' };
    }

    if (input.winnerId !== match.entry1Id && input.winnerId !== match.entry2Id) {
      return { success: false, error: 'invalid_winner', message: 'Winner must be one of the match participants' };
    }

    if (input.status === 'completed' && !input.score) {
      return { success: false, error: 'invalid_score', message: 'Score is required for completed matches' };
    }

    await pool.query(`
      UPDATE matches
      SET winner_entry_id = $1, score = $2, status = $3
      WHERE id = $4
    `, [input.winnerId, input.score ? JSON.stringify(input.score) : null, input.status, matchId]);

    // Advance winner to next round (for elimination draws)
    if (draw.drawType === 'single_elimination' || draw.drawType === 'double_elimination') {
      const nextMatchResult = await pool.query<DbMatch>(`
        SELECT * FROM matches
        WHERE draw_id = $1 AND (source_match1_id = $2 OR source_match2_id = $2)
      `, [draw.id, matchId]);

      if (nextMatchResult.rows.length > 0) {
        const nextMatch = nextMatchResult.rows[0];
        if (nextMatch.source_match1_id === matchId) {
          await pool.query('UPDATE matches SET entry1_id = $1 WHERE id = $2', [input.winnerId, nextMatch.id]);
        } else if (nextMatch.source_match2_id === matchId) {
          await pool.query('UPDATE matches SET entry2_id = $1 WHERE id = $2', [input.winnerId, nextMatch.id]);
        }
      }
    }

    // Update standings (for round robin)
    if (draw.drawType === 'round_robin') {
      await this.recalculateStandings(draw.id);
    }

    // Check if draw is completed
    await this.checkDrawCompletion(draw.id);

    const updated = await this.getMatch(matchId);
    return { success: true, data: updated! };
  }

  async clearResult(matchId: string): Promise<DrawResult<Match>> {
    const pool = getPool();
    const match = await this.getMatch(matchId);

    if (!match) {
      return { success: false, error: 'match_not_found', message: 'Match not found' };
    }

    const draw = await this.getDraw(match.drawId);
    if (!draw) {
      return { success: false, error: 'draw_not_found', message: 'Draw not found' };
    }

    if (draw.status === 'completed') {
      return { success: false, error: 'draw_is_completed', message: 'Cannot modify completed draw' };
    }

    // Check if next match has been played
    const nextMatchResult = await pool.query<DbMatch>(`
      SELECT * FROM matches
      WHERE draw_id = $1 AND (source_match1_id = $2 OR source_match2_id = $2)
    `, [draw.id, matchId]);

    if (nextMatchResult.rows.length > 0) {
      const nextMatch = nextMatchResult.rows[0];
      if (['completed', 'walkover', 'retired'].includes(nextMatch.status)) {
        return { success: false, error: 'cannot_clear_result', message: 'Cannot clear result - winner has already played next match' };
      }

      // Clear winner from next match
      if (nextMatch.source_match1_id === matchId) {
        await pool.query('UPDATE matches SET entry1_id = NULL WHERE id = $1', [nextMatch.id]);
      } else if (nextMatch.source_match2_id === matchId) {
        await pool.query('UPDATE matches SET entry2_id = NULL WHERE id = $1', [nextMatch.id]);
      }
    }

    // Clear the result
    await pool.query(`
      UPDATE matches
      SET winner_entry_id = NULL, score = NULL, status = 'pending'
      WHERE id = $1
    `, [matchId]);

    // Recalculate standings (for round robin)
    if (draw.drawType === 'round_robin') {
      await this.recalculateStandings(draw.id);
    }

    const updated = await this.getMatch(matchId);
    return { success: true, data: updated! };
  }

  async getStandings(drawId: string): Promise<Standing[]> {
    const pool = getPool();
    const result = await pool.query<DbStanding>(`
      SELECT * FROM standings
      WHERE draw_id = $1
      ORDER BY position NULLS LAST, points DESC, (games_won - games_lost) DESC
    `, [drawId]);
    return result.rows.map(row => this.mapRowToStanding(row));
  }

  async recalculateStandings(drawId: string): Promise<void> {
    const pool = getPool();
    const draw = await this.getDraw(drawId);
    if (!draw || draw.drawType !== 'round_robin') return;

    // Get all completed matches
    const matchesResult = await pool.query<DbMatch>(`
      SELECT * FROM matches
      WHERE draw_id = $1 AND status IN ('completed', 'walkover', 'retired')
    `, [drawId]);
    const matches = matchesResult.rows;

    // Get all standings
    const standingsResult = await pool.query<DbStanding>('SELECT * FROM standings WHERE draw_id = $1', [drawId]);
    const standings = standingsResult.rows;

    // Reset standings
    const standingsMap = new Map<string, { wins: number; losses: number; gamesWon: number; gamesLost: number }>();
    for (const s of standings) {
      standingsMap.set(s.entry_id, { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0 });
    }

    // Calculate from matches
    for (const match of matches) {
      if (!match.winner_entry_id || !match.entry1_id || !match.entry2_id) continue;

      const loserId = match.winner_entry_id === match.entry1_id ? match.entry2_id : match.entry1_id;

      const winnerStats = standingsMap.get(match.winner_entry_id);
      const loserStats = standingsMap.get(loserId);

      if (winnerStats) winnerStats.wins++;
      if (loserStats) loserStats.losses++;

      // Calculate games from score
      if (match.score) {
        const score: SetScore[] = match.score;
        let entry1Games = 0;
        let entry2Games = 0;

        for (const set of score) {
          entry1Games += set[0];
          entry2Games += set[1];
        }

        if (match.entry1_id === match.winner_entry_id) {
          if (winnerStats) {
            winnerStats.gamesWon += entry1Games;
            winnerStats.gamesLost += entry2Games;
          }
          if (loserStats) {
            loserStats.gamesWon += entry2Games;
            loserStats.gamesLost += entry1Games;
          }
        } else {
          if (winnerStats) {
            winnerStats.gamesWon += entry2Games;
            winnerStats.gamesLost += entry1Games;
          }
          if (loserStats) {
            loserStats.gamesWon += entry1Games;
            loserStats.gamesLost += entry2Games;
          }
        }
      }
    }

    // Update standings in database
    for (const [entryId, stats] of standingsMap) {
      const points = stats.wins * 2;
      await pool.query(`
        UPDATE standings
        SET wins = $1, losses = $2, games_won = $3, games_lost = $4, points = $5
        WHERE draw_id = $6 AND entry_id = $7
      `, [stats.wins, stats.losses, stats.gamesWon, stats.gamesLost, points, drawId, entryId]);
    }

    // Calculate positions
    const updatedResult = await pool.query<DbStanding>(`
      SELECT * FROM standings WHERE draw_id = $1
      ORDER BY points DESC, (games_won - games_lost) DESC, games_won DESC
    `, [drawId]);

    for (let i = 0; i < updatedResult.rows.length; i++) {
      await pool.query('UPDATE standings SET position = $1 WHERE id = $2', [i + 1, updatedResult.rows[i].id]);
    }
  }

  private async checkDrawCompletion(drawId: string): Promise<void> {
    const pool = getPool();

    const result = await pool.query<{ count: string }>(`
      SELECT COUNT(*) as count FROM matches
      WHERE draw_id = $1 AND status NOT IN ('completed', 'walkover', 'retired')
    `, [drawId]);

    if (parseInt(result.rows[0].count) === 0) {
      await pool.query('UPDATE draws SET status = $1 WHERE id = $2', ['completed', drawId]);
    }
  }
}
