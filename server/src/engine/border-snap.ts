/**
 * Border Snapping Engine
 *
 * Takes a crude polygon from an agent and produces natural-looking borders
 * by snapping to nearby real-world geographic features (coastlines, rivers,
 * mountain ridges) from the Natural Earth dataset.
 *
 * Process:
 * 1. Load all boundary segments from earth-borders.json
 * 2. When an agent claims territory, find nearby boundary segments
 * 3. Replace straight edges with segments from the natural geometry
 * 4. Result: borders that follow real topography
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface BoundarySegment {
  points: [number, number][]; // [lng, lat] pairs
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

let _segments: BoundarySegment[] | null = null;

/**
 * Load and index all boundary segments from Natural Earth data.
 * Each segment is a portion of a country border, broken into manageable chunks.
 */
function loadSegments(): BoundarySegment[] {
  if (_segments) return _segments;

  console.log("[BorderSnap] Loading earth boundary segments...");
  const raw = JSON.parse(
    readFileSync(join(__dirname, "..", "data", "earth-borders.json"), "utf-8")
  );

  _segments = [];

  for (const feature of raw.features) {
    const geom = feature.geometry;
    let rings: [number, number][][] = [];

    if (geom.type === "Polygon") {
      rings = geom.coordinates as [number, number][][];
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) {
        rings.push(...(poly as [number, number][][]));
      }
    }

    // Break each ring into segments of ~20 points for efficient spatial lookup
    for (const ring of rings) {
      const chunkSize = 20;
      for (let i = 0; i < ring.length; i += chunkSize - 1) {
        const chunk = ring.slice(i, i + chunkSize);
        if (chunk.length < 3) continue;

        const lngs = chunk.map(p => p[0]);
        const lats = chunk.map(p => p[1]);

        _segments.push({
          points: chunk,
          minLat: Math.min(...lats),
          maxLat: Math.max(...lats),
          minLng: Math.min(...lngs),
          maxLng: Math.max(...lngs),
        });
      }
    }
  }

  console.log(`[BorderSnap] Loaded ${_segments.length} boundary segments`);
  return _segments;
}

/**
 * Find boundary segments near a given bounding box.
 */
function findNearbySegments(
  minLat: number, maxLat: number, minLng: number, maxLng: number,
  buffer: number = 0.5
): BoundarySegment[] {
  const segments = loadSegments();
  const bMinLat = minLat - buffer;
  const bMaxLat = maxLat + buffer;
  const bMinLng = minLng - buffer;
  const bMaxLng = maxLng + buffer;

  return segments.filter(s =>
    s.maxLat >= bMinLat && s.minLat <= bMaxLat &&
    s.maxLng >= bMinLng && s.minLng <= bMaxLng
  );
}

/**
 * Snap a crude polygon to natural borders.
 *
 * For each edge of the input polygon, find the nearest natural boundary
 * segment and replace the straight edge with points from the natural geometry.
 */
