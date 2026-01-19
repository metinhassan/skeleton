# PRD: Tournament Management UI

## Introduction

Build a comprehensive tournament management interface that enables club administrators and organizers to create competitions, manage divisions, add players, handle registrations, and generate tournament draws. The UI integrates into the existing dashboard with a collapsible side navigation panel and is fully responsive across desktop and mobile devices.

This PRD covers the complete tournament lifecycle from creation through to draw generation, leveraging the existing backend API endpoints.

## Goals

- Enable club admins and organizers to create and manage competitions through an intuitive UI
- Provide role-based access control (admins have full control, organizers can manage tournaments)
- Support both organizer-managed player entry and player self-registration with approval workflow
- Deliver equal-quality experience on desktop and mobile devices
- Integrate seamlessly with existing dashboard using a collapsible side navigation
- Reduce tournament setup time by providing clear, guided workflows

## User Stories

### Navigation & Layout

#### US-001: Implement collapsible side navigation
**Description:** As a logged-in user, I want a side navigation panel so that I can easily access different management sections.

**Acceptance Criteria:**
- [ ] Side nav appears on left side of dashboard when logged in
- [ ] Nav includes sections: Dashboard Home, Competitions, Players, My Clubs
- [ ] Nav is collapsible on desktop (icon-only mode)
- [ ] Nav transforms to bottom sheet or hamburger menu on mobile (<768px)
- [ ] Active section is visually highlighted
- [ ] Nav state (collapsed/expanded) persists in localStorage
- [ ] Typecheck passes
- [ ] Verify in browser at desktop and mobile widths

#### US-002: Create responsive app shell layout
**Description:** As a user, I want the app layout to adapt to my screen size so that I can manage tournaments on any device.

**Acceptance Criteria:**
- [ ] Desktop: side nav (collapsible) + main content area
- [ ] Tablet (768-1024px): side nav collapsed by default + main content
- [ ] Mobile (<768px): hamburger menu or bottom nav + full-width content
- [ ] Header shows current section title and user info
- [ ] Smooth transitions between breakpoints
- [ ] Typecheck passes
- [ ] Verify in browser at 320px, 768px, 1024px, and 1440px widths

---

### Club Selection & Context

#### US-003: Club selector dropdown
**Description:** As a user belonging to multiple clubs, I want to select which club I'm managing so that actions apply to the correct club.

**Acceptance Criteria:**
- [ ] Dropdown in header/nav shows current club name
- [ ] Dropdown lists all clubs user is member of (GET /api/users/me/clubs)
- [ ] Selecting a club updates the context and refreshes relevant data
- [ ] Selected club persists in localStorage across sessions
- [ ] Shows user's role badge next to each club (admin/organizer/player)
- [ ] If user has only one club, still show it but no dropdown needed
- [ ] Typecheck passes
- [ ] Verify in browser

---

### Competition Management

#### US-004: Competition list view
**Description:** As an organizer, I want to see all competitions for my club so that I can manage them.

**Acceptance Criteria:**
- [ ] Displays list/grid of competitions for selected club (GET /api/clubs/:clubId/competitions)
- [ ] Each card shows: name, type (tournament/league), format, status, date range
- [ ] Status shown as colored badge (draft/published/in_progress/completed/cancelled)
- [ ] "Create Competition" button visible for organizers/admins
- [ ] Click on competition navigates to competition detail
- [ ] Empty state with call-to-action when no competitions exist
- [ ] Loading skeleton while fetching
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-005: Create competition form
**Description:** As an organizer, I want to create a new competition so that I can set up a tournament.

**Acceptance Criteria:**
- [ ] Modal or dedicated page with form
- [ ] Required fields: Name, Type (tournament/league dropdown), Format (knockout/round_robin/swiss/ladder dropdown)
- [ ] Optional fields: Start date, End date, Score entry mode (organizers_only/players_can_submit toggle)
- [ ] Form validation with inline error messages
- [ ] Submit calls POST /api/clubs/:clubId/competitions
- [ ] Success shows toast and navigates to new competition detail
- [ ] Cancel returns to competition list
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-006: Competition detail/overview page
**Description:** As an organizer, I want to see competition details and navigate to sub-sections so that I can manage all aspects.

