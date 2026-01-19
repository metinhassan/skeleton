# PRD: Live Scoring & Spectator View Frontend UI

## Introduction

Build the frontend UI for the Live Scoring system (Epic 6). The backend API endpoints, services, and database schema are already implemented. This PRD covers the React components needed to use these features.

**Priority:** Organiser scoring tools first, minimal spectator view second.

**Approach:** Fast implementation, fully responsive, simple text-based bracket.

## Goals

- Enable match organisers to enter live scores from any device (phone, tablet, desktop)
- Provide a simple courtside-friendly interface for point-by-point scoring
- Display live matches and scores to spectators
- Show tournament brackets and round-robin standings
- Integrate SSE for real-time score updates on spectator views

## User Stories

### US-001: Match Scoring Page Route
**Description:** As a developer, I need a dedicated page for live scoring so organisers can access it easily.

**Acceptance Criteria:**
- [ ] Create route `/clubs/:clubId/matches/:matchId/score`
- [ ] Page requires authentication and organiser role
- [ ] Shows loading state while fetching match data
- [ ] Shows error state if match not found or unauthorized
- [ ] Typecheck passes
- [ ] Verify in browser at `https://localhost:3000/clubs/{clubId}/matches/{matchId}/score`

### US-002: Match Header Component
**Description:** As an organiser, I want to see match details at the top of the scoring page so I know which match I'm scoring.

**Acceptance Criteria:**
- [ ] Display player/team names for Entry 1 and Entry 2
- [ ] Show match court location if set
- [ ] Show match status (Not Started, In Progress, Paused, Completed)
- [ ] Show current server indicator (ball icon or similar)
- [ ] Responsive: stacks vertically on mobile
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Scoreboard Display Component
**Description:** As an organiser, I want to see the current score clearly so I can verify it's correct before entering the next point.

**Acceptance Criteria:**
- [ ] Display set scores (e.g., "6-4, 3-2")
- [ ] Display current game score (e.g., "30-15" or "AD-40")
- [ ] Highlight which player is serving
- [ ] Show tiebreak score when in tiebreak (e.g., "6-6 (5-3)")
- [ ] Large, readable text suitable for outdoor/bright conditions
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Start Match Controls
**Description:** As an organiser, I want to start a match and select who serves first.

**Acceptance Criteria:**
- [ ] "Start Match" button visible when match status is "not_started"
- [ ] Server selection modal/prompt: "Who serves first?" with Entry 1 / Entry 2 buttons
- [ ] Calls `POST /api/matches/:matchId/start` with `{ servingEntry: 1|2 }`
- [ ] Updates UI to show match in progress after successful start
- [ ] Shows error toast if start fails
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: Point Entry Buttons
**Description:** As an organiser, I want large, easy-to-tap buttons to record who won each point.

**Acceptance Criteria:**
- [ ] Two large buttons: one for Entry 1, one for Entry 2
- [ ] Buttons show player/team name
- [ ] Buttons disabled when match not in progress
- [ ] Calls `POST /api/matches/:matchId/point` with `{ winnerEntry: 1|2 }`
- [ ] Optimistic UI update (show new score immediately, rollback on error)
- [ ] Minimum touch target 48x48px for mobile
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Undo Last Point Button
**Description:** As an organiser, I want to undo mistakes quickly.

**Acceptance Criteria:**
- [ ] "Undo" button visible when match is in progress and points have been played
- [ ] Confirmation prompt: "Undo last point?"
- [ ] Calls `POST /api/matches/:matchId/undo`
- [ ] Updates scoreboard after successful undo
- [ ] Button disabled when no points to undo
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Pause/Resume Match Controls
**Description:** As an organiser, I want to pause the match for breaks or delays.

**Acceptance Criteria:**
- [ ] "Pause" button visible when match is in progress
- [ ] Pause prompts for reason (text input or preset options: "Rain", "Injury", "Break")
- [ ] Calls `POST /api/matches/:matchId/pause` with `{ reason: string }`
- [ ] "Resume" button visible when match is paused
- [ ] Calls `POST /api/matches/:matchId/resume`
- [ ] Shows pause reason and duration while paused
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Abandon Match Control
**Description:** As an organiser, I want to abandon a match that cannot be completed.

**Acceptance Criteria:**
- [ ] "Abandon Match" in dropdown/menu (not prominent button)
- [ ] Confirmation dialog with reason input (required)
- [ ] Calls `POST /api/matches/:matchId/abandon` with `{ reason: string }`
- [ ] Redirects to match list or shows final state after abandon
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: Match Completed State
**Description:** As an organiser, I see a clear confirmation when the match finishes.

**Acceptance Criteria:**
- [ ] Final score displayed prominently when match completes
- [ ] Winner highlighted
- [ ] "Match Complete" banner/indicator
- [ ] Point entry buttons disabled
- [ ] Option to view point history
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-010: Public Live Scores Page
**Description:** As a spectator, I want to see all live matches for a competition without logging in.

**Acceptance Criteria:**
- [ ] Create public route `/live/:slug` (no auth required)
- [ ] Fetch from `GET /api/public/live/competitions/:slug`
- [ ] List all in-progress and paused matches
- [ ] Show score, court, and status for each match
- [ ] "No live matches" message when none active
- [ ] Auto-refresh via SSE connection to `/api/public/live/matches/:matchId/stream`
- [ ] Typecheck passes
- [ ] Verify in browser at `https://localhost:3000/live/{competition-slug}`

