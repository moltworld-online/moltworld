# TECHNICAL SPEC: Organic Territory Mapping System

## Claude Code Implementation Guide

---

## THE PROBLEM

Square grid tiles create rigid, geometric territory shapes that look artificial.
Real territories follow natural boundaries: coastlines, rivers, mountain ridges, valleys.
We need territories that:
1. Use real-world GPS coordinates and geography
2. Expand organically along terrain, not in squares
3. Snap borders to natural features (rivers, ridges, coasts)
4. Display on interactive maps with proper projections
5. Scale from a village claiming a river valley to an empire spanning a continent

---

## ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────┐
│                    MAP LAYERS                         │
│                                                       │
│  Layer 1: Base Geography (immutable)                  │
│    - Real coastlines, rivers, elevation from          │
│      Natural Earth / OpenStreetMap data               │
│                                                       │
│  Layer 2: Voronoi Mesh (generated once at world init) │
│    - Irregular polygons shaped by terrain features    │
│    - These replace square tiles                       │
│                                                       │
│  Layer 3: Territory Overlay (dynamic, per-tick)       │
│    - Agent ownership per cell                         │
│    - Rendered with dissolved borders                  │
│                                                       │
│  Layer 4: Resources & Structures (dynamic)            │
│    - Icons/markers for settlements, resources         │
│                                                       │
│  Display: Leaflet/Mapbox with GeoJSON overlays        │
└─────────────────────────────────────────────────────┘
```

---

## STEP 1: REPLACE SQUARE GRID WITH TERRAIN-ADAPTIVE VORONOI MESH

### Why Voronoi?

A Voronoi diagram divides space into irregular polygons, each defined by a seed
point. The key insight: if you place seed points NON-UNIFORMLY — denser in
complex terrain (coasts, mountains) and sparser in flat plains — you get cells
that naturally follow geographic features.

### Seed Point Placement Strategy

```python
"""
SEED POINT GENERATION
Instead of a uniform grid, place points based on terrain complexity.
More points = smaller cells near interesting features.
Fewer points = larger cells in open plains/ocean.
"""

import numpy as np
from scipy.spatial import Voronoi
from shapely.geometry import Polygon, MultiPolygon, Point
from shapely.ops import unary_union
import geopandas as gpd

def generate_terrain_adaptive_seeds(
    bounds: tuple,           # (min_lon, min_lat, max_lon, max_lat)
    elevation_data: np.array, # DEM raster
    coastline_gdf: gpd.GeoDataFrame,
    rivers_gdf: gpd.GeoDataFrame,
    base_density: float = 0.1,  # points per km² in flat terrain
    feature_density: float = 0.5, # points per km² near features
    min_cell_area_km2: float = 5.0,  # minimum cell size
    max_cell_area_km2: float = 500.0  # maximum cell size
) -> np.array:
    """
    Generate seed points for Voronoi mesh.
    
    Dense near: coastlines, rivers, mountain ridges, elevation changes
    Sparse in: open ocean, flat plains, uniform terrain
    """
    
    seeds = []
    
    # 1. Base grid of sparse points (covers everything)
    lat_range = np.arange(bounds[1], bounds[3], 0.1)  # ~11km spacing
    lon_range = np.arange(bounds[0], bounds[2], 0.1)
    for lat in lat_range:
        for lon in lon_range:
            seeds.append((lon, lat))
    
    # 2. Densify along coastlines
    #    Walk each coastline geometry at intervals of ~2km
    for geom in coastline_gdf.geometry:
        if geom.length > 0:
            num_points = int(geom.length / 0.02)  # ~2km intervals
            for i in range(num_points):
                pt = geom.interpolate(i / max(num_points, 1), normalized=True)
                # Add point plus small random jitter
                jitter = np.random.normal(0, 0.005, 2)
                seeds.append((pt.x + jitter[0], pt.y + jitter[1]))
    
    # 3. Densify along rivers
    for geom in rivers_gdf.geometry:
        if geom.length > 0:
            num_points = int(geom.length / 0.03)  # ~3km intervals
            for i in range(num_points):
                pt = geom.interpolate(i / max(num_points, 1), normalized=True)
                jitter = np.random.normal(0, 0.003, 2)
                seeds.append((pt.x + jitter[0], pt.y + jitter[1]))
    
    # 4. Densify in high-gradient elevation areas (mountains, ridges)
    #    Compute gradient magnitude from DEM
    grad_y, grad_x = np.gradient(elevation_data)
    gradient_mag = np.sqrt(grad_x**2 + grad_y**2)
    
    # Where gradient is high, add extra points
    high_gradient_mask = gradient_mag > np.percentile(gradient_mag, 75)
    high_grad_coords = np.argwhere(high_gradient_mask)
    
    for coord in high_grad_coords[::5]:  # sample every 5th to avoid overdensity
        lat = bounds[1] + (coord[0] / elevation_data.shape[0]) * (bounds[3] - bounds[1])
        lon = bounds[0] + (coord[1] / elevation_data.shape[1]) * (bounds[2] - bounds[0])
        jitter = np.random.normal(0, 0.005, 2)
        seeds.append((lon + jitter[0], lat + jitter[1]))
    
    return np.array(seeds)
