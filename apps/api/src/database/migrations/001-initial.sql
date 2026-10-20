CREATE TABLE members (
  id uuid PRIMARY KEY,
  discord_id text UNIQUE NOT NULL,
  nickname text NOT NULL,
  punchline text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  birth_year integer,
  birth_month integer,
  birth_day integer,
  unit text NOT NULL DEFAULT 'km' CHECK (unit IN ('km', 'mi')),
  custom_answers jsonb NOT NULL DEFAULT '{}',
  schema_id text NOT NULL,
  profile_complete boolean NOT NULL DEFAULT false,
  next_post_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES members ON DELETE CASCADE,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE locations (
  member_id uuid NOT NULL REFERENCES members ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('checkin', 'home', 'work')),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_km double precision NOT NULL CHECK (radius_km >= 1),
  comment text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, kind)
);
CREATE TABLE media (
  id uuid PRIMARY KEY,
  owner_id uuid REFERENCES members ON DELETE SET NULL,
  purpose text NOT NULL CHECK (purpose IN ('avatar', 'post')),
  content_type text NOT NULL,
  contents bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE members ADD COLUMN avatar_id uuid REFERENCES media ON DELETE SET NULL;
CREATE TABLE posts (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES members ON DELETE SET NULL,
  body text NOT NULL,
  media_id uuid UNIQUE REFERENCES media ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_order ON posts(created_at DESC, id DESC);
CREATE INDEX media_owner ON media(owner_id);
CREATE INDEX posts_author ON posts(author_id);
CREATE TABLE oauth_states (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
