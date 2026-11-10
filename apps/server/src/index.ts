import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@king-chess/shared";
import { AnalysisService } from "./analysis/AnalysisService.js";
import { UciStockfishEngine } from "./infrastructure/engine/UciStockfishEngine.js";
import { registerAnalysisRoutes } from "./transport/http/registerAnalysisRoutes.js";
import { registerGameHandlers } from "./transport/socket/registerGameHandlers.js";
import { createDatabase } from "./infrastructure/database/Database.js";
import { PostgresPlayerRepository } from "./infrastructure/accounts/PostgresPlayerRepository.js";
import { AccountService } from "./application/accounts/AccountService.js";
import { registerAccountRoutes } from "./transport/http/registerAccountRoutes.js";

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

await app.register(cors, { origin: webOrigin, credentials: true });
app.get("/api/health", async () => ({
  status: "ok",
  service: "king-chess-api",
  analysis: process.env.STOCKFISH_PATH ? "configured" : "uses PATH"
}));

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? createDatabase(databaseUrl) : null;
if (database) {
  const players = new PostgresPlayerRepository(database);
  const accounts = new AccountService(players);
  await players.cleanupExpiredSessions();
  await registerAccountRoutes(app, accounts);
} else {
  app.log.warn("DATABASE_URL is not configured; account endpoints are disabled.");
  app.all("/api/accounts/*", async (_request, reply) => reply.code(503).send({ error: "Account storage is not configured." }));
}

const engine = new UciStockfishEngine();
await registerAnalysisRoutes(app, new AnalysisService(engine));

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: webOrigin, methods: ["GET", "POST"] }
});
registerGameHandlers(io);

app.addHook("onClose", async () => {
  await new Promise<void>(resolve => io.close(() => resolve()));
  await engine.close();
  await database?.end();
});

await app.listen({ port, host });
app.log.info({ port, host }, "King Chess server listening");
