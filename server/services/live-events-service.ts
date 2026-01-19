/**
 * Live Events Service Interface
 * Handles Server-Sent Events (SSE) broadcasting for real-time match updates
 */

import type { Response } from 'express';
import type { LiveScore, DisplayScore } from './live-score-service.js';

// Event types that can be broadcast
export type LiveEventType =
  | 'match_started'
  | 'score_change'
  | 'match_paused'
  | 'match_resumed'
  | 'match_completed'
  | 'match_abandoned'
  | 'heartbeat';

// Event payload structure
export interface LiveEvent {
  type: LiveEventType;
  matchId: string;
  timestamp: string;
  data: LiveEventData;
}

// Event data varies by type
export type LiveEventData =
  | MatchStartedData
  | ScoreChangeData
  | MatchPausedData
  | MatchResumedData
  | MatchCompletedData
  | MatchAbandonedData
  | HeartbeatData;

export interface MatchStartedData {
  servingEntry: 1 | 2;
  displayScore: DisplayScore;
}

export interface ScoreChangeData {
  pointWinner: 1 | 2;
  displayScore: DisplayScore;
  isBreakPoint: boolean;
  isSetPoint: boolean;
  isMatchPoint: boolean;
}

export interface MatchPausedData {
  reason: string;
  displayScore: DisplayScore;
}

export interface MatchResumedData {
  displayScore: DisplayScore;
}

export interface MatchCompletedData {
  winner: 1 | 2;
  finalScore: DisplayScore;
}

export interface MatchAbandonedData {
  reason: string;
  displayScore: DisplayScore;
}

export interface HeartbeatData {
  time: string;
}

// Client connection info
export interface SSEClient {
  id: string;
  response: Response;
  matchId?: string;
  competitionId?: string;
  connectedAt: Date;
  lastHeartbeat: Date;
}

export interface LiveEventsService {
  // Client management
  addClient(clientId: string, response: Response, matchId?: string, competitionId?: string): void;
  removeClient(clientId: string): void;
  getClientCount(matchId?: string, competitionId?: string): number;

  // Broadcasting
  broadcastToMatch(matchId: string, event: LiveEvent): void;
  broadcastToCompetition(competitionId: string, event: LiveEvent): void;

  // SSE helpers
  setupSSEResponse(response: Response): void;
  sendEvent(response: Response, event: LiveEvent): void;
  sendHeartbeat(response: Response): void;

  // Lifecycle
  startHeartbeat(): void;
  stopHeartbeat(): void;
}
