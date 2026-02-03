/**
 * Mock player service implementation using SQLite
 * For local development only
 */

import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { getDatabase } from '../db/database.js';
import type {
  PlayerService,
  Player,
  Team,
  Entry,
  CreatePlayerInput,
  UpdatePlayerInput,
  CreateTeamInput,
  UpdateTeamInput,
  CreateEntryInput,
  UpdateEntryInput,
  PlayerResult,
  EntryType,
  EntryStatus,
  PartnerRequest,
  PartnerRequestStatus,
  CreatePartnerRequestInput,
  SelfRegisterInput,
  EntryWithPlayer,
  EntryWithCompetition,
  PartnerRequestWithDetails,
  MatchWithDetails,
  PlayerDashboard,
} from './player-service.js';

interface DbPlayer {
  id: string;
  club_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  claim_token: string | null;
  claim_token_expires_at: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DbTeam {
  id: string;
  club_id: string;
  name: string;
  player1_id: string;
  player2_id: string;
  seed: number | null;
  rating: number | null;
  created_at: string;
  updated_at: string;
}

interface DbEntry {
  id: string;
  division_id: string;
  entry_type: EntryType;
  player_id: string | null;
  team_id: string | null;
  seed: number | null;
  status: EntryStatus;
  registered_by_user_id: string | null;
  registered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DbPartnerRequest {
  id: string;
  division_id: string;
  requester_player_id: string;
  invitee_player_id: string;
  status: PartnerRequestStatus;
  message: string | null;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
}

interface DbCompetition {
  id: string;
  club_id: string;
  name: string;
  status: string;
  registration_open: number;
  registration_deadline: string | null;
}

interface DbDivision {
  id: string;
  competition_id: string;
  name: string;
}

export class MockPlayerService implements PlayerService {
  // ==================== Players ====================

