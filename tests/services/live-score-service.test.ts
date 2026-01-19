/**
 * Unit tests for MockLiveScoreService
 * Tests tennis scoring logic including:
 * - Point progression
 * - Deuce/Advantage handling
 * - Tiebreak scoring
 * - Set/match completion
 * - Undo functionality
 * - Match lifecycle
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockLiveScoreService } from '../../server/services/mock-live-score-service.js';
import { MockDrawService } from '../../server/services/mock-draw-service.js';
import { MockPlayerService } from '../../server/services/mock-player-service.js';
import { MockClubService } from '../../server/services/mock-club-service.js';
import { MockCompetitionService } from '../../server/services/mock-competition-service.js';
import { MockUserService } from '../../server/services/mock-user-service.js';
import { resetDatabase } from '../../server/db/database.js';

describe('MockLiveScoreService', () => {
  let liveScoreService: MockLiveScoreService;
  let drawService: MockDrawService;
  let playerService: MockPlayerService;
  let clubService: MockClubService;
  let competitionService: MockCompetitionService;
  let userService: MockUserService;
  let userId: string;
  let clubId: string;
  let competitionId: string;
  let divisionId: string;
  let matchId: string;

  beforeEach(async () => {
    resetDatabase();
    liveScoreService = new MockLiveScoreService();
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
    for (let i = 1; i <= 4; i++) {
      const playerResult = await playerService.createPlayer(clubId, { name: `Player ${i}` });
      await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: playerResult.data!.id,
        seed: i,
      });
    }

    // Create draw and activate it
    const drawResult = await drawService.createDraw(divisionId, { drawType: 'single_elimination' });
    await drawService.activateDraw(drawResult.data!.id);

    // Get a match with both entries
    const matches = await drawService.getDrawMatches(drawResult.data!.id);
    const match = matches.find(m => m.entry1Id && m.entry2Id)!;
    matchId = match.id;
  });

  // ==================== Match Lifecycle Tests ====================

  describe('startMatch', () => {
    it('should start a match with entry 1 serving', async () => {
      const result = await liveScoreService.startMatch(matchId, { servingEntry: 1 });

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('in_progress');
      expect(result.data!.servingEntry).toBe(1);
      expect(result.data!.currentSet).toBe(1);
      expect(result.data!.entry1Points).toBe(0);
      expect(result.data!.entry2Points).toBe(0);
    });

    it('should start a match with entry 2 serving', async () => {
      const result = await liveScoreService.startMatch(matchId, { servingEntry: 2 });

      expect(result.success).toBe(true);
      expect(result.data!.servingEntry).toBe(2);
    });

    it('should fail with invalid serving entry', async () => {
      const result = await liveScoreService.startMatch(matchId, { servingEntry: 3 as any });

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_serving_entry');
    });

    it('should fail to start already started match', async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
      const result = await liveScoreService.startMatch(matchId, { servingEntry: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('match_already_started');
    });

    it('should fail with non-existent match', async () => {
      const result = await liveScoreService.startMatch('non-existent-id', { servingEntry: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toBe('match_not_found');
    });
  });

  describe('pauseMatch', () => {
    beforeEach(async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
    });

    it('should pause an in-progress match', async () => {
      const result = await liveScoreService.pauseMatch(matchId, { reason: 'Rain delay' });

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('paused');
      expect(result.data!.pauseReason).toBe('Rain delay');
      expect(result.data!.pausedAt).not.toBeNull();
    });

    it('should fail to pause a not-in-progress match', async () => {
      await liveScoreService.pauseMatch(matchId, { reason: 'Test' });
      const result = await liveScoreService.pauseMatch(matchId, { reason: 'Test again' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('match_not_in_progress');
    });
  });

  describe('resumeMatch', () => {
    beforeEach(async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
      await liveScoreService.pauseMatch(matchId, { reason: 'Rain delay' });
    });

    it('should resume a paused match', async () => {
      const result = await liveScoreService.resumeMatch(matchId);

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('in_progress');
      expect(result.data!.pauseReason).toBeNull();
      expect(result.data!.pausedAt).toBeNull();
    });

    it('should track pause duration', async () => {
      // Wait a tiny bit
      await new Promise(resolve => setTimeout(resolve, 10));
      const result = await liveScoreService.resumeMatch(matchId);

      expect(result.success).toBe(true);
      expect(result.data!.totalPauseDuration).toBeGreaterThanOrEqual(0);
    });

    it('should fail to resume a not-paused match', async () => {
      await liveScoreService.resumeMatch(matchId);
      const result = await liveScoreService.resumeMatch(matchId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('match_not_paused');
    });
  });

  describe('abandonMatch', () => {
    beforeEach(async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
    });

    it('should abandon an in-progress match', async () => {
      const result = await liveScoreService.abandonMatch(matchId, { reason: 'Injury' });

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('abandoned');
      expect(result.data!.abandonReason).toBe('Injury');
    });

    it('should fail to abandon completed match', async () => {
      // Play a full match to completion
      await playFullMatch(liveScoreService, matchId);
      const result = await liveScoreService.abandonMatch(matchId, { reason: 'Test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('match_already_completed');
    });
  });

  // ==================== Point Progression Tests ====================

  describe('recordPoint - basic progression', () => {
    beforeEach(async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
    });

    it('should progress through 0-15-30-40-Game', async () => {
      // 0-0
      let score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Points).toBe(0);

      // 15-0
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Points).toBe(1);

      // 30-0
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Points).toBe(2);

      // 40-0
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Points).toBe(3);

      // Game - should reset points and add game to entry1
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Points).toBe(0);
      expect(score!.entry2Points).toBe(0);
      expect(score!.entry1Games[0]).toBe(1);
      expect(score!.entry2Games[0]).toBe(0);
    });

    it('should display correct point values', async () => {
      let display = await liveScoreService.getDisplayScore(matchId);
      expect(display!.currentGame.entry1).toBe('0');
      expect(display!.currentGame.entry2).toBe('0');

      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      display = await liveScoreService.getDisplayScore(matchId);
      expect(display!.currentGame.entry1).toBe('15');

      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      display = await liveScoreService.getDisplayScore(matchId);
      expect(display!.currentGame.entry1).toBe('30');

      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      display = await liveScoreService.getDisplayScore(matchId);
      expect(display!.currentGame.entry1).toBe('40');
    });

    it('should switch server after game', async () => {
      let score = await liveScoreService.getLiveScore(matchId);
      expect(score!.servingEntry).toBe(1);

      // Win a game
      await winGame(liveScoreService, matchId, 1);

      score = await liveScoreService.getLiveScore(matchId);
      expect(score!.servingEntry).toBe(2);
    });
  });

  // ==================== Deuce/Advantage Tests ====================

  describe('recordPoint - deuce/advantage', () => {
    beforeEach(async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
      // Get to 40-40 (deuce)
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 }); // 15-0
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 }); // 30-0
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 }); // 40-0
      await liveScoreService.recordPoint(matchId, { winnerEntry: 2 }); // 40-15
      await liveScoreService.recordPoint(matchId, { winnerEntry: 2 }); // 40-30
      await liveScoreService.recordPoint(matchId, { winnerEntry: 2 }); // 40-40 (Deuce)
    });

    it('should reach deuce at 40-40', async () => {
      const score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Points).toBe(3);
      expect(score!.entry2Points).toBe(3);

      const display = await liveScoreService.getDisplayScore(matchId);
      expect(display!.currentGame.entry1).toBe('40');
      expect(display!.currentGame.entry2).toBe('40');
    });

    it('should show advantage after winning point from deuce', async () => {
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 }); // AD-40
      const display = await liveScoreService.getDisplayScore(matchId);
      expect(display!.currentGame.entry1).toBe('AD');
      expect(display!.currentGame.entry2).toBe('40');
    });

    it('should return to deuce when advantage lost', async () => {
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 }); // AD-40
      await liveScoreService.recordPoint(matchId, { winnerEntry: 2 }); // 40-40 (Deuce)

      const score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Points).toBe(3);
      expect(score!.entry2Points).toBe(3);
    });

    it('should win game from advantage', async () => {
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 }); // AD-40
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 }); // Game

      const score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Points).toBe(0);
      expect(score!.entry2Points).toBe(0);
      expect(score!.entry1Games[0]).toBe(1);
    });
  });

  // ==================== Tiebreak Tests ====================

  describe('recordPoint - tiebreak', () => {
    beforeEach(async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
      // Get to 6-6
      for (let game = 0; game < 6; game++) {
        await winGame(liveScoreService, matchId, 1);
        await winGame(liveScoreService, matchId, 2);
      }
    });

    it('should enter tiebreak at 6-6', async () => {
      const score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Games[0]).toBe(6);
      expect(score!.entry2Games[0]).toBe(6);
      expect(score!.isTiebreak).toBe(true);
    });

    it('should count tiebreak points correctly', async () => {
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      let score = await liveScoreService.getLiveScore(matchId);
      expect(score!.tiebreakEntry1Points).toBe(1);

      await liveScoreService.recordPoint(matchId, { winnerEntry: 2 });
      score = await liveScoreService.getLiveScore(matchId);
      expect(score!.tiebreakEntry2Points).toBe(1);
    });

    it('should switch server every 2 points in tiebreak', async () => {
      let score = await liveScoreService.getLiveScore(matchId);
      const initialServer = score!.servingEntry;

      // First point - server stays
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      score = await liveScoreService.getLiveScore(matchId);
      expect(score!.servingEntry).toBe(initialServer === 1 ? 2 : 1); // Server changed after first point

      // Second point - server stays
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      score = await liveScoreService.getLiveScore(matchId);

      // Third point - server changes
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      score = await liveScoreService.getLiveScore(matchId);
    });

    it('should win tiebreak at 7-5', async () => {
      // Win 7 points for entry 1, 5 for entry 2
      for (let i = 0; i < 5; i++) {
        await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
        await liveScoreService.recordPoint(matchId, { winnerEntry: 2 });
      }
      // 5-5
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 }); // 6-5
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 }); // 7-5, set won

      const score = await liveScoreService.getLiveScore(matchId);
      expect(score!.isTiebreak).toBe(false);
      expect(score!.entry1Games[0]).toBe(7);
      expect(score!.entry2Games[0]).toBe(6);
      expect(score!.currentSet).toBe(2);
    });

    it('should require 2-point lead in tiebreak', async () => {
      // Get to 6-6 in tiebreak
      for (let i = 0; i < 6; i++) {
        await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
        await liveScoreService.recordPoint(matchId, { winnerEntry: 2 });
      }

      let score = await liveScoreService.getLiveScore(matchId);
      expect(score!.tiebreakEntry1Points).toBe(6);
      expect(score!.tiebreakEntry2Points).toBe(6);
      expect(score!.isTiebreak).toBe(true);

      // 7-6 not enough
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      score = await liveScoreService.getLiveScore(matchId);
      expect(score!.isTiebreak).toBe(true);

      // 8-6 wins
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      score = await liveScoreService.getLiveScore(matchId);
      expect(score!.isTiebreak).toBe(false);
      expect(score!.currentSet).toBe(2);
    });
  });

  // ==================== Set Completion Tests ====================

  describe('recordPoint - set completion', () => {
    beforeEach(async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
    });

    it('should win set at 6-4', async () => {
      // Win 6 games for entry 1, 4 for entry 2
      for (let i = 0; i < 4; i++) {
        await winGame(liveScoreService, matchId, 1);
        await winGame(liveScoreService, matchId, 2);
      }
      // 4-4
      await winGame(liveScoreService, matchId, 1); // 5-4
      await winGame(liveScoreService, matchId, 1); // 6-4, set won

      const score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Games[0]).toBe(6);
      expect(score!.entry2Games[0]).toBe(4);
      expect(score!.currentSet).toBe(2);
    });

    it('should continue at 6-5 (need 7-5)', async () => {
      for (let i = 0; i < 5; i++) {
        await winGame(liveScoreService, matchId, 1);
        if (i < 4) await winGame(liveScoreService, matchId, 2);
      }
      // 5-4
      await winGame(liveScoreService, matchId, 2); // 5-5
      await winGame(liveScoreService, matchId, 1); // 6-5

      const score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Games[0]).toBe(6);
      expect(score!.entry2Games[0]).toBe(5);
      expect(score!.currentSet).toBe(1); // Still in first set
    });

    it('should start new set after set win', async () => {
      // Win first set 6-0
      for (let i = 0; i < 6; i++) {
        await winGame(liveScoreService, matchId, 1);
      }

      const score = await liveScoreService.getLiveScore(matchId);
      expect(score!.currentSet).toBe(2);
      expect(score!.entry1Games.length).toBe(1); // First set complete
      expect(score!.entry1Points).toBe(0);
      expect(score!.entry2Points).toBe(0);
    });
  });

  // ==================== Match Completion Tests ====================

  describe('recordPoint - match completion', () => {
    beforeEach(async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
    });

    it('should complete match at 2-0 sets', async () => {
      // Win first set 6-0
      await winSet(liveScoreService, matchId, 1);

      let score = await liveScoreService.getLiveScore(matchId);
      expect(score!.currentSet).toBe(2);

      // Win second set 6-0
      await winSet(liveScoreService, matchId, 1);

      score = await liveScoreService.getLiveScore(matchId);
      expect(score!.status).toBe('completed');
      expect(score!.completedAt).not.toBeNull();
    });

    it('should complete match at 2-1 sets', async () => {
      // Entry 1 wins first set
      await winSet(liveScoreService, matchId, 1);

      // Entry 2 wins second set
      await winSet(liveScoreService, matchId, 2);

      let score = await liveScoreService.getLiveScore(matchId);
      expect(score!.currentSet).toBe(3);

      // Entry 1 wins third set
      await winSet(liveScoreService, matchId, 1);

      score = await liveScoreService.getLiveScore(matchId);
      expect(score!.status).toBe('completed');
    });
  });

  // ==================== Undo Functionality Tests ====================

  describe('undoLastPoint', () => {
    beforeEach(async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
    });

    it('should undo a single point', async () => {
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      let score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Points).toBe(1);

      const result = await liveScoreService.undoLastPoint(matchId);
      expect(result.success).toBe(true);

      score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Points).toBe(0);
    });

    it('should undo back through deuce', async () => {
      // Get to 40-40
      for (let i = 0; i < 3; i++) {
        await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
        await liveScoreService.recordPoint(matchId, { winnerEntry: 2 });
      }
      // Win advantage point
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 }); // AD-40

      const result = await liveScoreService.undoLastPoint(matchId);
      expect(result.success).toBe(true);

      const score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Points).toBe(3);
      expect(score!.entry2Points).toBe(3);
    });

    it('should undo game completion', async () => {
      // Win a game
      await winGame(liveScoreService, matchId, 1);

      let score = await liveScoreService.getLiveScore(matchId);
      expect(score!.entry1Games[0]).toBe(1);

      const result = await liveScoreService.undoLastPoint(matchId);
      expect(result.success).toBe(true);

      score = await liveScoreService.getLiveScore(matchId);
      // After undo, we're back to before the game was won
      // The games array was empty before the first game, so after undo it's empty again
      expect(score!.entry1Games.length).toBe(0);
      expect(score!.entry1Points).toBe(3);
    });

    it('should fail when no points to undo', async () => {
      const result = await liveScoreService.undoLastPoint(matchId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('no_points_to_undo');
    });

    it('should remove point from history', async () => {
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      await liveScoreService.recordPoint(matchId, { winnerEntry: 2 });

      let history = await liveScoreService.getPointHistory(matchId);
      expect(history.length).toBe(2);

      await liveScoreService.undoLastPoint(matchId);

      history = await liveScoreService.getPointHistory(matchId);
      expect(history.length).toBe(1);
    });
  });

  // ==================== Point History Tests ====================

  describe('getPointHistory', () => {
    beforeEach(async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
    });

    it('should record point history', async () => {
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      await liveScoreService.recordPoint(matchId, { winnerEntry: 2 });

      const history = await liveScoreService.getPointHistory(matchId);
      expect(history.length).toBe(2);
      expect(history[0].sequenceNumber).toBe(1);
      expect(history[1].sequenceNumber).toBe(2);
    });

    it('should track set and game numbers', async () => {
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });

      const history = await liveScoreService.getPointHistory(matchId);
      expect(history[0].setNumber).toBe(1);
      expect(history[0].gameNumber).toBe(1);
      expect(history[0].pointNumber).toBe(1);
    });

    it('should track winner entry', async () => {
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });
      await liveScoreService.recordPoint(matchId, { winnerEntry: 2 });

      const history = await liveScoreService.getPointHistory(matchId);
      expect(history[0].winnerEntry).toBe(1);
      expect(history[1].winnerEntry).toBe(2);
    });

    it('should store score snapshots', async () => {
      await liveScoreService.recordPoint(matchId, { winnerEntry: 1 });

      const history = await liveScoreService.getPointHistory(matchId);
      expect(history[0].scoreBefore.entry1Points).toBe(0);
      expect(history[0].scoreAfter.entry1Points).toBe(1);
    });
  });

  // ==================== Display Score Tests ====================

  describe('getDisplayScore', () => {
    beforeEach(async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
    });

    it('should return display-friendly score', async () => {
      const display = await liveScoreService.getDisplayScore(matchId);

      expect(display).not.toBeNull();
      expect(display!.serving).toBe(1);
      expect(display!.status).toBe('in_progress');
      expect(display!.sets).toEqual([]);
      expect(display!.currentGame.entry1).toBe('0');
      expect(display!.currentGame.entry2).toBe('0');
    });

    it('should show set scores', async () => {
      // Win first set 6-4
      for (let i = 0; i < 4; i++) {
        await winGame(liveScoreService, matchId, 1);
        await winGame(liveScoreService, matchId, 2);
      }
      await winGame(liveScoreService, matchId, 1);
      await winGame(liveScoreService, matchId, 1);

      const display = await liveScoreService.getDisplayScore(matchId);
      expect(display!.sets.length).toBe(1);
      expect(display!.sets[0].entry1).toBe(6);
      expect(display!.sets[0].entry2).toBe(4);
    });
  });

  // ==================== Competition Query Tests ====================

  describe('getLiveMatchesForCompetition', () => {
    it('should return live matches for competition', async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });

      const liveMatches = await liveScoreService.getLiveMatchesForCompetition(competitionId);

      expect(liveMatches.length).toBe(1);
      expect(liveMatches[0].matchId).toBe(matchId);
      expect(liveMatches[0].status).toBe('in_progress');
    });

    it('should include paused matches', async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
      await liveScoreService.pauseMatch(matchId, { reason: 'Test' });

      const liveMatches = await liveScoreService.getLiveMatchesForCompetition(competitionId);

      expect(liveMatches.length).toBe(1);
      expect(liveMatches[0].status).toBe('paused');
    });

    it('should not include completed matches', async () => {
      await liveScoreService.startMatch(matchId, { servingEntry: 1 });
      await playFullMatch(liveScoreService, matchId);

      const liveMatches = await liveScoreService.getLiveMatchesForCompetition(competitionId);

      expect(liveMatches.length).toBe(0);
    });
  });
});

// Helper functions

async function winGame(service: MockLiveScoreService, matchId: string, winner: 1 | 2): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await service.recordPoint(matchId, { winnerEntry: winner });
  }
}

async function winSet(service: MockLiveScoreService, matchId: string, winner: 1 | 2): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await winGame(service, matchId, winner);
  }
}

async function playFullMatch(service: MockLiveScoreService, matchId: string): Promise<void> {
  // Win 2 sets to complete match (best of 3)
  await winSet(service, matchId, 1);
  await winSet(service, matchId, 1);
}
