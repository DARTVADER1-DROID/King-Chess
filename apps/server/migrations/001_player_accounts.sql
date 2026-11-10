CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  username VARCHAR(20) NOT NULL,
  display_name VARCHAR(40) NOT NULL,
  avatar_url TEXT,
  password_hash TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1200 CHECK (rating >= 0),
  games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  games_won INTEGER NOT NULL DEFAULT 0 CHECK (games_won >= 0),
  games_drawn INTEGER NOT NULL DEFAULT 0 CHECK (games_drawn >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT players_games_consistent CHECK (games_won + games_drawn <= games_played)
);

CREATE UNIQUE INDEX IF NOT EXISTS players_email_lower_uq ON players (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS players_username_lower_uq ON players (LOWER(username));

CREATE TABLE IF NOT EXISTS player_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_sessions_player_id_idx ON player_sessions(player_id);
CREATE INDEX IF NOT EXISTS player_sessions_expires_at_idx ON player_sessions(expires_at);