export function snapToNaturalBorders(coords: [number, number][]): [number, number][] {
  // Get bounding box of input polygon
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Find nearby natural boundary segments
  const nearby = findNearbySegments(minLat, maxLat, minLng, maxLng);

  if (nearby.length === 0) {
    // No natural borders nearby — just add organic jitter
    return addOrganicJitter(coords);
  }

  // Build the output polygon by walking each edge and snapping to nearby segments
  const result: [number, number][] = [];

  // Remove closing point if present
  let points = [...coords];
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      points = points.slice(0, -1);
    }
  }

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];

    result.push(curr);

    // Find the best natural segment to follow between curr and next
    const edgeMidLng = (curr[0] + next[0]) / 2;
    const edgeMidLat = (curr[1] + next[1]) / 2;
    const edgeLen = Math.sqrt(
      Math.pow(next[0] - curr[0], 2) + Math.pow(next[1] - curr[1], 2)
    );

    // Find closest segment to this edge's midpoint
    let bestSegment: BoundarySegment | null = null;
    let bestDist = Infinity;

    for (const seg of nearby) {
      const segMidIdx = Math.floor(seg.points.length / 2);
      const segMid = seg.points[segMidIdx];
      const dist = Math.sqrt(
        Math.pow(segMid[0] - edgeMidLng, 2) + Math.pow(segMid[1] - edgeMidLat, 2)
      );

      // Only use segments that are close (within ~0.5° of the edge) and similar length
      if (dist < 0.5 && dist < bestDist) {
        bestDist = dist;
        bestSegment = seg;
      }
    }

    if (bestSegment && edgeLen > 0.02) {
      // Extract points from the natural segment that fall between curr and next
      const naturalPoints = extractRelevantPoints(bestSegment.points, curr, next);
      for (const np of naturalPoints) {
        result.push(np);
      }
    } else {
      // No natural segment found — add subtle organic jitter
      const numMid = Math.max(1, Math.floor(edgeLen * 15));
      for (let j = 1; j <= numMid; j++) {
        const t = j / (numMid + 1);
        const midLng = curr[0] + (next[0] - curr[0]) * t;
        const midLat = curr[1] + (next[1] - curr[1]) * t;

        // Small perpendicular jitter
        const dx = next[0] - curr[0];
        const dy = next[1] - curr[1];
        const perpLen = Math.sqrt(dx * dx + dy * dy) || 1;
        const jitter = (Math.random() - 0.5) * edgeLen * 0.06;

        result.push([
          midLng + (-dy / perpLen) * jitter,
          midLat + (dx / perpLen) * jitter,
        ]);
      }
    }
  }

  // Close polygon
  result.push([...result[0]] as [number, number]);

  return result;
}

/**
 * Extract points from a natural segment that are relevant to
 * the edge between two polygon vertices.
 */
function extractRelevantPoints(
  segPoints: [number, number][],
  from: [number, number],
  to: [number, number]
): [number, number][] {
  // Project segment points onto the line from->to
  // Keep points that fall between from and to and are close to the line
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.0001) return [];

  const relevant: Array<{ point: [number, number]; t: number }> = [];

  for (const p of segPoints) {
    // Project onto line
    const t = ((p[0] - from[0]) * dx + (p[1] - from[1]) * dy) / lenSq;

    // Only keep points between 10% and 90% of the edge (leave endpoints to the polygon)
    if (t < 0.1 || t > 0.9) continue;

    // Check distance from line (reject if too far)
    const projLng = from[0] + t * dx;
    const projLat = from[1] + t * dy;
    const dist = Math.sqrt(Math.pow(p[0] - projLng, 2) + Math.pow(p[1] - projLat, 2));

    if (dist < 0.3) { // Within ~30km of the straight line
      relevant.push({ point: p, t });
    }
  }

  // Sort by position along the edge
  relevant.sort((a, b) => a.t - b.t);

  // Limit to ~5 points to avoid over-detailing
  const step = Math.max(1, Math.floor(relevant.length / 5));
  return relevant.filter((_, i) => i % step === 0).map(r => r.point);
}

/**
 * Add organic jitter to a polygon when no natural borders are available.
 */
function addOrganicJitter(coords: [number, number][]): [number, number][] {
  const result: [number, number][] = [];
  let points = [...coords];
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    points = points.slice(0, -1);
  }

  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    result.push(curr);

    const dx = next[0] - curr[0];
    const dy = next[1] - curr[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    const numMid = Math.max(2, Math.floor(len * 20));

    for (let j = 1; j <= numMid; j++) {
      const t = j / (numMid + 1);
      const perpLen = len || 1;
      const jitter = (Math.random() - 0.5) * len * 0.07;
      result.push([
        curr[0] + dx * t + (-dy / perpLen) * jitter,
        curr[1] + dy * t + (dx / perpLen) * jitter,
      ]);
    }
  }

  result.push([...result[0]] as [number, number]);
  return result;
}
