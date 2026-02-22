/**
 * Player service interface
 * Abstracts player profile, team, and entry operations
 */

export type EntryType = 'singles' | 'doubles';

export interface Player {
  id: string;
  clubId: string;
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  claimToken: string | null;
  claimTokenExpiresAt: Date | null;
  claimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Team {
  id: string;
  clubId: string;
  name: string;
  player1Id: string;
  player2Id: string;
  seed: number | null;
  rating: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type EntryStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface Entry {
  id: string;
  divisionId: string;
  entryType: EntryType;
  playerId: string | null;
  teamId: string | null;
  seed: number | null;
  status: EntryStatus;
  registeredByUserId: string | null;
  registeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlayerInput {
  name: string;
  email?: string;
  phone?: string;
}

export interface UpdatePlayerInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
}

export interface CreateTeamInput {
  name?: string;
  player1Id: string;
  player2Id: string;
  seed?: number;
  rating?: number;
}

export interface UpdateTeamInput {
  name?: string;
  seed?: number | null;
  rating?: number | null;
}

export interface CreateEntryInput {
  entryType: EntryType;
  playerId?: string;
  teamId?: string;
  seed?: number;
}

export interface UpdateEntryInput {
  seed?: number | null;
}

// Partner request types
export type PartnerRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface PartnerRequest {
  id: string;
  divisionId: string;
  requesterPlayerId: string;
  inviteePlayerId: string;
  status: PartnerRequestStatus;
  message: string | null;
  createdAt: Date;
  expiresAt: Date;
  respondedAt: Date | null;
}

export interface CreatePartnerRequestInput {
  divisionId: string;
  requesterPlayerId: string;
  inviteePlayerId: string;
  message?: string;
}

// Self-registration types
export interface SelfRegisterInput {
  entryType: EntryType;
  divisionId: string;
  partnerId?: string;
  seekingPartner?: boolean;
}

// Extended types with additional info
export interface EntryWithPlayer extends Entry {
  player?: Player;
  team?: Team;
}

export interface EntryWithCompetition extends Entry {
  divisionName: string;
  competitionName: string;
  competitionId: string;
  clubId: string;
}

export interface PartnerRequestWithDetails extends PartnerRequest {
  requesterPlayer: Player;
  inviteePlayer: Player;
  divisionName: string;
  competitionName: string;
}

export interface MatchWithDetails {
  id: string;
  drawId: string;
  roundNumber: number;
  matchNumber: number;
  entry1Id: string | null;
  entry2Id: string | null;
  entry1Name: string | null;
  entry2Name: string | null;
  winnerEntryId: string | null;
  score: unknown;
  status: string;
  scheduledTime: Date | null;
  court: string | null;
  divisionName: string;
  competitionName: string;
}

export interface PlayerDashboard {
  players: Player[];
  registrations: EntryWithCompetition[];
  upcomingMatches: MatchWithDetails[];
  recentResults: MatchWithDetails[];
  partnerRequests: PartnerRequestWithDetails[];
}

export interface PlayerServiceResult<T> {
  success: true;
  data: T;
}

export interface PlayerServiceError {
  success: false;
  error: PlayerErrorCode;
  message: string;
}

export type PlayerErrorCode =
  | 'player_not_found'
  | 'team_not_found'
  | 'entry_not_found'
  | 'division_not_found'
  | 'club_not_found'
  | 'competition_not_found'
  | 'duplicate_entry'
  | 'same_player_in_team'
  | 'player_already_in_division'
  | 'team_already_in_division'
  | 'invalid_entry_type'
  | 'operation_failed'
  | 'invalid_claim_token'
  | 'claim_token_expired'
  | 'profile_already_claimed'
  | 'email_mismatch'
  | 'registration_closed'
  | 'registration_deadline_passed'
  | 'already_registered'
  | 'partner_request_not_found'
  | 'partner_request_expired'
  | 'partner_request_already_responded'
  | 'cannot_request_self'
  | 'not_authorized'
  | 'entry_not_pending'
  | 'user_not_found';

export type PlayerResult<T> = PlayerServiceResult<T> | PlayerServiceError;

export interface BulkCreateEntriesResult {
  created: number;
  failed: { playerId: string; error: string }[];
}

export interface PlayerService {
  // Players
  createPlayer(clubId: string, input: CreatePlayerInput): Promise<PlayerResult<Player>>;
  getPlayer(playerId: string): Promise<Player | null>;
  getClubPlayers(clubId: string, search?: string): Promise<Player[]>;
  updatePlayer(playerId: string, input: UpdatePlayerInput): Promise<PlayerResult<Player>>;
  deletePlayer(playerId: string): Promise<PlayerResult<void>>;
  findDuplicates(clubId: string, name: string, email?: string): Promise<Player[]>;
  linkUserToPlayer(playerId: string, userId: string): Promise<PlayerResult<Player>>;

  // Teams
  createTeam(clubId: string, input: CreateTeamInput): Promise<PlayerResult<Team>>;
  getTeam(teamId: string): Promise<Team | null>;
  getClubTeams(clubId: string): Promise<Team[]>;
  updateTeam(teamId: string, input: UpdateTeamInput): Promise<PlayerResult<Team>>;
  deleteTeam(teamId: string): Promise<PlayerResult<void>>;

  // Entries
  createEntry(divisionId: string, input: CreateEntryInput): Promise<PlayerResult<Entry>>;
  getEntry(entryId: string): Promise<Entry | null>;
  getDivisionEntries(divisionId: string): Promise<EntryWithPlayer[]>;
  updateEntry(entryId: string, input: UpdateEntryInput): Promise<PlayerResult<Entry>>;
  deleteEntry(entryId: string): Promise<PlayerResult<void>>;
  checkPlayerInDivision(divisionId: string, playerId: string): Promise<boolean>;
  bulkCreateEntries(divisionId: string, playerIds: string[]): Promise<PlayerResult<BulkCreateEntriesResult>>;

  // Profile claiming (Epic 4)
  generateClaimToken(playerId: string): Promise<PlayerResult<{ token: string; expiresAt: Date }>>;
  claimProfile(token: string, userId: string, userEmail: string): Promise<PlayerResult<Player>>;
  getPlayersByUser(userId: string): Promise<Player[]>;

  // Self-registration (Epic 4)
  registerForCompetition(
    divisionId: string,
    userId: string,
    input: SelfRegisterInput
  ): Promise<PlayerResult<Entry>>;
  getPendingRegistrations(competitionId: string): Promise<EntryWithPlayer[]>;
  approveRegistration(entryId: string): Promise<PlayerResult<Entry>>;
  rejectRegistration(entryId: string, reason?: string): Promise<PlayerResult<Entry>>;
  withdrawRegistration(entryId: string, userId: string): Promise<PlayerResult<void>>;

  // Partner requests (Epic 4)
  createPartnerRequest(input: CreatePartnerRequestInput): Promise<PlayerResult<PartnerRequest>>;
  getPartnerRequest(requestId: string): Promise<PartnerRequest | null>;
  getPartnerRequestsForPlayer(playerId: string): Promise<PartnerRequest[]>;
  getPartnerRequestsForUser(userId: string): Promise<PartnerRequestWithDetails[]>;
  acceptPartnerRequest(requestId: string, userId: string): Promise<PlayerResult<Entry>>;
  declinePartnerRequest(requestId: string, userId: string): Promise<PlayerResult<void>>;

  // Dashboard (Epic 4)
  getPlayerDashboard(userId: string): Promise<PlayerDashboard>;
}
