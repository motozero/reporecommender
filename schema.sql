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
