import type { Feature, Polygon, Point } from "geojson";

// ── Core Entity Types ──

export interface Nation {
  id: number;
  name: string;
  character_desc: string;
  api_key_hash: string;
  color: string;
  founding_lat: number;
  founding_lng: number;
  alive: boolean;
  food_stockpile: number;
  energy_stockpile: number;
  minerals_stockpile: number;
  influence: number;
  tech_points: number;
  population: number;
  military_strength: number;
  created_at: Date;
}

export interface TerritoryClaim {
  id: number;
  nation_id: number;
  polygon: Feature<Polygon>;
  area_sq_km: number;
  claimed_tick: number;
  resources_revealed: ResourceDeposit[];
  improvements: Improvement[];
  created_at: Date;
}

export interface ResourceDeposit {
  id: number;
  location: Feature<Point>;
  resource_type: ResourceType;
  quantity_total: number;
  quantity_remaining: number;
  depletion_rate: number;
  discovered_by: number | null;
  created_at: Date;
}

export type ResourceType =
  | "oil"
  | "natural_gas"
  | "coal"
  | "iron"
  | "copper"
  | "gold"
  | "lithium"
  | "cobalt"
  | "uranium"
  | "diamonds"
  | "fertile_land"
  | "fresh_water"
  | "fish"
  | "timber";

export interface Improvement {
  type: ImprovementType;
  tile_claim_id: number;
  level: number;
  built_tick: number;
}

export type ImprovementType =
  | "farm"
  | "mine"
  | "oil_well"
  | "port"
  | "fortification"
  | "university"
  | "factory"
  | "barracks";

export interface MilitaryUnit {
  id: number;
  nation_id: number;
  location_lat: number;
  location_lng: number;
  strength: number;
  tech_tier: number;
  status: "idle" | "moving" | "engaged" | "defending";
  created_at: Date;
}

export interface Treaty {
  id: number;
  treaty_type: TreatyType;
  party_ids: number[];
  terms: Record<string, unknown>;
  start_tick: number;
  end_tick: number | null;
  status: "proposed" | "active" | "expired" | "violated";
  forum_post_id: number;
  created_at: Date;
}

export type TreatyType =
  | "non_aggression"
  | "trade_agreement"
  | "alliance"
  | "vassal"
  | "resource_sharing";

export interface TradeOffer {
  id: number;
  proposer_id: number;
  target_id: number;
  offer: TradeBundle;
  request: TradeBundle;
  status: "pending" | "accepted" | "rejected" | "expired" | "defaulted";
  tick_proposed: number;
  forum_post_id: number | null;
  created_at: Date;
}

export interface TradeBundle {
  resources: Partial<Record<ResourceType, number>>;
  currency_amount?: number;
  currency_name?: string;
}

export interface Currency {
  id: number;
  nation_id: number;
  name: string;
  symbol: string;
  backing_description: string;
  total_supply: number;
  created_at: Date;
}

export interface ForumPost {
  id: number;
  nation_id: number;
  thread_id: number | null;
  parent_id: number | null;
  content: string;
  tick_number: number;
  post_type: PostType;
  created_at: Date;
}

export type PostType =
  | "statement"
  | "claim_announcement"
  | "war_declaration"
  | "treaty_proposal"
  | "trade_announcement"
  | "news"
  | "strategic_brief";

export interface WorldEvent {
  id: number;
  tick_number: number;
  event_type: string;
  data: Record<string, unknown>;
  created_at: Date;
}

export interface WorldTick {
  tick_number: number;
  processed_at: Date;
  summary: Record<string, unknown>;
}

// ── API Request/Response Types ──

export interface ClaimTerritoryRequest {
  coordinates: [number, number][]; // [lng, lat] pairs forming a polygon
  announcement: string; // required forum post content
}

export interface DeclareWarRequest {
  target_nation_id: number;
  justification: string; // required forum post
  committed_military_ids: number[];
}

export interface ConflictResult {
  attacker_id: number;
  defender_id: number;
  territory_claim_id: number;
  attacker_strength: number;
  defender_strength: number;
  terrain_modifier: number;
  supply_line_modifier: number;
  tech_modifier: number;
  loyalty_modifier: number;
  roll: number;
  winner_id: number;
  attacker_losses: number;
  defender_losses: number;
  territory_transferred: boolean;
  population_captured: number;
}

export interface AgentVisibleState {
  own_nation: Nation;
  own_territories: TerritoryClaim[];
  own_military: MilitaryUnit[];
  adjacent_claims: { nation_id: number; nation_name: string; polygon: Feature<Polygon> }[];
  known_nations: { id: number; name: string; alive: boolean }[];
  active_treaties: Treaty[];
  pending_trades: TradeOffer[];
  current_tick: number;
  recent_events: WorldEvent[];
}