**Acceptance Criteria:**
- [ ] Header shows competition name, status badge, edit button (if draft)
- [ ] Tab navigation or sub-nav: Overview, Divisions, Entries, Draw, Settings
- [ ] Overview tab shows: type, format, dates, entry counts, quick actions
- [ ] Quick actions: Publish (if draft), Generate Draw, View Public Page
- [ ] Back button returns to competition list
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-007: Edit competition settings
**Description:** As an organizer, I want to edit competition settings so that I can update details before publishing.

**Acceptance Criteria:**
- [ ] Settings tab/page shows editable form (same fields as create)
- [ ] Additional settings: Registration mode (organizer_only/self_registration/both)
- [ ] Self-registration settings: requires_approval toggle, registration_deadline date
- [ ] Save calls PUT /api/competitions/:competitionId
- [ ] Shows confirmation toast on success
- [ ] Cannot edit type/format after competition has entries
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-008: Publish competition
**Description:** As an organizer, I want to publish a competition so that it becomes visible and registration can begin.

**Acceptance Criteria:**
- [ ] Publish button visible on draft competitions
- [ ] Confirmation modal explains what publishing does
- [ ] Calls POST /api/competitions/:competitionId/publish
- [ ] Status updates to "published"
- [ ] Success toast confirms publication
- [ ] If self-registration enabled, shows public registration URL
- [ ] Typecheck passes
- [ ] Verify in browser

---

### Division Management

#### US-009: Division list within competition
**Description:** As an organizer, I want to see all divisions in a competition so that I can manage them.

**Acceptance Criteria:**
- [ ] Divisions tab shows list of divisions (GET /api/competitions/:competitionId/divisions)
- [ ] Each row shows: name, format (if different from competition), entry count, draw status
- [ ] "Add Division" button for organizers
- [ ] Click on division expands or navigates to division detail
- [ ] Drag-and-drop reordering updates sort_order
- [ ] Empty state prompts to create first division
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-010: Create division form
**Description:** As an organizer, I want to add divisions to a competition so that I can organize entries by skill level or category.

**Acceptance Criteria:**
- [ ] Modal form with fields: Name (required), Format (optional override), Scoring rule (optional)
- [ ] Format defaults to competition format if not specified
- [ ] Submit calls POST /api/competitions/:competitionId/divisions
- [ ] New division appears in list
- [ ] Success toast confirms creation
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-011: Edit and delete division
**Description:** As an organizer, I want to edit or delete divisions so that I can adjust competition structure.

**Acceptance Criteria:**
- [ ] Edit button opens modal with current values
- [ ] Save calls PUT /api/divisions/:divisionId
- [ ] Delete button shows confirmation modal
- [ ] Cannot delete division with entries (show error)
- [ ] Delete calls DELETE /api/divisions/:divisionId
- [ ] Typecheck passes
- [ ] Verify in browser

---

### Player Management

#### US-012: Club player roster view
**Description:** As an organizer, I want to see all players in my club so that I can add them to competitions.

**Acceptance Criteria:**
- [ ] Players section in nav shows club player roster
- [ ] GET /api/clubs/:clubId/players returns player list
- [ ] Table/list shows: name, email, phone, linked user status
- [ ] Search/filter by name
- [ ] "Add Player" button for organizers
- [ ] Pagination or infinite scroll for large rosters
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-013: Add player to club roster
**Description:** As an organizer, I want to add players to my club so that they can be entered into competitions.

**Acceptance Criteria:**
- [ ] Modal form with fields: Name (required), Email (optional), Phone (optional)
- [ ] Submit calls POST /api/clubs/:clubId/players
- [ ] New player appears in roster
- [ ] Option to "Add another" for batch entry
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-014: Edit player details
**Description:** As an organizer, I want to edit player information so that records stay accurate.

**Acceptance Criteria:**
- [ ] Click player row or edit icon opens edit modal
- [ ] PUT /api/players/:playerId updates player
- [ ] Shows linked user email if player is linked to account
- [ ] Success toast on save
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-015: Create doubles team
**Description:** As an organizer, I want to create doubles teams so that pairs can be entered together.

