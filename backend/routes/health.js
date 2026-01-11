import { getAvailableDates } from "../services/locationGenerator.js";

export default async function healthRoutes(fastify) {
  fastify.get("/api/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  fastify.get("/api/days", async (request, reply) => {
    try {
      const dates = await getAvailableDates();
      return { dates };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: "Failed to load available dates" });
    }
  });
}
