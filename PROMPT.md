# Epic 6: Live Scoring & Spectator View

Implement real-time match updates and public bracket viewing for the Tennis Club Tournament Platform.

## Completed Epics Summary

| Epic | Name | What Was Built |
|------|------|----------------|
| 0 | Club Foundation | Clubs, memberships, invites, roles (admin/organiser/player), audit logging |
| 1 | Competitions | Competitions (draft/published), divisions (singles/doubles), scoring rule presets |
| 2 | Player & Team Management | Player profiles (club-scoped), doubles teams, competition entries, duplicate detection |
| 3 | Draw & Match Management | Draw generation (single elimination, round robin), match scheduling, result recording, standings |
| 4 | Public Registration & Self-Service | Profile claiming, self-registration, partner requests, player dashboard |
| 5 | Notifications & Reminders | Email service, notification preferences, match/registration/partner notifications, queue processing, announcements |

**Next Epic**: Epic 7 - Analytics & Reporting

## Context

You are extending an existing TypeScript application with:
- **Backend**: Express.js at `server/dev-server.ts`
- **Services**: Service pattern at `server/services/` (see `player-service.ts`, `draw-service.ts`, `notification-service.ts` for reference)
- **Database**: SQLite (`server/db/schema.sql`) and PostgreSQL (`server/db/schema.postgres.sql`)
- **Tests**: Vitest at `tests/services/`
- **API Tests**: Bash script at `scripts/test-api.sh`

## Stories to Implement

### L1: Real-Time Event Infrastructure

**User Story**: As a system, I can broadcast real-time updates to connected clients.

**Acceptance Criteria**:
- [ ] Server-Sent Events (SSE) endpoint for real-time updates
- [ ] Event types: match_update, score_change, match_started, match_completed
- [ ] Clients can subscribe to specific matches or competitions
- [ ] Connection management with heartbeat/keepalive
- [ ] Graceful handling of client disconnections
- [ ] API: `GET /api/live/matches/:matchId/stream` - SSE stream for a match
- [ ] API: `GET /api/live/competitions/:competitionId/stream` - SSE stream for all matches in competition

### L2: Live Score Entry

**User Story**: As a match supervisor, I can enter scores in real-time during a match.

**Acceptance Criteria**:
- [ ] Update current game score (0, 15, 30, 40, AD)
- [ ] Record point winner to auto-update game/set scores
- [ ] Support tiebreak scoring
- [ ] Mark set as complete when won
- [ ] Track current server (for alternating serves)
- [ ] Undo last point (within same game)
- [ ] API: `POST /api/matches/:matchId/point` records a point for entry1 or entry2
- [ ] API: `POST /api/matches/:matchId/undo` undoes last point
- [ ] API: `GET /api/matches/:matchId/live-score` returns current live score state

### L3: Match Status Management

**User Story**: As a supervisor, I can manage match status in real-time.

**Acceptance Criteria**:
- [ ] Start match (set status to in_progress)
- [ ] Pause match (injury timeout, rain delay)
- [ ] Resume match
- [ ] Complete match (finalizes score)
- [ ] Abandon match (with reason)
- [ ] Track match duration (start time, pause time, total play time)
- [ ] API: `POST /api/matches/:matchId/start` starts the match
- [ ] API: `POST /api/matches/:matchId/pause` pauses with reason
- [ ] API: `POST /api/matches/:matchId/resume` resumes play
- [ ] API: `POST /api/matches/:matchId/abandon` abandons with reason

### L4: Public Live Scores

**User Story**: As a spectator, I can view live scores without logging in.

**Acceptance Criteria**:
- [ ] Public page showing all live matches for a competition
- [ ] Real-time score updates via SSE
- [ ] Display current set score, game score, and server indicator
- [ ] Show match court location
- [ ] No authentication required
- [ ] API: `GET /api/public/live/competitions/:slug` returns all live matches
- [ ] API: `GET /api/public/live/matches/:matchId` returns live score for specific match
- [ ] API: `GET /api/public/live/matches/:matchId/stream` SSE stream (no auth)

### L5: Public Bracket View

**User Story**: As a spectator, I can view tournament brackets and results.

**Acceptance Criteria**:
- [ ] Display elimination bracket structure
- [ ] Show completed match results
- [ ] Highlight matches in progress
- [ ] Show upcoming matches with scheduled times
- [ ] Display round robin standings table
- [ ] Mobile-responsive bracket layout
- [ ] API: `GET /api/public/competitions/:slug/bracket` returns bracket data
- [ ] API: `GET /api/public/competitions/:slug/standings` returns standings

### L6: Score History & Match Log

**User Story**: As a spectator, I can view point-by-point history of a match.

