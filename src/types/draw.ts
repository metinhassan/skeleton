/**
 * Draw-related type definitions for tournament bracket generation
 */

export type DrawType = 'single_elimination' | 'double_elimination' | 'round_robin';
export type DrawStatus = 'draft' | 'active' | 'completed';
export type MatchStatus = 'not_started' | 'in_progress' | 'completed' | 'walkover' | 'bye';

export interface Draw {
  id: string;
  divisionId: string;
  drawType: DrawType;
  status: DrawStatus;
  bracketSize: number | null;
  totalRounds: number | null;
  byeCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Match {
  id: string;
  drawId: string;
  roundNumber: number;
  matchNumber: number;
  entry1Id: string | null;
  entry2Id: string | null;
  winnerId: string | null;
  entry1Score: number | null;
  entry2Score: number | null;
  score: number[][] | null;
  status: MatchStatus;
  scheduledTime: string | null;
  court: string | null;
  nextMatchId: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated fields
  entry1Name?: string;
  entry2Name?: string;
  winnerName?: string;
}

export interface DrawWithMatches extends Draw {
  matches: Match[];
}

export interface Standing {
  entryId: string;
  entryName: string;
  position: number;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
}

export interface CreateDrawData {
  drawType: DrawType;
}

export interface DrawListResponse {
  draws: Draw[];
}

export interface DrawResponse {
  draw: DrawWithMatches;
}

export interface StandingsResponse {
  standings: Standing[];
}
