/**
 * Mock draw service implementation using SQLite
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database.js';
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
import type { Entry } from './player-service.js';

interface DbDraw {
  id: string;
  division_id: string;
  draw_type: string;
  status: string;
  config: string | null;
  created_at: string;
  updated_at: string;
}

interface DbMatch {
  id: string;
  draw_id: string;
  round_number: number;
  match_number: number;
  entry1_id: string | null;
  entry2_id: string | null;
  winner_entry_id: string | null;
  score: string | null;
  status: string;
  scheduled_time: string | null;
  court: string | null;
  source_match1_id: string | null;
  source_match2_id: string | null;
  created_at: string;
  updated_at: string;
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
  updated_at: string;
}

interface DbEntry {
  id: string;
  division_id: string;
  entry_type: string;
  player_id: string | null;
  team_id: string | null;
  seed: number | null;
}

export class MockDrawService implements DrawService {
  private mapRowToDraw(row: DbDraw): Draw {
    return {
      id: row.id,
      divisionId: row.division_id,
      drawType: row.draw_type as DrawType,
      status: row.status as DrawStatus,
      config: row.config ? JSON.parse(row.config) : null,
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
      score: row.score ? JSON.parse(row.score) : null,
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

    // Calculate bracket size (next power of 2)
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
    const totalRounds = Math.log2(bracketSize);

    // Sort entries by seed (nulls last)
    const seededEntries = [...entries].sort((a, b) => {
      if (a.seed === null && b.seed === null) return 0;
      if (a.seed === null) return 1;
      if (b.seed === null) return -1;
      return a.seed - b.seed;
    });

    // Generate seeding positions for bracket
    const seedPositions = this.generateSeedPositions(bracketSize);

    // Place entries in bracket positions
    const bracket: (string | null)[] = new Array(bracketSize).fill(null);
    for (let i = 0; i < n; i++) {
      bracket[seedPositions[i]] = seededEntries[i].id;
    }

    const matches: MatchSeed[] = [];

    // Round 1: Create initial matches
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

    // Subsequent rounds: Create TBD matches with source links
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

    // Circle method: fix one entry, rotate others
    const numRounds = n % 2 === 0 ? n - 1 : n;
    const half = Math.ceil(n / 2);

    // If odd number, add a null placeholder for bye
    const participants = n % 2 === 0 ? [...ids] : [...ids, null];
    const fixed = participants[0];
    const rotating = participants.slice(1);

    let matchNumber = 1;

    for (let round = 1; round <= numRounds; round++) {
      // Pair fixed with first rotating
      if (fixed !== null && rotating[0] !== null) {
        matches.push({
          roundNumber: round,
          matchNumber: matchNumber++,
          entry1Id: fixed,
          entry2Id: rotating[0],
        });
      }

      // Pair remaining (fold the rotating array)
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

      // Rotate: move last to first position
      rotating.unshift(rotating.pop()!);
    }

    return matches;
  }

  async createDraw(divisionId: string, input: CreateDrawInput): Promise<DrawResult<Draw>> {
    const db = getDatabase();

    // Verify division exists
    const division = db.prepare('SELECT id FROM divisions WHERE id = ?').get(divisionId);
    if (!division) {
      return { success: false, error: 'division_not_found', message: 'Division not found' };
    }

    // Get entries for this division
    const entries = db.prepare('SELECT * FROM entries WHERE division_id = ?').all(divisionId) as DbEntry[];

    if (entries.length < 2) {
      return { success: false, error: 'insufficient_entries', message: 'At least 2 entries required to create a draw' };
    }

    const validDrawTypes: DrawType[] = ['single_elimination', 'double_elimination', 'round_robin'];
    if (!validDrawTypes.includes(input.drawType)) {
      return { success: false, error: 'invalid_draw_type', message: 'Invalid draw type' };
    }

    const now = new Date();
    const drawId = uuidv4();

    // Calculate bracket size for elimination draws
    let config: DrawConfig | null = input.config || null;
    if (input.drawType === 'single_elimination' || input.drawType === 'double_elimination') {
      const bracketSize = Math.pow(2, Math.ceil(Math.log2(entries.length)));
      config = { ...config, bracketSize };
    }

    // Create the draw
    db.prepare(`
      INSERT INTO draws (id, division_id, draw_type, status, config, created_at, updated_at)
      VALUES (?, ?, ?, 'draft', ?, ?, ?)
    `).run(drawId, divisionId, input.drawType, config ? JSON.stringify(config) : null, now.toISOString(), now.toISOString());

    // Generate matches based on draw type
    let matchSeeds: MatchSeed[];
    if (input.drawType === 'round_robin') {
      matchSeeds = this.generateRoundRobinMatches(entries);
    } else {
      matchSeeds = this.generateSingleEliminationMatches(entries);
    }

    // Create a map of match_number -> match_id for linking source matches
    const matchIdMap: Map<number, string> = new Map();

    // First pass: create all matches
    const insertMatch = db.prepare(`
      INSERT INTO matches (id, draw_id, round_number, match_number, entry1_id, entry2_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const seed of matchSeeds) {
      const matchId = uuidv4();
      matchIdMap.set(seed.matchNumber, matchId);

      // For bye matches, auto-complete with walkover
      const status = seed.isBye ? 'walkover' : 'pending';
      const winnerId = seed.isBye ? (seed.entry1Id || seed.entry2Id) : null;

      insertMatch.run(
        matchId,
        drawId,
        seed.roundNumber,
        seed.matchNumber,
        seed.entry1Id,
        seed.entry2Id,
        status,
        now.toISOString(),
        now.toISOString()
      );

      // Set winner for bye matches
      if (winnerId) {
        db.prepare('UPDATE matches SET winner_entry_id = ? WHERE id = ?').run(winnerId, matchId);
      }
    }

    // Second pass: link source matches
    const updateSourceMatches = db.prepare(`
      UPDATE matches SET source_match1_id = ?, source_match2_id = ? WHERE id = ?
    `);

    for (const seed of matchSeeds) {
      if (seed.sourceMatch1Num || seed.sourceMatch2Num) {
        const matchId = matchIdMap.get(seed.matchNumber)!;
        const source1Id = seed.sourceMatch1Num ? matchIdMap.get(seed.sourceMatch1Num) || null : null;
        const source2Id = seed.sourceMatch2Num ? matchIdMap.get(seed.sourceMatch2Num) || null : null;
        updateSourceMatches.run(source1Id, source2Id, matchId);
      }
    }

    // For elimination draws, advance bye winners to next round
    if (input.drawType === 'single_elimination' || input.drawType === 'double_elimination') {
      for (const seed of matchSeeds) {
        if (seed.isBye) {
          const winnerId = seed.entry1Id || seed.entry2Id;
          if (winnerId) {
            const matchId = matchIdMap.get(seed.matchNumber)!;
            await this.advanceWinnerInternal(matchId, winnerId, matchIdMap, matchSeeds);
          }
        }
      }
    }

    // For round robin, initialize standings
    if (input.drawType === 'round_robin') {
      const insertStanding = db.prepare(`
        INSERT INTO standings (id, draw_id, entry_id, wins, losses, games_won, games_lost, points, position, updated_at)
        VALUES (?, ?, ?, 0, 0, 0, 0, 0, NULL, ?)
      `);

      for (const entry of entries) {
        insertStanding.run(uuidv4(), drawId, entry.id, now.toISOString());
      }
    }

    const draw = await this.getDraw(drawId);
    return { success: true, data: draw! };
  }

  private async advanceWinnerInternal(
    matchId: string,
    winnerId: string,
    matchIdMap: Map<number, string>,
    matchSeeds: MatchSeed[]
  ): Promise<void> {
    const db = getDatabase();

    // Find the match
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as DbMatch | undefined;
    if (!match) return;

    // Find the next match that this match feeds into
    const nextMatchRow = db.prepare(`
      SELECT * FROM matches
      WHERE draw_id = ? AND (source_match1_id = ? OR source_match2_id = ?)
    `).get(match.draw_id, matchId, matchId) as DbMatch | undefined;

    if (!nextMatchRow) return;

    // Determine which slot to fill
    if (nextMatchRow.source_match1_id === matchId) {
      db.prepare('UPDATE matches SET entry1_id = ?, updated_at = ? WHERE id = ?')
        .run(winnerId, new Date().toISOString(), nextMatchRow.id);
    } else if (nextMatchRow.source_match2_id === matchId) {
      db.prepare('UPDATE matches SET entry2_id = ?, updated_at = ? WHERE id = ?')
        .run(winnerId, new Date().toISOString(), nextMatchRow.id);
    }
  }

  async getDraw(drawId: string): Promise<Draw | null> {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM draws WHERE id = ?').get(drawId) as DbDraw | undefined;
    return row ? this.mapRowToDraw(row) : null;
  }

  async getDrawWithMatches(drawId: string): Promise<DrawWithMatches | null> {
    const draw = await this.getDraw(drawId);
    if (!draw) return null;

    const matches = await this.getDrawMatches(drawId);
    return { ...draw, matches };
  }

  async getDivisionDraws(divisionId: string): Promise<Draw[]> {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM draws WHERE division_id = ? ORDER BY created_at DESC').all(divisionId) as DbDraw[];
    return rows.map(row => this.mapRowToDraw(row));
  }

  async activateDraw(drawId: string): Promise<DrawResult<Draw>> {
    const db = getDatabase();
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

    db.prepare('UPDATE draws SET status = ?, updated_at = ? WHERE id = ?')
      .run('active', new Date().toISOString(), drawId);

    const updated = await this.getDraw(drawId);
    return { success: true, data: updated! };
  }

  async deleteDraw(drawId: string): Promise<DrawResult<void>> {
    const db = getDatabase();
    const draw = await this.getDraw(drawId);

    if (!draw) {
      return { success: false, error: 'draw_not_found', message: 'Draw not found' };
    }

    if (draw.status !== 'draft') {
      return { success: false, error: 'draw_is_active', message: 'Can only delete draft draws' };
    }

    // Delete standings first
    db.prepare('DELETE FROM standings WHERE draw_id = ?').run(drawId);
    // Delete matches
    db.prepare('DELETE FROM matches WHERE draw_id = ?').run(drawId);
    // Delete draw
    db.prepare('DELETE FROM draws WHERE id = ?').run(drawId);

    return { success: true, data: undefined };
  }

  async getMatch(matchId: string): Promise<Match | null> {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as DbMatch | undefined;
    return row ? this.mapRowToMatch(row) : null;
  }

  async getDrawMatches(drawId: string): Promise<Match[]> {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM matches WHERE draw_id = ? ORDER BY round_number, match_number').all(drawId) as DbMatch[];
    return rows.map(row => this.mapRowToMatch(row));
  }

  async updateMatch(matchId: string, input: UpdateMatchInput): Promise<DrawResult<Match>> {
    const db = getDatabase();
    const match = await this.getMatch(matchId);

    if (!match) {
      return { success: false, error: 'match_not_found', message: 'Match not found' };
    }

    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (input.scheduledTime !== undefined) {
      updates.push('scheduled_time = ?');
      values.push(input.scheduledTime ? input.scheduledTime.toISOString() : null);
    }

    if (input.court !== undefined) {
      updates.push('court = ?');
      values.push(input.court);
    }

    if (input.status !== undefined) {
      updates.push('status = ?');
      values.push(input.status);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(matchId);

      db.prepare(`UPDATE matches SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = await this.getMatch(matchId);
    return { success: true, data: updated! };
  }

  async recordResult(matchId: string, input: RecordResultInput): Promise<DrawResult<Match>> {
    const db = getDatabase();
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

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE matches
      SET winner_entry_id = ?, score = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.winnerId,
      input.score ? JSON.stringify(input.score) : null,
      input.status,
      now,
      matchId
    );

    // Advance winner to next round (for elimination draws)
    if (draw.drawType === 'single_elimination' || draw.drawType === 'double_elimination') {
      const nextMatch = db.prepare(`
        SELECT * FROM matches
        WHERE draw_id = ? AND (source_match1_id = ? OR source_match2_id = ?)
      `).get(draw.id, matchId, matchId) as DbMatch | undefined;

      if (nextMatch) {
        if (nextMatch.source_match1_id === matchId) {
          db.prepare('UPDATE matches SET entry1_id = ?, updated_at = ? WHERE id = ?')
            .run(input.winnerId, now, nextMatch.id);
        } else if (nextMatch.source_match2_id === matchId) {
          db.prepare('UPDATE matches SET entry2_id = ?, updated_at = ? WHERE id = ?')
            .run(input.winnerId, now, nextMatch.id);
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
    const db = getDatabase();
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
    const nextMatch = db.prepare(`
      SELECT * FROM matches
      WHERE draw_id = ? AND (source_match1_id = ? OR source_match2_id = ?)
    `).get(draw.id, matchId, matchId) as DbMatch | undefined;

    if (nextMatch && ['completed', 'walkover', 'retired'].includes(nextMatch.status)) {
      return { success: false, error: 'cannot_clear_result', message: 'Cannot clear result - winner has already played next match' };
    }

    const now = new Date().toISOString();

    // Clear the result
    db.prepare(`
      UPDATE matches
      SET winner_entry_id = NULL, score = NULL, status = 'pending', updated_at = ?
      WHERE id = ?
    `).run(now, matchId);

    // Clear winner from next match (for elimination)
    if (nextMatch) {
      if (nextMatch.source_match1_id === matchId) {
        db.prepare('UPDATE matches SET entry1_id = NULL, updated_at = ? WHERE id = ?')
          .run(now, nextMatch.id);
      } else if (nextMatch.source_match2_id === matchId) {
        db.prepare('UPDATE matches SET entry2_id = NULL, updated_at = ? WHERE id = ?')
          .run(now, nextMatch.id);
      }
    }

    // Recalculate standings (for round robin)
    if (draw.drawType === 'round_robin') {
      await this.recalculateStandings(draw.id);
    }

    const updated = await this.getMatch(matchId);
    return { success: true, data: updated! };
  }

  async getStandings(drawId: string): Promise<Standing[]> {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM standings
      WHERE draw_id = ?
      ORDER BY position NULLS LAST, points DESC, (games_won - games_lost) DESC
    `).all(drawId) as DbStanding[];
    return rows.map(row => this.mapRowToStanding(row));
  }

  async recalculateStandings(drawId: string): Promise<void> {
    const db = getDatabase();
    const draw = await this.getDraw(drawId);
    if (!draw || draw.drawType !== 'round_robin') return;

    // Get all completed matches
    const matches = db.prepare(`
      SELECT * FROM matches
      WHERE draw_id = ? AND status IN ('completed', 'walkover', 'retired')
    `).all(drawId) as DbMatch[];

    // Get all standings
    const standings = db.prepare('SELECT * FROM standings WHERE draw_id = ?').all(drawId) as DbStanding[];

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
        const score: SetScore[] = JSON.parse(match.score);
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
    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE standings
      SET wins = ?, losses = ?, games_won = ?, games_lost = ?, points = ?, updated_at = ?
      WHERE draw_id = ? AND entry_id = ?
    `);

    for (const [entryId, stats] of standingsMap) {
      const points = stats.wins * 2; // 2 points per win
      updateStmt.run(stats.wins, stats.losses, stats.gamesWon, stats.gamesLost, points, now, drawId, entryId);
    }

    // Calculate positions
    const updatedStandings = db.prepare(`
      SELECT * FROM standings WHERE draw_id = ?
      ORDER BY points DESC, (games_won - games_lost) DESC, games_won DESC
    `).all(drawId) as DbStanding[];

    const positionStmt = db.prepare('UPDATE standings SET position = ? WHERE id = ?');
    updatedStandings.forEach((s, index) => {
      positionStmt.run(index + 1, s.id);
    });
  }

  private async checkDrawCompletion(drawId: string): Promise<void> {
    const db = getDatabase();

    // Check if all matches are completed
    const pendingCount = db.prepare(`
      SELECT COUNT(*) as count FROM matches
      WHERE draw_id = ? AND status NOT IN ('completed', 'walkover', 'retired')
    `).get(drawId) as { count: number };

    if (pendingCount.count === 0) {
      db.prepare('UPDATE draws SET status = ?, updated_at = ? WHERE id = ?')
        .run('completed', new Date().toISOString(), drawId);
    }
  }
}
