/**
 * Unit tests for MockCompetitionService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockCompetitionService } from '../../server/services/mock-competition-service.js';
import { MockClubService } from '../../server/services/mock-club-service.js';
import { MockUserService } from '../../server/services/mock-user-service.js';
import { resetDatabase } from '../../server/db/database.js';
import type {
  CompetitionFormat,
  CompetitionType,
  CreateCompetitionInput,
} from '../../server/services/competition-service.js';

describe('MockCompetitionService', () => {
  let competitionService: MockCompetitionService;
  let clubService: MockClubService;
  let userService: MockUserService;
  let user1Id: string;
  let user2Id: string;
  let clubId: string;

  beforeEach(async () => {
    resetDatabase();
    competitionService = new MockCompetitionService();
    clubService = new MockClubService();
    userService = new MockUserService();

    // Create test users
    const result1 = await userService.register({
      email: 'organiser@example.com',
      password: 'password123',
      name: 'Organiser User',
    });
    user1Id = result1.data!.id;

    const result2 = await userService.register({
      email: 'player@example.com',
      password: 'password123',
      name: 'Player User',
    });
    user2Id = result2.data!.id;

    // Create a test club
    const clubResult = await clubService.createClub({ name: 'Test Tennis Club' }, user1Id);
    clubId = clubResult.data!.id;
  });

  describe('Scoring Rule Presets', () => {
    it('should have system presets available', async () => {
      const rules = await competitionService.getScoringRules(clubId);

      expect(rules.length).toBeGreaterThanOrEqual(4);

      const presetNames = rules.filter((r) => r.isPreset).map((r) => r.name);
      expect(presetNames).toContain('Best of 3 Sets');
      expect(presetNames).toContain('Match Tiebreak');
      expect(presetNames).toContain('FAST4');
      expect(presetNames).toContain('Pro Set');
    });

    it('presets should have correct configuration', async () => {
      const rules = await competitionService.getScoringRules(clubId);

      const bestOf3 = rules.find((r) => r.name === 'Best of 3 Sets');
      expect(bestOf3).toBeDefined();
      expect(bestOf3!.config.bestOfSets).toBe(3);
      expect(bestOf3!.config.gamesToWin).toBe(6);
      expect(bestOf3!.config.winBy).toBe(2);
      expect(bestOf3!.config.tiebreakAt).toBe(6);
      expect(bestOf3!.config.tiebreakPointsToWin).toBe(7);

      const fast4 = rules.find((r) => r.name === 'FAST4');
      expect(fast4).toBeDefined();
      expect(fast4!.config.bestOfSets).toBe(3);
      expect(fast4!.config.gamesToWin).toBe(4);
      expect(fast4!.config.winBy).toBe(1);
    });

    it('presets should have null clubId', async () => {
      const rules = await competitionService.getScoringRules(clubId);
      const presets = rules.filter((r) => r.isPreset);

      presets.forEach((preset) => {
        expect(preset.clubId).toBeNull();
      });
    });
  });

  describe('Custom Scoring Rules', () => {
    it('should create a custom scoring rule', async () => {
      const result = await competitionService.createScoringRule(clubId, {
        name: 'Club Special',
        config: {
          bestOfSets: 1,
          gamesToWin: 4,
          winBy: 1,
          tiebreakAt: 3,
          tiebreakPointsToWin: 5,
        },
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Club Special');
      expect(result.data!.clubId).toBe(clubId);
      expect(result.data!.isPreset).toBe(false);
    });

    it('custom rules should appear in club rules list', async () => {
      await competitionService.createScoringRule(clubId, {
        name: 'Club Special',
        config: {
          bestOfSets: 1,
          gamesToWin: 4,
          winBy: 1,
          tiebreakAt: 3,
          tiebreakPointsToWin: 5,
        },
      });

      const rules = await competitionService.getScoringRules(clubId);
      const customRule = rules.find((r) => r.name === 'Club Special');

      expect(customRule).toBeDefined();
      expect(customRule!.clubId).toBe(clubId);
    });

    it('custom rules from one club should not appear in another club', async () => {
      // Create another club
      const club2Result = await clubService.createClub({ name: 'Another Club' }, user2Id);
      const club2Id = club2Result.data!.id;

      // Create custom rule for club 1
      await competitionService.createScoringRule(clubId, {
        name: 'Club 1 Rule',
        config: {
          bestOfSets: 1,
          gamesToWin: 4,
          winBy: 1,
          tiebreakAt: 3,
          tiebreakPointsToWin: 5,
        },
      });

      // Club 2 should not see club 1's custom rule
      const club2Rules = await competitionService.getScoringRules(club2Id);
      const club1Rule = club2Rules.find((r) => r.name === 'Club 1 Rule');

      expect(club1Rule).toBeUndefined();
    });

    it('should get a specific scoring rule by ID', async () => {
      const createResult = await competitionService.createScoringRule(clubId, {
        name: 'Test Rule',
        config: {
          bestOfSets: 1,
          gamesToWin: 6,
          winBy: 2,
          tiebreakAt: 6,
          tiebreakPointsToWin: 7,
        },
      });

      const rule = await competitionService.getScoringRule(createResult.data!.id);

      expect(rule).toBeDefined();
      expect(rule!.name).toBe('Test Rule');
    });
  });

  describe('createCompetition', () => {
    it('should create a competition with required fields', async () => {
      const input: CreateCompetitionInput = {
        name: 'Summer Tournament',
        type: 'tournament',
        format: 'knockout',
      };

      const result = await competitionService.createCompetition(clubId, input, user1Id);

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Summer Tournament');
      expect(result.data!.type).toBe('tournament');
      expect(result.data!.format).toBe('knockout');
      expect(result.data!.status).toBe('draft');
      expect(result.data!.clubId).toBe(clubId);
      expect(result.data!.createdBy).toBe(user1Id);
    });

    it('should create a competition with all optional fields', async () => {
      const rules = await competitionService.getScoringRules(clubId);
      const scoringRuleId = rules[0].id;

      const input: CreateCompetitionInput = {
        name: 'Full Tournament',
        type: 'league',
        format: 'round_robin',
        scoreEntryMode: 'players_can_submit',
        defaultScoringRuleId: scoringRuleId,
        startDate: '2024-06-01',
        endDate: '2024-08-31',
      };

      const result = await competitionService.createCompetition(clubId, input, user1Id);

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('league');
      expect(result.data!.format).toBe('round_robin');
      expect(result.data!.scoreEntryMode).toBe('players_can_submit');
      expect(result.data!.defaultScoringRuleId).toBe(scoringRuleId);
      expect(result.data!.startDate).toBe('2024-06-01');
      expect(result.data!.endDate).toBe('2024-08-31');
    });

    it('should default to organisers_only score entry mode', async () => {
      const result = await competitionService.createCompetition(
        clubId,
        { name: 'Test', type: 'tournament', format: 'knockout' },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.scoreEntryMode).toBe('organisers_only');
    });

    it('should create competition in draft status', async () => {
      const result = await competitionService.createCompetition(
        clubId,
        { name: 'Test', type: 'tournament', format: 'knockout' },
        user1Id
      );

      expect(result.data!.status).toBe('draft');
      expect(result.data!.publicSlug).toBeNull();
    });
  });

  describe('getCompetition', () => {
    it('should return competition by ID', async () => {
      const createResult = await competitionService.createCompetition(
        clubId,
        { name: 'Test Tournament', type: 'tournament', format: 'knockout' },
        user1Id
      );

      const competition = await competitionService.getCompetition(createResult.data!.id);

      expect(competition).toBeDefined();
      expect(competition!.name).toBe('Test Tournament');
    });

    it('should return null for non-existent competition', async () => {
      const competition = await competitionService.getCompetition('non-existent-id');
      expect(competition).toBeNull();
    });
  });

  describe('getClubCompetitions', () => {
    beforeEach(async () => {
      // Create some test competitions
      await competitionService.createCompetition(
        clubId,
        { name: 'Draft Tournament', type: 'tournament', format: 'knockout' },
        user1Id
      );

      const publishedResult = await competitionService.createCompetition(
        clubId,
        { name: 'Published Tournament', type: 'tournament', format: 'round_robin' },
        user1Id
      );
      await competitionService.publishCompetition(publishedResult.data!.id, user1Id);
    });

    it('should return all competitions when includeDrafts is true', async () => {
      const competitions = await competitionService.getClubCompetitions(clubId, true);

      expect(competitions.length).toBe(2);
    });

    it('should exclude drafts when includeDrafts is false', async () => {
      const competitions = await competitionService.getClubCompetitions(clubId, false);

      expect(competitions.length).toBe(1);
      expect(competitions[0].name).toBe('Published Tournament');
    });

    it('should return empty array for club with no competitions', async () => {
      const club2Result = await clubService.createClub({ name: 'Empty Club' }, user2Id);
      const competitions = await competitionService.getClubCompetitions(club2Result.data!.id, true);

      expect(competitions.length).toBe(0);
    });

    it('should only return competitions for the specified club', async () => {
      // Create another club with a competition
      const club2Result = await clubService.createClub({ name: 'Another Club' }, user2Id);
      await competitionService.createCompetition(
        club2Result.data!.id,
        { name: 'Other Club Tournament', type: 'tournament', format: 'knockout' },
        user2Id
      );

      const club1Competitions = await competitionService.getClubCompetitions(clubId, true);
      const club2Competitions = await competitionService.getClubCompetitions(club2Result.data!.id, true);

      expect(club1Competitions.length).toBe(2);
      expect(club2Competitions.length).toBe(1);
      expect(club2Competitions[0].name).toBe('Other Club Tournament');
    });
  });

  describe('updateCompetition', () => {
    let competitionId: string;

    beforeEach(async () => {
      const result = await competitionService.createCompetition(
        clubId,
        { name: 'Original Name', type: 'tournament', format: 'knockout' },
        user1Id
      );
      competitionId = result.data!.id;
    });

    it('should update competition name', async () => {
      const result = await competitionService.updateCompetition(
        competitionId,
        { name: 'Updated Name' },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Updated Name');
    });

    it('should update competition format', async () => {
      const result = await competitionService.updateCompetition(
        competitionId,
        { format: 'round_robin' },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.format).toBe('round_robin');
    });

    it('should update score entry mode', async () => {
      const result = await competitionService.updateCompetition(
        competitionId,
        { scoreEntryMode: 'players_can_submit' },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.scoreEntryMode).toBe('players_can_submit');
    });

    it('should update dates', async () => {
      const result = await competitionService.updateCompetition(
        competitionId,
        { startDate: '2024-07-01', endDate: '2024-09-01' },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.startDate).toBe('2024-07-01');
      expect(result.data!.endDate).toBe('2024-09-01');
    });

    it('should return error for non-existent competition', async () => {
      const result = await competitionService.updateCompetition(
        'non-existent',
        { name: 'New Name' },
        user1Id
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('competition_not_found');
    });

    it('should not change fields if no updates provided', async () => {
      const result = await competitionService.updateCompetition(competitionId, {}, user1Id);

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Original Name');
    });
  });

  describe('publishCompetition', () => {
    let competitionId: string;

    beforeEach(async () => {
      const result = await competitionService.createCompetition(
        clubId,
        { name: 'Test Tournament', type: 'tournament', format: 'knockout' },
        user1Id
      );
      competitionId = result.data!.id;
    });

    it('should publish a draft competition', async () => {
      const result = await competitionService.publishCompetition(competitionId, user1Id);

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('published');
    });

    it('should generate a public slug when publishing', async () => {
      const result = await competitionService.publishCompetition(competitionId, user1Id);

      expect(result.data!.publicSlug).toBeDefined();
      expect(result.data!.publicSlug).not.toBeNull();
      expect(result.data!.publicSlug!.length).toBeGreaterThan(0);
    });

    it('public slug should contain sanitized competition name', async () => {
      const result = await competitionService.publishCompetition(competitionId, user1Id);

      expect(result.data!.publicSlug).toContain('test-tournament');
    });

    it('should not publish already published competition', async () => {
      await competitionService.publishCompetition(competitionId, user1Id);
      const result = await competitionService.publishCompetition(competitionId, user1Id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('already_published');
    });

    it('should return error for non-existent competition', async () => {
      const result = await competitionService.publishCompetition('non-existent', user1Id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('competition_not_found');
    });
  });

  describe('getPublicCompetition', () => {
    let publicSlug: string;

    beforeEach(async () => {
      const createResult = await competitionService.createCompetition(
        clubId,
        { name: 'Public Tournament', type: 'tournament', format: 'knockout' },
        user1Id
      );
      const publishResult = await competitionService.publishCompetition(createResult.data!.id, user1Id);
      publicSlug = publishResult.data!.publicSlug!;
    });

    it('should return published competition by slug', async () => {
      const competition = await competitionService.getPublicCompetition(publicSlug);

      expect(competition).toBeDefined();
      expect(competition!.name).toBe('Public Tournament');
    });

    it('should return null for non-existent slug', async () => {
      const competition = await competitionService.getPublicCompetition('non-existent-slug');
      expect(competition).toBeNull();
    });

    it('should not return draft competition even if slug somehow exists', async () => {
      // Create a draft competition - it won't have a slug but we test the status check
      await competitionService.createCompetition(
        clubId,
        { name: 'Draft Only', type: 'tournament', format: 'knockout' },
        user1Id
      );

      // Try to get a non-existent slug that would match a draft
      const competition = await competitionService.getPublicCompetition('draft-only-12345678');
      expect(competition).toBeNull();
    });
  });

  describe('createDivision', () => {
    let competitionId: string;

    beforeEach(async () => {
      const result = await competitionService.createCompetition(
        clubId,
        { name: 'Test Tournament', type: 'tournament', format: 'knockout' },
        user1Id
      );
      competitionId = result.data!.id;
    });

    it('should create a division with required fields', async () => {
      const result = await competitionService.createDivision(competitionId, {
        name: 'A Grade',
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('A Grade');
      expect(result.data!.competitionId).toBe(competitionId);
    });

    it('should create a division with optional format override', async () => {
      const result = await competitionService.createDivision(competitionId, {
        name: 'B Grade',
        format: 'round_robin',
      });

      expect(result.success).toBe(true);
      expect(result.data!.format).toBe('round_robin');
    });

    it('should create a division with optional scoring rule override', async () => {
      const rules = await competitionService.getScoringRules(clubId);
      const ruleId = rules[0].id;

      const result = await competitionService.createDivision(competitionId, {
        name: 'C Grade',
        scoringRuleId: ruleId,
      });

      expect(result.success).toBe(true);
      expect(result.data!.scoringRuleId).toBe(ruleId);
    });

    it('should create a division with sort order', async () => {
      const result = await competitionService.createDivision(competitionId, {
        name: 'D Grade',
        sortOrder: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data!.sortOrder).toBe(3);
    });

    it('should reject duplicate division names in same competition', async () => {
      await competitionService.createDivision(competitionId, { name: 'A Grade' });
      const result = await competitionService.createDivision(competitionId, { name: 'A Grade' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('duplicate_division_name');
    });

    it('should allow same division name in different competitions', async () => {
      await competitionService.createDivision(competitionId, { name: 'A Grade' });

      // Create another competition
      const comp2Result = await competitionService.createCompetition(
        clubId,
        { name: 'Another Tournament', type: 'tournament', format: 'knockout' },
        user1Id
      );

      const result = await competitionService.createDivision(comp2Result.data!.id, {
        name: 'A Grade',
      });

      expect(result.success).toBe(true);
    });

    it('should return error for non-existent competition', async () => {
      const result = await competitionService.createDivision('non-existent', {
        name: 'A Grade',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('competition_not_found');
    });
  });

  describe('getDivisions', () => {
    let competitionId: string;

    beforeEach(async () => {
      const result = await competitionService.createCompetition(
        clubId,
        { name: 'Test Tournament', type: 'tournament', format: 'knockout' },
        user1Id
      );
      competitionId = result.data!.id;

      // Create some divisions
      await competitionService.createDivision(competitionId, { name: 'C Grade', sortOrder: 2 });
      await competitionService.createDivision(competitionId, { name: 'A Grade', sortOrder: 0 });
      await competitionService.createDivision(competitionId, { name: 'B Grade', sortOrder: 1 });
    });

    it('should return all divisions for a competition', async () => {
      const divisions = await competitionService.getDivisions(competitionId);

      expect(divisions.length).toBe(3);
    });

    it('should return divisions ordered by sort order', async () => {
      const divisions = await competitionService.getDivisions(competitionId);

      expect(divisions[0].name).toBe('A Grade');
      expect(divisions[1].name).toBe('B Grade');
      expect(divisions[2].name).toBe('C Grade');
    });

    it('should return empty array for competition with no divisions', async () => {
      const newCompResult = await competitionService.createCompetition(
        clubId,
        { name: 'Empty Tournament', type: 'tournament', format: 'knockout' },
        user1Id
      );

      const divisions = await competitionService.getDivisions(newCompResult.data!.id);

      expect(divisions.length).toBe(0);
    });
  });

  describe('getDivision', () => {
    it('should return division by ID', async () => {
      const compResult = await competitionService.createCompetition(
        clubId,
        { name: 'Test', type: 'tournament', format: 'knockout' },
        user1Id
      );

      const divResult = await competitionService.createDivision(compResult.data!.id, {
        name: 'A Grade',
      });

      const division = await competitionService.getDivision(divResult.data!.id);

      expect(division).toBeDefined();
      expect(division!.name).toBe('A Grade');
    });

    it('should return null for non-existent division', async () => {
      const division = await competitionService.getDivision('non-existent');
      expect(division).toBeNull();
    });
  });

  describe('updateDivision', () => {
    let divisionId: string;

    beforeEach(async () => {
      const compResult = await competitionService.createCompetition(
        clubId,
        { name: 'Test', type: 'tournament', format: 'knockout' },
        user1Id
      );

      const divResult = await competitionService.createDivision(compResult.data!.id, {
        name: 'Original Name',
        sortOrder: 0,
      });
      divisionId = divResult.data!.id;
    });

    it('should update division name', async () => {
      const result = await competitionService.updateDivision(divisionId, {
        name: 'Updated Name',
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Updated Name');
    });

    it('should update division format', async () => {
      const result = await competitionService.updateDivision(divisionId, {
        format: 'swiss',
      });

      expect(result.success).toBe(true);
      expect(result.data!.format).toBe('swiss');
    });

    it('should update division sort order', async () => {
      const result = await competitionService.updateDivision(divisionId, {
        sortOrder: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data!.sortOrder).toBe(5);
    });

    it('should update division scoring rule', async () => {
      const rules = await competitionService.getScoringRules(clubId);
      const ruleId = rules[0].id;

      const result = await competitionService.updateDivision(divisionId, {
        scoringRuleId: ruleId,
      });

      expect(result.success).toBe(true);
      expect(result.data!.scoringRuleId).toBe(ruleId);
    });

    it('should return error for non-existent division', async () => {
      const result = await competitionService.updateDivision('non-existent', {
        name: 'New Name',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('division_not_found');
    });

    it('should reject duplicate name in same competition', async () => {
      // Get the competition ID
      const division = await competitionService.getDivision(divisionId);
      const competitionId = division!.competitionId;

      // Create another division
      await competitionService.createDivision(competitionId, { name: 'Other Division' });

      // Try to rename first division to conflict
      const result = await competitionService.updateDivision(divisionId, {
        name: 'Other Division',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('duplicate_division_name');
    });
  });

  describe('deleteDivision', () => {
    let divisionId: string;

    beforeEach(async () => {
      const compResult = await competitionService.createCompetition(
        clubId,
        { name: 'Test', type: 'tournament', format: 'knockout' },
        user1Id
      );

      const divResult = await competitionService.createDivision(compResult.data!.id, {
        name: 'To Delete',
      });
      divisionId = divResult.data!.id;
    });

    it('should delete a division', async () => {
      const result = await competitionService.deleteDivision(divisionId);

      expect(result.success).toBe(true);

      // Verify it's deleted
      const division = await competitionService.getDivision(divisionId);
      expect(division).toBeNull();
    });

    it('should return error for non-existent division', async () => {
      const result = await competitionService.deleteDivision('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('division_not_found');
    });
  });

  describe('Competition Formats', () => {
    it('should support knockout format', async () => {
      const result = await competitionService.createCompetition(
        clubId,
        { name: 'KO Tournament', type: 'tournament', format: 'knockout' },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.format).toBe('knockout');
    });

    it('should support round_robin format', async () => {
      const result = await competitionService.createCompetition(
        clubId,
        { name: 'RR League', type: 'league', format: 'round_robin' },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.format).toBe('round_robin');
    });

    it('should support swiss format', async () => {
      const result = await competitionService.createCompetition(
        clubId,
        { name: 'Swiss Tournament', type: 'tournament', format: 'swiss' },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.format).toBe('swiss');
    });

    it('should support ladder format', async () => {
      const result = await competitionService.createCompetition(
        clubId,
        { name: 'Ladder League', type: 'league', format: 'ladder' },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.format).toBe('ladder');
    });
  });

  describe('Competition Types', () => {
    it('should support tournament type', async () => {
      const result = await competitionService.createCompetition(
        clubId,
        { name: 'Test', type: 'tournament', format: 'knockout' },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('tournament');
    });

    it('should support league type', async () => {
      const result = await competitionService.createCompetition(
        clubId,
        { name: 'Test', type: 'league', format: 'round_robin' },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('league');
    });
  });

  describe('Tenant Isolation', () => {
    it('competitions should be isolated between clubs', async () => {
      // Create second club
      const club2Result = await clubService.createClub({ name: 'Club 2' }, user2Id);
      const club2Id = club2Result.data!.id;

      // Create competitions in each club
      await competitionService.createCompetition(
        clubId,
        { name: 'Club 1 Tournament', type: 'tournament', format: 'knockout' },
        user1Id
      );
      await competitionService.createCompetition(
        club2Id,
        { name: 'Club 2 Tournament', type: 'tournament', format: 'knockout' },
        user2Id
      );

      const club1Competitions = await competitionService.getClubCompetitions(clubId, true);
      const club2Competitions = await competitionService.getClubCompetitions(club2Id, true);

      expect(club1Competitions.length).toBe(1);
      expect(club1Competitions[0].name).toBe('Club 1 Tournament');

      expect(club2Competitions.length).toBe(1);
      expect(club2Competitions[0].name).toBe('Club 2 Tournament');
    });
  });
});
