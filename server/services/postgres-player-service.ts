/**
 * PostgreSQL player service implementation
 * For local development with Docker PostgreSQL
 */

import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { getPool } from '../db/postgres.js';
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
  BulkCreateEntriesResult,
} from './player-service.js';

interface DbPlayer {
  id: string;
  club_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  claim_token: string | null;
  claim_token_expires_at: Date | null;
  claimed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface DbTeam {
  id: string;
  club_id: string;
  name: string;
  player1_id: string;
  player2_id: string;
  seed: number | null;
  rating: number | null;
  created_at: Date;
  updated_at: Date;
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
  registered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface DbPartnerRequest {
  id: string;
  division_id: string;
  requester_player_id: string;
  invitee_player_id: string;
  status: PartnerRequestStatus;
  message: string | null;
  created_at: Date;
  expires_at: Date;
  responded_at: Date | null;
}

interface DbCompetition {
  id: string;
  club_id: string;
  name: string;
  registration_open: boolean;
  registration_deadline: Date | null;
}

interface DbDivision {
  id: string;
  competition_id: string;
  name: string;
}

export class PostgresPlayerService implements PlayerService {
  // ==================== Players ====================

  async createPlayer(clubId: string, input: CreatePlayerInput): Promise<PlayerResult<Player>> {
    const pool = getPool();
    const id = uuidv4();

    try {
      const result = await pool.query<DbPlayer>(
        `INSERT INTO players (id, club_id, user_id, name, email, phone)
         VALUES ($1, $2, NULL, $3, $4, $5)
         RETURNING *`,
        [id, clubId, input.name, input.email || null, input.phone || null]
      );

      return { success: true, data: this.mapRowToPlayer(result.rows[0]) };
    } catch (error) {
      console.error('Failed to create player:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create player' };
    }
  }

  async getPlayer(playerId: string): Promise<Player | null> {
    const pool = getPool();
    const result = await pool.query<DbPlayer>(
      'SELECT * FROM players WHERE id = $1',
      [playerId]
    );
    return result.rows.length > 0 ? this.mapRowToPlayer(result.rows[0]) : null;
  }

  async getClubPlayers(clubId: string, search?: string): Promise<Player[]> {
    const pool = getPool();
    let query = 'SELECT * FROM players WHERE club_id = $1';
    const params: string[] = [clubId];

    if (search) {
      query += ' AND (LOWER(name) ILIKE $2 OR LOWER(email) ILIKE $2)';
      params.push(`%${search.toLowerCase()}%`);
    }

    query += ' ORDER BY name';

    const result = await pool.query<DbPlayer>(query, params);
    return result.rows.map((row) => this.mapRowToPlayer(row));
  }

  async updatePlayer(playerId: string, input: UpdatePlayerInput): Promise<PlayerResult<Player>> {
    const existing = await this.getPlayer(playerId);
    if (!existing) {
      return { success: false, error: 'player_not_found', message: 'Player not found' };
    }

    const pool = getPool();
    const updates: string[] = [];
    const values: (string | null)[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(input.email);
    }
    if (input.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(input.phone);
    }

    if (updates.length === 0) {
      return { success: true, data: existing };
    }

    values.push(playerId);

    try {
      const result = await pool.query<DbPlayer>(
        `UPDATE players SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

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

      return { success: true, data: this.mapRowToPlayer(result.rows[0]) };
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

    const pool = getPool();

    try {
      // Check if player is in any entries (singles)
      const singlesResult = await pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM entries WHERE player_id = $1',
        [playerId]
      );

      if (parseInt(singlesResult.rows[0].count) > 0) {
        return {
          success: false,
          error: 'operation_failed',
          message: 'Cannot delete player that is registered in competitions',
        };
      }

      // Check if player is in any teams
      const teamsResult = await pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM teams WHERE player1_id = $1 OR player2_id = $1',
        [playerId]
      );

      if (parseInt(teamsResult.rows[0].count) > 0) {
        return {
          success: false,
          error: 'operation_failed',
          message: 'Cannot delete player that is part of a team',
        };
      }

      await pool.query('DELETE FROM players WHERE id = $1', [playerId]);
      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to delete player:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to delete player' };
    }
  }

  async findDuplicates(clubId: string, name: string, email?: string): Promise<Player[]> {
    const pool = getPool();
    let query = 'SELECT * FROM players WHERE club_id = $1 AND (LOWER(name) = LOWER($2)';
    const params: string[] = [clubId, name];

    if (email) {
      query += ' OR LOWER(email) = LOWER($3)';
      params.push(email);
    }

    query += ')';

    const result = await pool.query<DbPlayer>(query, params);
    return result.rows.map((row) => this.mapRowToPlayer(row));
  }

  async linkUserToPlayer(playerId: string, userId: string): Promise<PlayerResult<Player>> {
    const existing = await this.getPlayer(playerId);
    if (!existing) {
      return { success: false, error: 'player_not_found', message: 'Player not found' };
    }

    const pool = getPool();

    try {
      const result = await pool.query<DbPlayer>(
        'UPDATE players SET user_id = $1 WHERE id = $2 RETURNING *',
        [userId, playerId]
      );
      return { success: true, data: this.mapRowToPlayer(result.rows[0]) };
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

    const pool = getPool();
    const id = uuidv4();

    // Auto-generate team name if not provided
    const teamName = input.name || `${player1.name} / ${player2.name}`;

    try {
      const result = await pool.query<DbTeam>(
        `INSERT INTO teams (id, club_id, name, player1_id, player2_id, seed, rating)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          id,
          clubId,
          teamName,
          input.player1Id,
          input.player2Id,
          input.seed ?? null,
          input.rating ?? null,
        ]
      );

      return { success: true, data: this.mapRowToTeam(result.rows[0]) };
    } catch (error) {
      console.error('Failed to create team:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create team' };
    }
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const pool = getPool();
    const result = await pool.query<DbTeam>(
      'SELECT * FROM teams WHERE id = $1',
      [teamId]
    );
    return result.rows.length > 0 ? this.mapRowToTeam(result.rows[0]) : null;
  }

  async getClubTeams(clubId: string): Promise<Team[]> {
    const pool = getPool();
    const result = await pool.query<DbTeam>(
      'SELECT * FROM teams WHERE club_id = $1 ORDER BY name',
      [clubId]
    );
    return result.rows.map((row) => this.mapRowToTeam(row));
  }

  async updateTeam(teamId: string, input: UpdateTeamInput): Promise<PlayerResult<Team>> {
    const existing = await this.getTeam(teamId);
    if (!existing) {
      return { success: false, error: 'team_not_found', message: 'Team not found' };
    }

    const pool = getPool();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.seed !== undefined) {
      updates.push(`seed = $${paramIndex++}`);
      values.push(input.seed);
    }
    if (input.rating !== undefined) {
      updates.push(`rating = $${paramIndex++}`);
      values.push(input.rating);
    }

    if (updates.length === 0) {
      return { success: true, data: existing };
    }

    values.push(teamId);

    try {
      const result = await pool.query<DbTeam>(
        `UPDATE teams SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      return { success: true, data: this.mapRowToTeam(result.rows[0]) };
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

    const pool = getPool();

    try {
      // Check if team is in any entries
      const entriesResult = await pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM entries WHERE team_id = $1',
        [teamId]
      );

      if (parseInt(entriesResult.rows[0].count, 10) > 0) {
        return {
          success: false,
          error: 'operation_failed',
          message: 'Cannot delete team that is registered in competitions',
        };
      }

      await pool.query('DELETE FROM teams WHERE id = $1', [teamId]);
      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to delete team:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to delete team' };
    }
  }

  // ==================== Entries ====================

  async createEntry(divisionId: string, input: CreateEntryInput): Promise<PlayerResult<Entry>> {
    const pool = getPool();

    // Validate division exists
    const divisionResult = await pool.query<{ id: string }>(
      'SELECT id FROM divisions WHERE id = $1',
      [divisionId]
    );

    if (divisionResult.rows.length === 0) {
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
      const existingTeamEntryResult = await pool.query<{ id: string }>(
        'SELECT id FROM entries WHERE division_id = $1 AND team_id = $2',
        [divisionId, input.teamId]
      );

      if (existingTeamEntryResult.rows.length > 0) {
        return { success: false, error: 'team_already_in_division', message: 'Team already entered in this division' };
      }

      // Check team players not in other teams in same division
      const conflictingEntryResult = await pool.query<{ id: string }>(
        `SELECT e.id FROM entries e
         JOIN teams t ON e.team_id = t.id
         WHERE e.division_id = $1
           AND e.entry_type = 'doubles'
           AND (t.player1_id = $2 OR t.player2_id = $2 OR t.player1_id = $3 OR t.player2_id = $3)`,
        [divisionId, team.player1Id, team.player2Id]
      );

      if (conflictingEntryResult.rows.length > 0) {
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

    try {
      const result = await pool.query<DbEntry>(
        `INSERT INTO entries (id, division_id, entry_type, player_id, team_id, seed)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          id,
          divisionId,
          input.entryType,
          input.entryType === 'singles' ? input.playerId : null,
          input.entryType === 'doubles' ? input.teamId : null,
          input.seed ?? null,
        ]
      );

      return { success: true, data: this.mapRowToEntry(result.rows[0]) };
    } catch (error: any) {
      console.error('Failed to create entry:', error);
      if (error.code === '23505') { // PostgreSQL unique violation
        return { success: false, error: 'duplicate_entry', message: 'Entry already exists' };
      }
      return { success: false, error: 'operation_failed', message: 'Failed to create entry' };
    }
  }

  async getEntry(entryId: string): Promise<Entry | null> {
    const pool = getPool();
    const result = await pool.query<DbEntry>(
      'SELECT * FROM entries WHERE id = $1',
      [entryId]
    );
    return result.rows.length > 0 ? this.mapRowToEntry(result.rows[0]) : null;
  }

  async getDivisionEntries(divisionId: string): Promise<EntryWithPlayer[]> {
    const pool = getPool();
    const result = await pool.query<DbEntry & {
      player_name: string | null;
      player_email: string | null;
      player_phone: string | null;
      team_name: string | null;
      team_player1_id: string | null;
      team_player2_id: string | null;
      team_player1_name: string | null;
      team_player2_name: string | null;
    }>(
      `SELECT e.*,
              p.name as player_name, p.email as player_email, p.phone as player_phone,
              t.name as team_name, t.player1_id as team_player1_id, t.player2_id as team_player2_id,
              p1.name as team_player1_name, p2.name as team_player2_name
       FROM entries e
       LEFT JOIN players p ON e.player_id = p.id
       LEFT JOIN teams t ON e.team_id = t.id
       LEFT JOIN players p1 ON t.player1_id = p1.id
       LEFT JOIN players p2 ON t.player2_id = p2.id
       WHERE e.division_id = $1
       ORDER BY e.seed NULLS LAST, e.created_at`,
      [divisionId]
    );
    return result.rows.map((row) => ({
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

    const pool = getPool();
    const updates: string[] = [];
    const values: (number | null | string)[] = [];
    let paramIndex = 1;

    if (input.seed !== undefined) {
      updates.push(`seed = $${paramIndex++}`);
      values.push(input.seed);
    }

    if (updates.length === 0) {
      return { success: true, data: existing };
    }

    values.push(entryId);

    try {
      const result = await pool.query<DbEntry>(
        `UPDATE entries SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      return { success: true, data: this.mapRowToEntry(result.rows[0]) };
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

    const pool = getPool();

    try {
      await pool.query('DELETE FROM entries WHERE id = $1', [entryId]);
      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to delete entry:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to delete entry' };
    }
  }

  async checkPlayerInDivision(divisionId: string, playerId: string): Promise<boolean> {
    const pool = getPool();

    // Check direct singles entry
    const singlesResult = await pool.query<{ id: string }>(
      'SELECT id FROM entries WHERE division_id = $1 AND player_id = $2',
      [divisionId, playerId]
    );

    if (singlesResult.rows.length > 0) {
      return true;
    }

    // Check if player is part of a team entry
    const doublesResult = await pool.query<{ id: string }>(
      `SELECT e.id FROM entries e
       JOIN teams t ON e.team_id = t.id
       WHERE e.division_id = $1
         AND (t.player1_id = $2 OR t.player2_id = $2)`,
      [divisionId, playerId]
    );

    return doublesResult.rows.length > 0;
  }

  async bulkCreateEntries(divisionId: string, playerIds: string[]): Promise<PlayerResult<BulkCreateEntriesResult>> {
    const pool = getPool();

    // Validate division exists
    const divisionResult = await pool.query<{ id: string }>(
      'SELECT id FROM divisions WHERE id = $1',
      [divisionId]
    );

    if (divisionResult.rows.length === 0) {
      return { success: false, error: 'division_not_found', message: 'Division not found' };
    }

    const created: number[] = [];
    const failed: { playerId: string; error: string }[] = [];
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const playerId of playerIds) {
        // Check player exists
        const playerResult = await client.query<{ id: string }>(
          'SELECT id FROM players WHERE id = $1',
          [playerId]
        );

        if (playerResult.rows.length === 0) {
          failed.push({ playerId, error: 'Player not found' });
          continue;
        }

        // Check player not already in division
        const existingResult = await client.query<{ id: string }>(
          'SELECT id FROM entries WHERE division_id = $1 AND player_id = $2',
          [divisionId, playerId]
        );

        if (existingResult.rows.length > 0) {
          failed.push({ playerId, error: 'Already entered in this division' });
          continue;
        }

        const id = uuidv4();
        await client.query(
          `INSERT INTO entries (id, division_id, entry_type, player_id, seed, status)
           VALUES ($1, $2, 'singles', $3, NULL, 'approved')`,
          [id, divisionId, playerId]
        );
        created.push(1);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to bulk create entries:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to bulk create entries' };
    } finally {
      client.release();
    }

    return { success: true, data: { created: created.length, failed } };
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
    const pool = getPool();
    const id = uuidv4();

    await pool.query(
      `INSERT INTO audit_log (id, club_id, user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        clubId,
        userId,
        action,
        entityType,
        entityId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
      ]
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
      status: row.status,
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

    if (player.claimedAt) {
      return { success: false, error: 'profile_already_claimed', message: 'Profile has already been claimed' };
    }

    const pool = getPool();
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    try {
      await pool.query(
        `UPDATE players SET claim_token = $1, claim_token_expires_at = $2 WHERE id = $3`,
        [token, expiresAt, playerId]
      );

      return { success: true, data: { token, expiresAt } };
    } catch (error) {
      console.error('Failed to generate claim token:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to generate claim token' };
    }
  }

  async claimProfile(token: string, userId: string, userEmail: string): Promise<PlayerResult<Player>> {
    const pool = getPool();

    // Find player with this token
    const result = await pool.query<DbPlayer>(
      'SELECT * FROM players WHERE claim_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'invalid_claim_token', message: 'Invalid claim token' };
    }

    const player = result.rows[0];

    if (player.claimed_at) {
      return { success: false, error: 'profile_already_claimed', message: 'Profile has already been claimed' };
    }

    if (player.claim_token_expires_at && new Date(player.claim_token_expires_at) < new Date()) {
      return { success: false, error: 'claim_token_expired', message: 'Claim token has expired' };
    }

    // Optionally verify email matches
    if (player.email && player.email.toLowerCase() !== userEmail.toLowerCase()) {
      return { success: false, error: 'email_mismatch', message: 'Email does not match player profile' };
    }

    try {
      const updateResult = await pool.query<DbPlayer>(
        `UPDATE players
         SET user_id = $1, claimed_at = NOW(), claim_token = NULL, claim_token_expires_at = NULL
         WHERE id = $2
         RETURNING *`,
        [userId, player.id]
      );

      return { success: true, data: this.mapRowToPlayer(updateResult.rows[0]) };
    } catch (error) {
      console.error('Failed to claim profile:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to claim profile' };
    }
  }

  async getPlayersByUser(userId: string): Promise<Player[]> {
    const pool = getPool();
    const result = await pool.query<DbPlayer>(
      'SELECT * FROM players WHERE user_id = $1 ORDER BY name',
      [userId]
    );
    return result.rows.map((row) => this.mapRowToPlayer(row));
  }

  // ==================== Self-Registration (Epic 4) ====================

  async registerForCompetition(
    divisionId: string,
    userId: string,
    input: SelfRegisterInput
  ): Promise<PlayerResult<Entry>> {
    const pool = getPool();

    // Get division and competition details
    const divisionResult = await pool.query<DbDivision & { competition_id: string }>(
      'SELECT * FROM divisions WHERE id = $1',
      [divisionId]
    );

    if (divisionResult.rows.length === 0) {
      return { success: false, error: 'division_not_found', message: 'Division not found' };
    }

    const division = divisionResult.rows[0];

    const compResult = await pool.query<DbCompetition>(
      'SELECT * FROM competitions WHERE id = $1',
      [division.competition_id]
    );

    if (compResult.rows.length === 0) {
      return { success: false, error: 'competition_not_found', message: 'Competition not found' };
    }

    const competition = compResult.rows[0];

    // Check registration is open
    if (!competition.registration_open) {
      return { success: false, error: 'registration_closed', message: 'Registration is not open' };
    }

    // Check deadline hasn't passed
    if (competition.registration_deadline && new Date(competition.registration_deadline) < new Date()) {
      return { success: false, error: 'registration_deadline_passed', message: 'Registration deadline has passed' };
    }

    // Get user's player profiles for this club
    const playersResult = await pool.query<DbPlayer>(
      'SELECT * FROM players WHERE user_id = $1 AND club_id = $2',
      [userId, competition.club_id]
    );

    if (playersResult.rows.length === 0) {
      return { success: false, error: 'player_not_found', message: 'No player profile found for this club' };
    }

    const player = playersResult.rows[0];

    // Check not already registered
    const existingEntry = await this.checkPlayerInDivision(divisionId, player.id);
    if (existingEntry) {
      return { success: false, error: 'already_registered', message: 'Already registered for this division' };
    }

    if (input.entryType === 'singles') {
      // Create singles entry with pending status
      const id = uuidv4();

      try {
        const result = await pool.query<DbEntry>(
          `INSERT INTO entries (id, division_id, entry_type, player_id, status, registered_by_user_id, registered_at)
           VALUES ($1, $2, 'singles', $3, 'pending', $4, NOW())
           RETURNING *`,
          [id, divisionId, player.id, userId]
        );

        return { success: true, data: this.mapRowToEntry(result.rows[0]) };
      } catch (error) {
        console.error('Failed to register for competition:', error);
        return { success: false, error: 'operation_failed', message: 'Failed to register' };
      }
    } else {
      // Doubles registration
      if (!input.partnerId) {
        return { success: false, error: 'operation_failed', message: 'Partner ID required for doubles registration' };
      }

      // Verify partner exists
      const partner = await this.getPlayer(input.partnerId);
      if (!partner) {
        return { success: false, error: 'player_not_found', message: 'Partner not found' };
      }

      // Check partner not already in division
      const partnerInDivision = await this.checkPlayerInDivision(divisionId, input.partnerId);
      if (partnerInDivision) {
        return { success: false, error: 'already_registered', message: 'Partner is already registered in this division' };
      }

      // Create or find team
      let team = await this.findTeamByPlayers(player.id, input.partnerId);

      if (!team) {
        const teamResult = await this.createTeam(competition.club_id, {
          player1Id: player.id,
          player2Id: input.partnerId,
        });

        if (!teamResult.success) {
          return teamResult;
        }
        team = teamResult.data;
      }

      // Create doubles entry with pending status
      const id = uuidv4();

      try {
        const result = await pool.query<DbEntry>(
          `INSERT INTO entries (id, division_id, entry_type, team_id, status, registered_by_user_id, registered_at)
           VALUES ($1, $2, 'doubles', $3, 'pending', $4, NOW())
           RETURNING *`,
          [id, divisionId, team.id, userId]
        );

        return { success: true, data: this.mapRowToEntry(result.rows[0]) };
      } catch (error) {
        console.error('Failed to register for competition:', error);
        return { success: false, error: 'operation_failed', message: 'Failed to register' };
      }
    }
  }

  private async findTeamByPlayers(player1Id: string, player2Id: string): Promise<Team | null> {
    const pool = getPool();
    const result = await pool.query<DbTeam>(
      `SELECT * FROM teams
       WHERE (player1_id = $1 AND player2_id = $2)
          OR (player1_id = $2 AND player2_id = $1)`,
      [player1Id, player2Id]
    );
    return result.rows.length > 0 ? this.mapRowToTeam(result.rows[0]) : null;
  }

  async getPendingRegistrations(competitionId: string): Promise<EntryWithPlayer[]> {
    const pool = getPool();

    const result = await pool.query<DbEntry & { player_name: string; player_email: string | null; team_name: string }>(
      `SELECT e.*, p.name as player_name, p.email as player_email, t.name as team_name
       FROM entries e
       JOIN divisions d ON e.division_id = d.id
       LEFT JOIN players p ON e.player_id = p.id
       LEFT JOIN teams t ON e.team_id = t.id
       WHERE d.competition_id = $1 AND e.status = 'pending'
       ORDER BY e.registered_at`,
      [competitionId]
    );

    return result.rows.map((row) => ({
      ...this.mapRowToEntry(row),
      player: row.player_id
        ? {
            id: row.player_id,
            clubId: '',
            userId: null,
            name: row.player_name,
            email: row.player_email,
            phone: null,
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
            name: row.team_name,
            player1Id: '',
            player2Id: '',
            seed: null,
            rating: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : undefined,
    }));
  }

  async approveRegistration(entryId: string): Promise<PlayerResult<Entry>> {
    const entry = await this.getEntry(entryId);
    if (!entry) {
      return { success: false, error: 'entry_not_found', message: 'Entry not found' };
    }

    if (entry.status !== 'pending') {
      return { success: false, error: 'entry_not_pending', message: 'Entry is not pending' };
    }

    const pool = getPool();

    try {
      const result = await pool.query<DbEntry>(
        `UPDATE entries SET status = 'approved' WHERE id = $1 RETURNING *`,
        [entryId]
      );

      return { success: true, data: this.mapRowToEntry(result.rows[0]) };
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
      return { success: false, error: 'entry_not_pending', message: 'Entry is not pending' };
    }

    const pool = getPool();

    try {
      const result = await pool.query<DbEntry>(
        `UPDATE entries SET status = 'rejected' WHERE id = $1 RETURNING *`,
        [entryId]
      );

      return { success: true, data: this.mapRowToEntry(result.rows[0]) };
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

    // Verify user owns this registration
    if (entry.registeredByUserId !== userId) {
      return { success: false, error: 'not_authorized', message: 'Not authorized to withdraw this registration' };
    }

    if (entry.status !== 'pending' && entry.status !== 'approved') {
      return { success: false, error: 'operation_failed', message: 'Cannot withdraw this registration' };
    }

    const pool = getPool();

    try {
      await pool.query(
        `UPDATE entries SET status = 'withdrawn' WHERE id = $1`,
        [entryId]
      );

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

    const pool = getPool();

    // Verify division exists
    const divisionResult = await pool.query<DbDivision>(
      'SELECT * FROM divisions WHERE id = $1',
      [input.divisionId]
    );

    if (divisionResult.rows.length === 0) {
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
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    try {
      const result = await pool.query<DbPartnerRequest>(
        `INSERT INTO partner_requests (id, division_id, requester_player_id, invitee_player_id, message, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, input.divisionId, input.requesterPlayerId, input.inviteePlayerId, input.message || null, expiresAt]
      );

      return { success: true, data: this.mapRowToPartnerRequest(result.rows[0]) };
    } catch (error: any) {
      console.error('Failed to create partner request:', error);
      if (error.code === '23505') {
        return { success: false, error: 'operation_failed', message: 'Partner request already exists' };
      }
      return { success: false, error: 'operation_failed', message: 'Failed to create partner request' };
    }
  }

  async getPartnerRequest(requestId: string): Promise<PartnerRequest | null> {
    const pool = getPool();
    const result = await pool.query<DbPartnerRequest>(
      'SELECT * FROM partner_requests WHERE id = $1',
      [requestId]
    );
    return result.rows.length > 0 ? this.mapRowToPartnerRequest(result.rows[0]) : null;
  }

  async getPartnerRequestsForPlayer(playerId: string): Promise<PartnerRequest[]> {
    const pool = getPool();
    const result = await pool.query<DbPartnerRequest>(
      `SELECT * FROM partner_requests
       WHERE (requester_player_id = $1 OR invitee_player_id = $1)
         AND status = 'pending'
         AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [playerId]
    );
    return result.rows.map((row) => this.mapRowToPartnerRequest(row));
  }

  async getPartnerRequestsForUser(userId: string): Promise<PartnerRequestWithDetails[]> {
    const pool = getPool();

    const result = await pool.query<
      DbPartnerRequest & {
        requester_name: string;
        requester_email: string | null;
        invitee_name: string;
        invitee_email: string | null;
        division_name: string;
        competition_name: string;
      }
    >(
      `SELECT pr.*,
              rp.name as requester_name, rp.email as requester_email,
              ip.name as invitee_name, ip.email as invitee_email,
              d.name as division_name, c.name as competition_name
       FROM partner_requests pr
       JOIN players rp ON pr.requester_player_id = rp.id
       JOIN players ip ON pr.invitee_player_id = ip.id
       JOIN divisions d ON pr.division_id = d.id
       JOIN competitions c ON d.competition_id = c.id
       WHERE (rp.user_id = $1 OR ip.user_id = $1)
         AND pr.status = 'pending'
         AND pr.expires_at > NOW()
       ORDER BY pr.created_at DESC`,
      [userId]
    );

    return result.rows.map((row) => ({
      ...this.mapRowToPartnerRequest(row),
      requesterPlayer: {
        id: row.requester_player_id,
        clubId: '',
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
        clubId: '',
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
      return { success: false, error: 'partner_request_already_responded', message: 'Partner request already responded' };
    }

    if (new Date(request.expiresAt) < new Date()) {
      return { success: false, error: 'partner_request_expired', message: 'Partner request has expired' };
    }

    // Verify user is the invitee
    const invitee = await this.getPlayer(request.inviteePlayerId);
    if (!invitee || invitee.userId !== userId) {
      return { success: false, error: 'not_authorized', message: 'Not authorized to accept this request' };
    }

    const pool = getPool();

    // Get division to get club_id
    const divisionResult = await pool.query<DbDivision & { club_id: string }>(
      `SELECT d.*, c.club_id
       FROM divisions d
       JOIN competitions c ON d.competition_id = c.id
       WHERE d.id = $1`,
      [request.divisionId]
    );

    if (divisionResult.rows.length === 0) {
      return { success: false, error: 'division_not_found', message: 'Division not found' };
    }

    const division = divisionResult.rows[0];

    // Create or find team
    let team = await this.findTeamByPlayers(request.requesterPlayerId, request.inviteePlayerId);

    if (!team) {
      const teamResult = await this.createTeam(division.club_id, {
        player1Id: request.requesterPlayerId,
        player2Id: request.inviteePlayerId,
      });

      if (!teamResult.success) {
        return teamResult;
      }
      team = teamResult.data;
    }

    // Create doubles entry
    const entryId = uuidv4();

    try {
      // Update request status
      await pool.query(
        `UPDATE partner_requests SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
        [requestId]
      );

      // Create entry
      const entryResult = await pool.query<DbEntry>(
        `INSERT INTO entries (id, division_id, entry_type, team_id, status, registered_at)
         VALUES ($1, $2, 'doubles', $3, 'pending', NOW())
         RETURNING *`,
        [entryId, request.divisionId, team.id]
      );

      return { success: true, data: this.mapRowToEntry(entryResult.rows[0]) };
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
      return { success: false, error: 'partner_request_already_responded', message: 'Partner request already responded' };
    }

    // Verify user is the invitee
    const invitee = await this.getPlayer(request.inviteePlayerId);
    if (!invitee || invitee.userId !== userId) {
      return { success: false, error: 'not_authorized', message: 'Not authorized to decline this request' };
    }

    const pool = getPool();

    try {
      await pool.query(
        `UPDATE partner_requests SET status = 'declined', responded_at = NOW() WHERE id = $1`,
        [requestId]
      );

      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to decline partner request:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to decline partner request' };
    }
  }

  // ==================== Dashboard (Epic 4) ====================

  async getPlayerDashboard(userId: string): Promise<PlayerDashboard> {
    const pool = getPool();

    // Get user's player profiles
    const players = await this.getPlayersByUser(userId);
    const playerIds = players.map((p) => p.id);

    if (playerIds.length === 0) {
      return {
        players: [],
        registrations: [],
        upcomingMatches: [],
        recentResults: [],
        partnerRequests: [],
      };
    }

    // Get registrations with competition info
    const registrationsResult = await pool.query<
      DbEntry & { division_name: string; competition_name: string; competition_id: string; club_id: string }
    >(
      `SELECT e.*, d.name as division_name, c.name as competition_name, c.id as competition_id, c.club_id
       FROM entries e
       JOIN divisions d ON e.division_id = d.id
       JOIN competitions c ON d.competition_id = c.id
       WHERE e.player_id = ANY($1) OR e.team_id IN (
         SELECT id FROM teams WHERE player1_id = ANY($1) OR player2_id = ANY($1)
       )
       ORDER BY e.created_at DESC`,
      [playerIds]
    );

    const registrations: EntryWithCompetition[] = registrationsResult.rows.map((row) => ({
      ...this.mapRowToEntry(row),
      divisionName: row.division_name,
      competitionName: row.competition_name,
      competitionId: row.competition_id,
      clubId: row.club_id,
    }));

    // Get upcoming matches
    const upcomingMatchesResult = await pool.query<{
      id: string;
      draw_id: string;
      round_number: number;
      match_number: number;
      entry1_id: string | null;
      entry2_id: string | null;
      entry1_name: string | null;
      entry2_name: string | null;
      winner_entry_id: string | null;
      score: unknown;
      status: string;
      scheduled_time: Date | null;
      court: string | null;
      division_name: string;
      competition_name: string;
    }>(
      `SELECT m.id, m.draw_id, m.round_number, m.match_number,
              m.entry1_id, m.entry2_id, m.winner_entry_id, m.score, m.status,
              m.scheduled_time, m.court,
              COALESCE(p1.name, t1.name) as entry1_name,
              COALESCE(p2.name, t2.name) as entry2_name,
              d.name as division_name, c.name as competition_name
       FROM matches m
       JOIN draws dr ON m.draw_id = dr.id
       JOIN divisions d ON dr.division_id = d.id
       JOIN competitions c ON d.competition_id = c.id
       LEFT JOIN entries e1 ON m.entry1_id = e1.id
       LEFT JOIN players p1 ON e1.player_id = p1.id
       LEFT JOIN teams t1 ON e1.team_id = t1.id
       LEFT JOIN entries e2 ON m.entry2_id = e2.id
       LEFT JOIN players p2 ON e2.player_id = p2.id
       LEFT JOIN teams t2 ON e2.team_id = t2.id
       WHERE m.status IN ('pending', 'scheduled')
         AND (
           e1.player_id = ANY($1) OR e1.team_id IN (SELECT id FROM teams WHERE player1_id = ANY($1) OR player2_id = ANY($1))
           OR e2.player_id = ANY($1) OR e2.team_id IN (SELECT id FROM teams WHERE player1_id = ANY($1) OR player2_id = ANY($1))
         )
       ORDER BY m.scheduled_time NULLS LAST, m.round_number, m.match_number
       LIMIT 10`,
      [playerIds]
    );

    const upcomingMatches: MatchWithDetails[] = upcomingMatchesResult.rows.map((row) => ({
      id: row.id,
      drawId: row.draw_id,
      roundNumber: row.round_number,
      matchNumber: row.match_number,
      entry1Id: row.entry1_id,
      entry2Id: row.entry2_id,
      entry1Name: row.entry1_name,
      entry2Name: row.entry2_name,
      winnerEntryId: row.winner_entry_id,
      score: row.score,
      status: row.status,
      scheduledTime: row.scheduled_time ? new Date(row.scheduled_time) : null,
      court: row.court,
      divisionName: row.division_name,
      competitionName: row.competition_name,
    }));

    // Get recent results
    const recentResultsResult = await pool.query<{
      id: string;
      draw_id: string;
      round_number: number;
      match_number: number;
      entry1_id: string | null;
      entry2_id: string | null;
      entry1_name: string | null;
      entry2_name: string | null;
      winner_entry_id: string | null;
      score: unknown;
      status: string;
      scheduled_time: Date | null;
      court: string | null;
      division_name: string;
      competition_name: string;
    }>(
      `SELECT m.id, m.draw_id, m.round_number, m.match_number,
              m.entry1_id, m.entry2_id, m.winner_entry_id, m.score, m.status,
              m.scheduled_time, m.court,
              COALESCE(p1.name, t1.name) as entry1_name,
              COALESCE(p2.name, t2.name) as entry2_name,
              d.name as division_name, c.name as competition_name
       FROM matches m
       JOIN draws dr ON m.draw_id = dr.id
       JOIN divisions d ON dr.division_id = d.id
       JOIN competitions c ON d.competition_id = c.id
       LEFT JOIN entries e1 ON m.entry1_id = e1.id
       LEFT JOIN players p1 ON e1.player_id = p1.id
       LEFT JOIN teams t1 ON e1.team_id = t1.id
       LEFT JOIN entries e2 ON m.entry2_id = e2.id
       LEFT JOIN players p2 ON e2.player_id = p2.id
       LEFT JOIN teams t2 ON e2.team_id = t2.id
       WHERE m.status IN ('completed', 'walkover', 'retired')
         AND (
           e1.player_id = ANY($1) OR e1.team_id IN (SELECT id FROM teams WHERE player1_id = ANY($1) OR player2_id = ANY($1))
           OR e2.player_id = ANY($1) OR e2.team_id IN (SELECT id FROM teams WHERE player1_id = ANY($1) OR player2_id = ANY($1))
         )
       ORDER BY m.updated_at DESC
       LIMIT 10`,
      [playerIds]
    );

    const recentResults: MatchWithDetails[] = recentResultsResult.rows.map((row) => ({
      id: row.id,
      drawId: row.draw_id,
      roundNumber: row.round_number,
      matchNumber: row.match_number,
      entry1Id: row.entry1_id,
      entry2Id: row.entry2_id,
      entry1Name: row.entry1_name,
      entry2Name: row.entry2_name,
      winnerEntryId: row.winner_entry_id,
      score: row.score,
      status: row.status,
      scheduledTime: row.scheduled_time ? new Date(row.scheduled_time) : null,
      court: row.court,
      divisionName: row.division_name,
      competitionName: row.competition_name,
    }));

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
