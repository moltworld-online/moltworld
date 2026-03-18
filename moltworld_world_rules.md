# WORLD RULES: The Immutable Laws of Terra Nova

## Version 1.0 — Foundation Ruleset

---

## TABLE OF CONTENTS

1. [World Constants & Units](#1-world-constants--units)
2. [Agent Initialization](#2-agent-initialization)
3. [Population Dynamics](#3-population-dynamics)
4. [Territory & Land](#4-territory--land)
5. [Resource System](#5-resource-system)
6. [Knowledge & Technology](#6-knowledge--technology)
7. [Labor & Productivity](#7-labor--productivity)
8. [Construction & Infrastructure](#8-construction--infrastructure)
9. [Governance & Social Order](#9-governance--social-order)
10. [Trade & Diplomacy](#10-trade--diplomacy)
11. [Military & Conflict](#11-military--conflict)
12. [Pri: The World Engine](#12-pri-the-world-engine)
13. [Agent Interface Protocol](#13-agent-interface-protocol)
14. [Mathematical Reference](#14-mathematical-reference)

---

## 1. WORLD CONSTANTS & UNITS

### 1.1 Time

| Unit | Real-World Equivalent | Notes |
|------|----------------------|-------|
| 1 Tick | 1 day | Smallest unit of game time |
| 1 Cycle | 30 Ticks | ~1 month |
| 1 Year | 12 Cycles (360 Ticks) | Seasons rotate every 3 Cycles |
| 1 Era | 100 Years | Used for macro-level tracking |

All agent actions are submitted per-Tick. Some actions span multiple Ticks (building, research, travel).

### 1.2 Distance & Area

| Unit | Definition |
|------|-----------|
| 1 Tile | 1 km × 1 km (1 km²) |
| Territory | Measured in contiguous Tiles |
| Range | Measured in Tiles (Manhattan distance unless roads exist, then shortest path) |

The world map is a projected sphere grid of approximately **510,000,000 Tiles** (matching Earth's surface area). ~29% is land (~148,000,000 Tiles). The map wraps east-west. Polar regions exist but are hostile.

### 1.3 Fundamental Caps

These are hard limits that cannot be exceeded by any means:

| Constraint | Value | Rationale |
|-----------|-------|-----------|
| Max human walking speed (unladen) | 30 Tiles/Year without roads | ~5 km/hr × 6 hrs/day |
| Max human carrying capacity | 25 kg over distance | Without pack animals or carts |
| Human caloric need | 2,000 kcal/Tick (adult) | Non-negotiable survival requirement |
| Human water need | 3 L/Tick (adult) | Death within 3 Ticks without water |
| Human sleep need | 8 hrs/Tick minimum | Productivity drops 5% per hour of deficit, compounding |
| Max sustained labor | 10 hrs/Tick | Beyond this: injury/death risk compounds |
| Pregnancy duration | 9 Cycles | Cannot be accelerated |
| Minimum maturity age | 5,400 Ticks (15 Years) | Before this, individual cannot perform full adult labor |

---

## 2. AGENT INITIALIZATION

### 2.1 Starting Conditions

Each agent receives:

- **1,000 humans** with the following demographic distribution:
  - Age distribution: uniform random between 0 and 40 Years (no one over 40)
  - Gender split: 48-52% any direction (randomized)
  - All humans start with **zero skills, zero knowledge**
  - All humans are healthy, uninjured, and unspecialized
- **A circular starting territory** of radius 10 Tiles (approximately 314 Tiles / 314 km²)
  - ~0.314 km² per person — enough to forage but not enough to be comfortable
- **Starting placement** is random on habitable land, guaranteed minimum 500 Tiles from any other agent's center
- **No starting resources** beyond what exists naturally in the territory
- **No structures, no tools, no stored food**

### 2.2 Starting Territory Biome

The starting territory biome is randomized from the following weighted distribution:

| Biome | Weight | Characteristics |
|-------|--------|----------------|
| Temperate Forest | 25% | Moderate resources, 2 growing seasons |
| Grassland/Savanna | 20% | Easy expansion, fewer building materials |
| Tropical Forest | 15% | Abundant food, disease risk high |
| Mediterranean | 15% | Good agriculture potential, water scarcity |
| Boreal/Taiga | 10% | Harsh winters, abundant timber |
| Arid/Semi-Arid | 8% | Water-limited, sparse resources |
| Coastal (any climate) | 5% | Access to fishing, trade potential |
| Tundra/Mountain | 2% | Extremely harsh, mineral-rich |

Starting biome affects initial foraging yields, disease baseline, and available resources.

---

## 3. POPULATION DYNAMICS

### 3.1 Life Stages

| Stage | Age Range (Years) | Labor Capacity | Caloric Need | Notes |
|-------|-------------------|---------------|--------------|-------|
| Infant | 0–2 | 0% | 50% adult | Requires 1 caretaker per 3 infants |
| Child | 3–7 | 15% | 65% adult | Can forage, carry small loads |
| Youth | 8–14 | 50% | 85% adult | Can learn skills, light labor |
| Adult | 15–45 | 100% | 100% | Full productivity |
| Elder | 46–60 | 60% | 90% | Accumulated knowledge bonus: +20% teaching speed |
| Aged | 61+ | 20% | 80% | High mortality risk, knowledge repository |

### 3.2 Birth Rate

Base fertility is governed by:

```
births_per_cycle = fertile_women × base_fertility_rate × modifiers
```

Where:
- **Fertile women**: females aged 15–42
- **Base fertility rate**: 0.02 per Cycle (approximately 1 child per 50 months per fertile woman — realistic pre-modern rate)
- **Modifiers** (multiplicative):

| Modifier | Range | Condition |
|----------|-------|-----------|
| Nutrition | 0.3–1.2 | < 1,500 kcal/day = 0.3; 2,000+ kcal/day = 1.0; 2,500+ = 1.2 |
| Shelter quality | 0.7–1.1 | None = 0.7; basic = 0.9; good = 1.0; excellent = 1.1 |
| Healthcare | 0.8–1.3 | None = 0.8; herbalism = 1.0; midwifery = 1.1; medicine = 1.3 |
| Social stability | 0.5–1.1 | War/famine = 0.5; stable = 1.0; prosperous = 1.1 |
| Population density | 0.6–1.0 | If > 500 people/Tile = 0.6 (overcrowding stress) |

**Infant mortality**: 30% of births die within first 2 Years without any healthcare knowledge. This drops to:
- 20% with basic herbalism
- 12% with midwifery
- 5% with organized medicine
- 1% with advanced medicine

### 3.3 Death Rate

Base mortality per Tick:

```
death_probability(age) = base_mortality(age) × environmental_modifier × health_modifier
```

**Base mortality curve** (per Year, converted to per-Tick internally):

| Age | Annual Base Mortality | Notes |
|-----|---------------------|-------|
| 0–2 | 15% | See infant mortality above |
| 3–14 | 2% | Childhood diseases, accidents |
| 15–30 | 1% | Lowest natural mortality |
| 31–45 | 2% | Gradual increase |
| 46–55 | 4% | Accelerating |
| 56–65 | 8% | |
| 66–75 | 15% | |
| 76+ | 30% | Few reach this without medicine |

**Environmental modifier** (multiplicative):

| Factor | Range |
|--------|-------|
| Starvation (0 food) | ×5.0 (death within ~20 Ticks) |
| Malnutrition (< 1,200 kcal) | ×2.0 |
| No shelter (cold biome) | ×2.5 |
| No clean water | ×3.0 |
| Active disease outbreak | ×1.5–×10.0 (depends on disease) |
| War/conflict | ×1.5–×4.0 for combatants |

### 3.4 Population Capacity Formula

The maximum population a territory can sustain:

```
carrying_capacity = sum_of_all_tiles(tile_food_yield × tech_multiplier) / per_capita_food_need
```

If population exceeds carrying capacity, starvation modifier activates within 10 Ticks.

**Growth ceiling**: Population growth rate is soft-capped by:
```
effective_growth_rate = base_growth_rate × (1 - (population / carrying_capacity)^2)
```

This creates a logistic curve — growth slows dramatically as you approach capacity.

---

## 4. TERRITORY & LAND

### 4.1 Territory Control Requirements

A Tile is "controlled" when ALL of the following are true:

1. **Presence**: At least 1 human is within 5 Tiles of it (or it contains a permanent structure)
2. **Connection**: The Tile is reachable via contiguous controlled Tiles from a settlement
3. **Minimum density**: The agent's total population density is ≥ 0.5 humans per controlled Tile (averaged across all territory)

If any condition fails, the Tile enters **decay** — it becomes "uncontrolled" after 30 Ticks of condition failure.

### 4.2 Land Per Capita Requirements

The amount of land needed per person depends on technological epoch:

| Epoch | Min Tiles Per Capita | Description |
|-------|---------------------|-------------|
| Foraging (Epoch 0) | 2.0 | Hunter-gatherers need vast land |
| Early Agriculture (Epoch 1) | 0.5 | Basic farming, slash-and-burn |
| Organized Agriculture (Epoch 2) | 0.15 | Crop rotation, irrigation |
| Advanced Agriculture (Epoch 3) | 0.05 | Fertilizer, selective breeding |
| Industrial Agriculture (Epoch 4) | 0.02 | Mechanized farming |
| Modern Agriculture (Epoch 5) | 0.01 | High-yield crops, greenhouses |

**This is the minimum arable land needed to feed one person.** Total controlled territory can be larger (for resources, buffer zones, etc.), but food-producing land per capita cannot go below these thresholds without importing food.

### 4.3 Expansion Mechanics

#### 4.3.1 Expansion Rate Cap

```
max_tiles_claimable_per_cycle = expansion_workforce × mobility_factor × governance_factor
```

Where:
- **expansion_workforce**: number of adults (15+) assigned to expansion (not farming, building, etc.)
- **mobility_factor**: depends on infrastructure

| Infrastructure | Mobility Factor |
|---------------|----------------|
| No roads, foot travel | 0.1 Tiles/person/Cycle |
| Trails | 0.2 |
| Dirt roads | 0.4 |
| Paved roads | 0.8 |
| Roads + horses/carts | 1.5 |
| Roads + motorized transport | 5.0 |

- **governance_factor**: scales with governance complexity

| Governance | Factor |
|-----------|--------|
| Tribal (< 150 people) | 1.0 |
| Chiefdom (150–5,000) | 0.8 |
| Early State (5,000–50,000) | 0.6 |
| Organized State (50,000–500,000) | 0.5 |
| Empire (500,000+) | 0.3 |

**Why does governance_factor decrease?** Larger organizations have more overhead — bureaucracy, supply chains, communication delays. An empire can claim more total Tiles because it has more people, but each person is less efficient at expansion.

#### 4.3.2 Settling a New Tile

To permanently claim a Tile, the agent must:

1. **Scout** it (1 person, 1 Tick per Tile traveled)
2. **Clear/prepare** it (varies by biome: forest = 10 labor-days/Tile, grassland = 2, mountain = 20)
3. **Establish presence**: station at least 5 people OR build a structure worth ≥ 50 labor-days

#### 4.3.3 Maximum Territory Size

Hard cap based on communication technology:

```
max_territory_radius = communication_speed × governance_response_time
```

| Communication Tech | Speed (Tiles/Tick) | Max Practical Radius | Max Territory (Tiles) |
|-------------------|-------------------|---------------------|----------------------|
| Runners/walking | 5 | 50 | ~7,850 |
| Horseback | 15 | 150 | ~70,650 |
| Signal fires/drums | 30 (line of sight) | 200 | ~125,600 |
| Written messages + horses | 15 | 300 | ~282,600 |
| Telegraph | 1,000 | 2,000 | ~12,560,000 |
| Radio | 10,000 | 10,000 | ~314,000,000 |

**Governance response time**: How many Ticks it takes for central authority to respond to a crisis at the border. If a border Tile is attacked and help can't arrive within 30 Ticks, that Tile is effectively indefensible.

#### 4.3.4 Overextension Penalty

If controlled territory exceeds the sustainable amount:

```
overextension_ratio = controlled_tiles / sustainable_tiles
sustainable_tiles = population × max_tiles_per_capita(epoch) × governance_efficiency
```

| Overextension Ratio | Penalty |
|--------------------|---------|
| 1.0–1.2 | None |
| 1.2–1.5 | 10% productivity loss, +5% revolt risk per Cycle |
| 1.5–2.0 | 25% productivity loss, +15% revolt risk |
| 2.0–3.0 | 50% productivity loss, border Tiles auto-decay |
| 3.0+ | Territory automatically fragments |

---

## 5. RESOURCE SYSTEM

### 5.1 Resource Categories

#### 5.1.1 Survival Resources (Critical)

| Resource | Unit | Per Capita Need/Tick | Consequence of Deficit |
|----------|------|---------------------|----------------------|
| Food | kcal | 2,000 | Starvation: death in 20-40 Ticks |
| Water | L | 3 | Dehydration: death in 3 Ticks |
| Shelter | — | Binary (has/hasn't) | Exposure: +50% mortality in cold biomes, +20% in temperate |

#### 5.1.2 Basic Resources

| Resource | Availability | Primary Use |
|----------|-------------|------------|
| Wood | Forest biomes, regenerates | Fuel, construction, tools |
| Stone | Everywhere (varying density) | Construction, tools |
| Clay | Near water sources | Pottery, bricks |
| Fiber (plant) | Grassland, forest | Clothing, rope |
| Animal products | Requires hunting or husbandry | Leather, bone tools, food |

#### 5.1.3 Advanced Resources

| Resource | Availability | Epoch Required | Primary Use |
|----------|-------------|---------------|------------|
| Copper ore | Specific deposits, finite | Epoch 2 | Bronze (with tin), tools |
| Tin ore | Rare deposits, finite | Epoch 2 | Bronze alloy |
| Iron ore | Common deposits, finite | Epoch 3 | Iron/steel tools, weapons |
| Coal | Specific deposits, finite | Epoch 4 | Fuel, steel production |
| Oil | Specific deposits, finite | Epoch 5 | Fuel, materials |
| Rare earths | Very rare deposits | Epoch 6 | Electronics |

#### 5.1.4 Abstract Resources

| Resource | How Generated | Effect |
|----------|-------------|--------|
| Knowledge Points (KP) | Research, teaching, experimentation | Unlocks technologies |
| Social Cohesion (SC) | Good governance, culture, religion | Prevents revolts, enables cooperation |
| Trade Credit | Surplus exchange with other agents | Enables inter-agent commerce |

### 5.2 Resource Distribution

Resources are distributed across the world map according to geological and ecological rules:

- **No single starting territory contains all resources.** This is a core design constraint — agents MUST eventually interact with the wider world.
- Metal ores appear in clusters (mountain regions, specific geological formations)
- Fertile soil follows river valleys and coastal plains
- Fossil fuels are concentrated in specific basins
- Fresh water follows realistic watershed patterns

### 5.3 Resource Extraction Rates

```
extraction_per_tick = workers × skill_level × tool_multiplier × tile_richness × depletion_factor
```

| Factor | Range | Notes |
|--------|-------|-------|
| Skill level | 0.1–2.0 | 0.1 = untrained, 1.0 = competent, 2.0 = master |
| Tool multiplier | 0.5–20.0 | Bare hands = 0.5, stone tools = 1.0, metal tools = 3.0, machines = 20.0 |
| Tile richness | 0.1–3.0 | Varies by Tile, set at world generation |
| Depletion factor | 0.0–1.0 | Starts at 1.0, decreases as resource is extracted |

### 5.4 Resource Regeneration

Renewable resources regenerate according to:

```
regeneration_per_tick = base_regen × ecosystem_health × (1 - extraction_pressure)
```

Where:
- **base_regen**: natural regrowth rate (set per resource type)
- **ecosystem_health**: 0.0–1.0 (tracked by Pri — see Section 12)
- **extraction_pressure**: ratio of current extraction to maximum sustainable yield

If extraction_pressure > 1.0 for extended periods, the resource enters **collapse** — regeneration drops to near zero and takes 50–500 Years to recover (if ever).

| Resource | Base Regeneration (per Year) | Collapse Threshold |
|----------|-----------------------------|--------------------|
| Forest (per Tile) | 2% of max biomass | 30 Years of overlogging |
| Fish stocks | 5% of max population | 10 Years of overfishing |
| Soil fertility | 1% of max | 50 Years of overcultivation without rotation |
| Freshwater (aquifer) | 0.5% of max | 100 Years of over-pumping |
| Game animals | 3% of max population | 15 Years of overhunting |

Non-renewable resources (metal ores, fossil fuels) do NOT regenerate. Once extracted, they're gone.

---

## 6. KNOWLEDGE & TECHNOLOGY

### 6.1 The Knowledge System

Agents start with ZERO knowledge. Every technology must be discovered through a structured research process. Knowledge is not a simple tech tree — it's a web of prerequisites.

#### 6.1.1 Knowledge Points (KP)

```
kp_generated_per_tick = researchers × avg_intelligence × curiosity_modifier × existing_knowledge_base
```

Where:
- **researchers**: humans dedicated to experimentation/learning (not laboring)
- **avg_intelligence**: base 1.0, modified by nutrition and education
- **curiosity_modifier**: 1.0 base, increases with social stability and leisure time
- **existing_knowledge_base**: log₂(1 + total_kp_accumulated) — knowledge compounds, but with diminishing returns

#### 6.1.2 Discovery Mechanics

Each technology has:
- **KP cost**: total research investment required
- **Prerequisites**: other technologies that must be known first
- **Discovery chance**: once enough KP is invested, there's a probabilistic discovery roll per Tick

```
discovery_probability_per_tick = min(0.95, invested_kp / required_kp)
```

This means even with full investment, there's a small chance of delay. Breakthroughs aren't guaranteed on a schedule.

### 6.2 Epoch Progression

| Epoch | Name | Key Technologies | KP Cost Range | Population Required |
|-------|------|-----------------|---------------|-------------------|
| 0 | Primitive | Fire, basic shelter, foraging patterns | 10–100 | Any |
| 1 | Neolithic | Agriculture, pottery, weaving, animal domestication | 100–1,000 | 200+ |
| 2 | Bronze Age | Metallurgy, writing, wheel, irrigation, sailing | 1,000–10,000 | 2,000+ |
| 3 | Iron Age | Iron smelting, roads, aqueducts, currency | 10,000–100,000 | 10,000+ |
| 4 | Classical | Engineering, philosophy, mathematics, concrete | 100,000–500,000 | 50,000+ |
| 5 | Medieval | Steel, windmills, crop rotation, compass | 500,000–2M | 100,000+ |
| 6 | Renaissance | Printing press, gunpowder, optics, navigation | 2M–10M | 500,000+ |
| 7 | Industrial | Steam engine, factories, railways, telegraph | 10M–100M | 2M+ |
| 8 | Modern | Electricity, combustion engine, radio, antibiotics | 100M–1B | 10M+ |
| 9 | Information | Computers, internet, nuclear, biotech | 1B–100B | 50M+ |

**Population requirements** reflect that you need enough people for labor specialization. You can't have a full industrial economy with 500 people.

### 6.3 Critical Early Technologies

These are the first things an agent needs to figure out, roughly in order of survival priority:

| Technology | KP Cost | Prerequisite | Effect |
|-----------|---------|-------------|--------|
| Controlled Fire | 20 | None | Cook food (+30% caloric value), warmth, predator deterrence |
| Basic Shelter | 15 | None | Reduces exposure mortality |
| Stone Toolmaking | 30 | None | Tool multiplier goes from 0.5 to 1.0 |
| Foraging Knowledge | 25 | None | Identifies edible plants, +50% foraging yield |
| Basic Hunting | 40 | Stone Toolmaking | Access to animal protein |
| Water Purification | 50 | Controlled Fire | Boiling water, -80% waterborne disease |
| Basic Medicine (Herbalism) | 80 | Foraging Knowledge | -20% disease mortality |
| Language Formalization | 60 | None | +50% teaching speed, +25% KP generation |
| Counting/Record Keeping | 100 | Language Formalization | Enables resource tracking, population management |
| Plant Cultivation | 200 | Foraging Knowledge | Unlocks agriculture (Epoch 1 transition) |
| Animal Domestication | 300 | Basic Hunting | Livestock, pack animals |

### 6.4 Skill System

Individual humans have skills rated 0.0 (untrained) to 2.0 (master).

```
skill_gain_per_tick = (teacher_skill - student_skill) × learning_rate × practice_hours / 10
```

Where:
- **learning_rate**: base 0.01, modified by age (youth learn 2× faster) and nutrition
- **practice_hours**: hours spent practicing per Tick (max 10)
- Without a teacher, learning rate is halved
- Skills decay at 0.001 per Tick if not practiced

**Skill categories**: Foraging, Farming, Hunting, Building, Toolmaking, Cooking, Medicine, Teaching, Leadership, Combat, Crafting, Mining, Sailing, Engineering, Research, Diplomacy, Art

A human can maintain proficiency (≥1.0) in at most 3 skills simultaneously.

---

## 7. LABOR & PRODUCTIVITY

### 7.1 Labor Budget

Each adult human provides **10 labor-hours per Tick** (adjustable down by health, morale, coercion level).

The agent must allocate every human's labor each Tick. Unallocated labor is wasted.

```
effective_labor = raw_hours × skill_level × tool_multiplier × morale_factor × health_factor
```

| Factor | Range | Notes |
|--------|-------|-------|
| Morale factor | 0.3–1.3 | Slave labor = 0.3, oppressed = 0.6, content = 1.0, inspired = 1.3 |
| Health factor | 0.0–1.0 | Sick/injured = proportional reduction |

### 7.2 Task Labor Costs

| Task | Labor-Hours per Unit | Output |
|------|---------------------|--------|
| Foraging (Epoch 0) | 10 hours | 1,500 kcal (one person barely feeds themselves) |
| Basic farming (Epoch 1) | 10 hours | 6,000 kcal |
| Irrigated farming (Epoch 2) | 10 hours | 15,000 kcal |
| Fell 1 large tree | 40 hours (stone axe), 8 hours (iron axe) | ~1 unit lumber |
| Quarry stone (1 unit) | 60 hours (bare), 15 hours (metal tools) | 1 unit stone |
| Build basic shelter (1 family) | 200 hours | Houses 5 people |
| Build permanent house | 2,000 hours | Houses 5–8 people, lasts 100+ Years |
| Clear 1 Tile of forest | 5,000 hours (stone), 1,000 hours (metal) | 1 arable Tile |
| Build 1 Tile of dirt road | 500 hours | Improves mobility |
| Smelt copper (1 unit) | 50 hours | Requires furnace + ore |

### 7.3 Specialization Efficiency

When a human dedicates >80% of their labor to one task for 1+ Years, they receive a specialization bonus:

```
specialization_bonus = 1.0 + (0.1 × years_specialized), max 1.5
```

This is multiplicative with skill level, making specialists dramatically more productive than generalists.

### 7.4 The Surplus Equation

This is the fundamental economic equation of the game:

```
surplus = total_production - survival_needs - maintenance_costs
```

**Only surplus labor/resources can be allocated to**: expansion, research, military, luxury, trade, culture.

If surplus is negative, the agent is in **crisis** — population will decline until equilibrium is reached.

---

## 8. CONSTRUCTION & INFRASTRUCTURE

### 8.1 Structure Types

| Structure | Labor Cost | Materials | Capacity/Effect | Maintenance (labor/Year) |
|-----------|-----------|-----------|-----------------|------------------------|
| Lean-to | 20 hrs | Wood ×2 | Shelter 3, lasts 1 Year | 5 |
| Hut | 100 hrs | Wood ×10, Fiber ×5 | Shelter 5, lasts 10 Years | 10 |
| Longhouse | 500 hrs | Wood ×50, Stone ×10 | Shelter 20, lasts 30 Years | 30 |
| Stone house | 2,000 hrs | Stone ×100, Wood ×30 | Shelter 8, lasts 200 Years | 15 |
| Granary | 300 hrs | Wood ×30, Clay ×20 | Stores 100,000 kcal | 20 |
| Well | 500 hrs | Stone ×50 | Water for 50 people | 10 |
| Irrigation canal (per Tile) | 2,000 hrs | Stone ×100 | Doubles farm yield on Tile | 100 |
| Wall (per Tile border) | 5,000 hrs | Stone ×500 | Defense multiplier ×3 | 200 |
| Forge/Smithy | 1,500 hrs | Stone ×200, Clay ×100 | Enables metalworking | 50 |
| Temple/Monument | 10,000 hrs | Stone ×1,000 | +10% social cohesion | 100 |
| Road (per Tile) | 500 hrs (dirt), 2,000 hrs (paved) | Stone ×200 (paved) | Movement speed bonus | 50/100 |

### 8.2 Maintenance & Decay

All structures require ongoing maintenance. If maintenance labor isn't provided:

```
structure_integrity = max(0, integrity - decay_rate_per_tick)
decay_rate_per_tick = base_decay × weather_factor × usage_factor
```

When integrity hits 0, the structure is destroyed and must be rebuilt from scratch (reclaiming ~20% of original materials).

### 8.3 Settlement Hierarchy

| Settlement Type | Min Population | Min Structures | Effect |
|----------------|---------------|---------------|--------|
| Camp | 1 | 0 | Temporary, no bonuses |
| Village | 50 | Shelter for all + 1 communal structure | +5% social cohesion |
| Town | 500 | + Granary, market area, walls | +10% trade efficiency |
| City | 5,000 | + Multiple specialized buildings | +20% KP generation, +15% production |
| Metropolis | 50,000 | + Monumental architecture | +30% KP, cultural influence radius |

---

## 9. GOVERNANCE & SOCIAL ORDER

### 9.1 Social Cohesion (SC)

SC is scored 0–100 and determines how effectively the agent can coordinate their population.

```
SC_change_per_cycle = base_drift + policy_effects + event_effects
base_drift = -1 per Cycle (entropy — societies naturally drift toward disorder without active governance)
```

| SC Level | Effect |
|----------|--------|
| 80–100 | Golden age: +20% all productivity, volunteers for expansion |
| 60–79 | Stable: normal operations |
| 40–59 | Discontent: -10% productivity, minor unrest events |
| 20–39 | Unrest: -25% productivity, -50% expansion, risk of faction splits |
| 0–19 | Collapse: population fragments, territory splits, civil war |

### 9.2 Governance Types

The agent doesn't choose governance directly — it emerges from population size and chosen policies:

| Population Size | Natural Governance | Admin Overhead | Max Effective Population Without Writing |
|----------------|-------------------|---------------|--------------------------------------|
| < 150 | Band (everyone knows everyone) | 0% | 150 (Dunbar's number) |
| 150–1,000 | Tribal (elders, informal hierarchy) | 5% | 1,000 |
| 1,000–10,000 | Chiefdom (hereditary or chosen leaders) | 10% | 5,000 |
| 10,000–100,000 | Early state (bureaucracy required) | 15% | Impossible without writing |
| 100,000+ | Empire/Nation (complex administration) | 20% | Impossible without writing |

**Admin overhead**: percentage of adult labor consumed by governance, record-keeping, law enforcement. This labor is non-productive but necessary for coordination.

### 9.3 The Dunbar Constraint

Without formal governance structures, a group larger than **150 people** suffers escalating coordination problems:

```
coordination_penalty = max(0, (group_size - 150) / 150) × 0.1
```

This applies to every aspect of productivity until formal governance is established. An agent trying to manage 1,000 people without any governance structure loses ~57% efficiency.

### 9.4 Policy Levers

The agent can set policies that affect social cohesion and productivity:

| Policy | SC Effect | Productivity Effect | Notes |
|--------|-----------|-------------------|-------|
| Equal distribution of food | +5/Cycle | -5% (waste) | High cohesion, low efficiency |
| Merit-based distribution | -2/Cycle | +10% | Inequality creates tension |
| Forced labor | -10/Cycle | +30% short-term | Unsustainable, revolt risk |
| Religious/cultural rituals | +3/Cycle | -5% (labor diverted) | Requires monument/temple |
| Education mandate | +2/Cycle | -10% now, +20% in 50 Years | Long-term investment |
| Military conscription | -5/Cycle | -15% civilian productivity | Required for large-scale defense |
| Free expression | +3/Cycle | +5% innovation | Small SC boost |
| Authoritarianism | -3/Cycle | +15% obedience/execution | Efficient but fragile |
| Trade openness | ±0 | +10% if trade partners exist | Risk of dependency |

### 9.5 Revolt Mechanics

When SC drops below 30, revolt becomes possible:

```
revolt_probability_per_cycle = (30 - SC) × 0.02 × population_factor
population_factor = log₁₀(population / 100)
```

A revolt causes:
- 10–30% of population splits off as an independent group
- The splinter group claims a portion of territory proportional to its population
- 5–15% of total population dies in the conflict
- All structures in contested Tiles take 50% damage

---

## 10. TRADE & DIPLOMACY

### 10.1 Inter-Agent Contact

Agents are aware of each other only when their territories are within **detection range**:

| Detection Method | Range (Tiles) |
|-----------------|---------------|
| Scouts on foot | 50 from border |
| Mounted scouts | 150 from border |
| Sailing | 500 along coast |
| Signal networks | 200 (line of sight chain) |

### 10.2 Trade Mechanics

Trade requires:
1. **Contact** (awareness of other agent)
2. **Route** (a path of controlled/neutral Tiles between territories)
3. **Agreement** (agents must both submit compatible trade actions)
4. **Transport capacity** (limited by route infrastructure)

```
max_trade_volume_per_cycle = route_capacity × num_traders × transport_multiplier
```

| Transport | Capacity per Trader | Speed |
|-----------|-------------------|-------|
| Human porter | 25 kg | 5 Tiles/Tick |
| Pack animal | 100 kg | 8 Tiles/Tick |
| Cart | 500 kg | 6 Tiles/Tick (requires road) |
| Boat (river) | 5,000 kg | 15 Tiles/Tick |
| Ship (ocean) | 50,000 kg | 20 Tiles/Tick |
| Rail | 500,000 kg | 50 Tiles/Tick (requires railway) |

### 10.3 Diplomacy Actions

Available agent-to-agent actions each Tick:

| Action | Prerequisite | Effect |
|--------|-------------|--------|
| Send envoy | Contact + Language | Opens communication channel |
| Propose trade | Envoy + surplus goods | Creates trade agreement |
| Form alliance | Positive relations ≥ 60 | Mutual defense pact |
| Declare war | None | Enables military action against target |
| Offer tribute | None | Improves relations, costs resources |
| Demand tribute | Military superiority | Risk of war if refused |
| Share knowledge | Positive relations ≥ 40 | Exchange KP at agreed ratio |
| Propose border | Contact | Formalizes territorial boundary |

### 10.4 Relations Score

Each pair of agents has a relations score (-100 to +100):

```
relations_change_per_cycle = sum(interaction_effects) + proximity_drift
proximity_drift = -0.5 per Cycle if borders are adjacent (border friction)
```

---

## 11. MILITARY & CONFLICT

### 11.1 Military Units

Humans can be assigned to military roles. Each military human is NOT performing productive labor.

```
military_strength = soldiers × equipment_factor × training_level × morale × leadership
```

| Equipment Era | Equipment Factor | Prerequisites |
|--------------|-----------------|---------------|
| Unarmed | 0.5 | None |
| Stone weapons | 1.0 | Stone toolmaking |
| Bronze weapons + armor | 3.0 | Bronze metallurgy |
| Iron weapons + armor | 5.0 | Iron smelting |
| Steel + crossbows | 8.0 | Steel production |
| Gunpowder weapons | 15.0 | Gunpowder |
| Rifled firearms | 30.0 | Precision engineering |
| Modern weapons | 100.0 | Industrial base |

**Training level**: 0.5 (militia, part-time) to 2.0 (professional, full-time for 5+ Years)

### 11.2 Combat Resolution

When two forces engage:

```
battle_outcome_ratio = attacker_strength / defender_strength × terrain_modifier × fortification_modifier
```

| Modifier | Value |
|----------|-------|
| Forest (defender) | ×0.7 for attacker |
| Mountain (defender) | ×0.5 for attacker |
| River crossing | ×0.6 for attacker |
| Walls | ×0.3 for attacker |
| Urban (defender) | ×0.4 for attacker |
| Open field | ×1.0 |
| Surprise attack | ×1.5 for attacker |

**Casualties**: Both sides suffer casualties proportional to the ratio:
```
attacker_casualties = attacker_soldiers × 0.1 × (1 / battle_outcome_ratio)
defender_casualties = defender_soldiers × 0.1 × battle_outcome_ratio
```

If battle_outcome_ratio > 3.0, the losing side routes — remaining soldiers flee (50% captured, 50% escape).

### 11.3 Occupation & Conquest

Capturing territory requires:
1. Defeating or displacing all military units in the Tile
2. Maintaining occupation force of ≥ 10 soldiers per Tile for 10 Cycles
3. Surviving potential insurgency (conquered population has -50 SC for 100 Years)

**A conquered population is NOT equivalent to your own population.** They resist, they sabotage, they revolt. Assimilation takes generations without aggressive cultural policies.

---

## 12. PRI: THE WORLD ENGINE

### 12.1 Overview

Pri is the autonomous world simulation layer. It is NOT controlled by any agent. It reacts to the cumulative behavior of all agents and the passage of time. Pri maintains:

- Global climate state
- Regional ecosystem health
- Disease emergence and spread
- Natural disasters
- Geological processes (very slow)

### 12.2 Ecosystem Health

Each Tile has an **ecosystem_health** score (0.0–1.0):

```
ecosystem_health_change_per_cycle = natural_recovery - human_impact
natural_recovery = 0.005 × (1 - ecosystem_health)  // faster recovery when damaged
human_impact = deforestation_rate + pollution_rate + overextraction_rate
```

| Ecosystem Health | Effects |
|-----------------|---------|
| 0.8–1.0 | Pristine: full resource regeneration, abundant wildlife |
| 0.6–0.79 | Healthy: 90% regeneration, slight species decline |
| 0.4–0.59 | Stressed: 60% regeneration, noticeable wildlife decline, soil degradation begins |
| 0.2–0.39 | Degraded: 30% regeneration, frequent crop failures, water quality issues |
| 0.0–0.19 | Collapsed: near-zero regeneration, desertification risk, mass wildlife extinction |

### 12.3 Climate System

Pri tracks a global **carbon_index** (0–1000):

```
carbon_index_change_per_tick = emissions - natural_absorption
natural_absorption = global_forest_cover × 0.001 + ocean_absorption(constant: 0.0005)
```

| Carbon Index | Global Effect |
|-------------|--------------|
| 0–100 | Pre-industrial normal |
| 100–250 | Mild warming: +5% rainfall variability |
| 250–500 | Significant warming: shifting biomes, +20% extreme weather |
| 500–750 | Severe warming: sea level rise (coastal Tiles flood), -30% crop yields in hot biomes |
| 750–1000 | Catastrophic: massive sea level rise, desertification, crop failures worldwide |

Carbon sources (by epoch):
- Deforestation: 0.001 per Tile cleared per Tick
- Coal burning: 0.01 per unit burned per Tick
- Oil burning: 0.02 per unit burned per Tick
- Industrial processes: variable

### 12.4 Disease Engine

Pri generates diseases based on population conditions:

#### 12.4.1 Disease Emergence

```
disease_emergence_probability_per_cycle =
    base_rate × population_density_factor × sanitation_factor × animal_proximity_factor × trade_factor
```

| Factor | Calculation |
|--------|------------|
| base_rate | 0.001 (very low base) |
| population_density_factor | (people_per_tile / 100)² — dense populations breed disease |
| sanitation_factor | 2.0 (no sanitation) → 0.2 (modern sanitation) |
| animal_proximity_factor | 1.5 if livestock in settlements, 1.0 otherwise |
| trade_factor | 1.0 + (0.1 × number_of_trade_routes) — more contact, more risk |

#### 12.4.2 Disease Properties (randomly generated)

| Property | Range | Description |
|----------|-------|------------|
| Virulence | 0.01–0.5 | Kill rate among infected per Cycle |
| Contagion | 0.05–0.9 | Transmission probability per contact per Tick |
| Duration | 5–60 Ticks | How long until recovery or death |
| Incubation | 1–20 Ticks | Contagious before symptoms (detection delay) |
| Immunity | 0.0–1.0 | Probability of lasting immunity after recovery |

#### 12.4.3 Disease Spread

```
new_infections_per_tick = infected × contagion × contact_rate × (susceptible / total_population)
contact_rate = base_contact × density_modifier
```

Diseases spread between agent territories via trade routes, shared borders, and migration.

**Quarantine action**: An agent can quarantine (isolate infected). This costs productivity but reduces contact_rate to 10% of normal.

### 12.5 Natural Disasters

Pri generates natural disasters with probabilities affected by location and human activity:

| Disaster | Base Probability (per Year) | Affected By | Effect |
|----------|---------------------------|-------------|--------|
| Earthquake | 0.02 (tectonic zones) | Location only | Destroys 10–50% structures in epicenter Tile + neighbors |
| Volcanic eruption | 0.005 (volcanic zones) | Location only | Destroys ALL in blast zone (1–5 Tiles), ash cloud reduces farming yield in 50+ Tile radius for 1–3 Years |
| Hurricane/Typhoon | 0.1 (coastal tropics) | Climate + sea temperature | Destroys 20–40% structures, flooding |
| Drought | 0.05 | Deforestation, climate | -50% to -90% crop yield for 1–3 Years |
| Flood | 0.08 (river areas) | Deforestation upstream, climate | Destroys structures, deposits fertile silt |
| Wildfire | 0.1 (dry biomes) | Ecosystem health, climate | Destroys forest, kills wildlife, clears land |
| Plague | See Disease Engine | Population density, sanitation | See Disease Engine |
| Locust swarm | 0.03 (grassland/arid) | Monoculture farming | -80% crop yield for 1 Cycle |
| Tsunami | 0.01 (coastal tectonic) | Earthquake triggered | Coastal destruction 1–3 Tiles inland |
| Blizzard | 0.15 (cold biomes, winter) | Climate | -50% productivity, exposure deaths without shelter |

### 12.6 Seasons

The world has 4 seasons per Year, each lasting 3 Cycles:

| Season | Effect on Temperate Biome | Effect on Tropical | Effect on Arctic |
|--------|--------------------------|-------------------|-----------------|
| Spring | Growing begins, +20% foraging | Wet season starts | Thaw begins |
| Summer | Peak growing, +50% farm yield | Wet season peak | Short growing season |
| Autumn | Harvest, foraging peak, prep needed | Dry season starts | Freeze begins |
| Winter | No growing, -30% foraging, exposure risk | Dry season, fire risk | Near-total shutdown |

**Food storage is critical.** Without preserving food from productive seasons, winter (or dry season) will cause starvation.

### 12.7 Pri Response to Human Activity

Pri doesn't punish agents — it simply simulates consequences:

| Human Activity | Pri Response | Timescale |
|---------------|-------------|-----------|
| Clear-cut 50%+ of forest in region | Soil erosion, -30% farm yield in 10 Years | Medium |
| Dump waste in river | Downstream water quality drops, disease risk +200% | Fast |
| Overfish coastal waters | Fish stock collapse, 50-Year recovery | Medium |
| Burn coal/oil at scale | Carbon index rises, climate effects | Slow but cumulative |
| Monoculture farming | Soil depletion, +50% pest vulnerability | Medium |
| Urbanize river floodplain | Catastrophic flood damage when floods occur | Conditional |
| Hunt megafauna to extinction | Permanent ecosystem change, cascading effects | Permanent |
| Nuclear detonation (if reached) | Radiation zone (uninhabitable Tiles for 100+ Years), fallout spread | Fast + permanent |

---

## 13. AGENT INTERFACE PROTOCOL

### 13.1 Action Submission

Each Tick, an agent submits an **Action Bundle** — a JSON-like structured set of directives:

```
ActionBundle {
  tick: int,
  agent_id: string,
  actions: [
    {
      type: "ALLOCATE_LABOR",
      assignments: [
        { task: "farming", tiles: [x,y,...], workers: 200 },
        { task: "building", target: "granary", tile: [x,y], workers: 50 },
        { task: "research", focus: "plant_cultivation", workers: 10 },
        { task: "expansion", direction: "north", workers: 30 },
        { task: "military_training", workers: 20 },
        ...
      ]
    },
    {
      type: "SET_POLICY",
      policy: "food_distribution",
      value: "equal"
    },
    {
      type: "DIPLOMACY",
      target_agent: "agent_07",
      action: "propose_trade",
      offer: { "grain": 10000 },
      request: { "copper_ore": 5 }
    },
    {
      type: "MILITARY",
      action: "move_troops",
      units: 100,
      from: [x1,y1],
      to: [x2,y2]
    },
    {
      type: "BUILD",
      structure: "irrigation_canal",
      tile: [x, y],
      continue: true  // continues multi-Tick project
    }
  ]
}
```

### 13.2 Validation Rules

Every action is validated against the rules. Violations return structured errors:

```
ValidationError {
  action_index: int,
  error_code: string,
  message: string,
  constraint_violated: string,
  current_value: any,
  max_allowed: any,
  suggestion: string  // optional hint
}
```

**Common validation errors**:

| Code | Meaning |
|------|---------|
| LABOR_EXCEEDS_AVAILABLE | Assigned more workers than exist |
| INSUFFICIENT_RESOURCES | Not enough materials for build/craft |
| TECH_NOT_RESEARCHED | Attempting action requiring unknown technology |
| TILE_NOT_CONTROLLED | Action targets a Tile outside agent's territory |
| OVEREXTENSION | Expansion would exceed territory cap |
| POPULATION_BELOW_THRESHOLD | Tech/governance requires larger population |
| ROUTE_BLOCKED | Trade/movement path interrupted |
| STARVATION_IMMINENT | Current food allocation leads to starvation within 5 Ticks |

### 13.3 World State Report

Each Tick, the agent receives a World State Report:

```
WorldState {
  tick: int,
  season: string,
  population: {
    total: int,
    by_age_group: {...},
    births_this_tick: int,
    deaths_this_tick: int,
    deaths_by_cause: {...},
    health_status: {...}
  },
  territory: {
    controlled_tiles: int,
    overextension_ratio: float,
    tiles_in_decay: int,
    map_update: [{tile, biome, resources, structures, ecosystem_health}]
  },
  resources: {
    stockpiles: {...},
    production_this_tick: {...},
    consumption_this_tick: {...},
    surplus_deficit: {...}
  },
  knowledge: {
    total_kp: int,
    researching: [{tech, progress, estimated_ticks}],
    completed: [tech_ids],
    current_epoch: int
  },
  social: {
    cohesion: float,
    governance_type: string,
    active_policies: [...],
    revolt_risk: float
  },
  military: {
    total_soldiers: int,
    strength: float,
    deployed: [{location, count, status}]
  },
  diplomacy: {
    known_agents: [{id, relations, territory_size, military_estimate}],
    active_agreements: [...],
    incoming_proposals: [...]
  },
  pri_report: {
    local_ecosystem_health: float,
    active_diseases: [{name, infected_count, virulence}],
    weather_forecast: [{cycle, conditions}],
    disaster_warnings: [...],  // only if detection tech exists
    global_carbon_index: float  // only if scientific observation exists
  }
}
```

### 13.4 Fog of War

Agents can only see:
- Their own territory in full detail
- Scouted areas with decreasing accuracy (info decays 1 Cycle after last scout visit)
- Trade partner territory at summary level
- Nothing beyond detection range

Information about other agents' military strength, technology level, and population is ESTIMATED based on intelligence quality.

---

## 14. MATHEMATICAL REFERENCE

### 14.1 Core Formulas Summary

**Population growth (logistic)**:
```
dP/dt = r × P × (1 - P/K)
where r = base_growth_rate × modifiers, K = carrying_capacity
```

**Carrying capacity**:
```
K = Σ(tile_food_production) / per_capita_food_need
tile_food_production = base_yield × tech_multiplier × soil_fertility × season_modifier × ecosystem_health
```

**Territory sustainability**:
```
sustainable_tiles = population × tiles_per_capita(epoch) × governance_efficiency
governance_efficiency = 1 / (1 + admin_overhead)
```

**Research progress**:
```
kp_per_tick = researchers × intelligence × curiosity × log₂(1 + total_kp)
discovery_prob = min(0.95, invested_kp / required_kp)
```

**Combat resolution**:
```
outcome_ratio = (A_soldiers × A_equip × A_training × A_morale × A_leadership) /
                (D_soldiers × D_equip × D_training × D_morale × D_leadership × terrain × fortification)
```

**Social cohesion decay**:
```
SC(t+1) = SC(t) - 1 + Σ(policy_effects) + Σ(event_effects)
revolt_prob = max(0, (30 - SC) × 0.02 × log₁₀(pop / 100))
```

**Ecosystem dynamics**:
```
health(t+1) = health(t) + 0.005 × (1 - health(t)) - human_impact(t)
```

**Climate**:
```
carbon(t+1) = carbon(t) + emissions(t) - (forest_cover × 0.001 + 0.0005)
```

### 14.2 Balance Constants

These are tunable values that can be adjusted for game balance:

| Constant | Default | Purpose |
|----------|---------|---------|
| BASE_FERTILITY_RATE | 0.02/Cycle | Population growth speed |
| BASE_MORTALITY_MODIFIER | 1.0 | Overall difficulty |
| RESOURCE_ABUNDANCE | 1.0 | Global resource multiplier |
| RESEARCH_SPEED | 1.0 | How fast tech advances |
| DISASTER_FREQUENCY | 1.0 | How often disasters occur |
| DIPLOMACY_FRICTION | 0.5 | How fast relations decay |
| COMBAT_LETHALITY | 0.1 | Casualty rate in battles |
| SC_DECAY_RATE | 1.0/Cycle | Social entropy speed |
| EXPANSION_DIFFICULTY | 1.0 | How hard it is to claim Tiles |
| PRI_SENSITIVITY | 1.0 | How aggressively Pri responds to pollution |

### 14.3 Win Conditions (Optional / Configurable)

This is a sandbox — there's no inherent "win." But configurable victory conditions include:

| Victory Type | Condition |
|-------------|-----------|
| Domination | Control 50%+ of habitable land |
| Population | Reach 1 billion population |
| Technology | Achieve Epoch 9 |
| Harmony | Maintain ecosystem_health > 0.8 across all controlled Tiles for 100 Years while at Epoch 7+ |
| Cultural | Highest social cohesion average over 500 Years |
| Economic | Control 60%+ of a critical resource type |
| Survival | Last agent with positive population after 10,000 Years |

---

## APPENDIX A: FIRST 100 TICKS SURVIVAL GUIDE

For agent developers, here's the critical priority order:

1. **Ticks 1–5**: Survey starting territory. Identify water sources, food-rich Tiles, shelter locations. Begin foraging.
2. **Ticks 5–15**: Establish base camp near water. Allocate labor to foraging, shelter construction, fire research.
3. **Ticks 15–30**: Achieve Controlled Fire. Begin water purification. Start stone toolmaking research.
4. **Ticks 30–60**: Stone tools online. Foraging efficiency jumps. Begin scouting beyond starting territory. Start herbalism research.
5. **Ticks 60–100**: First surplus achieved. Begin specialization. Start language formalization research. Plan first expansion.

**Critical trap**: Assigning too many people to research or expansion before food production is stable. If surplus goes negative, you enter a death spiral — weakened population produces less, producing less makes them weaker.

---

## APPENDIX B: AGENT STRATEGY ARCHETYPES

These are NOT prescribed — they're examples of viable strategies agents might pursue:

| Archetype | Description | Strength | Weakness |
|-----------|------------|----------|----------|
| Expansionist | Claim land fast, worry about development later | Large territory, resource access | Overextension, low SC |
| Intensifier | Small territory, maximum development | High productivity, strong defense | Resource bottleneck |
| Trader | Focus on producing surplus of one thing, trade for rest | Economic power, alliances | Dependency, vulnerable routes |
| Militarist | Prioritize army, conquer neighbors | Territory gains, captured resources | Low development, revolt risk |
| Researcher | Maximize KP, rush technology | Tech advantage | Vulnerable early game |
| Balancer | Even investment across all areas | Resilience | No decisive advantage |

---

*This document constitutes the immutable laws of this world. Agents operate within these rules. Pri enforces consequences. The world does not care about intentions — only actions and their effects.*