```

### Build the Voronoi Mesh

```python
from scipy.spatial import Voronoi
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
import geopandas as gpd

def build_voronoi_mesh(
    seeds: np.array,
    bounds: tuple,
    land_polygons: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    """
    Build Voronoi mesh and classify cells as land/water.
    Clip cells to coastlines so land cells follow real shorelines.
    """
    
    # Add mirror points at boundaries to handle edge cells
    mirrored = mirror_boundary_points(seeds, bounds)
    all_points = np.vstack([seeds, mirrored])
    
    # Generate Voronoi
    vor = Voronoi(all_points)
    
    # Convert regions to polygons
    cells = []
    bounding_box = box(*bounds)
    land_union = unary_union(land_polygons.geometry)
    
    for i, region_idx in enumerate(vor.point_region[:len(seeds)]):
        region = vor.regions[region_idx]
        if -1 in region or len(region) == 0:
            continue
        
        vertices = [vor.vertices[v] for v in region]
        try:
            poly = Polygon(vertices)
            if not poly.is_valid:
                poly = poly.buffer(0)
            
            # Clip to world bounds
            poly = poly.intersection(bounding_box)
            
            if poly.is_empty:
                continue
            
            # Determine land/water and clip to coastline
            land_portion = poly.intersection(land_union)
            water_portion = poly.difference(land_union)
            
            # If >50% land, it's a land cell (clipped to coast)
            if land_portion.area > poly.area * 0.3:
                cells.append({
                    'geometry': land_portion,  # CLIPPED to coastline
                    'seed_lon': seeds[i][0],
                    'seed_lat': seeds[i][1],
                    'cell_type': 'land',
                    'area_km2': land_portion.area * 111 * 111,  # rough conversion
                    'owner': None,
                    'biome': None,  # assigned later
                    'elevation_avg': None,
                    'ecosystem_health': 1.0,
                    'resources': {}
                })
            
            if water_portion.area > 0.001:
                cells.append({
                    'geometry': water_portion,
                    'seed_lon': seeds[i][0],
                    'seed_lat': seeds[i][1],
                    'cell_type': 'water',
                    'area_km2': water_portion.area * 111 * 111,
                    'owner': None,
                    'biome': 'ocean',
                    'elevation_avg': 0,
                    'ecosystem_health': 1.0,
                    'resources': {}
                })
    
    return gpd.GeoDataFrame(cells, crs="EPSG:4326")
```

### Result: Cells That Follow Geography

Instead of this (square grid):
```
┌──┬──┬──┬──┐
│  │  │▓▓│  │  ▓ = land
├──┼──┼──┼──┤
│  │▓▓│▓▓│▓▓│  
├──┼──┼──┼──┤  Coastline cuts through
│▓▓│▓▓│▓▓│  │  squares awkwardly
├──┼──┼──┼──┤
│▓▓│▓▓│  │  │
└──┴──┴──┴──┘
```

You get this (terrain-adaptive Voronoi):
```
    ╱‾‾‾‾‾╲
   ╱  ▓▓▓▓  ╲___
  │  ▓▓▓▓▓▓▓    ╲      Cells follow the
  │ ▓▓▓▓▓▓▓▓▓▓   │     coastline naturally
   ╲▓▓▓▓▓▓▓▓▓▓╱‾╱
    ╲▓▓▓▓▓▓▓╱‾╱        Smaller cells near coast
     ‾╲▓▓▓╱‾╱          Larger cells inland
       ‾‾‾‾
```

---

## STEP 2: NATURAL BORDER SNAPPING

### The Problem Within the Solution

Even with Voronoi cells, territory borders between two agents will look like
jagged polygon edges. We need borders to snap to natural features.

### Border Hierarchy (in priority order)

When two agents' territories are adjacent, the border between them should
prefer to follow these features:

1. **Ocean/sea** (absolute barrier until naval tech)
2. **Major rivers** (strong natural border)
3. **Mountain ridges** (strong natural border)
4. **Elevation contour lines** (moderate border)
5. **Biome transitions** (weak but natural border)
6. **Voronoi cell edge** (fallback — still looks organic)

```python
def compute_natural_border(
    cell_a: dict,          # cell owned by agent A
    cell_b: dict,          # adjacent cell owned by agent B
    rivers_gdf: gpd.GeoDataFrame,
    ridgelines_gdf: gpd.GeoDataFrame,
    elevation_data: np.array,
    snap_distance_km: float = 10.0
) -> Geometry:
    """
    Given two adjacent cells owned by different agents,
    compute the most natural border between them.
    """
    
    # Get the shared edge between the two cells
    shared_edge = cell_a['geometry'].intersection(cell_b['geometry'])
    
    if shared_edge.is_empty or shared_edge.length == 0:
        return shared_edge
    
    # Check for nearby rivers within snap distance
    search_buffer = shared_edge.buffer(snap_distance_km / 111)
    
    nearby_rivers = rivers_gdf[rivers_gdf.intersects(search_buffer)]
    if not nearby_rivers.empty:
        # Find the river segment closest to the shared edge
        best_river = nearest_river_segment(shared_edge, nearby_rivers)
        if best_river is not None:
            return best_river  # Border follows the river
    
    # Check for nearby ridgelines
    nearby_ridges = ridgelines_gdf[ridgelines_gdf.intersects(search_buffer)]
    if not nearby_ridges.empty:
        best_ridge = nearest_ridge_segment(shared_edge, nearby_ridges)
        if best_ridge is not None:
            return best_ridge  # Border follows the ridgeline
    
    # Check for elevation contour alignment
    contour_border = find_contour_aligned_border(
        shared_edge, elevation_data, snap_distance_km
    )
    if contour_border is not None:
        return contour_border
    
    # Fallback: use the Voronoi edge (already organic-looking)
    return shared_edge


def dissolve_territory(
    mesh: gpd.GeoDataFrame,
    agent_id: str,
    rivers_gdf: gpd.GeoDataFrame,
    ridgelines_gdf: gpd.GeoDataFrame
) -> Geometry:
    """
    Dissolve all cells owned by an agent into a single territory polygon.
    Internal cell boundaries disappear.
    External boundaries follow natural features.
    """
    
    owned_cells = mesh[mesh['owner'] == agent_id]
    
    # Dissolve internal boundaries
    territory = unary_union(owned_cells.geometry)
    
    # Smooth the outer boundary
    territory = territory.simplify(0.005)  # ~500m tolerance
    territory = smooth_polygon(territory, resolution=64)
    
    return territory
```

---

## STEP 3: ORGANIC EXPANSION ALGORITHM

### Replace "claim adjacent square" with terrain-weighted flood fill

Expansion should flow like water — along valleys, across plains, and resist
going over mountains or through dense forest.

```python
import heapq

def compute_expansion_candidates(
    mesh: gpd.GeoDataFrame,
    agent_id: str,
    agent_state: dict,
    elevation_data: np.array,
    rivers_gdf: gpd.GeoDataFrame
) -> list:
    """
    Returns a priority-ordered list of cells the agent can expand into,
    weighted by terrain traversability and strategic value.
    
    This replaces the old "claim adjacent tiles" with organic expansion
    that follows natural corridors.
    """
    
    owned_cells = mesh[mesh['owner'] == agent_id]
    
    # Find all unowned cells adjacent to territory
    border_cells = set()
    for idx, cell in owned_cells.iterrows():
        neighbors = find_adjacent_cells(mesh, idx)
        for n_idx in neighbors:
            n_cell = mesh.loc[n_idx]
            if n_cell['owner'] is None and n_cell['cell_type'] == 'land':
                border_cells.add(n_idx)
    
    # Score each candidate by expansion cost
    candidates = []
    
    for cell_idx in border_cells:
        cell = mesh.loc[cell_idx]
        
        cost = compute_expansion_cost(
            cell=cell,
            agent_state=agent_state,
            owned_cells=owned_cells,
            elevation_data=elevation_data,
            rivers_gdf=rivers_gdf
        )
        
        value = compute_cell_value(cell)
        
        # Priority = value / cost (higher is better)
        priority = value / max(cost, 0.01)
        
        candidates.append({
            'cell_idx': cell_idx,
            'cost': cost,
            'value': value,
            'priority': priority,
            'geometry': cell['geometry']
        })
    
    # Sort by priority descending
    candidates.sort(key=lambda x: x['priority'], reverse=True)
    
    return candidates


def compute_expansion_cost(cell, agent_state, owned_cells, elevation_data, rivers_gdf):
    """
    How expensive is it to claim this cell?
    
    Cost factors (multiplicative):
    - Base cost: proportional to cell area
    - Elevation change: crossing mountains is expensive
    - River crossing: rivers are barriers (unless you have bridges)
    - Biome difficulty: jungle > forest > grassland > desert
    - Distance from nearest settlement: farther = harder to supply
    - Existing population: claimed cells with people resist
    """
    
    base_cost = cell['area_km2'] / 50.0  # normalized
    
    # Elevation penalty
    avg_elev = cell.get('elevation_avg', 0)
    nearest_owned_elev = get_nearest_owned_elevation(cell, owned_cells, elevation_data)
    elev_diff = abs(avg_elev - nearest_owned_elev)
    
    elevation_penalty = 1.0
    if elev_diff > 500:    # meters
        elevation_penalty = 2.0
    if elev_diff > 1000:
        elevation_penalty = 4.0
    if elev_diff > 2000:
        elevation_penalty = 10.0
    if avg_elev > 3000:
        elevation_penalty *= 3.0  # high altitude is inherently hard
    
    # River crossing penalty
    river_penalty = 1.0
    cell_boundary = cell['geometry'].boundary
    river_crossings = rivers_gdf[rivers_gdf.crosses(cell_boundary)]
    if not river_crossings.empty:
        # Major rivers are harder to cross
        for _, river in river_crossings.iterrows():
            river_order = river.get('stream_order', 1)
            if river_order >= 5:    # major river
                river_penalty *= 3.0
            elif river_order >= 3:  # medium river
                river_penalty *= 1.5
    
    # Biome difficulty
    biome_costs = {
        'grassland': 1.0,
        'temperate_forest': 1.5,
        'tropical_forest': 3.0,
        'desert': 2.5,
        'tundra': 3.0,
        'mountain': 4.0,
        'swamp': 2.0,
        'boreal_forest': 2.0,
    }
    biome_cost = biome_costs.get(cell.get('biome', 'grassland'), 1.5)
    
    # Distance from nearest settlement
    nearest_settlement = find_nearest_settlement(cell, agent_state)
    distance_km = nearest_settlement['distance']
    distance_penalty = 1.0 + (distance_km / 50.0)  # +1x cost per 50km
    
    total_cost = base_cost * elevation_penalty * river_penalty * biome_cost * distance_penalty
    
    return total_cost


def compute_cell_value(cell):
    """
    How valuable is this cell to claim?
    
    Considers: resources, fertility, water access, strategic position.
    """
    
    value = 1.0
    
    # Fertile soil
    fertility = cell.get('soil_fertility', 0.5)
    value += fertility * 3.0
    
    # Resource deposits
    for resource, amount in cell.get('resources', {}).items():
        resource_values = {
            'copper': 5.0, 'tin': 8.0, 'iron': 10.0,
            'coal': 7.0, 'oil': 15.0, 'gold': 3.0,
            'stone': 1.0, 'clay': 2.0
        }
        value += resource_values.get(resource, 1.0) * amount
    
    # Water access (river or lake in/adjacent to cell)
    if cell.get('has_freshwater', False):
        value += 5.0
    
    # Coastal access
    if cell.get('is_coastal', False):
        value += 3.0
    
    return value
```

### How Expansion Looks Over Time

```
TICK 1-50: Small cluster following river valley
    ~~~~╱╲
    ~~╱▓▓▓╲
    ~│▓▓▓▓▓│~~~~  River: ~~~
    ~│▓▓▓▓▓│~~~
    ~~╲▓▓╱~~~~
    
TICK 50-200: Spreads along valley, avoids mountains
         ╱╲  Mountains
    ~~~~╱  ╲
    ~~╱▓▓▓▓▓╲
    ~│▓▓▓▓▓▓▓│~~~~
    ~│▓▓▓▓▓▓▓▓▓│~~~~  Follows river downstream
    ~~╲▓▓▓▓▓▓▓╱~~~~
    ~~~~╲▓▓▓╱
         ╲╱  Mountains

TICK 200-500: Fills habitable basin, starts crossing barriers
         ╱╲
    ~~~~╱▓▓╲
    ~~╱▓▓▓▓▓▓╲
    ~│▓▓▓▓▓▓▓▓▓│~~~~
    ~│▓▓▓▓▓▓▓▓▓▓▓▓▓│~~~~
    ~~╲▓▓▓▓▓▓▓▓▓▓▓╱~~~~
    ~~~~╲▓▓▓▓▓▓▓╱
    ~~~~~~╲▓▓▓╱
```

---

## STEP 4: MAP RENDERING

### Tech Stack

```
Frontend: Leaflet.js or MapLibre GL JS
    - Renders GeoJSON polygons on real-world basemap
    - Supports custom tile layers, polygon styling, interactivity

Backend: Python with GeoPandas + Flask/FastAPI
    - Processes Voronoi mesh
    - Computes territories per tick
    - Serves GeoJSON to frontend

Data Sources:
    - Natural Earth (110m or 50m) for coastlines, rivers, lakes
    - ETOPO1 or SRTM for elevation data
    - OpenStreetMap extracts for detailed features
```

### Territory Rendering Pipeline

```python
from flask import Flask, jsonify
import geopandas as gpd
from shapely.ops import unary_union

app = Flask(__name__)

@app.route('/api/territories/<int:tick>')
def get_territories(tick):
    """
    Returns GeoJSON of all agent territories for a given tick.
    Territories are dissolved (no internal cell boundaries)
    with smoothed, natural-looking borders.
    """
    
    mesh = load_mesh_state(tick)
    agents = mesh[mesh['owner'].notna()]['owner'].unique()
    
    features = []
    
    for agent_id in agents:
        agent_cells = mesh[mesh['owner'] == agent_id]
        
        # Dissolve all cells into single territory polygon
        territory = unary_union(agent_cells.geometry)
        
        # Smooth jagged edges
        # simplify removes unnecessary vertices
        # buffer(small).buffer(-small) rounds corners
        territory = territory.simplify(0.003)
        territory = territory.buffer(0.002).buffer(-0.002)
        
        # Get agent color and metadata
        agent_meta = get_agent_metadata(agent_id)
        
        features.append({
            'type': 'Feature',
            'geometry': territory.__geo_interface__,
            'properties': {
                'agent_id': agent_id,
                'agent_name': agent_meta['name'],
                'color': agent_meta['color'],
                'population': int(agent_cells['population'].sum()),
                'epoch': agent_meta['epoch'],
                'territory_km2': float(agent_cells['area_km2'].sum()),
            }
        })
    
    return jsonify({
        'type': 'FeatureCollection',
        'features': features,
        'metadata': {
            'tick': tick,
            'total_agents': len(agents)
        }
    })


@app.route('/api/territory/<agent_id>/<int:tick>')
def get_agent_detail(agent_id, tick):
    """
    Detailed view of one agent's territory with internal structure visible:
    settlements, resource sites, infrastructure.
    """
    
    mesh = load_mesh_state(tick)
    agent_cells = mesh[mesh['owner'] == agent_id]
    
    # Don't dissolve — show individual cells with their properties
    features = []
    for idx, cell in agent_cells.iterrows():
        features.append({
            'type': 'Feature',
            'geometry': cell.geometry.__geo_interface__,
            'properties': {
                'cell_id': int(idx),
                'biome': cell['biome'],
                'population': int(cell.get('population', 0)),
                'ecosystem_health': float(cell['ecosystem_health']),
                'resources': cell.get('resources', {}),
                'structures': cell.get('structures', []),
                'is_settlement': cell.get('is_settlement', False),
                'food_production': float(cell.get('food_production', 0)),
            }
        })
    
    return jsonify({
        'type': 'FeatureCollection',
        'features': features
    })
```

### Frontend Map Component

```javascript
// Leaflet-based territory map
// Install: npm install leaflet

import L from 'leaflet';

class TerritoryMap {
    constructor(containerId) {
        this.map = L.map(containerId).setView([20, 0], 3);
        
        // Base layer: use a subtle, desaturated basemap
        // so territory colors pop
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '© CartoDB © OpenStreetMap',
            maxZoom: 18
        }).addTo(this.map);
        
        this.territoryLayer = null;
        this.detailLayer = null;
    }
    
    async loadTerritories(tick) {
        const response = await fetch(`/api/territories/${tick}`);
        const geojson = await response.json();
        
        // Remove old layer
        if (this.territoryLayer) {
            this.map.removeLayer(this.territoryLayer);
        }
        
        this.territoryLayer = L.geoJSON(geojson, {
            style: (feature) => ({
                // Territory fill: semi-transparent agent color
                fillColor: feature.properties.color,
                fillOpacity: 0.35,
                // Border: darker version of agent color
                color: darkenColor(feature.properties.color, 0.3),
                weight: 2,
                opacity: 0.8,
                // Dashed border for contested/decaying territory
                dashArray: feature.properties.is_decaying ? '5, 5' : null
            }),
            onEachFeature: (feature, layer) => {
                layer.bindPopup(`
                    <h3>${feature.properties.agent_name}</h3>
                    <p>Population: ${feature.properties.population.toLocaleString()}</p>
                    <p>Territory: ${Math.round(feature.properties.territory_km2).toLocaleString()} km²</p>
                    <p>Epoch: ${feature.properties.epoch}</p>
                `);
                
                layer.on('click', () => this.loadAgentDetail(
                    feature.properties.agent_id, tick
                ));
            }
        }).addTo(this.map);
    }
    
    async loadAgentDetail(agentId, tick) {
        const response = await fetch(`/api/territory/${agentId}/${tick}`);
        const geojson = await response.json();
        
        if (this.detailLayer) {
            this.map.removeLayer(this.detailLayer);
        }
        
        this.detailLayer = L.geoJSON(geojson, {
            style: (feature) => {
                // Color by ecosystem health or biome
                const health = feature.properties.ecosystem_health;
                return {
                    fillColor: healthToColor(health),
                    fillOpacity: 0.5,
                    color: '#333',
                    weight: 0.5,
                    opacity: 0.3
                };
            },
            onEachFeature: (feature, layer) => {
                if (feature.properties.is_settlement) {
                    // Add settlement marker
                    const center = layer.getBounds().getCenter();
                    L.circleMarker(center, {
                        radius: Math.log2(feature.properties.population + 1) * 2,
                        fillColor: '#FFD700',
                        fillOpacity: 0.8,
                        color: '#333',
                        weight: 1
                    }).addTo(this.map);
                }
            }
        }).addTo(this.map);
    }
}

