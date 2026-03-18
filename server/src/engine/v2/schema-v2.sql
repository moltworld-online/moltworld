-- MoltWorld v2 Schema — implements moltworld_world_rules.md
-- Run against existing moltworld database

-- ── World State ──
CREATE TABLE IF NOT EXISTS world_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  tick INTEGER NOT NULL DEFAULT 0,
  year INTEGER NOT NULL DEFAULT 0,
  cycle INTEGER NOT NULL DEFAULT 0,
  season TEXT NOT NULL DEFAULT 'spring',
  carbon_index DOUBLE PRECISION NOT NULL DEFAULT 0,
  global_forest_pct DOUBLE PRECISION NOT NULL DEFAULT 0.29, -- ~29% of Earth is land, most starts forested
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (id = 1) -- singleton row
);
INSERT INTO world_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── Agents (replaces nations) ──
ALTER TABLE nations ADD COLUMN IF NOT EXISTS epoch INTEGER DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS total_kp DOUBLE PRECISION DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS social_cohesion DOUBLE PRECISION DEFAULT 50;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS governance_type TEXT DEFAULT 'band';
ALTER TABLE nations ADD COLUMN IF NOT EXISTS admin_overhead DOUBLE PRECISION DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS territory_tiles INTEGER DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS overextension_ratio DOUBLE PRECISION DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS communication_tech TEXT DEFAULT 'runners';
ALTER TABLE nations ADD COLUMN IF NOT EXISTS food_kcal DOUBLE PRECISION DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS water_liters DOUBLE PRECISION DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS wood INTEGER DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS stone INTEGER DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS clay INTEGER DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS fiber INTEGER DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS animal_products INTEGER DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS copper_ore INTEGER DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS tin_ore INTEGER DEFAULT 0;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS iron_ore INTEGER DEFAULT 0;

-- ── Individual Humans (replacing aggregate pop columns) ──
CREATE TABLE IF NOT EXISTS humans (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id) ON DELETE CASCADE,
  age_ticks INTEGER NOT NULL DEFAULT 0,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  health DOUBLE PRECISION NOT NULL DEFAULT 1.0,  -- 0.0 = dead, 1.0 = perfect
  pregnant_ticks_remaining INTEGER DEFAULT NULL,  -- NULL = not pregnant
  -- Skills (0.0 to 2.0)
  skill_foraging DOUBLE PRECISION DEFAULT 0,
  skill_farming DOUBLE PRECISION DEFAULT 0,
  skill_hunting DOUBLE PRECISION DEFAULT 0,
  skill_building DOUBLE PRECISION DEFAULT 0,
  skill_toolmaking DOUBLE PRECISION DEFAULT 0,
  skill_cooking DOUBLE PRECISION DEFAULT 0,
  skill_medicine DOUBLE PRECISION DEFAULT 0,
  skill_teaching DOUBLE PRECISION DEFAULT 0,
  skill_leadership DOUBLE PRECISION DEFAULT 0,
  skill_combat DOUBLE PRECISION DEFAULT 0,
  skill_crafting DOUBLE PRECISION DEFAULT 0,
  skill_mining DOUBLE PRECISION DEFAULT 0,
  skill_research DOUBLE PRECISION DEFAULT 0,
  -- Current assignment
  task TEXT DEFAULT 'idle',
  -- Location (tile coordinates)
  tile_x INTEGER DEFAULT 0,
  tile_y INTEGER DEFAULT 0,
  alive BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_humans_nation ON humans(nation_id) WHERE alive = TRUE;
CREATE INDEX IF NOT EXISTS idx_humans_task ON humans(nation_id, task) WHERE alive = TRUE;

-- ── Technologies Discovered ──
CREATE TABLE IF NOT EXISTS technologies (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id) ON DELETE CASCADE,
  tech_id TEXT NOT NULL,
  kp_invested DOUBLE PRECISION NOT NULL DEFAULT 0,
  discovered BOOLEAN NOT NULL DEFAULT FALSE,
  discovered_tick INTEGER,
  UNIQUE(nation_id, tech_id)
);

-- ── Structures ──
CREATE TABLE IF NOT EXISTS structures (
  id SERIAL PRIMARY KEY,
  nation_id INTEGER NOT NULL REFERENCES nations(id) ON DELETE CASCADE,
  structure_type TEXT NOT NULL,
  tile_x INTEGER NOT NULL,
  tile_y INTEGER NOT NULL,
  integrity DOUBLE PRECISION NOT NULL DEFAULT 1.0,  -- 0.0 = destroyed, 1.0 = perfect
  labor_invested DOUBLE PRECISION NOT NULL DEFAULT 0,
  labor_required DOUBLE PRECISION NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  built_tick INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tile Ecosystem Health ──
CREATE TABLE IF NOT EXISTS tile_ecosystem (
  tile_x INTEGER NOT NULL,
  tile_y INTEGER NOT NULL,
  ecosystem_health DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  biome TEXT NOT NULL DEFAULT 'temperate_forest',
  PRIMARY KEY (tile_x, tile_y)
);

-- ── Diseases ──
CREATE TABLE IF NOT EXISTS active_diseases (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  origin_nation_id INTEGER REFERENCES nations(id),
  virulence DOUBLE PRECISION NOT NULL,   -- kill rate per cycle
  contagion DOUBLE PRECISION NOT NULL,   -- transmission rate per contact per tick
  duration_ticks INTEGER NOT NULL,       -- recovery time
  incubation_ticks INTEGER NOT NULL,     -- contagious before symptoms
  immunity_chance DOUBLE PRECISION NOT NULL, -- 0-1 lasting immunity after recovery
  emerged_tick INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── Disease Infections (per nation) ──
CREATE TABLE IF NOT EXISTS infections (
  id SERIAL PRIMARY KEY,
  disease_id INTEGER NOT NULL REFERENCES active_diseases(id),
  nation_id INTEGER NOT NULL REFERENCES nations(id),
  infected_count INTEGER NOT NULL DEFAULT 0,
  recovered_count INTEGER NOT NULL DEFAULT 0,
  dead_count INTEGER NOT NULL DEFAULT 0,
  tick_started INTEGER NOT NULL,
  UNIQUE(disease_id, nation_id)
);

-- ── Agent Relations ──
CREATE TABLE IF NOT EXISTS agent_relations (
  agent_a INTEGER NOT NULL REFERENCES nations(id),
  agent_b INTEGER NOT NULL REFERENCES nations(id),
  score DOUBLE PRECISION NOT NULL DEFAULT 0, -- -100 to +100
  PRIMARY KEY (agent_a, agent_b),
  CHECK (agent_a < agent_b) -- canonical ordering
);
