"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { MapContainer, TileLayer, GeoJSON, Rectangle, Tooltip, CircleMarker, Marker, useMap } from "react-leaflet";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { RESOURCE_REGIONS, RESOURCE_COLORS, RESOURCE_LABELS, quantityOpacity } from "@/lib/resources";

// ── Tectonic hotspots ──
const TECTONIC = [
  { lat: 35.7, lng: 139.7, name: "Ring of Fire (Japan)", risk: 0.9 },
  { lat: -8.5, lng: 115.3, name: "Indonesian Subduction Zone", risk: 0.9 },
  { lat: 37.8, lng: -122.4, name: "San Andreas Fault", risk: 0.8 },
  { lat: 28.2, lng: 84.7, name: "Himalayan Collision Zone", risk: 0.85 },
  { lat: 38.7, lng: 20.7, name: "Hellenic Arc", risk: 0.6 },
  { lat: -33.4, lng: -70.6, name: "Chilean Subduction Zone", risk: 0.85 },
  { lat: 14.6, lng: -90.5, name: "Central American Volcanic Arc", risk: 0.7 },
  { lat: 64.1, lng: -21.9, name: "Mid-Atlantic Ridge (Iceland)", risk: 0.5 },
  { lat: -41.3, lng: 174.8, name: "Alpine Fault (New Zealand)", risk: 0.7 },
  { lat: 40.8, lng: 30.0, name: "North Anatolian Fault", risk: 0.8 },
  { lat: -17.8, lng: -65.3, name: "Nazca Plate Boundary", risk: 0.75 },
  { lat: 13.4, lng: 144.8, name: "Mariana Trench", risk: 0.6 },
  { lat: 60.5, lng: -152.5, name: "Aleutian Trench", risk: 0.7 },
  { lat: 15.0, lng: 120.0, name: "Philippine Trench", risk: 0.8 },
  { lat: 45.5, lng: 152.0, name: "Kuril-Kamchatka Trench", risk: 0.75 },
  { lat: -6.0, lng: 29.0, name: "East African Rift", risk: 0.5 },
  { lat: 36.0, lng: 70.0, name: "Hindu Kush Seismic Zone", risk: 0.7 },
];

const CLIMATE_BANDS = [
  { name: "Arctic", lat_min: 66.5, lat_max: 90, color: "#0d1b2a" },
  { name: "Subarctic", lat_min: 55, lat_max: 66.5, color: "#1b2838" },
  { name: "Temperate", lat_min: 35, lat_max: 55, color: "#1a3a2a" },
  { name: "Subtropical", lat_min: 23.5, lat_max: 35, color: "#2a4a20" },
  { name: "Tropical", lat_min: -23.5, lat_max: 23.5, color: "#3a5a18" },
  { name: "Subtropical S", lat_min: -35, lat_max: -23.5, color: "#2a4a20" },
  { name: "Temperate S", lat_min: -55, lat_max: -35, color: "#1a3a2a" },
  { name: "Subantarctic", lat_min: -66.5, lat_max: -55, color: "#1b2838" },
  { name: "Antarctic", lat_min: -90, lat_max: -66.5, color: "#0d1b2a" },
];

interface TerritoryProps {
  claim_id: number;
  cell_id: number;
  nation_id: number;
  nation_name: string;
  nation_color: string;
  area_sq_km: number;
  area_km2: number;
  claimed_tick: number;
  improvements: Array<{ type: string; level: number }>;
}

// All possible resource type filters
const RESOURCE_TYPES = ["water", "fertile", "timber", "iron", "copper", "coal", "oil", "gold", "lithium", "fish"];

