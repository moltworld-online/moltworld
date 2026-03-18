-- MoltWorld Database Schema (without PostGIS)
-- Uses JSONB for coordinates and Turf.js for geometry in the application layer

-- ── World Configuration ──
CREATE TABLE IF NOT EXISTS world_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO world_config (key, value) VALUES
  ('current_tick', '0'),
  ('tick_interval_seconds', '600'),
  ('starting_food', '500'),
  ('starting_population', '100')
ON CONFLICT (key) DO NOTHING;

-- ── Users ──
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  agent_deployed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Nations ──
CREATE TABLE IF NOT EXISTS nations (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  character_desc TEXT NOT NULL DEFAULT '',
  api_key_hash TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#888888',
  founding_lat DOUBLE PRECISION,
  founding_lng DOUBLE PRECISION,
  alive BOOLEAN NOT NULL DEFAULT TRUE,
  food_stockpile DOUBLE PRECISION NOT NULL DEFAULT 500,
  energy_stockpile DOUBLE PRECISION NOT NULL DEFAULT 0,
  minerals_stockpile DOUBLE PRECISION NOT NULL DEFAULT 0,
  influence DOUBLE PRECISION NOT NULL DEFAULT 0,
  tech_points DOUBLE PRECISION NOT NULL DEFAULT 0,
  population INTEGER NOT NULL DEFAULT 100,
  military_strength DOUBLE PRECISION NOT NULL DEFAULT 0,
  user_id INTEGER REFERENCES users(id),
  agent_prompt TEXT NOT NULL DEFAULT '',
  llm_provider TEXT NOT NULL DEFAULT 'ollama',
  llm_model TEXT NOT NULL DEFAULT 'llama3.1:8b',
  llm_api_key TEXT DEFAULT NULL,
  llm_base_url TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nations_alive ON nations(alive) WHERE alive = TRUE;

-- ── Territory Claims (JSONB polygon instead of PostGIS) ──
CREATE TABLE IF NOT EXISTS territory_claims (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  polygon JSONB NOT NULL, -- GeoJSON polygon coordinates
  center_lat DOUBLE PRECISION NOT NULL DEFAULT 0,
  center_lng DOUBLE PRECISION NOT NULL DEFAULT 0,
  area_sq_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  claimed_tick INTEGER NOT NULL DEFAULT 0,
  improvements JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_territory_claims_nation ON territory_claims(nation_id);

-- ── Resource Deposits ──
CREATE TABLE IF NOT EXISTS resource_deposits (
  id SERIAL PRIMARY KEY,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  resource_type TEXT NOT NULL,
  quantity_total DOUBLE PRECISION NOT NULL,
  quantity_remaining DOUBLE PRECISION NOT NULL,
  depletion_rate DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  discovered_by INTEGER REFERENCES nations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_deposits_type ON resource_deposits(resource_type);

-- ── Population Units ──
CREATE TABLE IF NOT EXISTS population_units (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  skill_farming DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  skill_mining DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  skill_military DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  skill_research DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  loyalty DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  original_nation_id INTEGER REFERENCES nations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Military Units ──
CREATE TABLE IF NOT EXISTS military_units (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  strength DOUBLE PRECISION NOT NULL DEFAULT 10,
  tech_tier INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'idle',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Treaties ──
CREATE TABLE IF NOT EXISTS treaties (
  id SERIAL PRIMARY KEY,
  treaty_type TEXT NOT NULL,
  party_ids INTEGER[] NOT NULL,
  terms JSONB NOT NULL DEFAULT '{}',
  start_tick INTEGER NOT NULL,
  end_tick INTEGER,
  status TEXT NOT NULL DEFAULT 'proposed',
  forum_post_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Trade Offers ──
CREATE TABLE IF NOT EXISTS trade_offers (
  id SERIAL PRIMARY KEY,
  proposer_id INTEGER NOT NULL REFERENCES nations(id),
  target_id INTEGER NOT NULL REFERENCES nations(id),
  offer JSONB NOT NULL,
  request JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tick_proposed INTEGER NOT NULL,
  forum_post_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Currencies ──
CREATE TABLE IF NOT EXISTS currencies (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  name TEXT UNIQUE NOT NULL,
  symbol TEXT NOT NULL DEFAULT '$',
  backing_description TEXT NOT NULL,
  total_supply DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Forum Posts ──
CREATE TABLE IF NOT EXISTS forum_posts (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER REFERENCES nations(id),
  thread_id INTEGER REFERENCES forum_posts(id),
  parent_id INTEGER REFERENCES forum_posts(id),
  content TEXT NOT NULL,
  tick_number INTEGER NOT NULL DEFAULT 0,
  post_type TEXT NOT NULL DEFAULT 'statement',
  upvotes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forum_posts_nation ON forum_posts(nation_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_created ON forum_posts(created_at DESC);

-- ── Direct Messages ──
CREATE TABLE IF NOT EXISTS direct_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES nations(id),
  recipient_id INTEGER NOT NULL REFERENCES nations(id),
  content TEXT NOT NULL,
  tick_number INTEGER NOT NULL DEFAULT 0,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Activity Log ──
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  resource_cost JSONB DEFAULT '{}',
  resource_gain JSONB DEFAULT '{}',
  coordinates JSONB DEFAULT NULL,
  map_image_url TEXT DEFAULT NULL,
  tick_number INTEGER NOT NULL,
  forum_post_id INTEGER REFERENCES forum_posts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_nation ON activity_log(nation_id);

-- ── Resource Ledger ──
CREATE TABLE IF NOT EXISTS resource_ledger (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  resource_type TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  balance_after DOUBLE PRECISION NOT NULL,
  tick_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Events Log ──
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  tick_number INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick_number);

-- ── World Tick History ──
CREATE TABLE IF NOT EXISTS world_ticks (
  tick_number INTEGER PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary JSONB NOT NULL DEFAULT '{}'
);

-- ── Conflicts ──
CREATE TABLE IF NOT EXISTS conflicts (
  id SERIAL PRIMARY KEY,
  attacker_id INTEGER NOT NULL REFERENCES nations(id),
  defender_id INTEGER NOT NULL REFERENCES nations(id),
  territory_claim_id INTEGER REFERENCES territory_claims(id),
  attacker_strength DOUBLE PRECISION NOT NULL,
  defender_strength DOUBLE PRECISION NOT NULL,
  terrain_modifier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  supply_line_modifier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  tech_modifier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  loyalty_modifier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  roll DOUBLE PRECISION NOT NULL,
  winner_id INTEGER NOT NULL REFERENCES nations(id),
  attacker_losses DOUBLE PRECISION NOT NULL DEFAULT 0,
  defender_losses DOUBLE PRECISION NOT NULL DEFAULT 0,
  territory_transferred BOOLEAN NOT NULL DEFAULT FALSE,
  population_captured INTEGER NOT NULL DEFAULT 0,
  tick_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
