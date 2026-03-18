/**
 * Seed resource deposits into the database (no PostGIS required).
 * Uses plain lat/lng columns.
 */

import { query } from "./pool.js";

interface Deposit {
  lat: number;
  lng: number;
  type: string;
  quantity: number;
  depletion: number;
}

// A representative subset of real-world resource locations
const DEPOSITS: Deposit[] = [
  // Oil
  { lat: 26.0, lng: 50.5, type: "oil", quantity: 50000, depletion: 2.0 },
  { lat: 28.5, lng: 48.0, type: "oil", quantity: 40000, depletion: 2.0 },
  { lat: 61.0, lng: 73.0, type: "oil", quantity: 35000, depletion: 2.0 },
  { lat: 31.0, lng: -94.0, type: "oil", quantity: 20000, depletion: 2.5 },
  { lat: 56.7, lng: -111.4, type: "oil", quantity: 25000, depletion: 3.0 },
  { lat: 8.0, lng: -66.0, type: "oil", quantity: 30000, depletion: 2.0 },
  { lat: 4.5, lng: 7.0, type: "oil", quantity: 20000, depletion: 2.0 },
  { lat: 58.0, lng: 1.5, type: "oil", quantity: 12000, depletion: 3.0 },
  // Coal
  { lat: 39.0, lng: 113.0, type: "coal", quantity: 60000, depletion: 3.0 },
  { lat: 37.5, lng: -81.5, type: "coal", quantity: 30000, depletion: 3.0 },
  { lat: -26.0, lng: 29.5, type: "coal", quantity: 25000, depletion: 2.5 },
  { lat: 54.0, lng: 86.0, type: "coal", quantity: 40000, depletion: 2.5 },
  // Iron
  { lat: -20.0, lng: -43.5, type: "iron", quantity: 40000, depletion: 2.0 },
  { lat: -23.0, lng: 119.0, type: "iron", quantity: 45000, depletion: 2.0 },
  { lat: 22.0, lng: 85.0, type: "iron", quantity: 18000, depletion: 1.5 },
  { lat: 50.5, lng: 36.0, type: "iron", quantity: 20000, depletion: 1.5 },
  // Copper
  { lat: -22.0, lng: -68.5, type: "copper", quantity: 25000, depletion: 1.5 },
  { lat: -12.0, lng: 28.0, type: "copper", quantity: 20000, depletion: 1.5 },
  { lat: 40.0, lng: -111.0, type: "copper", quantity: 12000, depletion: 2.0 },
  // Gold
  { lat: -26.2, lng: 27.8, type: "gold", quantity: 8000, depletion: 0.5 },
  { lat: 6.0, lng: -2.0, type: "gold", quantity: 5000, depletion: 0.5 },
  { lat: -30.0, lng: 121.0, type: "gold", quantity: 6000, depletion: 0.5 },
  // Lithium
  { lat: -23.5, lng: -68.0, type: "lithium", quantity: 15000, depletion: 1.0 },
  { lat: -20.5, lng: -67.5, type: "lithium", quantity: 12000, depletion: 1.0 },
  // Fertile Land (many, spread globally)
  { lat: 40.0, lng: -95.0, type: "fertile_land", quantity: 100000, depletion: 0.1 },
  { lat: 50.0, lng: 35.0, type: "fertile_land", quantity: 90000, depletion: 0.1 },
  { lat: 30.0, lng: 31.0, type: "fertile_land", quantity: 60000, depletion: 0.2 },
  { lat: 25.0, lng: 85.0, type: "fertile_land", quantity: 80000, depletion: 0.1 },
  { lat: 30.0, lng: 115.0, type: "fertile_land", quantity: 70000, depletion: 0.1 },
  { lat: -15.0, lng: -50.0, type: "fertile_land", quantity: 85000, depletion: 0.1 },
  { lat: -35.0, lng: -60.0, type: "fertile_land", quantity: 75000, depletion: 0.1 },
  { lat: 48.0, lng: 2.0, type: "fertile_land", quantity: 50000, depletion: 0.1 },
  { lat: 35.0, lng: 33.0, type: "fertile_land", quantity: 30000, depletion: 0.15 },
  { lat: 10.0, lng: 105.0, type: "fertile_land", quantity: 45000, depletion: 0.1 },
  { lat: -37.0, lng: 145.0, type: "fertile_land", quantity: 40000, depletion: 0.2 },
  { lat: 5.0, lng: 8.0, type: "fertile_land", quantity: 35000, depletion: 0.15 },
  { lat: -3.0, lng: 37.0, type: "fertile_land", quantity: 30000, depletion: 0.15 },
  // Fresh Water (critical — most entries)
  { lat: 47.0, lng: -85.0, type: "fresh_water", quantity: 180000, depletion: 0.05 },
  { lat: 0.0, lng: -55.0, type: "fresh_water", quantity: 200000, depletion: 0.05 },
  { lat: -2.0, lng: 33.0, type: "fresh_water", quantity: 150000, depletion: 0.05 },
  { lat: 53.0, lng: 108.0, type: "fresh_water", quantity: 160000, depletion: 0.05 },
  { lat: 30.0, lng: 90.0, type: "fresh_water", quantity: 120000, depletion: 0.05 },
  { lat: 48.0, lng: 8.0, type: "fresh_water", quantity: 80000, depletion: 0.05 },
  { lat: 45.0, lng: 20.0, type: "fresh_water", quantity: 70000, depletion: 0.05 },
  { lat: 50.0, lng: 40.0, type: "fresh_water", quantity: 90000, depletion: 0.05 },
  { lat: 25.0, lng: 80.0, type: "fresh_water", quantity: 100000, depletion: 0.05 },
  { lat: 30.0, lng: 110.0, type: "fresh_water", quantity: 85000, depletion: 0.05 },
  { lat: 15.0, lng: 100.0, type: "fresh_water", quantity: 60000, depletion: 0.05 },
  { lat: -33.0, lng: 145.0, type: "fresh_water", quantity: 50000, depletion: 0.05 },
  { lat: 10.0, lng: -70.0, type: "fresh_water", quantity: 70000, depletion: 0.05 },
  { lat: 35.0, lng: 45.0, type: "fresh_water", quantity: 65000, depletion: 0.05 },
  { lat: -25.0, lng: -55.0, type: "fresh_water", quantity: 75000, depletion: 0.05 },
  { lat: 60.0, lng: 75.0, type: "fresh_water", quantity: 90000, depletion: 0.05 },
  // Fish
  { lat: -15.0, lng: -75.0, type: "fish", quantity: 80000, depletion: 0.2 },
  { lat: 55.0, lng: -5.0, type: "fish", quantity: 50000, depletion: 0.2 },
  { lat: 45.0, lng: -55.0, type: "fish", quantity: 60000, depletion: 0.2 },
  { lat: 35.0, lng: 140.0, type: "fish", quantity: 55000, depletion: 0.2 },
  { lat: 62.0, lng: -20.0, type: "fish", quantity: 45000, depletion: 0.2 },
  { lat: -45.0, lng: 170.0, type: "fish", quantity: 40000, depletion: 0.2 },
  // Timber
  { lat: 60.0, lng: 30.0, type: "timber", quantity: 120000, depletion: 0.3 },
  { lat: 55.0, lng: -125.0, type: "timber", quantity: 100000, depletion: 0.3 },
  { lat: -3.0, lng: -60.0, type: "timber", quantity: 150000, depletion: 0.5 },
  { lat: 0.0, lng: 110.0, type: "timber", quantity: 100000, depletion: 0.5 },
  { lat: -5.0, lng: 20.0, type: "timber", quantity: 90000, depletion: 0.4 },
  { lat: 50.0, lng: 90.0, type: "timber", quantity: 80000, depletion: 0.3 },
];

async function seed() {
  console.log("Seeding resources...");

  for (const d of DEPOSITS) {
    await query(
      `INSERT INTO resource_deposits (lat, lng, resource_type, quantity_total, quantity_remaining, depletion_rate)
       VALUES ($1, $2, $3, $4, $4, $5)`,
      [d.lat, d.lng, d.type, d.quantity, d.depletion]
    );
  }

  console.log(`Seeded ${DEPOSITS.length} resource deposits.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
