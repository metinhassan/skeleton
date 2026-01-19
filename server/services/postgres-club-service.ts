/**
 * PostgreSQL club service implementation
 * For local development with Docker PostgreSQL
 */

import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/postgres.js';
import type {
  ClubService,
  Club,
  ClubMembership,
  ClubInvite,
  AuditLogEntry,
  CreateClubInput,
  CreateInviteInput,
  ClubResult,
  ClubRole,
} from './club-service.js';

interface DbClub {
  id: string;
  name: string;
  region: string | null;
  logo_url: string | null;
  primary_color: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DbClubMember {
  id: string;
  club_id: string;
  user_id: string;
  role: ClubRole;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
  club_name?: string;
  user_name?: string;
  user_email?: string;
}

interface DbClubInvite {
  id: string;
  club_id: string;
  email: string;
  role: ClubRole;
  status: 'pending' | 'accepted' | 'declined';
  invited_by: string;
  created_at: Date;
  club_name?: string;
}

interface DbAuditLog {
  id: string;
  club_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: Date;
}

export class PostgresClubService implements ClubService {
  // ==================== Club Management ====================

  async createClub(input: CreateClubInput, creatorUserId: string): Promise<ClubResult<Club>> {
    const pool = getPool();
    const id = uuidv4();
    const memberId = uuidv4();

    try {
      // Create the club
      const clubResult = await pool.query<DbClub>(
        `INSERT INTO clubs (id, name, region, logo_url, primary_color)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, input.name, input.region || null, input.logoUrl || null, input.primaryColor || null]
      );

      // Add creator as admin
      await pool.query(
        `INSERT INTO club_members (id, club_id, user_id, role, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [memberId, id, creatorUserId, 'admin', 'active']
      );

      // Log the creation
      await this.logAudit(id, creatorUserId, 'create', 'club', id, null, { name: input.name });

      return { success: true, data: this.mapRowToClub(clubResult.rows[0]) };
    } catch (error) {
      console.error('Failed to create club:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create club' };
    }
  }

  async getClub(clubId: string): Promise<Club | null> {
    const pool = getPool();
    const result = await pool.query<DbClub>('SELECT * FROM clubs WHERE id = $1', [clubId]);
    return result.rows.length > 0 ? this.mapRowToClub(result.rows[0]) : null;
  }

  async getUserClubs(userId: string): Promise<ClubMembership[]> {
    const pool = getPool();
    const result = await pool.query<DbClubMember>(
      `SELECT cm.*, c.name as club_name
       FROM club_members cm
       JOIN clubs c ON cm.club_id = c.id
       WHERE cm.user_id = $1 AND cm.status = 'active'
       ORDER BY c.name`,
      [userId]
    );
    return result.rows.map((row) => this.mapRowToMembership(row));
  }

  // ==================== Invitations ====================

  async createInvite(
    clubId: string,
    input: CreateInviteInput,
    invitedBy: string
  ): Promise<ClubResult<ClubInvite>> {
    const pool = getPool();

    // Check club exists
    const club = await this.getClub(clubId);
    if (!club) {
      return { success: false, error: 'club_not_found', message: 'Club not found' };
    }

    // Check if user is already a member
    const existingMemberResult = await pool.query(
      `SELECT cm.id FROM club_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.club_id = $1 AND LOWER(u.email) = LOWER($2) AND cm.status = 'active'`,
      [clubId, input.email]
    );
    if (existingMemberResult.rows.length > 0) {
      return { success: false, error: 'already_member', message: 'User is already a member of this club' };
    }

    // Check for pending invite
    const existingInviteResult = await pool.query(
      `SELECT id FROM club_invites
       WHERE club_id = $1 AND LOWER(email) = LOWER($2) AND status = 'pending'`,
      [clubId, input.email]
    );
    if (existingInviteResult.rows.length > 0) {
      return { success: false, error: 'already_invited', message: 'User already has a pending invite' };
    }

    const id = uuidv4();

    try {
      const result = await pool.query<DbClubInvite>(
        `INSERT INTO club_invites (id, club_id, email, role, status, invited_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, clubId, input.email.toLowerCase(), input.role, 'pending', invitedBy]
      );

      // Log the invite
      await this.logAudit(clubId, invitedBy, 'create_invite', 'club_invite', id, null, {
        email: input.email,
        role: input.role,
      });

      const invite = this.mapRowToInvite(result.rows[0]);
      invite.clubName = club.name;

      return { success: true, data: invite };
    } catch (error) {
      console.error('Failed to create invite:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create invite' };
    }
  }

  async getInvitesForEmail(email: string): Promise<ClubInvite[]> {
    const pool = getPool();
    const result = await pool.query<DbClubInvite>(
      `SELECT ci.*, c.name as club_name
       FROM club_invites ci
       JOIN clubs c ON ci.club_id = c.id
       WHERE LOWER(ci.email) = LOWER($1) AND ci.status = 'pending'
       ORDER BY ci.created_at DESC`,
      [email]
    );
    return result.rows.map((row) => this.mapRowToInvite(row));
  }

  async getInviteById(inviteId: string): Promise<ClubInvite | null> {
    const pool = getPool();
    const result = await pool.query<DbClubInvite>(
      `SELECT ci.*, c.name as club_name
       FROM club_invites ci
       JOIN clubs c ON ci.club_id = c.id
       WHERE ci.id = $1`,
      [inviteId]
    );
    return result.rows.length > 0 ? this.mapRowToInvite(result.rows[0]) : null;
  }

  async acceptInvite(inviteId: string, userId: string): Promise<ClubResult<ClubMembership>> {
    const pool = getPool();

    const invite = await this.getInviteById(inviteId);
    if (!invite) {
      return { success: false, error: 'invite_not_found', message: 'Invite not found' };
    }

    if (invite.status !== 'pending') {
      return { success: false, error: 'operation_failed', message: 'Invite is no longer pending' };
    }

    // Check if already a member
    const existingMembership = await this.getMembership(invite.clubId, userId);
    if (existingMembership && existingMembership.status === 'active') {
      return { success: false, error: 'already_member', message: 'Already a member of this club' };
    }

    try {
      // Update invite status
      await pool.query("UPDATE club_invites SET status = 'accepted' WHERE id = $1", [inviteId]);

      let membership: ClubMembership;

      if (existingMembership) {
        // Reactivate existing membership
        const result = await pool.query<DbClubMember>(
          `UPDATE club_members SET status = 'active', role = $1 WHERE id = $2 RETURNING *`,
          [invite.role, existingMembership.id]
        );
        membership = this.mapRowToMembership(result.rows[0]);
      } else {
        // Create new membership
        const memberId = uuidv4();
        const result = await pool.query<DbClubMember>(
          `INSERT INTO club_members (id, club_id, user_id, role, status)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [memberId, invite.clubId, userId, invite.role, 'active']
        );
        membership = this.mapRowToMembership(result.rows[0]);
      }

      // Log the acceptance
      await this.logAudit(invite.clubId, userId, 'accept_invite', 'club_member', membership.id, null, {
        role: invite.role,
      });

      return { success: true, data: membership };
    } catch (error) {
      console.error('Failed to accept invite:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to accept invite' };
    }
  }

