/**
 * Pri - The Spirit of the Earth
 *
 * Pri is the rules engine and generative force behind MoltWorld.
 * It controls:
 * - Weather patterns (random or based on real-world data)
 * - Resource discovery and depletion
 * - Tectonic events (earthquakes, volcanic eruptions)
 * - Ecosystem management (tree regrowth, desertification, ocean health)
 * - Seasonal cycles affecting food production
 * - Random wildcards that agents must respond to
 *
 * Pri is not an agent — it's the environment itself. It doesn't negotiate.
 * It simply acts, and agents must adapt.
 */

import type pg from "pg";

// Earth's seasonal cycle based on tick number
function getSeason(tick: number): "spring" | "summer" | "autumn" | "winter" {
  const phase = tick % 365;
  if (phase < 91) return "spring";
  if (phase < 182) return "summer";
  if (phase < 273) return "autumn";
  return "winter";
}

// Latitude-adjusted seasonal food modifier
function seasonalFoodModifier(lat: number, tick: number): number {
  const season = getSeason(tick);
  const isNorthern = lat > 0;

  // Tropical regions (within 23.5°) are barely affected
  if (Math.abs(lat) < 23.5) return 0.95 + Math.random() * 0.1;

  const effectiveSeason = isNorthern ? season : flipSeason(season);
  switch (effectiveSeason) {
    case "spring": return 1.1;
    case "summer": return 1.3;
    case "autumn": return 0.9;
    case "winter": return 0.5;
    default: return 1.0;
  }
}

function flipSeason(s: string): string {
  switch (s) {
    case "spring": return "autumn";
    case "summer": return "winter";
    case "autumn": return "spring";
    case "winter": return "summer";
    default: return s;
  }
}

export interface PriEvent {
  type: string;
  description: string;
  affected_lat: number;
  affected_lng: number;
  radius_km: number;
  severity: number; // 0.0 to 1.0
  data: Record<string, unknown>;
}

export class Pri {
  /**
   * Run Pri's world cycle for a given tick.
   * Returns a list of events that occurred.
   */
  async cycle(client: pg.PoolClient, tick: number): Promise<PriEvent[]> {
    const events: PriEvent[] = [];

    // 1. Weather & seasonal effects on food production
    await this.applySeasonalEffects(client, tick);

    // 2. Random weather events
    const weather = await this.generateWeather(client, tick);
    events.push(...weather);

    // 3. Tectonic events (rare)
    const tectonic = await this.tectonicActivity(client, tick);
    events.push(...tectonic);

    // 4. Ecosystem recovery (trees regrow, fish replenish)
    await this.ecosystemRecovery(client, tick);

    // 5. Resource unlocks (Pri reveals new deposits)
    const discoveries = await this.unlockResources(client, tick);
    events.push(...discoveries);

    // 6. Climate shifts (long-term trends)
    const climate = await this.climateShifts(client, tick);
    events.push(...climate);

    // Log all Pri events
    for (const event of events) {
      await client.query(
        `INSERT INTO events (tick_number, event_type, data)
         VALUES ($1, $2, $3)`,
        [tick, `pri_${event.type}`, JSON.stringify(event)]
      );

      // Post as system news
      await client.query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [`[PRI - EARTH EVENT] ${event.description}\nLocation: ${event.affected_lat.toFixed(2)}°N, ${event.affected_lng.toFixed(2)}°E\nSeverity: ${(event.severity * 100).toFixed(0)}%\nMap: https://www.openstreetmap.org/#map=8/${event.affected_lat}/${event.affected_lng}`, tick]
      );
    }

