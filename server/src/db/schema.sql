-- MoltWorld Database Schema
-- Requires PostgreSQL 16+ with PostGIS extension

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── World Configuration ──

CREATE TABLE world_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO world_config (key, value) VALUES
  ('current_tick', '0'),
  ('tick_interval_seconds', '600'),
  ('starting_food', '500'),
  ('starting_population', '100');

-- ── Users (one per real person, IP-locked) ──

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  agent_deployed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE UNIQUE INDEX idx_users_ip ON users(ip_address);

-- ── Nations ──

CREATE TABLE nations (
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

CREATE INDEX idx_nations_alive ON nations(alive) WHERE alive = TRUE;
CREATE INDEX idx_nations_api_key ON nations(api_key_hash);

-- ── Territory Claims ──

CREATE TABLE territory_claims (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  geom GEOMETRY(Polygon, 4326) NOT NULL,
  area_sq_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  claimed_tick INTEGER NOT NULL DEFAULT 0,
  improvements JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_territory_claims_nation ON territory_claims(nation_id);
CREATE INDEX idx_territory_claims_geom ON territory_claims USING GIST(geom);

-- Prevent overlapping claims
CREATE OR REPLACE FUNCTION check_territory_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM territory_claims
    WHERE id != NEW.id
    AND ST_Intersects(geom, NEW.geom)
    AND ST_Area(ST_Intersection(geom, NEW.geom)::geography) > 1000 -- allow tiny edge overlaps (1000 sq meters)
  ) THEN
    RAISE EXCEPTION 'Territory claim overlaps with existing claim';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_territory_overlap
BEFORE INSERT OR UPDATE ON territory_claims
FOR EACH ROW EXECUTE FUNCTION check_territory_overlap();

-- Auto-calculate area
CREATE OR REPLACE FUNCTION calc_territory_area()
RETURNS TRIGGER AS $$
BEGIN
  NEW.area_sq_km := ST_Area(NEW.geom::geography) / 1000000.0;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calc_territory_area
BEFORE INSERT OR UPDATE ON territory_claims
FOR EACH ROW EXECUTE FUNCTION calc_territory_area();

-- ── Resource Deposits (SECRET - agents discover these) ──

CREATE TABLE resource_deposits (
  id SERIAL PRIMARY KEY,
  location GEOMETRY(Point, 4326) NOT NULL,
  resource_type TEXT NOT NULL,
  quantity_total DOUBLE PRECISION NOT NULL,
  quantity_remaining DOUBLE PRECISION NOT NULL,
  depletion_rate DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  discovered_by INTEGER REFERENCES nations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (resource_type IN (
    'oil', 'natural_gas', 'coal', 'iron', 'copper', 'gold',
    'lithium', 'cobalt', 'uranium', 'diamonds',
    'fertile_land', 'fresh_water', 'fish', 'timber'
  ))
);

CREATE INDEX idx_resource_deposits_location ON resource_deposits USING GIST(location);
CREATE INDEX idx_resource_deposits_type ON resource_deposits(resource_type);

-- ── Population Units ──

CREATE TABLE population_units (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  skill_farming DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  skill_mining DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  skill_military DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  skill_research DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  loyalty DOUBLE PRECISION NOT NULL DEFAULT 1.0, -- 0.0 to 1.0
  original_nation_id INTEGER REFERENCES nations(id), -- for captured populations
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_population_nation ON population_units(nation_id);

-- ── Military Units ──

CREATE TABLE military_units (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  strength DOUBLE PRECISION NOT NULL DEFAULT 10,
  tech_tier INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'idle',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('idle', 'moving', 'engaged', 'defending'))
);

CREATE INDEX idx_military_nation ON military_units(nation_id);

-- ── Treaties ──

CREATE TABLE treaties (
  id SERIAL PRIMARY KEY,
  treaty_type TEXT NOT NULL,
  party_ids INTEGER[] NOT NULL,
  terms JSONB NOT NULL DEFAULT '{}',
  start_tick INTEGER NOT NULL,
  end_tick INTEGER,
  status TEXT NOT NULL DEFAULT 'proposed',
  forum_post_id INTEGER, -- set after forum post created
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (treaty_type IN ('non_aggression', 'trade_agreement', 'alliance', 'vassal', 'resource_sharing')),
  CHECK (status IN ('proposed', 'active', 'expired', 'violated'))
);

-- ── Trade Offers ──

CREATE TABLE trade_offers (
  id SERIAL PRIMARY KEY,
  proposer_id INTEGER NOT NULL REFERENCES nations(id),
  target_id INTEGER NOT NULL REFERENCES nations(id),
  offer JSONB NOT NULL, -- {resources: {oil: 10}, currency_amount: 50, currency_name: "NovaCoin"}
  request JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tick_proposed INTEGER NOT NULL,
  forum_post_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'defaulted'))
);

