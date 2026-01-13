/**
 * SQLite database module for local development
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'dev.sqlite');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Initialize schema
  initializeSchema(db);

  return db;
}

function initializeSchema(database: Database.Database): void {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function resetDatabase(): void {
  const database = getDatabase();
  // Delete in order respecting foreign key constraints
  database.exec('DELETE FROM divisions');
  database.exec('DELETE FROM competitions');
  database.exec('DELETE FROM scoring_rules');
  database.exec('DELETE FROM audit_log');
  database.exec('DELETE FROM club_invites');
  database.exec('DELETE FROM club_members');
  database.exec('DELETE FROM clubs');
  database.exec('DELETE FROM users');
}

export function seedScoringPresets(): void {
  const database = getDatabase();

  const presets = [
    {
      id: 'preset-best-of-3',
      name: 'Best of 3 Sets',
      config: JSON.stringify({ bestOfSets: 3, gamesToWin: 6, winBy: 2, tiebreakAt: 6, tiebreakPointsToWin: 7 }),
    },
    {
      id: 'preset-match-tiebreak',
      name: 'Match Tiebreak',
      config: JSON.stringify({ bestOfSets: 1, gamesToWin: 6, winBy: 2, tiebreakAt: 6, tiebreakPointsToWin: 10, matchTiebreakInsteadOfFinalSet: true }),
    },
    {
      id: 'preset-fast4',
      name: 'FAST4',
      config: JSON.stringify({ bestOfSets: 3, gamesToWin: 4, winBy: 1, tiebreakAt: 3, tiebreakPointsToWin: 5 }),
    },
    {
      id: 'preset-pro-set',
      name: 'Pro Set',
      config: JSON.stringify({ bestOfSets: 1, gamesToWin: 8, winBy: 2, tiebreakAt: 8, tiebreakPointsToWin: 7 }),
    },
  ];

  const stmt = database.prepare(`
    INSERT OR IGNORE INTO scoring_rules (id, club_id, name, config, is_preset, created_at, updated_at)
    VALUES (?, NULL, ?, ?, 1, datetime('now'), datetime('now'))
  `);

  for (const preset of presets) {
    stmt.run(preset.id, preset.name, preset.config);
  }
}