  async createPlayer(clubId: string, input: CreatePlayerInput): Promise<PlayerResult<Player>> {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date();

    try {
      const stmt = db.prepare(`
        INSERT INTO players (id, club_id, user_id, name, email, phone, created_at, updated_at)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        clubId,
        input.name,
        input.email || null,
        input.phone || null,
        now.toISOString(),
        now.toISOString()
      );

      const player = await this.getPlayer(id);
      return { success: true, data: player! };
    } catch (error) {
      console.error('Failed to create player:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create player' };
    }
  }

  async getPlayer(playerId: string): Promise<Player | null> {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM players WHERE id = ?')
      .get(playerId) as DbPlayer | undefined;

    return row ? this.mapRowToPlayer(row) : null;
  }

  async getClubPlayers(clubId: string, search?: string): Promise<Player[]> {
    const db = getDatabase();
    let query = 'SELECT * FROM players WHERE club_id = ?';
    const params: (string | undefined)[] = [clubId];

    if (search) {
      query += ' AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ?)';
      const searchPattern = `%${search.toLowerCase()}%`;
      params.push(searchPattern, searchPattern);
    }

    query += ' ORDER BY name';

    const rows = db.prepare(query).all(...params) as DbPlayer[];
    return rows.map((row) => this.mapRowToPlayer(row));
  }

  async updatePlayer(playerId: string, input: UpdatePlayerInput): Promise<PlayerResult<Player>> {
    const existing = await this.getPlayer(playerId);
    if (!existing) {
      return { success: false, error: 'player_not_found', message: 'Player not found' };
    }

    const db = getDatabase();
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.email !== undefined) {
      updates.push('email = ?');
      values.push(input.email);
    }
    if (input.phone !== undefined) {
      updates.push('phone = ?');
      values.push(input.phone);
    }

    if (updates.length === 0) {
      return { success: true, data: existing };
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(playerId);

    try {
      db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      // Log audit for important changes
      if (input.name !== undefined || input.email !== undefined) {
        await this.logAudit(
          existing.clubId,
          null,
          'update_player',
          'player',
          playerId,
          { name: existing.name, email: existing.email },
          { name: input.name ?? existing.name, email: input.email ?? existing.email }
        );
      }

      const updated = await this.getPlayer(playerId);
      return { success: true, data: updated! };
    } catch (error) {
      console.error('Failed to update player:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to update player' };
    }
  }

  async deletePlayer(playerId: string): Promise<PlayerResult<void>> {
    const existing = await this.getPlayer(playerId);
    if (!existing) {
      return { success: false, error: 'player_not_found', message: 'Player not found' };
    }

    const db = getDatabase();

    try {
      // Check if player is in any entries (singles)
      const singlesCount = db
        .prepare('SELECT COUNT(*) as count FROM entries WHERE player_id = ?')
        .get(playerId) as { count: number };

      if (singlesCount.count > 0) {
        return {
          success: false,
          error: 'operation_failed',
          message: 'Cannot delete player that is registered in competitions',
        };
      }

      // Check if player is in any teams
      const teamsCount = db
        .prepare('SELECT COUNT(*) as count FROM teams WHERE player1_id = ? OR player2_id = ?')
        .get(playerId, playerId) as { count: number };

      if (teamsCount.count > 0) {
        return {
          success: false,
          error: 'operation_failed',
          message: 'Cannot delete player that is part of a team',
        };
      }

      db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to delete player:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to delete player' };
    }
  }

  async findDuplicates(clubId: string, name: string, email?: string): Promise<Player[]> {
    const db = getDatabase();
    let query = 'SELECT * FROM players WHERE club_id = ? AND (LOWER(name) = LOWER(?)';
    const params: string[] = [clubId, name];

    if (email) {
      query += ' OR LOWER(email) = LOWER(?)';
      params.push(email);
    }

    query += ')';

    const rows = db.prepare(query).all(...params) as DbPlayer[];
    return rows.map((row) => this.mapRowToPlayer(row));
  }

  async linkUserToPlayer(playerId: string, userId: string): Promise<PlayerResult<Player>> {
    const existing = await this.getPlayer(playerId);
    if (!existing) {
      return { success: false, error: 'player_not_found', message: 'Player not found' };
    }

    const db = getDatabase();
    const now = new Date();

    try {
      db.prepare('UPDATE players SET user_id = ?, updated_at = ? WHERE id = ?').run(
        userId,
        now.toISOString(),
        playerId
      );

      const updated = await this.getPlayer(playerId);
      return { success: true, data: updated! };
    } catch (error) {
      console.error('Failed to link user to player:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to link user to player' };
    }
  }

  // ==================== Teams ====================

  async createTeam(clubId: string, input: CreateTeamInput): Promise<PlayerResult<Team>> {
    // Validate players exist and belong to the same club
    const player1 = await this.getPlayer(input.player1Id);
    if (!player1 || player1.clubId !== clubId) {
      return { success: false, error: 'player_not_found', message: 'Player 1 not found in club' };
    }

    const player2 = await this.getPlayer(input.player2Id);
    if (!player2 || player2.clubId !== clubId) {
      return { success: false, error: 'player_not_found', message: 'Player 2 not found in club' };
    }

    if (input.player1Id === input.player2Id) {
      return { success: false, error: 'same_player_in_team', message: 'Cannot create team with the same player twice' };
    }

    const db = getDatabase();
    const id = uuidv4();
    const now = new Date();

    // Auto-generate team name if not provided
    const teamName = input.name || `${player1.name} / ${player2.name}`;

    try {
      const stmt = db.prepare(`
        INSERT INTO teams (id, club_id, name, player1_id, player2_id, seed, rating, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        clubId,
        teamName,
        input.player1Id,
        input.player2Id,
        input.seed ?? null,
        input.rating ?? null,
        now.toISOString(),
        now.toISOString()
      );

      const team = await this.getTeam(id);
      return { success: true, data: team! };
    } catch (error) {
      console.error('Failed to create team:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create team' };
    }
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM teams WHERE id = ?')
      .get(teamId) as DbTeam | undefined;

    return row ? this.mapRowToTeam(row) : null;
  }

  async getClubTeams(clubId: string): Promise<Team[]> {
    const db = getDatabase();
    const rows = db
      .prepare('SELECT * FROM teams WHERE club_id = ? ORDER BY name')
      .all(clubId) as DbTeam[];

    return rows.map((row) => this.mapRowToTeam(row));
  }

  async updateTeam(teamId: string, input: UpdateTeamInput): Promise<PlayerResult<Team>> {
    const existing = await this.getTeam(teamId);
    if (!existing) {
      return { success: false, error: 'team_not_found', message: 'Team not found' };
    }

    const db = getDatabase();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.seed !== undefined) {
      updates.push('seed = ?');
      values.push(input.seed);
    }
    if (input.rating !== undefined) {
      updates.push('rating = ?');
      values.push(input.rating);
    }

    if (updates.length === 0) {
      return { success: true, data: existing };
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(teamId);

    try {
      db.prepare(`UPDATE teams SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      const updated = await this.getTeam(teamId);
      return { success: true, data: updated! };
    } catch (error) {
      console.error('Failed to update team:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to update team' };
    }
  }

  async deleteTeam(teamId: string): Promise<PlayerResult<void>> {
    const existing = await this.getTeam(teamId);
    if (!existing) {
      return { success: false, error: 'team_not_found', message: 'Team not found' };
    }

    const db = getDatabase();

    try {
      // Check if team is in any entries
      const entriesCount = db
        .prepare('SELECT COUNT(*) as count FROM entries WHERE team_id = ?')
        .get(teamId) as { count: number };

      if (entriesCount.count > 0) {
        return {
          success: false,
          error: 'operation_failed',
          message: 'Cannot delete team that is registered in competitions',
        };
      }

      db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);
      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to delete team:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to delete team' };
    }
  }

  // ==================== Entries ====================

  async createEntry(divisionId: string, input: CreateEntryInput): Promise<PlayerResult<Entry>> {
    const db = getDatabase();

    // Validate division exists
    const division = db
      .prepare('SELECT id FROM divisions WHERE id = ?')
      .get(divisionId) as { id: string } | undefined;

    if (!division) {
      return { success: false, error: 'division_not_found', message: 'Division not found' };
    }

    // Validate entry type and required fields
    if (input.entryType === 'singles') {
      if (!input.playerId) {
        return { success: false, error: 'invalid_entry_type', message: 'Singles entry requires playerId' };
      }

      // Check player exists
      const player = await this.getPlayer(input.playerId);
      if (!player) {
        return { success: false, error: 'player_not_found', message: 'Player not found' };
      }

      // Check player not already in division
      const existingEntry = await this.checkPlayerInDivision(divisionId, input.playerId);
      if (existingEntry) {
        return { success: false, error: 'player_already_in_division', message: 'Player already entered in this division' };
      }
    } else if (input.entryType === 'doubles') {
      if (!input.teamId) {
        return { success: false, error: 'invalid_entry_type', message: 'Doubles entry requires teamId' };
      }

      // Check team exists
      const team = await this.getTeam(input.teamId);
      if (!team) {
        return { success: false, error: 'team_not_found', message: 'Team not found' };
      }

      // Check team not already in division
      const existingTeamEntry = db
        .prepare('SELECT id FROM entries WHERE division_id = ? AND team_id = ?')
        .get(divisionId, input.teamId) as { id: string } | undefined;

      if (existingTeamEntry) {
        return { success: false, error: 'team_already_in_division', message: 'Team already entered in this division' };
      }

      // Check team players not in other teams in same division
      const conflictingEntry = db
        .prepare(`
          SELECT e.id FROM entries e
          JOIN teams t ON e.team_id = t.id
          WHERE e.division_id = ?
            AND e.entry_type = 'doubles'
            AND (t.player1_id = ? OR t.player2_id = ? OR t.player1_id = ? OR t.player2_id = ?)
        `)
        .get(divisionId, team.player1Id, team.player1Id, team.player2Id, team.player2Id) as { id: string } | undefined;

      if (conflictingEntry) {
        return {
          success: false,
          error: 'player_already_in_division',
          message: 'One or both team players are already in another team in this division',
        };
      }
    } else {
      return { success: false, error: 'invalid_entry_type', message: 'Invalid entry type' };
    }

    const id = uuidv4();
    const now = new Date();

    try {
      const stmt = db.prepare(`
        INSERT INTO entries (id, division_id, entry_type, player_id, team_id, seed, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?)
      `);

      stmt.run(
        id,
        divisionId,
        input.entryType,
        input.entryType === 'singles' ? input.playerId : null,
        input.entryType === 'doubles' ? input.teamId : null,
        input.seed ?? null,
        now.toISOString(),
        now.toISOString()
      );

      const entry = await this.getEntry(id);
      return { success: true, data: entry! };
    } catch (error: any) {
      console.error('Failed to create entry:', error);
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return { success: false, error: 'duplicate_entry', message: 'Entry already exists' };
      }
      return { success: false, error: 'operation_failed', message: 'Failed to create entry' };
    }
  }

  async getEntry(entryId: string): Promise<Entry | null> {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM entries WHERE id = ?')
      .get(entryId) as DbEntry | undefined;

    return row ? this.mapRowToEntry(row) : null;
  }

  async getDivisionEntries(divisionId: string): Promise<EntryWithPlayer[]> {
    const db = getDatabase();
    const rows = db
      .prepare(`
        SELECT e.*,
               p.name as player_name, p.email as player_email, p.phone as player_phone,
               t.name as team_name, t.player1_id as team_player1_id, t.player2_id as team_player2_id,
               p1.name as team_player1_name, p2.name as team_player2_name
        FROM entries e
        LEFT JOIN players p ON e.player_id = p.id
        LEFT JOIN teams t ON e.team_id = t.id
        LEFT JOIN players p1 ON t.player1_id = p1.id
        LEFT JOIN players p2 ON t.player2_id = p2.id
        WHERE e.division_id = ?
        ORDER BY e.seed NULLS LAST, e.created_at
      `)
      .all(divisionId) as (DbEntry & {
        player_name: string | null;
        player_email: string | null;
        player_phone: string | null;
        team_name: string | null;
        team_player1_id: string | null;
        team_player2_id: string | null;
        team_player1_name: string | null;
        team_player2_name: string | null;
      })[];

    return rows.map((row) => ({
      ...this.mapRowToEntry(row),
      player: row.player_id
        ? {
            id: row.player_id,
            clubId: '',
            userId: null,
            name: row.player_name || 'Unknown',
            email: row.player_email,
            phone: row.player_phone,
            claimToken: null,
            claimTokenExpiresAt: null,
            claimedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : undefined,
      team: row.team_id
        ? {
            id: row.team_id,
            clubId: '',
            name: row.team_name || `${row.team_player1_name || 'Unknown'} / ${row.team_player2_name || 'Unknown'}`,
            player1Id: row.team_player1_id || '',
            player2Id: row.team_player2_id || '',
            player1: row.team_player1_id ? { id: row.team_player1_id, clubId: '', userId: null, name: row.team_player1_name || 'Unknown', email: null, phone: null, claimToken: null, claimTokenExpiresAt: null, claimedAt: null, createdAt: new Date(), updatedAt: new Date() } : undefined,
            player2: row.team_player2_id ? { id: row.team_player2_id, clubId: '', userId: null, name: row.team_player2_name || 'Unknown', email: null, phone: null, claimToken: null, claimTokenExpiresAt: null, claimedAt: null, createdAt: new Date(), updatedAt: new Date() } : undefined,
            seed: null,
            rating: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : undefined,
    }));
  }

  async updateEntry(entryId: string, input: UpdateEntryInput): Promise<PlayerResult<Entry>> {
    const existing = await this.getEntry(entryId);
    if (!existing) {
      return { success: false, error: 'entry_not_found', message: 'Entry not found' };
    }

    const db = getDatabase();
    const updates: string[] = [];
    const values: (number | null | string)[] = [];

    if (input.seed !== undefined) {
      updates.push('seed = ?');
      values.push(input.seed);
    }

    if (updates.length === 0) {
      return { success: true, data: existing };
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(entryId);

    try {
      db.prepare(`UPDATE entries SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      const updated = await this.getEntry(entryId);
      return { success: true, data: updated! };
    } catch (error) {
      console.error('Failed to update entry:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to update entry' };
    }
  }

  async deleteEntry(entryId: string): Promise<PlayerResult<void>> {
    const existing = await this.getEntry(entryId);
    if (!existing) {
      return { success: false, error: 'entry_not_found', message: 'Entry not found' };
    }

    const db = getDatabase();

    try {
      db.prepare('DELETE FROM entries WHERE id = ?').run(entryId);
      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to delete entry:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to delete entry' };
    }
  }

  async checkPlayerInDivision(divisionId: string, playerId: string): Promise<boolean> {
    const db = getDatabase();

    // Check direct singles entry
    const singlesEntry = db
      .prepare('SELECT id FROM entries WHERE division_id = ? AND player_id = ?')
      .get(divisionId, playerId) as { id: string } | undefined;

    if (singlesEntry) {
      return true;
    }

    // Check if player is part of a team entry
    const doublesEntry = db
      .prepare(`
        SELECT e.id FROM entries e
        JOIN teams t ON e.team_id = t.id
        WHERE e.division_id = ?
          AND (t.player1_id = ? OR t.player2_id = ?)
      `)
      .get(divisionId, playerId, playerId) as { id: string } | undefined;

    return !!doublesEntry;
  }

  // ==================== Private Helpers ====================

  private async logAudit(
    clubId: string | null,
    userId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    oldValues: Record<string, unknown> | null,
    newValues: Record<string, unknown> | null
  ): Promise<void> {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date();

    db.prepare(`
      INSERT INTO audit_log (id, club_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      clubId,
      userId,
      action,
      entityType,
      entityId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      now.toISOString()
    );
  }

  private mapRowToPlayer(row: DbPlayer): Player {
    return {
      id: row.id,
      clubId: row.club_id,
      userId: row.user_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      claimToken: row.claim_token,
      claimTokenExpiresAt: row.claim_token_expires_at ? new Date(row.claim_token_expires_at) : null,
      claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToTeam(row: DbTeam): Team {
    return {
      id: row.id,
      clubId: row.club_id,
      name: row.name,
      player1Id: row.player1_id,
      player2Id: row.player2_id,
      seed: row.seed,
      rating: row.rating,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToEntry(row: DbEntry): Entry {
    return {
      id: row.id,
      divisionId: row.division_id,
      entryType: row.entry_type,
      playerId: row.player_id,
      teamId: row.team_id,
      seed: row.seed,
      status: row.status || 'approved',
      registeredByUserId: row.registered_by_user_id,
      registeredAt: row.registered_at ? new Date(row.registered_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToPartnerRequest(row: DbPartnerRequest): PartnerRequest {
    return {
      id: row.id,
      divisionId: row.division_id,
      requesterPlayerId: row.requester_player_id,
      inviteePlayerId: row.invitee_player_id,
      status: row.status,
      message: row.message,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      respondedAt: row.responded_at ? new Date(row.responded_at) : null,
    };
  }

  // ==================== Profile Claiming (Epic 4) ====================

  async generateClaimToken(playerId: string): Promise<PlayerResult<{ token: string; expiresAt: Date }>> {
    const player = await this.getPlayer(playerId);
    if (!player) {
      return { success: false, error: 'player_not_found', message: 'Player not found' };
    }

    if (player.userId) {
      return { success: false, error: 'profile_already_claimed', message: 'Profile is already linked to a user' };
    }

    const db = getDatabase();
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const now = new Date();

    try {
      db.prepare(`
        UPDATE players SET claim_token = ?, claim_token_expires_at = ?, updated_at = ?
        WHERE id = ?
      `).run(token, expiresAt.toISOString(), now.toISOString(), playerId);

      return { success: true, data: { token, expiresAt } };
    } catch (error) {
      console.error('Failed to generate claim token:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to generate claim token' };
    }
  }

  async claimProfile(token: string, userId: string, userEmail: string): Promise<PlayerResult<Player>> {
    const db = getDatabase();

    // Find player with this token
    const row = db.prepare(`
      SELECT * FROM players WHERE claim_token = ?
    `).get(token) as DbPlayer | undefined;

    if (!row) {
      return { success: false, error: 'invalid_claim_token', message: 'Invalid claim token' };
    }

    const player = this.mapRowToPlayer(row);

    // Check if already claimed
    if (player.userId) {
      return { success: false, error: 'profile_already_claimed', message: 'Profile is already claimed' };
    }

    // Check token expiry
    if (player.claimTokenExpiresAt && player.claimTokenExpiresAt < new Date()) {
      return { success: false, error: 'claim_token_expired', message: 'Claim token has expired' };
    }

    // Check email match (if player has email)
    if (player.email && player.email.toLowerCase() !== userEmail.toLowerCase()) {
      return { success: false, error: 'email_mismatch', message: 'Your email does not match the player profile email' };
    }

    const now = new Date();

    try {
      db.prepare(`
        UPDATE players
        SET user_id = ?, claim_token = NULL, claim_token_expires_at = NULL, claimed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(userId, now.toISOString(), now.toISOString(), player.id);

      const updated = await this.getPlayer(player.id);
      return { success: true, data: updated! };
    } catch (error) {
      console.error('Failed to claim profile:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to claim profile' };
    }
  }

  async getPlayersByUser(userId: string): Promise<Player[]> {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM players WHERE user_id = ? ORDER BY name
    `).all(userId) as DbPlayer[];

    return rows.map(row => this.mapRowToPlayer(row));
  }

  // ==================== Self-Registration (Epic 4) ====================

  async registerForCompetition(
    divisionId: string,
    userId: string,
    input: SelfRegisterInput
  ): Promise<PlayerResult<Entry>> {
    const db = getDatabase();

    // Get division and competition info
    const division = db.prepare(`
      SELECT d.*, c.club_id, c.status as comp_status, c.registration_open, c.registration_deadline
      FROM divisions d
      JOIN competitions c ON d.competition_id = c.id
      WHERE d.id = ?
    `).get(divisionId) as (DbDivision & { club_id: string; comp_status: string; registration_open: number; registration_deadline: string | null }) | undefined;

    if (!division) {
      return { success: false, error: 'division_not_found', message: 'Division not found' };
    }

    // Check competition is published and registration is open
    if (division.comp_status !== 'published' && division.comp_status !== 'in_progress') {
      return { success: false, error: 'registration_closed', message: 'Competition is not open for registration' };
    }

    if (!division.registration_open) {
      return { success: false, error: 'registration_closed', message: 'Registration is not open for this competition' };
    }

    // Check deadline
    if (division.registration_deadline && new Date(division.registration_deadline) < new Date()) {
      return { success: false, error: 'registration_deadline_passed', message: 'Registration deadline has passed' };
    }

    // Get user's player profile for this club
    const userPlayer = db.prepare(`
      SELECT * FROM players WHERE user_id = ? AND club_id = ?
    `).get(userId, division.club_id) as DbPlayer | undefined;

    if (!userPlayer) {
      return { success: false, error: 'player_not_found', message: 'You need a player profile in this club to register' };
    }

    // Check not already registered
    const existingEntry = await this.checkPlayerInDivision(divisionId, userPlayer.id);
    if (existingEntry) {
      return { success: false, error: 'already_registered', message: 'You are already registered in this division' };
    }

    const id = uuidv4();
    const now = new Date();

    try {
      db.prepare(`
        INSERT INTO entries (id, division_id, entry_type, player_id, team_id, seed, status, registered_by_user_id, registered_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, NULL, 'pending', ?, ?, ?, ?)
      `).run(id, divisionId, 'singles', userPlayer.id, userId, now.toISOString(), now.toISOString(), now.toISOString());

      const entry = await this.getEntry(id);
      return { success: true, data: entry! };
    } catch (error) {
      console.error('Failed to register for competition:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to register for competition' };
    }
  }

  async getPendingRegistrations(competitionId: string): Promise<EntryWithPlayer[]> {
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT e.*, p.name as player_name, p.email as player_email, p.club_id as player_club_id
      FROM entries e
      JOIN divisions d ON e.division_id = d.id
      LEFT JOIN players p ON e.player_id = p.id
      WHERE d.competition_id = ? AND e.status = 'pending'
      ORDER BY e.created_at
    `).all(competitionId) as (DbEntry & { player_name: string; player_email: string | null; player_club_id: string })[];

    return rows.map(row => ({
      ...this.mapRowToEntry(row),
      player: row.player_id ? {
        id: row.player_id,
        clubId: row.player_club_id,
        userId: null,
        name: row.player_name,
        email: row.player_email,
        phone: null,
        claimToken: null,
        claimTokenExpiresAt: null,
        claimedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } : undefined,
    }));
  }

  async approveRegistration(entryId: string): Promise<PlayerResult<Entry>> {
    const entry = await this.getEntry(entryId);
    if (!entry) {
      return { success: false, error: 'entry_not_found', message: 'Entry not found' };
    }

    if (entry.status !== 'pending') {
      return { success: false, error: 'entry_not_pending', message: 'Entry is not pending approval' };
    }

    const db = getDatabase();
    const now = new Date();

    try {
      db.prepare(`
        UPDATE entries SET status = 'approved', updated_at = ? WHERE id = ?
      `).run(now.toISOString(), entryId);

      const updated = await this.getEntry(entryId);
      return { success: true, data: updated! };
    } catch (error) {
      console.error('Failed to approve registration:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to approve registration' };
    }
  }

  async rejectRegistration(entryId: string, _reason?: string): Promise<PlayerResult<Entry>> {
    const entry = await this.getEntry(entryId);
    if (!entry) {
      return { success: false, error: 'entry_not_found', message: 'Entry not found' };
    }

    if (entry.status !== 'pending') {
      return { success: false, error: 'entry_not_pending', message: 'Entry is not pending approval' };
    }

    const db = getDatabase();
    const now = new Date();

    try {
      db.prepare(`
        UPDATE entries SET status = 'rejected', updated_at = ? WHERE id = ?
      `).run(now.toISOString(), entryId);

      const updated = await this.getEntry(entryId);
      return { success: true, data: updated! };
    } catch (error) {
      console.error('Failed to reject registration:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to reject registration' };
    }
  }

  async withdrawRegistration(entryId: string, userId: string): Promise<PlayerResult<void>> {
    const entry = await this.getEntry(entryId);
    if (!entry) {
      return { success: false, error: 'entry_not_found', message: 'Entry not found' };
    }

    // Check user owns this registration
    if (entry.registeredByUserId !== userId) {
      return { success: false, error: 'not_authorized', message: 'You can only withdraw your own registration' };
    }

    if (entry.status === 'withdrawn') {
      return { success: true, data: undefined };
    }

    const db = getDatabase();
    const now = new Date();

    try {
      db.prepare(`
        UPDATE entries SET status = 'withdrawn', updated_at = ? WHERE id = ?
      `).run(now.toISOString(), entryId);

      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to withdraw registration:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to withdraw registration' };
    }
  }

  // ==================== Partner Requests (Epic 4) ====================

  async createPartnerRequest(input: CreatePartnerRequestInput): Promise<PlayerResult<PartnerRequest>> {
    if (input.requesterPlayerId === input.inviteePlayerId) {
      return { success: false, error: 'cannot_request_self', message: 'Cannot send partner request to yourself' };
    }

    const db = getDatabase();

    // Verify division exists
    const division = db.prepare('SELECT id FROM divisions WHERE id = ?').get(input.divisionId);
    if (!division) {
      return { success: false, error: 'division_not_found', message: 'Division not found' };
    }

    // Verify both players exist
    const requester = await this.getPlayer(input.requesterPlayerId);
    if (!requester) {
      return { success: false, error: 'player_not_found', message: 'Requester player not found' };
    }

    const invitee = await this.getPlayer(input.inviteePlayerId);
    if (!invitee) {
      return { success: false, error: 'player_not_found', message: 'Invitee player not found' };
    }

    const id = uuidv4();
    const now = new Date();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    try {
      db.prepare(`
        INSERT INTO partner_requests (id, division_id, requester_player_id, invitee_player_id, status, message, created_at, expires_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
      `).run(id, input.divisionId, input.requesterPlayerId, input.inviteePlayerId, input.message || null, now.toISOString(), expiresAt.toISOString());

      const request = await this.getPartnerRequest(id);
      return { success: true, data: request! };
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return { success: false, error: 'operation_failed', message: 'Partner request already exists' };
      }
      console.error('Failed to create partner request:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create partner request' };
    }
  }

