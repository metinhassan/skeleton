-- Seed data for testing the skeleton app (PostgreSQL)
-- Run this after schema.postgres.sql
-- Usage: psql -h localhost -U skeleton -d skeleton_dev -f seed.postgres.sql

-- ==================== Scoring Rule Presets ====================
-- These are the same presets that seedScoringPresets() adds for SQLite
INSERT INTO scoring_rules (id, club_id, name, config, is_preset, created_at, updated_at) VALUES
  ('00000000-0000-0000-0000-000000000001', NULL, 'Best of 3 Sets', '{"bestOfSets": 3, "gamesToWin": 6, "winBy": 2, "tiebreakAt": 6, "tiebreakPointsToWin": 7}', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000002', NULL, 'Match Tiebreak', '{"bestOfSets": 1, "gamesToWin": 6, "winBy": 2, "tiebreakAt": 6, "tiebreakPointsToWin": 10, "matchTiebreakInsteadOfFinalSet": true}', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000003', NULL, 'FAST4', '{"bestOfSets": 3, "gamesToWin": 4, "winBy": 1, "tiebreakAt": 3, "tiebreakPointsToWin": 5}', true, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000004', NULL, 'Pro Set', '{"bestOfSets": 1, "gamesToWin": 8, "winBy": 2, "tiebreakAt": 8, "tiebreakPointsToWin": 7}', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ==================== Users ====================
-- Passwords: admin@example.com=admin123, demo@example.com=demo1234, others=password123
INSERT INTO users (id, email, password_hash, name, groups) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@example.com', '$2b$10$meiXJ4SY0JtJYlwE./WZGuKS8nRo5.Hqkxn60.wBMP221qD/sR/vu', 'Admin User', '["users", "admin"]'),
  ('00000000-0000-0000-0000-000000000002', 'demo@example.com', '$2b$10$9U6WFWxGSox5SlVQMbWU2OMMTV10KKHSajG2TvgkJHIT1VkdAXNbm', 'Demo User', '["users"]'),
  ('00000000-0000-0000-0000-000000000003', 'player1@example.com', '$2b$10$6FzN9HK59xSQ93GoUFsG5.uMDNLkHTBYBVcOiRiWXH3dMhocG.sCC', 'John Smith', '["users"]'),
  ('00000000-0000-0000-0000-000000000004', 'player2@example.com', '$2b$10$6FzN9HK59xSQ93GoUFsG5.uMDNLkHTBYBVcOiRiWXH3dMhocG.sCC', 'Emma Wilson', '["users"]')
ON CONFLICT (id) DO NOTHING;

-- ==================== Clubs ====================
-- These match the clubs seeded by seedDemoClubs() in dev-server.ts
INSERT INTO clubs (id, name, region, primary_color) VALUES
  ('10000000-0000-0000-0000-000000000001', 'City Tennis Club', 'Metro Area', '#1a5f2a'),
  ('10000000-0000-0000-0000-000000000002', 'Riverside Squash', 'West District', '#003366')
ON CONFLICT (id) DO NOTHING;

-- ==================== Club Members ====================
INSERT INTO club_members (id, club_id, user_id, role, status) VALUES
  -- City Tennis Club members
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'organiser', 'active'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'player', 'active'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'player', 'active'),
  -- Riverside Squash members
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'admin', 'active')
ON CONFLICT (club_id, user_id) DO NOTHING;

-- ==================== Players (City Tennis Club) ====================
INSERT INTO players (id, club_id, user_id, name, email, phone) VALUES
  -- Players linked to user accounts
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'John Smith', 'player1@example.com', '0400111222'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'Emma Wilson', 'player2@example.com', '0400111223'),
  -- Players without user accounts (organiser-created)
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', NULL, 'Michael Chen', 'michael.chen@email.com', '0400111224'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', NULL, 'Sophie Anderson', 'sophie.anderson@email.com', '0400111225'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', NULL, 'David Lee', 'david.lee@email.com', '0400111226'),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', NULL, 'Jessica Taylor', 'jessica.taylor@email.com', '0400111227'),
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', NULL, 'Ryan Martinez', 'ryan.martinez@email.com', '0400111228'),
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', NULL, 'Olivia Brown', 'olivia.brown@email.com', '0400111229'),
  ('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', NULL, 'James Johnson', 'james.johnson@email.com', '0400111230'),
  ('30000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', NULL, 'Ava Williams', 'ava.williams@email.com', '0400111231'),
  ('30000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', NULL, 'Ethan Davis', 'ethan.davis@email.com', '0400111232'),
  ('30000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', NULL, 'Mia Garcia', 'mia.garcia@email.com', '0400111233'),
  ('30000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', NULL, 'Noah Miller', 'noah.miller@email.com', '0400111234'),
  ('30000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', NULL, 'Isabella Moore', 'isabella.moore@email.com', '0400111235'),
  ('30000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', NULL, 'Liam Jackson', 'liam.jackson@email.com', '0400111236'),
  ('30000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000001', NULL, 'Charlotte White', 'charlotte.white@email.com', '0400111237')
