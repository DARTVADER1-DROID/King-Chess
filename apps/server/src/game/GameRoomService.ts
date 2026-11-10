import { randomUUID } from "node:crypto";
import type { PieceSymbol, Square } from "chess.js";
import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  GamePlayer,
  GameRoomSnapshot,
  ServerToClientEvents,
  SubmitMoveRequest
} from "@king-chess/shared";
import { ChessBoard } from "./ChessBoard.js";

type ChessServer = Server<ClientToServerEvents, ServerToClientEvents>;
type ChessSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface PlayerSeat extends GamePlayer {
  socketId: string;
}

interface GameRoom {
  id: string;
  board: ChessBoard;
  white: PlayerSeat;
  black: PlayerSeat | null;
}

const USERNAME_MAX_LENGTH = 24;
const SQUARE_PATTERN = /^[a-h][1-8]$/;
const PROMOTIONS = new Set(["q", "r", "b", "n"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim();
  if (!username || username.length > USERNAME_MAX_LENGTH) return null;
  return username;
}

/**
 * Owns active multiplayer games in this server process.
 *
 * Every move is checked against the room's authoritative ChessBoard before
 * the new snapshot is broadcast. Clients never submit a trusted board/FEN.
 */
export class GameRoomService {
  private readonly games = new Map<string, GameRoom>();
  private readonly socketGames = new Map<string, string>();

  constructor(private readonly io: ChessServer) {}

  attach(socket: ChessSocket): void {
    socket.on("game:create", (payload) => this.createGame(socket, payload));
    socket.on("game:join", (payload) => this.joinGame(socket, payload));
    socket.on("game:move", (payload) => this.submitMove(socket, payload));
    socket.on("game:leave", () => this.leaveGame(socket));
    socket.on("disconnect", () => this.handleDisconnect(socket));
  }

  private createGame(socket: ChessSocket, payload: unknown): void {
    if (this.socketGames.has(socket.id)) {
      this.sendError(socket, "ALREADY_IN_GAME", "Leave your current game first.");
      return;
    }

    const username = isRecord(payload) ? cleanUsername(payload.username) : null;
    if (!username) {
      this.sendError(
        socket,
        "INVALID_USERNAME",
        `Username must contain 1-${USERNAME_MAX_LENGTH} characters.`
      );
      return;
    }

    const id = randomUUID();
    const white: PlayerSeat = {
      id: socket.id,
      socketId: socket.id,
      username,
      color: "w"
    };
    const room: GameRoom = { id, board: new ChessBoard(), white, black: null };

    this.games.set(id, room);
    this.socketGames.set(socket.id, id);
    void socket.join(id);
    socket.emit("game:created", this.toSnapshot(room));
  }

  private joinGame(socket: ChessSocket, payload: unknown): void {
    if (this.socketGames.has(socket.id)) {
      this.sendError(socket, "ALREADY_IN_GAME", "Leave your current game first.");
      return;
    }

    const gameId =
      isRecord(payload) && typeof payload.gameId === "string"
        ? payload.gameId.trim()
        : "";
    const username = isRecord(payload) ? cleanUsername(payload.username) : null;

    if (!gameId || !username) {
      this.sendError(socket, "INVALID_JOIN_REQUEST", "A valid game ID and username are required.");
      return;
    }

    const room = this.games.get(gameId);
    if (!room) {
      this.sendError(socket, "GAME_NOT_FOUND", "That game does not exist or has ended.");
      return;
    }
    if (room.black) {
      this.sendError(socket, "GAME_FULL", "That game already has two players.");
      return;
    }
    if (room.white.socketId === socket.id) {
      this.sendError(socket, "CANNOT_JOIN_OWN_GAME", "You created this game.");
      return;
    }

    room.black = {
      id: socket.id,
      socketId: socket.id,
      username,
      color: "b"
    };
    this.socketGames.set(socket.id, gameId);
    void socket.join(gameId);

    const snapshot = this.toSnapshot(room);
    socket.emit("game:joined", snapshot);
    socket.to(gameId).emit("game:state", snapshot);
  }

  private submitMove(socket: ChessSocket, payload: unknown): void {
    if (!isRecord(payload)) {
      this.sendError(socket, "INVALID_MOVE", "Move payload must be an object.");
      return;
    }

    const request = payload as unknown as SubmitMoveRequest;
    const gameId = typeof request.gameId === "string" ? request.gameId : "";
    const room = this.games.get(gameId);

    if (!room || this.socketGames.get(socket.id) !== gameId) {
      this.sendError(socket, "NOT_IN_GAME", "You are not a player in that game.");
      return;
    }
    if (!room.black) {
      this.sendError(socket, "GAME_NOT_READY", "Waiting for the second player to join.");
      return;
    }

    const player = this.findPlayer(room, socket.id);
    if (!player) {
      this.sendError(socket, "NOT_A_PLAYER", "You are not a player in that game.");
      return;
    }
    if (room.board.isGameOver()) {
      this.sendError(socket, "GAME_OVER", "This game has already finished.");
      return;
    }
    if (room.board.getTurn() !== player.color) {
      this.sendError(socket, "NOT_YOUR_TURN", "It is the other player's turn.");
      return;
    }

    if (
      typeof request.from !== "string" ||
      typeof request.to !== "string" ||
      !SQUARE_PATTERN.test(request.from) ||
      !SQUARE_PATTERN.test(request.to)
    ) {
      this.sendError(socket, "INVALID_SQUARE", "Move must contain valid from and to squares.");
      return;
    }

    if (
      request.promotion !== undefined &&
      (typeof request.promotion !== "string" || !PROMOTIONS.has(request.promotion))
    ) {
      this.sendError(socket, "INVALID_PROMOTION", "Promotion must be q, r, b, or n.");
      return;
    }

    try {
      room.board.makeMove({
        from: request.from as Square,
        to: request.to as Square,
        ...(request.promotion
          ? { promotion: request.promotion as PieceSymbol }
          : {})
      });
    } catch {
      this.sendError(socket, "ILLEGAL_MOVE", "That move is not legal in the current position.");
      return;
    }

    this.io.to(gameId).emit("game:state", this.toSnapshot(room));
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

  private endGame(
    gameId: string,
    reason: "player-left" | "player-disconnected",
    departingSocketId: string
  ): void {
    const room = this.games.get(gameId);
    if (!room) return;

    const opponent =
      room.white.socketId === departingSocketId ? room.black : room.white;

    this.games.delete(gameId);
    this.socketGames.delete(room.white.socketId);
    if (room.black) this.socketGames.delete(room.black.socketId);

    if (opponent) {
      this.io.to(opponent.socketId).emit("game:ended", { gameId, reason });
    }
  }

  private findPlayer(room: GameRoom, socketId: string): PlayerSeat | null {
    if (room.white.socketId === socketId) return room.white;
    if (room.black?.socketId === socketId) return room.black;
    return null;
  }

  private toSnapshot(room: GameRoom): GameRoomSnapshot {
    const board = room.board.getSnapshot();
    return {
      gameId: room.id,
      phase: board.isGameOver ? "finished" : room.black ? "active" : "waiting",
      fen: board.fen,
      turn: board.turn,
      board: board.board,
      status: board.status,
      isGameOver: board.isGameOver,
      pgn: board.pgn,
      moveHistory: board.moveHistory.map((move) => ({
        color: move.color,
        from: move.from,
        to: move.to,
        piece: move.piece,
        san: move.san,
        lan: move.lan,
        flags: move.flags,
        before: move.before,
        after: move.after,
        ...(move.captured ? { captured: move.captured } : {}),
        ...(move.promotion ? { promotion: move.promotion } : {})
      })),
      players: {
        white: this.toPublicPlayer(room.white),
        black: room.black ? this.toPublicPlayer(room.black) : null
      }
    };
  }

  private toPublicPlayer(player: PlayerSeat): GamePlayer {
    return {
      id: player.id,
      username: player.username,
      color: player.color
    };
  }

  private sendError(socket: ChessSocket, code: string, message: string): void {
    socket.emit("game:error", { code, message });
  }
}
