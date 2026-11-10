import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { GameRoomService } from "../src/application/games/GameRoomService.js";

class FakeSocket extends EventEmitter {
  readonly rooms = new Set<string>();
  connected = true;

  constructor(readonly id: string, private readonly peers: () => FakeSocket[]) { super(); this.rooms.add(id); }

  async join(room: string) { this.rooms.add(room); }
  async leave(room: string) { this.rooms.delete(room); }

  to(room: string) {
    return {
      emit: (event: string, ...args: unknown[]) => {
        for (const peer of this.peers()) {
          if (peer !== this && peer.rooms.has(room)) peer.emit(event, ...args);
        }
      }
    };
  }
}

class FakeIo extends EventEmitter {
  readonly sockets = new Set<FakeSocket>();

  createSocket(id: string) {
    const socket = new FakeSocket(id, () => [...this.sockets]);
    this.sockets.add(socket);
    return socket;
  }

  to(room: string) {
    return {
      emit: (event: string, ...args: unknown[]) => {
        for (const socket of this.sockets) {
          if (socket.rooms.has(room)) socket.emit(event, ...args);
        }
      }
    };
  }
}

test("creates a room, joins a second player and broadcasts server-validated moves", async () => {
  const io = new FakeIo();
  const service = new GameRoomService(io as never);
  const white = io.createSocket("white-socket");
  const black = io.createSocket("black-socket");
  service.attach(white as never);
  service.attach(black as never);

  const createdEvent = once(white, "game:created");
  white.emit("game:create", { username: "Alice" });
  const [created] = await createdEvent;
  assert.equal(created.phase, "waiting");
  assert.equal(created.players.white.username, "Alice");
  assert.equal(created.players.black, null);

  const joinedEvent = once(black, "game:joined");
  const whiteUpdate = once(white, "game:state");
  black.emit("game:join", { gameId: created.gameId, username: "Bob" });
  const [joined] = await joinedEvent;
  await whiteUpdate;
  assert.equal(joined.phase, "active");
  assert.equal(joined.players.black.username, "Bob");

  const whiteMove = once(white, "game:state");
  const blackMove = once(black, "game:state");
  white.emit("game:move", { gameId: created.gameId, from: "e2", to: "e4" });
  const [whiteState] = await whiteMove;
  const [blackState] = await blackMove;
  assert.equal(whiteState.fen, blackState.fen);
  assert.equal(whiteState.turn, "b");
  assert.equal(whiteState.moveHistory.at(-1).san, "e4");

  const rejected = once(white, "game:error");
  white.emit("game:move", { gameId: created.gameId, from: "d2", to: "d4" });
  const [error] = await rejected;
  assert.equal(error.code, "NOT_YOUR_TURN");

  const ended = once(white, "game:ended");
  black.emit("game:leave");
  const [event] = await ended;
  assert.equal(event.gameId, created.gameId);
  assert.equal(event.reason, "player-left");
});