ON CONFLICT (id) DO NOTHING;

-- ==================== Players (Riverside Squash) ====================
INSERT INTO players (id, club_id, user_id, name, email, phone) VALUES
  ('30000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000002', NULL, 'Alexander Thompson', 'alex.thompson@email.com', '0400222001'),
  ('30000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000002', NULL, 'Victoria Clarke', 'victoria.clarke@email.com', '0400222002'),
  ('30000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000002', NULL, 'Benjamin Scott', 'benjamin.scott@email.com', '0400222003'),
  ('30000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000002', NULL, 'Amelia Wright', 'amelia.wright@email.com', '0400222004'),
  ('30000000-0000-0000-0000-000000000105', '10000000-0000-0000-0000-000000000002', NULL, 'William Harris', 'william.harris@email.com', '0400222005'),
  ('30000000-0000-0000-0000-000000000106', '10000000-0000-0000-0000-000000000002', NULL, 'Grace Martin', 'grace.martin@email.com', '0400222006'),
  ('30000000-0000-0000-0000-000000000107', '10000000-0000-0000-0000-000000000002', NULL, 'Henry Robinson', 'henry.robinson@email.com', '0400222007'),
  ('30000000-0000-0000-0000-000000000108', '10000000-0000-0000-0000-000000000002', NULL, 'Chloe Lewis', 'chloe.lewis@email.com', '0400222008')
ON CONFLICT (id) DO NOTHING;

