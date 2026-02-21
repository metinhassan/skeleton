# Feature Spec: Select Players -> Add Players to Competition

## Summary
Add a bulk-add flow to the Players table so organisers can select multiple players and register them into a selected competition division in one action.

## Problem
Right now, adding many players to competition divisions requires repeated per-entry actions. This is slow and error-prone for organisers.

## Goals
- Let organisers enter a row-selection mode from the Players table.
- Allow selecting and unselecting multiple player rows with clear visual highlight.
- Show a secondary CTA (`Add players to comp`) only when at least one player is selected.
- Open a modal to choose `Competition -> Division`.
- Submit selected players as singles entries to the chosen division.
- Provide per-run success/failure feedback.

## Non-Goals
- Doubles/team bulk add in this feature.
- CSV import changes.
- Reworking existing entry approval workflows.

## UX Requirements

### 1. Selectable Mode
- Add a header button in Players tab actions: `Select Players`.
- Default state: table behaves as today (edit/delete actions visible, no row selection).
- When `Select Players` is clicked:
  - Component enters selection mode.
  - Button label changes to `Cancel Selection`.
  - Row checkboxes appear (left-most column).
  - Edit/Delete row actions are hidden or disabled to reduce accidental clicks.

### 2. Row Selection Behavior
- Clicking a row checkbox toggles selection.
- Clicking a selected row again unselects it.
- Selected rows receive a distinct highlight style.
- Selection persists through local sort/search changes while player remains visible in dataset.
- If selection mode is cancelled, selected set is cleared.

### 3. Secondary CTA
- Show CTA `Add players to comp` only when `selectedCount > 0`.
- CTA label should include count: `Add players to comp (N)`.
- CTA placement: in Players header actions, next to selection controls.

### 4. Add-to-Competition Modal
- Title: `Add Players to Competition`.
- Fields:
  - Competition select (required).
  - Division select (required, options filtered by selected competition).
- Field loading behavior:
  - On modal open: load club competitions.
  - After competition chosen: load divisions for that competition.
- Action buttons:
  - `Cancel`
  - `Add Players` (primary, disabled until both selects are valid)
- Confirmation text: `Adding N player(s) to [Division Name]`.

## Data + API Behavior

## API Calls (existing)
- `GET /api/clubs/:clubId/competitions`
- `GET /api/competitions/:competitionId/divisions`
- `POST /api/divisions/:divisionId/entries` with payload:
  - `{ "entryType": "singles", "playerId": "<id>" }`

## Submission Strategy
- Execute one POST per selected player.
- Use `Promise.allSettled` to allow partial success handling.
- Treat these response codes as per-player failure and continue:
  - 400 (already in division, invalid input)
  - 404 (stale division/player)
  - 500

## Result Handling
- If all succeed: success toast `Added N players to [Division]`.
- If partial: warning toast `Added X of N players. Y failed.`
- If none succeed: error toast `No players were added.`
- On any completion:
  - refresh player list view state unchanged.
  - clear selected players.
  - exit selection mode.

## Validation Rules
- Must require at least one selected player before opening modal (guard + disabled CTA).
- Must require competition and division selections before submit.
- Ignore duplicate selected IDs (set semantics).
- Backend uniqueness already prevents duplicate entries in division; surface backend message in a compact failure summary.

## UI States + Errors
- Competitions load failure: inline modal error + retry affordance.
- Divisions load failure: inline modal error + retry affordance.
- No competitions: empty state text in modal, disable submit.
- No divisions for selected competition: empty state text, disable submit.
- Submit in progress:
  - Disable modal controls.
  - Show spinner text `Adding...`.

## Accessibility
- Selection toggle and checkboxes keyboard reachable.
- Row highlight must maintain contrast.
- Modal follows existing overlay semantics (`Esc` closes unless submitting).
- Toast copy should be concise and announce meaningful status.

## Implementation Notes

## Frontend Files
- `src/components/player-list.ts`
  - Add selection mode state (`isSelectionMode`, `selectedPlayerIds`).
  - Add selection column rendering and row highlight class.
  - Add new header CTAs and event handlers.
  - Add callback for bulk-add trigger.
- `src/main.ts`
  - Wire `PlayerList` bulk-add callback.
  - Open new modal component and refresh `PlayerList` after completion.
- `src/components/` (new modal component suggested)
  - `bulk-add-players-modal.ts` to encapsulate competition/division selection and submission.
- `src/styles/main.css`
  - Add classes for selection mode visuals, selected row highlight, and CTA layout.

## Suggested New Callback Contract
- Extend `PlayerListOptions`:
  - `onBulkAddPlayers?: (playerIds: string[]) => void`

## Acceptance Criteria
1. Players page shows `Select Players` button in Players tab.
2. Clicking `Select Players` enters selection mode and enables selecting/unselecting rows.
3. Selected rows are visually highlighted.
4. `Add players to comp` CTA appears only when at least one row is selected and shows count.
5. Clicking CTA opens modal with competition then division selection.
6. Submitting creates singles entries for all selected players (best-effort partial success).
7. User receives clear success/partial/failure feedback.
8. After submit/cancel-selection, table exits selection mode and clears selection.
9. Existing player search/sort still works.
10. Existing add/edit/delete player flows are unaffected outside selection mode.

## Risks / Follow-up
- Per-player POST may be slow for large batches.
- Follow-up optimization: add backend endpoint for true bulk create (single request + transaction strategy + detailed per-player result payload).
