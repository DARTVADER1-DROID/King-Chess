import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents
} from "@king-chess/shared";
import { GameRoomService } from "./game/GameRoomService.js";

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

await app.register(cors, { origin: webOrigin });

app.get("/api/health", async () => ({
  status: "ok",
  service: "king-chess-api"
}));

const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
  cors: { origin: webOrigin, methods: ["GET", "POST"] }
});
const gameRooms = new GameRoomService(io);

io.on("connection", (socket) => {
  app.log.info({ socketId: socket.id }, "Player connected");
  gameRooms.attach(socket);
});

app.addHook("onClose", async () => {
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

await app.listen({ port, host });
app.log.info({ port, host }, "King Chess server listening");
