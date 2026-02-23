/**
 * Draw service interface
 * Abstracts draw generation, match scheduling, and result recording operations
 */

export type DrawType = 'single_elimination' | 'double_elimination' | 'round_robin';
export type DrawStatus = 'draft' | 'active' | 'completed';
export type MatchStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'walkover' | 'retired';

// Score for one set: [entry1Games, entry2Games] or [entry1Games, entry2Games, [tiebreak1, tiebreak2]]
export type SetScore = [number, number] | [number, number, [number, number]];

export interface DrawConfig {
  bracketSize?: number;
  hasConsolation?: boolean;
  thirdPlaceMatch?: boolean;
}

export interface Draw {
  id: string;
  divisionId: string;
  drawType: DrawType;
  status: DrawStatus;
  config: DrawConfig | null;
  createdAt: Date;
  updatedAt: Date;
}

export type BracketType = 'winners' | 'losers' | 'grand_final';

export interface Match {
  id: string;
  drawId: string;
  roundNumber: number;
  matchNumber: number;
  bracket: BracketType;
  entry1Id: string | null;
  entry2Id: string | null;
  winnerEntryId: string | null;
  score: SetScore[] | null;
  status: MatchStatus;
  scheduledTime: Date | null;
  court: string | null;
  sourceMatch1Id: string | null;
  sourceMatch2Id: string | null;
  loserNextMatchId: string | null;
  loserSlot: 1 | 2 | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Standing {
  id: string;
  drawId: string;
  entryId: string;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
  position: number | null;
  updatedAt: Date;
}

export interface DrawWithMatches extends Draw {
  matches: Match[];
}

export interface CreateDrawInput {
  drawType: DrawType;
  config?: DrawConfig;
}

export interface UpdateMatchInput {
  scheduledTime?: Date | null;
  court?: string | null;
  status?: 'scheduled' | 'in_progress';
}

export interface RecordResultInput {
  winnerId: string;
  score?: SetScore[];
  status: 'completed' | 'walkover' | 'retired';
}

// Internal type for match generation
export interface MatchSeed {
  roundNumber: number;
  matchNumber: number;
  entry1Id: string | null;
  entry2Id: string | null;
  sourceMatch1Num?: number;
  sourceMatch2Num?: number;
  isBye?: boolean;
  bracket?: BracketType;
  loserNextMatchNum?: number;
  loserSlot?: 1 | 2;
}

export interface DrawServiceResult<T> {
  success: true;
  data: T;
}

export interface DrawServiceError {
  success: false;
  error: DrawErrorCode;
  message: string;
}

export type DrawErrorCode =
  | 'draw_not_found'
  | 'match_not_found'
  | 'division_not_found'
  | 'entry_not_found'
  | 'invalid_winner'
  | 'draw_already_active'
  | 'draw_is_active'
  | 'draw_is_completed'
  | 'draw_not_active'
  | 'match_already_completed'
  | 'cannot_clear_result'
  | 'insufficient_entries'
  | 'invalid_draw_type'
  | 'invalid_score'
  | 'operation_failed';

export type DrawResult<T> = DrawServiceResult<T> | DrawServiceError;

export interface DrawService {
  // Draws
  createDraw(divisionId: string, input: CreateDrawInput): Promise<DrawResult<Draw>>;
  getDraw(drawId: string): Promise<Draw | null>;
  getDrawWithMatches(drawId: string): Promise<DrawWithMatches | null>;
  getDivisionDraws(divisionId: string): Promise<Draw[]>;
  activateDraw(drawId: string): Promise<DrawResult<Draw>>;
  deleteDraw(drawId: string): Promise<DrawResult<void>>;

  // Matches
  getMatch(matchId: string): Promise<Match | null>;
  getDrawMatches(drawId: string): Promise<Match[]>;
  updateMatch(matchId: string, input: UpdateMatchInput): Promise<DrawResult<Match>>;
  recordResult(matchId: string, input: RecordResultInput): Promise<DrawResult<Match>>;
  clearResult(matchId: string): Promise<DrawResult<Match>>;

  // Standings (round robin)
  getStandings(drawId: string): Promise<Standing[]>;
  recalculateStandings(drawId: string): Promise<void>;
}