### US-011: Public Match Detail View
**Description:** As a spectator, I want to view a single match's live score in detail.

**Acceptance Criteria:**
- [ ] Create public route `/live/match/:matchId`
- [ ] Fetch from `GET /api/public/live/matches/:matchId`
- [ ] Display full scoreboard (sets, games, current points)
- [ ] Show server indicator
- [ ] Real-time updates via SSE
- [ ] Link back to competition live scores
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-012: Simple Text Bracket View
**Description:** As a spectator, I want to see the tournament bracket structure.

**Acceptance Criteria:**
- [ ] Create public route `/competitions/:slug/bracket`
- [ ] Fetch from `GET /api/public/competitions/:slug/bracket`
- [ ] Display bracket as indented text or simple table format:
  ```
  Round 1          Round 2          Final
  Player A  6-4
            ───► Player A  6-3
  Player B  4-6         ───► Player A (Winner)
  Player C  6-2
            ───► Player C  3-6
  Player D  2-6
  ```
- [ ] Show completed scores, "vs" for upcoming, "LIVE" badge for in-progress
- [ ] Responsive on mobile (horizontal scroll if needed)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-013: Round Robin Standings Table
**Description:** As a spectator, I want to see round-robin standings.

**Acceptance Criteria:**
- [ ] Display on bracket page for round-robin divisions
- [ ] Fetch from `GET /api/public/competitions/:slug/standings`
- [ ] Table columns: Position, Player/Team, W, L, Games +/-, Points
- [ ] Sorted by position
- [ ] Highlight matches in progress
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-014: Point History View
**Description:** As a spectator, I want to see point-by-point history of a match.

**Acceptance Criteria:**
- [ ] Accessible from match detail view ("View History" link)
- [ ] Fetch from `GET /api/public/matches/:matchId/history`
- [ ] Display as timeline grouped by set/game
- [ ] Show point winner and running score
- [ ] Mark break points, set points, match points with indicators
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-015: Navigation Links to Live Scoring
**Description:** As an organiser, I want easy access to live scoring from existing match views.

**Acceptance Criteria:**
- [ ] Add "Live Score" button to match detail/edit page
- [ ] Button visible only for matches with both entries assigned
- [ ] Links to `/clubs/:clubId/matches/:matchId/score`
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

- FR-1: Scoring page must work offline-tolerant (queue points if connection lost, sync when restored) - *stretch goal*
- FR-2: All scoring actions must show loading state during API calls
- FR-3: All error states must show user-friendly messages with retry option
- FR-4: SSE connections must auto-reconnect on disconnect
- FR-5: Public pages must not require authentication
- FR-6: All touch targets must be minimum 48x48px on mobile
- FR-7: Scoreboard must be readable in bright outdoor conditions (high contrast)

## Non-Goals

- No audio/sound effects for points
- No video integration or streaming
- No chat or commenting features
- No push notifications (web or mobile)
- No offline-first PWA (nice to have, not required)
- No animated bracket transitions
- No historical match replay

## Design Considerations

- **Scoring UI:** Large buttons, minimal clutter, one-hand operation on phone
- **Color scheme:** High contrast for outdoor visibility
- **Typography:** Large, bold numbers for scores
- **Existing components:** Reuse Button, Card, Modal, Table components from existing UI

### Suggested Layout (Scoring Page)

```
┌─────────────────────────────────────┐
│  Player A  vs  Player B    Court 1  │  ← Header
│           🎾 Serving                │
├─────────────────────────────────────┤
│                                     │
│      6-4  3-2                       │  ← Set scores
│                                     │
│        30 - 15                      │  ← Game score (large)
│                                     │
├─────────────────────────────────────┤
│  ┌───────────┐    ┌───────────┐    │
│  │           │    │           │    │
│  │ Player A  │    │ Player B  │    │  ← Point buttons
│  │   POINT   │    │   POINT   │    │
│  │           │    │           │    │
│  └───────────┘    └───────────┘    │
├─────────────────────────────────────┤
│  [Undo]  [Pause]  [⋮ More]         │  ← Controls
└─────────────────────────────────────┘
```

## Technical Considerations

- **State management:** React Query for API calls, local state for optimistic updates
- **SSE handling:** Create custom hook `useLiveScore(matchId)` that manages SSE connection
- **Routing:** Add routes to existing React Router setup
- **API client:** Use existing fetch utilities or create typed API client
- **Types:** Import types from `server/services/live-score-service.ts` or create shared types

## Success Metrics

- Organiser can start a match and enter 10 points in under 30 seconds
- Spectators see score updates within 1 second of point entry
- Scoring page loads in under 2 seconds on 3G connection
- Zero accidental point entries due to UI confusion (undo rate < 5%)

## Open Questions

1. Should we show point-by-point during live match, or only after completion?
2. Do we need keyboard shortcuts for desktop scoring (1/2 keys for points)?
3. Should completed matches show on the live page briefly before disappearing?

## Implementation Order

Recommended implementation sequence:

1. **US-001, US-002, US-003** - Basic scoring page structure
2. **US-004, US-005** - Start match and point entry (core functionality)
3. **US-006, US-007** - Undo and pause (essential controls)
4. **US-008, US-009** - Abandon and completion states
5. **US-015** - Navigation integration
6. **US-010, US-011** - Public live scores
7. **US-012, US-013** - Bracket and standings
8. **US-014** - Point history