**Acceptance Criteria:**
- [ ] "Create Team" button in players section or during entry
- [ ] Form: Team name (auto-generated from player names if blank), Player 1 dropdown, Player 2 dropdown
- [ ] POST /api/clubs/:clubId/teams creates team
- [ ] Team appears in teams list (separate tab or filter)
- [ ] Typecheck passes
- [ ] Verify in browser

---

### Entry Management

#### US-016: Division entries list
**Description:** As an organizer, I want to see all entries in a division so that I can manage the participant list.

**Acceptance Criteria:**
- [ ] Entries tab within competition shows entries per division
- [ ] GET /api/divisions/:divisionId/entries returns entry list
- [ ] Table shows: player/team name, seed, registration date, status (confirmed/pending/withdrawn)
- [ ] "Add Entry" button for organizers
- [ ] Bulk actions: Confirm selected, Remove selected
- [ ] Entry count shown in division header
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-017: Add entry (organizer adds player to division)
**Description:** As an organizer, I want to manually add players to a division so that I can manage entries directly.

**Acceptance Criteria:**
- [ ] "Add Entry" opens modal
- [ ] Entry type toggle: Singles / Doubles
- [ ] Singles: searchable player dropdown (club roster)
- [ ] Doubles: searchable team dropdown or create new team inline
- [ ] Optional seed number input
- [ ] Submit calls POST /api/divisions/:divisionId/entries
- [ ] Prevents duplicate entries for same player/team
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-018: Edit entry seed
**Description:** As an organizer, I want to assign seeds to entries so that top players are separated in the draw.

**Acceptance Criteria:**
- [ ] Seed column is editable (inline edit or modal)
- [ ] PUT /api/entries/:entryId updates seed
- [ ] Validation: seed must be unique within division or null
- [ ] Seeded entries show seed badge
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-019: Remove entry from division
**Description:** As an organizer, I want to remove entries so that I can correct mistakes or handle withdrawals.

**Acceptance Criteria:**
- [ ] Delete/remove button on entry row
- [ ] Confirmation modal
- [ ] DELETE /api/entries/:entryId removes entry
- [ ] Cannot remove if division draw is already generated (show error or offer withdraw option)
- [ ] Typecheck passes
- [ ] Verify in browser

---

### Self-Registration (Player-Facing)

#### US-020: Player self-registration page
**Description:** As a player, I want to register myself for a competition so that I don't need to contact the organizer.

**Acceptance Criteria:**
- [ ] Public page at #/competitions/:slug/register (no auth required to view)
- [ ] Shows competition name, divisions available, registration deadline
- [ ] If not logged in, prompts to login or create account
- [ ] Division selection dropdown
- [ ] Entry type selection if division allows both singles/doubles
- [ ] For doubles: partner search/invite or "looking for partner" checkbox
- [ ] Submit calls POST /api/divisions/:divisionId/register
- [ ] Success message explains approval process if requires_approval is true
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-021: Pending registration approval queue
**Description:** As an organizer, I want to review and approve pending registrations so that I control who participates.

**Acceptance Criteria:**
- [ ] Entries list shows pending entries with "Pending" badge
- [ ] Filter to show only pending entries
- [ ] Approve button calls PUT /api/entries/:entryId with status: confirmed
- [ ] Reject button shows modal for optional reason, then DELETE
- [ ] Bulk approve/reject selected
- [ ] Notification count badge on Entries tab when pending exist
- [ ] Typecheck passes
- [ ] Verify in browser

---

### Draw Generation

#### US-022: Generate draw interface
**Description:** As an organizer, I want to generate the tournament draw so that matches are created automatically.

**Acceptance Criteria:**
- [ ] "Generate Draw" button in division detail (visible when entries > 1)
- [ ] Opens configuration modal with options based on format:
  - Knockout: single elimination, consolation round toggle
  - Round robin: number of rounds
  - Swiss: number of rounds
- [ ] Preview shows seeded positions and bye placement
- [ ] Confirm calls POST /api/divisions/:divisionId/draws
- [ ] Success navigates to bracket/schedule view
- [ ] Warning if draw already exists (offer to regenerate)
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-023: View generated bracket/schedule
**Description:** As an organizer, I want to view the generated bracket so that I can see match-ups.

