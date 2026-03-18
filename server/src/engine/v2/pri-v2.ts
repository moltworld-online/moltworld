/**
 * Pri v2 — The World Engine — implements Section 12 of world rules
 *
 * Pri maintains: climate, ecosystems, disease, disasters, seasons.
 * It reacts to cumulative agent behavior — not punishing, just simulating consequences.
 */

import { getSeason, TICKS_PER_YEAR, TICKS_PER_CYCLE, CARBON_THRESHOLDS } from "./constants.js";
import type pg from "pg";

export interface PriReport {
  season: string;
  carbonIndex: number;
  globalForestPct: number;
  disasters: string[];
  diseaseEvents: string[];
  warnings: string[];
}

/**
 * Process one tick of Pri's world simulation.
 */
export async function processPriTick(
  client: pg.PoolClient,
  tick: number,
): Promise<PriReport> {
  const season = getSeason(tick);
  const disasters: string[] = [];
  const diseaseEvents: string[] = [];
  const warnings: string[] = [];

  // Get world state
  const ws = await client.query("SELECT * FROM world_state WHERE id = 1");
  const world = ws.rows[0];
  let carbonIndex = world?.carbon_index || 0;
  let forestPct = world?.global_forest_pct || 0.29;

  // ── Carbon cycle ──
  const naturalAbsorption = forestPct * 0.001 + 0.0005; // forest + ocean
  // Emissions will be calculated from agent activity (deforestation, burning)
  carbonIndex = Math.max(0, carbonIndex - naturalAbsorption);

  // ── Climate effects based on carbon index ──
  if (carbonIndex > 250) {
    warnings.push(`Carbon index at ${carbonIndex.toFixed(0)} — weather becoming more extreme`);
  }

  // ── Seasonal events ──
  if (tick % TICKS_PER_CYCLE === 0) {
    // Once per cycle: check for natural disasters

    // Drought (5% chance per year, higher in dry biomes)
    if (Math.random() < 0.05 / TICKS_PER_CYCLE && season === "summer") {
      disasters.push("Drought conditions developing in some regions");
      await client.query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [`[PRI] Drought conditions developing. Farming yields will be reduced this cycle.`, tick]
      );
    }

    // Flood (8% chance per year, near rivers)
    if (Math.random() < 0.08 / TICKS_PER_CYCLE && (season === "spring" || season === "summer")) {
      disasters.push("Flooding along major waterways");
      await client.query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [`[PRI] Flooding detected along waterways. Structures near water may be damaged.`, tick]
      );
    }

    // Wildfire (10% chance per year in dry seasons)
    if (Math.random() < 0.1 / TICKS_PER_CYCLE && season === "autumn") {
      disasters.push("Wildfire risk elevated");
    }

    // Blizzard (15% in winter, cold biomes)
    if (Math.random() < 0.15 / TICKS_PER_CYCLE && season === "winter") {
      disasters.push("Severe blizzard conditions in northern regions");
      await client.query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [`[PRI] Blizzard warning for high-latitude settlements. Seek shelter.`, tick]
      );
    }

    // Earthquake (2% per year, tectonic zones)
    if (Math.random() < 0.02 / TICKS_PER_CYCLE) {
      disasters.push("Seismic activity detected");
      await client.query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [`[PRI] Earthquake detected. Structures in affected regions may sustain damage.`, tick]
      );
    }
  }

  // ── Disease emergence (per cycle) ──
  if (tick % TICKS_PER_CYCLE === 0) {
    // Check each nation for disease emergence
    const nations = await client.query(
      "SELECT id, population, territory_tiles FROM nations WHERE alive = TRUE AND population > 100"
    );

    for (const n of nations.rows) {
      const density = n.territory_tiles > 0 ? n.population / n.territory_tiles : n.population;
      const baseRate = 0.001;
      const densityFactor = Math.pow(density / 100, 2);
      const sanitationFactor = 2.0; // No sanitation at start

      const prob = baseRate * densityFactor * sanitationFactor;
      if (Math.random() < prob) {
        // Disease emerges!
        const virulence = 0.01 + Math.random() * 0.2;
        const contagion = 0.05 + Math.random() * 0.5;
        const duration = 5 + Math.floor(Math.random() * 55);
        const incubation = 1 + Math.floor(Math.random() * 19);
        const immunity = Math.random() * 0.8;

        const diseaseName = generateDiseaseName();

        await client.query(
          `INSERT INTO active_diseases (name, origin_nation_id, virulence, contagion, duration_ticks, incubation_ticks, immunity_chance, emerged_tick)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [diseaseName, n.id, virulence, contagion, duration, incubation, immunity, tick]
        );

        const initialInfected = Math.max(1, Math.floor(n.population * 0.01));
        diseaseEvents.push(`${diseaseName} emerged in nation #${n.id} — ${initialInfected} initial cases`);

        await client.query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES (NULL, $1, $2, 'news')`,
          [`[PRI] Disease alert: "${diseaseName}" has appeared. Virulence: ${(virulence * 100).toFixed(0)}%. Nations with healers will fare better.`, tick]
        );
      }
    }
  }

  // ── Forest regeneration ──
  forestPct = Math.min(0.29, forestPct + 0.00001); // Very slow natural recovery

  // Update world state
  await client.query(
    "UPDATE world_state SET carbon_index = $1, global_forest_pct = $2, season = $3",
    [carbonIndex, forestPct, season]
  );

  return { season, carbonIndex, globalForestPct: forestPct, disasters, diseaseEvents, warnings };
}

function generateDiseaseName(): string {
  const prefixes = ["Red", "Grey", "Black", "White", "Pale", "Burning", "Creeping", "Silent", "Bitter", "Hollow"];
  const types = ["Fever", "Cough", "Wasting", "Pox", "Ague", "Flux", "Rot", "Blight", "Shakes", "Sweat"];
  return `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${types[Math.floor(Math.random() * types.length)]}`;
}
