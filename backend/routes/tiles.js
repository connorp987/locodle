export default async function tilesRoutes(fastify) {
  fastify.get("/api/tiles/:z/:x/:y", async (request, reply) => {
    const { z, x, y } = request.params;

    const tileProviders = [
      {
        name: "Esri WorldStreetMap",
        url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`,
      },
      {
        name: "OpenStreetMap",
        url: `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
      },
      {
        name: "CartoDB Voyager",
        url: `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
      },
      {
        name: "CartoDB Positron",
        url: `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`,
      },
    ];

    for (let i = 0; i < tileProviders.length; i++) {
      const provider = tileProviders[i];
      try {
        const response = await fetch(provider.url, {
          headers: {
            "User-Agent": "Locodle/1.0",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        reply.header("Content-Type", "image/png");
        reply.header("Cache-Control", "public, max-age=86400");

        if (i > 0) {
          fastify.log.warn(
            `Tile proxy used fallback provider: ${provider.name} for tile ${z}/${x}/${y}`
          );
        }

        return reply.send(buffer);
      } catch (error) {
        fastify.log.warn(
          `Tile provider ${provider.name} failed for ${z}/${x}/${y}: ${error.message}`
        );

        if (i === tileProviders.length - 1) {
          fastify.log.error(`All tile providers failed for ${z}/${x}/${y}`);
          return reply
            .code(500)
            .send("Failed to fetch tile from all providers");
        }
      }
    }
  });
}
