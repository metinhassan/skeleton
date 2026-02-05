# Claude Code Instructions

## Development Server

Always start the dev server with PostgreSQL for full seed data:

```bash
# First, ensure PostgreSQL is running
docker compose up -d postgres

# Then start the dev server with PostgreSQL
npm run dev:postgres
```

This uses the PostgreSQL database with comprehensive seed data including:
- Demo users (admin@example.com / admin123, demo@example.com / demo1234)
- Demo clubs (City Tennis Club, Riverside Squash)
- Players (16+ per club)
- Teams (doubles pairings)
- Competitions with divisions and entries

**Do NOT use `npm run dev`** - that uses in-memory SQLite without seed data.

## URLs

- Dev Server: http://localhost:3000/ (serves both frontend and API)

## Database

- PostgreSQL runs in Docker on port 5432
- Schema: `server/db/schema.postgres.sql`
- Seed data: `server/db/seed.postgres.sql`

To reset the database:
```bash
docker compose down -v
docker compose up -d postgres
```

To manually run seed:
```bash
npm run db:seed
```