  async getPartnerRequest(requestId: string): Promise<PartnerRequest | null> {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM partner_requests WHERE id = ?').get(requestId) as DbPartnerRequest | undefined;
    return row ? this.mapRowToPartnerRequest(row) : null;
  }

  async getPartnerRequestsForPlayer(playerId: string): Promise<PartnerRequest[]> {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM partner_requests
      WHERE (requester_player_id = ? OR invitee_player_id = ?)
      ORDER BY created_at DESC
    `).all(playerId, playerId) as DbPartnerRequest[];

    return rows.map(row => this.mapRowToPartnerRequest(row));
  }

  async getPartnerRequestsForUser(userId: string): Promise<PartnerRequestWithDetails[]> {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT pr.*,
             rp.name as requester_name, rp.email as requester_email, rp.club_id as requester_club_id,
             ip.name as invitee_name, ip.email as invitee_email, ip.club_id as invitee_club_id,
             d.name as division_name, c.name as competition_name
      FROM partner_requests pr
      JOIN players rp ON pr.requester_player_id = rp.id
      JOIN players ip ON pr.invitee_player_id = ip.id
      JOIN divisions d ON pr.division_id = d.id
      JOIN competitions c ON d.competition_id = c.id
      WHERE (rp.user_id = ? OR ip.user_id = ?) AND pr.status = 'pending'
      ORDER BY pr.created_at DESC
    `).all(userId, userId) as (DbPartnerRequest & {
      requester_name: string; requester_email: string | null; requester_club_id: string;
      invitee_name: string; invitee_email: string | null; invitee_club_id: string;
      division_name: string; competition_name: string;
    })[];