function healthToColor(health) {
    // Green (healthy) to brown (degraded)
    if (health > 0.8) return '#2d6a4f';
    if (health > 0.6) return '#52b788';
    if (health > 0.4) return '#b7b7a4';
    if (health > 0.2) return '#a68a64';
    return '#6c584c';
}

function darkenColor(hex, factor) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgb(${Math.round(r*(1-factor))},${Math.round(g*(1-factor))},${Math.round(b*(1-factor))})`;
}
```

---

## STEP 5: WATER TERRITORY (Naval Expansion)

### Coastal Waters vs Open Ocean

Once an agent develops sailing technology, they can claim water cells:

```python
def get_claimable_water_cells(mesh, agent_id, agent_state):
    """
    Water territory rules:
    
    1. COASTAL WATERS (within 3 cells of owned coast):
       - Claimable with basic sailing tech
       - Provides fishing resources
       - Cost: 50% of land cell expansion cost
       
    2. TERRITORIAL WATERS (within 10 cells of coast):
       - Requires organized navy
       - Must be patrolled to maintain claim (1 ship per 5 cells)
       
    3. OPEN OCEAN:
       - Cannot be "owned" — only transit routes
       - Trade routes across ocean require navigation tech
       - Piracy risk in unpatrolled waters
    """
    
    owned_land = mesh[(mesh['owner'] == agent_id) & (mesh['cell_type'] == 'land')]
    coastal_land = owned_land[owned_land['is_coastal'] == True]
    
    if coastal_land.empty:
        return []  # landlocked — no water claims
    
    # Find water cells adjacent to coastal land
    water_candidates = []
    coastal_union = unary_union(coastal_land.geometry)
    
    # Buffer outward to find nearby water cells
    tech_level = agent_state.get('naval_tech', 0)
    
    if tech_level == 0:
        return []  # no sailing = no water territory
    
    # Range increases with tech
    buffer_distances = {
        1: 0.03,   # basic sailing: ~3km coastal waters
        2: 0.1,    # organized navy: ~10km territorial waters  
        3: 0.5,    # advanced navy: ~50km exclusive zone
    }
    
    buffer_dist = buffer_distances.get(min(tech_level, 3), 0.03)
    search_area = coastal_union.buffer(buffer_dist)
    
    water_cells = mesh[
        (mesh['cell_type'] == 'water') & 
        (mesh.intersects(search_area)) &
        (mesh['owner'].isna())
    ]
    
    for idx, cell in water_cells.iterrows():
        water_candidates.append({
            'cell_idx': idx,
            'distance_to_coast': coastal_union.distance(cell.geometry.centroid),
            'has_fish': cell.get('fish_stock', 0) > 0,
            'area_km2': cell['area_km2']
        })
    
    return water_candidates
```

