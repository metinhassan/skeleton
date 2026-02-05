/**
 * Competition service interface
 * Abstracts competition, division, and scoring rule operations
 */

export type CompetitionFormat = 'knockout' | 'round_robin' | 'swiss' | 'ladder';
export type CompetitionType = 'tournament' | 'league';
export type CompetitionStatus = 'draft' | 'published' | 'in_progress' | 'completed' | 'cancelled';
export type ScoreEntryMode = 'organisers_only' | 'players_can_submit';

export interface ScoringRuleConfig {
  bestOfSets: number;
  gamesToWin: number;
  winBy: number;
  tiebreakAt: number;
  tiebreakPointsToWin: number;
  matchTiebreakInsteadOfFinalSet?: boolean;
}

export interface ScoringRule {
  id: string;
  clubId: string | null;
  name: string;
  config: ScoringRuleConfig;
  isPreset: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Competition {
  id: string;
  clubId: string;
  name: string;
  type: CompetitionType;
  format: CompetitionFormat;
  status: CompetitionStatus;
  scoreEntryMode: ScoreEntryMode;
  defaultScoringRuleId: string | null;
  publicSlug: string | null;
  startDate: string | null;
  endDate: string | null;
  createdBy: string;
  divisionCount: number;
  entryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type DivisionDrawStatus = 'not_generated' | 'generated' | 'in_progress' | 'completed';

export interface Division {
  id: string;
  competitionId: string;
  name: string;
  format: CompetitionFormat | null;
  scoringRuleId: string | null;
  sortOrder: number;
  entryCount: number;
  drawStatus: DivisionDrawStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCompetitionInput {
  name: string;
  type: CompetitionType;
  format: CompetitionFormat;
  scoreEntryMode?: ScoreEntryMode;
  defaultScoringRuleId?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateCompetitionInput {
  name?: string;
  type?: CompetitionType;
  format?: CompetitionFormat;
  scoreEntryMode?: ScoreEntryMode;
  defaultScoringRuleId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface CreateDivisionInput {
  name: string;
  format?: CompetitionFormat;
  scoringRuleId?: string;
  sortOrder?: number;
}

export interface UpdateDivisionInput {
  name?: string;
  format?: CompetitionFormat | null;
  scoringRuleId?: string | null;
  sortOrder?: number;
}

export interface CreateScoringRuleInput {
  name: string;
  config: ScoringRuleConfig;
}

export interface CompetitionServiceResult<T> {
  success: true;
  data: T;
}

export interface CompetitionServiceError {
  success: false;
  error: CompetitionErrorCode;
  message: string;
}

export type CompetitionErrorCode =
  | 'competition_not_found'
  | 'division_not_found'
  | 'scoring_rule_not_found'
  | 'club_not_found'
  | 'duplicate_division_name'
  | 'already_published'
  | 'cannot_publish_draft'
  | 'invalid_format'
  | 'invalid_status'
  | 'operation_failed';

export type CompetitionResult<T> = CompetitionServiceResult<T> | CompetitionServiceError;

export interface CompetitionService {
  // Competitions
  createCompetition(clubId: string, input: CreateCompetitionInput, createdBy: string): Promise<CompetitionResult<Competition>>;
  getCompetition(competitionId: string): Promise<Competition | null>;
  getCompetitionBySlug(slug: string, clubId: string): Promise<Competition | null>;
  getClubCompetitions(clubId: string, includeDrafts: boolean): Promise<Competition[]>;
  updateCompetition(competitionId: string, input: UpdateCompetitionInput, updatedBy: string): Promise<CompetitionResult<Competition>>;
  publishCompetition(competitionId: string, publishedBy: string): Promise<CompetitionResult<Competition>>;
  getPublicCompetition(slug: string): Promise<Competition | null>;

  // Divisions
  createDivision(competitionId: string, input: CreateDivisionInput): Promise<CompetitionResult<Division>>;
  getDivisions(competitionId: string): Promise<Division[]>;
  getDivision(divisionId: string): Promise<Division | null>;
  updateDivision(divisionId: string, input: UpdateDivisionInput): Promise<CompetitionResult<Division>>;
  deleteDivision(divisionId: string): Promise<CompetitionResult<void>>;

  // Scoring Rules
  getScoringRules(clubId: string): Promise<ScoringRule[]>;
  getScoringRule(ruleId: string): Promise<ScoringRule | null>;
  createScoringRule(clubId: string, input: CreateScoringRuleInput): Promise<CompetitionResult<ScoringRule>>;
}
