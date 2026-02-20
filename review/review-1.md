1. **High - Public live page contract mismatch means live matches can render empty**
- Frontend expects `liveMatches` in response (`src/types/live-score.ts:134`, `src/components/public-live-scores.ts:67`).
- Backend returns `matches` instead (`server/dev-server.ts:3475`).
- Impact: `this.liveMatches` becomes `[]`, so users can see “No Live Matches” even when matches exist.

2. **High - Live scoring views expect match metadata that backend never returns**
- Frontend falls back to placeholders if `data.match`/names are missing (`src/components/live-scoring.ts:82`, `src/components/public-match-view.ts:65`).
- Auth endpoint returns only `{ score, displayScore }` (`server/dev-server.ts:3016`).
- Public endpoint also returns only `{ score, displayScore }` (`server/dev-server.ts:3521`).
- Impact: player names/court can show generic values (`Player 1`, `Player 2`) instead of real match info.

3. **Medium - Frontend/backend mismatch for registration settings (`both`, `requiresApproval`)**
- Frontend supports `registrationMode: 'both'` and submits `requiresApproval` (`src/types/competition.ts:8`, `src/components/competition-form.ts:181`, `src/components/competition-form.ts:437`).
- Backend maps registration to one boolean (`registrationOpen`) and ignores `requiresApproval` entirely (`server/dev-server.ts:1188`, `server/dev-server.ts:1193`).
- Service maps can only emit `self_registration` or `organizer_only` and hardcode `requiresApproval: false` (`server/services/postgres-competition-service.ts:544`, `server/services/mock-competition-service.ts:531`).
- Impact: settings are lossy and can silently change after save/reload.

4. **Medium - “slug or id” fallback path is inconsistent with detail fetch**
- Navigation can pass `competition.slug || competition.id` (`src/main.ts:708`, `src/main.ts:737`).
- Detail page always fetches via `/by-slug/:slug` (`src/components/competition-detail.ts:852`).
- Impact: if ID is used as fallback (e.g., old records without slug), detail fetch can 404.

5. **Low - Test suite has a stale expectation**
- Failing test expects `publicSlug` to be `null` on creation (`tests/services/competition-service.test.ts:235`), but service now generates slug on create.
- This causes `npm run test:run` to fail with 1 failing test, weakening CI signal.

**Open questions / assumptions**
- I assumed historical records may exist with missing `public_slug`; if not, issue #4 is latent but still a brittle path.
- I assumed live endpoints are intended to satisfy current frontend contracts (not legacy payloads).

**Checks run**
- `npm run typecheck` passed.
- `npm run test:run` failed with 1 test (`tests/services/competition-service.test.ts:235`), 298 passed, 10 skipped.
