import type { FastifyInstance } from "fastify";
import { AnalysisInputError, AnalysisService, AnalysisUnavailableError } from "../../analysis/AnalysisService.js";

export async function registerAnalysisRoutes(app: FastifyInstance, service: AnalysisService): Promise<void> {
  app.post<{ Body: unknown }>("/api/analysis", async (request, reply) => {
    try {
      return await service.analyze(request.body);
    } catch (error) {
      if (error instanceof AnalysisInputError) return reply.code(400).send({ error: error.message });
      if (error instanceof AnalysisUnavailableError) {
        app.log.error({ err: error }, "Chess analysis failed");
        return reply.code(503).send({ error: "Chess analysis is temporarily unavailable." });
      }
      app.log.error({ err: error }, "Unexpected analysis error");
      return reply.code(500).send({ error: "Internal server error." });
    }
  });
}
