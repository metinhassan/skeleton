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
  BracketType,
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
  bracket: string;
  entry1_id: string | null;
  entry2_id: string | null;
  winner_entry_id: string | null;
  score: SetScore[] | null;
  status: string;
  scheduled_time: Date | null;
  court: string | null;
  source_match1_id: string | null;
  source_match2_id: string | null;
  loser_next_match_id: string | null;
  loser_slot: number | null;
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
      bracket: (row.bracket || 'winners') as BracketType,
      entry1Id: row.entry1_id,
      entry2Id: row.entry2_id,
      winnerEntryId: row.winner_entry_id,
      score: row.score,
      status: row.status as MatchStatus,
      scheduledTime: row.scheduled_time ? new Date(row.scheduled_time) : null,
      court: row.court,
      sourceMatch1Id: row.source_match1_id,
      sourceMatch2Id: row.source_match2_id,
      loserNextMatchId: row.loser_next_match_id,
      loserSlot: row.loser_slot as (1 | 2 | null),
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

  private generateDoubleEliminationMatches(entries: DbEntry[]): MatchSeed[] {
    const n = entries.length;
    if (n < 2) return [];

    const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
    const totalWBRounds = Math.log2(bracketSize);

    // Generate winners bracket (reuse single elimination logic but tag as 'winners')
    const wbMatches = this.generateSingleEliminationMatches(entries);
    for (const m of wbMatches) {
      m.bracket = 'winners';
    }

    const allMatches: MatchSeed[] = [...wbMatches];
    let nextMatchNum = wbMatches.length + 1;

    // Build index of WB matches by round for linking losers
    const wbByRound: Map<number, MatchSeed[]> = new Map();
    for (const m of wbMatches) {
      if (!wbByRound.has(m.roundNumber)) wbByRound.set(m.roundNumber, []);
      wbByRound.get(m.roundNumber)!.push(m);
    }

    // Generate losers bracket
    // LB comes in pairs of rounds:
    //   LB odd round (1,3,5...): losers from a WB round drop in (or LB winners pair up)
    //   LB even round (2,4,6...): LB survivors face new WB losers (crossed)
    // For bracketSize=4: LB has 2 rounds, for bracketSize=8: LB has 4 rounds, etc.
    // Total LB rounds = 2*(totalWBRounds - 1)
    const totalLBRounds = 2 * (totalWBRounds - 1);

    // Track LB matches by LB round for chaining
    const lbByRound: Map<number, MatchSeed[]> = new Map();
    let lbRoundNum = 1;

    // LB Round 1: WB R1 losers paired together
    const wbR1 = wbByRound.get(1) || [];
    const lbR1Matches: MatchSeed[] = [];
    for (let i = 0; i < wbR1.length; i += 2) {
      if (i + 1 < wbR1.length) {
        const m: MatchSeed = {
          roundNumber: lbRoundNum,
          matchNumber: nextMatchNum++,
          entry1Id: null,
          entry2Id: null,
          bracket: 'losers',
        };
        lbR1Matches.push(m);
        allMatches.push(m);
      }
    }
    // If only one WB R1 match, single loser drops into a single LB R1 match
    if (wbR1.length === 1) {
      const m: MatchSeed = {
        roundNumber: lbRoundNum,
        matchNumber: nextMatchNum++,
        entry1Id: null,
        entry2Id: null,
        bracket: 'losers',
      };
      lbR1Matches.push(m);
      allMatches.push(m);
    }
    lbByRound.set(lbRoundNum, lbR1Matches);

    // Link WB R1 losers to LB R1
    for (let i = 0; i < wbR1.length; i++) {
      const lbMatchIdx = Math.floor(i / 2);
      if (lbMatchIdx < lbR1Matches.length) {
        wbR1[i].loserNextMatchNum = lbR1Matches[lbMatchIdx].matchNumber;
        wbR1[i].loserSlot = (i % 2 === 0 ? 1 : 2) as 1 | 2;
      }
    }

    let prevLBMatches = lbR1Matches;

    // Subsequent LB round pairs
    for (let wbRound = 2; wbRound <= totalWBRounds; wbRound++) {
      const wbLosers = wbByRound.get(wbRound) || [];

      // LB even round: LB survivors vs WB losers (CROSSED to avoid rematches)
      lbRoundNum++;
      const lbEvenMatches: MatchSeed[] = [];
      const crossedWBLosers = [...wbLosers].reverse(); // Cross: reverse order

      for (let i = 0; i < prevLBMatches.length; i++) {
        const m: MatchSeed = {
          roundNumber: lbRoundNum,
          matchNumber: nextMatchNum++,
          entry1Id: null,
          entry2Id: null,
          sourceMatch1Num: prevLBMatches[i].matchNumber, // LB survivor
          bracket: 'losers',
        };
        lbEvenMatches.push(m);
        allMatches.push(m);
      }
      lbByRound.set(lbRoundNum, lbEvenMatches);

      // Link WB losers from this round into LB even round (crossed)
      for (let i = 0; i < crossedWBLosers.length && i < lbEvenMatches.length; i++) {
        crossedWBLosers[i].loserNextMatchNum = lbEvenMatches[i].matchNumber;
        crossedWBLosers[i].loserSlot = 2; // WB loser goes to slot 2
      }

      // If this is the last WB round, no more odd rounds needed after this even
      if (wbRound === totalWBRounds) {
        prevLBMatches = lbEvenMatches;
        break;
      }

      // LB odd round: LB even round winners pair up
      lbRoundNum++;
      const lbOddMatches: MatchSeed[] = [];
      for (let i = 0; i < lbEvenMatches.length; i += 2) {
        if (i + 1 < lbEvenMatches.length) {
          const m: MatchSeed = {
            roundNumber: lbRoundNum,
            matchNumber: nextMatchNum++,
            entry1Id: null,
            entry2Id: null,
            sourceMatch1Num: lbEvenMatches[i].matchNumber,
            sourceMatch2Num: lbEvenMatches[i + 1].matchNumber,
            bracket: 'losers',
          };
          lbOddMatches.push(m);
          allMatches.push(m);
        } else {
          // Odd number of matches - single match passes through
          const m: MatchSeed = {
            roundNumber: lbRoundNum,
            matchNumber: nextMatchNum++,
            entry1Id: null,
            entry2Id: null,
            sourceMatch1Num: lbEvenMatches[i].matchNumber,
            bracket: 'losers',
          };
          lbOddMatches.push(m);
          allMatches.push(m);
        }
      }
      lbByRound.set(lbRoundNum, lbOddMatches);
      prevLBMatches = lbOddMatches;
    }

    // Grand Final: WB champion vs LB champion
    const wbFinal = wbByRound.get(totalWBRounds)![0];
    const lbFinal = prevLBMatches[prevLBMatches.length - 1];

    const gfMatch: MatchSeed = {
      roundNumber: 1,
      matchNumber: nextMatchNum++,
      entry1Id: null,
      entry2Id: null,
      sourceMatch1Num: wbFinal.matchNumber, // WB champion
      sourceMatch2Num: lbFinal.matchNumber, // LB champion
      bracket: 'grand_final',
    };
    allMatches.push(gfMatch);

    return allMatches;
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
    } else if (input.drawType === 'double_elimination') {
      matchSeeds = this.generateDoubleEliminationMatches(entries);
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
      const bracket = seed.bracket || 'winners';

      await pool.query(`
        INSERT INTO matches (id, draw_id, round_number, match_number, bracket, entry1_id, entry2_id, winner_entry_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [matchId, drawId, seed.roundNumber, seed.matchNumber, bracket, seed.entry1Id, seed.entry2Id, winnerId, status]);
    }

    // Second pass: link source matches and loser routing
    for (const seed of matchSeeds) {
      const matchId = matchIdMap.get(seed.matchNumber)!;
      const updates: string[] = [];
      const values: (string | number | null)[] = [];
      let paramIdx = 1;

      if (seed.sourceMatch1Num || seed.sourceMatch2Num) {
        const source1Id = seed.sourceMatch1Num ? matchIdMap.get(seed.sourceMatch1Num) || null : null;
        const source2Id = seed.sourceMatch2Num ? matchIdMap.get(seed.sourceMatch2Num) || null : null;
        updates.push(`source_match1_id = $${paramIdx++}`);
        values.push(source1Id);
        updates.push(`source_match2_id = $${paramIdx++}`);
        values.push(source2Id);
      }

      if (seed.loserNextMatchNum) {
        const loserNextId = matchIdMap.get(seed.loserNextMatchNum) || null;
        updates.push(`loser_next_match_id = $${paramIdx++}`);
        values.push(loserNextId);
        updates.push(`loser_slot = $${paramIdx++}`);
        values.push(seed.loserSlot || null);
      }

      if (updates.length > 0) {
        values.push(matchId);
        await pool.query(
          `UPDATE matches SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
          values
        );
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

      // For double elimination, handle LB byes caused by WB byes
      if (input.drawType === 'double_elimination') {
        await this.cascadeLBByes(drawId);
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

  private async cascadeLBByes(drawId: string): Promise<void> {
    const pool = getPool();

    // Iteratively check LB matches - if an LB match has a WB bye as source
    // (loser from a walkover match), the loser slot stays null.
    // If one entry arrives and the other never will, it's a walkover.
    let changed = true;
    while (changed) {
      changed = false;

      // Get all LB/GF pending matches
      const lbMatches = await pool.query<DbMatch>(`
        SELECT * FROM matches
        WHERE draw_id = $1 AND bracket IN ('losers', 'grand_final') AND status = 'pending'
        ORDER BY round_number, match_number
      `, [drawId]);

      for (const lbMatch of lbMatches.rows) {
        // Check if this match expects a loser from a WB bye
        // A WB bye has status 'walkover' and has a loser_next_match_id pointing here
        const wbByeFeeder = await pool.query<DbMatch>(`
          SELECT * FROM matches
          WHERE draw_id = $1 AND loser_next_match_id = $2 AND status = 'walkover'
        `, [drawId, lbMatch.id]);

        if (wbByeFeeder.rows.length > 0) {
          // This match has a WB bye feeding into it - the loser slot will never be filled
          // Check if the other slot has an entry (from source_match advancement)
          const hasEntry1 = lbMatch.entry1_id !== null;
          const hasEntry2 = lbMatch.entry2_id !== null;

          if (hasEntry1 && !hasEntry2) {
            // Only entry1 present, walkover
            await pool.query(`
              UPDATE matches SET winner_entry_id = $1, status = 'walkover' WHERE id = $2
            `, [lbMatch.entry1_id, lbMatch.id]);
            await this.advanceWinnerInternal(lbMatch.id, lbMatch.entry1_id!);
            changed = true;
          } else if (!hasEntry1 && hasEntry2) {
            // Only entry2 present, walkover
            await pool.query(`
              UPDATE matches SET winner_entry_id = $1, status = 'walkover' WHERE id = $2
            `, [lbMatch.entry2_id, lbMatch.id]);
            await this.advanceWinnerInternal(lbMatch.id, lbMatch.entry2_id!);
            changed = true;
          }
          // If neither entry is present yet, wait for advancement
        }
      }
    }
  }

  private async routeLoser(matchId: string, loserId: string): Promise<void> {
    const pool = getPool();

    const matchResult = await pool.query<DbMatch>('SELECT * FROM matches WHERE id = $1', [matchId]);
    if (matchResult.rows.length === 0) return;
    const match = matchResult.rows[0];

    if (!match.loser_next_match_id) return;

    const slot = match.loser_slot;
    if (slot === 1) {
      await pool.query('UPDATE matches SET entry1_id = $1 WHERE id = $2', [loserId, match.loser_next_match_id]);
    } else if (slot === 2) {
      await pool.query('UPDATE matches SET entry2_id = $1 WHERE id = $2', [loserId, match.loser_next_match_id]);
    }

    // Check if the destination LB match is now a walkover (only one entry will ever arrive)
    const destMatch = await pool.query<DbMatch>('SELECT * FROM matches WHERE id = $1', [match.loser_next_match_id]);
    if (destMatch.rows.length > 0) {
      const dest = destMatch.rows[0];
      if (dest.status === 'pending') {
        // Check if the other slot's source is a bye that will never produce a loser
        const otherSlotWillNeverFill = await this.willSlotNeverFill(dest, slot === 1 ? 2 : 1);
        if (otherSlotWillNeverFill) {
          await pool.query(`
            UPDATE matches SET winner_entry_id = $1, status = 'walkover' WHERE id = $2
          `, [loserId, dest.id]);
          await this.advanceWinnerInternal(dest.id, loserId);
        }
      }
    }
  }

  private async willSlotNeverFill(lbMatch: DbMatch, slot: number): Promise<boolean> {
    const pool = getPool();

    // Check if there's a WB bye feeding into the slot that will never produce a loser
    const feederResult = await pool.query<DbMatch>(`
      SELECT * FROM matches
      WHERE loser_next_match_id = $1 AND loser_slot = $2 AND status = 'walkover'
    `, [lbMatch.id, slot]);

    return feederResult.rows.length > 0;
  }

  async getDraw(drawId: string): Promise<Draw | null> {
    const pool = getPool();
    const result = await pool.query<DbDraw>('SELECT * FROM draws WHERE id = $1', [drawId]);
    return result.rows.length > 0 ? this.mapRowToDraw(result.rows[0]) : null;
  }

  async getDrawWithMatches(drawId: string): Promise<DrawWithMatches | null> {
    const draw = await this.getDraw(drawId);
    if (!draw) return null;

    const matches = await this.getDrawMatchesWithNames(drawId);
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

  async getDrawMatchesWithNames(drawId: string): Promise<(Match & { entry1Name?: string; entry2Name?: string; winnerName?: string })[]> {
    const pool = getPool();

    // Get matches with entry names via joins
    const result = await pool.query<DbMatch & { entry1_name?: string; entry2_name?: string; winner_name?: string }>(`
      SELECT m.*,
             COALESCE(p1.name, t1.name) as entry1_name,
             COALESCE(p2.name, t2.name) as entry2_name,
             COALESCE(pw.name, tw.name) as winner_name
      FROM matches m
      LEFT JOIN entries e1 ON e1.id = m.entry1_id
      LEFT JOIN players p1 ON p1.id = e1.player_id
      LEFT JOIN teams t1 ON t1.id = e1.team_id
      LEFT JOIN entries e2 ON e2.id = m.entry2_id
      LEFT JOIN players p2 ON p2.id = e2.player_id
      LEFT JOIN teams t2 ON t2.id = e2.team_id
      LEFT JOIN entries ew ON ew.id = m.winner_entry_id
      LEFT JOIN players pw ON pw.id = ew.player_id
      LEFT JOIN teams tw ON tw.id = ew.team_id
      WHERE m.draw_id = $1
      ORDER BY m.round_number, m.match_number
    `, [drawId]);

    return result.rows.map(row => ({
      ...this.mapRowToMatch(row),
      entry1Name: row.entry1_name || undefined,
      entry2Name: row.entry2_name || undefined,
      winnerName: row.winner_name || undefined,
    }));
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

  async swapEntries(drawId: string, bracket: BracketType, entry1Id: string, entry2Id: string): Promise<DrawResult<void>> {
    const pool = getPool();
    const draw = await this.getDraw(drawId);

    if (!draw) {
      return { success: false, error: 'draw_not_found', message: 'Draw not found' };
    }

    if (entry1Id === entry2Id) {
      return { success: false, error: 'invalid_swap', message: 'Please select two different entries' };
    }

    if (draw.status === 'completed') {
      return { success: false, error: 'draw_is_completed', message: 'Cannot edit a completed draw' };
    }

    if (draw.drawType !== 'single_elimination' && draw.drawType !== 'double_elimination') {
      return { success: false, error: 'invalid_swap', message: 'Entry swapping is only available for elimination draws' };
    }

    const lockedResult = await pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM matches
      WHERE draw_id = $1 AND status IN ('in_progress', 'completed', 'walkover', 'retired')
    `, [drawId]);

    if (parseInt(lockedResult.rows[0]?.count || '0', 10) > 0) {
      return {
        success: false,
        error: 'invalid_swap',
        message: 'Cannot edit draw after matches have started',
      };
    }

    const roundOneMatches = await pool.query<DbMatch>(`
      SELECT *
      FROM matches
      WHERE draw_id = $1 AND bracket = $2 AND round_number = 1
      ORDER BY match_number
    `, [drawId, bracket]);

    if (roundOneMatches.rows.length === 0) {
      return { success: false, error: 'invalid_swap', message: 'No editable matches found in this bracket' };
    }

    const findSlot = (entryId: string): { matchId: string; slot: 1 | 2 } | null => {
      for (const match of roundOneMatches.rows) {
        if (match.entry1_id === entryId) return { matchId: match.id, slot: 1 };
        if (match.entry2_id === entryId) return { matchId: match.id, slot: 2 };
      }
      return null;
    };

    const slot1 = findSlot(entry1Id);
    const slot2 = findSlot(entry2Id);

    if (!slot1 || !slot2) {
      return { success: false, error: 'entry_not_found', message: 'Both entries must be in round 1 of the selected bracket' };
    }

    try {
      await pool.query('BEGIN');
      if (slot1.matchId === slot2.matchId) {
        await pool.query(
          `UPDATE matches
           SET entry1_id = $1, entry2_id = $2, updated_at = NOW()
           WHERE id = $3`,
          [entry2Id, entry1Id, slot1.matchId]
        );
      } else {
        const slot1Column = slot1.slot === 1 ? 'entry1_id' : 'entry2_id';
        const slot2Column = slot2.slot === 1 ? 'entry1_id' : 'entry2_id';

        await pool.query(
          `UPDATE matches SET ${slot1Column} = $1, updated_at = NOW() WHERE id = $2`,
          [entry2Id, slot1.matchId]
        );
        await pool.query(
          `UPDATE matches SET ${slot2Column} = $1, updated_at = NOW() WHERE id = $2`,
          [entry1Id, slot2.matchId]
        );
      }
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

    return { success: true, data: undefined };
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

      // Route loser to losers bracket (for double elimination)
      if (draw.drawType === 'double_elimination') {
        const loserId = input.winnerId === match.entry1Id ? match.entry2Id : match.entry1Id;
        if (loserId) {
          await this.routeLoser(matchId, loserId);
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

    // Check if next match (winner path) has been played
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

    // For double elimination, check and clear loser routing
    if (draw.drawType === 'double_elimination' && match.loserNextMatchId) {
      const loserDestResult = await pool.query<DbMatch>(
        'SELECT * FROM matches WHERE id = $1', [match.loserNextMatchId]
      );
      if (loserDestResult.rows.length > 0) {
        const loserDest = loserDestResult.rows[0];
        if (['completed', 'walkover', 'retired'].includes(loserDest.status)) {
          return { success: false, error: 'cannot_clear_result', message: 'Cannot clear result - loser has already played in losers bracket' };
        }

        // Clear loser from destination match
        if (match.loserSlot === 1) {
          await pool.query('UPDATE matches SET entry1_id = NULL WHERE id = $1', [match.loserNextMatchId]);
        } else if (match.loserSlot === 2) {
          await pool.query('UPDATE matches SET entry2_id = NULL WHERE id = $1', [match.loserNextMatchId]);
        }
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
    const result = await pool.query<DbStanding & { entry_name?: string }>(`
      SELECT s.*,
             COALESCE(p.name, t.name) as entry_name
      FROM standings s
      LEFT JOIN entries e ON e.id = s.entry_id
      LEFT JOIN players p ON p.id = e.player_id
      LEFT JOIN teams t ON t.id = e.team_id
      WHERE s.draw_id = $1
      ORDER BY s.position NULLS LAST, s.points DESC, (s.games_won - s.games_lost) DESC
    `, [drawId]);
    return result.rows.map(row => ({
      ...this.mapRowToStanding(row),
      entryName: row.entry_name || 'Unknown',
    }));
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
