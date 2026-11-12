import type { FastifyInstance } from "fastify";
import { AnalysisInputError, AnalysisService, AnalysisUnavailableError } from "../../analysis/AnalysisService.js";
import { AnalysisQueueFullError } from "../../application/analysis/AnalysisQueue.js";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function registerAnalysisRoutes(app: FastifyInstance, service: AnalysisService): Promise<void> {
  app.post<{ Body: unknown }>("/api/analysis", async (request, reply) => {
    const controller = new AbortController();
    const abortIfDisconnected = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };

    reply.raw.once("close", abortIfDisconnected);
    request.raw.once("aborted", abortIfDisconnected);
    try {
      return await service.analyze(request.body, controller.signal);
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      if (error instanceof AnalysisInputError) return reply.code(400).send({ error: error.message });
      if (error instanceof AnalysisQueueFullError) {
        return reply.code(429).header("retry-after", "2").send({ error: "Analysis capacity is full. Retry shortly." });
      }
      if (error instanceof AnalysisUnavailableError) {
        app.log.error({ err: error }, "Chess analysis failed");
        return reply.code(503).send({ error: "Chess analysis is temporarily unavailable." });
      }
      app.log.error({ err: error }, "Unexpected analysis error");
      return reply.code(500).send({ error: "Internal server error." });
    } finally {
      reply.raw.off("close", abortIfDisconnected);
      request.raw.off("aborted", abortIfDisconnected);
    }
  });
}
