# Epic 1: Competition Setup

Implement competition lifecycle management for the Tennis Club Tournament Platform.

## Context

You are extending an existing TypeScript application with:
- **Backend**: Express.js at `server/dev-server.ts`
- **Services**: Service pattern at `server/services/` (see `club-service.ts` for reference)
- **Database**: SQLite (`server/db/schema.sql`) and PostgreSQL (`server/db/schema.postgres.sql`)
- **Tests**: Vitest at `tests/services/`

**Epic 0 is complete** - clubs, memberships, invites, and audit logging are implemented.

## Stories to Implement

### B1: Create a Competition/Event

**User Story**: As an organiser, I can create a competition with name, type (tournament/league), format (KO/RR/etc.), dates (optional), and status (draft/published).

**Acceptance Criteria**:
- [ ] Competition belongs to a club
- [ ] Competition has: `id`, `clubId`, `name`, `type` (tournament/league), `format` (knockout/round_robin), `status` (draft/published), `startDate`, `endDate`
- [ ] Draft competitions are not visible to players/public
- [ ] Published competitions are visible via shareable link (read-only)
- [ ] API: `POST /api/clubs/:clubId/competitions` creates competition (organiser+ required)
- [ ] API: `GET /api/clubs/:clubId/competitions` lists competitions
- [ ] API: `GET /api/competitions/:competitionId` gets competition details

### B2: Configure Divisions/Grades

**User Story**: As an organiser, I can create one or more divisions (e.g., A grade, B grade), each with its own draw.

**Acceptance Criteria**:
- [ ] Division has: `id`, `competitionId`, `name`, `format` (optional override), `scoringRuleId` (optional override)
- [ ] Each division can have its own format/scoring rules
- [ ] API: `POST /api/competitions/:competitionId/divisions` creates division
- [ ] API: `GET /api/competitions/:competitionId/divisions` lists divisions
- [ ] API: `PUT /api/competitions/:competitionId/divisions/:divisionId` updates division

### B3: Configure Scoring Rules

**User Story**: As an organiser, I can choose a scoring preset or define a custom scoring rule.

**Acceptance Criteria**:
- [ ] Scoring rule has: `id`, `clubId` (null for presets), `name`, `config` (JSON)
- [ ] Config includes: `bestOfSets`, `gamesToWin`, `winBy`, `tiebreakAt`, `tiebreakPointsToWin`
- [ ] System presets: "Best of 3 sets", "Match tiebreak", "FAST4", "Pro set"
- [ ] API: `GET /api/clubs/:clubId/scoring-rules` lists available rules (presets + club custom)
- [ ] API: `POST /api/clubs/:clubId/scoring-rules` creates custom rule
- [ ] Score entry UI will validate against selected rule (future epic)

**Scoring Presets**:
```json
[
  { "name": "Best of 3 Sets", "config": { "bestOfSets": 3, "gamesToWin": 6, "winBy": 2, "tiebreakAt": 6, "tiebreakPointsToWin": 7 } },
  { "name": "Match Tiebreak", "config": { "bestOfSets": 1, "gamesToWin": 6, "winBy": 2, "tiebreakAt": 6, "tiebreakPointsToWin": 10, "matchTiebreakInsteadOfFinalSet": true } },
  { "name": "FAST4", "config": { "bestOfSets": 3, "gamesToWin": 4, "winBy": 1, "tiebreakAt": 3, "tiebreakPointsToWin": 5 } },
  { "name": "Pro Set", "config": { "bestOfSets": 1, "gamesToWin": 8, "winBy": 2, "tiebreakAt": 8, "tiebreakPointsToWin": 7 } }
]
```

### B4: Configure Score-Entry Permissions

**User Story**: As a club admin or organiser, I can set who can enter scores: organisers/supervisors only, or allow players with mutual confirmation.

**Acceptance Criteria**:
- [ ] Competition has `scoreEntryMode`: `organisers_only` | `players_can_submit`
- [ ] If `players_can_submit`: only match participants can submit/confirm
- [ ] Match not final until both participants approve (or admin overrides)
- [ ] All score actions are audit logged
- [ ] API: `PUT /api/competitions/:competitionId` updates score entry mode

### B5: Publish Competition

**User Story**: As an organiser, I can publish a competition to generate a shareable public link.

**Acceptance Criteria**:
- [ ] Publishing changes status from `draft` to `published`
- [ ] Published competition gets a unique `publicSlug` for sharing
- [ ] API: `POST /api/competitions/:competitionId/publish` publishes
- [ ] API: `GET /api/public/competitions/:slug` returns public view (no auth required)
- [ ] Public view is read-only, no personal data leakage

## Database Schema

Add these tables (both SQLite and PostgreSQL versions):

