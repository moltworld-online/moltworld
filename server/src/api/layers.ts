import type { FastifyInstance } from "fastify";
import { query } from "../db/pool.js";

/**
 * Map layer endpoints - serves Pri's world data as GeoJSON
 * for the spectator map visualization.
 */
export async function layerRoutes(app: FastifyInstance): Promise<void> {
  // ── Resource deposits (all discovered + undiscovered for spectators) ──
  app.get("/api/v1/layers/resources", async (_request, reply) => {
    const deposits = await query(`
      SELECT
        id, resource_type,
        quantity_total, quantity_remaining,
        ROUND((quantity_remaining / NULLIF(quantity_total, 0) * 100)::numeric, 1) as pct_remaining,
        depletion_rate,
        discovered_by,
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng
      FROM resource_deposits
      ORDER BY resource_type, quantity_remaining DESC
    `);

    const features = deposits.rows.map((d) => ({
      type: "Feature" as const,
      properties: {
        id: d.id,
        resource_type: d.resource_type,
        quantity_total: d.quantity_total,
        quantity_remaining: d.quantity_remaining,
        pct_remaining: parseFloat(d.pct_remaining ?? "100"),
        depletion_rate: d.depletion_rate,
        discovered: d.discovered_by !== null,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [d.lng, d.lat],
      },
    }));

    return reply.send({ type: "FeatureCollection", features });
  });

  // ── Recent Pri events (weather, tectonic, climate) ──
  app.get<{
    Querystring: { limit?: number };
  }>("/api/v1/layers/pri-events", async (request, reply) => {
    const limit = request.query.limit || 50;

    const events = await query(
      `SELECT id, tick_number, event_type, data, created_at
       FROM events
       WHERE event_type LIKE 'pri_%'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    const features = events.rows
      .filter((e) => e.data?.affected_lat != null)
      .map((e) => ({
        type: "Feature" as const,
        properties: {
          id: e.id,
          tick: e.tick_number,
          event_type: e.event_type.replace("pri_", ""),
          description: e.data.description || "",
          severity: e.data.severity || 0,
          radius_km: e.data.radius_km || 100,
          data: e.data,
          created_at: e.created_at,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [e.data.affected_lng, e.data.affected_lat],
        },
      }));

    return reply.send({ type: "FeatureCollection", features });
  });

  // ── Tectonic hotspots (static data - real fault lines) ──
  app.get("/api/v1/layers/tectonic", async (_request, reply) => {
    const hotspots = [
      { lat: 35.7, lng: 139.7, name: "Pacific Ring of Fire (Japan)", risk: 0.9 },
      { lat: -8.5, lng: 115.3, name: "Indonesian Subduction Zone", risk: 0.9 },
      { lat: 37.8, lng: -122.4, name: "San Andreas Fault", risk: 0.8 },
      { lat: 28.2, lng: 84.7, name: "Himalayan Collision Zone", risk: 0.85 },
      { lat: 38.7, lng: 20.7, name: "Hellenic Arc", risk: 0.6 },
      { lat: -33.4, lng: -70.6, name: "Chilean Subduction Zone", risk: 0.85 },
      { lat: 14.6, lng: -90.5, name: "Central American Volcanic Arc", risk: 0.7 },
      { lat: 64.1, lng: -21.9, name: "Mid-Atlantic Ridge (Iceland)", risk: 0.5 },
      { lat: -41.3, lng: 174.8, name: "Alpine Fault (New Zealand)", risk: 0.7 },
      { lat: 40.8, lng: 30.0, name: "North Anatolian Fault (Turkey)", risk: 0.8 },
      { lat: -17.8, lng: -65.3, name: "Nazca Plate Boundary", risk: 0.75 },
      { lat: 13.4, lng: 144.8, name: "Mariana Trench Zone", risk: 0.6 },
      { lat: 60.5, lng: -152.5, name: "Aleutian Trench", risk: 0.7 },
      { lat: -22.0, lng: -68.5, name: "Atacama Fault", risk: 0.65 },
      { lat: 15.0, lng: 120.0, name: "Philippine Trench", risk: 0.8 },
      { lat: 45.5, lng: 152.0, name: "Kuril-Kamchatka Trench", risk: 0.75 },
      { lat: -6.0, lng: 29.0, name: "East African Rift", risk: 0.5 },
      { lat: 36.0, lng: 70.0, name: "Hindu Kush Seismic Zone", risk: 0.7 },
    ];

    const features = hotspots.map((h, i) => ({
      type: "Feature" as const,
      properties: { id: i, name: h.name, risk: h.risk },
      geometry: { type: "Point" as const, coordinates: [h.lng, h.lat] },
    }));

    return reply.send({ type: "FeatureCollection", features });
  });

  // ── Climate zones (latitude bands with current seasonal modifier) ──
  app.get("/api/v1/layers/climate", async (_request, reply) => {
    const tickRow = await query(
      "SELECT value::text FROM world_config WHERE key = 'current_tick'"
    );
    const tick = tickRow.rows.length > 0 ? parseInt(JSON.parse(tickRow.rows[0].value)) : 0;

    const phase = tick % 365;
    let season: string;
    if (phase < 91) season = "spring";
    else if (phase < 182) season = "summer";
    else if (phase < 273) season = "autumn";
    else season = "winter";

    // Climate bands with productivity modifiers
    const bands = [
      { name: "Arctic", lat_min: 66.5, lat_max: 90, food_mod: season === "summer" ? 0.3 : 0.05, color: "#1e3a5f" },
      { name: "Subarctic", lat_min: 55, lat_max: 66.5, food_mod: season === "summer" ? 0.8 : 0.2, color: "#1e4a6f" },
      { name: "Temperate North", lat_min: 35, lat_max: 55, food_mod: season === "summer" ? 1.3 : season === "winter" ? 0.5 : 0.9, color: "#2a5a3f" },
      { name: "Subtropical North", lat_min: 23.5, lat_max: 35, food_mod: 1.1, color: "#3a6a2f" },
      { name: "Tropical", lat_min: -23.5, lat_max: 23.5, food_mod: 1.0, color: "#4a7a2f" },
      { name: "Subtropical South", lat_min: -35, lat_max: -23.5, food_mod: season === "winter" ? 1.3 : season === "summer" ? 0.5 : 0.9, color: "#3a6a2f" },
      { name: "Temperate South", lat_min: -55, lat_max: -35, food_mod: season === "winter" ? 1.3 : season === "summer" ? 0.5 : 0.9, color: "#2a5a3f" },
      { name: "Subantarctic", lat_min: -66.5, lat_max: -55, food_mod: season === "winter" ? 0.8 : 0.2, color: "#1e4a6f" },
      { name: "Antarctic", lat_min: -90, lat_max: -66.5, food_mod: 0.02, color: "#1e3a5f" },
    ];

    const features = bands.map((b, i) => ({
      type: "Feature" as const,
      properties: {
        id: i,
        name: b.name,
        food_modifier: b.food_mod,
        color: b.color,
        season,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[
          [-180, b.lat_min], [180, b.lat_min],
          [180, b.lat_max], [-180, b.lat_max],
          [-180, b.lat_min],
        ]],
      },
    }));

    return reply.send({ type: "FeatureCollection", features, season, tick });
  });
}