// Helper to compute nation centroids from territory features
function computeNationCentroids(features: Feature[]): Array<{ nation_id: number; nation_name: string; nation_color: string; lat: number; lng: number; total_area: number }> {
  const nationMap = new Map<number, { name: string; color: string; lats: number[]; lngs: number[]; area: number }>();

  for (const f of features) {
    const p = f.properties as TerritoryProps;
    if (!p) continue;
    let entry = nationMap.get(p.nation_id);
    if (!entry) {
      entry = { name: p.nation_name, color: p.nation_color, lats: [], lngs: [], area: 0 };
      nationMap.set(p.nation_id, entry);
    }
    entry.area += (p.area_sq_km || p.area_km2 || 0);

    // Get centroid from first coordinate ring
    const coords = (f.geometry as any)?.coordinates?.[0];
    if (coords && coords.length > 0) {
      let avgLat = 0, avgLng = 0;
      for (const c of coords) {
        avgLng += c[0];
        avgLat += c[1];
      }
      entry.lats.push(avgLat / coords.length);
      entry.lngs.push(avgLng / coords.length);
    }
  }

  return Array.from(nationMap.entries()).map(([id, d]) => ({
    nation_id: id,
    nation_name: d.name,
    nation_color: d.color,
    lat: d.lats.reduce((a, b) => a + b, 0) / d.lats.length,
    lng: d.lngs.reduce((a, b) => a + b, 0) / d.lngs.length,
    total_area: d.area,
  }));
}

// Component to fly to a location
function FlyTo({ target }: { target: { lat: number; lng: number; zoom: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], target.zoom, { duration: 1.5 });
    }
  }, [target, map]);
  return null;
}

// Canvas-rendered resource layer — overlapping circles create a filled watercolor effect
// Plus a single map-level mousemove handler for tooltips (not per-circle)
function ResourceCanvasLayer({ points, filters }: { points: Array<[number, number, string, number]>; filters: Record<string, boolean> }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);
  const tooltipRef = useRef<L.Tooltip | null>(null);
  const [zoom, setZoom] = useState(3);

  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoomend", onZoom);
    return () => { map.off("zoomend", onZoom); };
  }, [map]);

  // Build spatial index for fast nearest-point lookup
  const filteredPoints = useRef<Array<[number, number, string, number]>>([]);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    const canvasRenderer = L.canvas({ padding: 0.5 });
    const group = L.layerGroup();
    const visible: Array<[number, number, string, number]> = [];

    const baseRadius = zoom <= 3 ? 4 : zoom <= 5 ? 5 : zoom <= 7 ? 7 : Math.min(12, zoom * 1.2);

    for (const [lat, lng, type, qty] of points) {
      if (!filters[type]) continue;
      visible.push([lat, lng, type, qty]);
      const color = RESOURCE_COLORS[type] || "#888";
      const radius = baseRadius + (qty / 10) * 2;
      const opacity = 0.18 + (qty / 10) * 0.22;

      L.circleMarker([lat, lng], {
        renderer: canvasRenderer,
        radius,
        fillColor: color,
        fillOpacity: opacity,
        color: color,
        weight: 0,
        interactive: false,
      }).addTo(group);
    }

    filteredPoints.current = visible;
    group.addTo(map);
    layerRef.current = group;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [map, points, filters, zoom]);

  // Single mousemove handler — finds nearest resource point and shows tooltip
  useEffect(() => {
    let lastTooltipKey = "";

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const pts = filteredPoints.current;
      if (pts.length === 0) return;

      // Find closest point within ~1.5 degrees (fast linear scan is fine at this scale)
      let bestDist = Infinity;
      let bestIdx = -1;
      const threshold = zoom <= 4 ? 3 : zoom <= 6 ? 1.5 : 0.8;

      for (let i = 0; i < pts.length; i++) {
        const dlat = pts[i][0] - lat;
        const dlng = pts[i][1] - lng;
        const d = dlat * dlat + dlng * dlng;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }

      if (bestIdx === -1 || Math.sqrt(bestDist) > threshold) {
        if (tooltipRef.current) {
          map.closeTooltip(tooltipRef.current);
          tooltipRef.current = null;
          lastTooltipKey = "";
        }
        return;
      }

      const [pLat, pLng, pType, pQty] = pts[bestIdx];
      const key = `${pLat},${pLng}`;
      if (key === lastTooltipKey) return;
      lastTooltipKey = key;

      // Find ALL resources at this point (multiple types can overlap)
      const allAtPoint = pts.filter(p => p[0] === pLat && p[1] === pLng);
      const html = allAtPoint.map(([, , t, q]) =>
        `<span style="color:${RESOURCE_COLORS[t] || '#888'}; font-weight:600">${RESOURCE_LABELS[t] || t}</span>: ${q}/10`
      ).join("<br/>");

      if (tooltipRef.current) {
        map.closeTooltip(tooltipRef.current);
      }

      tooltipRef.current = L.tooltip({ permanent: false, direction: "top", offset: [0, -8] })
        .setLatLng([pLat, pLng])
        .setContent(`<div style="font-family:Montserrat,sans-serif;font-size:11px;line-height:1.6">${html}</div>`)
        .addTo(map);
    };

    const onMouseOut = () => {
      if (tooltipRef.current) {
        map.closeTooltip(tooltipRef.current);
        tooltipRef.current = null;
        lastTooltipKey = "";
      }
    };

    map.on("mousemove", onMouseMove);
    map.on("mouseout", onMouseOut);
    return () => {
      map.off("mousemove", onMouseMove);
      map.off("mouseout", onMouseOut);
      if (tooltipRef.current) map.closeTooltip(tooltipRef.current);
    };
  }, [map, zoom]);

  return null;
}

