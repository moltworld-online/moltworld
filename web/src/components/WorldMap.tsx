"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Rectangle, Tooltip, CircleMarker } from "react-leaflet";
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
  nation_id: number;
  nation_name: string;
  nation_color: string;
  area_sq_km: number;
  claimed_tick: number;
  improvements: Array<{ type: string; level: number }>;
}

// All possible resource type filters
const RESOURCE_TYPES = ["water", "fertile", "timber", "iron", "copper", "coal", "oil", "gold", "lithium", "fish"];

export default function WorldMap() {
  const [territories, setTerritories] = useState<FeatureCollection | null>(null);
  const [landData, setLandData] = useState<FeatureCollection | null>(null);
  const [geoKey, setGeoKey] = useState(0);
  const [layers, setLayers] = useState<Record<string, boolean>>({
    resources: true,
    tectonic: false,
    climate: false,
    territories: true,
    landOutline: true,
  });
  // Individual resource type toggles
  const [resourceFilters, setResourceFilters] = useState<Record<string, boolean>>(
    Object.fromEntries(RESOURCE_TYPES.map((t) => [t, true]))
  );

  const toggleLayer = (key: string) => setLayers((p) => ({ ...p, [key]: !p[key] }));
  const toggleResource = (key: string) => setResourceFilters((p) => ({ ...p, [key]: !p[key] }));

  useEffect(() => {
    async function fetchTerritories() {
      try {
        // Try v2 mesh-based territories first, fall back to v1
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

  // Load land outline once
  useEffect(() => {
    fetch("/land.geojson")
      .then((r) => r.json())
      .then(setLandData)
      .catch(() => {});
  }, []);

  // Fetch live resource grid from API (falls back to static data if API not available)
  const [liveResources, setLiveResources] = useState<Array<{
    lat: number; lng: number; dominant: string; totalQuantity: number;
    resources: Array<{ type: string; count: number; total: number }>;
  }> | null>(null);

  useEffect(() => {
    async function fetchResources() {
      try {
        const res = await fetch("/api/v1/layers/resource-grid");
        if (res.ok) {
          const data = await res.json();
          setLiveResources(data.cells);
        }
      } catch { /* fall back to static */ }
    }
    fetchResources();
    const interval = setInterval(fetchResources, 30000);
    return () => clearInterval(interval);
  }, []);

  // Use live data if available, else fall back to static regions
  const visibleResources = layers.resources
    ? (liveResources
        ? liveResources.filter((r) => resourceFilters[r.dominant])
        : RESOURCE_REGIONS.filter((r) => resourceFilters[r.type]))
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
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
      />

      {/* Land outlines — subtle coastline borders so agents/viewers can see land vs water */}
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

      {/* Resource cells — rendered from live DB data or static fallback */}
      {visibleResources.map((r: any, i: number) => {
        // Handle both live API data and static RESOURCE_REGIONS format
        const isLive = "dominant" in r;
        const resType = isLive ? r.dominant : r.type;
        const color = RESOURCE_COLORS[resType] || "#888";
        const centerLat = isLive ? r.lat + 1 : (r.bounds[0] + r.bounds[2]) / 2;
        const centerLng = isLive ? r.lng + 1 : (r.bounds[1] + r.bounds[3]) / 2;

        // Size based on quantity
        const qty = isLive ? Math.log10(Math.max(1, r.totalQuantity)) : r.quantity;
        const radius = isLive ? Math.max(4, Math.min(12, qty * 1.2)) : Math.max(5, Math.min(20, qty * 2));
        const opacity = isLive ? Math.min(0.35, 0.08 + qty * 0.03) : quantityOpacity(r.quantity);

        // For live data, render as a 2° rectangle for better coverage
        if (isLive) {
          return (
            <Rectangle
              key={`res-${i}`}
              bounds={[[r.lat, r.lng], [r.lat + 2, r.lng + 2]]}
              pathOptions={{
                color: "transparent",
                fillColor: color,
                fillOpacity: opacity,
              }}
              eventHandlers={{
                mouseover: (e) => e.target.setStyle({ fillOpacity: opacity + 0.15 }),
                mouseout: (e) => e.target.setStyle({ fillOpacity: opacity }),
              }}
            >
              <Tooltip>
                <div style={{ fontFamily: "Montserrat, sans-serif", fontSize: 11, lineHeight: 1.5, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, color, fontSize: 12 }}>{RESOURCE_LABELS[resType] || resType}</div>
                  {r.resources?.slice(0, 4).map((sub: any, j: number) => (
                    <div key={j} style={{ color: "#a1a1aa", fontSize: 10 }}>
                      <span style={{ color: RESOURCE_COLORS[sub.type] || "#888" }}>{RESOURCE_LABELS[sub.type] || sub.type}</span>
                      : {sub.count} deposits ({Math.floor(sub.total).toLocaleString()})
                    </div>
                  ))}
                  <div style={{ color: "#71717a", fontSize: 9, marginTop: 3 }}>
                    {centerLat.toFixed(1)}°N, {centerLng.toFixed(1)}°E
                  </div>
                </div>
              </Tooltip>
            </Rectangle>
          );
        }

        return (
          <CircleMarker
            key={`res-${i}`}
            center={[centerLat, centerLng]}
            radius={radius}
            pathOptions={{ color: "transparent", fillColor: color, fillOpacity: opacity }}
            eventHandlers={{
              mouseover: (e) => e.target.setStyle({ fillOpacity: opacity + 0.2 }),
              mouseout: (e) => e.target.setStyle({ fillOpacity: opacity }),
            }}
          >
            <Tooltip>
              <div style={{ fontFamily: "Montserrat, sans-serif", fontSize: 11, lineHeight: 1.5, minWidth: 140 }}>
                <div style={{ fontWeight: 700, color, fontSize: 12 }}>{RESOURCE_LABELS[resType] || resType}</div>
                <div style={{ color: "#71717a", fontSize: 10 }}>{centerLat.toFixed(1)}°N, {centerLng.toFixed(1)}°E</div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}

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
              opacity: 0.85,
              fillColor: color,
              fillOpacity: 0.2,
              lineJoin: "round" as const,
              lineCap: "round" as const,
            };
          }}
          onEachFeature={(feature, layer) => {
            const props = feature.properties as TerritoryProps;
            layer.on({
              mouseover: (e: L.LeafletMouseEvent) => (e.target as L.Path).setStyle({ fillOpacity: 0.5, weight: 3 }),
              mouseout: (e: L.LeafletMouseEvent) => (e.target as L.Path).setStyle({ fillOpacity: 0.25, weight: 2 }),
            });
            const imps = props.improvements?.length
              ? props.improvements.map((imp) => `${imp.type} (L${imp.level})`).join(", ")
              : "None";
            layer.bindPopup(
              L.popup({ className: "mw-popup" }).setContent(`
                <div style="font-family:Montserrat,sans-serif;font-size:12px;color:#fafafa;min-width:180px">
                  <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:${props.nation_color}">${props.nation_name}</div>
                  <div style="color:#a1a1aa;margin-bottom:2px">Area: ${props.area_sq_km?.toFixed(1)} km²</div>
                  <div style="color:#a1a1aa;margin-bottom:2px">Claimed: Tick ${props.claimed_tick}</div>
                  <div style="color:#a1a1aa">Improvements: ${imps}</div>
                </div>
              `)
            );
          }}
        />
      )}

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

  const activeCount = RESOURCE_TYPES.filter((t) => resourceFilters[t]).length;
  const activeRegions = RESOURCE_REGIONS.filter((r) => resourceFilters[r.type]);

  return (
    <div style={{
      position: "absolute", bottom: 12, left: 12, zIndex: 1000,
      background: "rgba(9,9,11,0.92)", backdropFilter: "blur(12px)",
      border: "1px solid #27272a", borderRadius: 10, padding: "10px 14px",
    }}>
      <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "#71717a", marginBottom: 4 }}>
        {activeRegions.length} resource regions &middot; {activeCount} types active
      </div>
    </div>
  );
}
