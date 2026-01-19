# Phase 4 Implementation Plan: Player Management

## Overview

Implement player management features for club organizers:
- **US-012**: Club player roster view
- **US-013**: Add player to club roster
- **US-014**: Edit player details
- **US-015**: Create doubles team

## Files to Create

| File | Purpose |
|------|---------|
| `src/types/player.ts` | TypeScript interfaces for Player, Team, etc. |
| `src/components/player-list.ts` | Player roster table with search/filter |
| `src/components/player-form.ts` | Modal form for create/edit player |
| `src/components/team-form.ts` | Modal form for creating doubles teams |

## Files to Modify

| File | Changes |
|------|---------|
| `src/styles/main.css` | Add ~150 lines: player table, team list, search bar |
| `src/main.ts` | Add player section routing and navigation handler |

## Implementation Steps

### Step 1: Create Type Definitions
**File:** `src/types/player.ts`
```typescript
export interface Player {
  id: string;
  clubId: string;
  name: string;
  email: string | null;
  phone: string | null;
  linkedUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlayerData {
  name: string;
  email?: string;
  phone?: string;
}

export interface UpdatePlayerData extends Partial<CreatePlayerData> {}

export interface Team {
  id: string;
  clubId: string;
  name: string;
  player1Id: string;
  player2Id: string;
  player1?: Player;
  player2?: Player;
  seed?: number;
  rating?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamData {
  name?: string;  // Auto-generated if blank
  player1Id: string;
  player2Id: string;
  seed?: number;
  rating?: number;
}

export interface PlayerListResponse {
  players: Player[];
}

export interface PlayerResponse {
  player: Player;
}

export interface TeamListResponse {
  teams: Team[];
}

export interface TeamResponse {
  team: Team;
}
```

### Step 2: Add CSS Styles
**File:** `src/styles/main.css`

Add styles for:
- `.player-list-container` - Container with header and search
- `.player-search` - Search input with icon
- `.player-table` - Data table for players
- `.player-table__row` - Clickable row with hover
- `.player-table__cell--actions` - Action buttons cell
- `.linked-badge` - Badge showing linked user status
- `.team-list` - Teams section
- `.team-card` - Team display with player names
- `.tab-toggle` - Tab toggle for Players/Teams view

### Step 3: Create Player List Component
**File:** `src/components/player-list.ts`
- Tab toggle: Players | Teams
- Search bar with debounced input
- Fetches from `GET /api/clubs/:clubId/players?search=`
- Table columns: Name, Email, Phone, Linked, Actions
- "Add Player" button
- "Create Team" button (in Teams tab)
- Edit/Delete action buttons per row
- Empty state with CTA
- Pagination (if > 50 players)
- `destroy()` method for cleanup

### Step 4: Create Player Form Component
**File:** `src/components/player-form.ts`
- Modal dialog with form
- Mode: 'create' | 'edit'
- Fields: Name (required), Email (optional), Phone (optional)
- Form validation with inline errors
- Create: `POST /api/clubs/:clubId/players`
- Edit: `PUT /api/clubs/:clubId/players/:playerId`
- "Add Another" button in create mode
- Success toast and callback
- Cancel closes modal

### Step 5: Create Team Form Component
**File:** `src/components/team-form.ts`
- Modal dialog with form
- Fields:
  - Player 1 (searchable dropdown)
  - Player 2 (searchable dropdown)
  - Team Name (optional, auto-generated from player names)
- Validation: both players required, cannot be same player
- Create: `POST /api/clubs/:clubId/teams`
- Success toast and callback

### Step 6: Update Main App
**File:** `src/main.ts`

Changes:
1. Import new components: PlayerList, PlayerForm, TeamForm
2. Add `activePlayerList`, `activePlayerForm`, `activeTeamForm` properties
3. Add `showPlayerList()` method
4. Update `handleNavigation('players')` to call showPlayerList()
5. Add `cleanupPlayerComponents()` method
6. Update `cleanupActiveComponents()` to include player cleanup

## API Integration

### Endpoints Used

```
GET    /api/clubs/:clubId/players           - List players (with optional ?search=)
POST   /api/clubs/:clubId/players           - Create player
GET    /api/clubs/:clubId/players/:playerId - Get player details
PUT    /api/clubs/:clubId/players/:playerId - Update player
DELETE /api/clubs/:clubId/players/:playerId - Delete player

GET    /api/clubs/:clubId/teams             - List teams
POST   /api/clubs/:clubId/teams             - Create team
GET    /api/clubs/:clubId/teams/:teamId     - Get team details
PUT    /api/clubs/:clubId/teams/:teamId     - Update team
DELETE /api/clubs/:clubId/teams/:teamId     - Delete team
```

### API Response Examples

**List players:**
```json
{
  "players": [
    {
      "id": "player-1",
      "clubId": "club-1",
      "name": "John Smith",
      "email": "john@example.com",
      "phone": "+1234567890",
      "linkedUserId": "user-1",
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

**Create team request:**
```json
{
  "player1Id": "player-1",
  "player2Id": "player-2",
  "name": "Smith / Jones"
}
```

## Verification

1. **Build check**: `npm run build` passes with no TypeScript errors
2. **Player list**:
   - Navigate to Players section in side nav
   - Shows loading then player table or empty state
   - Search filters players as you type
   - Click "Add Player" opens form modal
3. **Create player**:
   - Fill form with name (email/phone optional)
   - Submit creates player
   - Success toast appears
   - New player in list
   - "Add Another" clears form for next entry
4. **Edit player**:
   - Click edit button on row
   - Modal shows current values
   - Save updates player
5. **Delete player**:
   - Click delete button
   - Confirmation modal appears
   - Confirm deletes (if not in any entries)
6. **Teams tab**:
   - Toggle to Teams view
   - Shows team cards or empty state
   - "Create Team" opens team form
7. **Create team**:
   - Select two players from dropdowns
   - Name auto-generates or enter custom
   - Submit creates team
