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
  registration_open INTEGER DEFAULT 0,
  registration_deadline DATETIME,
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

-- Player profiles (club-scoped, can exist without user account)
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  claim_token TEXT,
  claim_token_expires_at DATETIME,
  claimed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Doubles teams
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  name TEXT NOT NULL,
  player1_id TEXT NOT NULL REFERENCES players(id),
  player2_id TEXT NOT NULL REFERENCES players(id),
  seed INTEGER,
  rating REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (player1_id != player2_id)
);

-- Competition entries (links players/teams to divisions)
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  division_id TEXT NOT NULL REFERENCES divisions(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('singles', 'doubles')),
  player_id TEXT REFERENCES players(id),
  team_id TEXT REFERENCES teams(id),
  seed INTEGER,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  registered_by_user_id TEXT REFERENCES users(id),
  registered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (entry_type = 'singles' AND player_id IS NOT NULL AND team_id IS NULL) OR
    (entry_type = 'doubles' AND team_id IS NOT NULL AND player_id IS NULL)
  ),
  UNIQUE(division_id, player_id),
  UNIQUE(division_id, team_id)
);

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
  id TEXT PRIMARY KEY,
  division_id TEXT NOT NULL REFERENCES divisions(id),
  draw_type TEXT NOT NULL CHECK (draw_type IN ('single_elimination', 'double_elimination', 'round_robin')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  config TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Matches within a draw
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  draw_id TEXT NOT NULL REFERENCES draws(id),
  round_number INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  bracket TEXT DEFAULT 'winners',
  entry1_id TEXT REFERENCES entries(id),
  entry2_id TEXT REFERENCES entries(id),
  winner_entry_id TEXT REFERENCES entries(id),
  score TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'walkover', 'retired')),
  scheduled_time DATETIME,
  court TEXT,
  source_match1_id TEXT REFERENCES matches(id),
  source_match2_id TEXT REFERENCES matches(id),
  loser_next_match_id TEXT REFERENCES matches(id),
  loser_slot INTEGER CHECK (loser_slot IS NULL OR loser_slot IN (1, 2)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(draw_id, round_number, match_number, bracket)
);

-- Round robin standings
CREATE TABLE IF NOT EXISTS standings (
  id TEXT PRIMARY KEY,
  draw_id TEXT NOT NULL REFERENCES draws(id),
  entry_id TEXT NOT NULL REFERENCES entries(id),
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  games_lost INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  position INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(draw_id, entry_id)
);

-- Indexes for draw-related tables
CREATE INDEX IF NOT EXISTS idx_draws_division ON draws(division_id);
CREATE INDEX IF NOT EXISTS idx_matches_draw ON matches(draw_id);
CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(draw_id, round_number);
CREATE INDEX IF NOT EXISTS idx_matches_source ON matches(source_match1_id, source_match2_id);
CREATE INDEX IF NOT EXISTS idx_standings_draw ON standings(draw_id);
CREATE INDEX IF NOT EXISTS idx_standings_entry ON standings(entry_id);

-- Partner requests for doubles registration
CREATE TABLE IF NOT EXISTS partner_requests (
  id TEXT PRIMARY KEY,
  division_id TEXT NOT NULL REFERENCES divisions(id),
  requester_player_id TEXT NOT NULL REFERENCES players(id),
  invitee_player_id TEXT NOT NULL REFERENCES players(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  responded_at DATETIME,
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
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  match_scheduled INTEGER DEFAULT 1,
  match_reminder INTEGER DEFAULT 1,
  registration_status INTEGER DEFAULT 1,
  partner_requests INTEGER DEFAULT 1,
  competition_updates INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notification queue
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  scheduled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled ON notifications(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id);

-- Live scoring for real-time match tracking
CREATE TABLE IF NOT EXISTS match_live_scores (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
  current_set INTEGER NOT NULL DEFAULT 1,
  entry1_games TEXT NOT NULL DEFAULT '[]',
  entry2_games TEXT NOT NULL DEFAULT '[]',
  entry1_points INTEGER NOT NULL DEFAULT 0,
  entry2_points INTEGER NOT NULL DEFAULT 0,
  is_tiebreak INTEGER NOT NULL DEFAULT 0,
  tiebreak_entry1_points INTEGER NOT NULL DEFAULT 0,
  tiebreak_entry2_points INTEGER NOT NULL DEFAULT 0,
  serving_entry INTEGER NOT NULL DEFAULT 1 CHECK (serving_entry IN (1, 2)),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'paused', 'completed', 'abandoned')),
  pause_reason TEXT,
  abandon_reason TEXT,
  started_at DATETIME,
  paused_at DATETIME,
  total_pause_duration INTEGER NOT NULL DEFAULT 0,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Point-by-point history for match replay and statistics
CREATE TABLE IF NOT EXISTS match_point_history (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  set_number INTEGER NOT NULL,
  game_number INTEGER NOT NULL,
  point_number INTEGER NOT NULL,
  winner_entry INTEGER NOT NULL CHECK (winner_entry IN (1, 2)),
  score_before TEXT NOT NULL,
  score_after TEXT NOT NULL,
  is_break_point INTEGER NOT NULL DEFAULT 0,
  is_set_point INTEGER NOT NULL DEFAULT 0,
  is_match_point INTEGER NOT NULL DEFAULT 0,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(match_id, sequence_number)
);

-- Indexes for live scoring tables
CREATE INDEX IF NOT EXISTS idx_live_scores_match ON match_live_scores(match_id);
CREATE INDEX IF NOT EXISTS idx_live_scores_status ON match_live_scores(status);
CREATE INDEX IF NOT EXISTS idx_point_history_match ON match_point_history(match_id);
CREATE INDEX IF NOT EXISTS idx_point_history_sequence ON match_point_history(match_id, sequence_number);
