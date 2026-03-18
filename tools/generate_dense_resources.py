"""
Generate dense resource deposits across the entire Earth.

Creates resources roughly every 100 square miles across all habitable land,
with resource types and quantities based on real-world geography:

- Fresh water: Near rivers, lakes, high rainfall areas
- Fertile land: Plains, river valleys, temperate/tropical zones
- Timber: Forests (boreal, temperate, tropical)
- Iron/copper/gold/etc: Mountain ranges, shield geology
- Oil/gas/coal: Sedimentary basins
- Fish: Coastal areas and continental shelves

Uses the land-water grid to only place land resources on land
and ocean resources in water.
"""

import json
import os
import random
import math

def main():
    # Load land grid
    grid_path = os.path.join(os.path.dirname(__file__), "..", "server", "src", "data", "land-grid.json")
    with open(grid_path, "r") as f:
        grid_data = json.load(f)

    import base64
    grid = base64.b64decode(grid_data["grid_b64"])
    resolution = grid_data["resolution"]  # 0.1°
    lng_steps = grid_data["lng_steps"]  # 3600

    def is_land(lat, lng):
        col = int((lng + 180) / resolution)
        row = int((lat + 90) / resolution)
        if col < 0 or col >= lng_steps or row < 0 or row >= 1800:
            return False
        idx = row * lng_steps + col
        return grid[idx] == 1

    deposits = []

    # Step size: ~0.5° ≈ 55km at equator, giving ~3000 km² per cell
    # This creates a resource deposit roughly every 100 sq miles
    step = 0.5

    lat = -60.0  # Skip Antarctica
    while lat < 72.0:
        lng = -180.0
        while lng < 180.0:
            land = is_land(lat, lng)

            # Add some randomness to position (± 0.15°)
            jlat = lat + (random.random() - 0.5) * 0.3
            jlng = lng + (random.random() - 0.5) * 0.3

            if land:
                # Determine resource type based on latitude, terrain heuristics
                resource = pick_land_resource(jlat, jlng)
                if resource:
                    deposits.append(resource)
            else:
                # Ocean — fish resources along coasts, nothing deep ocean
                if is_near_coast(lat, lng, grid, resolution, lng_steps):
                    qty = random.randint(5000, 40000)
                    deposits.append({
                        "lat": round(jlat, 4),
                        "lng": round(jlng, 4),
                        "type": "fish",
                        "quantity": qty,
                        "depletion": round(0.1 + random.random() * 0.3, 2),
                    })

            lng += step
        lat += step

    print(f"Generated {len(deposits)} resource deposits")

    # Count by type
    counts = {}
    for d in deposits:
        counts[d["type"]] = counts.get(d["type"], 0) + 1
    for t, c in sorted(counts.items()):
        print(f"  {t}: {c}")

    # Save as SQL insert statements
    sql_path = os.path.join(os.path.dirname(__file__), "..", "server", "src", "db", "seed-dense.sql")
    with open(sql_path, "w") as f:
        f.write("-- Dense resource deposits generated from real-world geography\n")
        f.write("-- DO NOT EDIT — regenerate with tools/generate_dense_resources.py\n\n")
        f.write("DELETE FROM resource_deposits;\n\n")
        for d in deposits:
            f.write(
                f"INSERT INTO resource_deposits (lat, lng, resource_type, quantity_total, quantity_remaining, depletion_rate) "
                f"VALUES ({d['lat']}, {d['lng']}, '{d['type']}', {d['quantity']}, {d['quantity']}, {d['depletion']});\n"
            )

    print(f"Saved to {sql_path}")