**Acceptance Criteria:**
- [ ] Draw tab shows bracket visualization (knockout) or fixture grid (round robin)
- [ ] Reuses existing BracketView component styles
- [ ] Each match shows: entry names, scheduled time (if set), court (if assigned), score (if played)
- [ ] Click match opens match detail or scoring page
- [ ] Print-friendly view option
- [ ] Typecheck passes
- [ ] Verify in browser

#### US-024: Regenerate draw
**Description:** As an organizer, I want to regenerate the draw if I made a mistake so that I can correct it before matches start.

**Acceptance Criteria:**
- [ ] "Regenerate" button visible if no matches have started
- [ ] Confirmation modal warns this will delete existing draw
- [ ] Calls DELETE then POST for draw endpoints
- [ ] Disabled once any match is in_progress or completed
- [ ] Typecheck passes
- [ ] Verify in browser

---

### Match Scheduling (Bonus)

#### US-025: Assign courts and times to matches
**Description:** As an organizer, I want to schedule matches so that players know when and where to play.

**Acceptance Criteria:**
- [ ] Match row has editable court and scheduled_time fields
- [ ] Inline edit or modal for scheduling
- [ ] PUT /api/matches/:matchId updates schedule
- [ ] Calendar or timeline view option for visualizing schedule
- [ ] Conflict warning if same court double-booked
- [ ] Typecheck passes
- [ ] Verify in browser

---

## Functional Requirements

### Navigation & Layout
- FR-1: The system must display a collapsible side navigation panel on desktop viewports (>768px)
- FR-2: The system must transform navigation to hamburger menu or bottom nav on mobile viewports (<768px)
- FR-3: The system must persist navigation collapse state in localStorage
- FR-4: The system must show breadcrumbs or back buttons for nested views

### Authentication & Authorization
- FR-5: The system must require authentication for all management views
- FR-6: The system must check club membership and role before allowing actions
- FR-7: The system must show/hide UI elements based on user role (admin sees all, organizer sees management, player sees registration)
- FR-8: The system must redirect unauthorized users to appropriate error or login page

### Competition Management
- FR-9: The system must allow creating competitions with name, type, and format as required fields
- FR-10: The system must validate that competition names are unique within a club
- FR-11: The system must prevent editing competition type/format after entries exist
- FR-12: The system must support competition statuses: draft, published, in_progress, completed, cancelled

### Division Management
- FR-13: The system must allow multiple divisions per competition
- FR-14: The system must allow divisions to override competition format
- FR-15: The system must prevent deleting divisions that contain entries

### Player Management
- FR-16: The system must maintain a club player roster separate from user accounts
- FR-17: The system must allow linking players to user accounts via email
- FR-18: The system must support creating doubles teams from two players

### Entry Management
- FR-19: The system must prevent duplicate entries (same player/team in same division)
- FR-20: The system must support entry statuses: pending, confirmed, withdrawn
- FR-21: The system must allow seeding entries with unique seed numbers

### Self-Registration
- FR-22: The system must support configurable registration modes: organizer_only, self_registration, both
- FR-23: The system must support optional approval workflow for self-registrations
- FR-24: The system must allow registration deadlines

### Draw Generation
- FR-25: The system must generate draws based on division format (knockout, round robin, swiss, ladder)
- FR-26: The system must place seeded entries in appropriate bracket positions
- FR-27: The system must assign byes when entry count is not a power of 2 (knockout)
- FR-28: The system must prevent draw regeneration once matches have started

---

## Non-Goals (Out of Scope)

- **Payment processing** - Entry fees and payments are not included
- **Email/SMS notifications** - Automated notifications to players (use existing notification service separately)
- **Advanced scheduling algorithms** - Auto-optimization of court schedules
- **Multi-day scheduling views** - Complex calendar integrations
- **Spectator features** - Public pages beyond registration (existing bracket/live views cover this)
- **Import/export** - CSV import of players or results export
- **Historical statistics** - Player win/loss records and rankings
- **Mobile native app** - This is responsive web only

---

## Design Considerations

