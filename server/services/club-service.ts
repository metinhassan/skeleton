/**
 * Club service interface
 * Abstracts club/tenant operations for multi-tenant support
 */

export type ClubRole = 'admin' | 'organiser' | 'supervisor' | 'player';
export type MemberStatus = 'active' | 'inactive';
export type InviteStatus = 'pending' | 'accepted' | 'declined';

export interface Club {
  id: string;
  name: string;
  region: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClubMembership {
  id: string;
  clubId: string;
  userId: string;
  role: ClubRole;
  status: MemberStatus;
  createdAt: Date;
  updatedAt: Date;
  // Joined data
  club?: Club;
  userName?: string;
  userEmail?: string;
}

export interface ClubInvite {
  id: string;
  clubId: string;
  email: string;
  role: ClubRole;
  status: InviteStatus;
  invitedBy: string;
  createdAt: Date;
  // Joined data
  clubName?: string;
}

export interface AuditLogEntry {
  id: string;
  clubId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CreateClubInput {
  name: string;
  region?: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface CreateInviteInput {
  email: string;
  role: ClubRole;
}

export interface ClubServiceResult<T> {
  success: true;
  data: T;
}

export interface ClubServiceError {
  success: false;
  error: ClubErrorCode;
  message: string;
}

export type ClubErrorCode =
  | 'club_not_found'
  | 'invite_not_found'
  | 'member_not_found'
  | 'already_member'
  | 'already_invited'
  | 'not_authorized'
  | 'invalid_role'
  | 'cannot_remove_last_admin'
  | 'operation_failed';

export type ClubResult<T> = ClubServiceResult<T> | ClubServiceError;

export interface ClubService {
  // Club management
  createClub(input: CreateClubInput, creatorUserId: string): Promise<ClubResult<Club>>;
  getClub(clubId: string): Promise<Club | null>;
  getUserClubs(userId: string): Promise<ClubMembership[]>;

  // Invitations
  createInvite(clubId: string, input: CreateInviteInput, invitedBy: string): Promise<ClubResult<ClubInvite>>;
  getInvitesForEmail(email: string): Promise<ClubInvite[]>;
  getInviteById(inviteId: string): Promise<ClubInvite | null>;
  acceptInvite(inviteId: string, userId: string): Promise<ClubResult<ClubMembership>>;
  declineInvite(inviteId: string): Promise<ClubResult<void>>;

  // Member management
  getMembers(clubId: string): Promise<ClubMembership[]>;
  getMembership(clubId: string, userId: string): Promise<ClubMembership | null>;
  updateMemberRole(clubId: string, userId: string, newRole: ClubRole, changedBy: string): Promise<ClubResult<ClubMembership>>;
  deactivateMember(clubId: string, userId: string, changedBy: string): Promise<ClubResult<void>>;

  // Authorization helpers
  isClubAdmin(clubId: string, userId: string): Promise<boolean>;
  isClubMember(clubId: string, userId: string): Promise<boolean>;

  // Audit log
  getAuditLog(clubId: string, limit?: number): Promise<AuditLogEntry[]>;
}