def pick_land_resource(lat, lng):
    """Pick a resource type based on geographic location heuristics."""
    abs_lat = abs(lat)
    r = random.random()

    # Fresh water — everywhere but more in temperate/tropical, near known river systems
    # ~30% of land cells get water
    if r < 0.30:
        # More water in tropical/temperate, less in desert/arctic
        if abs_lat > 65:
            qty = random.randint(5000, 20000)
        elif abs_lat < 30 and is_desert_zone(lat, lng):
            qty = random.randint(1000, 8000)
        else:
            qty = random.randint(15000, 80000)
        return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "fresh_water",
                "quantity": qty, "depletion": round(0.02 + random.random() * 0.05, 3)}

    # Fertile land — plains, temperate zones, river areas
    # ~25% of land cells
    if r < 0.55:
        if abs_lat > 60 or is_desert_zone(lat, lng):
            qty = random.randint(2000, 10000)
        elif 20 < abs_lat < 55:
            qty = random.randint(20000, 80000)  # Temperate = most fertile
        else:
            qty = random.randint(10000, 50000)
        return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "fertile_land",
                "quantity": qty, "depletion": round(0.05 + random.random() * 0.1, 3)}

    # Timber — forests
    # ~20% of land cells
    if r < 0.75:
        if abs_lat > 65:
            qty = random.randint(5000, 20000)  # Sparse arctic
        elif abs_lat > 45:
            qty = random.randint(30000, 100000)  # Boreal
        elif abs_lat < 25:
            qty = random.randint(40000, 120000)  # Tropical
        else:
            qty = random.randint(20000, 60000)  # Temperate
        if is_desert_zone(lat, lng):
            qty = random.randint(500, 3000)
        return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "timber",
                "quantity": qty, "depletion": round(0.1 + random.random() * 0.3, 2)}

    # Minerals and energy — less common, geology-dependent
    mineral_roll = random.random()

    # Coal — sedimentary basins, more in northern hemisphere mid-latitudes
    if mineral_roll < 0.2:
        qty = random.randint(5000, 40000)
        if 30 < abs_lat < 55:
            qty = random.randint(15000, 60000)
        return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "coal",
                "quantity": qty, "depletion": round(1.0 + random.random() * 2.0, 2)}

    # Iron — everywhere but concentrated in shield regions
    if mineral_roll < 0.35:
        qty = random.randint(3000, 25000)
        return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "iron",
                "quantity": qty, "depletion": round(0.5 + random.random() * 1.5, 2)}

    # Oil/gas — sedimentary basins, more in specific zones
    if mineral_roll < 0.50:
        qty = random.randint(5000, 30000)
        # Boost in known petroleum regions
        if 20 < lat < 35 and 40 < lng < 60:  # Middle East
            qty = random.randint(20000, 80000)
        if 55 < lat < 70 and 60 < lng < 85:  # Siberia
            qty = random.randint(15000, 50000)
        return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "oil",
                "quantity": qty, "depletion": round(1.0 + random.random() * 2.0, 2)}

    # Copper
    if mineral_roll < 0.60:
        qty = random.randint(2000, 15000)
        return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "copper",
                "quantity": qty, "depletion": round(0.5 + random.random() * 1.0, 2)}

    # Gold — rare
    if mineral_roll < 0.70:
        qty = random.randint(500, 5000)
        return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "gold",
                "quantity": qty, "depletion": round(0.2 + random.random() * 0.5, 2)}

    # Lithium — rare, concentrated
    if mineral_roll < 0.78:
        qty = random.randint(1000, 8000)
        return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "lithium",
                "quantity": qty, "depletion": round(0.3 + random.random() * 0.7, 2)}

    # Uranium — rare
    if mineral_roll < 0.85:
        qty = random.randint(1000, 6000)
        return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "uranium",
                "quantity": qty, "depletion": round(0.2 + random.random() * 0.4, 2)}

    # Diamonds — very rare
    if mineral_roll < 0.88:
        qty = random.randint(200, 2000)
        return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "diamonds",
                "quantity": qty, "depletion": round(0.1 + random.random() * 0.3, 2)}

    # Natural gas
    if mineral_roll < 0.95:
        qty = random.randint(5000, 25000)
        return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "natural_gas",
                "quantity": qty, "depletion": round(0.8 + random.random() * 1.5, 2)}

    # Cobalt — very rare
    qty = random.randint(500, 4000)
    return {"lat": round(lat, 4), "lng": round(lng, 4), "type": "cobalt",
            "quantity": qty, "depletion": round(0.3 + random.random() * 0.5, 2)}


def is_desert_zone(lat, lng):
    """Rough check if coordinates are in a desert-ish area."""
    abs_lat = abs(lat)
    # Sahara / Arabian desert
    if 15 < lat < 35 and -15 < lng < 60:
        return True
    # Central Asian deserts
    if 35 < lat < 45 and 55 < lng < 80:
        return True
    # Australian interior
    if -30 < lat < -20 and 120 < lng < 145:
        return True
    # Gobi
    if 38 < lat < 48 and 90 < lng < 115:
        return True
    # Atacama
    if -30 < lat < -20 and -72 < lng < -68:
        return True
    return False


def is_near_coast(lat, lng, grid, resolution, lng_steps):
    """Check if an ocean cell is near land (within 3 cells = ~33km)."""
    for dlat in range(-3, 4):
        for dlng in range(-3, 4):
            check_lat = lat + dlat * resolution
            check_lng = lng + dlng * resolution
            col = int((check_lng + 180) / resolution)
            row = int((check_lat + 90) / resolution)
            if 0 <= col < lng_steps and 0 <= row < 1800:
                idx = row * lng_steps + col
                if grid[idx] == 1:
                    return True
    return False


if __name__ == "__main__":
    main()
