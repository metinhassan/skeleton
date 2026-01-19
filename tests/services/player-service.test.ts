/**
 * Unit tests for MockPlayerService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockPlayerService } from '../../server/services/mock-player-service.js';
import { MockClubService } from '../../server/services/mock-club-service.js';
import { MockCompetitionService } from '../../server/services/mock-competition-service.js';
import { MockUserService } from '../../server/services/mock-user-service.js';
import { resetDatabase, getDatabase } from '../../server/db/database.js';

describe('MockPlayerService', () => {
  let playerService: MockPlayerService;
  let clubService: MockClubService;
  let competitionService: MockCompetitionService;
  let userService: MockUserService;
  let userId: string;
  let clubId: string;
  let competitionId: string;
  let divisionId: string;

  beforeEach(async () => {
    resetDatabase();
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
  });

  // ==================== Player Tests ====================

  describe('createPlayer', () => {
    it('should create a player with name only', async () => {
      const result = await playerService.createPlayer(clubId, { name: 'John Doe' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.name).toBe('John Doe');
      expect(result.data!.clubId).toBe(clubId);
      expect(result.data!.email).toBeNull();
      expect(result.data!.phone).toBeNull();
      expect(result.data!.userId).toBeNull();
    });

    it('should create a player with all fields', async () => {
      const result = await playerService.createPlayer(clubId, {
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '0412345678',
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Jane Smith');
      expect(result.data!.email).toBe('jane@example.com');
      expect(result.data!.phone).toBe('0412345678');
    });

    it('should create multiple players in same club', async () => {
      await playerService.createPlayer(clubId, { name: 'Player One' });
      await playerService.createPlayer(clubId, { name: 'Player Two' });
      await playerService.createPlayer(clubId, { name: 'Player Three' });

      const players = await playerService.getClubPlayers(clubId);
      expect(players).toHaveLength(3);
    });
  });

  describe('getPlayer', () => {
    it('should return player by ID', async () => {
      const createResult = await playerService.createPlayer(clubId, { name: 'Test Player' });
      const player = await playerService.getPlayer(createResult.data!.id);

      expect(player).toBeDefined();
      expect(player!.name).toBe('Test Player');
    });

    it('should return null for non-existent player', async () => {
      const player = await playerService.getPlayer('non-existent-id');
      expect(player).toBeNull();
    });
  });

  describe('getClubPlayers', () => {
    it('should return all players for a club', async () => {
      await playerService.createPlayer(clubId, { name: 'Alice' });
      await playerService.createPlayer(clubId, { name: 'Bob' });

      const players = await playerService.getClubPlayers(clubId);
      expect(players).toHaveLength(2);
    });

    it('should search players by name', async () => {
      await playerService.createPlayer(clubId, { name: 'Alice Smith' });
      await playerService.createPlayer(clubId, { name: 'Bob Jones' });
      await playerService.createPlayer(clubId, { name: 'Charlie Smith' });

      const players = await playerService.getClubPlayers(clubId, 'smith');
      expect(players).toHaveLength(2);
      expect(players.map(p => p.name)).toContain('Alice Smith');
      expect(players.map(p => p.name)).toContain('Charlie Smith');
    });

    it('should search players by email', async () => {
      await playerService.createPlayer(clubId, { name: 'Alice', email: 'alice@test.com' });
      await playerService.createPlayer(clubId, { name: 'Bob', email: 'bob@example.com' });

      const players = await playerService.getClubPlayers(clubId, 'test.com');
      expect(players).toHaveLength(1);
      expect(players[0].name).toBe('Alice');
    });

    it('should return empty array for club with no players', async () => {
      const players = await playerService.getClubPlayers(clubId);
      expect(players).toHaveLength(0);
    });
  });

  describe('updatePlayer', () => {
    it('should update player name', async () => {
      const createResult = await playerService.createPlayer(clubId, { name: 'Old Name' });
      const result = await playerService.updatePlayer(createResult.data!.id, { name: 'New Name' });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('New Name');
    });

    it('should update player email', async () => {
      const createResult = await playerService.createPlayer(clubId, { name: 'Test', email: 'old@test.com' });
      const result = await playerService.updatePlayer(createResult.data!.id, { email: 'new@test.com' });

      expect(result.success).toBe(true);
      expect(result.data!.email).toBe('new@test.com');
    });

    it('should return error for non-existent player', async () => {
      const result = await playerService.updatePlayer('non-existent', { name: 'Test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('player_not_found');
      }
    });

    it('should log audit for name changes', async () => {
      const createResult = await playerService.createPlayer(clubId, { name: 'Original' });
      await playerService.updatePlayer(createResult.data!.id, { name: 'Updated' });

      const db = getDatabase();
      const auditLogs = db
        .prepare("SELECT * FROM audit_log WHERE entity_type = 'player' AND action = 'update_player'")
        .all();

      expect(auditLogs.length).toBeGreaterThan(0);
    });
  });

  describe('findDuplicates', () => {
    it('should find players with matching name', async () => {
      await playerService.createPlayer(clubId, { name: 'John Smith' });
      await playerService.createPlayer(clubId, { name: 'Jane Doe' });

      const duplicates = await playerService.findDuplicates(clubId, 'John Smith');
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].name).toBe('John Smith');
    });

    it('should find players with matching email', async () => {
      await playerService.createPlayer(clubId, { name: 'Player 1', email: 'test@example.com' });
      await playerService.createPlayer(clubId, { name: 'Player 2', email: 'other@example.com' });

      const duplicates = await playerService.findDuplicates(clubId, 'Different Name', 'test@example.com');
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].email).toBe('test@example.com');
    });

    it('should be case insensitive', async () => {
      await playerService.createPlayer(clubId, { name: 'John SMITH' });

      const duplicates = await playerService.findDuplicates(clubId, 'john smith');
      expect(duplicates).toHaveLength(1);
    });

    it('should return empty array when no duplicates', async () => {
      await playerService.createPlayer(clubId, { name: 'Existing Player' });

      const duplicates = await playerService.findDuplicates(clubId, 'New Player');
      expect(duplicates).toHaveLength(0);
    });
  });

  describe('linkUserToPlayer', () => {
    it('should link user to player', async () => {
      const createResult = await playerService.createPlayer(clubId, { name: 'Test Player' });
      const result = await playerService.linkUserToPlayer(createResult.data!.id, userId);

      expect(result.success).toBe(true);
      expect(result.data!.userId).toBe(userId);
    });

    it('should return error for non-existent player', async () => {
      const result = await playerService.linkUserToPlayer('non-existent', userId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('player_not_found');
      }
    });
  });

  // ==================== Team Tests ====================

  describe('createTeam', () => {
    it('should create a team with two players', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'Player 1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'Player 2' });

      const result = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.player1Id).toBe(player1.data!.id);
      expect(result.data!.player2Id).toBe(player2.data!.id);
      expect(result.data!.name).toBe('Player 1 / Player 2');
    });

    it('should create a team with custom name', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'Player 1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'Player 2' });

      const result = await playerService.createTeam(clubId, {
        name: 'Dynamic Duo',
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Dynamic Duo');
    });

    it('should create a team with seed and rating', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'Player 1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'Player 2' });

      const result = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
        seed: 1,
        rating: 8.5,
      });

      expect(result.success).toBe(true);
      expect(result.data!.seed).toBe(1);
      expect(result.data!.rating).toBe(8.5);
    });

    it('should reject team with same player twice', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'Player 1' });

      const result = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player1.data!.id,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('same_player_in_team');
      }
    });

    it('should reject team with non-existent player', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'Player 1' });

      const result = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: 'non-existent',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('player_not_found');
      }
    });
  });

  describe('getTeam', () => {
    it('should return team by ID', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'Player 1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'Player 2' });
      const createResult = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
      });

      const team = await playerService.getTeam(createResult.data!.id);
      expect(team).toBeDefined();
      expect(team!.player1Id).toBe(player1.data!.id);
    });

    it('should return null for non-existent team', async () => {
      const team = await playerService.getTeam('non-existent-id');
      expect(team).toBeNull();
    });
  });

  describe('getClubTeams', () => {
    it('should return all teams for a club', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'P2' });
      const player3 = await playerService.createPlayer(clubId, { name: 'P3' });
      const player4 = await playerService.createPlayer(clubId, { name: 'P4' });

      await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
      });
      await playerService.createTeam(clubId, {
        player1Id: player3.data!.id,
        player2Id: player4.data!.id,
      });

      const teams = await playerService.getClubTeams(clubId);
      expect(teams).toHaveLength(2);
    });
  });

  describe('updateTeam', () => {
    it('should update team name', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'P2' });
      const createResult = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
      });

      const result = await playerService.updateTeam(createResult.data!.id, { name: 'New Name' });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('New Name');
    });

    it('should update team seed', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'P2' });
      const createResult = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
      });

      const result = await playerService.updateTeam(createResult.data!.id, { seed: 5 });

      expect(result.success).toBe(true);
      expect(result.data!.seed).toBe(5);
    });

    it('should return error for non-existent team', async () => {
      const result = await playerService.updateTeam('non-existent', { name: 'Test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('team_not_found');
      }
    });
  });

  describe('deleteTeam', () => {
    it('should delete team', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'P2' });
      const createResult = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
      });

      const result = await playerService.deleteTeam(createResult.data!.id);
      expect(result.success).toBe(true);

      const team = await playerService.getTeam(createResult.data!.id);
      expect(team).toBeNull();
    });

    it('should not delete team that is in competition entries', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'P2' });
      const teamResult = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
      });

      // Create doubles division and add team entry
      const divResult = await competitionService.createDivision(competitionId, {
        name: 'Open Doubles',
      });
      await playerService.createEntry(divResult.data!.id, {
        entryType: 'doubles',
        teamId: teamResult.data!.id,
      });

      const result = await playerService.deleteTeam(teamResult.data!.id);
      expect(result.success).toBe(false);
    });

    it('should return error for non-existent team', async () => {
      const result = await playerService.deleteTeam('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('team_not_found');
      }
    });
  });

  // ==================== Entry Tests ====================

  describe('createEntry - Singles', () => {
    it('should create a singles entry', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Test Player' });

      const result = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: player.data!.id,
      });

      expect(result.success).toBe(true);
      expect(result.data!.entryType).toBe('singles');
      expect(result.data!.playerId).toBe(player.data!.id);
      expect(result.data!.teamId).toBeNull();
    });

    it('should create a singles entry with seed', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Seeded Player' });

      const result = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: player.data!.id,
        seed: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data!.seed).toBe(1);
    });

    it('should prevent duplicate singles entries', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Test Player' });

      await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: player.data!.id,
      });

      const result = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: player.data!.id,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('player_already_in_division');
      }
    });

    it('should reject singles entry without playerId', async () => {
      const result = await playerService.createEntry(divisionId, {
        entryType: 'singles',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_entry_type');
      }
    });

    it('should reject entry for non-existent division', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Test Player' });

      const result = await playerService.createEntry('non-existent', {
        entryType: 'singles',
        playerId: player.data!.id,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('division_not_found');
      }
    });
  });

  describe('createEntry - Doubles', () => {
    it('should create a doubles entry', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'P2' });
      const team = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
      });

      const result = await playerService.createEntry(divisionId, {
        entryType: 'doubles',
        teamId: team.data!.id,
      });

      expect(result.success).toBe(true);
      expect(result.data!.entryType).toBe('doubles');
      expect(result.data!.teamId).toBe(team.data!.id);
      expect(result.data!.playerId).toBeNull();
    });

    it('should prevent duplicate doubles entries', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'P2' });
      const team = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
      });

      await playerService.createEntry(divisionId, {
        entryType: 'doubles',
        teamId: team.data!.id,
      });

      const result = await playerService.createEntry(divisionId, {
        entryType: 'doubles',
        teamId: team.data!.id,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('team_already_in_division');
      }
    });

    it('should prevent player from being in multiple teams in same division', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'P2' });
      const player3 = await playerService.createPlayer(clubId, { name: 'P3' });

      const team1 = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
      });

      const team2 = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id, // Same player as team1
        player2Id: player3.data!.id,
      });

      await playerService.createEntry(divisionId, {
        entryType: 'doubles',
        teamId: team1.data!.id,
      });

      const result = await playerService.createEntry(divisionId, {
        entryType: 'doubles',
        teamId: team2.data!.id,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('player_already_in_division');
      }
    });

    it('should reject doubles entry without teamId', async () => {
      const result = await playerService.createEntry(divisionId, {
        entryType: 'doubles',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_entry_type');
      }
    });
  });

  describe('getDivisionEntries', () => {
    it('should return all entries for a division', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'P2' });
      const player3 = await playerService.createPlayer(clubId, { name: 'P3' });

      await playerService.createEntry(divisionId, { entryType: 'singles', playerId: player1.data!.id });
      await playerService.createEntry(divisionId, { entryType: 'singles', playerId: player2.data!.id });
      await playerService.createEntry(divisionId, { entryType: 'singles', playerId: player3.data!.id });

      const entries = await playerService.getDivisionEntries(divisionId);
      expect(entries).toHaveLength(3);
    });

    it('should return entries ordered by seed', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'P2' });
      const player3 = await playerService.createPlayer(clubId, { name: 'P3' });

      await playerService.createEntry(divisionId, { entryType: 'singles', playerId: player1.data!.id, seed: 3 });
      await playerService.createEntry(divisionId, { entryType: 'singles', playerId: player2.data!.id, seed: 1 });
      await playerService.createEntry(divisionId, { entryType: 'singles', playerId: player3.data!.id, seed: 2 });

      const entries = await playerService.getDivisionEntries(divisionId);
      expect(entries[0].seed).toBe(1);
      expect(entries[1].seed).toBe(2);
      expect(entries[2].seed).toBe(3);
    });

    it('should return empty array for division with no entries', async () => {
      const entries = await playerService.getDivisionEntries(divisionId);
      expect(entries).toHaveLength(0);
    });
  });

  describe('updateEntry', () => {
    it('should update entry seed', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Test' });
      const entry = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: player.data!.id,
      });

      const result = await playerService.updateEntry(entry.data!.id, { seed: 5 });

      expect(result.success).toBe(true);
      expect(result.data!.seed).toBe(5);
    });

    it('should return error for non-existent entry', async () => {
      const result = await playerService.updateEntry('non-existent', { seed: 1 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('entry_not_found');
      }
    });
  });

  describe('deleteEntry', () => {
    it('should delete entry', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Test' });
      const entry = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: player.data!.id,
      });

      const result = await playerService.deleteEntry(entry.data!.id);
      expect(result.success).toBe(true);

      const deleted = await playerService.getEntry(entry.data!.id);
      expect(deleted).toBeNull();
    });

    it('should allow re-entry after deletion', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Test' });

      const entry1 = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: player.data!.id,
      });
      await playerService.deleteEntry(entry1.data!.id);

      const entry2 = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: player.data!.id,
      });

      expect(entry2.success).toBe(true);
    });

    it('should return error for non-existent entry', async () => {
      const result = await playerService.deleteEntry('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('entry_not_found');
      }
    });
  });

  describe('checkPlayerInDivision', () => {
    it('should return true for player with singles entry', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Test' });
      await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: player.data!.id,
      });

      const result = await playerService.checkPlayerInDivision(divisionId, player.data!.id);
      expect(result).toBe(true);
    });

    it('should return true for player in doubles team entry', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const player2 = await playerService.createPlayer(clubId, { name: 'P2' });
      const team = await playerService.createTeam(clubId, {
        player1Id: player1.data!.id,
        player2Id: player2.data!.id,
      });
      await playerService.createEntry(divisionId, {
        entryType: 'doubles',
        teamId: team.data!.id,
      });

      const result = await playerService.checkPlayerInDivision(divisionId, player1.data!.id);
      expect(result).toBe(true);
    });

    it('should return false for player not in division', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Test' });

      const result = await playerService.checkPlayerInDivision(divisionId, player.data!.id);
      expect(result).toBe(false);
    });
  });

  // ==================== Profile Claiming Tests (Epic 4) ====================

  describe('generateClaimToken', () => {
    it('should generate a claim token for unclaimed player', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Test Player' });

      const result = await playerService.generateClaimToken(player.data!.id);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.token).toBeDefined();
      expect(result.data!.token.length).toBeGreaterThan(0);
      expect(result.data!.expiresAt).toBeInstanceOf(Date);
      expect(result.data!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return error for non-existent player', async () => {
      const result = await playerService.generateClaimToken('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('player_not_found');
      }
    });

    it('should return error for already claimed player', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Test Player', email: 'test@example.com' });
      const tokenResult = await playerService.generateClaimToken(player.data!.id);
      await playerService.claimProfile(tokenResult.data!.token, userId, 'test@example.com');

      const result = await playerService.generateClaimToken(player.data!.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('profile_already_claimed');
      }
    });
  });

  describe('claimProfile', () => {
    it('should claim a profile with valid token', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Test Player', email: 'test@example.com' });
      const tokenResult = await playerService.generateClaimToken(player.data!.id);

      const result = await playerService.claimProfile(tokenResult.data!.token, userId, 'test@example.com');

      expect(result.success).toBe(true);
      expect(result.data!.userId).toBe(userId);
      expect(result.data!.claimedAt).not.toBeNull();
      expect(result.data!.claimToken).toBeNull();
    });

    it('should return error for invalid token', async () => {
      const result = await playerService.claimProfile('invalid-token', userId, 'test@example.com');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_claim_token');
      }
    });

    it('should return error for already claimed profile', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Test Player', email: 'test@example.com' });
      const tokenResult = await playerService.generateClaimToken(player.data!.id);
      await playerService.claimProfile(tokenResult.data!.token, userId, 'test@example.com');

      // Generate another token and try to claim again (shouldn't work since already claimed)
      const result = await playerService.claimProfile(tokenResult.data!.token, 'another-user', 'test@example.com');

      expect(result.success).toBe(false);
    });
  });

  describe('getPlayersByUser', () => {
    it('should return all players linked to user', async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'Player 1', email: 'p1@test.com' });
      const player2 = await playerService.createPlayer(clubId, { name: 'Player 2', email: 'p2@test.com' });

      // Link players to user
      await playerService.linkUserToPlayer(player1.data!.id, userId);
      await playerService.linkUserToPlayer(player2.data!.id, userId);

      const players = await playerService.getPlayersByUser(userId);

      expect(players).toHaveLength(2);
      expect(players.map(p => p.name)).toContain('Player 1');
      expect(players.map(p => p.name)).toContain('Player 2');
    });

    it('should return empty array for user with no linked players', async () => {
      const players = await playerService.getPlayersByUser('no-players-user');

      expect(players).toHaveLength(0);
    });
  });

  // ==================== Self-Registration Tests (Epic 4) ====================

  describe('registerForCompetition', () => {
    let registrationPlayerId: string;
    let registrationDivisionId: string;

    beforeEach(async () => {
      // Create player linked to user for the club
      const player = await playerService.createPlayer(clubId, { name: 'Registration Player' });
      await playerService.linkUserToPlayer(player.data!.id, userId);
      registrationPlayerId = player.data!.id;

      // Enable registration on competition and set status to published
      const db = getDatabase();
      db.prepare("UPDATE competitions SET registration_open = 1, registration_deadline = datetime('now', '+7 days'), status = 'published' WHERE id = ?").run(competitionId);

      // Create a division for registration
      const divResult = await competitionService.createDivision(competitionId, { name: 'Registration Division' });
      registrationDivisionId = divResult.data!.id;
    });

    it('should register for singles competition', async () => {
      const result = await playerService.registerForCompetition(registrationDivisionId, userId, {
        entryType: 'singles',
        divisionId: registrationDivisionId,
      });

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('pending');
      expect(result.data!.entryType).toBe('singles');
      expect(result.data!.registeredByUserId).toBe(userId);
    });

    it('should return error when registration is closed', async () => {
      const db = getDatabase();
      db.prepare('UPDATE competitions SET registration_open = 0 WHERE id = ?').run(competitionId);

      const result = await playerService.registerForCompetition(registrationDivisionId, userId, {
        entryType: 'singles',
        divisionId: registrationDivisionId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('registration_closed');
      }
    });

    it('should return error when user has no player profile', async () => {
      // Create a new user without a player profile
      const newUser = await userService.register({
        email: 'noplayer@example.com',
        password: 'password123',
        name: 'No Player User',
      });

      const result = await playerService.registerForCompetition(registrationDivisionId, newUser.data!.id, {
        entryType: 'singles',
        divisionId: registrationDivisionId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('player_not_found');
      }
    });

    it('should return error for duplicate registration', async () => {
      await playerService.registerForCompetition(registrationDivisionId, userId, {
        entryType: 'singles',
        divisionId: registrationDivisionId,
      });

      const result = await playerService.registerForCompetition(registrationDivisionId, userId, {
        entryType: 'singles',
        divisionId: registrationDivisionId,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('already_registered');
      }
    });
  });

  describe('approveRegistration', () => {
    let pendingEntryId: string;

    beforeEach(async () => {
      // Create player and link to user
      const player = await playerService.createPlayer(clubId, { name: 'Pending Player' });
      await playerService.linkUserToPlayer(player.data!.id, userId);

      // Enable registration
      const db = getDatabase();
      db.prepare("UPDATE competitions SET registration_open = 1, status = 'published' WHERE id = ?").run(competitionId);

      // Register
      const result = await playerService.registerForCompetition(divisionId, userId, {
        entryType: 'singles',
        divisionId,
      });
      pendingEntryId = result.data!.id;
    });

    it('should approve a pending registration', async () => {
      const result = await playerService.approveRegistration(pendingEntryId);

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('approved');
    });

    it('should return error for non-pending entry', async () => {
      await playerService.approveRegistration(pendingEntryId);
      const result = await playerService.approveRegistration(pendingEntryId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('entry_not_pending');
      }
    });

    it('should return error for non-existent entry', async () => {
      const result = await playerService.approveRegistration('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('entry_not_found');
      }
    });
  });

  describe('rejectRegistration', () => {
    let pendingEntryId: string;

    beforeEach(async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Reject Test Player' });
      await playerService.linkUserToPlayer(player.data!.id, userId);

      const db = getDatabase();
      db.prepare("UPDATE competitions SET registration_open = 1, status = 'published' WHERE id = ?").run(competitionId);

      const result = await playerService.registerForCompetition(divisionId, userId, {
        entryType: 'singles',
        divisionId,
      });
      pendingEntryId = result.data!.id;
    });

    it('should reject a pending registration', async () => {
      const result = await playerService.rejectRegistration(pendingEntryId, 'Not eligible');

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('rejected');
    });
  });

  describe('withdrawRegistration', () => {
    let pendingEntryId: string;

    beforeEach(async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Withdraw Test Player' });
      await playerService.linkUserToPlayer(player.data!.id, userId);

      const db = getDatabase();
      db.prepare("UPDATE competitions SET registration_open = 1, status = 'published' WHERE id = ?").run(competitionId);

      const result = await playerService.registerForCompetition(divisionId, userId, {
        entryType: 'singles',
        divisionId,
      });
      pendingEntryId = result.data!.id;
    });

    it('should withdraw own registration', async () => {
      const result = await playerService.withdrawRegistration(pendingEntryId, userId);

      expect(result.success).toBe(true);

      const entry = await playerService.getEntry(pendingEntryId);
      expect(entry!.status).toBe('withdrawn');
    });

    it('should return error when user does not own the registration', async () => {
      const result = await playerService.withdrawRegistration(pendingEntryId, 'other-user');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('not_authorized');
      }
    });
  });

  // ==================== Partner Request Tests (Epic 4) ====================

  describe('createPartnerRequest', () => {
    let player1Id: string;
    let player2Id: string;
    let doublesDivisionId: string;

    beforeEach(async () => {
      const player1 = await playerService.createPlayer(clubId, { name: 'Requester' });
      const player2 = await playerService.createPlayer(clubId, { name: 'Invitee' });
      player1Id = player1.data!.id;
      player2Id = player2.data!.id;

      const divResult = await competitionService.createDivision(competitionId, { name: 'Doubles Division' });
      doublesDivisionId = divResult.data!.id;
    });

    it('should create a partner request', async () => {
      const result = await playerService.createPartnerRequest({
        divisionId: doublesDivisionId,
        requesterPlayerId: player1Id,
        inviteePlayerId: player2Id,
        message: 'Want to team up?',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.status).toBe('pending');
      expect(result.data!.requesterPlayerId).toBe(player1Id);
      expect(result.data!.inviteePlayerId).toBe(player2Id);
      expect(result.data!.message).toBe('Want to team up?');
      expect(result.data!.expiresAt).toBeInstanceOf(Date);
    });

    it('should return error when requesting self as partner', async () => {
      const result = await playerService.createPartnerRequest({
        divisionId: doublesDivisionId,
        requesterPlayerId: player1Id,
        inviteePlayerId: player1Id,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('cannot_request_self');
      }
    });

    it('should return error for non-existent division', async () => {
      const result = await playerService.createPartnerRequest({
        divisionId: 'non-existent',
        requesterPlayerId: player1Id,
        inviteePlayerId: player2Id,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('division_not_found');
      }
    });
  });

  describe('acceptPartnerRequest', () => {
    let player1Id: string;
    let player2Id: string;
    let user2Id: string;
    let doublesDivisionId: string;
    let requestId: string;

    beforeEach(async () => {
      // Create second user
      const user2 = await userService.register({
        email: 'partner@example.com',
        password: 'password123',
        name: 'Partner User',
      });
      user2Id = user2.data!.id;

      const player1 = await playerService.createPlayer(clubId, { name: 'Requester' });
      const player2 = await playerService.createPlayer(clubId, { name: 'Invitee' });
      await playerService.linkUserToPlayer(player1.data!.id, userId);
      await playerService.linkUserToPlayer(player2.data!.id, user2Id);
      player1Id = player1.data!.id;
      player2Id = player2.data!.id;

      const divResult = await competitionService.createDivision(competitionId, { name: 'Doubles Accept Test' });
      doublesDivisionId = divResult.data!.id;

      const requestResult = await playerService.createPartnerRequest({
        divisionId: doublesDivisionId,
        requesterPlayerId: player1Id,
        inviteePlayerId: player2Id,
      });
      requestId = requestResult.data!.id;
    });

    it('should accept partner request and create entry', async () => {
      const result = await playerService.acceptPartnerRequest(requestId, user2Id);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.entryType).toBe('doubles');
      expect(result.data!.status).toBe('pending');
    });

    it('should return error when not the invitee', async () => {
      const result = await playerService.acceptPartnerRequest(requestId, userId); // userId is requester, not invitee

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('not_authorized');
      }
    });

    it('should return error for non-existent request', async () => {
      const result = await playerService.acceptPartnerRequest('non-existent', user2Id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('partner_request_not_found');
      }
    });
  });

  describe('declinePartnerRequest', () => {
    let player1Id: string;
    let player2Id: string;
    let user2Id: string;
    let doublesDivisionId: string;
    let requestId: string;

    beforeEach(async () => {
      const user2 = await userService.register({
        email: 'decliner@example.com',
        password: 'password123',
        name: 'Decliner User',
      });
      user2Id = user2.data!.id;

      const player1 = await playerService.createPlayer(clubId, { name: 'Requester' });
      const player2 = await playerService.createPlayer(clubId, { name: 'Decliner' });
      await playerService.linkUserToPlayer(player1.data!.id, userId);
      await playerService.linkUserToPlayer(player2.data!.id, user2Id);
      player1Id = player1.data!.id;
      player2Id = player2.data!.id;

      const divResult = await competitionService.createDivision(competitionId, { name: 'Doubles Decline Test' });
      doublesDivisionId = divResult.data!.id;

      const requestResult = await playerService.createPartnerRequest({
        divisionId: doublesDivisionId,
        requesterPlayerId: player1Id,
        inviteePlayerId: player2Id,
      });
      requestId = requestResult.data!.id;
    });

    it('should decline partner request', async () => {
      const result = await playerService.declinePartnerRequest(requestId, user2Id);

      expect(result.success).toBe(true);

      const request = await playerService.getPartnerRequest(requestId);
      expect(request!.status).toBe('declined');
    });

    it('should return error when not the invitee', async () => {
      const result = await playerService.declinePartnerRequest(requestId, userId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('not_authorized');
      }
    });
  });

  // ==================== Dashboard Tests (Epic 4) ====================

  describe('getPlayerDashboard', () => {
    it('should return empty dashboard for user with no players', async () => {
      const newUser = await userService.register({
        email: 'noplayer2@example.com',
        password: 'password123',
        name: 'No Player User',
      });

      const dashboard = await playerService.getPlayerDashboard(newUser.data!.id);

      expect(dashboard.players).toHaveLength(0);
      expect(dashboard.registrations).toHaveLength(0);
      expect(dashboard.upcomingMatches).toHaveLength(0);
      expect(dashboard.recentResults).toHaveLength(0);
      expect(dashboard.partnerRequests).toHaveLength(0);
    });

    it('should return players linked to user', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Dashboard Player' });
      await playerService.linkUserToPlayer(player.data!.id, userId);

      const dashboard = await playerService.getPlayerDashboard(userId);

      expect(dashboard.players).toHaveLength(1);
      expect(dashboard.players[0].name).toBe('Dashboard Player');
    });

    it('should return registrations for user', async () => {
      const player = await playerService.createPlayer(clubId, { name: 'Dashboard Player' });
      await playerService.linkUserToPlayer(player.data!.id, userId);

      const db = getDatabase();
      db.prepare("UPDATE competitions SET registration_open = 1, status = 'published' WHERE id = ?").run(competitionId);

      await playerService.registerForCompetition(divisionId, userId, {
        entryType: 'singles',
        divisionId,
      });

      const dashboard = await playerService.getPlayerDashboard(userId);

      expect(dashboard.registrations.length).toBeGreaterThan(0);
      expect(dashboard.registrations[0].divisionName).toBeDefined();
      expect(dashboard.registrations[0].competitionName).toBeDefined();
    });
  });

  // ==================== Tenant Isolation Tests ====================

  describe('Tenant Isolation', () => {
    let otherClubId: string;
    let otherUserId: string;

    beforeEach(async () => {
      // Create another user and club
      const otherUser = await userService.register({
        email: 'other@example.com',
        password: 'password123',
        name: 'Other User',
      });
      otherUserId = otherUser.data!.id;

      const otherClub = await clubService.createClub({ name: 'Other Club' }, otherUserId);
      otherClubId = otherClub.data!.id;
    });

    it('should not return players from other clubs', async () => {
      await playerService.createPlayer(clubId, { name: 'Club 1 Player' });
      await playerService.createPlayer(otherClubId, { name: 'Club 2 Player' });

      const club1Players = await playerService.getClubPlayers(clubId);
      const club2Players = await playerService.getClubPlayers(otherClubId);

      expect(club1Players).toHaveLength(1);
      expect(club1Players[0].name).toBe('Club 1 Player');

      expect(club2Players).toHaveLength(1);
      expect(club2Players[0].name).toBe('Club 2 Player');
    });

    it('should not return teams from other clubs', async () => {
      const p1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const p2 = await playerService.createPlayer(clubId, { name: 'P2' });
      await playerService.createTeam(clubId, {
        player1Id: p1.data!.id,
        player2Id: p2.data!.id,
      });

      const p3 = await playerService.createPlayer(otherClubId, { name: 'P3' });
      const p4 = await playerService.createPlayer(otherClubId, { name: 'P4' });
      await playerService.createTeam(otherClubId, {
        player1Id: p3.data!.id,
        player2Id: p4.data!.id,
      });

      const club1Teams = await playerService.getClubTeams(clubId);
      const club2Teams = await playerService.getClubTeams(otherClubId);

      expect(club1Teams).toHaveLength(1);
      expect(club2Teams).toHaveLength(1);
    });

    it('should not create team with players from different clubs', async () => {
      const p1 = await playerService.createPlayer(clubId, { name: 'P1' });
      const p2 = await playerService.createPlayer(otherClubId, { name: 'P2' });

      const result = await playerService.createTeam(clubId, {
        player1Id: p1.data!.id,
        player2Id: p2.data!.id,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('player_not_found');
      }
    });
  });
});