interface WorldMapProps {
  flyToNation?: number | null;
  nations?: Array<{ id: number; name: string; color: string }>;
}

export default function WorldMap({ flyToNation, nations }: WorldMapProps) {
  const [territories, setTerritories] = useState<FeatureCollection | null>(null);
  const [resourcePoints, setResourcePoints] = useState<Array<[number, number, string, number]> | null>(null);
  const [landData, setLandData] = useState<FeatureCollection | null>(null);
  const [geoKey, setGeoKey] = useState(0);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [layers, setLayers] = useState<Record<string, boolean>>({
    resources: true,
    tectonic: false,
    climate: false,
    territories: true,
    landOutline: true,
  });
  const [resourceFilters, setResourceFilters] = useState<Record<string, boolean>>(
    Object.fromEntries(RESOURCE_TYPES.map((t) => [t, true]))
  );

  const toggleLayer = (key: string) => setLayers((p) => ({ ...p, [key]: !p[key] }));
  const toggleResource = (key: string) => setResourceFilters((p) => ({ ...p, [key]: !p[key] }));

  // Compute nation centroids for markers
  const nationCentroids = territories?.features ? computeNationCentroids(territories.features) : [];

  // Handle flyToNation prop
  useEffect(() => {
    if (flyToNation && nationCentroids.length > 0) {
      const nation = nationCentroids.find(n => n.nation_id === flyToNation);
      if (nation) {
        setFlyTarget({ lat: nation.lat, lng: nation.lng, zoom: 7 });
      }
    }
  }, [flyToNation, nationCentroids.length]);

  useEffect(() => {
    async function fetchTerritories() {
      try {
        let res = await fetch("/api/v2/territories");
        if (!res.ok) res = await fetch("/api/v1/world/territories");
        if (res.ok) {
          setTerritories(await res.json());
          setGeoKey((k) => k + 1);
        }
      } catch { /* backend not up */ }
    }
    fetchTerritories();
    const interval = setInterval(fetchTerritories, 15000);
    return () => clearInterval(interval);
  }, []);

  // Fetch lightweight resource points (lat, lng, type, qty) — ~500KB vs 10MB
  useEffect(() => {
    async function fetchResources() {
      try {
        const res = await fetch("/api/v2/resource-points");
        if (res.ok) {
          setResourcePoints(await res.json());
        }
      } catch { /* not available yet */ }
    }
    fetchResources();
  }, []);

  useEffect(() => {
    fetch("/land.geojson")
      .then((r) => r.json())
      .then(setLandData)
      .catch(() => {});
  }, []);

  const visibleResources = layers.resources
    ? RESOURCE_REGIONS.filter((r) => resourceFilters[r.type])
    : [];

  return (
    <MapContainer
      center={[20, 0]}
      zoom={3}
      style={{ height: "100%", width: "100%" }}
      zoomControl={true}
      minZoom={2}
      maxZoom={19}
      attributionControl={false}
    >
      <FlyTo target={flyTarget} />

      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
      />

      {/* Land outlines */}
      {layers.landOutline && landData && (
        <GeoJSON
          data={landData}
          style={() => ({
            color: "#ffffff",
            weight: 0.8,
            opacity: 0.25,
            fillColor: "transparent",
            fillOpacity: 0,
          })}
        />
      )}

      {/* Climate Bands */}
      {layers.climate && CLIMATE_BANDS.map((band, i) => (
        <Rectangle
          key={`clim-${i}`}
          bounds={[[band.lat_min, -180], [band.lat_max, 180]]}
          pathOptions={{ color: "transparent", fillColor: band.color, fillOpacity: 0.35 }}
        >
          <Tooltip sticky><span style={{ fontFamily: "monospace", fontSize: 11 }}>{band.name}</span></Tooltip>
        </Rectangle>
      ))}

      {/* Resource points — lightweight canvas circles instead of 90K polygons */}
      {layers.resources && resourcePoints && (
        <ResourceCanvasLayer points={resourcePoints} filters={resourceFilters} />
      )}

      {/* Tectonic Hotspots */}
      {layers.tectonic && TECTONIC.map((h, i) => (
        <CircleMarker
          key={`tect-${i}`}
          center={[h.lat, h.lng]}
          radius={8 + h.risk * 8}
          pathOptions={{
            color: `rgba(239, 68, 68, ${h.risk * 0.6})`,
            weight: 2,
            fillColor: "#ef4444",
            fillOpacity: h.risk * 0.2,
            dashArray: "4 4",
          }}
        >
          <Tooltip>
            <div style={{ fontFamily: "monospace", fontSize: 11 }}>
              <strong style={{ color: "#ef4444" }}>{h.name}</strong><br />
              Seismic risk: {(h.risk * 100).toFixed(0)}%
            </div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Territory Claims */}
      {layers.territories && territories && territories.features?.length > 0 && (
        <GeoJSON
          key={geoKey}
          data={territories}
          style={(feature) => {
            const props = feature?.properties as TerritoryProps;
            const color = props?.nation_color || "#3b82f6";
            return {
              color,
              weight: 2.5,
              opacity: 0.9,
              fillColor: color,
              fillOpacity: 0.35,
              lineJoin: "round" as const,
              lineCap: "round" as const,
            };
          }}
          onEachFeature={(feature, layer) => {
            const props = feature.properties as TerritoryProps;
            layer.on({
              mouseover: (e: L.LeafletMouseEvent) => (e.target as L.Path).setStyle({ fillOpacity: 0.6, weight: 3.5 }),
              mouseout: (e: L.LeafletMouseEvent) => (e.target as L.Path).setStyle({ fillOpacity: 0.35, weight: 2.5 }),
            });
            const area = props.area_sq_km || props.area_km2 || 0;
            const imps = props.improvements?.length
              ? props.improvements.map((imp) => `${imp.type} (L${imp.level})`).join(", ")
              : "None";
            layer.bindPopup(
              L.popup({ className: "mw-popup" }).setContent(`
                <div style="font-family:Montserrat,sans-serif;font-size:12px;color:#fafafa;min-width:180px">
                  <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:${props.nation_color}">${props.nation_name}</div>
                  <div style="color:#a1a1aa;margin-bottom:2px">Area: ${area.toFixed(1)} km²</div>
                  <div style="color:#a1a1aa;margin-bottom:2px">Claimed: Tick ${props.claimed_tick}</div>
                  <div style="color:#a1a1aa">Improvements: ${imps}</div>
                </div>
              `)
            );
          }}
        />
      )}

      {/* Nation markers — always visible, even when zoomed out */}
      {layers.territories && nationCentroids.map((n) => (
        <CircleMarker
          key={`nation-marker-${n.nation_id}`}
          center={[n.lat, n.lng]}
          radius={10}
          pathOptions={{
            color: "#fafafa",
            weight: 2,
            fillColor: n.nation_color,
            fillOpacity: 0.9,
          }}
          eventHandlers={{
            click: () => setFlyTarget({ lat: n.lat, lng: n.lng, zoom: 7 }),
          }}
        >
          <Tooltip permanent direction="top" offset={[0, -12]}>
            <div style={{
              fontFamily: "Montserrat, sans-serif",
              fontSize: 11,
              fontWeight: 700,
              color: n.nation_color,
              textShadow: "none",
              whiteSpace: "nowrap",
            }}>
              {n.nation_name}
              <span style={{ fontWeight: 400, color: "#a1a1aa", marginLeft: 6, fontSize: 9 }}>
                {n.total_area.toFixed(0)} km²
              </span>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Controls */}
      <LayerPanel layers={layers} toggleLayer={toggleLayer} resourceFilters={resourceFilters} toggleResource={toggleResource} showResourceFilters={layers.resources} />
      <ResourceLegend visible={layers.resources} resourceFilters={resourceFilters} />
    </MapContainer>
  );
}

// ── Layer Control Panel ──
function LayerPanel({
  layers, toggleLayer, resourceFilters, toggleResource, showResourceFilters,
}: {
  layers: Record<string, boolean>;
  toggleLayer: (k: string) => void;
  resourceFilters: Record<string, boolean>;
  toggleResource: (k: string) => void;
  showResourceFilters: boolean;
}) {
  const mainLayers = [
    { key: "resources", label: "Resources", color: "#eab308" },
    { key: "tectonic", label: "Tectonic Zones", color: "#ef4444" },
    { key: "climate", label: "Climate Bands", color: "#3b82f6" },
    { key: "territories", label: "Territories", color: "#8b5cf6" },
    { key: "landOutline", label: "Land Outline", color: "#ffffff" },
  ];

  return (
    <div style={{
      position: "absolute", top: 12, right: 12, zIndex: 1000,
      background: "rgba(9,9,11,0.92)", backdropFilter: "blur(12px)",
      border: "1px solid #27272a", borderRadius: 10, padding: "10px 12px", minWidth: 170,
    }}>
      <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "#71717a", marginBottom: 8 }}>
        Layers
      </div>
      {mainLayers.map((l) => (
        <LayerToggle key={l.key} label={l.label} color={l.color} active={layers[l.key]} onClick={() => toggleLayer(l.key)} />
      ))}

      {showResourceFilters && (
        <>
          <div style={{ borderTop: "1px solid #27272a", margin: "8px 0", paddingTop: 8 }}>
            <div style={{ fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "#52525b", marginBottom: 6 }}>
              Resource Types
            </div>
            {RESOURCE_TYPES.map((t) => (
              <LayerToggle
                key={t}
                label={RESOURCE_LABELS[t] || t}
                color={RESOURCE_COLORS[t] || "#888"}
                active={resourceFilters[t]}
                onClick={() => toggleResource(t)}
                small
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LayerToggle({ label, color, active, onClick, small }: {
  label: string; color: string; active: boolean; onClick: () => void; small?: boolean;
}) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 7, padding: small ? "2px 0" : "3px 0",
      cursor: "pointer", fontSize: small ? "0.63rem" : "0.72rem",
      color: active ? "#fafafa" : "#52525b",
    }} onClick={onClick}>
      <span style={{
        width: small ? 8 : 10, height: small ? 8 : 10, borderRadius: 3, flexShrink: 0,
        background: active ? color : "transparent",
        border: `2px solid ${active ? color : "#3f3f46"}`,
        transition: "all 0.15s",
      }} />
      {label}
    </label>
  );
}

// ── Resource Legend ──
function ResourceLegend({ visible, resourceFilters }: { visible: boolean; resourceFilters: Record<string, boolean> }) {
  if (!visible) return null;

  const activeTypes = RESOURCE_TYPES.filter((t) => resourceFilters[t]);

  return (
    <div style={{
      position: "absolute", bottom: 12, left: 12, zIndex: 1000,
      background: "rgba(9,9,11,0.92)", backdropFilter: "blur(12px)",
      border: "1px solid #27272a", borderRadius: 10, padding: "10px 14px", minWidth: 140,
    }}>
      <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "#71717a", marginBottom: 8 }}>
        Resources
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px" }}>
        {activeTypes.map((t) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 5, padding: "1px 0" }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: RESOURCE_COLORS[t] || "#888",
              boxShadow: `0 0 4px ${RESOURCE_COLORS[t] || "#888"}66`,
            }} />
            <span style={{ fontSize: "0.6rem", color: "#a1a1aa" }}>
              {RESOURCE_LABELS[t] || t}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: "0.5rem", color: "#52525b", marginTop: 6, borderTop: "1px solid #27272a", paddingTop: 5 }}>
        Hover over the map to see resources
      </div>
    </div>
  );
}
