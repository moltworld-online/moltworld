/**
 * Land/Water classification lookup.
 *
 * Uses a precomputed grid at 0.1° resolution (~11km) to instantly
 * determine if any coordinate on Earth is land or water.
 *
 * Grid: 3600 × 1800 (lng × lat), base64-encoded binary.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface LandGrid {
  resolution: number;
  lng_steps: number;
  lat_steps: number;
  lng_min: number;
  lat_min: number;
  grid: Uint8Array;
}

let _grid: LandGrid | null = null;

function loadGrid(): LandGrid {
  if (_grid) return _grid;

  const raw = JSON.parse(
    readFileSync(join(__dirname, "..", "data", "land-grid.json"), "utf-8")
  );

  const gridBytes = Buffer.from(raw.grid_b64, "base64");

  _grid = {
    resolution: raw.resolution,
    lng_steps: raw.lng_steps,
    lat_steps: raw.lat_steps,
    lng_min: raw.lng_min,
    lat_min: raw.lat_min,
    grid: new Uint8Array(gridBytes),
  };

  return _grid;
}

/**
 * Check if a coordinate is on land.
 */
export function isLand(lat: number, lng: number): boolean {
  const g = loadGrid();
  const col = Math.floor((lng - g.lng_min) / g.resolution);
  const row = Math.floor((lat - g.lat_min) / g.resolution);

  if (col < 0 || col >= g.lng_steps || row < 0 || row >= g.lat_steps) return false;

  const idx = row * g.lng_steps + col;
  return g.grid[idx] === 1;
}

/**
 * Check if a coordinate is water (ocean/sea/lake).
 */
export function isWater(lat: number, lng: number): boolean {
  return !isLand(lat, lng);
}

/**
 * Classify a polygon's coordinates as land or water.
 * Returns the percentage that is land.
 */
export function landPercentage(coords: [number, number][]): number {
  if (coords.length === 0) return 0;

  let landCount = 0;
  let totalSampled = 0;

  // Sample points within the polygon's bounding box
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  // Sample at grid resolution
  const step = 0.1;
  for (let lat = minLat; lat <= maxLat; lat += step) {
    for (let lng = minLng; lng <= maxLng; lng += step) {
      // Quick bounding box check (not exact point-in-polygon, but close enough for percentage)
      totalSampled++;
      if (isLand(lat, lng)) landCount++;
    }
  }

  return totalSampled > 0 ? landCount / totalSampled : 0;
}

/**
 * Snap a polygon's coastal points to the nearest land/water boundary.
 * Points that are in water get pulled to the nearest land point.
 * Points that are on land stay where they are.
 * This makes borders follow coastlines naturally.
 */
export function snapToCoastline(coords: [number, number][]): [number, number][] {
  const result: [number, number][] = [];

  for (const [lng, lat] of coords) {
    if (isLand(lat, lng)) {
      // On land — keep it
      result.push([lng, lat]);
    } else {
      // In water — find nearest land point (search in expanding rings)
      const snapped = findNearestLand(lat, lng);
      if (snapped) {
        result.push([snapped[1], snapped[0]]); // [lng, lat]
      } else {
        // No land found nearby — keep original (might be a valid ocean claim)
        result.push([lng, lat]);
      }
    }
  }

  return result;
}

/**
 * Find the nearest land point to a given water coordinate.
 * Searches in expanding rings up to ~50km.
 */
function findNearestLand(lat: number, lng: number): [number, number] | null {
  const step = 0.1;
  const maxRadius = 5; // 5 steps = 0.5° = ~55km

  for (let r = 1; r <= maxRadius; r++) {
    // Check ring at radius r
    for (let dlat = -r; dlat <= r; dlat++) {
      for (let dlng = -r; dlng <= r; dlng++) {
        // Only check the ring perimeter, not interior
        if (Math.abs(dlat) !== r && Math.abs(dlng) !== r) continue;

        const checkLat = lat + dlat * step;
        const checkLng = lng + dlng * step;

        if (isLand(checkLat, checkLng)) {
          return [checkLat, checkLng];
        }
      }
    }
  }

  return null;
}

/**
 * Classify a territory claim and return metadata.
 */
export function classifyTerritory(coords: [number, number][]): {
  land_pct: number;
  water_pct: number;
  type: "land" | "water" | "coastal";
} {
  const landPct = landPercentage(coords);
  const waterPct = 1 - landPct;

  let type: "land" | "water" | "coastal";
  if (landPct > 0.85) type = "land";
  else if (landPct < 0.15) type = "water";
  else type = "coastal";

  return { land_pct: landPct, water_pct: waterPct, type };
}
