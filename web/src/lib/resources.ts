// Resource regions placed at real geographic locations but with NO names.
// Names are for agents to assign when they claim territory.
// Only type + abundance score + coordinates are known.

export interface ResourceRegion { type: string;
  bounds: [number, number, number, number]; // [south_lat, west_lng, north_lat, east_lng]
  quantity: number; // 1-10 abundance score from Pri
}

export const RESOURCE_REGIONS: ResourceRegion[] = [
  // ═══════════════════════════════════════════════════
  // FRESH WATER - Rivers, Lakes, Aquifers, Deltas (60)
  // ═══════════════════════════════════════════════════

  // North America
  { type: "water", bounds: [41.0, -92.0, 49.0, -76.0], quantity: 10 },
  { type: "water", bounds: [29.0, -95.0, 47.0, -82.0], quantity: 9 },
  { type: "water", bounds: [38.0, -112.0, 48.5, -90.5], quantity: 7 },
  { type: "water", bounds: [36.5, -89.0, 41.0, -79.0], quantity: 7 },
  { type: "water", bounds: [43.0, -122.0, 49.5, -114.0], quantity: 6 },
  { type: "water", bounds: [31.0, -115.5, 40.5, -106.0], quantity: 5 },
  { type: "water", bounds: [26.0, -107.0, 37.0, -97.0], quantity: 5 },
  { type: "water", bounds: [44.0, -76.0, 49.0, -64.0], quantity: 6 },
  { type: "water", bounds: [60.0, -165.0, 66.0, -139.0], quantity: 5 },
  { type: "water", bounds: [56.0, -136.0, 69.0, -110.0], quantity: 6 },
  { type: "water", bounds: [50.0, -99.5, 54.0, -96.0], quantity: 5 },
  { type: "water", bounds: [49.0, -116.0, 54.0, -99.0], quantity: 5 },

  // South America
  { type: "water", bounds: [-5.0, -74.0, 2.0, -49.0], quantity: 10 },
  { type: "water", bounds: [-34.0, -60.0, -20.0, -48.0], quantity: 8 },
  { type: "water", bounds: [2.0, -72.0, 10.0, -60.0], quantity: 7 },
  { type: "water", bounds: [-16.0, -46.0, -9.0, -36.0], quantity: 5 },
  { type: "water", bounds: [-16.5, -70.5, -15.0, -68.5], quantity: 4 },
  { type: "water", bounds: [-36.0, -58.5, -34.0, -55.0], quantity: 6 },
  { type: "water", bounds: [2.0, -76.0, 10.0, -73.0], quantity: 5 },

  // Europe
  { type: "water", bounds: [43.5, 8.0, 50.0, 29.5], quantity: 8 },
  { type: "water", bounds: [46.5, 6.0, 52.0, 10.0], quantity: 7 },
  { type: "water", bounds: [45.0, 32.0, 58.0, 52.0], quantity: 9 },
  { type: "water", bounds: [46.0, 30.0, 55.0, 36.0], quantity: 6 },
  { type: "water", bounds: [46.0, 37.0, 54.0, 44.0], quantity: 5 },
  { type: "water", bounds: [50.0, 9.5, 54.0, 14.5], quantity: 5 },
  { type: "water", bounds: [44.0, 7.0, 46.0, 13.0], quantity: 6 },
  { type: "water", bounds: [46.0, -1.0, 48.0, 4.0], quantity: 5 },
  { type: "water", bounds: [49.5, 18.5, 54.5, 21.0], quantity: 5 },
  { type: "water", bounds: [59.5, 29.5, 63.0, 36.5], quantity: 5 },
  { type: "water", bounds: [57.5, 12.0, 62.0, 17.0], quantity: 5 },
  { type: "water", bounds: [60.5, 24.0, 64.0, 30.0], quantity: 5 },

  // Africa
  { type: "water", bounds: [-2.0, 29.0, 31.5, 36.0], quantity: 9 },
  { type: "water", bounds: [-6.0, 15.0, 4.0, 30.0], quantity: 9 },
  { type: "water", bounds: [5.0, -12.0, 15.0, 8.0], quantity: 7 },
  { type: "water", bounds: [-20.0, 20.0, -10.0, 36.0], quantity: 6 },
  { type: "water", bounds: [-3.0, 31.5, 0.5, 34.5], quantity: 7 },
  { type: "water", bounds: [-8.8, 29.0, -3.3, 31.2], quantity: 5 },
  { type: "water", bounds: [-14.5, 34.0, -9.5, 35.5], quantity: 5 },
  { type: "water", bounds: [-31.0, 17.0, -28.5, 29.0], quantity: 4 },
  { type: "water", bounds: [12.0, -17.0, 17.0, -10.0], quantity: 4 },
  { type: "water", bounds: [-20.5, 22.0, -18.5, 24.0], quantity: 4 },
  { type: "water", bounds: [11.0, 12.5, 14.0, 15.5], quantity: 3 },

  // Asia
  { type: "water", bounds: [24.0, 97.0, 35.0, 122.0], quantity: 10 },
  { type: "water", bounds: [32.0, 96.0, 42.0, 119.0], quantity: 8 },
  { type: "water", bounds: [21.0, 78.0, 29.0, 92.0], quantity: 10 },
  { type: "water", bounds: [24.0, 66.0, 36.0, 78.0], quantity: 8 },
  { type: "water", bounds: [9.0, 100.0, 28.0, 108.0], quantity: 7 },
  { type: "water", bounds: [50.0, 65.0, 67.0, 85.0], quantity: 8 },
  { type: "water", bounds: [46.0, 85.0, 72.0, 98.0], quantity: 7 },
  { type: "water", bounds: [53.0, 105.0, 73.0, 130.0], quantity: 6 },
  { type: "water", bounds: [46.0, 119.0, 55.0, 141.0], quantity: 6 },
  { type: "water", bounds: [30.0, 38.0, 38.0, 48.0], quantity: 7 },
  { type: "water", bounds: [51.0, 103.5, 56.0, 110.0], quantity: 7 },
  { type: "water", bounds: [37.0, 58.0, 47.0, 72.0], quantity: 4 },
  { type: "water", bounds: [15.0, 94.0, 26.0, 98.0], quantity: 6 },
  { type: "water", bounds: [21.5, 104.0, 25.5, 114.0], quantity: 6 },
  { type: "water", bounds: [13.0, 99.0, 16.5, 101.5], quantity: 5 },

  // Oceania
  { type: "water", bounds: [-37.5, 138.0, -26.0, 153.0], quantity: 7 },
  { type: "water", bounds: [-31.0, 134.0, -23.0, 142.0], quantity: 2 },

  // ═══════════════════════════════════════════════════
  // FERTILE LAND - Agricultural Plains, River Valleys (45)
  // ═══════════════════════════════════════════════════

  // North America
  { type: "fertile", bounds: [33.0, -104.0, 49.0, -96.0], quantity: 9 },
  { type: "fertile", bounds: [38.0, -96.0, 44.0, -83.0], quantity: 10 },
  { type: "fertile", bounds: [34.5, -121.0, 40.0, -118.5], quantity: 8 },
  { type: "fertile", bounds: [29.0, -92.0, 34.0, -88.0], quantity: 8 },
  { type: "fertile", bounds: [49.0, -114.0, 54.0, -96.0], quantity: 8 },
  { type: "fertile", bounds: [44.0, -124.0, 46.0, -121.5], quantity: 6 },
  { type: "fertile", bounds: [42.0, -117.0, 44.5, -112.0], quantity: 5 },

  // South America
  { type: "fertile", bounds: [-39.0, -64.0, -31.0, -57.0], quantity: 9 },
  { type: "fertile", bounds: [-20.0, -55.0, -5.0, -41.0], quantity: 7 },
  { type: "fertile", bounds: [-4.0, -70.0, 0.0, -52.0], quantity: 6 },
  { type: "fertile", bounds: [-28.0, -55.0, -22.0, -48.0], quantity: 7 },
  { type: "fertile", bounds: [4.0, -74.0, 9.0, -66.0], quantity: 5 },

  // Europe
  { type: "fertile", bounds: [46.0, 28.0, 52.0, 40.0], quantity: 10 },
  { type: "fertile", bounds: [50.5, 10.0, 55.0, 24.0], quantity: 8 },
  { type: "fertile", bounds: [47.0, 0.5, 50.0, 4.5], quantity: 8 },
  { type: "fertile", bounds: [44.0, 7.5, 46.0, 13.0], quantity: 8 },
  { type: "fertile", bounds: [36.5, -6.5, 38.0, -3.0], quantity: 6 },
  { type: "fertile", bounds: [46.0, 18.0, 48.5, 22.0], quantity: 7 },
  { type: "fertile", bounds: [48.0, 36.0, 55.0, 55.0], quantity: 9 },
  { type: "fertile", bounds: [51.5, 0.0, 53.0, 2.0], quantity: 5 },
  { type: "fertile", bounds: [43.5, 23.0, 45.0, 28.0], quantity: 6 },

  // Africa
  { type: "fertile", bounds: [30.0, 30.0, 31.5, 32.5], quantity: 8 },
  { type: "fertile", bounds: [15.0, 30.0, 27.0, 34.0], quantity: 6 },
  { type: "fertile", bounds: [13.5, -5.5, 16.0, -3.0], quantity: 5 },
  { type: "fertile", bounds: [-4.0, 29.0, 3.0, 38.0], quantity: 6 },
  { type: "fertile", bounds: [-30.0, 25.0, -25.0, 31.0], quantity: 5 },
  { type: "fertile", bounds: [7.0, -8.0, 12.0, 5.0], quantity: 5 },
  { type: "fertile", bounds: [6.0, 35.0, 14.0, 42.0], quantity: 5 },

  // Asia
  { type: "fertile", bounds: [32.0, 112.0, 40.0, 120.0], quantity: 10 },
  { type: "fertile", bounds: [28.0, 111.0, 33.0, 122.0], quantity: 9 },
  { type: "fertile", bounds: [28.0, 103.0, 32.0, 108.0], quantity: 8 },
  { type: "fertile", bounds: [24.0, 73.0, 30.0, 88.0], quantity: 10 },
  { type: "fertile", bounds: [28.0, 70.0, 33.0, 77.0], quantity: 9 },
  { type: "fertile", bounds: [9.0, 105.0, 11.0, 107.0], quantity: 7 },
  { type: "fertile", bounds: [14.5, 120.0, 16.0, 121.5], quantity: 5 },
  { type: "fertile", bounds: [-8.0, 106.0, -6.0, 114.0], quantity: 7 },
  { type: "fertile", bounds: [40.0, 69.0, 41.5, 72.0], quantity: 6 },
  { type: "fertile", bounds: [30.0, 43.0, 37.0, 48.0], quantity: 7 },
  { type: "fertile", bounds: [52.0, 60.0, 62.0, 80.0], quantity: 6 },
  { type: "fertile", bounds: [13.5, 99.5, 16.0, 101.0], quantity: 6 },
  { type: "fertile", bounds: [20.0, 105.5, 21.5, 107.0], quantity: 6 },
  { type: "fertile", bounds: [34.5, 126.0, 37.5, 127.5], quantity: 5 },

  // Oceania
  { type: "fertile", bounds: [-37.0, 140.0, -29.0, 150.0], quantity: 6 },
  { type: "fertile", bounds: [-44.5, 170.5, -43.0, 173.0], quantity: 5 },

  // ═══════════════════════════════════════════════════
  // TIMBER - Forests (28)
  // ═══════════════════════════════════════════════════

  // Boreal
  { type: "timber", bounds: [52.0, -130.0, 62.0, -100.0], quantity: 9 },
  { type: "timber", bounds: [47.0, -100.0, 55.0, -60.0], quantity: 9 },
  { type: "timber", bounds: [60.0, 10.0, 68.0, 30.0], quantity: 8 },
  { type: "timber", bounds: [55.0, 35.0, 65.0, 60.0], quantity: 9 },
  { type: "timber", bounds: [55.0, 60.0, 66.0, 100.0], quantity: 9 },
  { type: "timber", bounds: [52.0, 100.0, 65.0, 140.0], quantity: 8 },
  { type: "timber", bounds: [60.0, -165.0, 67.0, -141.0], quantity: 6 },

  // Temperate
  { type: "timber", bounds: [42.0, -125.0, 55.0, -120.0], quantity: 8 },
  { type: "timber", bounds: [34.0, -85.0, 42.0, -77.0], quantity: 7 },
  { type: "timber", bounds: [47.0, 7.0, 52.0, 18.0], quantity: 6 },
  { type: "timber", bounds: [-46.0, -73.0, -38.0, -71.0], quantity: 6 },
  { type: "timber", bounds: [33.0, 130.0, 44.0, 145.0], quantity: 6 },
  { type: "timber", bounds: [30.0, -90.0, 36.0, -78.0], quantity: 7 },
  { type: "timber", bounds: [48.0, -130.0, 56.0, -122.0], quantity: 7 },
  { type: "timber", bounds: [42.0, 122.0, 52.0, 135.0], quantity: 7 },
  { type: "timber", bounds: [45.0, 22.0, 49.0, 27.0], quantity: 5 },

  // Tropical
  { type: "timber", bounds: [-8.0, -76.0, 2.0, -62.0], quantity: 10 },
  { type: "timber", bounds: [-8.0, -62.0, 0.0, -48.0], quantity: 10 },
  { type: "timber", bounds: [-5.0, 15.0, 4.0, 30.0], quantity: 9 },
  { type: "timber", bounds: [-4.0, 108.0, 7.0, 119.0], quantity: 8 },
  { type: "timber", bounds: [-6.0, 97.0, 6.0, 106.0], quantity: 7 },
  { type: "timber", bounds: [-8.0, 132.0, -1.0, 151.0], quantity: 7 },
  { type: "timber", bounds: [4.0, -9.0, 8.0, 4.0], quantity: 6 },
  { type: "timber", bounds: [10.0, -90.0, 18.0, -82.0], quantity: 5 },
  { type: "timber", bounds: [8.0, 73.0, 20.0, 77.0], quantity: 5 },
  { type: "timber", bounds: [14.0, 94.0, 22.0, 99.0], quantity: 6 },

  // ═══════════════════════════════════════════════════
  // IRON ORE (18)
  // ═══════════════════════════════════════════════════
  { type: "iron", bounds: [-7.0, -52.0, -5.0, -49.0], quantity: 10 },
  { type: "iron", bounds: [-24.0, 116.0, -20.0, 120.5], quantity: 10 },
  { type: "iron", bounds: [-21.0, -44.5, -19.5, -43.0], quantity: 9 },
  { type: "iron", bounds: [50.5, 35.0, 53.0, 39.0], quantity: 9 },
  { type: "iron", bounds: [53.0, -67.0, 59.0, -63.0], quantity: 8 },
  { type: "iron", bounds: [47.0, -93.5, 48.0, -91.5], quantity: 7 },
  { type: "iron", bounds: [47.0, 33.0, 48.5, 34.5], quantity: 8 },
  { type: "iron", bounds: [7.5, -9.5, 9.5, -8.5], quantity: 8 },
  { type: "iron", bounds: [67.0, 19.5, 68.0, 21.0], quantity: 7 },
  { type: "iron", bounds: [21.0, 84.0, 24.0, 87.0], quantity: 8 },
  { type: "iron", bounds: [-28.5, 22.5, -24.0, 28.0], quantity: 7 },
  { type: "iron", bounds: [31.0, 55.0, 33.0, 56.5], quantity: 6 },
  { type: "iron", bounds: [-29.0, -71.5, -26.0, -69.5], quantity: 5 },
  { type: "iron", bounds: [67.0, 32.0, 69.0, 37.0], quantity: 5 },
  { type: "iron", bounds: [38.0, 120.0, 43.0, 125.0], quantity: 7 },
  { type: "iron", bounds: [7.0, -9.0, 8.0, -8.0], quantity: 6 },
  { type: "iron", bounds: [-23.5, 117.0, -22.0, 119.0], quantity: 9 },
  { type: "iron", bounds: [-29.5, 115.5, -27.0, 118.0], quantity: 6 },

  // ═══════════════════════════════════════════════════
  // COPPER (15)
  // ═══════════════════════════════════════════════════
  { type: "copper", bounds: [-27.0, -71.0, -20.0, -68.0], quantity: 10 },
  { type: "copper", bounds: [-14.0, 25.0, -10.0, 29.5], quantity: 9 },
  { type: "copper", bounds: [39.0, -113.0, 41.5, -111.0], quantity: 7 },
  { type: "copper", bounds: [32.5, -110.5, 34.0, -109.0], quantity: 7 },
  { type: "copper", bounds: [-31.5, 136.0, -30.0, 137.5], quantity: 7 },
  { type: "copper", bounds: [-4.5, 136.5, -3.5, 138.0], quantity: 8 },
  { type: "copper", bounds: [68.5, 87.0, 70.0, 89.5], quantity: 7 },
  { type: "copper", bounds: [-17.0, -72.5, -13.0, -69.5], quantity: 8 },
  { type: "copper", bounds: [42.5, 106.5, 43.5, 107.5], quantity: 7 },
  { type: "copper", bounds: [28.5, 117.5, 29.5, 118.5], quantity: 6 },
  { type: "copper", bounds: [29.5, 55.5, 30.5, 56.5], quantity: 6 },
  { type: "copper", bounds: [-21.5, 139.0, -20.0, 140.5], quantity: 6 },
  { type: "copper", bounds: [48.5, 104.0, 49.5, 105.5], quantity: 6 },
  { type: "copper", bounds: [56.0, 118.0, 57.0, 119.5], quantity: 5 },
  { type: "copper", bounds: [-23.0, -69.0, -21.5, -68.0], quantity: 10 },

  // ═══════════════════════════════════════════════════
  // COAL (20)
  // ═══════════════════════════════════════════════════
  { type: "coal", bounds: [35.0, -84.0, 41.0, -78.0], quantity: 8 },
  { type: "coal", bounds: [42.5, -107.5, 46.0, -104.5], quantity: 9 },
  { type: "coal", bounds: [37.0, -90.0, 40.5, -86.5], quantity: 7 },
  { type: "coal", bounds: [35.0, 110.0, 40.0, 114.0], quantity: 10 },
  { type: "coal", bounds: [37.0, 106.0, 41.0, 112.0], quantity: 9 },
  { type: "coal", bounds: [52.5, 84.0, 56.0, 88.5], quantity: 8 },
  { type: "coal", bounds: [47.0, 36.0, 49.5, 41.0], quantity: 7 },
  { type: "coal", bounds: [51.0, 6.5, 52.0, 8.0], quantity: 5 },
  { type: "coal", bounds: [49.5, 18.0, 50.5, 19.5], quantity: 7 },
  { type: "coal", bounds: [-33.0, 150.0, -31.5, 152.0], quantity: 7 },
  { type: "coal", bounds: [-24.0, 147.5, -20.5, 150.0], quantity: 8 },
  { type: "coal", bounds: [23.0, 85.5, 24.5, 87.5], quantity: 8 },
  { type: "coal", bounds: [-28.0, 28.0, -25.5, 30.5], quantity: 8 },
  { type: "coal", bounds: [49.0, 72.0, 50.5, 74.0], quantity: 6 },
  { type: "coal", bounds: [50.0, -117.5, 54.0, -114.0], quantity: 6 },
  { type: "coal", bounds: [58.0, 88.0, 68.0, 110.0], quantity: 7 },
  { type: "coal", bounds: [53.0, -2.5, 54.5, -1.0], quantity: 4 },
  { type: "coal", bounds: [10.5, -73.5, 11.5, -72.0], quantity: 6 },
  { type: "coal", bounds: [24.0, 69.0, 26.5, 71.0], quantity: 6 },
  { type: "coal", bounds: [49.0, 6.5, 49.5, 7.5], quantity: 4 },

  // ═══════════════════════════════════════════════════
  // OIL & GAS (22)
  // ═══════════════════════════════════════════════════
  { type: "oil", bounds: [22.0, 46.0, 32.0, 56.0], quantity: 10 },
  { type: "oil", bounds: [56.0, 65.0, 68.0, 82.0], quantity: 10 },
  { type: "oil", bounds: [30.5, -105.0, 33.5, -100.5], quantity: 9 },
  { type: "oil", bounds: [26.0, -97.0, 30.5, -88.0], quantity: 8 },
  { type: "oil", bounds: [55.0, -114.0, 59.0, -109.0], quantity: 9 },
  { type: "oil", bounds: [7.0, -66.0, 9.5, -62.0], quantity: 9 },
  { type: "oil", bounds: [56.0, -1.0, 62.0, 5.0], quantity: 7 },
  { type: "oil", bounds: [38.0, 49.0, 47.0, 55.0], quantity: 8 },
  { type: "oil", bounds: [4.0, 5.0, 7.0, 9.0], quantity: 8 },
  { type: "oil", bounds: [27.0, 15.0, 32.0, 21.0], quantity: 7 },
  { type: "oil", bounds: [29.0, 3.0, 33.0, 9.0], quantity: 7 },
  { type: "oil", bounds: [46.5, -105.0, 49.0, -101.0], quantity: 7 },
  { type: "oil", bounds: [50.0, 48.0, 58.0, 56.0], quantity: 7 },
  { type: "oil", bounds: [-26.0, -45.0, -21.0, -38.0], quantity: 8 },
  { type: "oil", bounds: [45.0, 124.0, 47.5, 126.5], quantity: 6 },
  { type: "oil", bounds: [6.0, 109.0, 16.0, 118.0], quantity: 5 },
  { type: "oil", bounds: [69.5, -152.0, 71.0, -146.0], quantity: 7 },
  { type: "oil", bounds: [45.0, 51.0, 47.0, 54.0], quantity: 7 },
  { type: "oil", bounds: [-10.0, 10.5, -5.5, 13.5], quantity: 7 },
  { type: "oil", bounds: [27.5, -100.0, 30.0, -96.5], quantity: 7 },
  { type: "oil", bounds: [23.0, 48.0, 26.5, 50.0], quantity: 10 },
  { type: "oil", bounds: [-29.0, 139.0, -26.0, 143.0], quantity: 4 },

  // ═══════════════════════════════════════════════════
  // GOLD (16)
  // ═══════════════════════════════════════════════════
  { type: "gold", bounds: [-27.5, 26.0, -25.5, 29.0], quantity: 10 },
  { type: "gold", bounds: [39.5, -117.5, 42.0, -115.0], quantity: 8 },
  { type: "gold", bounds: [-32.0, 119.0, -29.0, 122.5], quantity: 8 },
  { type: "gold", bounds: [47.5, -93.5, 51.0, -79.5], quantity: 7 },
  { type: "gold", bounds: [62.0, -141.0, 65.0, -136.0], quantity: 5 },
  { type: "gold", bounds: [5.0, -3.0, 8.0, -1.0], quantity: 7 },
  { type: "gold", bounds: [57.0, 112.0, 63.0, 120.0], quantity: 7 },
  { type: "gold", bounds: [-7.5, -79.0, -6.5, -78.0], quantity: 7 },
  { type: "gold", bounds: [-7.0, 145.0, -5.0, 148.0], quantity: 6 },
  { type: "gold", bounds: [36.0, 119.0, 38.0, 122.0], quantity: 6 },
  { type: "gold", bounds: [41.0, 63.5, 42.5, 65.0], quantity: 7 },
  { type: "gold", bounds: [-21.0, -45.0, -18.5, -42.5], quantity: 5 },
  { type: "gold", bounds: [60.0, 148.0, 64.0, 156.0], quantity: 6 },
  { type: "gold", bounds: [11.0, -10.0, 14.0, -6.0], quantity: 6 },
  { type: "gold", bounds: [-38.0, 143.5, -36.5, 145.0], quantity: 5 },
  { type: "gold", bounds: [-13.5, -71.0, -11.0, -68.5], quantity: 5 },

  // ═══════════════════════════════════════════════════
  // LITHIUM (10)
  // ═══════════════════════════════════════════════════
  { type: "lithium", bounds: [-24.0, -69.0, -22.5, -68.0], quantity: 10 },
  { type: "lithium", bounds: [-21.0, -68.5, -19.5, -66.5], quantity: 10 },
  { type: "lithium", bounds: [-26.0, -68.0, -24.5, -66.5], quantity: 8 },
  { type: "lithium", bounds: [-34.0, 116.0, -33.0, 117.0], quantity: 7 },
  { type: "lithium", bounds: [-21.5, 119.0, -20.5, 119.5], quantity: 6 },
  { type: "lithium", bounds: [27.0, 114.0, 29.0, 116.0], quantity: 7 },
  { type: "lithium", bounds: [36.0, 95.0, 38.0, 99.0], quantity: 7 },
  { type: "lithium", bounds: [35.0, -82.0, 35.5, -81.0], quantity: 4 },
  { type: "lithium", bounds: [41.0, -118.0, 42.0, -117.0], quantity: 6 },
  { type: "lithium", bounds: [44.0, 19.0, 44.8, 19.8], quantity: 6 },

  // ═══════════════════════════════════════════════════
  // FISH - Fishing Grounds (20)
  // ═══════════════════════════════════════════════════
  { type: "fish", bounds: [42.0, -55.0, 48.0, -48.0], quantity: 8 },
  { type: "fish", bounds: [40.0, -70.0, 43.0, -65.0], quantity: 7 },
  { type: "fish", bounds: [51.0, -3.0, 62.0, 8.0], quantity: 8 },
  { type: "fish", bounds: [66.0, 5.0, 75.0, 35.0], quantity: 8 },
  { type: "fish", bounds: [-20.0, -82.0, -5.0, -71.0], quantity: 10 },
  { type: "fish", bounds: [15.0, -20.0, 30.0, -10.0], quantity: 7 },
  { type: "fish", bounds: [-33.0, 12.0, -17.0, 18.0], quantity: 7 },
  { type: "fish", bounds: [46.0, 137.0, 60.0, 157.0], quantity: 8 },
  { type: "fish", bounds: [52.0, 165.0, 65.0, -165.0], quantity: 8 },
  { type: "fish", bounds: [54.0, -155.0, 60.0, -135.0], quantity: 7 },
  { type: "fish", bounds: [25.0, 120.0, 33.0, 130.0], quantity: 7 },
  { type: "fish", bounds: [5.0, 105.0, 22.0, 117.0], quantity: 6 },
  { type: "fish", bounds: [14.0, 80.0, 23.0, 92.0], quantity: 6 },
  { type: "fish", bounds: [10.0, 68.0, 22.0, 77.0], quantity: 5 },
  { type: "fish", bounds: [0.0, -5.0, 6.0, 5.0], quantity: 5 },
  { type: "fish", bounds: [-52.0, -68.0, -38.0, -55.0], quantity: 7 },
  { type: "fish", bounds: [62.0, -27.0, 67.0, -13.0], quantity: 7 },
  { type: "fish", bounds: [-10.0, 110.0, -3.0, 140.0], quantity: 6 },
  { type: "fish", bounds: [6.0, 99.0, 13.0, 105.0], quantity: 5 },
  { type: "fish", bounds: [-2.0, 42.0, 12.0, 52.0], quantity: 5 },
];

// Color mapping
export const RESOURCE_COLORS: Record<string, string> = {
  water: "#2563eb",
  fertile: "#16a34a",
  timber: "#65a30d",
  iron: "#dc2626",
  copper: "#ea580c",
  coal: "#57534e",
  oil: "#1c1917",
  gold: "#eab308",
  lithium: "#06b6d4",
  fish: "#0891b2",
};

export const RESOURCE_LABELS: Record<string, string> = {
  water: "Fresh Water",
  fertile: "Fertile Land",
  timber: "Timber",
  iron: "Iron Ore",
  copper: "Copper",
  coal: "Coal",
  oil: "Oil & Gas",
  gold: "Gold",
  lithium: "Lithium",
  fish: "Fish",
};

// Opacity by quantity (higher = more visible)
export function quantityOpacity(qty: number): number {
  return 0.08 + (qty / 10) * 0.22; // Range: 0.08 to 0.30
}
