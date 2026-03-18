/**
 * Territory Claim Validator
 *
 * This is the RULES ENGINE for territory claims. It does NOT accept or reject.
 * It analyzes the claim and returns a structured verdict that the agent must respond to.
 *
 * The validator checks:
 * 1. Are coordinates valid?
 * 2. Which coordinates are on land vs water?
 * 3. Does the claim overlap existing territories?
 * 4. What is the effective land area after removing water?
 * 5. Can the agent afford it?
 *
 * It returns a detailed report. The agent runner then decides what to do.
 */

import { isLand } from "./land-water.js";
import { areaKm2, centroid, polygonsOverlap } from "./geo.js";
import { query } from "../db/pool.js";

export interface ClaimVerdict {
  status: "accepted" | "partial" | "rejected";
  original_coords: [number, number][];
  adjusted_coords: [number, number][]; // Snapped to land where possible
  issues: ClaimIssue[];
  land_percentage: number;
  water_percentage: number;
  area_sq_km: number;
  center: [number, number]; // [lng, lat]
  cost: { minerals: number; food: number };
  conflicts: ClaimConflict[];
  summary: string; // Human-readable summary for the agent
}

export interface ClaimIssue {
  type: "water_point" | "too_large" | "too_small" | "invalid_coords" | "mostly_water" | "no_resources";
  message: string;
  severity: "error" | "warning";
}

export interface ClaimConflict {
  territory_id: number;
  nation_id: number;
  nation_name: string;
  overlap_description: string;
}

