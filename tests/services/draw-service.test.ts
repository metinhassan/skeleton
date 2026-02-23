/**
 * Unit tests for MockDrawService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockDrawService } from '../../server/services/mock-draw-service.js';
import { MockPlayerService } from '../../server/services/mock-player-service.js';
import { MockClubService } from '../../server/services/mock-club-service.js';
import { MockCompetitionService } from '../../server/services/mock-competition-service.js';
import { MockUserService } from '../../server/services/mock-user-service.js';
import { resetDatabase } from '../../server/db/database.js';

describe('MockDrawService', () => {
  let drawService: MockDrawService;
  let playerService: MockPlayerService;
  let clubService: MockClubService;
  let competitionService: MockCompetitionService;
  let userService: MockUserService;
  let userId: string;
  let clubId: string;
  let competitionId: string;
  let divisionId: string;
  let entryIds: string[] = [];

  beforeEach(async () => {
    resetDatabase();
    drawService = new MockDrawService();
    playerService = new MockPlayerService();
    clubService = new MockClubService();
    competitionService = new MockCompetitionService();
    userService = new MockUserService();

    // Create test user
    const userResult = await userService.register({
      email: 'organiser@example.com',
      password: 'password123',
      name: 'Organiser',
    });
    userId = userResult.data!.id;

    // Create test club
    const clubResult = await clubService.createClub({ name: 'Test Club' }, userId);
    clubId = clubResult.data!.id;

    // Create test competition
    const compResult = await competitionService.createCompetition(
      clubId,
      {
        name: 'Test Tournament',
        type: 'tournament',
        format: 'knockout',
      },
      userId
    );
    competitionId = compResult.data!.id;

    // Create test division
    const divResult = await competitionService.createDivision(competitionId, {
      name: 'Open Singles',
    });
    divisionId = divResult.data!.id;

    // Create 4 players and entries
    entryIds = [];
    for (let i = 1; i <= 4; i++) {
      const playerResult = await playerService.createPlayer(clubId, { name: `Player ${i}` });
      const entryResult = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: playerResult.data!.id,
        seed: i,
      });
      entryIds.push(entryResult.data!.id);
    }
  });

  // ==================== Draw Creation Tests ====================

  describe('createDraw', () => {
    it('should create a single elimination draw', async () => {
      const result = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.drawType).toBe('single_elimination');
      expect(result.data!.status).toBe('draft');
      expect(result.data!.divisionId).toBe(divisionId);
    });

    it('should create a round robin draw', async () => {
      const result = await drawService.createDraw(divisionId, { drawType: 'round_robin' });

      expect(result.success).toBe(true);
      expect(result.data!.drawType).toBe('round_robin');
    });

    it('should fail with insufficient entries', async () => {
      // Create division without entries
      const divResult = await competitionService.createDivision(competitionId, {
        name: 'Empty Division',
      });

      const result = await drawService.createDraw(divResult.data!.id, { drawType: 'single_elimination' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('insufficient_entries');
    });

    it('should fail with invalid draw type', async () => {
      const result = await drawService.createDraw(divisionId, { drawType: 'invalid' as any });

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_draw_type');
    });

    it('should fail with non-existent division', async () => {
      const result = await drawService.createDraw('non-existent-id', { drawType: 'single_elimination' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('division_not_found');
    });
  });

  // ==================== Match Generation Tests ====================

  describe('Single Elimination Match Generation', () => {
    it('should generate correct number of matches for 4 entries', async () => {
      const result = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      const matches = await drawService.getDrawMatches(result.data!.id);

      // 4 entries = 3 matches (2 semifinals + 1 final)
      expect(matches).toHaveLength(3);
    });

    it('should generate correct number of matches for 8 entries', async () => {
      // Add 4 more entries
      for (let i = 5; i <= 8; i++) {
        const playerResult = await playerService.createPlayer(clubId, { name: `Player ${i}` });
        await playerService.createEntry(divisionId, {
          entryType: 'singles',
          playerId: playerResult.data!.id,
          seed: i,
        });
      }

      const result = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      const matches = await drawService.getDrawMatches(result.data!.id);

      // 8 entries = 7 matches (4 + 2 + 1)
      expect(matches).toHaveLength(7);
    });

    it('should place seeds correctly (1v4, 2v3 pattern for 4 entries)', async () => {
      const result = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      const matches = await drawService.getDrawMatches(result.data!.id);

      // Round 1 matches
      const round1 = matches.filter(m => m.roundNumber === 1);
      expect(round1).toHaveLength(2);

      // Verify seeding: seed 1 vs seed 4, seed 2 vs seed 3
      const entries1 = round1.map(m => [m.entry1Id, m.entry2Id]).flat();
      expect(entries1).toContain(entryIds[0]); // Seed 1
      expect(entries1).toContain(entryIds[3]); // Seed 4
      expect(entries1).toContain(entryIds[1]); // Seed 2
      expect(entries1).toContain(entryIds[2]); // Seed 3
    });

    it('should handle byes for non-power-of-2 entries', async () => {
      // Create new division with 3 entries
      const divResult = await competitionService.createDivision(competitionId, {
        name: 'Three Player Division',
      });

      for (let i = 1; i <= 3; i++) {
        const playerResult = await playerService.createPlayer(clubId, { name: `Three Player ${i}` });
        await playerService.createEntry(divResult.data!.id, {
          entryType: 'singles',
          playerId: playerResult.data!.id,
          seed: i,
        });
      }

      const result = await drawService.createDraw(divResult.data!.id, { drawType: 'single_elimination' });
      const matches = await drawService.getDrawMatches(result.data!.id);

      // 3 entries needs 4-slot bracket = 3 matches, with 1 bye
      expect(matches).toHaveLength(3);

      // Find bye match (has walkover status)
      const byeMatches = matches.filter(m => m.status === 'walkover');
      expect(byeMatches.length).toBeGreaterThanOrEqual(1);

      // Bye winner should be advanced
      const round2 = matches.filter(m => m.roundNumber === 2);
      expect(round2).toHaveLength(1);
      // Seed 1 should have advanced via bye
      expect(round2[0].entry1Id).not.toBeNull();
    });
  });

  describe('Round Robin Match Generation', () => {
    it('should generate correct number of matches', async () => {
      const result = await drawService.createDraw(divisionId, { drawType: 'round_robin' });
      const matches = await drawService.getDrawMatches(result.data!.id);

      // 4 entries = 4*(4-1)/2 = 6 matches
      expect(matches).toHaveLength(6);
    });

    it('should ensure every entry plays every other entry', async () => {
      const result = await drawService.createDraw(divisionId, { drawType: 'round_robin' });
      const matches = await drawService.getDrawMatches(result.data!.id);

      // Build matchup map
      const matchups = new Map<string, Set<string>>();
      for (const entryId of entryIds) {
        matchups.set(entryId, new Set());
      }

      for (const match of matches) {
        if (match.entry1Id && match.entry2Id) {
          matchups.get(match.entry1Id)!.add(match.entry2Id);
          matchups.get(match.entry2Id)!.add(match.entry1Id);
        }
      }

      // Each entry should have played 3 others
      for (const [entryId, opponents] of matchups) {
        expect(opponents.size).toBe(3);
      }
    });

    it('should initialize standings for all entries', async () => {
      const result = await drawService.createDraw(divisionId, { drawType: 'round_robin' });
      const standings = await drawService.getStandings(result.data!.id);

      expect(standings).toHaveLength(4);
      for (const standing of standings) {
        expect(standing.wins).toBe(0);
        expect(standing.losses).toBe(0);
        expect(standing.points).toBe(0);
      }
    });
  });

  // ==================== Draw Lifecycle Tests ====================

  describe('activateDraw', () => {
    it('should activate a draft draw', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      const result = await drawService.activateDraw(createResult.data!.id);

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('active');
    });

    it('should fail to activate already active draw', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      await drawService.activateDraw(createResult.data!.id);

      const result = await drawService.activateDraw(createResult.data!.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('draw_already_active');
    });
  });

  describe('deleteDraw', () => {
    it('should delete a draft draw', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      const result = await drawService.deleteDraw(createResult.data!.id);

      expect(result.success).toBe(true);

      const draw = await drawService.getDraw(createResult.data!.id);
      expect(draw).toBeNull();
    });

    it('should fail to delete active draw', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      await drawService.activateDraw(createResult.data!.id);

      const result = await drawService.deleteDraw(createResult.data!.id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('draw_is_active');
    });
  });

  // ==================== Result Recording Tests ====================

  describe('recordResult', () => {
    let drawId: string;
    let matchId: string;

    beforeEach(async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      drawId = createResult.data!.id;
      await drawService.activateDraw(drawId);

      const matches = await drawService.getDrawMatches(drawId);
      // Find a round 1 match with both entries
      const round1Match = matches.find(m => m.roundNumber === 1 && m.entry1Id && m.entry2Id);
      matchId = round1Match!.id;
    });

    it('should record match result with score', async () => {
      const match = await drawService.getMatch(matchId);
      const result = await drawService.recordResult(matchId, {
        winnerId: match!.entry1Id!,
        score: [[6, 4], [6, 3]],
        status: 'completed',
      });

      expect(result.success).toBe(true);
      expect(result.data!.winnerEntryId).toBe(match!.entry1Id);
      expect(result.data!.status).toBe('completed');
      expect(result.data!.score).toEqual([[6, 4], [6, 3]]);
    });

    it('should record walkover without score', async () => {
      const match = await drawService.getMatch(matchId);
      const result = await drawService.recordResult(matchId, {
        winnerId: match!.entry1Id!,
        status: 'walkover',
      });

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('walkover');
      expect(result.data!.score).toBeNull();
    });

    it('should fail if draw is not active', async () => {
      // Create new draft draw
      const newDrawResult = await drawService.createDraw(divisionId, { drawType: 'round_robin' });
      const matches = await drawService.getDrawMatches(newDrawResult.data!.id);

      const result = await drawService.recordResult(matches[0].id, {
        winnerId: matches[0].entry1Id!,
        status: 'completed',
        score: [[6, 4]],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('draw_not_active');
    });

    it('should fail with invalid winner', async () => {
      const result = await drawService.recordResult(matchId, {
        winnerId: 'invalid-id',
        status: 'completed',
        score: [[6, 4]],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_winner');
    });

    it('should fail to record result on completed match', async () => {
      const match = await drawService.getMatch(matchId);
      await drawService.recordResult(matchId, {
        winnerId: match!.entry1Id!,
        status: 'completed',
        score: [[6, 4]],
      });

      const result = await drawService.recordResult(matchId, {
        winnerId: match!.entry2Id!,
        status: 'completed',
        score: [[6, 4]],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('match_already_completed');
    });

    it('should require score for completed status', async () => {
      const match = await drawService.getMatch(matchId);
      const result = await drawService.recordResult(matchId, {
        winnerId: match!.entry1Id!,
        status: 'completed',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_score');
    });
  });

  // ==================== Winner Advancement Tests ====================

  describe('Winner Advancement', () => {
    it('should advance winner to next round in single elimination', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      await drawService.activateDraw(createResult.data!.id);

      const matches = await drawService.getDrawMatches(createResult.data!.id);
      const round1Match = matches.find(m => m.roundNumber === 1 && m.entry1Id && m.entry2Id)!;
      const round2Match = matches.find(m => m.roundNumber === 2)!;

      // Record result
      await drawService.recordResult(round1Match.id, {
        winnerId: round1Match.entry1Id!,
        score: [[6, 4], [6, 3]],
        status: 'completed',
      });

      // Check winner advanced
      const updatedRound2 = await drawService.getMatch(round2Match.id);
      expect([updatedRound2!.entry1Id, updatedRound2!.entry2Id]).toContain(round1Match.entry1Id);
    });
  });

  // ==================== Clear Result Tests ====================

  describe('clearResult', () => {
    it('should clear result and reopen match', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      await drawService.activateDraw(createResult.data!.id);

      const matches = await drawService.getDrawMatches(createResult.data!.id);
      const match = matches.find(m => m.roundNumber === 1 && m.entry1Id && m.entry2Id)!;

      // Record result
      await drawService.recordResult(match.id, {
        winnerId: match.entry1Id!,
        score: [[6, 4]],
        status: 'completed',
      });

      // Clear result
      const result = await drawService.clearResult(match.id);

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('pending');
      expect(result.data!.winnerEntryId).toBeNull();
      expect(result.data!.score).toBeNull();
    });

    it('should remove winner from next match when clearing result', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      await drawService.activateDraw(createResult.data!.id);

      const matches = await drawService.getDrawMatches(createResult.data!.id);
      const round1Match = matches.find(m => m.roundNumber === 1 && m.entry1Id && m.entry2Id)!;
      const round2Match = matches.find(m => m.roundNumber === 2)!;

      // Record result
      await drawService.recordResult(round1Match.id, {
        winnerId: round1Match.entry1Id!,
        score: [[6, 4]],
        status: 'completed',
      });

      // Clear result
      await drawService.clearResult(round1Match.id);

      // Check winner removed from next match
      const updatedRound2 = await drawService.getMatch(round2Match.id);
      // One of the entries should be null now
      const hasNullEntry = updatedRound2!.entry1Id === null || updatedRound2!.entry2Id === null;
      expect(hasNullEntry).toBe(true);
    });
  });

  // ==================== Round Robin Standings Tests ====================

  describe('Round Robin Standings', () => {
    it('should update standings after result', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'round_robin' });
      await drawService.activateDraw(createResult.data!.id);

      const matches = await drawService.getDrawMatches(createResult.data!.id);
      const match = matches[0];

      // Record result
      await drawService.recordResult(match.id, {
        winnerId: match.entry1Id!,
        score: [[6, 4], [6, 3]],
        status: 'completed',
      });

      const standings = await drawService.getStandings(createResult.data!.id);

      // Find winner and loser standings
      const winnerStanding = standings.find(s => s.entryId === match.entry1Id);
      const loserStanding = standings.find(s => s.entryId === match.entry2Id);

      expect(winnerStanding!.wins).toBe(1);
      expect(winnerStanding!.losses).toBe(0);
      expect(winnerStanding!.points).toBe(2); // 2 points per win

      expect(loserStanding!.wins).toBe(0);
      expect(loserStanding!.losses).toBe(1);
      expect(loserStanding!.points).toBe(0);
    });

    it('should calculate games won/lost from score', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'round_robin' });
      await drawService.activateDraw(createResult.data!.id);

      const matches = await drawService.getDrawMatches(createResult.data!.id);
      const match = matches[0];

      // Record result: 6-4, 6-3 (winner: 12 games, loser: 7 games)
      await drawService.recordResult(match.id, {
        winnerId: match.entry1Id!,
        score: [[6, 4], [6, 3]],
        status: 'completed',
      });

      const standings = await drawService.getStandings(createResult.data!.id);
      const winnerStanding = standings.find(s => s.entryId === match.entry1Id);
      const loserStanding = standings.find(s => s.entryId === match.entry2Id);

      expect(winnerStanding!.gamesWon).toBe(12);
      expect(winnerStanding!.gamesLost).toBe(7);
      expect(loserStanding!.gamesWon).toBe(7);
      expect(loserStanding!.gamesLost).toBe(12);
    });

    it('should rank entries by position', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'round_robin' });
      await drawService.activateDraw(createResult.data!.id);

      const matches = await drawService.getDrawMatches(createResult.data!.id);

      // Record some results
      await drawService.recordResult(matches[0].id, {
        winnerId: matches[0].entry1Id!,
        score: [[6, 0]],
        status: 'completed',
      });

      const standings = await drawService.getStandings(createResult.data!.id);

      // Winner should be position 1
      const winnerStanding = standings.find(s => s.entryId === matches[0].entry1Id);
      expect(winnerStanding!.position).toBe(1);
    });
  });

  // ==================== Draw Completion Tests ====================

  describe('Draw Completion', () => {
    it('should mark draw as completed when all matches are done', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      await drawService.activateDraw(createResult.data!.id);

      const matches = await drawService.getDrawMatches(createResult.data!.id);

      // Complete all matches
      for (const match of matches.sort((a, b) => a.roundNumber - b.roundNumber)) {
        if (match.status === 'pending') {
          const currentMatch = await drawService.getMatch(match.id);
          if (currentMatch!.entry1Id && currentMatch!.entry2Id) {
            await drawService.recordResult(match.id, {
              winnerId: currentMatch!.entry1Id!,
              score: [[6, 4]],
              status: 'completed',
            });
          }
        }
      }

      const draw = await drawService.getDraw(createResult.data!.id);
      expect(draw!.status).toBe('completed');
    });
  });

  // ==================== Read Operations Tests ====================

  describe('getDraw', () => {
    it('should return draw by ID', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      const draw = await drawService.getDraw(createResult.data!.id);

      expect(draw).not.toBeNull();
      expect(draw!.id).toBe(createResult.data!.id);
    });

    it('should return null for non-existent draw', async () => {
      const draw = await drawService.getDraw('non-existent-id');
      expect(draw).toBeNull();
    });
  });

  describe('getDrawWithMatches', () => {
    it('should return draw with matches', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      const draw = await drawService.getDrawWithMatches(createResult.data!.id);

      expect(draw).not.toBeNull();
      expect(draw!.matches).toBeDefined();
      expect(draw!.matches.length).toBeGreaterThan(0);
    });
  });

  describe('getDivisionDraws', () => {
    it('should return all draws for a division', async () => {
      await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      await drawService.createDraw(divisionId, { drawType: 'round_robin' });

      const draws = await drawService.getDivisionDraws(divisionId);
      expect(draws).toHaveLength(2);
    });
  });

  describe('getMatch', () => {
    it('should return match by ID', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      const matches = await drawService.getDrawMatches(createResult.data!.id);

      const match = await drawService.getMatch(matches[0].id);
      expect(match).not.toBeNull();
      expect(match!.id).toBe(matches[0].id);
    });
  });

  describe('updateMatch', () => {
    it('should update match scheduling', async () => {
      const createResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
      const matches = await drawService.getDrawMatches(createResult.data!.id);
      const matchId = matches[0].id;

      const scheduledTime = new Date('2024-06-15T10:00:00Z');
      const result = await drawService.updateMatch(matchId, {
        scheduledTime,
        court: 'Court 1',
        status: 'scheduled',
      });

      expect(result.success).toBe(true);
      expect(result.data!.scheduledTime).toEqual(scheduledTime);
      expect(result.data!.court).toBe('Court 1');
      expect(result.data!.status).toBe('scheduled');
    });
  });

  // ==================== Double Elimination Tests ====================

  describe('Double Elimination', () => {
    describe('Match Generation - 4 entries', () => {
      it('should generate 6 matches for 4 entries', async () => {
        const result = await drawService.createDraw(divisionId, { drawType: 'double_elimination' });
        expect(result.success).toBe(true);

        const matches = await drawService.getDrawMatches(result.data!.id);
        expect(matches).toHaveLength(6);
      });

      it('should have correct bracket distribution for 4 entries', async () => {
        const result = await drawService.createDraw(divisionId, { drawType: 'double_elimination' });
        const matches = await drawService.getDrawMatches(result.data!.id);

        const wbMatches = matches.filter(m => m.bracket === 'winners');
        const lbMatches = matches.filter(m => m.bracket === 'losers');
        const gfMatches = matches.filter(m => m.bracket === 'grand_final');

        expect(wbMatches).toHaveLength(3); // 2 R1 + 1 R2
        expect(lbMatches).toHaveLength(2); // 1 LB R1 + 1 LB R2
        expect(gfMatches).toHaveLength(1);
      });
    });

    describe('Match Generation - 8 entries', () => {
      let divisionId8: string;
      let entryIds8: string[];

      beforeEach(async () => {
        const divResult = await competitionService.createDivision(competitionId, {
          name: 'Eight Player Division',
        });
        divisionId8 = divResult.data!.id;
        entryIds8 = [];

        for (let i = 1; i <= 8; i++) {
          const playerResult = await playerService.createPlayer(clubId, { name: `DE Player ${i}` });
          const entryResult = await playerService.createEntry(divisionId8, {
            entryType: 'singles',
            playerId: playerResult.data!.id,
            seed: i,
          });
          entryIds8.push(entryResult.data!.id);
        }
      });

      it('should generate 14 matches for 8 entries', async () => {
        const result = await drawService.createDraw(divisionId8, { drawType: 'double_elimination' });
        expect(result.success).toBe(true);

        const matches = await drawService.getDrawMatches(result.data!.id);
        expect(matches).toHaveLength(14);
      });

      it('should have correct bracket distribution for 8 entries', async () => {
        const result = await drawService.createDraw(divisionId8, { drawType: 'double_elimination' });
        const matches = await drawService.getDrawMatches(result.data!.id);

        const wbMatches = matches.filter(m => m.bracket === 'winners');
        const lbMatches = matches.filter(m => m.bracket === 'losers');
        const gfMatches = matches.filter(m => m.bracket === 'grand_final');

        expect(wbMatches).toHaveLength(7); // 4 R1 + 2 R2 + 1 R3
        expect(lbMatches).toHaveLength(6); // 2 LB R1 + 2 LB R2 + 1 LB R3 + 1 LB R4
        expect(gfMatches).toHaveLength(1);
      });
    });

    describe('Winner advancement and loser routing', () => {
      it('should advance winner in WB and route loser to LB', async () => {
        const result = await drawService.createDraw(divisionId, { drawType: 'double_elimination' });
        await drawService.activateDraw(result.data!.id);

        const matches = await drawService.getDrawMatches(result.data!.id);
        const wbR1 = matches.filter(m => m.bracket === 'winners' && m.roundNumber === 1 && m.entry1Id && m.entry2Id);
        expect(wbR1.length).toBeGreaterThan(0);

        const match = wbR1[0];
        await drawService.recordResult(match.id, {
          winnerId: match.entry1Id!,
          score: [[6, 3]],
          status: 'completed',
        });

        // Winner should be in WB R2
        const updatedMatches = await drawService.getDrawMatches(result.data!.id);
        const wbR2 = updatedMatches.filter(m => m.bracket === 'winners' && m.roundNumber === 2);
        expect(wbR2.length).toBeGreaterThan(0);
        const wbR2Entries = wbR2.flatMap(m => [m.entry1Id, m.entry2Id]).filter(Boolean);
        expect(wbR2Entries).toContain(match.entry1Id);

        // Loser should be in LB
        const lbMatches = updatedMatches.filter(m => m.bracket === 'losers');
        const lbEntries = lbMatches.flatMap(m => [m.entry1Id, m.entry2Id]).filter(Boolean);
        expect(lbEntries).toContain(match.entry2Id);
      });
    });

    describe('Full tournament flow - 4 entries', () => {
      it('should complete a full double elimination tournament', async () => {
        const result = await drawService.createDraw(divisionId, { drawType: 'double_elimination' });
        await drawService.activateDraw(result.data!.id);

        // Play all matches in order
        let allDone = false;
        let iterations = 0;
        while (!allDone && iterations < 20) {
          iterations++;
          const matches = await drawService.getDrawMatches(result.data!.id);
          const playable = matches.find(
            m => m.status === 'pending' && m.entry1Id && m.entry2Id
          );

          if (!playable) {
            allDone = true;
            break;
          }

          await drawService.recordResult(playable.id, {
            winnerId: playable.entry1Id!,
            score: [[6, 2]],
            status: 'completed',
          });
        }

        const draw = await drawService.getDraw(result.data!.id);
        expect(draw!.status).toBe('completed');

        // All matches should be completed
        const finalMatches = await drawService.getDrawMatches(result.data!.id);
        const pendingMatches = finalMatches.filter(m => m.status === 'pending');
        expect(pendingMatches).toHaveLength(0);
      });
    });

    describe('Bye handling', () => {
      it('should handle byes with 3 entries', async () => {
        const divResult = await competitionService.createDivision(competitionId, {
          name: 'Three Player DE Division',
        });

        for (let i = 1; i <= 3; i++) {
          const playerResult = await playerService.createPlayer(clubId, { name: `DE3 Player ${i}` });
          await playerService.createEntry(divResult.data!.id, {
            entryType: 'singles',
            playerId: playerResult.data!.id,
            seed: i,
          });
        }

        const result = await drawService.createDraw(divResult.data!.id, { drawType: 'double_elimination' });
        expect(result.success).toBe(true);

        const matches = await drawService.getDrawMatches(result.data!.id);

        // Should have WB matches with at least 1 bye (walkover)
        const walkovers = matches.filter(m => m.status === 'walkover');
        expect(walkovers.length).toBeGreaterThanOrEqual(1);

        // Total matches = 2*4 - 2 = 6
        expect(matches).toHaveLength(6);
      });
    });

    describe('Clear result', () => {
      it('should remove loser from LB match when clearing WB result', async () => {
        const result = await drawService.createDraw(divisionId, { drawType: 'double_elimination' });
        await drawService.activateDraw(result.data!.id);

        const matches = await drawService.getDrawMatches(result.data!.id);
        const wbR1 = matches.filter(m => m.bracket === 'winners' && m.roundNumber === 1 && m.entry1Id && m.entry2Id);
        const match = wbR1[0];

        // Record result - loser goes to LB
        await drawService.recordResult(match.id, {
          winnerId: match.entry1Id!,
          score: [[6, 3]],
          status: 'completed',
        });

        // Verify loser is in LB
        let updatedMatches = await drawService.getDrawMatches(result.data!.id);
        let lbEntries = updatedMatches.filter(m => m.bracket === 'losers').flatMap(m => [m.entry1Id, m.entry2Id]).filter(Boolean);
        expect(lbEntries).toContain(match.entry2Id);

        // Clear the result
        const clearResult = await drawService.clearResult(match.id);
        expect(clearResult.success).toBe(true);

        // Loser should be removed from LB
        updatedMatches = await drawService.getDrawMatches(result.data!.id);
        lbEntries = updatedMatches.filter(m => m.bracket === 'losers').flatMap(m => [m.entry1Id, m.entry2Id]).filter(Boolean);
        expect(lbEntries).not.toContain(match.entry2Id);
      });

      it('should block clearing when loser has already played in LB', async () => {
        const result = await drawService.createDraw(divisionId, { drawType: 'double_elimination' });
        await drawService.activateDraw(result.data!.id);

        const matches = await drawService.getDrawMatches(result.data!.id);
        const wbR1 = matches.filter(m => m.bracket === 'winners' && m.roundNumber === 1 && m.entry1Id && m.entry2Id);

        // Record both WB R1 matches so LB R1 gets both entries
        for (const match of wbR1) {
          await drawService.recordResult(match.id, {
            winnerId: match.entry1Id!,
            score: [[6, 3]],
            status: 'completed',
          });
        }

        // Play the LB R1 match
        let updatedMatches = await drawService.getDrawMatches(result.data!.id);
        const lbR1 = updatedMatches.find(
          m => m.bracket === 'losers' && m.roundNumber === 1 && m.entry1Id && m.entry2Id && m.status === 'pending'
        );

        if (lbR1) {
          await drawService.recordResult(lbR1.id, {
            winnerId: lbR1.entry1Id!,
            score: [[6, 2]],
            status: 'completed',
          });

          // Try to clear a WB R1 match whose loser has already played
          const wbMatch = wbR1[0];
          const clearResult = await drawService.clearResult(wbMatch.id);
          expect(clearResult.success).toBe(false);
          expect(clearResult.error).toBe('cannot_clear_result');
        }
      });
    });
  });
});
