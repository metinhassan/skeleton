/**
 * Frontend types for Live Scoring
 * These match the backend service types
 */

export type MatchLiveStatus = 'not_started' | 'in_progress' | 'paused' | 'completed' | 'abandoned';

export interface LiveScore {
  id: string;
  matchId: string;
  currentSet: number;
  entry1Games: number[];
  entry2Games: number[];
  entry1Points: number;
  entry2Points: number;
  isTiebreak: boolean;
  tiebreakEntry1Points: number;
  tiebreakEntry2Points: number;
  servingEntry: 1 | 2;
  status: MatchLiveStatus;
  pauseReason: string | null;
  abandonReason: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  totalPauseDuration: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DisplayScore {
  sets: {
    entry1: number;
    entry2: number;
    tiebreak?: [number, number];
  }[];
  currentGame: {
    entry1: string;
    entry2: string;
  };
  serving: 1 | 2;
  status: MatchLiveStatus;
}

export interface MatchInfo {
  id: string;
  entry1Name: string;
  entry2Name: string;
  court: string | null;
  scheduledTime: string | null;
  competitionName: string;
}

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
  recordedAt: string;
}

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

// API response types
export interface LiveScoreResponse {
  score: LiveScore | null;
  displayScore: DisplayScore | null;
  match?: MatchInfo;
}

export interface LiveScoreActionResponse {
  success: boolean;
  score?: LiveScore;
  displayScore?: DisplayScore;
  error?: string;
  message?: string;
}

// SSE Event types
export type LiveEventType =
  | 'match_started'
  | 'score_change'
  | 'match_paused'
  | 'match_resumed'
  | 'match_completed'
  | 'match_abandoned'
  | 'heartbeat';

export interface LiveEvent {
  type: LiveEventType;
  matchId: string;
  timestamp: string;
  data: LiveEventData;
}

export interface LiveEventData {
  servingEntry?: 1 | 2;
  pointWinner?: 1 | 2;
  displayScore?: DisplayScore;
  pauseReason?: string;
  abandonReason?: string;
  finalScore?: string;
  winner?: string;
  isBreakPoint?: boolean;
  isSetPoint?: boolean;
  isMatchPoint?: boolean;
}

// Competition live matches
export interface CompetitionLiveData {
  competition: {
    id: string;
    name: string;
    slug: string;
  };
  liveMatches: Array<{
    matchId: string;
    entry1Name: string;
    entry2Name: string;
    court: string | null;
    displayScore: DisplayScore;
  }>;
}

// Bracket types
export interface BracketMatch {
  id: string;
  round: number;
  position: number;
  entry1Name: string | null;
  entry2Name: string | null;
  entry1Score: string | null;
  entry2Score: string | null;
  winnerId: string | null;
  status: 'upcoming' | 'in_progress' | 'completed';
}

export interface BracketData {
  format: string;
  rounds: BracketMatch[][];
}

// Standings types
export interface StandingsEntry {
  position: number;
  entryName: string;
  entryId: string;
  wins: number;
  losses: number;
  gamesFor: number;
  gamesAgainst: number;
  gamesDiff: number;
  points: number;
}

export interface StandingsData {
  division: string;
  standings: StandingsEntry[];
}
