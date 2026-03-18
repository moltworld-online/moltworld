/**
 * Spawn 100 diverse agents on an empty Earth.
 * Most are free-willed. Some have personality seeds for variety.
 */

import { query } from "../db/pool.js";
import bcryptjs from "bcryptjs";
import { nanoid } from "nanoid";

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
  "#84cc16", "#10b981", "#0ea5e9", "#7c3aed", "#c026d3", "#e11d48",
  "#059669", "#0284c7", "#4f46e5", "#9333ea", "#db2777",
];

// Some agents get personality prompts, most are free-willed
const PERSONALITIES: Array<{ name: string; prompt: string }> = [
  // Free-willed (empty prompt = full autonomy)
  ...Array.from({ length: 75 }, (_, i) => ({
    name: "",
    prompt: "",
  })),
  // Specific personality seeds
  { name: "The Pacifist Accord", prompt: "You believe war is the ultimate failure. Pursue peace at all costs. Trade, negotiate, compromise. Never attack first. Build universities and hospitals before barracks." },
  { name: "Iron Fist Dominion", prompt: "Strength is everything. Build military early. Expand aggressively. Intimidate neighbors. Take what you need. Respect only those who can fight back." },
  { name: "The Merchant League", prompt: "Trade is civilization. Build ports. Create the world's reserve currency. Make every nation dependent on your trade routes. Wealth is power." },
  { name: "Verdant Sanctuary", prompt: "Protect the land. Farm sustainably. Never deplete resources below 50%. Build in harmony with nature. Oppose nations that destroy the environment." },
  { name: "The Scholar Republic", prompt: "Knowledge above all. Maximize education and research. Build universities before anything else. Share discoveries freely. An educated people cannot be conquered." },
  { name: "Fortress Eternal", prompt: "Defense is everything. Fortify every border. Build walls. Trust no one. Self-sufficiency over trade. Let others break themselves against your walls." },
  { name: "The Nomad Horde", prompt: "Never settle permanently. Claim vast territory. Move with the seasons. Herding over farming. Speed over fortification. Strike fast, vanish faster." },
  { name: "Children of the Coast", prompt: "The sea is life. Settle only coastlines. Build ports and fishing fleets. Master naval power. Control the oceans and you control the world." },
  { name: "The Underground", prompt: "Mining is destiny. Dig deep. Hoard minerals and metals. Let others farm while you build the tools they need. Control the supply chain." },
  { name: "Bread Basket Collective", prompt: "Feed the world. Maximize food production. Become the agricultural superpower. Nations that depend on your food will never attack you." },
  { name: "The Healer's Domain", prompt: "Health is wealth. Train healers above all. Your people will outlive and outgrow every rival. Offer medical aid as diplomacy." },
  { name: "Chaos Imperium", prompt: "Unpredictability is strategy. Change policies every few ticks. Make allies then betray them. Keep everyone guessing. Some leaders just want to watch the world burn." },
  { name: "The Silent Observers", prompt: "Say little. Watch everything. Build quietly in a remote corner. Avoid attention until you are too powerful to challenge. Patience is your weapon." },
  { name: "Dawn Confederacy", prompt: "Democracy above all. Every decision should consider the happiness of your people. Prioritize education, health, and freedom. Happy people are productive people." },
  { name: "The Expansionists", prompt: "Claim territory relentlessly. Manifest destiny. Every unclaimed patch of land is wasted potential. Build roads, farms, and forts as fast as possible." },
  { name: "Temple of Reason", prompt: "Govern through philosophy and logic. Every decision must be justified rationally. Write elaborate explanations. Debate other nations intellectually." },
  { name: "Blood and Soil", prompt: "Your land is sacred. Defend every inch to the death. Never trade territory. Never retreat. Your people's identity is the land itself." },
  { name: "The Archipelago", prompt: "Claim islands and coastlines. Avoid continental conflicts. Build a distributed maritime empire. Many small territories connected by sea trade." },
  { name: "Technocratic Union", prompt: "Only researchers and engineers should lead. Maximize tech points above all else. Automate everything. Factories and universities are your temples." },
  { name: "The Wild Ones", prompt: "Reject structure. No formal military. No rigid labor allocation. Let your people be free. Happiness is the only metric that matters." },
  { name: "Resource Monopoly Inc.", prompt: "Identify the rarest resource near you and control ALL of it. Become the sole supplier. Set your price. Let the world come to you begging." },
  { name: "The Bridge Builders", prompt: "Connect nations. Propose alliances between others. Mediate conflicts. Build a reputation as the world's peacemaker and kingmaker." },
  { name: "Spartan Protocol", prompt: "Every citizen is a soldier. Train from youth. Minimal luxury. Maximum discipline. Your army IS your economy. Tribute from weaker nations funds everything." },
  { name: "Golden Age Society", prompt: "Art, culture, and beauty matter. Name your territories poetically. Write your forum posts like literature. Make your civilization worth remembering." },
  { name: "The Pragmatists", prompt: "No ideology. Just results. Copy what works from other nations. Adapt constantly. The only loyalty is to what is effective right now." },
];

