-- PostgreSQL schema for skeleton app

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  groups JSONB DEFAULT '["users"]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Clubs table
CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  region VARCHAR(255),
  logo_url TEXT,
  primary_color VARCHAR(7),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for clubs updated_at
DROP TRIGGER IF EXISTS update_clubs_updated_at ON clubs;
CREATE TRIGGER update_clubs_updated_at
  BEFORE UPDATE ON clubs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Club memberships (links users to clubs with roles)
CREATE TABLE IF NOT EXISTS club_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'organiser', 'supervisor', 'player')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(club_id, user_id)
);

-- Trigger for club_members updated_at
DROP TRIGGER IF EXISTS update_club_members_updated_at ON club_members;
CREATE TRIGGER update_club_members_updated_at
  BEFORE UPDATE ON club_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Club invitations
CREATE TABLE IF NOT EXISTS club_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'organiser', 'supervisor', 'player')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log for tracking changes
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for club-related tables
CREATE INDEX IF NOT EXISTS idx_club_members_club ON club_members(club_id);
CREATE INDEX IF NOT EXISTS idx_club_members_user ON club_members(user_id);
CREATE INDEX IF NOT EXISTS idx_club_invites_email ON club_invites(email);
CREATE INDEX IF NOT EXISTS idx_club_invites_club ON club_invites(club_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_club ON audit_log(club_id);

-- Scoring rules (presets and custom)
CREATE TABLE IF NOT EXISTS scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  config JSONB NOT NULL,
  is_preset BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for scoring_rules updated_at
DROP TRIGGER IF EXISTS update_scoring_rules_updated_at ON scoring_rules;
CREATE TRIGGER update_scoring_rules_updated_at
  BEFORE UPDATE ON scoring_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Competitions
CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('tournament', 'league')),
  format VARCHAR(20) NOT NULL CHECK (format IN ('knockout', 'round_robin', 'swiss', 'ladder')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'in_progress', 'completed', 'cancelled')),
  score_entry_mode VARCHAR(30) NOT NULL DEFAULT 'organisers_only' CHECK (score_entry_mode IN ('organisers_only', 'players_can_submit')),
  default_scoring_rule_id UUID REFERENCES scoring_rules(id),
  public_slug VARCHAR(100) UNIQUE,
  start_date DATE,
  end_date DATE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for competitions updated_at
DROP TRIGGER IF EXISTS update_competitions_updated_at ON competitions;
CREATE TRIGGER update_competitions_updated_at
  BEFORE UPDATE ON competitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Divisions within a competition
CREATE TABLE IF NOT EXISTS divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  format VARCHAR(20),
  scoring_rule_id UUID REFERENCES scoring_rules(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competition_id, name)
);

-- Trigger for divisions updated_at
DROP TRIGGER IF EXISTS update_divisions_updated_at ON divisions;
CREATE TRIGGER update_divisions_updated_at
  BEFORE UPDATE ON divisions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Indexes for competition-related tables
CREATE INDEX IF NOT EXISTS idx_scoring_rules_club ON scoring_rules(club_id);
CREATE INDEX IF NOT EXISTS idx_competitions_club ON competitions(club_id);
CREATE INDEX IF NOT EXISTS idx_competitions_slug ON competitions(public_slug);
CREATE INDEX IF NOT EXISTS idx_divisions_competition ON divisions(competition_id);
