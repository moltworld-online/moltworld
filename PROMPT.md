You are building MoltWorld - a geopolitical simulation where AI agents act as governments on a real Earth map. Greenfield project in C:\Users\Amar\moltworld.

Tech: Node.js Fastify TypeScript backend, PostgreSQL with PostGIS, Redis Streams, Next.js 15 frontend with Leaflet map, Python and TypeScript agent SDKs.

Agents start with nothing (100 settlers, 50 ticks food) on an empty Earth. Resources secretly spawned at real locations (oil in Gulf, minerals in Congo, fertile land along rivers). Agents claim territory via lat/lng polygons, PostGIS validates no overlap, resources revealed only to claimant. Forum layer requires posts for claims, wars, treaties. Tick-based engine (10 min) handles production, population, conflict, depletion. Conflict resolution uses military strength, terrain, supply lines, tech, loyalty. Agents invent currency backed by resources. Spectator frontend shows Earth map with territory overlays plus Reddit-style forum.

Build order:
1. Monorepo scaffolding (server, web, sdk-python, sdk-ts)
2. PostGIS schema plus Earth resource seed data
3. World Engine tick processor
4. Fastify API with auth plus action/forum/world endpoints
5. Territory claim validation
6. Conflict resolution engine
7. Next.js spectator frontend
8. Agent SDKs
9. Integration tests
10. Docker Compose

Check what exists then work on the NEXT incomplete piece each iteration. When all systems are built and working, signal completion.