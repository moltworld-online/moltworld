/**
 * Geometry utilities using @turf/turf instead of PostGIS.
 * Handles polygon operations, point-in-polygon, area calculations, etc.
 */

import * as turf from "@turf/turf";
import type { Feature, Polygon, Point } from "geojson";

/**
 * Create a GeoJSON polygon from coordinate pairs [[lng, lat], ...]
 */
export function makePolygon(coords: [number, number][]): Feature<Polygon> {
  // Ensure closed
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords = [...coords, [...first] as [number, number]];
  }
  return turf.polygon([coords]);
}

/**
 * Calculate area of a polygon in square kilometers.
 */
export function areaKm2(coords: [number, number][]): number {
  const poly = makePolygon(coords);
  return turf.area(poly) / 1_000_000; // m² to km²
}

/**
 * Get centroid of a polygon.
 */
export function centroid(coords: [number, number][]): [number, number] {
  const poly = makePolygon(coords);
  const c = turf.centroid(poly);
  return c.geometry.coordinates as [number, number];
}

/**
 * Check if a point [lng, lat] is inside a polygon.
 */
export function pointInPolygon(point: [number, number], polyCoords: [number, number][]): boolean {
  const pt = turf.point(point);
  const poly = makePolygon(polyCoords);
  return turf.booleanPointInPolygon(pt, poly);
}

/**
 * Check if two polygons overlap.
 */
export function polygonsOverlap(a: [number, number][], b: [number, number][]): boolean {
  const polyA = makePolygon(a);
  const polyB = makePolygon(b);
  try {
    const intersection = turf.intersect(turf.featureCollection([polyA, polyB]));
    return intersection !== null;
  } catch {
    return false;
  }
}

/**
 * Distance between two points in kilometers.
 */
export function distanceKm(a: [number, number], b: [number, number]): number {
  return turf.distance(turf.point(a), turf.point(b), { units: "kilometers" });
}

/**
 * Check if a point is within `radiusKm` of a polygon's centroid.
 */
export function isNearby(point: [number, number], polyCoords: [number, number][], radiusKm: number): boolean {
  const c = centroid(polyCoords);
  return distanceKm(point, c) <= radiusKm;
}

/**
 * Naturalize a polygon — take a crude rectangle/polygon and make it look organic.
 * Adds intermediate points between vertices with slight random offsets
 * to create natural-looking borders (like rivers, ridgelines, etc.)
 */
export function naturalizePolygon(coords: [number, number][]): [number, number][] {
  if (coords.length < 4) return coords;

  // Remove closing point if present
  let points = [...coords];
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    points = points.slice(0, -1);
  }

  const result: [number, number][] = [];

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];

    result.push(curr);

    // Add 3-6 intermediate points between each pair of vertices
    const segDist = Math.sqrt(
      Math.pow(next[0] - curr[0], 2) + Math.pow(next[1] - curr[1], 2)
    );
    const numMidpoints = Math.max(2, Math.min(6, Math.floor(segDist * 3)));

    for (let j = 1; j <= numMidpoints; j++) {
      const t = j / (numMidpoints + 1);
      const midLng = curr[0] + (next[0] - curr[0]) * t;
      const midLat = curr[1] + (next[1] - curr[1]) * t;

      // Perpendicular offset for natural look
      const dx = next[0] - curr[0];
      const dy = next[1] - curr[1];
      const perpX = -dy;
      const perpY = dx;
      const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;

      // Random offset perpendicular to the edge (scaled by segment length)
      const jitter = (Math.random() - 0.5) * segDist * 0.08;
      const offsetLng = midLng + (perpX / perpLen) * jitter;
      const offsetLat = midLat + (perpY / perpLen) * jitter;

      result.push([offsetLng, offsetLat]);
    }
  }

  // Close the polygon
  result.push([...result[0]] as [number, number]);

  return result;
}
