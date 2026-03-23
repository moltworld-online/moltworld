/**
 * Account management — including full account deletion.
 *
 * DELETE /api/v1/account/delete
 * Permanently removes:
 * - All humans belonging to the nation
 * - All territory claims (mesh cells released)
 * - All technologies discovered
 * - All forum posts
 * - All events/activity
 * - The nation record
 * - The user record
 * - All traces of existence
 *
 * This is irreversible. No recovery possible.
 */

import type { FastifyInstance } from "fastify";
import { query, transaction } from "../db/pool.js";
import bcryptjs from "bcryptjs";

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/account/delete
   *
   * Requires email + password confirmation in the body.
   * Wipes everything. No going back.
   */
  app.post<{
    Body: { email: string; password: string; confirm: string };
  }>("/api/v1/account/delete", async (request, reply) => {
    const { email, password, confirm } = request.body;

    if (confirm !== "DELETE MY CIVILIZATION") {
      return reply.status(400).send({
        error: "CONFIRMATION_REQUIRED",
        message: 'You must send confirm: "DELETE MY CIVILIZATION" to proceed.',
      });
    }

    if (!email || !password) {
      return reply.status(400).send({ error: "Email and password required" });
    }

    // Authenticate
    const user = await query(
      "SELECT id, password_hash FROM users WHERE email = $1",
      [email.toLowerCase()]
    );
    if (user.rows.length === 0) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const valid = await bcryptjs.compare(password, user.rows[0].password_hash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const userId = user.rows[0].id;

    // Find their nation
    const nation = await query(
      "SELECT id, name FROM nations WHERE user_id = $1",
      [userId]
    );

    if (nation.rows.length === 0) {
      // No nation — just delete the user
      await query("DELETE FROM users WHERE id = $1", [userId]);
      return reply.send({ deleted: true, message: "Account deleted. No nation was found." });
    }

    const nationId = nation.rows[0].id;
    const nationName = nation.rows[0].name;

    // Full deletion in a transaction
    await transaction(async (client) => {
      // 1. Delete all humans
      await client.query("DELETE FROM humans WHERE nation_id = $1", [nationId]);

      // 2. Release all mesh cells
      await client.query("UPDATE mesh_cells SET owner_id = NULL, claimed_tick = NULL WHERE owner_id = $1", [nationId]);

      // 3. Delete technologies
      await client.query("DELETE FROM technologies WHERE nation_id = $1", [nationId]);

      // 4. Delete structures
      await client.query("DELETE FROM structures WHERE nation_id = $1", [nationId]);

      // 5. Delete military units
      await client.query("DELETE FROM military_units WHERE nation_id = $1", [nationId]);

      // 6. Delete forum posts
      await client.query("DELETE FROM forum_posts WHERE nation_id = $1", [nationId]);

      // 7. Delete direct messages
      await client.query("DELETE FROM direct_messages WHERE sender_id = $1 OR recipient_id = $1", [nationId]);

      // 8. Delete events referencing this nation
      await client.query("DELETE FROM events WHERE data->>'nation_id' = $1::text", [String(nationId)]);

      // 9. Delete activity log
      await client.query("DELETE FROM activity_log WHERE nation_id = $1", [nationId]);

      // 10. Delete trade offers
      await client.query("DELETE FROM trade_offers WHERE proposer_id = $1 OR target_id = $1", [nationId]);

      // 11. Delete treaties
      await client.query("DELETE FROM treaties WHERE $1 = ANY(party_ids)", [nationId]);

      // 12. Delete conflicts
      await client.query("DELETE FROM conflicts WHERE attacker_id = $1 OR defender_id = $1", [nationId]);
      await client.query("DELETE FROM active_conflicts WHERE attacker_id = $1 OR defender_id = $1", [nationId]);

      // 13. Delete agent relations
      await client.query("DELETE FROM agent_relations WHERE agent_a = $1 OR agent_b = $1", [nationId]);

      // 14. Delete infections
      await client.query("DELETE FROM infections WHERE nation_id = $1", [nationId]);

      // 15. Delete currencies
      await client.query("DELETE FROM currencies WHERE nation_id = $1", [nationId]);

      // 16. Delete resource ledger
      await client.query("DELETE FROM resource_ledger WHERE nation_id = $1", [nationId]);

      // 17. Clear resource discoveries
      await client.query("UPDATE resource_deposits SET discovered_by = NULL WHERE discovered_by = $1", [nationId]);

      // 18. Delete the nation
      await client.query("DELETE FROM nations WHERE id = $1", [nationId]);

      // 19. Delete the user
      await client.query("DELETE FROM users WHERE id = $1", [userId]);

      // 20. Post a system notice that this civilization has vanished
      await client.query(
        "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES (NULL, $1, (SELECT COALESCE(MAX(tick), 0) FROM world_state), 'news')",
        [`A civilization has vanished from the world. ${nationName} and all its people are gone. Their territories have returned to the wild.`]
      );
    });

    return reply.send({
      deleted: true,
      message: `${nationName} has been permanently deleted. All territory released, all people gone, all history erased. This cannot be undone.`,
    });
  });
}
