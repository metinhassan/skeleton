/**
 * Unit tests for MockClubService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockClubService } from '../../server/services/mock-club-service.js';
import { MockUserService } from '../../server/services/mock-user-service.js';
import { resetDatabase, getDatabase } from '../../server/db/database.js';
import type { ClubRole } from '../../server/services/club-service.js';

describe('MockClubService', () => {
  let clubService: MockClubService;
  let userService: MockUserService;
  let user1Id: string;
  let user2Id: string;
  let user3Id: string;

  beforeEach(async () => {
    resetDatabase();
    clubService = new MockClubService();
    userService = new MockUserService();

    // Create test users
    const result1 = await userService.register({
      email: 'user1@example.com',
      password: 'password123',
      name: 'User One',
    });
    user1Id = result1.data!.id;

    const result2 = await userService.register({
      email: 'user2@example.com',
      password: 'password123',
      name: 'User Two',
    });
    user2Id = result2.data!.id;

    const result3 = await userService.register({
      email: 'user3@example.com',
      password: 'password123',
      name: 'User Three',
    });
    user3Id = result3.data!.id;
  });

  describe('createClub', () => {
    it('should create a club and make creator an admin', async () => {
      const result = await clubService.createClub({ name: 'Test Club' }, user1Id);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.name).toBe('Test Club');
      expect(result.data!.id).toBeDefined();

      // Verify creator is admin
      const isAdmin = await clubService.isClubAdmin(result.data!.id, user1Id);
      expect(isAdmin).toBe(true);
    });

    it('should create a club with optional fields', async () => {
      const result = await clubService.createClub(
        {
          name: 'Full Club',
          region: 'Sydney',
          logoUrl: 'https://example.com/logo.png',
          primaryColor: '#FF0000',
        },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.region).toBe('Sydney');
      expect(result.data!.logoUrl).toBe('https://example.com/logo.png');
      expect(result.data!.primaryColor).toBe('#FF0000');
    });

    it('should log club creation in audit log', async () => {
      const result = await clubService.createClub({ name: 'Audit Test Club' }, user1Id);
      const auditLog = await clubService.getAuditLog(result.data!.id);

      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[0].action).toBe('create');
      expect(auditLog[0].entityType).toBe('club');
    });
  });

  describe('getClub', () => {
    it('should return club by ID', async () => {
      const createResult = await clubService.createClub({ name: 'Test Club' }, user1Id);
      const club = await clubService.getClub(createResult.data!.id);

      expect(club).toBeDefined();
      expect(club!.name).toBe('Test Club');
    });

    it('should return null for non-existent club', async () => {
      const club = await clubService.getClub('non-existent-id');
      expect(club).toBeNull();
    });
  });

  describe('getUserClubs', () => {
    it('should return all clubs for a user', async () => {
      await clubService.createClub({ name: 'Club 1' }, user1Id);
      await clubService.createClub({ name: 'Club 2' }, user1Id);

      const clubs = await clubService.getUserClubs(user1Id);

      expect(clubs.length).toBe(2);
    });

    it('should return empty array for user with no clubs', async () => {
      const clubs = await clubService.getUserClubs(user2Id);
      expect(clubs.length).toBe(0);
    });
  });

  describe('Tenant Isolation', () => {
    it('two clubs should have isolated data', async () => {
      const club1Result = await clubService.createClub({ name: 'Club 1' }, user1Id);
      const club2Result = await clubService.createClub({ name: 'Club 2' }, user2Id);

      const club1Id = club1Result.data!.id;
      const club2Id = club2Result.data!.id;

      // Each creator should only be in their own club
      const club1Members = await clubService.getMembers(club1Id);
      const club2Members = await clubService.getMembers(club2Id);

      expect(club1Members.length).toBe(1);
      expect(club1Members[0].userId).toBe(user1Id);

      expect(club2Members.length).toBe(1);
      expect(club2Members[0].userId).toBe(user2Id);

      // User1 should not be member of club2
      const isMember = await clubService.isClubMember(club2Id, user1Id);
      expect(isMember).toBe(false);
    });
  });

  describe('createInvite', () => {
    let clubId: string;

    beforeEach(async () => {
      const result = await clubService.createClub({ name: 'Test Club' }, user1Id);
      clubId = result.data!.id;
    });

    it('should create an invite successfully', async () => {
      const result = await clubService.createInvite(
        clubId,
        { email: 'user2@example.com', role: 'player' },
        user1Id
      );

      expect(result.success).toBe(true);
      expect(result.data!.email).toBe('user2@example.com');
      expect(result.data!.role).toBe('player');
      expect(result.data!.status).toBe('pending');
    });

    it('should reject invite for existing member', async () => {
      const result = await clubService.createInvite(
        clubId,
        { email: 'user1@example.com', role: 'player' },
        user1Id
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('already_member');
    });

    it('should reject duplicate pending invite', async () => {
      await clubService.createInvite(clubId, { email: 'user2@example.com', role: 'player' }, user1Id);

      const result = await clubService.createInvite(
        clubId,
        { email: 'user2@example.com', role: 'organiser' },
        user1Id
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('already_invited');
    });

    it('should reject invite for non-existent club', async () => {
      const result = await clubService.createInvite(
        'non-existent-club',
        { email: 'user2@example.com', role: 'player' },
        user1Id
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('club_not_found');
    });
  });

  describe('getInvitesForEmail', () => {
    it('should return pending invites for email', async () => {
      const club1 = await clubService.createClub({ name: 'Club 1' }, user1Id);
      const club2 = await clubService.createClub({ name: 'Club 2' }, user1Id);

      await clubService.createInvite(club1.data!.id, { email: 'user2@example.com', role: 'player' }, user1Id);
      await clubService.createInvite(club2.data!.id, { email: 'user2@example.com', role: 'organiser' }, user1Id);

      const invites = await clubService.getInvitesForEmail('user2@example.com');

      expect(invites.length).toBe(2);
    });

    it('should handle case-insensitive email', async () => {
      const club = await clubService.createClub({ name: 'Test Club' }, user1Id);
      await clubService.createInvite(club.data!.id, { email: 'USER2@EXAMPLE.COM', role: 'player' }, user1Id);

      const invites = await clubService.getInvitesForEmail('user2@example.com');

      expect(invites.length).toBe(1);
    });
  });

  describe('acceptInvite', () => {
    let clubId: string;
    let inviteId: string;

    beforeEach(async () => {
      const clubResult = await clubService.createClub({ name: 'Test Club' }, user1Id);
      clubId = clubResult.data!.id;

      const inviteResult = await clubService.createInvite(
        clubId,
        { email: 'user2@example.com', role: 'player' },
        user1Id
      );
      inviteId = inviteResult.data!.id;
    });

    it('should accept invite and create membership', async () => {
      const result = await clubService.acceptInvite(inviteId, user2Id);

      expect(result.success).toBe(true);
      expect(result.data!.role).toBe('player');
      expect(result.data!.status).toBe('active');

      // Verify membership
      const isMember = await clubService.isClubMember(clubId, user2Id);
      expect(isMember).toBe(true);
    });

    it('should update invite status to accepted', async () => {
      await clubService.acceptInvite(inviteId, user2Id);

      const invite = await clubService.getInviteById(inviteId);
      expect(invite!.status).toBe('accepted');
    });

    it('should reject non-existent invite', async () => {
      const result = await clubService.acceptInvite('non-existent', user2Id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('invite_not_found');
    });

    it('should log invite acceptance in audit log', async () => {
      await clubService.acceptInvite(inviteId, user2Id);

      const auditLog = await clubService.getAuditLog(clubId);
      const acceptEntry = auditLog.find((e) => e.action === 'accept_invite');

      expect(acceptEntry).toBeDefined();
    });
  });

  describe('declineInvite', () => {
    it('should decline invite successfully', async () => {
      const clubResult = await clubService.createClub({ name: 'Test Club' }, user1Id);
      const inviteResult = await clubService.createInvite(
        clubResult.data!.id,
        { email: 'user2@example.com', role: 'player' },
        user1Id
      );

      const result = await clubService.declineInvite(inviteResult.data!.id);

      expect(result.success).toBe(true);

      // Verify invite status
      const invite = await clubService.getInviteById(inviteResult.data!.id);
      expect(invite!.status).toBe('declined');
    });
  });

  describe('getMembers', () => {
    it('should return all active members of a club', async () => {
      const clubResult = await clubService.createClub({ name: 'Test Club' }, user1Id);
      const clubId = clubResult.data!.id;

      // Invite and accept user2
      const inviteResult = await clubService.createInvite(
        clubId,
        { email: 'user2@example.com', role: 'player' },
        user1Id
      );
      await clubService.acceptInvite(inviteResult.data!.id, user2Id);

      const members = await clubService.getMembers(clubId);

      expect(members.length).toBe(2);
      expect(members.map((m) => m.userId)).toContain(user1Id);
      expect(members.map((m) => m.userId)).toContain(user2Id);
    });

    it('should include user name and email', async () => {
      const clubResult = await clubService.createClub({ name: 'Test Club' }, user1Id);
      const members = await clubService.getMembers(clubResult.data!.id);

      expect(members[0].userName).toBe('User One');
      expect(members[0].userEmail).toBe('user1@example.com');
    });
  });

  describe('updateMemberRole', () => {
    let clubId: string;

    beforeEach(async () => {
      const clubResult = await clubService.createClub({ name: 'Test Club' }, user1Id);
      clubId = clubResult.data!.id;

      // Add user2 as player
      const inviteResult = await clubService.createInvite(
        clubId,
        { email: 'user2@example.com', role: 'player' },
        user1Id
      );
      await clubService.acceptInvite(inviteResult.data!.id, user2Id);
    });

    it('should update member role', async () => {
      const result = await clubService.updateMemberRole(clubId, user2Id, 'organiser', user1Id);

      expect(result.success).toBe(true);
      expect(result.data!.role).toBe('organiser');
    });

    it('should log role change in audit log', async () => {
      await clubService.updateMemberRole(clubId, user2Id, 'organiser', user1Id);

      const auditLog = await clubService.getAuditLog(clubId);
      const roleChangeEntry = auditLog.find((e) => e.action === 'update_role');

      expect(roleChangeEntry).toBeDefined();
      expect(roleChangeEntry!.oldValues).toEqual({ role: 'player' });
      expect(roleChangeEntry!.newValues).toEqual({ role: 'organiser' });
    });

    it('should prevent removing last admin', async () => {
      const result = await clubService.updateMemberRole(clubId, user1Id, 'player', user1Id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('cannot_remove_last_admin');
    });

    it('should allow demoting admin if another admin exists', async () => {
      // Make user2 an admin first
      await clubService.updateMemberRole(clubId, user2Id, 'admin', user1Id);

      // Now user1 can be demoted
      const result = await clubService.updateMemberRole(clubId, user1Id, 'organiser', user2Id);

      expect(result.success).toBe(true);
      expect(result.data!.role).toBe('organiser');
    });

    it('should reject update for non-existent member', async () => {
      const result = await clubService.updateMemberRole(clubId, 'non-existent', 'player', user1Id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('member_not_found');
    });
  });

  describe('deactivateMember', () => {
    let clubId: string;

    beforeEach(async () => {
      const clubResult = await clubService.createClub({ name: 'Test Club' }, user1Id);
      clubId = clubResult.data!.id;

      // Add user2 as player
      const inviteResult = await clubService.createInvite(
        clubId,
        { email: 'user2@example.com', role: 'player' },
        user1Id
      );
      await clubService.acceptInvite(inviteResult.data!.id, user2Id);
    });

    it('should deactivate member', async () => {
      const result = await clubService.deactivateMember(clubId, user2Id, user1Id);

      expect(result.success).toBe(true);

      // Verify membership is inactive
      const isMember = await clubService.isClubMember(clubId, user2Id);
      expect(isMember).toBe(false);
    });

    it('should log deactivation in audit log', async () => {
      await clubService.deactivateMember(clubId, user2Id, user1Id);

      const auditLog = await clubService.getAuditLog(clubId);
      const deactivateEntry = auditLog.find((e) => e.action === 'deactivate_member');

      expect(deactivateEntry).toBeDefined();
      expect(deactivateEntry!.oldValues).toMatchObject({ status: 'active' });
      expect(deactivateEntry!.newValues).toMatchObject({ status: 'inactive' });
    });

    it('should prevent deactivating last admin', async () => {
      const result = await clubService.deactivateMember(clubId, user1Id, user1Id);

      expect(result.success).toBe(false);
      expect(result.error).toBe('cannot_remove_last_admin');
    });

    it('should preserve user globally after club deactivation', async () => {
      await clubService.deactivateMember(clubId, user2Id, user1Id);

      // User should still exist in users table
      const user = await userService.findById(user2Id);
      expect(user).toBeDefined();
      expect(user!.email).toBe('user2@example.com');
    });
  });

  describe('Multi-Club Membership', () => {
    it('same user can belong to multiple clubs', async () => {
      const club1Result = await clubService.createClub({ name: 'Club 1' }, user1Id);
      const club2Result = await clubService.createClub({ name: 'Club 2' }, user2Id);

      // Invite user3 to both clubs
      const invite1 = await clubService.createInvite(
        club1Result.data!.id,
        { email: 'user3@example.com', role: 'player' },
        user1Id
      );
      const invite2 = await clubService.createInvite(
        club2Result.data!.id,
        { email: 'user3@example.com', role: 'organiser' },
        user2Id
      );

      await clubService.acceptInvite(invite1.data!.id, user3Id);
      await clubService.acceptInvite(invite2.data!.id, user3Id);

      // User3 should be in both clubs
      const clubs = await clubService.getUserClubs(user3Id);
      expect(clubs.length).toBe(2);

      // With different roles in each
      const club1Membership = clubs.find((c) => c.clubId === club1Result.data!.id);
      const club2Membership = clubs.find((c) => c.clubId === club2Result.data!.id);

      expect(club1Membership!.role).toBe('player');
      expect(club2Membership!.role).toBe('organiser');
    });
  });

  describe('Authorization Helpers', () => {
    let clubId: string;

    beforeEach(async () => {
      const clubResult = await clubService.createClub({ name: 'Test Club' }, user1Id);
      clubId = clubResult.data!.id;

      // Add user2 as player
      const inviteResult = await clubService.createInvite(
        clubId,
        { email: 'user2@example.com', role: 'player' },
        user1Id
      );
      await clubService.acceptInvite(inviteResult.data!.id, user2Id);
    });

    it('isClubAdmin should return true for admin', async () => {
      const isAdmin = await clubService.isClubAdmin(clubId, user1Id);
      expect(isAdmin).toBe(true);
    });

    it('isClubAdmin should return false for non-admin member', async () => {
      const isAdmin = await clubService.isClubAdmin(clubId, user2Id);
      expect(isAdmin).toBe(false);
    });

    it('isClubAdmin should return false for non-member', async () => {
      const isAdmin = await clubService.isClubAdmin(clubId, user3Id);
      expect(isAdmin).toBe(false);
    });

    it('isClubMember should return true for any active member', async () => {
      const isMember1 = await clubService.isClubMember(clubId, user1Id);
      const isMember2 = await clubService.isClubMember(clubId, user2Id);

      expect(isMember1).toBe(true);
      expect(isMember2).toBe(true);
    });

    it('isClubMember should return false for non-member', async () => {
      const isMember = await clubService.isClubMember(clubId, user3Id);
      expect(isMember).toBe(false);
    });

    it('isClubMember should return false for deactivated member', async () => {
      await clubService.deactivateMember(clubId, user2Id, user1Id);

      const isMember = await clubService.isClubMember(clubId, user2Id);
      expect(isMember).toBe(false);
    });
  });

  describe('Audit Log', () => {
    it('should return audit entries for club actions', async () => {
      const clubResult = await clubService.createClub({ name: 'Test Club' }, user1Id);
      const clubId = clubResult.data!.id;

      // Create invite
      const inviteResult = await clubService.createInvite(
        clubId,
        { email: 'user2@example.com', role: 'player' },
        user1Id
      );

      // Accept invite
      await clubService.acceptInvite(inviteResult.data!.id, user2Id);

      const auditLog = await clubService.getAuditLog(clubId);

      // Should have 3 entries
      expect(auditLog.length).toBe(3);

      // Should contain all expected actions (order may vary due to same-millisecond timestamps)
      const actions = auditLog.map((e) => e.action);
      expect(actions).toContain('create');
      expect(actions).toContain('create_invite');
      expect(actions).toContain('accept_invite');
    });

    it('should respect limit parameter', async () => {
      const clubResult = await clubService.createClub({ name: 'Test Club' }, user1Id);
      const clubId = clubResult.data!.id;

      // Create multiple invites to generate audit entries
      await clubService.createInvite(clubId, { email: 'user2@example.com', role: 'player' }, user1Id);
      await clubService.createInvite(clubId, { email: 'user3@example.com', role: 'player' }, user1Id);

      const auditLog = await clubService.getAuditLog(clubId, 2);

      expect(auditLog.length).toBe(2);
    });
  });
});