  async declineInvite(inviteId: string): Promise<ClubResult<void>> {
    const pool = getPool();

    const invite = await this.getInviteById(inviteId);
    if (!invite) {
      return { success: false, error: 'invite_not_found', message: 'Invite not found' };
    }

    if (invite.status !== 'pending') {
      return { success: false, error: 'operation_failed', message: 'Invite is no longer pending' };
    }

    try {
      await pool.query("UPDATE club_invites SET status = 'declined' WHERE id = $1", [inviteId]);
      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to decline invite:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to decline invite' };
    }
  }

  // ==================== Member Management ====================

  async getMembers(clubId: string): Promise<ClubMembership[]> {
    const pool = getPool();
    const result = await pool.query<DbClubMember>(
      `SELECT cm.*, u.name as user_name, u.email as user_email
       FROM club_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.club_id = $1 AND cm.status = 'active'
       ORDER BY
         CASE cm.role
           WHEN 'admin' THEN 1
           WHEN 'organiser' THEN 2
           WHEN 'supervisor' THEN 3
           WHEN 'player' THEN 4
         END,
         u.name`,
      [clubId]
    );
    return result.rows.map((row) => this.mapRowToMembership(row));
  }

  async getMembership(clubId: string, userId: string): Promise<ClubMembership | null> {
    const pool = getPool();
    const result = await pool.query<DbClubMember>(
      `SELECT cm.*, u.name as user_name, u.email as user_email
       FROM club_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.club_id = $1 AND cm.user_id = $2`,
      [clubId, userId]
    );
    return result.rows.length > 0 ? this.mapRowToMembership(result.rows[0]) : null;
  }

