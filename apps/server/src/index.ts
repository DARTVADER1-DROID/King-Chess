import "dotenv/config";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@king-chess/shared";
import { AnalysisService } from "./analysis/AnalysisService.js";
import { UciStockfishEngine } from "./infrastructure/engine/UciStockfishEngine.js";
import { registerAnalysisRoutes } from "./transport/http/registerAnalysisRoutes.js";
import { registerGameHandlers } from "./transport/socket/registerGameHandlers.js";

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

await app.register(cors, { origin: allowedOrigins, credentials: true });
app.get("/api/health", async () => ({
  status: "ok",
  service: "king-chess-api",
  analysis: process.env.STOCKFISH_PATH ? "configured" : "uses PATH",
  accounts: "disabled"
}));

// Account modules are retained for a later milestone, but no account routes or
// database connections are activated until dedicated PostgreSQL infrastructure exists.
const accountsDisabled = async (_request: FastifyRequest, reply: FastifyReply) =>
  reply.code(503).send({ error: "Player accounts are temporarily disabled." });
app.all("/api/accounts", accountsDisabled);
app.all("/api/accounts/*", accountsDisabled);

const engine = new UciStockfishEngine();
await registerAnalysisRoutes(app, new AnalysisService(engine));

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true }
});
registerGameHandlers(io);

app.addHook("onClose", async () => {
  await new Promise<void>(resolve => io.close(() => resolve()));
  await engine.close();
});

await app.listen({ port, host });
app.log.info({ port, host, allowedOrigins }, "King Chess server listening");