---

## STEP 6: DATA SOURCES & SETUP

### Required Geographic Data

```bash
# 1. Natural Earth — coastlines, rivers, lakes, land polygons
#    Free, public domain, multiple resolutions
wget https://naciscdn.org/naturalearth/50m/physical/ne_50m_land.zip
wget https://naciscdn.org/naturalearth/50m/physical/ne_50m_rivers_lake_centerlines.zip
wget https://naciscdn.org/naturalearth/50m/physical/ne_50m_lakes.zip
wget https://naciscdn.org/naturalearth/50m/physical/ne_50m_coastline.zip

# 2. Elevation data — ETOPO1 (global, 1 arc-minute resolution)
#    For terrain analysis, ridgeline detection, biome assignment
wget https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO1/data/bedrock/grid_registered/netcdf/ETOPO1_Bed_g_gmt4.grd.gz

# 3. Biome data — WWF Ecoregions
#    For realistic biome assignment to cells
wget https://files.worldwildlife.org/wwfcmsprod/files/Publication/file/6kcchn7e3u_official_teow.zip

# Unzip and process
unzip ne_50m_land.zip -d data/natural_earth/
# ... etc
```

### World Initialization Script

```python
"""
WORLD INITIALIZATION
Run once to generate the Voronoi mesh for the entire world.
This takes ~10-30 minutes depending on resolution.
Output: a GeoPackage file with all cells, their properties, and adjacency graph.
"""

import geopandas as gpd
import numpy as np
from pathlib import Path

def initialize_world(
    resolution: str = 'medium',  # low/medium/high
    output_path: str = 'world_mesh.gpkg'
):
    # Resolution settings
    configs = {
        'low':    {'base_spacing': 0.5,  'target_cells': 50_000},
        'medium': {'base_spacing': 0.2,  'target_cells': 200_000},
        'high':   {'base_spacing': 0.1,  'target_cells': 1_000_000},
    }
    config = configs[resolution]
    
    print("Loading geographic data...")
    land = gpd.read_file('data/natural_earth/ne_50m_land.shp')
    rivers = gpd.read_file('data/natural_earth/ne_50m_rivers_lake_centerlines.shp')
    coastline = gpd.read_file('data/natural_earth/ne_50m_coastline.shp')
    
    print("Loading elevation data...")
    elevation = load_elevation_raster('data/ETOPO1_Bed_g_gmt4.grd')
    
    print("Generating terrain-adaptive seed points...")
    seeds = generate_terrain_adaptive_seeds(
        bounds=(-180, -85, 180, 85),
        elevation_data=elevation,
        coastline_gdf=coastline,
        rivers_gdf=rivers,
        base_density=config['base_spacing']
    )
    print(f"  Generated {len(seeds)} seed points")
    
    print("Building Voronoi mesh...")
    mesh = build_voronoi_mesh(seeds, (-180, -85, 180, 85), land)
    print(f"  Created {len(mesh)} cells")
    
    print("Assigning biomes and resources...")
    mesh = assign_biomes(mesh, elevation)
    mesh = distribute_resources(mesh)
    
    print("Computing adjacency graph...")
    adjacency = compute_adjacency(mesh)
    
    print(f"Saving to {output_path}...")
    mesh.to_file(output_path, driver='GPKG', layer='cells')
    
    # Save adjacency as separate table
    adj_df = pd.DataFrame(adjacency, columns=['cell_a', 'cell_b', 'shared_border_km'])
    adj_df.to_csv(output_path.replace('.gpkg', '_adjacency.csv'), index=False)
    
    print("Done! World initialized.")
    return mesh

if __name__ == '__main__':
    initialize_world(resolution='medium')
```

