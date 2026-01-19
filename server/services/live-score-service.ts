/**
 * Live Score Service Interface
 * Handles real-time tennis match scoring with point-by-point tracking
 */

// Match live scoring status
export type MatchLiveStatus = 'not_started' | 'in_progress' | 'paused' | 'completed' | 'abandoned';

// Tennis point values for display (0, 15, 30, 40, AD)
export type GamePoints = 0 | 15 | 30 | 40;

// Live score state for a match
export interface LiveScore {
  id: string;
  matchId: string;
  currentSet: number;
  entry1Games: number[]; // Games won per set, e.g., [6, 4, 3] for 3 sets
  entry2Games: number[]; // Games won per set
  entry1Points: number; // Points in current game (0-4+, where 4+ = AD situations)
  entry2Points: number;
  isTiebreak: boolean;
  tiebreakEntry1Points: number;
  tiebreakEntry2Points: number;
  servingEntry: 1 | 2;
  status: MatchLiveStatus;
  pauseReason: string | null;
  abandonReason: string | null;
  startedAt: Date | null;
  pausedAt: Date | null;
  totalPauseDuration: number; // seconds
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Score snapshot for point history
export interface ScoreSnapshot {
  currentSet: number;
  entry1Games: number[];
  entry2Games: number[];
  entry1Points: number;
  entry2Points: number;
  isTiebreak: boolean;
  tiebreakEntry1Points: number;
  tiebreakEntry2Points: number;
  servingEntry: 1 | 2;
}

// Point history entry
export interface PointHistoryEntry {
  id: string;
  matchId: string;
  sequenceNumber: number;
  setNumber: number;
  gameNumber: number;
  pointNumber: number;
  winnerEntry: 1 | 2;
  scoreBefore: ScoreSnapshot;
  scoreAfter: ScoreSnapshot;
  isBreakPoint: boolean;
  isSetPoint: boolean;
  isMatchPoint: boolean;
  recordedAt: Date;
}

// Display-friendly score format
export interface DisplayScore {
  sets: {
    entry1: number;
    entry2: number;
    tiebreak?: [number, number];
  }[];
  currentGame: {
    entry1: string; // "0", "15", "30", "40", "AD", or tiebreak points
    entry2: string;
  };
  serving: 1 | 2;
  status: MatchLiveStatus;
}

// Input for starting a match
export interface StartMatchInput {
  servingEntry: 1 | 2;
}

// Input for recording a point
export interface RecordPointInput {
  winnerEntry: 1 | 2;
}

// Input for pausing/resuming
export interface PauseMatchInput {
  reason: string;
}

// Input for abandoning
export interface AbandonMatchInput {
  reason: string;
}

// Result types following existing pattern
export interface LiveScoreServiceResult<T> {
  success: true;
  data: T;
}

export interface LiveScoreServiceError {
  success: false;
  error: LiveScoreErrorCode;
  message: string;
}

export type LiveScoreErrorCode =
  | 'match_not_found'
  | 'live_score_not_found'
  | 'match_not_started'
  | 'match_already_started'
  | 'match_not_in_progress'
  | 'match_not_paused'
  | 'match_already_completed'
  | 'match_already_abandoned'
  | 'no_points_to_undo'
  | 'invalid_serving_entry'
  | 'invalid_winner_entry'
  | 'operation_failed';

export type LiveScoreResult<T> = LiveScoreServiceResult<T> | LiveScoreServiceError;

export interface LiveScoreService {
  // Score retrieval
  getLiveScore(matchId: string): Promise<LiveScore | null>;
  getDisplayScore(matchId: string): Promise<DisplayScore | null>;
  getLiveMatchesForCompetition(competitionId: string): Promise<LiveScore[]>;

  // Match lifecycle
  startMatch(matchId: string, input: StartMatchInput): Promise<LiveScoreResult<LiveScore>>;
  pauseMatch(matchId: string, input: PauseMatchInput): Promise<LiveScoreResult<LiveScore>>;
  resumeMatch(matchId: string): Promise<LiveScoreResult<LiveScore>>;
  abandonMatch(matchId: string, input: AbandonMatchInput): Promise<LiveScoreResult<LiveScore>>;

  // Point recording
  recordPoint(matchId: string, input: RecordPointInput): Promise<LiveScoreResult<LiveScore>>;
  undoLastPoint(matchId: string): Promise<LiveScoreResult<LiveScore>>;

  // Point history
  getPointHistory(matchId: string): Promise<PointHistoryEntry[]>;
}
