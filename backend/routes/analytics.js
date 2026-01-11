export default async function analyticsRoutes(fastify) {
  fastify.post("/api/analytics", async (request, reply) => {
    const { event_name, params, client_id } = request.body;
    const measurementId = process.env.GA_MEASUREMENT_ID || "G-8V7LKZ4W98";
    const apiSecret = process.env.GA_API_SECRET;

    if (!apiSecret) {
      return reply.send({ status: "skipped", reason: "no_api_secret" });
    }

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        body: JSON.stringify({
          client_id: client_id || "anonymous",
          events: [
            {
              name: event_name,
              params: {
                ...params,
                engagement_time_msec: 100,
                session_id: params.session_id || Date.now().toString(),
              },
            },
          ],
        }),
      });

      if (!response.ok) {
        fastify.log.error(`GA4 Error: ${response.statusText}`);
      }
      return reply.send({ status: "sent" });
    } catch (error) {
      fastify.log.error(`Analytics proxy error: ${error.message}`);
      return reply.send({ status: "error" });
    }
  });
}
