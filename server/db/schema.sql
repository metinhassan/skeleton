-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  groups TEXT DEFAULT '["users"]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Clubs table
CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT,
  logo_url TEXT,
  primary_color TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Club memberships (links users to clubs with roles)
CREATE TABLE IF NOT EXISTS club_members (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('admin', 'organiser', 'supervisor', 'player')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(club_id, user_id)
);

-- Club invitations
CREATE TABLE IF NOT EXISTS club_invites (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'organiser', 'supervisor', 'player')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_by TEXT NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for tracking changes
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  club_id TEXT REFERENCES clubs(id),
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_values TEXT,
  new_values TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for club-related tables
CREATE INDEX IF NOT EXISTS idx_club_members_club ON club_members(club_id);
CREATE INDEX IF NOT EXISTS idx_club_members_user ON club_members(user_id);
CREATE INDEX IF NOT EXISTS idx_club_invites_email ON club_invites(email);
CREATE INDEX IF NOT EXISTS idx_club_invites_club ON club_invites(club_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_club ON audit_log(club_id);

-- Scoring rules (presets and custom)
CREATE TABLE IF NOT EXISTS scoring_rules (
  id TEXT PRIMARY KEY,
  club_id TEXT REFERENCES clubs(id),
  name TEXT NOT NULL,
  config TEXT NOT NULL,
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
  format TEXT,
  scoring_rule_id TEXT REFERENCES scoring_rules(id),
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(competition_id, name)
);

-- Indexes for competition-related tables
CREATE INDEX IF NOT EXISTS idx_scoring_rules_club ON scoring_rules(club_id);
CREATE INDEX IF NOT EXISTS idx_competitions_club ON competitions(club_id);
CREATE INDEX IF NOT EXISTS idx_competitions_slug ON competitions(public_slug);
CREATE INDEX IF NOT EXISTS idx_divisions_competition ON divisions(competition_id);