**Acceptance Criteria**:
- [ ] Log each point with timestamp and winner
- [ ] Display point history grouped by game/set
- [ ] Show key moments (break points, set points, match points)
- [ ] Store history for completed matches
- [ ] API: `GET /api/matches/:matchId/history` returns point history
- [ ] API: `GET /api/public/matches/:matchId/history` public access to history

## Database Schema Changes

Add these tables (both SQLite and PostgreSQL versions):

```sql
-- Live match state for real-time scoring
CREATE TABLE IF NOT EXISTS match_live_scores (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  current_set INTEGER NOT NULL DEFAULT 1,
  entry1_games TEXT NOT NULL DEFAULT '[]',  -- JSON array of games per set [6, 4, ...]
  entry2_games TEXT NOT NULL DEFAULT '[]',  -- JSON array of games per set [4, 6, ...]
  entry1_points TEXT NOT NULL DEFAULT '0',  -- Current game points: '0', '15', '30', '40', 'AD'
  entry2_points TEXT NOT NULL DEFAULT '0',
  is_tiebreak INTEGER DEFAULT 0,
  tiebreak_points_1 INTEGER DEFAULT 0,
  tiebreak_points_2 INTEGER DEFAULT 0,
  serving_entry INTEGER DEFAULT 1,  -- 1 or 2
  match_status TEXT NOT NULL DEFAULT 'not_started' CHECK (match_status IN ('not_started', 'in_progress', 'paused', 'completed', 'abandoned')),
  pause_reason TEXT,
  started_at DATETIME,
  paused_at DATETIME,
  completed_at DATETIME,
  total_play_time_seconds INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Point-by-point history
CREATE TABLE IF NOT EXISTS match_point_history (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  set_number INTEGER NOT NULL,
  game_number INTEGER NOT NULL,
  point_number INTEGER NOT NULL,
  winner_entry INTEGER NOT NULL CHECK (winner_entry IN (1, 2)),
  score_before TEXT NOT NULL,  -- JSON: { entry1Games: [], entry2Games: [], entry1Points: '30', entry2Points: '15' }
  score_after TEXT NOT NULL,   -- JSON: same structure
  is_break_point INTEGER DEFAULT 0,
  is_set_point INTEGER DEFAULT 0,
  is_match_point INTEGER DEFAULT 0,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(match_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_match_live_scores_match ON match_live_scores(match_id);
CREATE INDEX IF NOT EXISTS idx_match_live_scores_status ON match_live_scores(match_status);
CREATE INDEX IF NOT EXISTS idx_match_point_history_match ON match_point_history(match_id);
CREATE INDEX IF NOT EXISTS idx_match_point_history_sequence ON match_point_history(match_id, sequence_number);
```

## Service Interfaces

Create `server/services/live-score-service.ts`:

```typescript
export type MatchLiveStatus = 'not_started' | 'in_progress' | 'paused' | 'completed' | 'abandoned';
export type GamePoints = '0' | '15' | '30' | '40' | 'AD';

export interface LiveScore {
  id: string;
  matchId: string;
  currentSet: number;
  entry1Games: number[];  // Games won per set
  entry2Games: number[];
  entry1Points: GamePoints;
  entry2Points: GamePoints;
  isTiebreak: boolean;
  tiebreakPoints1: number;
  tiebreakPoints2: number;
  servingEntry: 1 | 2;
  matchStatus: MatchLiveStatus;
  pauseReason: string | null;
  startedAt: Date | null;
  pausedAt: Date | null;
  completedAt: Date | null;
  totalPlayTimeSeconds: number;
}

export interface PointHistoryEntry {
  id: string;
  matchId: string;
  sequenceNumber: number;
  setNumber: number;
  gameNumber: number;
  pointNumber: number;
  winnerEntry: 1 | 2;
  scoreBefore: LiveScore;
  scoreAfter: LiveScore;
  isBreakPoint: boolean;
  isSetPoint: boolean;
  isMatchPoint: boolean;
  timestamp: Date;
}

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
  | 'match_not_started'
  | 'match_already_started'
  | 'match_not_in_progress'
  | 'match_completed'
  | 'invalid_point'
  | 'no_points_to_undo'
  | 'operation_failed';

export type LiveScoreResult<T> = LiveScoreServiceResult<T> | LiveScoreServiceError;

export interface LiveScoreService {
  // Match lifecycle
  getLiveScore(matchId: string): Promise<LiveScore | null>;
  startMatch(matchId: string, servingEntry?: 1 | 2): Promise<LiveScoreResult<LiveScore>>;
  pauseMatch(matchId: string, reason: string): Promise<LiveScoreResult<LiveScore>>;
  resumeMatch(matchId: string): Promise<LiveScoreResult<LiveScore>>;
  abandonMatch(matchId: string, reason: string): Promise<LiveScoreResult<LiveScore>>;

  // Scoring
  recordPoint(matchId: string, winnerEntry: 1 | 2): Promise<LiveScoreResult<LiveScore>>;
  undoLastPoint(matchId: string): Promise<LiveScoreResult<LiveScore>>;

  // History
  getPointHistory(matchId: string): Promise<PointHistoryEntry[]>;

  // Queries
  getLiveMatchesForCompetition(competitionId: string): Promise<LiveScore[]>;
}
```