export async function validateClaim(
  nationId: number,
  rawCoords: [number, number][],
): Promise<ClaimVerdict> {
  const issues: ClaimIssue[] = [];
  const conflicts: ClaimConflict[] = [];

  // ── Step 1: Normalize coordinates ──
  const coords: [number, number][] = [];
  for (const c of rawCoords) {
    if (!Array.isArray(c) || c.length < 2) {
      issues.push({ type: "invalid_coords", message: "Invalid coordinate pair", severity: "error" });
      continue;
    }
    let a = Number(c[0]);
    let b = Number(c[1]);
    if (isNaN(a) || isNaN(b)) {
      issues.push({ type: "invalid_coords", message: `NaN coordinate: [${c[0]}, ${c[1]}]`, severity: "error" });
      continue;
    }

    // Auto-detect [lat, lng] vs [lng, lat]
    // Strategy: if first value > 90 or < -90, it must be longitude
    // If ambiguous (both within ±90), check which orientation puts us on land
    let lng = a, lat = b;
    if (Math.abs(a) > 90) {
      // a is definitely longitude (too large for lat)
      lng = a; lat = b;
    } else if (Math.abs(b) > 90) {
      // b is definitely longitude
      lng = b; lat = a;
    } else {
      // Both within ±90 — check land grid both ways, pick the one on land
      const wayA = isLand(b, a); // a=lng, b=lat
      const wayB = isLand(a, b); // a=lat, b=lng (swapped)
      if (!wayA && wayB) {
        lng = b; lat = a; // Swap — other way hits land
      }
      // If both on land or both in water, keep original (GeoJSON standard)
    }

    lng = Math.max(-180, Math.min(180, lng));
    lat = Math.max(-85, Math.min(85, lat));
    coords.push([lng, lat]);
  }

  if (coords.length < 4) {
    return {
      status: "rejected",
      original_coords: rawCoords,
      adjusted_coords: [],
      issues: [{ type: "invalid_coords", message: "Need at least 4 coordinate pairs to form a polygon", severity: "error" }],
      land_percentage: 0,
      water_percentage: 0,
      area_sq_km: 0,
      center: [0, 0],
      cost: { minerals: 0, food: 0 },
      conflicts: [],
      summary: "Rejected: not enough coordinates to form a polygon.",
    };
  }

  // ── Step 2: Size check ──
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  const lngSpan = Math.max(...lngs) - Math.min(...lngs);
  const latSpan = Math.max(...lats) - Math.min(...lats);

  if (lngSpan > 0.5 || latSpan > 0.5) {
    issues.push({
      type: "too_large",
      message: `Coordinate span ${lngSpan.toFixed(2)}° × ${latSpan.toFixed(2)}° is too large. Max 0.5° in any direction (~50km). Start small.`,
      severity: "error",
    });
  }

  // Close polygon
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([...first] as [number, number]);
  }

  // ── Step 3: Land/water analysis for every coordinate ──
  const adjustedCoords: [number, number][] = [];
  let waterPointCount = 0;

  for (const [lng, lat] of coords) {
    if (isLand(lat, lng)) {
      adjustedCoords.push([lng, lat]);
    } else {
      waterPointCount++;
      // Try to snap to nearest land
      const snapped = snapToLand(lat, lng);
      if (snapped) {
        adjustedCoords.push([snapped[1], snapped[0]]); // [lng, lat]
        issues.push({
          type: "water_point",
          message: `Point [${lng.toFixed(3)}, ${lat.toFixed(3)}] is in water — snapped to land at [${snapped[1].toFixed(3)}, ${snapped[0].toFixed(3)}]`,
          severity: "warning",
        });
      } else {
        adjustedCoords.push([lng, lat]); // Keep as-is, will affect land percentage
        issues.push({
          type: "water_point",
          message: `Point [${lng.toFixed(3)}, ${lat.toFixed(3)}] is in water and no nearby land found`,
          severity: "warning",
        });
      }
    }
  }

  // ── Step 4: Interior land percentage ──
  const minLng = Math.min(...adjustedCoords.map(c => c[0]));
  const maxLng = Math.max(...adjustedCoords.map(c => c[0]));
  const minLat = Math.min(...adjustedCoords.map(c => c[1]));
  const maxLat = Math.max(...adjustedCoords.map(c => c[1]));

  let landSamples = 0, totalSamples = 0;
  const sampleStep = Math.max(0.02, Math.min(lngSpan, latSpan) / 10);
  for (let sLat = minLat; sLat <= maxLat; sLat += sampleStep) {
    for (let sLng = minLng; sLng <= maxLng; sLng += sampleStep) {
      totalSamples++;
      if (isLand(sLat, sLng)) landSamples++;
    }
  }
  const landPct = totalSamples > 0 ? landSamples / totalSamples : 0;
  const waterPct = 1 - landPct;

  if (landPct < 0.5) {
    issues.push({
      type: "mostly_water",
      message: `Claim is ${(waterPct * 100).toFixed(0)}% water and only ${(landPct * 100).toFixed(0)}% land. Move your claim further inland — territory must be at least 50% land.`,
      severity: "error",
    });
  } else if (landPct < 0.7) {
    issues.push({
      type: "mostly_water",
      message: `Claim is ${(waterPct * 100).toFixed(0)}% water. Territory border will be adjusted to follow the coastline.`,
      severity: "warning",
    });
  }

  // ── Step 5: Area calculation ──
  let areaSqKm = 0;
  let ctr: [number, number] = [0, 0];
  try {
    areaSqKm = areaKm2(adjustedCoords);
    ctr = centroid(adjustedCoords);
  } catch {
    issues.push({ type: "invalid_coords", message: "Could not calculate area — invalid polygon shape", severity: "error" });
  }

  // No hard area cap — the population-based cap below handles this mathematically
  if (areaSqKm < 0.5 && areaSqKm > 0) {
    issues.push({ type: "too_small", message: `Area ${areaSqKm.toFixed(2)} km² is very small. Try coordinates 0.1-0.5° apart.`, severity: "warning" });
  }

  // ── Step 6: Overlap check ──
  const existingClaims = await query(
    "SELECT tc.id, tc.nation_id, tc.polygon, tc.center_lat, tc.center_lng, n.name FROM territory_claims tc JOIN nations n ON tc.nation_id = n.id"
  );

  for (const existing of existingClaims.rows) {
    const ePoly = existing.polygon as [number, number][];
    const eLngs = ePoly.map((c: [number, number]) => c[0]);
    const eLats = ePoly.map((c: [number, number]) => c[1]);

    // Quick bounding box rejection
    if (maxLng < Math.min(...eLngs) || minLng > Math.max(...eLngs) ||
        maxLat < Math.min(...eLats) || minLat > Math.max(...eLats)) {
      continue;
    }

    // Precise overlap check
    try {
      if (polygonsOverlap(adjustedCoords, ePoly)) {
        conflicts.push({
          territory_id: existing.id,
          nation_id: existing.nation_id,
          nation_name: existing.name,
          overlap_description: `Your claim overlaps with ${existing.name}'s territory #${existing.id} near (${existing.center_lat.toFixed(2)}°, ${existing.center_lng.toFixed(2)}°)`,
        });
      }
    } catch {
      // Geometry error — skip
    }
  }

  // ── Step 6b: Population-based territory cap ──
  // Each person can only manage so much land. More people + education = more land.
  const nationData = await query(
    `SELECT pop_working, pop_elderly, pop_education,
            (SELECT COALESCE(SUM(area_sq_km), 0) FROM territory_claims WHERE nation_id = $1) as current_area
     FROM nations WHERE id = $1`,
    [nationId]
  );
  if (nationData.rows.length > 0) {
    const nd = nationData.rows[0];
    const working = nd.pop_working || 0;
    const elderly = nd.pop_elderly || 0;
    const education = nd.pop_education || 0;
    const currentArea = parseFloat(nd.current_area) || 0;

    // max_territory = (working × 2 × (1 + education)) + (elderly × 0.5)
    const maxTerritory = (working * 2 * (1 + education)) + (elderly * 0.5);
    const newTotalArea = currentArea + areaSqKm;

    if (newTotalArea > maxTerritory) {
      issues.push({
        type: "too_large",
        message: `Population territory cap exceeded. Your ${working} workers + ${elderly} elderly at ${(education * 100).toFixed(0)}% education can manage ${maxTerritory.toFixed(0)} km². You already control ${currentArea.toFixed(0)} km². This claim of ${areaSqKm.toFixed(0)} km² would put you at ${newTotalArea.toFixed(0)} km². Grow your population or improve education first.`,
        severity: "error",
      });
    }
  }

  // ── Step 6c: Water kills humans ──
  // If claim is majority water, the population would drown
  if (landPct < 0.5) {
    issues.push({
      type: "mostly_water",
      message: `FATAL: ${(waterPct * 100).toFixed(0)}% of this territory is water. Your people cannot survive in the ocean. Claiming this would kill your population. Move inland immediately.`,
      severity: "error",
    });
  }

  // ── Step 7: Cost calculation ──
  const effectiveArea = areaSqKm * landPct; // Only pay for land portion
  const cost = {
    minerals: Math.max(5, Math.floor(effectiveArea * 0.2)),
    food: Math.max(5, Math.floor(effectiveArea * 0.1)),
  };

  // Check affordability
  const nation = await query(
    "SELECT minerals_stockpile, food_stockpile FROM nations WHERE id = $1",
    [nationId]
  );
  const n = nation.rows[0];
  const canAfford = n && n.minerals_stockpile >= cost.minerals && n.food_stockpile >= cost.food;

  // ── Step 8: Determine verdict ──
  const hasErrors = issues.some(i => i.severity === "error");
  const hasConflicts = conflicts.length > 0;

  let status: "accepted" | "partial" | "rejected";
  let summary: string;

  if (hasErrors) {
    status = "rejected";
    const errorMsgs = issues.filter(i => i.severity === "error").map(i => i.message);
    summary = `REJECTED: ${errorMsgs.join(". ")}`;
  } else if (hasConflicts) {
    status = "partial";
    const conflictNames = conflicts.map(c => c.nation_name).join(", ");
    summary = `CONFLICT: Your claim overlaps with ${conflictNames}. You can: (1) adjust coordinates to avoid overlap, (2) negotiate with them, or (3) declare war to contest the territory. The overlapping portion cannot be claimed peacefully.`;
  } else if (!canAfford) {
    status = "rejected";
    summary = `REJECTED: Insufficient resources. Need ${cost.minerals} minerals + ${cost.food} food. You have ${n?.minerals_stockpile?.toFixed(0) ?? 0} minerals + ${n?.food_stockpile?.toFixed(0) ?? 0} food. Build mines and farms first.`;
  } else if (waterPct > 0.5) {
    status = "partial";
    summary = `PARTIAL: ${(waterPct * 100).toFixed(0)}% of your claim is water. Territory border adjusted to follow the coastline. Effective land area: ${effectiveArea.toFixed(0)} km². Cost: ${cost.minerals} minerals + ${cost.food} food.`;
  } else {
    status = "accepted";
    summary = `ACCEPTED: ${areaSqKm.toFixed(0)} km² (${(landPct * 100).toFixed(0)}% land). Cost: ${cost.minerals} minerals + ${cost.food} food.`;
  }

  return {
    status,
    original_coords: rawCoords,
    adjusted_coords: adjustedCoords,
    issues,
    land_percentage: landPct,
    water_percentage: waterPct,
    area_sq_km: areaSqKm,
    center: ctr,
    cost,
    conflicts,
    summary,
  };
}

/**
 * Find nearest land point to a water coordinate.
 */
function snapToLand(lat: number, lng: number): [number, number] | null {
  for (let r = 1; r <= 5; r++) {
    const step = r * 0.1;
    const offsets: [number, number][] = [
      [0, step], [step, 0], [0, -step], [-step, 0],
      [step, step], [-step, -step], [step, -step], [-step, step],
    ];
    for (const [dlng, dlat] of offsets) {
      if (isLand(lat + dlat, lng + dlng)) {
        return [lat + dlat, lng + dlng];
      }
    }
  }
  return null;
}
