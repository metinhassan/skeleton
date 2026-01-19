/**
 * PostgreSQL database module for local development
 */

import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let scoringPresetsSeeded = false;

export function getPool(): pg.Pool {
  if (pool) return pool;

  pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'skeleton',
    password: process.env.POSTGRES_PASSWORD || 'skeleton_dev',
    database: process.env.POSTGRES_DB || 'skeleton_dev',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  scoringPresetsSeeded = false;
}

export async function resetPostgresDatabase(): Promise<void> {
  const p = getPool();
  // Delete in order respecting foreign key constraints
  await p.query('DELETE FROM standings');
  await p.query('DELETE FROM matches');
  await p.query('DELETE FROM draws');
  await p.query('DELETE FROM entries');
  await p.query('DELETE FROM teams');
  await p.query('DELETE FROM players');
  await p.query('DELETE FROM divisions');
  await p.query('DELETE FROM competitions');
  await p.query('DELETE FROM scoring_rules');
  await p.query('DELETE FROM audit_log');
  await p.query('DELETE FROM club_invites');
  await p.query('DELETE FROM club_members');
  await p.query('DELETE FROM clubs');
  await p.query('DELETE FROM users');
  scoringPresetsSeeded = false;
}

export async function testConnection(): Promise<boolean> {
  try {
    const p = getPool();
    await p.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('PostgreSQL connection failed:', error);
    return false;
  }
}

export async function seedPostgresScoringPresets(): Promise<void> {
  if (scoringPresetsSeeded) return;

  const p = getPool();

  // Fixed UUIDs for presets (deterministic, won't change between runs)
  const presets = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Best of 3 Sets',
      config: { bestOfSets: 3, gamesToWin: 6, winBy: 2, tiebreakAt: 6, tiebreakPointsToWin: 7 },
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Match Tiebreak',
      config: { bestOfSets: 1, gamesToWin: 6, winBy: 2, tiebreakAt: 6, tiebreakPointsToWin: 10, matchTiebreakInsteadOfFinalSet: true },
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      name: 'FAST4',
      config: { bestOfSets: 3, gamesToWin: 4, winBy: 1, tiebreakAt: 3, tiebreakPointsToWin: 5 },
    },
    {
      id: '00000000-0000-0000-0000-000000000004',
      name: 'Pro Set',
      config: { bestOfSets: 1, gamesToWin: 8, winBy: 2, tiebreakAt: 8, tiebreakPointsToWin: 7 },
    },
  ];

  for (const preset of presets) {
    await p.query(
      `INSERT INTO scoring_rules (id, club_id, name, config, is_preset)
       VALUES ($1, NULL, $2, $3, true)
       ON CONFLICT (id) DO NOTHING`,
      [preset.id, preset.name, JSON.stringify(preset.config)]
    );
  }

  scoringPresetsSeeded = true;
}
