-- D1 schema for Repo Recommender.
-- Apply: wrangler d1 execute reporecommender --remote --file=schema.sql
--        wrangler d1 execute reporecommender --local  --file=schema.sql  (for dev)

-- Contact form submissions.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  asn INTEGER,
  as_org TEXT,
  country TEXT,
  city TEXT,
  region TEXT
);

-- Tool-usage events: one row each time someone runs the recommender.
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  input TEXT NOT NULL,
  goal TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  browser TEXT,
  os TEXT,
  asn INTEGER,
  as_org TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  timezone TEXT,
  colo TEXT
);

CREATE INDEX IF NOT EXISTS idx_usage_created ON usage(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- Anonymous interaction events (e.g. clicking a recommended repo). visitor_id is
-- a random id kept in the browser, so a visitor is tracked with no email or PII.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  visitor_id TEXT,
  type TEXT NOT NULL,
  repo TEXT,
  input TEXT,
  goal TEXT,
  ip TEXT, user_agent TEXT, browser TEXT, os TEXT,
  asn INTEGER, as_org TEXT, country TEXT, city TEXT, region TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);

-- Chat-with-a-repo. One session per (visitor, repo) chat; messages hang off it.
-- The session id is unguessable and is the access key for the /c/<id> transcript.
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  visitor_id TEXT,
  repo TEXT NOT NULL,
  input TEXT, goal TEXT,
  ip TEXT, user_agent TEXT, browser TEXT, os TEXT,
  asn INTEGER, as_org TEXT, country TEXT, city TEXT, region TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created ON chat_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_visitor ON chat_sessions(visitor_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
