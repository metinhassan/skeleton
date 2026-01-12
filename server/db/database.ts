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
  database.exec('DELETE FROM users');
}