-- ==================== Teams (City Tennis Club - Doubles) ====================
INSERT INTO teams (id, club_id, name, player1_id, player2_id, seed, rating) VALUES
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'John Smith / Emma Wilson', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 1, 4.5),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Michael Chen / Sophie Anderson', '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004', 2, 4.2),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'David Lee / Jessica Taylor', '30000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000006', 3, 4.0),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Ryan Martinez / Olivia Brown', '30000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000008', 4, 3.8),
  ('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'James Johnson / Ava Williams', '30000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000010', NULL, 3.5),
  ('40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Ethan Davis / Mia Garcia', '30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000012', NULL, 3.5),
  ('40000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'Noah Miller / Isabella Moore', '30000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000014', NULL, 3.2),
  ('40000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'Liam Jackson / Charlotte White', '30000000-0000-0000-0000-000000000015', '30000000-0000-0000-0000-000000000016', NULL, 3.0)
ON CONFLICT (id) DO NOTHING;

-- ==================== Teams (Riverside Squash - Doubles) ====================
INSERT INTO teams (id, club_id, name, player1_id, player2_id, seed, rating) VALUES
  ('40000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000002', 'Alexander Thompson / Victoria Clarke', '30000000-0000-0000-0000-000000000101', '30000000-0000-0000-0000-000000000102', 1, 4.3),
  ('40000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000002', 'Benjamin Scott / Amelia Wright', '30000000-0000-0000-0000-000000000103', '30000000-0000-0000-0000-000000000104', 2, 4.0),
  ('40000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000002', 'William Harris / Grace Martin', '30000000-0000-0000-0000-000000000105', '30000000-0000-0000-0000-000000000106', NULL, 3.7),
  ('40000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000002', 'Henry Robinson / Chloe Lewis', '30000000-0000-0000-0000-000000000107', '30000000-0000-0000-0000-000000000108', NULL, 3.5)
ON CONFLICT (id) DO NOTHING;

-- ==================== Competitions (City Tennis Club) ====================
INSERT INTO competitions (id, club_id, name, type, format, status, score_entry_mode, public_slug, start_date, end_date, registration_open, registration_deadline, created_by) VALUES
  -- Active tournament with registration open
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Summer Championship 2026', 'tournament', 'knockout', 'published', 'organisers_only', 'summer-championship-2026', '2026-02-01', '2026-02-15', true, '2026-01-30 23:59:59+00', '00000000-0000-0000-0000-000000000002'),
  -- In-progress tournament
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Autumn Classic 2025', 'tournament', 'knockout', 'in_progress', 'organisers_only', 'autumn-classic-2025', '2025-10-01', '2025-10-15', false, NULL, '00000000-0000-0000-0000-000000000002'),
  -- Round robin league
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Winter League 2026', 'league', 'round_robin', 'published', 'players_can_submit', 'winter-league-2026', '2026-06-01', '2026-08-31', true, '2026-05-25 23:59:59+00', '00000000-0000-0000-0000-000000000002'),
  -- Draft competition
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Spring Cup 2026', 'tournament', 'knockout', 'draft', 'organisers_only', NULL, '2026-09-01', '2026-09-15', false, NULL, '00000000-0000-0000-0000-000000000002'),
  -- Completed tournament
  ('50000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Club Championship 2025', 'tournament', 'knockout', 'completed', 'organisers_only', 'club-championship-2025', '2025-03-01', '2025-03-15', false, NULL, '00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ==================== Competitions (Riverside Squash) ====================
INSERT INTO competitions (id, club_id, name, type, format, status, score_entry_mode, public_slug, start_date, end_date, registration_open, registration_deadline, created_by) VALUES
  ('50000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000002', 'Riverside Open 2026', 'tournament', 'knockout', 'published', 'organisers_only', 'riverside-open-2026', '2026-03-01', '2026-03-15', true, '2026-02-25 23:59:59+00', '00000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000002', 'Harbour Cup 2026', 'tournament', 'round_robin', 'draft', 'organisers_only', NULL, '2026-05-01', '2026-05-10', false, NULL, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ==================== Divisions (Summer Championship 2026) ====================
INSERT INTO divisions (id, competition_id, name, format, sort_order) VALUES
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Open Singles', 'knockout', 1),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'Open Doubles', 'knockout', 2),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'Under 18 Singles', 'knockout', 3),
  ('60000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', 'Veterans Singles (45+)', 'knockout', 4)
ON CONFLICT (id) DO NOTHING;

-- ==================== Divisions (Autumn Classic 2025) ====================
INSERT INTO divisions (id, competition_id, name, format, sort_order) VALUES
  ('60000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000002', 'Open Singles', 'knockout', 1),
  ('60000000-0000-0000-0000-000000000012', '50000000-0000-0000-0000-000000000002', 'Open Doubles', 'knockout', 2)
ON CONFLICT (id) DO NOTHING;

-- ==================== Divisions (Winter League 2026) ====================
INSERT INTO divisions (id, competition_id, name, format, sort_order) VALUES
  ('60000000-0000-0000-0000-000000000021', '50000000-0000-0000-0000-000000000003', 'Division 1', 'round_robin', 1),
  ('60000000-0000-0000-0000-000000000022', '50000000-0000-0000-0000-000000000003', 'Division 2', 'round_robin', 2),
  ('60000000-0000-0000-0000-000000000023', '50000000-0000-0000-0000-000000000003', 'Division 3', 'round_robin', 3)
ON CONFLICT (id) DO NOTHING;

-- ==================== Divisions (Riverside Open 2026) ====================
INSERT INTO divisions (id, competition_id, name, format, sort_order) VALUES
  ('60000000-0000-0000-0000-000000000101', '50000000-0000-0000-0000-000000000101', 'Open Singles', 'knockout', 1),
  ('60000000-0000-0000-0000-000000000102', '50000000-0000-0000-0000-000000000101', 'Open Doubles', 'knockout', 2)
ON CONFLICT (id) DO NOTHING;

-- ==================== Entries (Summer Championship - Open Singles) ====================
INSERT INTO entries (id, division_id, entry_type, player_id, team_id, seed, status) VALUES
  ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'singles', '30000000-0000-0000-0000-000000000001', NULL, 1, 'approved'),
  ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'singles', '30000000-0000-0000-0000-000000000002', NULL, 2, 'approved'),
  ('70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', 'singles', '30000000-0000-0000-0000-000000000003', NULL, 3, 'approved'),
  ('70000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000001', 'singles', '30000000-0000-0000-0000-000000000004', NULL, 4, 'approved'),
  ('70000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000001', 'singles', '30000000-0000-0000-0000-000000000005', NULL, NULL, 'approved'),
  ('70000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000001', 'singles', '30000000-0000-0000-0000-000000000006', NULL, NULL, 'approved'),
  ('70000000-0000-0000-0000-000000000007', '60000000-0000-0000-0000-000000000001', 'singles', '30000000-0000-0000-0000-000000000007', NULL, NULL, 'approved'),
  ('70000000-0000-0000-0000-000000000008', '60000000-0000-0000-0000-000000000001', 'singles', '30000000-0000-0000-0000-000000000008', NULL, NULL, 'approved')
ON CONFLICT (id) DO NOTHING;

-- ==================== Entries (Summer Championship - Open Doubles) ====================
INSERT INTO entries (id, division_id, entry_type, player_id, team_id, seed, status) VALUES
  ('70000000-0000-0000-0000-000000000011', '60000000-0000-0000-0000-000000000002', 'doubles', NULL, '40000000-0000-0000-0000-000000000001', 1, 'approved'),
  ('70000000-0000-0000-0000-000000000012', '60000000-0000-0000-0000-000000000002', 'doubles', NULL, '40000000-0000-0000-0000-000000000002', 2, 'approved'),
  ('70000000-0000-0000-0000-000000000013', '60000000-0000-0000-0000-000000000002', 'doubles', NULL, '40000000-0000-0000-0000-000000000003', 3, 'approved'),
  ('70000000-0000-0000-0000-000000000014', '60000000-0000-0000-0000-000000000002', 'doubles', NULL, '40000000-0000-0000-0000-000000000004', 4, 'approved'),
  ('70000000-0000-0000-0000-000000000015', '60000000-0000-0000-0000-000000000002', 'doubles', NULL, '40000000-0000-0000-0000-000000000005', NULL, 'approved'),
  ('70000000-0000-0000-0000-000000000016', '60000000-0000-0000-0000-000000000002', 'doubles', NULL, '40000000-0000-0000-0000-000000000006', NULL, 'approved'),
  ('70000000-0000-0000-0000-000000000017', '60000000-0000-0000-0000-000000000002', 'doubles', NULL, '40000000-0000-0000-0000-000000000007', NULL, 'approved'),
  ('70000000-0000-0000-0000-000000000018', '60000000-0000-0000-0000-000000000002', 'doubles', NULL, '40000000-0000-0000-0000-000000000008', NULL, 'approved')
ON CONFLICT (id) DO NOTHING;

-- ==================== Entries (Autumn Classic - in progress tournament) ====================
INSERT INTO entries (id, division_id, entry_type, player_id, team_id, seed, status) VALUES
  ('70000000-0000-0000-0000-000000000021', '60000000-0000-0000-0000-000000000011', 'singles', '30000000-0000-0000-0000-000000000001', NULL, 1, 'approved'),
  ('70000000-0000-0000-0000-000000000022', '60000000-0000-0000-0000-000000000011', 'singles', '30000000-0000-0000-0000-000000000003', NULL, 2, 'approved'),
  ('70000000-0000-0000-0000-000000000023', '60000000-0000-0000-0000-000000000011', 'singles', '30000000-0000-0000-0000-000000000005', NULL, 3, 'approved'),
  ('70000000-0000-0000-0000-000000000024', '60000000-0000-0000-0000-000000000011', 'singles', '30000000-0000-0000-0000-000000000007', NULL, 4, 'approved')
ON CONFLICT (id) DO NOTHING;

-- ==================== Entries (Winter League - Division 1) ====================
INSERT INTO entries (id, division_id, entry_type, player_id, team_id, seed, status) VALUES
  ('70000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000021', 'singles', '30000000-0000-0000-0000-000000000001', NULL, NULL, 'approved'),
  ('70000000-0000-0000-0000-000000000032', '60000000-0000-0000-0000-000000000021', 'singles', '30000000-0000-0000-0000-000000000002', NULL, NULL, 'approved'),
  ('70000000-0000-0000-0000-000000000033', '60000000-0000-0000-0000-000000000021', 'singles', '30000000-0000-0000-0000-000000000003', NULL, NULL, 'approved'),
  ('70000000-0000-0000-0000-000000000034', '60000000-0000-0000-0000-000000000021', 'singles', '30000000-0000-0000-0000-000000000004', NULL, NULL, 'approved')
ON CONFLICT (id) DO NOTHING;

-- ==================== Entries (Riverside Open - Open Singles) ====================
INSERT INTO entries (id, division_id, entry_type, player_id, team_id, seed, status) VALUES
  ('70000000-0000-0000-0000-000000000101', '60000000-0000-0000-0000-000000000101', 'singles', '30000000-0000-0000-0000-000000000101', NULL, 1, 'approved'),
  ('70000000-0000-0000-0000-000000000102', '60000000-0000-0000-0000-000000000101', 'singles', '30000000-0000-0000-0000-000000000102', NULL, 2, 'approved'),
  ('70000000-0000-0000-0000-000000000103', '60000000-0000-0000-0000-000000000101', 'singles', '30000000-0000-0000-0000-000000000103', NULL, NULL, 'approved'),
  ('70000000-0000-0000-0000-000000000104', '60000000-0000-0000-0000-000000000101', 'singles', '30000000-0000-0000-0000-000000000104', NULL, NULL, 'approved'),
  ('70000000-0000-0000-0000-000000000105', '60000000-0000-0000-0000-000000000101', 'singles', '30000000-0000-0000-0000-000000000105', NULL, NULL, 'pending'),
  ('70000000-0000-0000-0000-000000000106', '60000000-0000-0000-0000-000000000101', 'singles', '30000000-0000-0000-0000-000000000106', NULL, NULL, 'pending')
ON CONFLICT (id) DO NOTHING;

-- ==================== Entries (Riverside Open - Open Doubles) ====================
INSERT INTO entries (id, division_id, entry_type, player_id, team_id, seed, status) VALUES
  ('70000000-0000-0000-0000-000000000111', '60000000-0000-0000-0000-000000000102', 'doubles', NULL, '40000000-0000-0000-0000-000000000101', 1, 'approved'),
  ('70000000-0000-0000-0000-000000000112', '60000000-0000-0000-0000-000000000102', 'doubles', NULL, '40000000-0000-0000-0000-000000000102', 2, 'approved'),
  ('70000000-0000-0000-0000-000000000113', '60000000-0000-0000-0000-000000000102', 'doubles', NULL, '40000000-0000-0000-0000-000000000103', NULL, 'approved'),
  ('70000000-0000-0000-0000-000000000114', '60000000-0000-0000-0000-000000000102', 'doubles', NULL, '40000000-0000-0000-0000-000000000104', NULL, 'approved')
ON CONFLICT (id) DO NOTHING;

-- ==================== Draws (Autumn Classic - Singles bracket) ====================
INSERT INTO draws (id, division_id, draw_type, status, config) VALUES
  ('80000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000011', 'single_elimination', 'active', '{"rounds": 2}')
ON CONFLICT (id) DO NOTHING;

-- ==================== Matches (Autumn Classic - Singles Semi-finals) ====================
INSERT INTO matches (id, draw_id, round_number, match_number, entry1_id, entry2_id, winner_entry_id, score, status, scheduled_time, court) VALUES
  -- Semi-final 1: John Smith vs Michael Chen (completed)
  ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 1, 1, '70000000-0000-0000-0000-000000000021', '70000000-0000-0000-0000-000000000022', '70000000-0000-0000-0000-000000000021', '{"sets": [{"entry1Games": 6, "entry2Games": 4}, {"entry1Games": 6, "entry2Games": 3}]}', 'completed', '2025-10-05 10:00:00+00', 'Court 1'),
  -- Semi-final 2: David Lee vs Ryan Martinez (completed)
  ('90000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', 1, 2, '70000000-0000-0000-0000-000000000023', '70000000-0000-0000-0000-000000000024', '70000000-0000-0000-0000-000000000024', '{"sets": [{"entry1Games": 4, "entry2Games": 6}, {"entry1Games": 3, "entry2Games": 6}]}', 'completed', '2025-10-05 12:00:00+00', 'Court 2'),
  -- Final: John Smith vs Ryan Martinez (in progress)
  ('90000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000001', 2, 1, '70000000-0000-0000-0000-000000000021', '70000000-0000-0000-0000-000000000024', NULL, NULL, 'in_progress', '2025-10-10 14:00:00+00', 'Centre Court')
ON CONFLICT (id) DO NOTHING;

-- ==================== Live Score (for the in-progress final match) ====================
INSERT INTO match_live_scores (id, match_id, current_set, entry1_games, entry2_games, entry1_points, entry2_points, is_tiebreak, serving_entry, status, started_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000003', 2, '[6, 3]', '[4, 2]', 30, 15, false, 1, 'in_progress', '2025-10-10 14:05:00+00')
ON CONFLICT (id) DO NOTHING;

-- ==================== Point History (sample points for the live match) ====================
INSERT INTO match_point_history (id, match_id, sequence_number, set_number, game_number, point_number, winner_entry, score_before, score_after, is_break_point, is_set_point, is_match_point, recorded_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000003', 1, 1, 1, 1, 1, '{"entry1Points": 0, "entry2Points": 0}', '{"entry1Points": 15, "entry2Points": 0}', false, false, false, '2025-10-10 14:06:00+00'),
  ('b0000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000003', 2, 1, 1, 2, 1, '{"entry1Points": 15, "entry2Points": 0}', '{"entry1Points": 30, "entry2Points": 0}', false, false, false, '2025-10-10 14:07:00+00'),
  ('b0000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003', 3, 1, 1, 3, 2, '{"entry1Points": 30, "entry2Points": 0}', '{"entry1Points": 30, "entry2Points": 15}', false, false, false, '2025-10-10 14:08:00+00')
ON CONFLICT (id) DO NOTHING;
