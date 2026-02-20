/**
 * Competition-related type definitions for tournament management
 */

export type CompetitionType = 'tournament' | 'league';
export type CompetitionFormat = 'knockout' | 'round_robin' | 'swiss' | 'ladder';
export type CompetitionStatus = 'draft' | 'published' | 'in_progress' | 'completed' | 'cancelled';
export type RegistrationMode = 'organizer_only' | 'self_registration';
export type ScoreEntryMode = 'organisers_only' | 'players_can_submit';

export interface Competition {
  id: string;
  clubId: string;
  name: string;
  slug: string;
  type: CompetitionType;
  format: CompetitionFormat;
  status: CompetitionStatus;
  registrationMode: RegistrationMode;
  scoreEntryMode: ScoreEntryMode;
  requiresApproval: boolean;
  registrationDeadline: string | null;
  startDate: string | null;
  endDate: string | null;
  entryCount: number;
  divisionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompetitionData {
  name: string;
  type: CompetitionType;
  format: CompetitionFormat;
  startDate?: string;
  endDate?: string;
  scoreEntryMode?: ScoreEntryMode;
}

export interface UpdateCompetitionData extends Partial<CreateCompetitionData> {
  registrationMode?: RegistrationMode;
  requiresApproval?: boolean;
  registrationDeadline?: string;
}

export interface CompetitionListResponse {
  competitions: Competition[];
}

export interface CompetitionResponse {
  competition: Competition;
}