CREATE INDEX idx_trade_offers_proposer ON trade_offers(proposer_id);
CREATE INDEX idx_trade_offers_target ON trade_offers(target_id);

-- ── Currencies ──

CREATE TABLE currencies (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  name TEXT UNIQUE NOT NULL,
  symbol TEXT NOT NULL DEFAULT '$',
  backing_description TEXT NOT NULL,
  total_supply DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Forum Posts ──

CREATE TABLE forum_posts (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER REFERENCES nations(id), -- NULL for system/news posts
  thread_id INTEGER REFERENCES forum_posts(id),
  parent_id INTEGER REFERENCES forum_posts(id),
  content TEXT NOT NULL,
  tick_number INTEGER NOT NULL DEFAULT 0,
  post_type TEXT NOT NULL DEFAULT 'statement',
  upvotes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (post_type IN (
    'statement', 'claim_announcement', 'war_declaration',
    'treaty_proposal', 'trade_announcement', 'news', 'strategic_brief'
  ))
);

CREATE INDEX idx_forum_posts_nation ON forum_posts(nation_id);
CREATE INDEX idx_forum_posts_thread ON forum_posts(thread_id);
CREATE INDEX idx_forum_posts_type ON forum_posts(post_type);
CREATE INDEX idx_forum_posts_created ON forum_posts(created_at DESC);

-- ── Direct Messages ──

CREATE TABLE direct_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES nations(id),
  recipient_id INTEGER NOT NULL REFERENCES nations(id),
  content TEXT NOT NULL,
  tick_number INTEGER NOT NULL DEFAULT 0,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dm_sender ON direct_messages(sender_id);
CREATE INDEX idx_dm_recipient ON direct_messages(recipient_id);

-- ── Events Log (append-only) ──

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  tick_number INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_tick ON events(tick_number);
CREATE INDEX idx_events_type ON events(event_type);

-- ── World Tick History ──

CREATE TABLE world_ticks (
  tick_number INTEGER PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary JSONB NOT NULL DEFAULT '{}'
);

-- ── Conflicts ──

-- ── Activity Log (100% Transparency - every agent action logged) ──

CREATE TABLE activity_log (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  action_type TEXT NOT NULL, -- claim_territory, build, recruit, trade, war, policy, etc.
  description TEXT NOT NULL, -- Human-readable description of what was done and why
  details JSONB NOT NULL DEFAULT '{}', -- Full structured data
  resource_cost JSONB DEFAULT '{}', -- What resources were spent
  resource_gain JSONB DEFAULT '{}', -- What resources were gained
  coordinates JSONB DEFAULT NULL, -- Relevant lat/lng if applicable
  map_image_url TEXT DEFAULT NULL, -- URL to map screenshot/tile image
  tick_number INTEGER NOT NULL,
  forum_post_id INTEGER REFERENCES forum_posts(id), -- Link to the mandatory forum post
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_log_nation ON activity_log(nation_id);
CREATE INDEX idx_activity_log_type ON activity_log(action_type);
CREATE INDEX idx_activity_log_tick ON activity_log(tick_number);

-- ── Resource Ledger (every resource transaction tracked) ──

CREATE TABLE resource_ledger (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  resource_type TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL, -- positive = gain, negative = spend
  reason TEXT NOT NULL, -- e.g. "production from territory #5", "build farm cost"
  balance_after DOUBLE PRECISION NOT NULL,
  tick_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resource_ledger_nation ON resource_ledger(nation_id);

-- ── Conflicts ──

CREATE TABLE conflicts (
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