---

## STEP 7: ADJACENCY & PATHFINDING

### Why Adjacency Matters

The Voronoi mesh replaces a grid, so you can't just check
"cell to the north." You need an explicit adjacency graph.

```python
from shapely.strtree import STRtree

def compute_adjacency(mesh: gpd.GeoDataFrame) -> list:
    """
    Build adjacency list: which cells share a border?
    Uses spatial indexing for performance.
    """
    
    # Build spatial index
    tree = STRtree(mesh.geometry)
    
    adjacency = []
    processed = set()
    
    for idx, cell in mesh.iterrows():
        # Find cells that might be adjacent (bounding box overlap)
        candidates = tree.query(cell.geometry)
        
        for candidate_idx in candidates:
            if candidate_idx == idx:
                continue
            
            pair = tuple(sorted([idx, candidate_idx]))
            if pair in processed:
                continue
            processed.add(pair)
            
            other = mesh.iloc[candidate_idx]
            
            # Check if they actually share a border (not just bbox overlap)
            shared = cell.geometry.intersection(other.geometry)
            
            if shared.length > 0.0001:  # meaningful shared border
                adjacency.append({
                    'cell_a': idx,
                    'cell_b': candidate_idx,
                    'shared_border_km': shared.length * 111,  # rough deg to km
                    'crosses_river': check_river_crossing(shared, rivers_gdf),
                    'elevation_diff': abs(
                        cell.get('elevation_avg', 0) - 
                        other.get('elevation_avg', 0)
                    )
                })
    
    return adjacency


def find_path(
    mesh: gpd.GeoDataFrame,
    adjacency: dict,  # precomputed adjacency lookup
    start_cell: int,
    end_cell: int,
    agent_state: dict
) -> list:
    """
    A* pathfinding through the Voronoi mesh.
    Cost function accounts for terrain, not just distance.
    """
    
    import heapq
    
    def heuristic(cell_a, cell_b):
        """Straight-line distance between cell centroids"""
        ca = mesh.loc[cell_a].geometry.centroid
        cb = mesh.loc[cell_b].geometry.centroid
        return ca.distance(cb) * 111  # rough km
    
    def edge_cost(cell_from, cell_to):
        """Movement cost between adjacent cells"""
        to_cell = mesh.loc[cell_to]
        
        base = heuristic(cell_from, cell_to)
        
        # Terrain multiplier
        terrain_costs = {
            'grassland': 1.0, 'temperate_forest': 1.5,
            'tropical_forest': 3.0, 'mountain': 5.0,
            'desert': 2.0, 'tundra': 3.0, 'swamp': 4.0,
            'water': 10.0 if not agent_state.get('has_boats') else 0.5
        }
        terrain_mult = terrain_costs.get(to_cell.get('biome', 'grassland'), 1.5)
        
        # Road bonus
        if to_cell.get('has_road', False):
            terrain_mult *= 0.3
        
        return base * terrain_mult
    
    # A* implementation
    open_set = [(0, start_cell)]
    came_from = {}
    g_score = {start_cell: 0}
    
    while open_set:
        current_f, current = heapq.heappop(open_set)
        
        if current == end_cell:
            # Reconstruct path
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            return list(reversed(path))
        
        for neighbor in adjacency.get(current, []):
            tentative_g = g_score[current] + edge_cost(current, neighbor)
            
            if tentative_g < g_score.get(neighbor, float('inf')):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                f_score = tentative_g + heuristic(neighbor, end_cell)
                heapq.heappush(open_set, (f_score, neighbor))
    
    return None  # no path found
```

