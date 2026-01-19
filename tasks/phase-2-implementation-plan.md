# Phase 2 Implementation Plan: Competition Management

## Overview

Implement competition management features for tournament organizers:
- **US-004**: Competition list view
- **US-005**: Create competition form
- **US-006**: Competition detail/overview page
- **US-007**: Edit competition settings
- **US-008**: Publish competition

## Files to Create

| File | Purpose |
|------|---------|
| `src/types/competition.ts` | TypeScript interfaces for Competition, Division, CompetitionStatus, etc. |
| `src/components/competition-list.ts` | Grid/list view of competitions with status badges |
| `src/components/competition-form.ts` | Modal form for create/edit competition |
| `src/components/competition-detail.ts` | Competition detail page with tabs (Overview, Divisions, Entries, Draw, Settings) |
| `src/components/toast.ts` | Reusable toast notification component |

## Files to Modify

| File | Changes |
|------|---------|
| `src/styles/main.css` | Add ~200 lines: competition cards, status badges, tabs, forms, empty states |
| `src/main.ts` | Add routing for competition routes, update handleNavigation for competitions section |

## Implementation Steps

### Step 1: Create Type Definitions
**File:** `src/types/competition.ts`
```typescript
export type CompetitionType = 'tournament' | 'league';
export type CompetitionFormat = 'knockout' | 'round_robin' | 'swiss' | 'ladder';
export type CompetitionStatus = 'draft' | 'published' | 'in_progress' | 'completed' | 'cancelled';
export type RegistrationMode = 'organizer_only' | 'self_registration' | 'both';
export type ScoreEntryMode = 'organizers_only' | 'players_can_submit';

export interface Competition {
  id: string;
  clubId: string;
  name: string;
  slug: string;
  type: CompetitionType;
  format: CompetitionFormat;
  status: CompetitionStatus;
  registrationMode: RegistrationMode;
  scoreEntryMode: ScoreEntryMode;
  requiresApproval: boolean;
  registrationDeadline: string | null;
  startDate: string | null;
  endDate: string | null;
  entryCount: number;
  divisionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompetitionData {
  name: string;
  type: CompetitionType;
  format: CompetitionFormat;
  startDate?: string;
  endDate?: string;
  scoreEntryMode?: ScoreEntryMode;
}

export interface UpdateCompetitionData extends Partial<CreateCompetitionData> {
  registrationMode?: RegistrationMode;
  requiresApproval?: boolean;
  registrationDeadline?: string;
}
```

### Step 2: Create Toast Component
**File:** `src/components/toast.ts`
- Singleton toast manager
- Types: success, error, info, warning
- Auto-dismiss after 3 seconds
- Manual dismiss via click
- Queue multiple toasts

### Step 3: Add CSS Styles
**File:** `src/styles/main.css`

Add styles for:
- `.competition-grid` - Responsive grid of competition cards
- `.competition-card` - Card with name, type, format, date range, status badge
- `.status-badge--draft`, `.status-badge--published`, etc. - Status-specific colors
- `.tabs`, `.tab`, `.tab--active` - Tab navigation for competition detail
- `.empty-state` - Empty state with icon and CTA
- `.form-modal` - Modal overlay and form container
- `.form-row`, `.form-actions` - Form layout
- `.loading-skeleton` - Skeleton loading animation