```sql
-- Scoring rules (presets and custom)
CREATE TABLE IF NOT EXISTS scoring_rules (
  id TEXT PRIMARY KEY,
  club_id TEXT REFERENCES clubs(id),  -- NULL for system presets
  name TEXT NOT NULL,
  config TEXT NOT NULL,  -- JSON
  is_preset INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Competitions
CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('tournament', 'league')),
  format TEXT NOT NULL CHECK (format IN ('knockout', 'round_robin', 'swiss', 'ladder')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'in_progress', 'completed', 'cancelled')),
  score_entry_mode TEXT NOT NULL DEFAULT 'organisers_only' CHECK (score_entry_mode IN ('organisers_only', 'players_can_submit')),
  default_scoring_rule_id TEXT REFERENCES scoring_rules(id),
  public_slug TEXT UNIQUE,
  start_date DATE,
  end_date DATE,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Divisions within a competition
CREATE TABLE IF NOT EXISTS divisions (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL REFERENCES competitions(id),
  name TEXT NOT NULL,
  format TEXT,  -- Override competition format if set
  scoring_rule_id TEXT REFERENCES scoring_rules(id),  -- Override if set
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(competition_id, name)
);

CREATE INDEX IF NOT EXISTS idx_competitions_club ON competitions(club_id);
CREATE INDEX IF NOT EXISTS idx_competitions_slug ON competitions(public_slug);
CREATE INDEX IF NOT EXISTS idx_divisions_competition ON divisions(competition_id);
CREATE INDEX IF NOT EXISTS idx_scoring_rules_club ON scoring_rules(club_id);
```

## Service Interface

Create `server/services/competition-service.ts`:

```typescript
interface CompetitionService {
  // Competitions
  createCompetition(clubId: string, input: CreateCompetitionInput, createdBy: string): Promise<CompetitionResult<Competition>>
  getCompetition(competitionId: string): Promise<Competition | null>
  getClubCompetitions(clubId: string, includesDrafts: boolean): Promise<Competition[]>
  updateCompetition(competitionId: string, input: UpdateCompetitionInput, updatedBy: string): Promise<CompetitionResult<Competition>>
  publishCompetition(competitionId: string, publishedBy: string): Promise<CompetitionResult<Competition>>
  getPublicCompetition(slug: string): Promise<Competition | null>

  // Divisions
  createDivision(competitionId: string, input: CreateDivisionInput): Promise<CompetitionResult<Division>>
  getDivisions(competitionId: string): Promise<Division[]>
  updateDivision(divisionId: string, input: UpdateDivisionInput): Promise<CompetitionResult<Division>>
  deleteDivision(divisionId: string): Promise<CompetitionResult<void>>

  // Scoring Rules
  getScoringRules(clubId: string): Promise<ScoringRule[]>  // Includes presets
  createScoringRule(clubId: string, input: CreateScoringRuleInput): Promise<CompetitionResult<ScoringRule>>
}

type CompetitionFormat = 'knockout' | 'round_robin' | 'swiss' | 'ladder'
type CompetitionType = 'tournament' | 'league'
type CompetitionStatus = 'draft' | 'published' | 'in_progress' | 'completed' | 'cancelled'
type ScoreEntryMode = 'organisers_only' | 'players_can_submit'
```

## Authorization

- Creating/editing competitions requires `organiser` or `admin` role in the club
- Viewing draft competitions requires club membership
- Published competitions are publicly viewable via slug
- Only competition creator or club admin can publish

## API Endpoints to Add

```
POST   /api/clubs/:clubId/competitions              - Create competition (organiser+)
GET    /api/clubs/:clubId/competitions              - List club competitions (member)
GET    /api/competitions/:competitionId             - Get competition (member or public if published)
PUT    /api/competitions/:competitionId             - Update competition (organiser+)
POST   /api/competitions/:competitionId/publish     - Publish competition (organiser+)

POST   /api/competitions/:competitionId/divisions   - Create division (organiser+)
GET    /api/competitions/:competitionId/divisions   - List divisions (member or public)
PUT    /api/competitions/:competitionId/divisions/:divisionId - Update division (organiser+)
DELETE /api/competitions/:competitionId/divisions/:divisionId - Delete division (organiser+)

GET    /api/clubs/:clubId/scoring-rules             - List scoring rules (member)
POST   /api/clubs/:clubId/scoring-rules             - Create custom rule (organiser+)

GET    /api/public/competitions/:slug               - Public competition view (no auth)
```

## Tests Required

Create `tests/services/competition-service.test.ts` with tests for:
- Creating competitions (with all fields)
- Listing club competitions (respecting draft visibility)
- Publishing competition generates slug
- Public slug access works without auth
- Creating/updating/deleting divisions
- Scoring rules (presets + custom)
- Authorization (organiser can create, player cannot)

## Exit Criteria

All of these must pass:

1. **Competition CRUD**: Create competition with name, type, format; update it; list all for club
2. **Division Management**: Create divisions within competition, update, delete
3. **Scoring Rules**: System presets exist and load; custom rules can be created per club
4. **Publishing**: Publishing generates unique slug; public endpoint returns competition without auth
5. **Draft Visibility**: Draft competitions only visible to club members, not public
6. **Authorization**: Non-organisers cannot create/edit competitions (returns 403)
7. **Tests Pass**: `npm run test:run` passes with new competition service tests

## Completion

When all exit criteria pass and tests are green, output:

<promise>EPIC_1_COMPLETE</promise>
