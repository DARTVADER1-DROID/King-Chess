import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";

const app = Fastify({ logger: true });
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

await app.register(cors, { origin: webOrigin });

app.get("/api/health", async () => ({ status: "ok", service: "king-chess-api" }));

await app.listen({ port, host });

const io = new Server(app.server, {
  cors: { origin: webOrigin, methods: ["GET", "POST"] }
});

io.on("connection", (socket) => {
  app.log.info({ socketId: socket.id }, "Player connected");
  socket.on("disconnect", () => app.log.info({ socketId: socket.id }, "Player disconnected"));
});

app.addHook("onClose", async () => io.close());
