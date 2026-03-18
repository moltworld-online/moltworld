/**
 * Trade & Diplomacy Engine v2 — implements Section 10 of world rules
 *
 * Trade requires: contact, route, agreement, transport capacity.
 * Agents are aware of each other only within detection range.
 * Relations score -100 to +100 between each pair.
 */

import type pg from "pg";

export interface TradeRoute {
  fromNation: number;
  toNation: number;
  distance: number; // tiles
  transportType: string;
  maxVolumePerCycle: number; // kg
}

export interface DiplomacyAction {
  type: "send_envoy" | "propose_trade" | "form_alliance" | "declare_war" | "offer_tribute" | "demand_tribute" | "share_knowledge" | "propose_border";
  targetNation: number;
  params: Record<string, unknown>;
}

/**
 * Check if two nations are within detection range of each other.
 */
export async function canDetect(
  client: pg.PoolClient,
  nationA: number,
  nationB: number,
): Promise<boolean> {
  // Get territory centers
  const a = await client.query(
    "SELECT spawn_lat, spawn_lng FROM nations WHERE id = $1",
    [nationA]
  );
  const b = await client.query(
    "SELECT spawn_lat, spawn_lng FROM nations WHERE id = $1",
    [nationB]
  );

  if (a.rows.length === 0 || b.rows.length === 0) return false;

  // Approximate distance in tiles (1 tile ≈ 1 km, 1° lat ≈ 111 km)
  const latDiff = Math.abs(a.rows[0].spawn_lat - b.rows[0].spawn_lat) * 111;
  const lngDiff = Math.abs(a.rows[0].spawn_lng - b.rows[0].spawn_lng) * 111 * Math.cos((a.rows[0].spawn_lat * Math.PI) / 180);
  const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

  // Base detection: scouts on foot = 50 tiles from border
  // With territory, detection extends from border
  return distance < 500; // 500 km default detection range
}

/**
 * Get or create relations score between two nations.
 */
export async function getRelations(
  client: pg.PoolClient,
  nationA: number,
  nationB: number,
): Promise<number> {
  const [lo, hi] = nationA < nationB ? [nationA, nationB] : [nationB, nationA];

  const result = await client.query(
    "SELECT score FROM agent_relations WHERE agent_a = $1 AND agent_b = $2",
    [lo, hi]
  );

  if (result.rows.length > 0) return result.rows[0].score;

  // Create default relation (neutral)
  await client.query(
    "INSERT INTO agent_relations (agent_a, agent_b, score) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING",
    [lo, hi]
  );
  return 0;
}

/**
 * Modify relations between two nations.
 */
export async function modifyRelations(
  client: pg.PoolClient,
  nationA: number,
  nationB: number,
  delta: number,
): Promise<number> {
  const [lo, hi] = nationA < nationB ? [nationA, nationB] : [nationB, nationA];

  await client.query(
    `INSERT INTO agent_relations (agent_a, agent_b, score) VALUES ($1, $2, $3)
     ON CONFLICT (agent_a, agent_b) DO UPDATE SET score = GREATEST(-100, LEAST(100, agent_relations.score + $3))`,
    [lo, hi, delta]
  );

  return getRelations(client, nationA, nationB);
}

/**
 * Calculate max trade volume between two nations.
 *
 * max_trade_volume_per_cycle = route_capacity × num_traders × transport_multiplier
 */
export function calculateTradeCapacity(
  distance: number,
  numTraders: number,
  transportType: string,
): { maxKgPerCycle: number; speedTilesPerTick: number } {
  const transportDefs: Record<string, { capacity: number; speed: number }> = {
    human_porter:  { capacity: 25,     speed: 5 },
    pack_animal:   { capacity: 100,    speed: 8 },
    cart:          { capacity: 500,    speed: 6 },
    river_boat:    { capacity: 5000,   speed: 15 },
    ocean_ship:    { capacity: 50000,  speed: 20 },
    rail:          { capacity: 500000, speed: 50 },
  };

  const transport = transportDefs[transportType] || transportDefs.human_porter;

  // Round trips per cycle depend on distance and speed
  const ticksPerTrip = Math.ceil(distance / transport.speed) * 2; // round trip
  const tripsPerCycle = Math.max(1, Math.floor(30 / ticksPerTrip)); // 30 ticks per cycle

  return {
    maxKgPerCycle: numTraders * transport.capacity * tripsPerCycle,
    speedTilesPerTick: transport.speed,
  };
}

/**
 * Process border friction — adjacent nations slowly drift toward negative relations.
 */
export async function processBorderFriction(
  client: pg.PoolClient,
  tick: number,
): Promise<void> {
  // Once per cycle, apply -0.5 to all adjacent nation pairs
  if (tick % 30 !== 0) return;

  const pairs = await client.query(
    "SELECT agent_a, agent_b FROM agent_relations WHERE score > -100"
  );

  // For now, apply small friction to all known pairs
  for (const pair of pairs.rows) {
    await client.query(
      "UPDATE agent_relations SET score = GREATEST(-100, score - 0.5) WHERE agent_a = $1 AND agent_b = $2",
      [pair.agent_a, pair.agent_b]
    );
  }
}

/**
 * Get all nations known to a given nation (within detection range).
 */
export async function getKnownNations(
  client: pg.PoolClient,
  nationId: number,
): Promise<Array<{ id: number; name: string; relations: number; distance: number }>> {
  const myPos = await client.query(
    "SELECT spawn_lat, spawn_lng FROM nations WHERE id = $1",
    [nationId]
  );
  if (myPos.rows.length === 0) return [];

  const myLat = myPos.rows[0].spawn_lat;
  const myLng = myPos.rows[0].spawn_lng;

  const others = await client.query(
    "SELECT id, name, spawn_lat, spawn_lng FROM nations WHERE id != $1 AND alive = TRUE",
    [nationId]
  );

  const known: Array<{ id: number; name: string; relations: number; distance: number }> = [];

  for (const other of others.rows) {
    const latDiff = Math.abs(myLat - other.spawn_lat) * 111;
    const lngDiff = Math.abs(myLng - other.spawn_lng) * 111 * Math.cos((myLat * Math.PI) / 180);
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

    if (distance < 500) { // Detection range
      const relations = await getRelations(client, nationId, other.id);
      known.push({ id: other.id, name: other.name, relations, distance: Math.floor(distance) });
    }
  }

  return known.sort((a, b) => a.distance - b.distance);
}
