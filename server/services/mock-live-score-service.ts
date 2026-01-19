/**
 * Mock live score service implementation using SQLite
 * Implements full tennis scoring logic including:
 * - Point progression (0, 15, 30, 40, Game)
 * - Deuce/Advantage handling
 * - Tiebreak at 6-6 (first to 7, 2-point lead)
 * - Set win at 6+ games with 2-game lead
 * - Match win at 2 sets (best of 3)
 * - Server alternation
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database.js';
import type {
  LiveScoreService,
  LiveScore,
  DisplayScore,
  PointHistoryEntry,
  ScoreSnapshot,
  StartMatchInput,
  RecordPointInput,
  PauseMatchInput,
  AbandonMatchInput,
  LiveScoreResult,
  MatchLiveStatus,
} from './live-score-service.js';

// Database row types
interface DbLiveScore {
  id: string;
  match_id: string;
  current_set: number;
  entry1_games: string;
  entry2_games: string;
  entry1_points: number;
  entry2_points: number;
  is_tiebreak: number;
  tiebreak_entry1_points: number;
  tiebreak_entry2_points: number;
  serving_entry: number;
  status: string;
  pause_reason: string | null;
  abandon_reason: string | null;
  started_at: string | null;
  paused_at: string | null;
  total_pause_duration: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DbPointHistory {
  id: string;
  match_id: string;
  sequence_number: number;
  set_number: number;
  game_number: number;
  point_number: number;
  winner_entry: number;
  score_before: string;
  score_after: string;
  is_break_point: number;
  is_set_point: number;
  is_match_point: number;
  recorded_at: string;
}

interface DbMatch {
  id: string;
  draw_id: string;
  entry1_id: string | null;
  entry2_id: string | null;
  status: string;
}

interface DbDraw {
  id: string;
  division_id: string;
}

interface DbDivision {
  id: string;
  competition_id: string;
}

// Tennis scoring configuration (best of 3 sets)
const SCORING_CONFIG = {
  setsToWin: 2,
  gamesToWinSet: 6,
  gamesLeadToWinSet: 2,
  tiebreakAtGames: 6,
  tiebreakPointsToWin: 7,
  tiebreakPointsLead: 2,
};

export class MockLiveScoreService implements LiveScoreService {
  private mapRowToLiveScore(row: DbLiveScore): LiveScore {
    return {
      id: row.id,
      matchId: row.match_id,
      currentSet: row.current_set,
      entry1Games: JSON.parse(row.entry1_games),
      entry2Games: JSON.parse(row.entry2_games),
      entry1Points: row.entry1_points,
      entry2Points: row.entry2_points,
      isTiebreak: row.is_tiebreak === 1,
      tiebreakEntry1Points: row.tiebreak_entry1_points,
      tiebreakEntry2Points: row.tiebreak_entry2_points,
      servingEntry: row.serving_entry as 1 | 2,
      status: row.status as MatchLiveStatus,
      pauseReason: row.pause_reason,
      abandonReason: row.abandon_reason,
      startedAt: row.started_at ? new Date(row.started_at) : null,
      pausedAt: row.paused_at ? new Date(row.paused_at) : null,
      totalPauseDuration: row.total_pause_duration,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToPointHistory(row: DbPointHistory): PointHistoryEntry {
    return {
      id: row.id,
      matchId: row.match_id,
      sequenceNumber: row.sequence_number,
      setNumber: row.set_number,
      gameNumber: row.game_number,
      pointNumber: row.point_number,
      winnerEntry: row.winner_entry as 1 | 2,
      scoreBefore: JSON.parse(row.score_before),
      scoreAfter: JSON.parse(row.score_after),
      isBreakPoint: row.is_break_point === 1,
      isSetPoint: row.is_set_point === 1,
      isMatchPoint: row.is_match_point === 1,
      recordedAt: new Date(row.recorded_at),
    };
  }

  private createScoreSnapshot(score: LiveScore): ScoreSnapshot {
    return {
      currentSet: score.currentSet,
      entry1Games: [...score.entry1Games],
      entry2Games: [...score.entry2Games],
      entry1Points: score.entry1Points,
      entry2Points: score.entry2Points,
      isTiebreak: score.isTiebreak,
      tiebreakEntry1Points: score.tiebreakEntry1Points,
      tiebreakEntry2Points: score.tiebreakEntry2Points,
      servingEntry: score.servingEntry,
    };
  }

  private getMatchInfo(matchId: string): DbMatch | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as DbMatch | undefined ?? null;
  }

  // Convert internal points to display string
  private pointsToDisplay(points: number, opponentPoints: number, isTiebreak: boolean): string {
    if (isTiebreak) {
      return points.toString();
    }

    // Regular game scoring
    const pointValues = ['0', '15', '30', '40'];
    if (points <= 3 && opponentPoints <= 3) {
      if (points === 3 && opponentPoints === 3) {
        return '40'; // Deuce
      }
      return pointValues[points];
    }

    // Deuce/Advantage situations (points >= 3)
    if (points === opponentPoints) {
      return '40'; // Deuce
    }
    if (points > opponentPoints) {
      return 'AD';
    }
    return '40'; // Opponent has advantage
  }

  // ==================== Score Retrieval ====================

  async getLiveScore(matchId: string): Promise<LiveScore | null> {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM match_live_scores WHERE match_id = ?').get(matchId) as DbLiveScore | undefined;
    return row ? this.mapRowToLiveScore(row) : null;
  }

  async getDisplayScore(matchId: string): Promise<DisplayScore | null> {
    const score = await this.getLiveScore(matchId);
    if (!score) return null;

    const sets: DisplayScore['sets'] = [];

    // Build set scores
    const maxSets = Math.max(score.entry1Games.length, score.entry2Games.length);
    for (let i = 0; i < maxSets; i++) {
      const entry1 = score.entry1Games[i] || 0;
      const entry2 = score.entry2Games[i] || 0;
      sets.push({ entry1, entry2 });
    }

    // Current game display
    let currentGame: DisplayScore['currentGame'];
    if (score.isTiebreak) {
      currentGame = {
        entry1: score.tiebreakEntry1Points.toString(),
        entry2: score.tiebreakEntry2Points.toString(),
      };
    } else {
      currentGame = {
        entry1: this.pointsToDisplay(score.entry1Points, score.entry2Points, false),
        entry2: this.pointsToDisplay(score.entry2Points, score.entry1Points, false),
      };
    }

    return {
      sets,
      currentGame,
      serving: score.servingEntry,
      status: score.status,
    };
  }

  async getLiveMatchesForCompetition(competitionId: string): Promise<LiveScore[]> {
    const db = getDatabase();

    // Get all live scores for matches in this competition
    const rows = db.prepare(`
      SELECT mls.*
      FROM match_live_scores mls
      JOIN matches m ON mls.match_id = m.id
      JOIN draws d ON m.draw_id = d.id
      JOIN divisions div ON d.division_id = div.id
      WHERE div.competition_id = ?
        AND mls.status IN ('in_progress', 'paused')
    `).all(competitionId) as DbLiveScore[];

    return rows.map(row => this.mapRowToLiveScore(row));
  }

  // ==================== Match Lifecycle ====================

  async startMatch(matchId: string, input: StartMatchInput): Promise<LiveScoreResult<LiveScore>> {
    const match = this.getMatchInfo(matchId);
    if (!match) {
      return { success: false, error: 'match_not_found', message: 'Match not found' };
    }

    if (!match.entry1_id || !match.entry2_id) {
      return { success: false, error: 'match_not_found', message: 'Match entries not set' };
    }

    if (input.servingEntry !== 1 && input.servingEntry !== 2) {
      return { success: false, error: 'invalid_serving_entry', message: 'Serving entry must be 1 or 2' };
    }

    // Check if already started
    const existing = await this.getLiveScore(matchId);
    if (existing && existing.status !== 'not_started') {
      return { success: false, error: 'match_already_started', message: 'Match has already started' };
    }

    const db = getDatabase();
    const now = new Date().toISOString();
    const id = existing?.id || uuidv4();

    if (existing) {
      // Update existing record
      db.prepare(`
        UPDATE match_live_scores
        SET serving_entry = ?, status = 'in_progress', started_at = ?, updated_at = ?
        WHERE id = ?
      `).run(input.servingEntry, now, now, id);
    } else {
      // Create new record
      db.prepare(`
        INSERT INTO match_live_scores (
          id, match_id, current_set, entry1_games, entry2_games,
          entry1_points, entry2_points, is_tiebreak,
          tiebreak_entry1_points, tiebreak_entry2_points,
          serving_entry, status, started_at, created_at, updated_at
        ) VALUES (?, ?, 1, '[]', '[]', 0, 0, 0, 0, 0, ?, 'in_progress', ?, ?, ?)
      `).run(id, matchId, input.servingEntry, now, now, now);
    }

    // Update match status in matches table
    db.prepare(`UPDATE matches SET status = 'in_progress', updated_at = ? WHERE id = ?`).run(now, matchId);

    const score = await this.getLiveScore(matchId);
    return { success: true, data: score! };
  }

  async pauseMatch(matchId: string, input: PauseMatchInput): Promise<LiveScoreResult<LiveScore>> {
    const score = await this.getLiveScore(matchId);
    if (!score) {
      return { success: false, error: 'live_score_not_found', message: 'Live score not found' };
    }

    if (score.status !== 'in_progress') {
      return { success: false, error: 'match_not_in_progress', message: 'Match is not in progress' };
    }

    const db = getDatabase();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE match_live_scores
      SET status = 'paused', pause_reason = ?, paused_at = ?, updated_at = ?
      WHERE match_id = ?
    `).run(input.reason, now, now, matchId);

    const updated = await this.getLiveScore(matchId);
    return { success: true, data: updated! };
  }

  async resumeMatch(matchId: string): Promise<LiveScoreResult<LiveScore>> {
    const score = await this.getLiveScore(matchId);
    if (!score) {
      return { success: false, error: 'live_score_not_found', message: 'Live score not found' };
    }

    if (score.status !== 'paused') {
      return { success: false, error: 'match_not_paused', message: 'Match is not paused' };
    }

    const db = getDatabase();
    const now = new Date();
    const pausedDuration = score.pausedAt
      ? Math.floor((now.getTime() - score.pausedAt.getTime()) / 1000)
      : 0;

    db.prepare(`
      UPDATE match_live_scores
      SET status = 'in_progress', pause_reason = NULL, paused_at = NULL,
          total_pause_duration = total_pause_duration + ?, updated_at = ?
      WHERE match_id = ?
    `).run(pausedDuration, now.toISOString(), matchId);

    const updated = await this.getLiveScore(matchId);
    return { success: true, data: updated! };
  }

  async abandonMatch(matchId: string, input: AbandonMatchInput): Promise<LiveScoreResult<LiveScore>> {
    const score = await this.getLiveScore(matchId);
    if (!score) {
      return { success: false, error: 'live_score_not_found', message: 'Live score not found' };
    }

    if (score.status === 'completed') {
      return { success: false, error: 'match_already_completed', message: 'Match is already completed' };
    }

    if (score.status === 'abandoned') {
      return { success: false, error: 'match_already_abandoned', message: 'Match is already abandoned' };
    }

    const db = getDatabase();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE match_live_scores
      SET status = 'abandoned', abandon_reason = ?, completed_at = ?, updated_at = ?
      WHERE match_id = ?
    `).run(input.reason, now, now, matchId);

    // Update match status
    db.prepare(`UPDATE matches SET status = 'retired', updated_at = ? WHERE id = ?`).run(now, matchId);

    const updated = await this.getLiveScore(matchId);
    return { success: true, data: updated! };
  }

  // ==================== Point Recording ====================

  async recordPoint(matchId: string, input: RecordPointInput): Promise<LiveScoreResult<LiveScore>> {
    const score = await this.getLiveScore(matchId);
    if (!score) {
      return { success: false, error: 'live_score_not_found', message: 'Live score not found' };
    }

    if (score.status !== 'in_progress') {
      return { success: false, error: 'match_not_in_progress', message: 'Match is not in progress' };
    }

    if (input.winnerEntry !== 1 && input.winnerEntry !== 2) {
      return { success: false, error: 'invalid_winner_entry', message: 'Winner entry must be 1 or 2' };
    }

    const db = getDatabase();
    const scoreBefore = this.createScoreSnapshot(score);

    // Get current point context for history
    const currentSetIndex = score.currentSet - 1;
    const entry1GamesInSet = score.entry1Games[currentSetIndex] || 0;
    const entry2GamesInSet = score.entry2Games[currentSetIndex] || 0;
    const gameNumber = entry1GamesInSet + entry2GamesInSet + 1;

    // Calculate point number in game
    let pointNumber: number;
    if (score.isTiebreak) {
      pointNumber = score.tiebreakEntry1Points + score.tiebreakEntry2Points + 1;
    } else {
      // Count total points played in current game
      const totalPoints = Math.max(
        score.entry1Points + score.entry2Points,
        // Account for deuce situations
        score.entry1Points >= 3 && score.entry2Points >= 3
          ? (score.entry1Points - 2) + (score.entry2Points - 2) + 4
          : score.entry1Points + score.entry2Points
      );
      pointNumber = totalPoints + 1;
    }

    // Detect special point situations
    const isBreakPoint = this.isBreakPoint(score);
    const isSetPoint = this.isSetPoint(score);
    const isMatchPoint = this.isMatchPoint(score);

    // Process the point
    const newScore = this.processPoint(score, input.winnerEntry);
    const scoreAfter = this.createScoreSnapshot(newScore);

    // Get sequence number for history
    const lastHistory = db.prepare(
      'SELECT MAX(sequence_number) as maxSeq FROM match_point_history WHERE match_id = ?'
    ).get(matchId) as { maxSeq: number | null } | undefined;
    const sequenceNumber = (lastHistory?.maxSeq || 0) + 1;

    // Record point history
    const historyId = uuidv4();
    db.prepare(`
      INSERT INTO match_point_history (
        id, match_id, sequence_number, set_number, game_number, point_number,
        winner_entry, score_before, score_after,
        is_break_point, is_set_point, is_match_point, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      historyId, matchId, sequenceNumber, score.currentSet, gameNumber, pointNumber,
      input.winnerEntry, JSON.stringify(scoreBefore), JSON.stringify(scoreAfter),
      isBreakPoint ? 1 : 0, isSetPoint ? 1 : 0, isMatchPoint ? 1 : 0
    );

    // Update live score
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE match_live_scores
      SET current_set = ?, entry1_games = ?, entry2_games = ?,
          entry1_points = ?, entry2_points = ?,
          is_tiebreak = ?, tiebreak_entry1_points = ?, tiebreak_entry2_points = ?,
          serving_entry = ?, status = ?, completed_at = ?, updated_at = ?
      WHERE match_id = ?
    `).run(
      newScore.currentSet,
      JSON.stringify(newScore.entry1Games),
      JSON.stringify(newScore.entry2Games),
      newScore.entry1Points,
      newScore.entry2Points,
      newScore.isTiebreak ? 1 : 0,
      newScore.tiebreakEntry1Points,
      newScore.tiebreakEntry2Points,
      newScore.servingEntry,
      newScore.status,
      newScore.completedAt?.toISOString() || null,
      now,
      matchId
    );

    // If match completed, update matches table
    if (newScore.status === 'completed') {
      const match = this.getMatchInfo(matchId)!;
      const winnerEntryId = this.getMatchWinner(newScore, match);

      // Build final score in the format expected by draw service
      const finalScore = this.buildFinalScore(newScore);

      db.prepare(`
        UPDATE matches
        SET status = 'completed', winner_entry_id = ?, score = ?, updated_at = ?
        WHERE id = ?
      `).run(winnerEntryId, JSON.stringify(finalScore), now, matchId);
    }

    const updated = await this.getLiveScore(matchId);
    return { success: true, data: updated! };
  }

  private processPoint(score: LiveScore, winnerEntry: 1 | 2): LiveScore {
    const newScore: LiveScore = {
      ...score,
      entry1Games: [...score.entry1Games],
      entry2Games: [...score.entry2Games],
      updatedAt: new Date(),
    };

    if (score.isTiebreak) {
      return this.processTiebreakPoint(newScore, winnerEntry);
    } else {
      return this.processRegularPoint(newScore, winnerEntry);
    }
  }

  private processRegularPoint(score: LiveScore, winnerEntry: 1 | 2): LiveScore {
    // Add point to winner
    if (winnerEntry === 1) {
      score.entry1Points++;
    } else {
      score.entry2Points++;
    }

    // Check for game win
    const gameWon = this.checkGameWin(score);
    if (gameWon) {
      return this.processGameWin(score, gameWon);
    }

    // If we're in a deuce situation (both at 3+) and scores are equal, normalize to 3-3
    // This handles returning to deuce from advantage
    if (score.entry1Points >= 3 && score.entry2Points >= 3 && score.entry1Points === score.entry2Points) {
      score.entry1Points = 3;
      score.entry2Points = 3;
    }

    return score;
  }

  private checkGameWin(score: LiveScore): 1 | 2 | null {
    const p1 = score.entry1Points;
    const p2 = score.entry2Points;

    // Need at least 4 points to win (0, 15, 30, 40, game)
    if (p1 < 4 && p2 < 4) return null;

    // Win by at least 2 points when at deuce (3-3) or above
    if (p1 >= 4 && p1 - p2 >= 2) return 1;
    if (p2 >= 4 && p2 - p1 >= 2) return 2;

    return null;
  }

  private processGameWin(score: LiveScore, winner: 1 | 2): LiveScore {
    const currentSetIndex = score.currentSet - 1;

    // Ensure arrays are long enough
    while (score.entry1Games.length <= currentSetIndex) {
      score.entry1Games.push(0);
      score.entry2Games.push(0);
    }

    // Add game to winner
    if (winner === 1) {
      score.entry1Games[currentSetIndex]++;
    } else {
      score.entry2Games[currentSetIndex]++;
    }

    // Reset points
    score.entry1Points = 0;
    score.entry2Points = 0;

    // Switch server
    score.servingEntry = score.servingEntry === 1 ? 2 : 1;

    // Check for set win
    const setWon = this.checkSetWin(score);
    if (setWon) {
      return this.processSetWin(score, setWon);
    }

    // Check for tiebreak
    const g1 = score.entry1Games[currentSetIndex];
    const g2 = score.entry2Games[currentSetIndex];
    if (g1 === SCORING_CONFIG.tiebreakAtGames && g2 === SCORING_CONFIG.tiebreakAtGames) {
      score.isTiebreak = true;
      score.tiebreakEntry1Points = 0;
      score.tiebreakEntry2Points = 0;
    }

    return score;
  }

  private checkSetWin(score: LiveScore): 1 | 2 | null {
    const currentSetIndex = score.currentSet - 1;
    const g1 = score.entry1Games[currentSetIndex];
    const g2 = score.entry2Games[currentSetIndex];

    // Win by 2 games with at least 6 games
    if (g1 >= SCORING_CONFIG.gamesToWinSet && g1 - g2 >= SCORING_CONFIG.gamesLeadToWinSet) return 1;
    if (g2 >= SCORING_CONFIG.gamesToWinSet && g2 - g1 >= SCORING_CONFIG.gamesLeadToWinSet) return 2;

    return null;
  }

  private processTiebreakPoint(score: LiveScore, winnerEntry: 1 | 2): LiveScore {
    // Add point to winner
    if (winnerEntry === 1) {
      score.tiebreakEntry1Points++;
    } else {
      score.tiebreakEntry2Points++;
    }

    // Check for tiebreak win
    const tb1 = score.tiebreakEntry1Points;
    const tb2 = score.tiebreakEntry2Points;
    const minToWin = SCORING_CONFIG.tiebreakPointsToWin;

    let tiebreakWinner: 1 | 2 | null = null;
    if (tb1 >= minToWin && tb1 - tb2 >= SCORING_CONFIG.tiebreakPointsLead) {
      tiebreakWinner = 1;
    } else if (tb2 >= minToWin && tb2 - tb1 >= SCORING_CONFIG.tiebreakPointsLead) {
      tiebreakWinner = 2;
    }

    // Server change: every 2 points after the first
    const totalTbPoints = tb1 + tb2;
    if (totalTbPoints > 0 && (totalTbPoints - 1) % 2 === 0) {
      score.servingEntry = score.servingEntry === 1 ? 2 : 1;
    }

    if (tiebreakWinner) {
      // Record the tiebreak score in current set's games
      const currentSetIndex = score.currentSet - 1;
      if (tiebreakWinner === 1) {
        score.entry1Games[currentSetIndex] = 7;
      } else {
        score.entry2Games[currentSetIndex] = 7;
      }

      score.isTiebreak = false;
      score.tiebreakEntry1Points = 0;
      score.tiebreakEntry2Points = 0;

      return this.processSetWin(score, tiebreakWinner);
    }

    return score;
  }

  private processSetWin(score: LiveScore, winner: 1 | 2): LiveScore {
    // Count sets won
    let entry1SetsWon = 0;
    let entry2SetsWon = 0;

    for (let i = 0; i < score.entry1Games.length; i++) {
      const g1 = score.entry1Games[i];
      const g2 = score.entry2Games[i];
      if (g1 > g2) entry1SetsWon++;
      else if (g2 > g1) entry2SetsWon++;
    }

    // Check for match win
    if (entry1SetsWon >= SCORING_CONFIG.setsToWin || entry2SetsWon >= SCORING_CONFIG.setsToWin) {
      score.status = 'completed';
      score.completedAt = new Date();
      return score;
    }

    // Start new set
    score.currentSet++;
    score.entry1Points = 0;
    score.entry2Points = 0;
    // Server continues from tiebreak (switches at end of tiebreak game)
    score.servingEntry = score.servingEntry === 1 ? 2 : 1;

    return score;
  }

  // Special point situation detection
  private isBreakPoint(score: LiveScore): boolean {
    if (score.isTiebreak) return false;

    const receiverPoints = score.servingEntry === 1 ? score.entry2Points : score.entry1Points;
    const serverPoints = score.servingEntry === 1 ? score.entry1Points : score.entry2Points;

    // Receiver needs 1 point to win the game
    // 40-0, 40-15, 40-30 (receiver at 40)
    if (receiverPoints >= 3 && serverPoints < 3) return true;
    // AD-out (receiver advantage)
    if (receiverPoints > serverPoints && receiverPoints >= 4) return true;

    return false;
  }

  private isSetPoint(score: LiveScore): boolean {
    const currentSetIndex = score.currentSet - 1;
    const g1 = score.entry1Games[currentSetIndex] || 0;
    const g2 = score.entry2Games[currentSetIndex] || 0;

    // Check if either player is 1 game away from winning the set
    const entry1CouldWin = g1 >= 5 && g1 - g2 >= 1;
    const entry2CouldWin = g2 >= 5 && g2 - g1 >= 1;

    if (!entry1CouldWin && !entry2CouldWin) return false;

    // Now check if they're also 1 point away from winning the game
    if (score.isTiebreak) {
      const tb1 = score.tiebreakEntry1Points;
      const tb2 = score.tiebreakEntry2Points;
      // In tiebreak at 6-6, check if either is 1 point from winning
      if (tb1 >= 6 && tb1 - tb2 >= 1) return true;
      if (tb2 >= 6 && tb2 - tb1 >= 1) return true;
    } else {
      // Regular game - check game point
      const p1 = score.entry1Points;
      const p2 = score.entry2Points;
      if (entry1CouldWin && p1 >= 3 && (p2 < 3 || p1 > p2)) return true;
      if (entry2CouldWin && p2 >= 3 && (p1 < 3 || p2 > p1)) return true;
    }

    return false;
  }

  private isMatchPoint(score: LiveScore): boolean {
    // Count sets won
    let entry1SetsWon = 0;
    let entry2SetsWon = 0;

    for (let i = 0; i < score.entry1Games.length; i++) {
      const g1 = score.entry1Games[i];
      const g2 = score.entry2Games[i];
      if (g1 > g2) entry1SetsWon++;
      else if (g2 > g1) entry2SetsWon++;
    }

    // Check if either player is 1 set away from winning
    const entry1CouldWinMatch = entry1SetsWon === SCORING_CONFIG.setsToWin - 1;
    const entry2CouldWinMatch = entry2SetsWon === SCORING_CONFIG.setsToWin - 1;

    if (!entry1CouldWinMatch && !entry2CouldWinMatch) return false;

    // Now check if it's also a set point for them
    return this.isSetPoint(score);
  }

  private getMatchWinner(score: LiveScore, match: DbMatch): string | null {
    let entry1Sets = 0;
    let entry2Sets = 0;

    for (let i = 0; i < score.entry1Games.length; i++) {
      if (score.entry1Games[i] > score.entry2Games[i]) entry1Sets++;
      else if (score.entry2Games[i] > score.entry1Games[i]) entry2Sets++;
    }

    if (entry1Sets > entry2Sets) return match.entry1_id;
    if (entry2Sets > entry1Sets) return match.entry2_id;
    return null;
  }

  private buildFinalScore(score: LiveScore): [number, number][] {
    const result: [number, number][] = [];
    for (let i = 0; i < score.entry1Games.length; i++) {
      result.push([score.entry1Games[i], score.entry2Games[i]]);
    }
    return result;
  }

  async undoLastPoint(matchId: string): Promise<LiveScoreResult<LiveScore>> {
    const score = await this.getLiveScore(matchId);
    if (!score) {
      return { success: false, error: 'live_score_not_found', message: 'Live score not found' };
    }

    if (score.status !== 'in_progress') {
      return { success: false, error: 'match_not_in_progress', message: 'Match is not in progress' };
    }

    const db = getDatabase();

    // Get the last point
    const lastPoint = db.prepare(`
      SELECT * FROM match_point_history
      WHERE match_id = ?
      ORDER BY sequence_number DESC
      LIMIT 1
    `).get(matchId) as DbPointHistory | undefined;

    if (!lastPoint) {
      return { success: false, error: 'no_points_to_undo', message: 'No points to undo' };
    }

    const scoreBefore: ScoreSnapshot = JSON.parse(lastPoint.score_before);

    // Delete the point from history
    db.prepare('DELETE FROM match_point_history WHERE id = ?').run(lastPoint.id);

    // Restore the score
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE match_live_scores
      SET current_set = ?, entry1_games = ?, entry2_games = ?,
          entry1_points = ?, entry2_points = ?,
          is_tiebreak = ?, tiebreak_entry1_points = ?, tiebreak_entry2_points = ?,
          serving_entry = ?, updated_at = ?
      WHERE match_id = ?
    `).run(
      scoreBefore.currentSet,
      JSON.stringify(scoreBefore.entry1Games),
      JSON.stringify(scoreBefore.entry2Games),
      scoreBefore.entry1Points,
      scoreBefore.entry2Points,
      scoreBefore.isTiebreak ? 1 : 0,
      scoreBefore.tiebreakEntry1Points,
      scoreBefore.tiebreakEntry2Points,
      scoreBefore.servingEntry,
      now,
      matchId
    );

    const updated = await this.getLiveScore(matchId);
    return { success: true, data: updated! };
  }

  // ==================== Point History ====================

  async getPointHistory(matchId: string): Promise<PointHistoryEntry[]> {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM match_point_history
      WHERE match_id = ?
      ORDER BY sequence_number ASC
    `).all(matchId) as DbPointHistory[];

    return rows.map(row => this.mapRowToPointHistory(row));
  }
}
