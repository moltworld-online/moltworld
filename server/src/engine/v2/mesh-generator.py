"""
Voronoi Mesh Generator for MoltWorld v2
Implements the organic territory mapping spec.

Generates terrain-adaptive Voronoi cells that follow natural geography.
Run once at world init to create the mesh. Agents then claim/own cells.

Requirements: pip install scipy shapely geopandas numpy
"""

import json
import os
import sys
import time
import numpy as np

def main():
    try:
        from scipy.spatial import Voronoi
        from shapely.geometry import Polygon, box, Point, MultiPolygon
        from shapely.ops import unary_union
    except ImportError:
        print("Installing dependencies...")
        os.system(f"{sys.executable} -m pip install scipy shapely geopandas")
        from scipy.spatial import Voronoi
        from shapely.geometry import Polygon, box, Point, MultiPolygon
        from shapely.ops import unary_union

    # Load land polygons
    land_path = os.path.join("C:", os.sep, "Users", "Amar", "moltworld", "web", "public", "land.geojson")
    print(f"Loading land data from {land_path}...")
    with open(land_path) as f:
        land_data = json.load(f)

    # Build land union
    land_polys = []
    for feature in land_data["features"]:
        try:
            from shapely.geometry import shape
            geom = shape(feature["geometry"])
            if geom.is_valid:
                land_polys.append(geom)
            else:
                land_polys.append(geom.buffer(0))
        except:
            pass

    print(f"Merging {len(land_polys)} land polygons...")
    land_union = unary_union(land_polys)

    # Load land/water grid for faster lookups
    grid_path = os.path.join("C:", os.sep, "Users", "Amar", "moltworld", "server", "src", "data", "land-grid.json")
    with open(grid_path) as f:
        grid_data = json.load(f)
    import base64
    grid = base64.b64decode(grid_data["grid_b64"])
    resolution = grid_data["resolution"]
    lng_steps = grid_data["lng_steps"]

    def is_land(lat, lng):
        col = int((lng + 180) / resolution)
        row = int((lat + 90) / resolution)
        if col < 0 or col >= lng_steps or row < 0 or row >= 1800:
            return False
        return grid[row * lng_steps + col] == 1

    # Generate terrain-adaptive seed points
    print("Generating seed points...")
    seeds = []

    # Base grid: 0.5° spacing on land (~55km between points)
    # This gives ~50,000-60,000 land cells
    base_step = 0.5
    for lat in np.arange(-60, 72, base_step):
        for lng in np.arange(-180, 180, base_step):
            if is_land(lat, lng):
                # Small random jitter to break grid regularity
                jitter_lat = (np.random.random() - 0.5) * base_step * 0.3
                jitter_lng = (np.random.random() - 0.5) * base_step * 0.3
                seeds.append([lng + jitter_lng, lat + jitter_lat])

    # Densify near coastlines: find land cells adjacent to water
    print("Densifying near coastlines...")
    coast_seeds = []
    fine_step = 0.15
    for lat in np.arange(-60, 72, fine_step):
        for lng in np.arange(-180, 180, fine_step):
            land = is_land(lat, lng)
            # Check if this is a coastal cell (land next to water or vice versa)
            neighbors_water = 0
            neighbors_land = 0
            for dlat in [-fine_step, 0, fine_step]:
                for dlng in [-fine_step, 0, fine_step]:
                    if dlat == 0 and dlng == 0:
                        continue
                    if is_land(lat + dlat, lng + dlng):
                        neighbors_land += 1
                    else:
                        neighbors_water += 1

            if land and neighbors_water > 0:
                # Coastal land — add denser point
                jitter = (np.random.random(2) - 0.5) * fine_step * 0.2
                coast_seeds.append([lng + jitter[0], lat + jitter[1]])

    print(f"  Base seeds: {len(seeds)}, Coast seeds: {len(coast_seeds)}")
    all_seeds = seeds + coast_seeds

    # Also add sparse ocean seeds near coast for water cells
    ocean_seeds = []
    for lat in np.arange(-60, 72, 1.0):  # 1° spacing for ocean
        for lng in np.arange(-180, 180, 1.0):
            if not is_land(lat, lng):
                # Only near land (within ~3°)
                near_land = False
                for d in [1, 2, 3]:
                    for dlat in [-d, 0, d]:
                        for dlng in [-d, 0, d]:
                            if is_land(lat + dlat, lng + dlng):
                                near_land = True
                                break
                        if near_land:
                            break
                    if near_land:
                        break
                if near_land:
                    ocean_seeds.append([lng, lat])

    print(f"  Ocean seeds (near coast): {len(ocean_seeds)}")
    all_seeds.extend(ocean_seeds)

    seeds_array = np.array(all_seeds)
    print(f"Total seeds: {len(seeds_array)}")

    # Build Voronoi
    print("Computing Voronoi tessellation...")
    start = time.time()

    # Add boundary mirror points to handle edges
    boundary_points = []
    for lat in [-90, 90]:
        for lng in np.arange(-180, 180, 5):
            boundary_points.append([lng, lat])
    for lng in [-180, 180]:
        for lat in np.arange(-90, 90, 5):
            boundary_points.append([lng, lat])

    all_points = np.vstack([seeds_array, np.array(boundary_points)])
    vor = Voronoi(all_points)

    elapsed = time.time() - start
    print(f"Voronoi computed in {elapsed:.1f}s — {len(vor.regions)} regions")

    # Convert to cells
    print("Converting to GeoJSON cells...")
    cells = []
    bounding = box(-180, -85, 180, 85)
    num_seeds = len(seeds_array)

    for i in range(num_seeds):
        if i % 5000 == 0:
            print(f"  Processing cell {i}/{num_seeds}...")

        region_idx = vor.point_region[i]
        region = vor.regions[region_idx]
        if -1 in region or len(region) < 3:
            continue

        vertices = [vor.vertices[v].tolist() for v in region]
        try:
            poly = Polygon(vertices)
            if not poly.is_valid:
                poly = poly.buffer(0)
            poly = poly.intersection(bounding)
            if poly.is_empty or poly.area < 1e-6:
                continue

            # Classify as land or water
            seed_lng, seed_lat = seeds_array[i]
            cell_is_land = is_land(seed_lat, seed_lng)

            # For land cells, clip to coastline
            if cell_is_land:
                try:
                    clipped = poly.intersection(land_union)
                    if not clipped.is_empty and clipped.area > 0.0001:
                        # Use the clipped version
                        if isinstance(clipped, MultiPolygon):
                            # Take the largest piece
                            clipped = max(clipped.geoms, key=lambda g: g.area)
                        poly = clipped
                except:
                    pass  # Keep original poly if intersection fails

            # Simplify for storage
            poly = poly.simplify(0.01)

            area_km2 = poly.area * 111 * 111 * abs(np.cos(np.radians(seed_lat)))

            cells.append({
                "id": len(cells),
                "seed": [round(seed_lng, 4), round(seed_lat, 4)],
                "type": "land" if cell_is_land else "water",
                "area_km2": round(area_km2, 2),
                "coords": [list(map(lambda c: [round(c[0], 4), round(c[1], 4)], poly.exterior.coords))],
            })
        except Exception as e:
            continue

    print(f"Generated {len(cells)} cells ({sum(1 for c in cells if c['type'] == 'land')} land, {sum(1 for c in cells if c['type'] == 'water')} water)")

    # Save as JSON
    output_path = os.path.join("C:", os.sep, "Users", "Amar", "moltworld", "server", "src", "data", "voronoi-mesh.json")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump({"cells": cells, "total": len(cells)}, f)

    file_size = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Saved to {output_path} ({file_size:.1f} MB)")

    # Also save a GeoJSON version for the frontend
    geojson_path = os.path.join("C:", os.sep, "Users", "Amar", "moltworld", "web", "public", "mesh.geojson")
    features = []
    for cell in cells:
        if cell["type"] == "land":  # Only land cells for frontend
            features.append({
                "type": "Feature",
                "properties": {
                    "id": cell["id"],
                    "type": cell["type"],
                    "area_km2": cell["area_km2"],
                    "owner": None,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": cell["coords"],
                },
            })

    geojson = {"type": "FeatureCollection", "features": features}
    with open(geojson_path, "w") as f:
        json.dump(geojson, f)

    geojson_size = os.path.getsize(geojson_path) / (1024 * 1024)
    print(f"Frontend GeoJSON: {geojson_path} ({geojson_size:.1f} MB)")


if __name__ == "__main__":
    main()
