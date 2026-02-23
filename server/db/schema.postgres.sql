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
  registration_open BOOLEAN DEFAULT FALSE,
  registration_deadline TIMESTAMPTZ,
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

-- Player profiles (club-scoped, can exist without user account)
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  claim_token VARCHAR(255),
  claim_token_expires_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for players updated_at
DROP TRIGGER IF EXISTS update_players_updated_at ON players;
CREATE TRIGGER update_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Doubles teams
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  player1_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player2_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seed INTEGER,
  rating REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (player1_id != player2_id)
);

-- Trigger for teams updated_at
DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Competition entries (links players/teams to divisions)
CREATE TABLE IF NOT EXISTS entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('singles', 'doubles')),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  seed INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  registered_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (entry_type = 'singles' AND player_id IS NOT NULL AND team_id IS NULL) OR
    (entry_type = 'doubles' AND team_id IS NOT NULL AND player_id IS NULL)
  ),
  UNIQUE(division_id, player_id),
  UNIQUE(division_id, team_id)
);

-- Trigger for entries updated_at
DROP TRIGGER IF EXISTS update_entries_updated_at ON entries;
CREATE TRIGGER update_entries_updated_at
  BEFORE UPDATE ON entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Indexes for player-related tables
CREATE INDEX IF NOT EXISTS idx_players_club ON players(club_id);
CREATE INDEX IF NOT EXISTS idx_players_email ON players(email);
CREATE INDEX IF NOT EXISTS idx_players_user ON players(user_id);
CREATE INDEX IF NOT EXISTS idx_teams_club ON teams(club_id);
CREATE INDEX IF NOT EXISTS idx_teams_player1 ON teams(player1_id);
CREATE INDEX IF NOT EXISTS idx_teams_player2 ON teams(player2_id);
CREATE INDEX IF NOT EXISTS idx_entries_division ON entries(division_id);
CREATE INDEX IF NOT EXISTS idx_entries_player ON entries(player_id);
CREATE INDEX IF NOT EXISTS idx_entries_team ON entries(team_id);

-- Tournament draws (brackets)
CREATE TABLE IF NOT EXISTS draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  draw_type VARCHAR(30) NOT NULL CHECK (draw_type IN ('single_elimination', 'double_elimination', 'round_robin')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for draws updated_at
DROP TRIGGER IF EXISTS update_draws_updated_at ON draws;
CREATE TRIGGER update_draws_updated_at
  BEFORE UPDATE ON draws
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Matches within a draw
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id UUID NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  bracket VARCHAR(20) DEFAULT 'winners',
  entry1_id UUID REFERENCES entries(id) ON DELETE SET NULL,
  entry2_id UUID REFERENCES entries(id) ON DELETE SET NULL,
  winner_entry_id UUID REFERENCES entries(id) ON DELETE SET NULL,
  score JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'walkover', 'retired')),
  scheduled_time TIMESTAMPTZ,
  court VARCHAR(100),
  source_match1_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  source_match2_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  loser_next_match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
  loser_slot SMALLINT CHECK (loser_slot IS NULL OR loser_slot IN (1, 2)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(draw_id, round_number, match_number, bracket)
);

-- Trigger for matches updated_at
DROP TRIGGER IF EXISTS update_matches_updated_at ON matches;
CREATE TRIGGER update_matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Round robin standings
CREATE TABLE IF NOT EXISTS standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id UUID NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  games_lost INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  position INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(draw_id, entry_id)
);

-- Trigger for standings updated_at
DROP TRIGGER IF EXISTS update_standings_updated_at ON standings;
CREATE TRIGGER update_standings_updated_at
  BEFORE UPDATE ON standings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Indexes for draw-related tables
CREATE INDEX IF NOT EXISTS idx_draws_division ON draws(division_id);
CREATE INDEX IF NOT EXISTS idx_matches_draw ON matches(draw_id);
CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(draw_id, round_number);
CREATE INDEX IF NOT EXISTS idx_matches_source ON matches(source_match1_id, source_match2_id);
CREATE INDEX IF NOT EXISTS idx_standings_draw ON standings(draw_id);
CREATE INDEX IF NOT EXISTS idx_standings_entry ON standings(entry_id);

-- Partner requests for doubles registration
CREATE TABLE IF NOT EXISTS partner_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  requester_player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  invitee_player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  UNIQUE(division_id, requester_player_id, invitee_player_id)
);

-- Indexes for partner requests
CREATE INDEX IF NOT EXISTS idx_partner_requests_division ON partner_requests(division_id);
CREATE INDEX IF NOT EXISTS idx_partner_requests_invitee ON partner_requests(invitee_player_id);
CREATE INDEX IF NOT EXISTS idx_partner_requests_requester ON partner_requests(requester_player_id);
CREATE INDEX IF NOT EXISTS idx_partner_requests_status ON partner_requests(status);
CREATE INDEX IF NOT EXISTS idx_players_claim_token ON players(claim_token);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);

-- Notification preferences per user
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  match_scheduled BOOLEAN DEFAULT TRUE,
  match_reminder BOOLEAN DEFAULT TRUE,
  registration_status BOOLEAN DEFAULT TRUE,
  partner_requests BOOLEAN DEFAULT TRUE,
  competition_updates BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for notification_preferences updated_at
DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Notification queue
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for notifications updated_at
DROP TRIGGER IF EXISTS update_notifications_updated_at ON notifications;
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id);

-- Live scoring for real-time match tracking
CREATE TABLE IF NOT EXISTS match_live_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  current_set INTEGER NOT NULL DEFAULT 1,
  entry1_games JSONB NOT NULL DEFAULT '[]',
  entry2_games JSONB NOT NULL DEFAULT '[]',
  entry1_points INTEGER NOT NULL DEFAULT 0,
  entry2_points INTEGER NOT NULL DEFAULT 0,
  is_tiebreak BOOLEAN NOT NULL DEFAULT FALSE,
  tiebreak_entry1_points INTEGER NOT NULL DEFAULT 0,
  tiebreak_entry2_points INTEGER NOT NULL DEFAULT 0,
  serving_entry INTEGER NOT NULL DEFAULT 1 CHECK (serving_entry IN (1, 2)),
  status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'paused', 'completed', 'abandoned')),
  pause_reason TEXT,
  abandon_reason TEXT,
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  total_pause_duration INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for match_live_scores updated_at
DROP TRIGGER IF EXISTS update_match_live_scores_updated_at ON match_live_scores;
CREATE TRIGGER update_match_live_scores_updated_at
  BEFORE UPDATE ON match_live_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Point-by-point history for match replay and statistics
CREATE TABLE IF NOT EXISTS match_point_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  set_number INTEGER NOT NULL,
  game_number INTEGER NOT NULL,
  point_number INTEGER NOT NULL,
  winner_entry INTEGER NOT NULL CHECK (winner_entry IN (1, 2)),
  score_before JSONB NOT NULL,
  score_after JSONB NOT NULL,
  is_break_point BOOLEAN NOT NULL DEFAULT FALSE,
  is_set_point BOOLEAN NOT NULL DEFAULT FALSE,
  is_match_point BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, sequence_number)
);

-- Indexes for live scoring tables
CREATE INDEX IF NOT EXISTS idx_live_scores_match ON match_live_scores(match_id);
CREATE INDEX IF NOT EXISTS idx_live_scores_status ON match_live_scores(status);
CREATE INDEX IF NOT EXISTS idx_point_history_match ON match_point_history(match_id);
CREATE INDEX IF NOT EXISTS idx_point_history_sequence ON match_point_history(match_id, sequence_number);
