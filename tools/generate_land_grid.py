"""
Generate a land/water classification grid for MoltWorld.

Uses the Natural Earth 110m land GeoJSON to classify every point on Earth
as land (1) or water (0) at 0.1° resolution (~11km at equator).

Output: A JSON file with a flat array of 0s and 1s, plus metadata.
Grid dimensions: 3600 x 1800 (lng × lat)
  - lng: -180.0 to 179.9 (step 0.1)
  - lat: -90.0 to 89.9 (step 0.1)

To look up a coordinate:
  col = floor((lng + 180) / 0.1)
  row = floor((lat + 90) / 0.1)
  index = row * 3600 + col
  is_land = grid[index]

Usage: python generate_land_grid.py
Requires: pip install shapely
"""

import json
import sys
import os
import time

def main():
    try:
        from shapely.geometry import shape, Point, MultiPolygon
        from shapely.prepared import prep
    except ImportError:
        print("Installing shapely...")
        os.system(f"{sys.executable} -m pip install shapely")
        from shapely.geometry import shape, Point, MultiPolygon
        from shapely.prepared import prep

    # Load Natural Earth land polygons
    geojson_path = os.path.join(os.path.dirname(__file__), "..", "web", "public", "land.geojson")
    print(f"Loading land polygons from {geojson_path}...")

    with open(geojson_path, "r") as f:
        land_geojson = json.load(f)

    # Combine all land features into one MultiPolygon for fast lookup
    polygons = []
    for feature in land_geojson["features"]:
        geom = shape(feature["geometry"])
        if geom.is_valid:
            polygons.append(geom)
        else:
            polygons.append(geom.buffer(0))  # Fix invalid geometries

    from shapely.ops import unary_union
    print(f"Merging {len(polygons)} land polygons...")
    land = unary_union(polygons)
    prepared_land = prep(land)

    # Generate grid
    resolution = 0.1  # degrees
    lng_steps = int(360 / resolution)  # 3600
    lat_steps = int(180 / resolution)  # 1800
    total = lng_steps * lat_steps  # 6,480,000

    print(f"Generating {lng_steps}x{lat_steps} grid ({total:,} points) at {resolution}° resolution...")
    print("This will take a few minutes...")

    grid = bytearray(total)
    land_count = 0
    start = time.time()

    for row in range(lat_steps):
        lat = -90.0 + row * resolution + resolution / 2  # Center of cell
        for col in range(lng_steps):
            lng = -180.0 + col * resolution + resolution / 2
            idx = row * lng_steps + col

            point = Point(lng, lat)
            if prepared_land.contains(point):
                grid[idx] = 1
                land_count += 1

        # Progress
        if row % 100 == 0:
            elapsed = time.time() - start
            pct = (row / lat_steps) * 100
            eta = (elapsed / max(row, 1)) * (lat_steps - row)
            print(f"  {pct:.0f}% complete ({row}/{lat_steps} rows, {elapsed:.0f}s elapsed, ~{eta:.0f}s remaining)")

    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.1f}s!")
    print(f"Land cells: {land_count:,} ({land_count/total*100:.1f}%)")
    print(f"Water cells: {total - land_count:,} ({(total-land_count)/total*100:.1f}%)")

    # Save as compact JSON with base64-encoded binary grid
    import base64
    grid_b64 = base64.b64encode(bytes(grid)).decode("ascii")

    output = {
        "resolution": resolution,
        "lng_steps": lng_steps,
        "lat_steps": lat_steps,
        "lng_min": -180.0,
        "lat_min": -90.0,
        "land_cells": land_count,
        "water_cells": total - land_count,
        "grid_b64": grid_b64,
    }

    # Save for the backend (Node.js server)
    server_path = os.path.join(os.path.dirname(__file__), "..", "server", "src", "data", "land-grid.json")
    os.makedirs(os.path.dirname(server_path), exist_ok=True)
    with open(server_path, "w") as f:
        json.dump(output, f)
    print(f"Saved to {server_path} ({os.path.getsize(server_path) / 1024:.0f} KB)")

    # Also save a smaller version for the frontend (just the grid, no metadata duplication)
    frontend_path = os.path.join(os.path.dirname(__file__), "..", "web", "public", "land-grid.json")
    with open(frontend_path, "w") as f:
        json.dump(output, f)
    print(f"Saved to {frontend_path} ({os.path.getsize(frontend_path) / 1024:.0f} KB)")

if __name__ == "__main__":
    main()