  async updateMemberRole(
    clubId: string,
    userId: string,
    newRole: ClubRole,
    changedBy: string
  ): Promise<ClubResult<ClubMembership>> {
    const membership = await this.getMembership(clubId, userId);
    if (!membership || membership.status !== 'active') {
      return { success: false, error: 'member_not_found', message: 'Member not found' };
    }

    const oldRole = membership.role;

    // Prevent removing the last admin
    if (oldRole === 'admin' && newRole !== 'admin') {
      const adminCount = await this.countAdmins(clubId);
      if (adminCount <= 1) {
        return {
          success: false,
          error: 'cannot_remove_last_admin',
          message: 'Cannot remove the last admin from the club',
        };
      }
    }

    const pool = getPool();

    try {
      const result = await pool.query<DbClubMember>(
        'UPDATE club_members SET role = $1 WHERE id = $2 RETURNING *',
        [newRole, membership.id]
      );

      // Log the change
      await this.logAudit(clubId, changedBy, 'update_role', 'club_member', membership.id, { role: oldRole }, { role: newRole });

      return { success: true, data: this.mapRowToMembership(result.rows[0]) };
    } catch (error) {
      console.error('Failed to update member role:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to update member role' };
    }
  }

  async deactivateMember(clubId: string, userId: string, changedBy: string): Promise<ClubResult<void>> {
    const membership = await this.getMembership(clubId, userId);
    if (!membership || membership.status !== 'active') {
      return { success: false, error: 'member_not_found', message: 'Member not found' };
    }

    // Prevent removing the last admin
    if (membership.role === 'admin') {
      const adminCount = await this.countAdmins(clubId);
      if (adminCount <= 1) {
        return {
          success: false,
          error: 'cannot_remove_last_admin',
          message: 'Cannot remove the last admin from the club',
        };
      }
    }

    const pool = getPool();

    try {
      await pool.query("UPDATE club_members SET status = 'inactive' WHERE id = $1", [membership.id]);

      // Log the deactivation
      await this.logAudit(
        clubId,
        changedBy,
        'deactivate_member',
        'club_member',
        membership.id,
        { status: 'active', role: membership.role },
        { status: 'inactive' }
      );

      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to deactivate member:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to deactivate member' };
    }
  }

  // ==================== Authorization Helpers ====================

  async isClubAdmin(clubId: string, userId: string): Promise<boolean> {
    const membership = await this.getMembership(clubId, userId);
    return membership?.status === 'active' && membership?.role === 'admin';
  }

  async isClubMember(clubId: string, userId: string): Promise<boolean> {
    const membership = await this.getMembership(clubId, userId);
    return membership?.status === 'active';
  }

  // ==================== Audit Log ====================

  async getAuditLog(clubId: string, limit: number = 100): Promise<AuditLogEntry[]> {
    const pool = getPool();
    const result = await pool.query<DbAuditLog>(
      `SELECT * FROM audit_log
       WHERE club_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [clubId, limit]
    );
    return result.rows.map((row) => this.mapRowToAuditLog(row));
  }

  // ==================== Private Helpers ====================

  private async countAdmins(clubId: string): Promise<number> {
    const pool = getPool();
    const result = await pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM club_members WHERE club_id = $1 AND role = 'admin' AND status = 'active'",
      [clubId]
    );
    return parseInt(result.rows[0].count, 10);
  }

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

  private mapRowToClub(row: DbClub): Club {
    return {
      id: row.id,
      name: row.name,
      region: row.region,
      logoUrl: row.logo_url,
      primaryColor: row.primary_color,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToMembership(row: DbClubMember): ClubMembership {
    return {
      id: row.id,
      clubId: row.club_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      userName: row.user_name,
      userEmail: row.user_email,
    };
  }

  private mapRowToInvite(row: DbClubInvite): ClubInvite {
    return {
      id: row.id,
      clubId: row.club_id,
      email: row.email,
      role: row.role,
      status: row.status,
      invitedBy: row.invited_by,
      createdAt: new Date(row.created_at),
      clubName: row.club_name,
    };
  }

  private mapRowToAuditLog(row: DbAuditLog): AuditLogEntry {
    return {
      id: row.id,
      clubId: row.club_id,
      userId: row.user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      oldValues: row.old_values,
      newValues: row.new_values,
      createdAt: new Date(row.created_at),
    };
  }
}