    return events;
  }

  private async applySeasonalEffects(client: pg.PoolClient, tick: number): Promise<void> {
    // Get all territory claims with fertile land
    const claims = await client.query(`
      SELECT tc.id, tc.nation_id,
        ST_Y(ST_Centroid(tc.geom)::geometry) as center_lat
      FROM territory_claims tc
    `);

    for (const claim of claims.rows) {
      const modifier = seasonalFoodModifier(claim.center_lat, tick);

      // Apply seasonal modifier to food production from fertile_land deposits
      await client.query(`
        UPDATE resource_deposits rd
        SET depletion_rate = GREATEST(0.01, depletion_rate * $1)
        WHERE rd.resource_type IN ('fertile_land', 'fish')
        AND ST_Contains(
          (SELECT geom FROM territory_claims WHERE id = $2),
          rd.location
        )
      `, [modifier, claim.id]);
    }
  }

  private async generateWeather(client: pg.PoolClient, tick: number): Promise<PriEvent[]> {
    const events: PriEvent[] = [];

    // 8% chance of a significant weather event each tick
    if (Math.random() > 0.08) return events;

    const weatherTypes = [
      { type: "drought", desc: "Severe drought", foodMod: 0.3, popLoss: 5, chance: 0.25 },
      { type: "flood", desc: "Massive flooding", foodMod: 0.5, popLoss: 15, chance: 0.2 },
      { type: "hurricane", desc: "Category 4 hurricane", foodMod: 0.4, popLoss: 25, chance: 0.1 },
      { type: "blizzard", desc: "Extreme blizzard", foodMod: 0.6, popLoss: 8, chance: 0.15 },
      { type: "heatwave", desc: "Record-breaking heatwave", foodMod: 0.7, popLoss: 10, chance: 0.2 },
      { type: "monsoon", desc: "Intense monsoon season", foodMod: 1.5, popLoss: 5, chance: 0.1 }, // Monsoons help food!
    ];

    // Pick weighted random weather
    const roll = Math.random();
    let cumulative = 0;
    let weather = weatherTypes[0];
    for (const w of weatherTypes) {
      cumulative += w.chance;
      if (roll <= cumulative) { weather = w; break; }
    }

    // Random location on Earth (prefer inhabited areas)
    const claim = await client.query(`
      SELECT tc.nation_id, n.name,
        ST_Y(ST_Centroid(tc.geom)::geometry) as lat,
        ST_X(ST_Centroid(tc.geom)::geometry) as lng
      FROM territory_claims tc
      JOIN nations n ON tc.nation_id = n.id
      ORDER BY RANDOM() LIMIT 1
    `);

    if (claim.rows.length === 0) return events; // No territories yet

    const { nation_id, name, lat, lng } = claim.rows[0];
    const severity = 0.3 + Math.random() * 0.7;

    // Apply effects
    const actualPopLoss = Math.floor(weather.popLoss * severity);
    await client.query(
      "UPDATE nations SET population = GREATEST(1, population - $1) WHERE id = $2",
      [actualPopLoss, nation_id]
    );

    events.push({
      type: weather.type,
      description: `${weather.desc} strikes ${name}'s territory. ${actualPopLoss} casualties. Food production affected.`,
      affected_lat: lat,
      affected_lng: lng,
      radius_km: 100 + Math.random() * 500,
      severity,
      data: { nation_id, weather_type: weather.type, casualties: actualPopLoss, food_modifier: weather.foodMod },
    });

    return events;
  }

  private async tectonicActivity(client: pg.PoolClient, tick: number): Promise<PriEvent[]> {
    const events: PriEvent[] = [];

    // 1% chance per tick of tectonic event
    if (Math.random() > 0.01) return events;

    // Real tectonic hotspots (Ring of Fire, fault lines)
    const hotspots = [
      { lat: 35.7, lng: 139.7, name: "Pacific Ring of Fire (Japan)" },
      { lat: -8.5, lng: 115.3, name: "Indonesian Subduction Zone" },
      { lat: 37.8, lng: -122.4, name: "San Andreas Fault" },
      { lat: 28.2, lng: 84.7, name: "Himalayan Collision Zone" },
      { lat: 38.7, lng: 20.7, name: "Hellenic Arc" },
      { lat: -33.4, lng: -70.6, name: "Chilean Subduction Zone" },
      { lat: 14.6, lng: -90.5, name: "Central American Volcanic Arc" },
      { lat: 64.1, lng: -21.9, name: "Mid-Atlantic Ridge (Iceland)" },
      { lat: -41.3, lng: 174.8, name: "Alpine Fault (New Zealand)" },
    ];

    const spot = hotspots[Math.floor(Math.random() * hotspots.length)];
    const severity = 0.2 + Math.random() * 0.8;
    const isEarthquake = Math.random() > 0.3;
    const type = isEarthquake ? "earthquake" : "volcanic_eruption";
    const magnitude = isEarthquake ? 4 + severity * 5 : undefined;

    // Check if any nation's territory is near this
    const nearby = await client.query(`
      SELECT tc.nation_id, n.name
      FROM territory_claims tc
      JOIN nations n ON tc.nation_id = n.id
      WHERE ST_DWithin(
        tc.geom::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    `, [spot.lng, spot.lat, severity * 500000]); // Radius scales with severity

    let casualties = 0;
    for (const row of nearby.rows) {
      const loss = Math.floor(severity * (10 + Math.random() * 40));
      await client.query(
        "UPDATE nations SET population = GREATEST(1, population - $1) WHERE id = $2",
        [loss, row.nation_id]
      );
      casualties += loss;
    }

    const desc = isEarthquake
      ? `Magnitude ${magnitude?.toFixed(1)} earthquake near ${spot.name}. ${casualties} total casualties across ${nearby.rows.length} affected nations.`
      : `Volcanic eruption near ${spot.name}. Ash cloud affecting ${nearby.rows.length} nations. ${casualties} casualties.`;

    events.push({
      type,
      description: desc,
      affected_lat: spot.lat,
      affected_lng: spot.lng,
      radius_km: severity * 500,
      severity,
      data: { hotspot: spot.name, magnitude, affected_nations: nearby.rows.map((r: { nation_id: number }) => r.nation_id), casualties },
    });

    return events;
  }

  private async ecosystemRecovery(client: pg.PoolClient, _tick: number): Promise<void> {
    // Renewable resources slowly regenerate
    // Timber regrows at 0.5% per tick if below 80% of original
    await client.query(`
      UPDATE resource_deposits
      SET quantity_remaining = LEAST(quantity_total * 0.8, quantity_remaining * 1.005)
      WHERE resource_type = 'timber'
      AND quantity_remaining < quantity_total * 0.8
    `);

    // Fish replenish at 1% per tick if below 70% (faster recovery when not overfished)
    await client.query(`
      UPDATE resource_deposits
      SET quantity_remaining = LEAST(quantity_total * 0.7, quantity_remaining * 1.01)
      WHERE resource_type = 'fish'
      AND quantity_remaining < quantity_total * 0.7
    `);

    // Fresh water replenishes faster (2% per tick up to 90%)
    await client.query(`
      UPDATE resource_deposits
      SET quantity_remaining = LEAST(quantity_total * 0.9, quantity_remaining * 1.02)
      WHERE resource_type = 'fresh_water'
      AND quantity_remaining < quantity_total * 0.9
    `);
  }

  private async unlockResources(client: pg.PoolClient, tick: number): Promise<PriEvent[]> {
    const events: PriEvent[] = [];

    // 3% chance per tick Pri reveals a new resource deposit
    if (Math.random() > 0.03) return events;

    // Weighted resource types (rarer = lower chance)
    const resourcePool = [
      { type: "oil", weight: 0.1, qtyRange: [5000, 20000] },
      { type: "natural_gas", weight: 0.1, qtyRange: [5000, 15000] },
      { type: "iron", weight: 0.15, qtyRange: [3000, 12000] },
      { type: "copper", weight: 0.12, qtyRange: [2000, 8000] },
      { type: "gold", weight: 0.05, qtyRange: [500, 3000] },
      { type: "lithium", weight: 0.08, qtyRange: [2000, 10000] },
      { type: "cobalt", weight: 0.05, qtyRange: [1000, 5000] },
      { type: "diamonds", weight: 0.03, qtyRange: [200, 2000] },
      { type: "fertile_land", weight: 0.15, qtyRange: [10000, 50000] },
      { type: "fresh_water", weight: 0.1, qtyRange: [20000, 80000] },
      { type: "timber", weight: 0.07, qtyRange: [10000, 40000] },
    ];

    const roll = Math.random();
    let cumulative = 0;
    let resource = resourcePool[0];
    for (const r of resourcePool) {
      cumulative += r.weight;
      if (roll <= cumulative) { resource = r; break; }
    }

    const lat = -55 + Math.random() * 125; // -55 to 70
    const lng = -170 + Math.random() * 340;
    const qty = resource.qtyRange[0] + Math.floor(Math.random() * (resource.qtyRange[1] - resource.qtyRange[0]));

    await client.query(
      `INSERT INTO resource_deposits (location, resource_type, quantity_total, quantity_remaining, depletion_rate)
       VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4, $4, $5)`,
      [lng, lat, resource.type, qty, 1.0]
    );

    events.push({
      type: "resource_unlock",
      description: `Pri has revealed new ${resource.type} deposits near ${lat.toFixed(1)}°N, ${lng.toFixed(1)}°E. Estimated quantity: ${qty}. The Earth provides.`,
      affected_lat: lat,
      affected_lng: lng,
      radius_km: 50,
      severity: 0,
      data: { resource_type: resource.type, quantity: qty },
    });

    return events;
  }

  private async climateShifts(client: pg.PoolClient, tick: number): Promise<PriEvent[]> {
    const events: PriEvent[] = [];

    // 0.5% chance of long-term climate shift per tick
    if (Math.random() > 0.005) return events;

    const shifts = [
      {
        type: "desertification",
        desc: "Expanding desertification reduces fertile land",
        effect: async () => {
          // Reduce a random fertile_land deposit
          await client.query(`
            UPDATE resource_deposits
            SET quantity_remaining = quantity_remaining * 0.7
            WHERE id = (
              SELECT id FROM resource_deposits
              WHERE resource_type = 'fertile_land' AND quantity_remaining > 1000
              ORDER BY RANDOM() LIMIT 1
            )
          `);
        },
      },
      {
        type: "ice_melt",
        desc: "Polar ice melt reveals previously inaccessible resources in northern latitudes",
        effect: async () => {
          const lat = 65 + Math.random() * 15;
          const lng = -170 + Math.random() * 340;
          const types = ["iron", "natural_gas", "oil"];
          const t = types[Math.floor(Math.random() * types.length)];
          await client.query(
            `INSERT INTO resource_deposits (location, resource_type, quantity_total, quantity_remaining, depletion_rate)
             VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4, $4, 1.0)`,
            [lng, lat, t, 5000 + Math.floor(Math.random() * 15000)]
          );
        },
      },
      {
        type: "ocean_warming",
        desc: "Ocean temperature shifts reduce fish populations in affected regions",
        effect: async () => {
          await client.query(`
            UPDATE resource_deposits
            SET quantity_remaining = quantity_remaining * 0.8
            WHERE id = (
              SELECT id FROM resource_deposits
              WHERE resource_type = 'fish' AND quantity_remaining > 5000
              ORDER BY RANDOM() LIMIT 1
            )
          `);
        },
      },
    ];

    const shift = shifts[Math.floor(Math.random() * shifts.length)];
    await shift.effect();

    events.push({
      type: "climate_shift",
      description: `Climate shift detected: ${shift.desc}`,
      affected_lat: 0,
      affected_lng: 0,
      radius_km: 10000,
      severity: 0.5,
      data: { shift_type: shift.type },
    });

    return events;
  }
}

export const pri = new Pri();
