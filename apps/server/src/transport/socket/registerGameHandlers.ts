import type { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@king-chess/shared";
import { GameRoomService } from "../../application/games/GameRoomService.js";

export function registerGameHandlers(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
  const games = new GameRoomService(io);
  io.on("connection", socket => {
    games.attach(socket);
  });
}
