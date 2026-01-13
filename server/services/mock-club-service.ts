/**
 * Mock club service implementation using SQLite
 * For local development only
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database.js';
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
  created_at: string;
  updated_at: string;
}

interface DbClubMember {
  id: string;
  club_id: string;
  user_id: string;
  role: ClubRole;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  // Joined fields
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
  created_at: string;
  // Joined fields
  club_name?: string;
}

interface DbAuditLog {
  id: string;
  club_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values: string | null;
  new_values: string | null;
  created_at: string;
}

export class MockClubService implements ClubService {
  // ==================== Club Management ====================

  async createClub(input: CreateClubInput, creatorUserId: string): Promise<ClubResult<Club>> {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date();

    try {
      // Create the club
      const clubStmt = db.prepare(`
        INSERT INTO clubs (id, name, region, logo_url, primary_color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      clubStmt.run(
        id,
        input.name,
        input.region || null,
        input.logoUrl || null,
        input.primaryColor || null,
        now.toISOString(),
        now.toISOString()
      );

      // Add creator as admin
      const memberId = uuidv4();
      const memberStmt = db.prepare(`
        INSERT INTO club_members (id, club_id, user_id, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      memberStmt.run(memberId, id, creatorUserId, 'admin', 'active', now.toISOString(), now.toISOString());

      // Log the creation
      await this.logAudit(id, creatorUserId, 'create', 'club', id, null, { name: input.name });

      const club: Club = {
        id,
        name: input.name,
        region: input.region || null,
        logoUrl: input.logoUrl || null,
        primaryColor: input.primaryColor || null,
        createdAt: now,
        updatedAt: now,
      };

      return { success: true, data: club };
    } catch (error) {
      console.error('Failed to create club:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create club' };
    }
  }

  async getClub(clubId: string): Promise<Club | null> {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId) as DbClub | undefined;
    return row ? this.mapRowToClub(row) : null;
  }

  async getUserClubs(userId: string): Promise<ClubMembership[]> {
    const db = getDatabase();
    const rows = db
      .prepare(
        `
        SELECT cm.*, c.name as club_name
        FROM club_members cm
        JOIN clubs c ON cm.club_id = c.id
        WHERE cm.user_id = ? AND cm.status = 'active'
        ORDER BY c.name
      `
      )
      .all(userId) as DbClubMember[];

    return rows.map((row) => this.mapRowToMembership(row));
  }

  // ==================== Invitations ====================

  async createInvite(
    clubId: string,
    input: CreateInviteInput,
    invitedBy: string
  ): Promise<ClubResult<ClubInvite>> {
    const db = getDatabase();

    // Check club exists
    const club = await this.getClub(clubId);
    if (!club) {
      return { success: false, error: 'club_not_found', message: 'Club not found' };
    }

    // Check if user is already a member
    const existingMember = db
      .prepare(
        `
        SELECT cm.id FROM club_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.club_id = ? AND LOWER(u.email) = LOWER(?) AND cm.status = 'active'
      `
      )
      .get(clubId, input.email);
    if (existingMember) {
      return { success: false, error: 'already_member', message: 'User is already a member of this club' };
    }

    // Check for pending invite
    const existingInvite = db
      .prepare(
        `
        SELECT id FROM club_invites
        WHERE club_id = ? AND LOWER(email) = LOWER(?) AND status = 'pending'
      `
      )
      .get(clubId, input.email);
    if (existingInvite) {
      return { success: false, error: 'already_invited', message: 'User already has a pending invite' };
    }

    const id = uuidv4();
    const now = new Date();

    try {
      const stmt = db.prepare(`
        INSERT INTO club_invites (id, club_id, email, role, status, invited_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, clubId, input.email.toLowerCase(), input.role, 'pending', invitedBy, now.toISOString());

      // Log the invite
      await this.logAudit(clubId, invitedBy, 'create_invite', 'club_invite', id, null, {
        email: input.email,
        role: input.role,
      });

      const invite: ClubInvite = {
        id,
        clubId,
        email: input.email.toLowerCase(),
        role: input.role,
        status: 'pending',
        invitedBy,
        createdAt: now,
        clubName: club.name,
      };

      return { success: true, data: invite };
    } catch (error) {
      console.error('Failed to create invite:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create invite' };
    }
  }

  async getInvitesForEmail(email: string): Promise<ClubInvite[]> {
    const db = getDatabase();
    const rows = db
      .prepare(
        `
        SELECT ci.*, c.name as club_name
        FROM club_invites ci
        JOIN clubs c ON ci.club_id = c.id
        WHERE LOWER(ci.email) = LOWER(?) AND ci.status = 'pending'
        ORDER BY ci.created_at DESC
      `
      )
      .all(email) as DbClubInvite[];

    return rows.map((row) => this.mapRowToInvite(row));
  }

  async getInviteById(inviteId: string): Promise<ClubInvite | null> {
    const db = getDatabase();
    const row = db
      .prepare(
        `
        SELECT ci.*, c.name as club_name
        FROM club_invites ci
        JOIN clubs c ON ci.club_id = c.id
        WHERE ci.id = ?
      `
      )
      .get(inviteId) as DbClubInvite | undefined;

    return row ? this.mapRowToInvite(row) : null;
  }

  async acceptInvite(inviteId: string, userId: string): Promise<ClubResult<ClubMembership>> {
    const db = getDatabase();

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

    const now = new Date();

    try {
      // Update invite status
      db.prepare("UPDATE club_invites SET status = 'accepted' WHERE id = ?").run(inviteId);

      let membership: ClubMembership;

      if (existingMembership) {
        // Reactivate existing membership
        db.prepare(
          `UPDATE club_members SET status = 'active', role = ?, updated_at = ? WHERE id = ?`
        ).run(invite.role, now.toISOString(), existingMembership.id);

        membership = {
          ...existingMembership,
          role: invite.role,
          status: 'active',
          updatedAt: now,
        };
      } else {
        // Create new membership
        const memberId = uuidv4();
        db.prepare(`
          INSERT INTO club_members (id, club_id, user_id, role, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(memberId, invite.clubId, userId, invite.role, 'active', now.toISOString(), now.toISOString());

        membership = {
          id: memberId,
          clubId: invite.clubId,
          userId,
          role: invite.role,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };
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
    const db = getDatabase();

    const invite = await this.getInviteById(inviteId);
    if (!invite) {
      return { success: false, error: 'invite_not_found', message: 'Invite not found' };
    }

    if (invite.status !== 'pending') {
      return { success: false, error: 'operation_failed', message: 'Invite is no longer pending' };
    }

    try {
      db.prepare("UPDATE club_invites SET status = 'declined' WHERE id = ?").run(inviteId);
      return { success: true, data: undefined };
    } catch (error) {
      console.error('Failed to decline invite:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to decline invite' };
    }
  }

  // ==================== Member Management ====================

  async getMembers(clubId: string): Promise<ClubMembership[]> {
    const db = getDatabase();
    const rows = db
      .prepare(
        `
        SELECT cm.*, u.name as user_name, u.email as user_email
        FROM club_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.club_id = ? AND cm.status = 'active'
        ORDER BY
          CASE cm.role
            WHEN 'admin' THEN 1
            WHEN 'organiser' THEN 2
            WHEN 'supervisor' THEN 3
            WHEN 'player' THEN 4
          END,
          u.name
      `
      )
      .all(clubId) as DbClubMember[];

    return rows.map((row) => this.mapRowToMembership(row));
  }

  async getMembership(clubId: string, userId: string): Promise<ClubMembership | null> {
    const db = getDatabase();
    const row = db
      .prepare(
        `
        SELECT cm.*, u.name as user_name, u.email as user_email
        FROM club_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.club_id = ? AND cm.user_id = ?
      `
      )
      .get(clubId, userId) as DbClubMember | undefined;

    return row ? this.mapRowToMembership(row) : null;
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

    const db = getDatabase();
    const now = new Date();

    try {
      db.prepare('UPDATE club_members SET role = ?, updated_at = ? WHERE id = ?').run(
        newRole,
        now.toISOString(),
        membership.id
      );

      // Log the change
      await this.logAudit(clubId, changedBy, 'update_role', 'club_member', membership.id, { role: oldRole }, { role: newRole });

      return {
        success: true,
        data: {
          ...membership,
          role: newRole,
          updatedAt: now,
        },
      };
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

    const db = getDatabase();
    const now = new Date();

    try {
      db.prepare("UPDATE club_members SET status = 'inactive', updated_at = ? WHERE id = ?").run(
        now.toISOString(),
        membership.id
      );

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
    const db = getDatabase();
    const rows = db
      .prepare(
        `
        SELECT * FROM audit_log
        WHERE club_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `
      )
      .all(clubId, limit) as DbAuditLog[];

    return rows.map((row) => this.mapRowToAuditLog(row));
  }

  // ==================== Private Helpers ====================

  private async countAdmins(clubId: string): Promise<number> {
    const db = getDatabase();
    const result = db
      .prepare("SELECT COUNT(*) as count FROM club_members WHERE club_id = ? AND role = 'admin' AND status = 'active'")
      .get(clubId) as { count: number };
    return result.count;
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
      oldValues: row.old_values ? JSON.parse(row.old_values) : null,
      newValues: row.new_values ? JSON.parse(row.new_values) : null,
      createdAt: new Date(row.created_at),
    };
  }
}