    return rows.map(row => ({
      ...this.mapRowToPartnerRequest(row),
      requesterPlayer: {
        id: row.requester_player_id,
        clubId: row.requester_club_id,
        userId: null,
        name: row.requester_name,
        email: row.requester_email,
        phone: null,
        claimToken: null,
        claimTokenExpiresAt: null,
        claimedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      inviteePlayer: {
        id: row.invitee_player_id,
        clubId: row.invitee_club_id,
        userId: null,
        name: row.invitee_name,
        email: row.invitee_email,
        phone: null,
        claimToken: null,
        claimTokenExpiresAt: null,
        claimedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      divisionName: row.division_name,
      competitionName: row.competition_name,
    }));
  }

  async acceptPartnerRequest(requestId: string, userId: string): Promise<PlayerResult<Entry>> {
    const request = await this.getPartnerRequest(requestId);
    if (!request) {
      return { success: false, error: 'partner_request_not_found', message: 'Partner request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: 'partner_request_already_responded', message: 'Partner request has already been responded to' };
    }

    if (request.expiresAt < new Date()) {
      return { success: false, error: 'partner_request_expired', message: 'Partner request has expired' };
    }

    const db = getDatabase();

    // Verify the user is the invitee
    const inviteePlayer = await this.getPlayer(request.inviteePlayerId);
    if (!inviteePlayer || inviteePlayer.userId !== userId) {
      return { success: false, error: 'not_authorized', message: 'Only the invitee can accept this request' };
    }

    const requesterPlayer = await this.getPlayer(request.requesterPlayerId);
    if (!requesterPlayer) {
      return { success: false, error: 'player_not_found', message: 'Requester player not found' };
    }

    const now = new Date();

    try {
      // Update request status
      db.prepare(`
        UPDATE partner_requests SET status = 'accepted', responded_at = ? WHERE id = ?
      `).run(now.toISOString(), requestId);

      // Create team
      const teamId = uuidv4();
      const teamName = `${requesterPlayer.name} / ${inviteePlayer.name}`;

      db.prepare(`
        INSERT INTO teams (id, club_id, name, player1_id, player2_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(teamId, requesterPlayer.clubId, teamName, requesterPlayer.id, inviteePlayer.id, now.toISOString(), now.toISOString());

      // Create entry with pending status
      const entryId = uuidv4();
      db.prepare(`
        INSERT INTO entries (id, division_id, entry_type, player_id, team_id, seed, status, registered_by_user_id, registered_at, created_at, updated_at)
        VALUES (?, ?, 'doubles', NULL, ?, NULL, 'pending', ?, ?, ?, ?)
      `).run(entryId, request.divisionId, teamId, userId, now.toISOString(), now.toISOString(), now.toISOString());

      const entry = await this.getEntry(entryId);
      return { success: true, data: entry! };
    } catch (error) {
      console.error('Failed to accept partner request:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to accept partner request' };
    }
  }

  async declinePartnerRequest(requestId: string, userId: string): Promise<PlayerResult<void>> {
    const request = await this.getPartnerRequest(requestId);
    if (!request) {
      return { success: false, error: 'partner_request_not_found', message: 'Partner request not found' };
    }

    if (request.status !== 'pending') {
      return { success: false, error: 'partner_request_already_responded', message: 'Partner request has already been responded to' };
    }

    // Verify the user is the invitee
    const inviteePlayer = await this.getPlayer(request.inviteePlayerId);
    if (!inviteePlayer || inviteePlayer.userId !== userId) {
      return { success: false, error: 'not_authorized', message: 'Only the invitee can decline this request' };
    }

    const db = getDatabase();
    const now = new Date();

    try {
      db.prepare(`
        UPDATE partner_requests SET status = 'declined', responded_at = ? WHERE id = ?
      `).run(now.toISOString(), requestId);

      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to decline partner request:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to decline partner request' };
    }
  }

  // ==================== Dashboard (Epic 4) ====================

  async getPlayerDashboard(userId: string): Promise<PlayerDashboard> {
    const db = getDatabase();

    // Get user's player profiles
    const players = await this.getPlayersByUser(userId);

    // Get registrations
    const registrations: EntryWithCompetition[] = [];
    for (const player of players) {
      const entries = db.prepare(`
        SELECT e.*, d.name as division_name, c.name as competition_name, c.id as competition_id, c.club_id
        FROM entries e
        JOIN divisions d ON e.division_id = d.id
        JOIN competitions c ON d.competition_id = c.id
        WHERE e.player_id = ? OR e.team_id IN (
          SELECT id FROM teams WHERE player1_id = ? OR player2_id = ?
        )
      `).all(player.id, player.id, player.id) as (DbEntry & {
        division_name: string;
        competition_name: string;
        competition_id: string;
        club_id: string;
      })[];

      for (const entry of entries) {
        registrations.push({
          ...this.mapRowToEntry(entry),
          divisionName: entry.division_name,
          competitionName: entry.competition_name,
          competitionId: entry.competition_id,
          clubId: entry.club_id,
        });
      }
    }

    // Get upcoming matches
    const upcomingMatches: MatchWithDetails[] = [];
    const playerIds = players.map(p => p.id);
    if (playerIds.length > 0) {
      const placeholders = playerIds.map(() => '?').join(',');
      const matchRows = db.prepare(`
        SELECT m.*, d.name as division_name, c.name as competition_name,
               p1.name as entry1_name, p2.name as entry2_name
        FROM matches m
        JOIN draws dr ON m.draw_id = dr.id
        JOIN divisions d ON dr.division_id = d.id
        JOIN competitions c ON d.competition_id = c.id
        LEFT JOIN entries e1 ON m.entry1_id = e1.id
        LEFT JOIN entries e2 ON m.entry2_id = e2.id
        LEFT JOIN players p1 ON e1.player_id = p1.id
        LEFT JOIN players p2 ON e2.player_id = p2.id
        WHERE m.status IN ('pending', 'scheduled')
          AND m.scheduled_time IS NOT NULL
          AND m.scheduled_time > datetime('now')
          AND (e1.player_id IN (${placeholders}) OR e2.player_id IN (${placeholders}))
        ORDER BY m.scheduled_time ASC
        LIMIT 10
      `).all(...playerIds, ...playerIds) as any[];

      for (const row of matchRows) {
        upcomingMatches.push({
          id: row.id,
          drawId: row.draw_id,
          roundNumber: row.round_number,
          matchNumber: row.match_number,
          entry1Id: row.entry1_id,
          entry2Id: row.entry2_id,
          entry1Name: row.entry1_name,
          entry2Name: row.entry2_name,
          winnerEntryId: row.winner_entry_id,
          score: row.score ? JSON.parse(row.score) : null,
          status: row.status,
          scheduledTime: row.scheduled_time ? new Date(row.scheduled_time) : null,
          court: row.court,
          divisionName: row.division_name,
          competitionName: row.competition_name,
        });
      }
    }

    // Get recent results
    const recentResults: MatchWithDetails[] = [];
    if (playerIds.length > 0) {
      const placeholders = playerIds.map(() => '?').join(',');
      const resultRows = db.prepare(`
        SELECT m.*, d.name as division_name, c.name as competition_name,
               p1.name as entry1_name, p2.name as entry2_name
        FROM matches m
        JOIN draws dr ON m.draw_id = dr.id
        JOIN divisions d ON dr.division_id = d.id
        JOIN competitions c ON d.competition_id = c.id
        LEFT JOIN entries e1 ON m.entry1_id = e1.id
        LEFT JOIN entries e2 ON m.entry2_id = e2.id
        LEFT JOIN players p1 ON e1.player_id = p1.id
        LEFT JOIN players p2 ON e2.player_id = p2.id
        WHERE m.status IN ('completed', 'walkover', 'retired')
          AND (e1.player_id IN (${placeholders}) OR e2.player_id IN (${placeholders}))
        ORDER BY m.updated_at DESC
        LIMIT 10
      `).all(...playerIds, ...playerIds) as any[];

      for (const row of resultRows) {
        recentResults.push({
          id: row.id,
          drawId: row.draw_id,
          roundNumber: row.round_number,
          matchNumber: row.match_number,
          entry1Id: row.entry1_id,
          entry2Id: row.entry2_id,
          entry1Name: row.entry1_name,
          entry2Name: row.entry2_name,
          winnerEntryId: row.winner_entry_id,
          score: row.score ? JSON.parse(row.score) : null,
          status: row.status,
          scheduledTime: row.scheduled_time ? new Date(row.scheduled_time) : null,
          court: row.court,
          divisionName: row.division_name,
          competitionName: row.competition_name,
        });
      }
    }

    // Get partner requests
    const partnerRequests = await this.getPartnerRequestsForUser(userId);

    return {
      players,
      registrations,
      upcomingMatches,
      recentResults,
      partnerRequests,
    };
  }
}
