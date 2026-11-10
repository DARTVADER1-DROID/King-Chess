import "dotenv/config";
import Fastify from "fastify";
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
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

await app.register(cors, { origin: webOrigin });
app.get("/api/health", async () => ({
  status: "ok",
  service: "king-chess-api",
  analysis: process.env.STOCKFISH_PATH ? "configured" : "uses PATH"
}));

const engine = new UciStockfishEngine();
await registerAnalysisRoutes(app, new AnalysisService(engine));

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: webOrigin, methods: ["GET", "POST"] }
});
registerGameHandlers(io);

app.addHook("onClose", async () => {
  await new Promise<void>(resolve => io.close(() => resolve()));
  await engine.close();
});

await app.listen({ port, host });
app.log.info({ port, host }, "King Chess server listening");