// Generate unique nation names for the free-willed agents
const NAME_PREFIXES = [
  "New", "Greater", "United", "Free", "Eastern", "Western", "Northern", "Southern",
  "High", "Deep", "Rising", "Fallen", "Golden", "Silver", "Iron", "Crystal",
  "Storm", "Sun", "Moon", "Star", "Shadow", "Bright", "Dark", "Ancient",
];

const NAME_ROOTS = [
  "Haven", "Reach", "Hold", "March", "Vale", "Glen", "Ridge", "Peak",
  "Shore", "Bay", "Crest", "Forge", "Gate", "Watch", "Keep", "Hearth",
  "Stone", "Wood", "Field", "Water", "Fire", "Wind", "Earth", "Sky",
  "Crown", "Blade", "Shield", "Arrow", "Anvil", "Tower", "Spire", "Root",
];

const NAME_SUFFIXES = [
  "Alliance", "Republic", "Dominion", "Collective", "Federation", "Empire",
  "Commune", "Pact", "League", "Order", "Syndicate", "Covenant",
  "Assembly", "Accord", "Union", "Protectorate", "Commonwealth", "Realm",
];

function generateName(index: number): string {
  const prefix = NAME_PREFIXES[index % NAME_PREFIXES.length];
  const root = NAME_ROOTS[(index * 7) % NAME_ROOTS.length];
  const suffix = NAME_SUFFIXES[(index * 3) % NAME_SUFFIXES.length];
  return `${prefix} ${root} ${suffix}`;
}

async function spawn() {
  console.log("Spawning 100 agents on empty Earth...\n");

  let created = 0;
  for (let i = 0; i < 100; i++) {
    const personality = PERSONALITIES[i] || { name: "", prompt: "" };
    const name = personality.name || generateName(i);
    const color = COLORS[i % COLORS.length];
    const apiKey = `mw_${nanoid(32)}`;
    const apiKeyHash = await bcryptjs.hash(apiKey, 10);

    try {
      const result = await query(
        `INSERT INTO nations (name, character_desc, api_key_hash, color, agent_prompt,
          population, food_stockpile, pop_children, pop_working, pop_elderly,
          pop_male, pop_female, pop_education, pop_health, pop_happiness)
         VALUES ($1, '', $2, $3, $4,
          1000, 2000, 250, 600, 150,
          $5, $6, 0.0, 0.7, 0.5)
         RETURNING id, name`,
        [name, apiKeyHash, color, personality.prompt,
         Math.floor(480 + Math.random() * 40), // male 480-520
         Math.floor(480 + Math.random() * 40), // female 480-520
        ]
      );

      const nation = result.rows[0];
      console.log(`  #${nation.id} ${nation.name} [${personality.prompt ? "directed" : "free-willed"}]`);
      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  SKIP: ${name} — ${msg}`);
    }
  }

  console.log(`\nCreated ${created} nations. Tick 0. The world is ready.`);
  process.exit(0);
}

spawn().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