Status badge colors:
- draft: gray (#94a3b8)
- published: blue (#3b82f6)
- in_progress: green (#22c55e)
- completed: purple (#8b5cf6)
- cancelled: red (#ef4444)

### Step 4: Create Competition List Component
**File:** `src/components/competition-list.ts`
- Fetches from `GET /api/clubs/:clubId/competitions`
- Renders grid of competition cards
- Each card shows: name, type badge, format badge, date range, status badge, entry count
- "Create Competition" button for organizers/admins
- Click card navigates to competition detail
- Empty state with CTA when no competitions
- Loading skeleton while fetching
- `destroy()` method for cleanup

### Step 5: Create Competition Form Component
**File:** `src/components/competition-form.ts`
- Modal dialog with form
- Mode: 'create' | 'edit'
- Required fields: Name, Type (dropdown), Format (dropdown)
- Optional fields: Start date, End date, Score entry mode (toggle)
- Edit mode adds: Registration mode, Requires approval, Registration deadline
- Form validation with inline errors
- Submit button with loading state
- Create: `POST /api/clubs/:clubId/competitions`
- Edit: `PUT /api/competitions/:competitionId`
- Success callback for navigation/refresh
- Cancel button closes modal
- Click outside closes modal (optional)

### Step 6: Create Competition Detail Component
**File:** `src/components/competition-detail.ts`
- Fetches from `GET /api/competitions/:competitionId`
- Header: competition name, status badge, back button, edit button (if draft)
- Tab navigation: Overview, Divisions, Entries, Draw, Settings
- Overview tab content:
  - Type, format, dates display
  - Entry count, division count
  - Quick actions: Publish (if draft), Generate Draw, View Public Page
- Settings tab: embedded CompetitionForm in edit mode
- Other tabs: placeholder content for future phases
- Handles publish action: `POST /api/competitions/:competitionId/publish`
- Confirmation modal for publish
- Success toast on publish

### Step 7: Integrate with Main App
**File:** `src/main.ts`

Changes:
1. Import new components
2. Add route parsing for competition routes:
   - `#/competitions` - competition list (for current club)
   - `#/competitions/new` - create competition
   - `#/competitions/:id` - competition detail
   - `#/competitions/:id/settings` - competition settings tab
3. Update `handleNavigation('competitions')` to load competition list
4. Add methods:
   - `showCompetitionList()` - render competition list
   - `showCreateCompetition()` - show create form modal
   - `showCompetitionDetail(id)` - render competition detail
5. Handle navigation from competition list to detail

## API Integration

### Endpoints Used

```
GET    /api/clubs/:clubId/competitions          - List competitions
POST   /api/clubs/:clubId/competitions          - Create competition
GET    /api/competitions/:competitionId         - Get competition details
PUT    /api/competitions/:competitionId         - Update competition
POST   /api/competitions/:competitionId/publish - Publish competition
```

### API Response Examples

**List competitions:**
```json
{
  "competitions": [
    {
      "id": "comp-1",
      "name": "Spring Championship",
      "slug": "spring-championship",
      "type": "tournament",
      "format": "knockout",
      "status": "draft",
      "entryCount": 12,
      "divisionCount": 2,
      "startDate": "2024-04-01",
      "endDate": "2024-04-15"
    }
  ]
}
```

**Create competition request:**
```json
{
  "name": "Summer Open",
  "type": "tournament",
  "format": "round_robin",
  "startDate": "2024-06-01",
  "endDate": "2024-06-30",
  "scoreEntryMode": "organizers_only"
}
```

## Verification

1. **Build check**: `npm run build` passes with no TypeScript errors
2. **Competition list**:
   - Navigate to Competitions section
   - Shows loading skeleton then competitions grid
   - Empty state when no competitions
   - Click "Create Competition" opens form modal
3. **Create competition**:
   - Fill form with valid data
   - Submit creates competition
   - Success toast appears
   - Navigates to new competition detail
4. **Competition detail**:
   - Shows header with name and status
   - Tab navigation works
   - Overview shows correct data
5. **Edit competition**:
   - Settings tab shows edit form
   - Save updates competition
   - Success toast appears
6. **Publish competition**:
   - Publish button shows confirmation modal
   - Confirm publishes competition
   - Status updates to "published"
   - Success toast appears

## Component Lifecycle

```
CompetitionList
├── constructor(options) → fetch & render
├── render() → builds DOM
├── bindEvents() → click handlers
├── handleCardClick(id) → navigate to detail
├── handleCreateClick() → show form modal
└── destroy() → cleanup

CompetitionForm
├── constructor(options) → render modal
├── render() → builds form DOM
├── bindEvents() → form & button handlers
├── validate() → returns boolean
├── handleSubmit() → API call
├── close() → remove modal
└── destroy() → cleanup

CompetitionDetail
├── constructor(options) → fetch & render
├── render() → builds page DOM
├── renderTab(tab) → renders tab content
├── bindEvents() → tab clicks, actions
├── handlePublish() → confirmation & API
├── switchTab(tab) → updates active tab
└── destroy() → cleanup
```