Create `server/services/live-events-service.ts`:

```typescript
export type LiveEventType =
  | 'match_started'
  | 'score_change'
  | 'match_paused'
  | 'match_resumed'
  | 'match_completed'
  | 'match_abandoned';

export interface LiveEvent {
  type: LiveEventType;
  matchId: string;
  competitionId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

export interface LiveEventsService {
  // Subscribe to events
  subscribeToMatch(matchId: string, callback: (event: LiveEvent) => void): () => void;
  subscribeToCompetition(competitionId: string, callback: (event: LiveEvent) => void): () => void;

  // Emit events (called by LiveScoreService)
  emitMatchEvent(event: LiveEvent): void;
}
```

## API Endpoints to Add

```
# Live Score Entry (supervisor+)
GET    /api/matches/:matchId/live-score          - Get current live score
POST   /api/matches/:matchId/start               - Start match
POST   /api/matches/:matchId/pause               - Pause match
POST   /api/matches/:matchId/resume              - Resume match
POST   /api/matches/:matchId/abandon             - Abandon match
POST   /api/matches/:matchId/point               - Record point { winnerEntry: 1 | 2 }
POST   /api/matches/:matchId/undo                - Undo last point
GET    /api/matches/:matchId/history             - Get point history

# Live Streaming (SSE)
GET    /api/live/matches/:matchId/stream         - SSE stream for match (auth required)
GET    /api/live/competitions/:competitionId/stream - SSE stream for competition (auth required)

# Public Live Access (no auth)
GET    /api/public/live/competitions/:slug       - All live matches for competition
GET    /api/public/live/matches/:matchId         - Live score for specific match
GET    /api/public/live/matches/:matchId/stream  - SSE stream (no auth)
GET    /api/public/competitions/:slug/bracket    - Bracket view data
GET    /api/public/competitions/:slug/standings  - Standings data
GET    /api/public/matches/:matchId/history      - Point history
```

## SSE Event Format

```typescript
// Event format for Server-Sent Events
interface SSEEvent {
  event: LiveEventType;
  data: {
    matchId: string;
    competitionId: string;
    liveScore: LiveScore;
    timestamp: string;
  };
}

// Example SSE response
// event: score_change
// data: {"matchId":"abc","competitionId":"xyz","liveScore":{...},"timestamp":"2024-01-15T10:30:00Z"}
```

## Tennis Scoring Logic

Implement standard tennis scoring:

1. **Points**: 0 → 15 → 30 → 40 → Game (or Deuce → AD → Game)
2. **Games**: First to 6 games with 2-game lead wins set (or tiebreak at 6-6)
3. **Tiebreak**: First to 7 points with 2-point lead
4. **Sets**: Best of 3 sets (configurable)

```typescript
// Point progression
const POINT_SEQUENCE = ['0', '15', '30', '40'];

// Deuce handling
if (entry1Points === '40' && entry2Points === '40') {
  // Deuce - next point gives AD
}
if (entry1Points === 'AD' || entry2Points === 'AD') {
  // AD - win point to win game, lose to return to Deuce
}

// Tiebreak
if (entry1Games[currentSet] === 6 && entry2Games[currentSet] === 6) {
  // Start tiebreak
  isTiebreak = true;
}
```

## Tests Required

Create tests for:
- Start match and initial state
- Record point updates score correctly
- Deuce and advantage handling
- Tiebreak scoring
- Set completion detection
- Match completion detection
- Undo point restores previous state
- Pause/resume tracks time correctly
- Point history is recorded
- SSE connections receive events
- Public endpoints work without auth
- Bracket data returns correct structure
- Standings data returns correct structure

## Exit Criteria

All of these must pass:

1. **Start Match**: Can start a match and set initial server
2. **Record Points**: Points update score correctly with tennis rules
3. **Deuce/AD**: Deuce and advantage handled correctly
4. **Tiebreak**: Tiebreak scoring works at 6-6
5. **Set Completion**: Sets complete when won
6. **Match Completion**: Match completes and finalizes score
7. **Undo**: Can undo last point within same game
8. **Pause/Resume**: Pause tracks reason, resume continues
9. **Point History**: Full point-by-point history stored
10. **SSE Events**: Clients receive real-time updates
11. **Public Access**: Spectators can view without auth
12. **Bracket View**: Public bracket displays correctly
13. **Tests Pass**: `npm test` passes with new tests

## Completion

When all exit criteria pass and tests are green, output:

<promise>EPIC_6_COMPLETE</promise>