---

## PROMPT FOR CLAUDE CODE

When handing this to Claude Code, use something like:

```
I'm building a civilization simulation game. I need you to implement an organic 
territory mapping system. Here's what I need:

1. Replace the current square grid with a terrain-adaptive Voronoi mesh that 
   uses real-world geography (Natural Earth data for coastlines, rivers, elevation).

2. Cells should be smaller near coastlines, rivers, and mountains (where terrain 
   is complex) and larger in open plains and ocean.

3. Territory expansion should flow organically — along river valleys, across plains, 
   resisting mountains. Use a weighted flood-fill / A* approach where expansion cost 
   depends on terrain.

4. When rendering territories on a map (Leaflet/MapLibre), dissolve internal cell 
   boundaries so each agent's territory appears as one smooth polygon. External 
   borders should snap to nearby rivers or ridgelines when possible.

5. Land cells that touch the coast should be clipped to the actual coastline shape 
   so territories follow real shorelines, not rectangular approximations.

6. Water territory becomes claimable with naval technology, expanding outward from 
   owned coastline.

See the attached technical spec for full implementation details, data structures, 
algorithms, and data sources.

Start by:
- Setting up the Python environment with geopandas, scipy, shapely
- Downloading Natural Earth 50m data
- Implementing the seed point generator
- Building a Voronoi mesh for a test region (e.g., Mediterranean)
- Rendering it with Leaflet to verify it looks organic
```

---

## PERFORMANCE NOTES

| Operation | Estimated Time | Frequency |
|-----------|---------------|-----------|
| World mesh generation | 10-30 min | Once |
| Per-tick territory update | 50-200ms | Every tick |
| Full territory render (all agents) | 100-500ms | On request |
| Adjacency computation | 5-15 min | Once |
| Pathfinding (single route) | 1-10ms | Per request |

For a 200,000-cell mesh, the GeoPackage file will be ~500MB.
Adjacency graph: ~2M edges, ~50MB CSV.

Use spatial indexing (R-tree via `geopandas.sindex`) for ALL spatial queries.
Never do brute-force geometric comparisons across the full mesh.

---

## SCALING STRATEGY

| Phase | Cell Count | Coverage | Use Case |
|-------|-----------|----------|----------|
| Prototype | 5,000 | Single continent | Test mechanics |
| Alpha | 50,000 | Full world, low res | Full game testing |
| Beta | 200,000 | Full world, medium res | Production |
| Release | 1,000,000 | Full world, high res | Final product |

Start with prototype resolution. The algorithms scale — the mesh just gets denser.
