# Phase 3 Implementation Plan: Division Management

## Overview

Implement division management features within competitions:
- **US-009**: Division list within competition
- **US-010**: Create division form
- **US-011**: Edit and delete division

## Files to Create

| File | Purpose |
|------|---------|
| `src/types/division.ts` | TypeScript interfaces for Division, CreateDivisionData, etc. |
| `src/components/division-list.ts` | List of divisions within a competition with actions |
| `src/components/division-form.ts` | Modal form for create/edit division |

## Files to Modify

| File | Changes |
|------|---------|
| `src/styles/main.css` | Add ~100 lines: division list, division row, draw status badges |
| `src/components/competition-detail.ts` | Update divisions tab to use DivisionList component |

## Implementation Steps

### Step 1: Create Type Definitions
**File:** `src/types/division.ts`
```typescript
export type DrawStatus = 'not_generated' | 'generated' | 'in_progress' | 'completed';

export interface Division {
  id: string;
  competitionId: string;
  name: string;
  format: CompetitionFormat | null;  // null means inherit from competition
  scoringRule: string | null;
  sortOrder: number;
  entryCount: number;
  drawStatus: DrawStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDivisionData {
  name: string;
  format?: CompetitionFormat;
  scoringRule?: string;
}

export interface UpdateDivisionData extends Partial<CreateDivisionData> {
  sortOrder?: number;
}
```

### Step 2: Add CSS Styles
**File:** `src/styles/main.css`

Add styles for:
- `.division-list` - Container for division rows
- `.division-row` - Individual division with hover state
- `.division-row__info`, `.division-row__stats`, `.division-row__actions`
- `.draw-status-badge--*` - Draw status colors
- `.division-row--dragging` - Drag state

Draw status badge colors:
- not_generated: gray (#94a3b8)
- generated: blue (#3b82f6)
- in_progress: green (#22c55e)
- completed: purple (#8b5cf6)

### Step 3: Create Division List Component
**File:** `src/components/division-list.ts`
- Fetches from `GET /api/competitions/:competitionId/divisions`
- Renders list of division rows
- Each row shows: name, format badge (if override), entry count, draw status badge
- "Add Division" button
- Edit/Delete action buttons per row
- Empty state with CTA
- Click row expands details or navigates (future)
- Optional: drag-and-drop reordering (skip for MVP)
- `destroy()` method for cleanup

### Step 4: Create Division Form Component
**File:** `src/components/division-form.ts`
- Modal dialog with form
- Mode: 'create' | 'edit'
- Required fields: Name
- Optional fields: Format (dropdown, defaults to "Inherit from competition"), Scoring rule
- Form validation with inline errors
- Create: `POST /api/competitions/:competitionId/divisions`
- Edit: `PUT /api/divisions/:divisionId`
- Success toast and callback
- Cancel closes modal

### Step 5: Update Competition Detail Component
**File:** `src/components/competition-detail.ts`

Changes:
1. Import DivisionList and DivisionForm components
2. Add `activeDivisionList` and `activeDivisionForm` properties
3. Update `renderDivisionsTab()` to create DivisionList instance
4. Add `showCreateDivision()` method
5. Add `showEditDivision(division)` method
6. Add `handleDeleteDivision(division)` method with confirmation
7. Update `cleanupTabComponents()` to destroy division components

## API Integration

### Endpoints Used

```
GET    /api/competitions/:competitionId/divisions    - List divisions
POST   /api/competitions/:competitionId/divisions    - Create division
GET    /api/divisions/:divisionId                    - Get division details
PUT    /api/divisions/:divisionId                    - Update division
DELETE /api/divisions/:divisionId                    - Delete division
```

### API Response Examples

**List divisions:**
```json
{
  "divisions": [
    {
      "id": "div-1",
      "competitionId": "comp-1",
      "name": "Open Singles",
      "format": null,
      "scoringRule": null,
      "sortOrder": 1,
      "entryCount": 8,
      "drawStatus": "not_generated"
    },
    {
      "id": "div-2",
      "competitionId": "comp-1",
      "name": "U18 Singles",
      "format": "round_robin",
      "scoringRule": null,
      "sortOrder": 2,
      "entryCount": 4,
      "drawStatus": "generated"
    }
  ]
}
```

**Create division request:**
```json
{
  "name": "Mixed Doubles",
  "format": "knockout",
  "scoringRule": "best_of_3"
}
```

## Verification

1. **Build check**: `npm run build` passes with no TypeScript errors
2. **Division list**:
   - Navigate to competition detail → Divisions tab
   - Shows loading then division list or empty state
   - Click "Add Division" opens form modal
3. **Create division**:
   - Fill form with name
   - Submit creates division
   - Success toast appears
   - New division in list
4. **Edit division**:
   - Click edit button on row
   - Modal shows current values
   - Save updates division
5. **Delete division**:
   - Click delete button
   - Confirmation modal appears
   - Confirm deletes (if no entries)
   - Error shown if has entries
