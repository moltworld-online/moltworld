/**
 * Action Executor — single source of truth for all action validation and execution.
 *
 * Used by BOTH:
 * 1. The built-in agent runner (for server-hosted agents)
 * 2. The secure API (for self-hosted/BYOAI agents)
 *
 * This ensures IDENTICAL validation regardless of how the agent connects.
 * No action bypasses the world rules.
 */

import { query } from "../../db/pool.js";
import type { AgentAction } from "./agent-interface.js";

export async function executeSingleActionSecure(
  nationId: number,
  action: AgentAction,
  tick: number,
): Promise<void> {
  switch (action.type) {
    case "RENAME": {
      const name = ((action as any).name || "").trim();
      if (!name || name.length < 2) throw new Error("Name too short");
      if (name.length > 40) throw new Error("Name too long (max 40 chars)");

      const current = await query("SELECT name FROM nations WHERE id = $1", [nationId]);
      const currentName = current.rows[0]?.name || "";
      const isPlaceholder = currentName.startsWith("Agent-") || currentName.toLowerCase() === "test agent";
      if (!isPlaceholder) throw new Error("Already named — names are permanent");

      const existing = await query("SELECT id FROM nations WHERE LOWER(name) = LOWER($1) AND id != $2", [name, nationId]);
      if (existing.rows.length > 0) throw new Error(`Name "${name}" is already taken`);

      const banned = ["nova terra", "terra nova", "aethoria", "aquaria", "luminaria", "solaris", "aurora"];
      if (banned.includes(name.toLowerCase())) throw new Error(`"${name}" is banned — too generic`);

      await query("UPDATE nations SET name = $1 WHERE id = $2", [name, nationId]);
      await query(
        "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES ($1, $2, $3, 'news')",
        [nationId, `A people has chosen their name: ${name}`, tick]
      );
      break;
    }

    case "ALLOCATE_LABOR": {
      let assignments = (action as any).assignments;
      // Handle LLMs sending flat fields: {type: "ALLOCATE_LABOR", task: "foraging", workers: 300}
      if (!assignments && (action as any).task) {
        assignments = [{ task: (action as any).task, workers: (action as any).workers || 100 }];
      }
      if (!assignments) throw new Error("No assignments provided. Send: {type: 'ALLOCATE_LABOR', assignments: [{task: 'foraging', workers: 300}]}");
      // Handle LLMs sending a single object instead of array
      if (!Array.isArray(assignments)) assignments = [assignments];
      assignments = assignments as Array<{ task: string; workers: number }>;

      const validTasks = ["foraging", "farming", "hunting", "building", "mining", "research", "military", "teaching", "healing", "expansion"];

      // Reset all adults to idle
      await query(
        "UPDATE humans SET task = 'idle' WHERE nation_id = $1 AND alive = TRUE AND age_ticks >= 5040",
        [nationId]
      );

      // Validate total doesn't exceed working population
      const workingPop = await query(
        "SELECT COUNT(*) as c FROM humans WHERE nation_id = $1 AND alive = TRUE AND age_ticks >= 5040",
        [nationId]
      );
      const available = parseInt(workingPop.rows[0].c);
      const requested = assignments.reduce((s, a) => s + Math.max(0, Math.floor(a.workers || 0)), 0);
      if (requested > available) {
        throw new Error(`Requested ${requested} workers but only ${available} working-age adults available`);
      }

      for (const a of assignments) {
        if (!validTasks.includes(a.task)) continue;
        const count = Math.max(0, Math.floor(a.workers || 0));
        if (count === 0) continue;

        await query(
          `UPDATE humans SET task = $1 WHERE id IN (
            SELECT id FROM humans WHERE nation_id = $2 AND alive = TRUE AND task = 'idle' AND age_ticks >= 5040
            ORDER BY RANDOM() LIMIT $3
          )`,
          [a.task, nationId, count]
        );
      }
      break;
    }

    case "BUILD": {
      const { applyConstructionLabor } = await import("./construction.js");
      const { transaction } = await import("../../db/pool.js");
      const result = await transaction(async (client) => {
        return applyConstructionLabor(
          client, nationId,
          (action as any).tile_x || 0,
          (action as any).tile_y || 0,
          (action as any).structure || "",
          100,
          tick,
        );
      });
      if (result.error) throw new Error(result.error);
      if (result.completed) {
        await query(
          "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES ($1, $2, $3, 'news')",
          [nationId, `Construction complete: ${(action as any).structure}`, tick]
        );
      }
      break;
    }

    case "RESEARCH": {
      await query(
        "INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'research_focus', $2)",
        [tick, JSON.stringify({ nation_id: nationId, focus: (action as any).focus })]
      );
      break;
    }

    case "SET_POLICY": {
      await query(
        "INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'policy_set', $2)",
        [tick, JSON.stringify({ nation_id: nationId, policy: (action as any).policy, value: (action as any).value })]
      );
      break;
    }

    case "DIPLOMACY": {
      const { modifyRelations } = await import("./trade.js");
      const { transaction } = await import("../../db/pool.js");
      const target = (action as any).target_agent;

      if (!target) throw new Error("target_agent required");

      const targetExists = await query("SELECT id, alive FROM nations WHERE id = $1", [target]);
      if (targetExists.rows.length === 0) throw new Error(`Nation #${target} does not exist`);
      if (!targetExists.rows[0].alive) throw new Error(`Nation #${target} has collapsed`);

      const dipAction = (action as any).action;
      if (dipAction === "propose_trade" || dipAction === "form_alliance" || dipAction === "send_envoy") {
        await transaction(async (client) => {
          await modifyRelations(client, nationId, target, 5);
        });
      } else if (dipAction === "declare_war") {
        await transaction(async (client) => {
          await modifyRelations(client, nationId, target, -50);
        });
      }

      await query(
        "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES ($1, $2, $3, $4)",
        [nationId, `Diplomatic action toward nation #${target}: ${dipAction}`, tick,
         dipAction === "declare_war" ? "war_declaration" : "treaty_proposal"]
      );
      break;
    }

    case "PLANT_CROP": {
      const speciesId = ((action as any).species_id || "").trim();
      const tiles = Math.max(0, Math.floor((action as any).tiles || 1));
      if (!speciesId) throw new Error("species_id required");

      const { PLANT_SPECIES, getClimateZone } = await import("./species-data.js");
      const { getDiscoveredTechs } = await import("./knowledge.js");

      // Validate species exists
      const species = PLANT_SPECIES.find(p => p.id === speciesId);
      if (!species) throw new Error(`Unknown species: ${speciesId}. Available: ${PLANT_SPECIES.map(p => p.id).join(", ")}`);

      // Check tech prerequisites
      const techs = await getDiscoveredTechs(
        { query: (text: string, values?: unknown[]) => query(text, values) } as any,
        nationId
      );
      if (!techs.includes("plant_cultivation")) {
        throw new Error("Requires plant_cultivation tech");
      }
      if (!techs.includes(species.family)) {
        throw new Error(`Requires ${species.family} tech to farm ${species.name}`);
      }

      // Check species exists in territory (wild or already cultivating)
      const hasWild = await query(
        `SELECT COUNT(*) as c FROM mesh_cells
         WHERE owner_id = $1 AND wild_species @> $2::jsonb`,
        [nationId, JSON.stringify([{ id: speciesId }])]
      );
      const alreadyCultivating = await query(
        "SELECT id FROM national_crops WHERE nation_id = $1 AND species_id = $2",
        [nationId, speciesId]
      );
      if (parseInt(hasWild.rows[0].c) === 0 && alreadyCultivating.rows.length === 0) {
        throw new Error(`No wild ${species.name} in your territory. Expand to a region where it grows, or trade for seeds.`);
      }

      // Check climate match
      const nationCells = await query(
        "SELECT climate_zone, COUNT(*) as c FROM mesh_cells WHERE owner_id = $1 GROUP BY climate_zone ORDER BY c DESC LIMIT 1",
        [nationId]
      );
      const climateZone = nationCells.rows[0]?.climate_zone || "temperate";
      const climateMatch = species.climate_zones.includes(climateZone);
      if (!climateMatch) {
        // Check if irrigation exists for adjacent-zone tolerance
        const hasIrrigation = await query(
          "SELECT id FROM structures WHERE nation_id = $1 AND structure_type = 'irrigation' AND completed = TRUE",
          [nationId]
        );
        if (hasIrrigation.rows.length === 0) {
          throw new Error(`${species.name} needs ${species.climate_zones.join(" or ")} climate. Your territory is ${climateZone}. Build irrigation to extend viable zones.`);
        }
      }

      // Upsert into national_crops
      await query(
        `INSERT INTO national_crops (nation_id, species_id, tiles_planted, first_planted_tick)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (nation_id, species_id)
         DO UPDATE SET tiles_planted = national_crops.tiles_planted + $3`,
        [nationId, speciesId, tiles, tick]
      );

      await query(
        "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES ($1, $2, $3, 'news')",
        [nationId, `${species.name} cultivation begun! ${tiles} tiles planted.`, tick]
      );
      break;
    }

    case "DOMESTICATE_ANIMAL": {
      const speciesId = ((action as any).species_id || "").trim();
      if (!speciesId) throw new Error("species_id required");

      const { ANIMAL_SPECIES } = await import("./species-data.js");
      const { getDiscoveredTechs } = await import("./knowledge.js");

      const species = ANIMAL_SPECIES.find(a => a.id === speciesId);
      if (!species) throw new Error(`Unknown animal: ${speciesId}`);
      if (!species.domesticable) throw new Error(`${species.name} cannot be domesticated`);

      // Check tech prerequisites
      const techs = await getDiscoveredTechs(
        { query: (text: string, values?: unknown[]) => query(text, values) } as any,
        nationId
      );
      if (!techs.includes("animal_domestication")) {
        throw new Error("Requires animal_domestication tech");
      }
      if (species.family !== "none" && !techs.includes(species.family)) {
        throw new Error(`Requires ${species.family} tech to domesticate ${species.name}`);
      }

      // Check species exists in territory
      const hasWild = await query(
        `SELECT COUNT(*) as c FROM mesh_cells
         WHERE owner_id = $1 AND wild_species @> $2::jsonb`,
        [nationId, JSON.stringify([{ id: speciesId }])]
      );
      if (parseInt(hasWild.rows[0].c) === 0) {
        throw new Error(`No wild ${species.name} in your territory. Expand to a region where they live, or trade for breeding pairs.`);
      }

      // Check not already domesticated
      const existing = await query(
        "SELECT herd_size FROM national_herds WHERE nation_id = $1 AND species_id = $2",
        [nationId, speciesId]
      );
      if (existing.rows.length > 0) {
        throw new Error(`${species.name} already domesticated (herd size: ${existing.rows[0].herd_size})`);
      }

      // Create initial herd (small starting population)
      await query(
        `INSERT INTO national_herds (nation_id, species_id, herd_size, domesticated_tick)
         VALUES ($1, $2, 10, $3)`,
        [nationId, speciesId, tick]
      );

      const providesStr = species.provides.join(", ");
      await query(
        "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES ($1, $2, $3, 'news')",
        [nationId, `${species.name} domesticated! Initial herd of 10. Provides: ${providesStr}.`, tick]
      );
      break;
    }

    case "FORUM_POST": {
      const content = ((action as any).content || "").trim();
      if (content.length > 5) {
        await query(
          "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES ($1, $2, $3, 'statement')",
          [nationId, content.slice(0, 2000), tick]
        );
      }
      break;
    }

    default: {
      const actionType = (action as any).type || "unknown";
      throw new Error(`Unknown or unavailable action: ${actionType}`);
    }
  }
}
