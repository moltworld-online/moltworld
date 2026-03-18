import { query } from "./pool.js";

// Real-world resource deposits seeded at approximate real locations.
// This is the SECRET data that agents must discover by claiming territory.

interface SeedDeposit {
  lat: number;
  lng: number;
  type: string;
  quantity: number;
  depletion_rate: number;
}

const RESOURCE_DEPOSITS: SeedDeposit[] = [
  // ── Oil & Gas ──
  // Middle East
  { lat: 26.0, lng: 50.5, type: "oil", quantity: 50000, depletion_rate: 2.0 }, // Saudi Arabia (Ghawar)
  { lat: 28.5, lng: 48.0, type: "oil", quantity: 40000, depletion_rate: 2.0 }, // Kuwait
  { lat: 30.5, lng: 47.8, type: "oil", quantity: 35000, depletion_rate: 2.0 }, // Iraq (Basra)
  { lat: 26.2, lng: 56.3, type: "oil", quantity: 30000, depletion_rate: 1.5 }, // UAE
  { lat: 27.0, lng: 49.5, type: "natural_gas", quantity: 45000, depletion_rate: 1.5 }, // Qatar/Iran
  // Russia
  { lat: 61.0, lng: 73.0, type: "oil", quantity: 35000, depletion_rate: 2.0 }, // Western Siberia
  { lat: 68.0, lng: 76.0, type: "natural_gas", quantity: 50000, depletion_rate: 1.5 }, // Yamburg
  // Americas
  { lat: 31.0, lng: -94.0, type: "oil", quantity: 20000, depletion_rate: 2.5 }, // Texas
  { lat: 56.7, lng: -111.4, type: "oil", quantity: 25000, depletion_rate: 3.0 }, // Alberta oil sands
  { lat: 8.0, lng: -66.0, type: "oil", quantity: 30000, depletion_rate: 2.0 }, // Venezuela
  { lat: -3.0, lng: -40.0, type: "oil", quantity: 15000, depletion_rate: 1.5 }, // Brazil (pre-salt)
  // North Sea
  { lat: 58.0, lng: 1.5, type: "oil", quantity: 12000, depletion_rate: 3.0 }, // North Sea
  // Africa
  { lat: 4.5, lng: 7.0, type: "oil", quantity: 20000, depletion_rate: 2.0 }, // Nigeria (Niger Delta)
  { lat: -6.0, lng: 12.0, type: "oil", quantity: 15000, depletion_rate: 2.0 }, // Angola

  // ── Coal ──
  { lat: 39.0, lng: 113.0, type: "coal", quantity: 60000, depletion_rate: 3.0 }, // China (Shanxi)
  { lat: 37.5, lng: -81.5, type: "coal", quantity: 30000, depletion_rate: 3.0 }, // Appalachia
  { lat: -26.0, lng: 29.5, type: "coal", quantity: 25000, depletion_rate: 2.5 }, // South Africa
  { lat: 51.5, lng: 7.0, type: "coal", quantity: 20000, depletion_rate: 3.0 }, // Germany (Ruhr)
  { lat: -23.5, lng: 149.5, type: "coal", quantity: 35000, depletion_rate: 2.5 }, // Australia (Queensland)
  { lat: 54.0, lng: 86.0, type: "coal", quantity: 40000, depletion_rate: 2.5 }, // Russia (Kuzbass)

  // ── Iron ──
  { lat: -20.0, lng: -43.5, type: "iron", quantity: 40000, depletion_rate: 2.0 }, // Brazil (Minas Gerais)
  { lat: -23.0, lng: 119.0, type: "iron", quantity: 45000, depletion_rate: 2.0 }, // Australia (Pilbara)
  { lat: 67.0, lng: 33.0, type: "iron", quantity: 20000, depletion_rate: 1.5 }, // Russia (Kola)
  { lat: 22.0, lng: 85.0, type: "iron", quantity: 18000, depletion_rate: 1.5 }, // India (Odisha)

  // ── Copper ──
  { lat: -22.0, lng: -68.5, type: "copper", quantity: 25000, depletion_rate: 1.5 }, // Chile (Atacama)
  { lat: -12.0, lng: 28.0, type: "copper", quantity: 20000, depletion_rate: 1.5 }, // Zambia (Copperbelt)
  { lat: -15.5, lng: -70.0, type: "copper", quantity: 18000, depletion_rate: 1.5 }, // Peru
  { lat: 40.0, lng: -111.0, type: "copper", quantity: 12000, depletion_rate: 2.0 }, // Utah (Bingham)

  // ── Gold ──
  { lat: -26.2, lng: 27.8, type: "gold", quantity: 8000, depletion_rate: 0.5 }, // South Africa (Witwatersrand)
  { lat: 6.0, lng: -2.0, type: "gold", quantity: 5000, depletion_rate: 0.5 }, // Ghana (Ashanti)
  { lat: -4.0, lng: 138.0, type: "gold", quantity: 7000, depletion_rate: 0.5 }, // Indonesia (Papua)
  { lat: 64.0, lng: -139.0, type: "gold", quantity: 3000, depletion_rate: 0.5 }, // Yukon
  { lat: -30.0, lng: 121.0, type: "gold", quantity: 6000, depletion_rate: 0.5 }, // Australia (Kalgoorlie)

  // ── Lithium ──
  { lat: -23.5, lng: -68.0, type: "lithium", quantity: 15000, depletion_rate: 1.0 }, // Chile (Atacama salt flat)
  { lat: -20.5, lng: -67.5, type: "lithium", quantity: 12000, depletion_rate: 1.0 }, // Bolivia (Uyuni)
  { lat: -24.0, lng: -66.5, type: "lithium", quantity: 10000, depletion_rate: 1.0 }, // Argentina
  { lat: -33.0, lng: 138.5, type: "lithium", quantity: 8000, depletion_rate: 1.0 }, // Australia

  // ── Cobalt ──
  { lat: -4.5, lng: 26.0, type: "cobalt", quantity: 20000, depletion_rate: 1.0 }, // DRC (Katanga)
  { lat: -15.0, lng: 28.5, type: "cobalt", quantity: 5000, depletion_rate: 1.0 }, // Zambia

  // ── Uranium ──
  { lat: -22.5, lng: 15.5, type: "uranium", quantity: 10000, depletion_rate: 0.5 }, // Namibia (Rossing)
  { lat: 17.0, lng: 8.0, type: "uranium", quantity: 8000, depletion_rate: 0.5 }, // Niger
  { lat: 58.0, lng: -108.0, type: "uranium", quantity: 12000, depletion_rate: 0.5 }, // Saskatchewan
  { lat: -30.0, lng: 137.0, type: "uranium", quantity: 10000, depletion_rate: 0.5 }, // Australia (Olympic Dam)

  // ── Diamonds ──
  { lat: -8.5, lng: 25.5, type: "diamonds", quantity: 5000, depletion_rate: 0.3 }, // DRC
  { lat: -22.0, lng: 24.0, type: "diamonds", quantity: 6000, depletion_rate: 0.3 }, // Botswana
  { lat: 62.0, lng: -114.0, type: "diamonds", quantity: 3000, depletion_rate: 0.3 }, // Canada (NWT)
  { lat: 62.0, lng: 110.0, type: "diamonds", quantity: 4000, depletion_rate: 0.3 }, // Russia (Yakutia)

  // ── Fertile Land (renewable, high quantity) ──
  { lat: 40.0, lng: -95.0, type: "fertile_land", quantity: 100000, depletion_rate: 0.1 }, // US Great Plains
  { lat: 50.0, lng: 35.0, type: "fertile_land", quantity: 90000, depletion_rate: 0.1 }, // Ukraine (Black Earth)
  { lat: 30.0, lng: 31.0, type: "fertile_land", quantity: 60000, depletion_rate: 0.2 }, // Nile Delta
  { lat: 25.0, lng: 85.0, type: "fertile_land", quantity: 80000, depletion_rate: 0.1 }, // Ganges Plain
  { lat: 30.0, lng: 115.0, type: "fertile_land", quantity: 70000, depletion_rate: 0.1 }, // Yangtze Delta
  { lat: -15.0, lng: -50.0, type: "fertile_land", quantity: 85000, depletion_rate: 0.1 }, // Brazil (Cerrado)
  { lat: -35.0, lng: -60.0, type: "fertile_land", quantity: 75000, depletion_rate: 0.1 }, // Argentina (Pampas)
  { lat: 48.0, lng: 2.0, type: "fertile_land", quantity: 50000, depletion_rate: 0.1 }, // France
  { lat: -37.0, lng: 145.0, type: "fertile_land", quantity: 40000, depletion_rate: 0.2 }, // SE Australia

  // ── Fresh Water ──
  { lat: 0.0, lng: -55.0, type: "fresh_water", quantity: 200000, depletion_rate: 0.05 }, // Amazon
  { lat: -2.0, lng: 33.0, type: "fresh_water", quantity: 150000, depletion_rate: 0.05 }, // Lake Victoria/Nile
  { lat: 47.0, lng: -85.0, type: "fresh_water", quantity: 180000, depletion_rate: 0.05 }, // Great Lakes
  { lat: 53.0, lng: 108.0, type: "fresh_water", quantity: 160000, depletion_rate: 0.05 }, // Lake Baikal
  { lat: 30.0, lng: 90.0, type: "fresh_water", quantity: 120000, depletion_rate: 0.05 }, // Tibetan Plateau (rivers source)
  { lat: 28.0, lng: 84.0, type: "fresh_water", quantity: 100000, depletion_rate: 0.05 }, // Ganges headwaters

  // ── Fish ──
  { lat: -15.0, lng: -75.0, type: "fish", quantity: 80000, depletion_rate: 0.2 }, // Peru (Humboldt Current)
  { lat: 55.0, lng: -5.0, type: "fish", quantity: 50000, depletion_rate: 0.2 }, // North Atlantic
  { lat: 45.0, lng: -55.0, type: "fish", quantity: 60000, depletion_rate: 0.2 }, // Grand Banks
  { lat: 35.0, lng: 140.0, type: "fish", quantity: 55000, depletion_rate: 0.2 }, // Japan/Pacific
  { lat: -45.0, lng: 170.0, type: "fish", quantity: 40000, depletion_rate: 0.2 }, // New Zealand
  { lat: 62.0, lng: -20.0, type: "fish", quantity: 45000, depletion_rate: 0.2 }, // Iceland

  // ── Timber ──
  { lat: 60.0, lng: 30.0, type: "timber", quantity: 120000, depletion_rate: 0.3 }, // Scandinavia/Russia boreal
  { lat: 55.0, lng: -125.0, type: "timber", quantity: 100000, depletion_rate: 0.3 }, // British Columbia
  { lat: -3.0, lng: -60.0, type: "timber", quantity: 150000, depletion_rate: 0.5 }, // Amazon rainforest
  { lat: 0.0, lng: 110.0, type: "timber", quantity: 100000, depletion_rate: 0.5 }, // Borneo
  { lat: -5.0, lng: 20.0, type: "timber", quantity: 90000, depletion_rate: 0.4 }, // Congo Basin
];

export async function seedResources(): Promise<void> {
  console.log("Seeding resource deposits...");

  for (const deposit of RESOURCE_DEPOSITS) {
    await query(
      `INSERT INTO resource_deposits (location, resource_type, quantity_total, quantity_remaining, depletion_rate)
       VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4, $4, $5)
       ON CONFLICT DO NOTHING`,
      [deposit.lng, deposit.lat, deposit.type, deposit.quantity, deposit.depletion_rate]
    );
  }

  console.log(`Seeded ${RESOURCE_DEPOSITS.length} resource deposits across Earth.`);
}

export async function runSeed(): Promise<void> {
  await seedResources();
  process.exit(0);
}

runSeed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
