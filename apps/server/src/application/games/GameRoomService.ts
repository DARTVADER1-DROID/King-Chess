import { randomUUID } from "node:crypto";
import type { PieceSymbol, Square } from "chess.js";
import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents, GamePlayer, GameRoomSnapshot, ServerToClientEvents,
  SubmitMoveRequest
} from "@king-chess/shared";
import { ChessGame } from "../../domain/chess/ChessGame.js";

type ChessServer = Server<ClientToServerEvents, ServerToClientEvents>;
type ChessSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
interface PlayerSeat extends GamePlayer { socketId: string; }
interface GameRoom { id: string; game: ChessGame; white: PlayerSeat; black: PlayerSeat | null; result: "draw" | "white-resigned" | "black-resigned" | null; drawOfferBy: "w" | "b" | null; }

const USERNAME_MAX_LENGTH = 24;
const GAME_ID_PATTERN = /^[0-9a-f-]{36}$/i;
const SQUARE_PATTERN = /^[a-h][1-8]$/;
const PROMOTIONS = new Set(["q", "r", "b", "n"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function cleanUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim();
  return username.length > 0 && username.length <= USERNAME_MAX_LENGTH && !/[\u0000-\u001f\u007f]/.test(username)
    ? username : null;
}

/** Application-level multiplayer orchestration; the game object remains authoritative. */
export class GameRoomService {
  private readonly games = new Map<string, GameRoom>();
  private readonly socketGames = new Map<string, string>();

  constructor(private readonly io: ChessServer) {}

  attach(socket: ChessSocket): void {
    socket.on("game:create", payload => { void this.createGame(socket, payload); });
    socket.on("game:join", payload => { void this.joinGame(socket, payload); });
    socket.on("game:move", payload => this.submitMove(socket, payload));
    socket.on("game:draw-offer", () => this.offerDraw(socket));
    socket.on("game:draw-response", payload => this.respondToDraw(socket, payload));
    socket.on("game:resign", () => this.resign(socket));
    socket.on("game:leave", () => this.leaveGame(socket));
    socket.on("disconnect", () => this.handleDisconnect(socket));
  }

  private async createGame(socket: ChessSocket, payload: unknown): Promise<void> {
    if (this.socketGames.has(socket.id)) return this.sendError(socket, "ALREADY_IN_GAME", "Leave your current game first.");
    const username = isRecord(payload) ? cleanUsername(payload.username) : null;
    if (!username) return this.sendError(socket, "INVALID_USERNAME", "Username must contain 1-24 valid characters.");

    const id = randomUUID();
    const white: PlayerSeat = { id: socket.id, socketId: socket.id, username, color: "w" };
    const room: GameRoom = { id, game: new ChessGame(), white, black: null, result: null, drawOfferBy: null };
    this.games.set(id, room);
    this.socketGames.set(socket.id, id);

    try {
      await socket.join(id);
      if (this.games.get(id) === room && socket.connected) socket.emit("game:created", this.toSnapshot(room));
    } catch {
      this.endGame(id, "player-disconnected", socket.id);
      this.sendError(socket, "ROOM_JOIN_FAILED", "Could not create the game room. Please retry.");
    }
  }

  private async joinGame(socket: ChessSocket, payload: unknown): Promise<void> {
    if (this.socketGames.has(socket.id)) return this.sendError(socket, "ALREADY_IN_GAME", "Leave your current game first.");
    const gameId = isRecord(payload) && typeof payload.gameId === "string" ? payload.gameId.trim() : "";
    const username = isRecord(payload) ? cleanUsername(payload.username) : null;
    if (!GAME_ID_PATTERN.test(gameId) || !username) {
      return this.sendError(socket, "INVALID_JOIN_REQUEST", "A valid game ID and username are required.");
    }

    const room = this.games.get(gameId);
    if (!room) return this.sendError(socket, "GAME_NOT_FOUND", "That game does not exist or has ended.");
    if (room.black) return this.sendError(socket, "GAME_FULL", "That game already has two players.");
    if (room.white.socketId === socket.id) return this.sendError(socket, "CANNOT_JOIN_OWN_GAME", "You created this game.");

    // Reserve the seat before awaiting the adapter, preventing two simultaneous joins.
    const black: PlayerSeat = { id: socket.id, socketId: socket.id, username, color: "b" };
    room.black = black;
    this.socketGames.set(socket.id, gameId);
    try {
      await socket.join(gameId);
      if (this.games.get(gameId) !== room || room.black !== black || !socket.connected) return;
      const snapshot = this.toSnapshot(room);
      socket.emit("game:joined", snapshot);
      socket.to(gameId).emit("game:state", snapshot);
    } catch {
      if (room.black === black) room.black = null;
      this.socketGames.delete(socket.id);
      this.sendError(socket, "ROOM_JOIN_FAILED", "Could not join the game room. Please retry.");
    }
  }

  private submitMove(socket: ChessSocket, payload: unknown): void {
    if (!isRecord(payload)) return this.sendError(socket, "INVALID_MOVE", "Move payload must be an object.");
    const request = payload as unknown as SubmitMoveRequest;
    const gameId = typeof request.gameId === "string" ? request.gameId : "";
    const room = this.games.get(gameId);
    if (!room || this.socketGames.get(socket.id) !== gameId) {
      return this.sendError(socket, "NOT_IN_GAME", "You are not a player in that game.");
    }
    if (!room.black) return this.sendError(socket, "GAME_NOT_READY", "Waiting for the second player to join.");
    const player = this.findPlayer(room, socket.id);
    if (!player) return this.sendError(socket, "NOT_A_PLAYER", "You are not a player in that game.");
    if (room.result || room.game.isGameOver()) return this.sendError(socket, "GAME_OVER", "This game has already finished.");
    if (room.game.getTurn() !== player.color) return this.sendError(socket, "NOT_YOUR_TURN", "It is the other player's turn.");

    if (typeof request.from !== "string" || typeof request.to !== "string" ||
        !SQUARE_PATTERN.test(request.from) || !SQUARE_PATTERN.test(request.to)) {
      return this.sendError(socket, "INVALID_SQUARE", "Move must contain valid from and to squares.");
    }
    if (request.promotion !== undefined &&
        (typeof request.promotion !== "string" || !PROMOTIONS.has(request.promotion))) {
      return this.sendError(socket, "INVALID_PROMOTION", "Promotion must be q, r, b, or n.");
    }

    try {
      room.game.makeMove({
        from: request.from as Square,
        to: request.to as Square,
        ...(request.promotion ? { promotion: request.promotion as PieceSymbol } : {})
      });
    } catch {
      return this.sendError(socket, "ILLEGAL_MOVE", "That move is not legal in the current position.");
    }
    room.drawOfferBy = null;
    this.io.to(gameId).emit("game:state", this.toSnapshot(room));
  }

  private offerDraw(socket: ChessSocket): void {
    const gameId = this.socketGames.get(socket.id);
    const room = gameId ? this.games.get(gameId) : undefined;
    const player = room ? this.findPlayer(room, socket.id) : null;
    if (!room || !player || !room.black) return this.sendError(socket, "NOT_IN_ACTIVE_GAME", "You must be in an active game to offer a draw.");
    if (room.result || room.game.isGameOver()) return this.sendError(socket, "GAME_OVER", "This game has already finished.");
    if (room.drawOfferBy) return this.sendError(socket, "DRAW_ALREADY_PENDING", "A draw offer is already awaiting a response.");
    room.drawOfferBy = player.color;
    this.io.to(gameId!).emit("game:state", this.toSnapshot(room));
  }

  private respondToDraw(socket: ChessSocket, payload: unknown): void {
    const gameId = this.socketGames.get(socket.id);
    const room = gameId ? this.games.get(gameId) : undefined;
    const player = room ? this.findPlayer(room, socket.id) : null;
    if (!room || !player || !room.black || !room.drawOfferBy || room.drawOfferBy === player.color) {
      return this.sendError(socket, "NO_DRAW_OFFER", "There is no draw offer for you to respond to.");
    }
    if (!isRecord(payload) || typeof payload.accept !== "boolean") return this.sendError(socket, "INVALID_DRAW_RESPONSE", "A draw response is required.");
    if (payload.accept) room.result = "draw";
    room.drawOfferBy = null;
    this.io.to(gameId!).emit("game:state", this.toSnapshot(room));
  }

  private resign(socket: ChessSocket): void {
    const gameId = this.socketGames.get(socket.id);
    const room = gameId ? this.games.get(gameId) : undefined;
    const player = room ? this.findPlayer(room, socket.id) : null;
    if (!room || !player || room.result || room.game.isGameOver()) return this.sendError(socket, "CANNOT_RESIGN", "There is no active game to resign from.");
    room.result = player.color === "w" ? "white-resigned" : "black-resigned";
    room.drawOfferBy = null;
    this.io.to(gameId!).emit("game:state", this.toSnapshot(room));
  }

  private leaveGame(socket: ChessSocket): void {
    const gameId = this.socketGames.get(socket.id);
    if (!gameId) return;
    this.endGame(gameId, "player-left", socket.id);
    void socket.leave(gameId);
  }

  private handleDisconnect(socket: ChessSocket): void {
    const gameId = this.socketGames.get(socket.id);
    if (gameId) this.endGame(gameId, "player-disconnected", socket.id);
  }

  private endGame(gameId: string, reason: "player-left" | "player-disconnected", departingSocketId: string): void {
    const room = this.games.get(gameId);
    if (!room) return;
    const opponent = room.white.socketId === departingSocketId ? room.black : room.white;
    this.games.delete(gameId);
    this.socketGames.delete(room.white.socketId);
    if (room.black) this.socketGames.delete(room.black.socketId);
    if (opponent) this.io.to(opponent.socketId).emit("game:ended", { gameId, reason });
  }

  private findPlayer(room: GameRoom, socketId: string): PlayerSeat | null {
    if (room.white.socketId === socketId) return room.white;
    if (room.black?.socketId === socketId) return room.black;
    return null;
  }

  private toSnapshot(room: GameRoom): GameRoomSnapshot {
    const game = room.game.getSnapshot();
    return {
      gameId: room.id,
      phase: (game.isGameOver || room.result) ? "finished" : room.black ? "active" : "waiting",
      fen: game.fen, turn: game.turn, board: game.board, status: game.status,
      isGameOver: game.isGameOver || !!room.result, pgn: game.pgn,
      result: room.result, drawOfferBy: room.drawOfferBy,
      moveHistory: game.moveHistory.map(move => ({
        color: move.color, from: move.from, to: move.to, piece: move.piece,
        san: move.san, lan: move.lan, flags: move.flags, before: move.before, after: move.after,
        ...(move.captured ? { captured: move.captured } : {}),
        ...(move.promotion ? { promotion: move.promotion } : {})
      })),
      players: { white: this.toPublicPlayer(room.white), black: room.black ? this.toPublicPlayer(room.black) : null }
    };
  }

  private toPublicPlayer(player: PlayerSeat): GamePlayer {
    return { id: player.id, username: player.username, color: player.color };
  }
  private sendError(socket: ChessSocket, code: string, message: string): void {
    socket.emit("game:error", { code, message });
  }
}