### Visual Design
- Follow existing design system (CSS custom properties in main.css)
- Use existing component patterns: cards, buttons, forms, badges, modals
- Maintain gradient header style for section headers
- Use status badges with consistent colors (draft=gray, published=blue, in_progress=green, completed=purple, cancelled=red)

### Navigation UX
- Side nav icons: Home (dashboard), Trophy (competitions), Users (players), Building (clubs)
- Collapsed state shows icons only with tooltips
- Mobile: hamburger icon in header, slides in from left or bottom sheet
- Active state: filled icon + left border accent

### Forms
- Use modal dialogs for simple create/edit actions
- Use dedicated pages for complex multi-step workflows
- Inline validation with error messages below fields
- Disabled submit button until form is valid
- Loading state on submit buttons

### Tables & Lists
- Card-based layout for competitions (visual hierarchy)
- Table layout for players and entries (data density)
- Sticky headers on scrollable tables
- Empty states with illustration and call-to-action

### Responsive Breakpoints
- Mobile: 0-767px (single column, stacked layouts)
- Tablet: 768-1023px (collapsed nav, 2-column where useful)
- Desktop: 1024px+ (expanded nav, full layouts)

---

## Technical Considerations

### Component Architecture
- Create new components in `src/components/` following existing patterns
- Each component is a TypeScript class with constructor options and destroy() method
- Components render into container elements passed via options
- Use event delegation where possible for performance

### Routing
- Extend hash-based routing in `src/main.ts`
- New routes:
  - `#/clubs/:clubId/competitions` - competition list
  - `#/clubs/:clubId/competitions/new` - create competition
  - `#/competitions/:id` - competition detail
  - `#/competitions/:id/divisions/:divisionId` - division detail
  - `#/clubs/:clubId/players` - player roster
  - `#/competitions/:slug/register` - public registration

### State Management
- Store selected club ID in localStorage
- Fetch data on route change, cache minimally
- Use URL params for filters/pagination state

### API Integration
- All API calls include credentials: 'include' for cookie auth
- Handle 401 responses by redirecting to login
- Handle 403 responses with permission denied message
- Show loading states during API calls
- Show toast notifications for success/error feedback

### Existing Code Reuse
- Reuse `BracketView` component for draw visualization
- Reuse form styles from `registration.ts` and `profile-edit.ts`
- Reuse toast notification pattern from `live-scoring.ts`
- Reuse loading spinner and error state patterns

---

## Success Metrics

- Organizers can create a competition and generate a draw within 5 minutes
- Mobile users can complete all management tasks without horizontal scrolling
- Navigation between sections requires at most 2 clicks
- Zero console errors during normal usage flows
- All forms provide clear feedback on validation errors
- Page load time under 2 seconds on 3G connection

---

## Open Questions

1. Should the player roster support bulk CSV import for initial setup?
2. Should organizers be able to customize bracket visualization (colors, logos)?
3. Is there a need for draft saving / auto-save on long forms?
4. Should registration support waitlists when division is full?
5. Should there be keyboard shortcuts for power users?

---

## Implementation Order (Suggested)

1. **Phase 1 - Foundation**
   - US-001: Side navigation
   - US-002: Responsive app shell
   - US-003: Club selector

2. **Phase 2 - Competitions**
   - US-004: Competition list
   - US-005: Create competition
   - US-006: Competition detail
   - US-007: Edit settings
   - US-008: Publish

3. **Phase 3 - Divisions**
   - US-009: Division list
   - US-010: Create division
   - US-011: Edit/delete division

4. **Phase 4 - Players**
   - US-012: Player roster
   - US-013: Add player
   - US-014: Edit player
   - US-015: Create team

5. **Phase 5 - Entries**
   - US-016: Entry list
   - US-017: Add entry
   - US-018: Edit seed
   - US-019: Remove entry

6. **Phase 6 - Registration**
   - US-020: Self-registration page
   - US-021: Approval queue

7. **Phase 7 - Draw**
   - US-022: Generate draw
   - US-023: View bracket
   - US-024: Regenerate draw

8. **Phase 8 - Scheduling (Bonus)**
   - US-025: Court/time assignment
