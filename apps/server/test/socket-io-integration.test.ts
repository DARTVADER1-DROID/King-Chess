import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import test from "node:test";
import { Server as SocketIOServer } from "socket.io";
import { io as createSocketClient, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@king-chess/shared";
import { registerGameHandlers } from "../src/transport/socket/registerGameHandlers.js";

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function waitForEvent<K extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: K,
  timeoutMs = 5_000
): Promise<Parameters<ServerToClientEvents[K]>[0]> {
  return new Promise((resolve, reject) => {
    const listener = (payload: Parameters<ServerToClientEvents[K]>[0]) => {
      clearTimeout(timeout);
      resolve(payload);
    };
    const timeout = setTimeout(() => {
      socket.off(event, listener as never);
      reject(new Error(`Timed out waiting for Socket.IO event "${event}".`));
    }, timeoutMs);

    socket.once(event, listener as never);
  });
}

async function connectClient(url: string): Promise<ClientSocket> {
  const socket = createSocketClient<ServerToClientEvents, ClientToServerEvents>(url, {
    transports: ["websocket"],
    reconnection: false,
    timeout: 5_000
  });

  await new Promise<void>((resolve, reject) => {
    const onConnect = () => {
      socket.off("connect_error", onConnectError);
      resolve();
    };
    const onConnectError = (error: Error) => {
      socket.off("connect", onConnect);
      reject(error);
    };

    socket.once("connect", onConnect);
    socket.once("connect_error", onConnectError);
  });

  return socket;
}

async function startGameServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const httpServer = createHttpServer();
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    transports: ["websocket"]
  });
  registerGameHandlers(io);

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    await new Promise<void>(resolve => io.close(() => resolve()));
    throw new Error("The test server did not bind to a TCP port.");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>(resolve => io.close(() => resolve()))
  };
}

test("two real Socket.IO clients receive only server-validated game state", async t => {
  const server = await startGameServer();
  const clients: ClientSocket[] = [];

  t.after(async () => {
    for (const client of clients) client.disconnect();
    await server.close();
  });

  const white = await connectClient(server.url);
  clients.push(white);
  const black = await connectClient(server.url);
  clients.push(black);
  const spectator = await connectClient(server.url);
  clients.push(spectator);

  const createdEvent = waitForEvent(white, "game:created");
  white.emit("game:create", { username: "Alice" });
  const created = await createdEvent;
  assert.equal(created.phase, "waiting");
  assert.equal(created.players.white.username, "Alice");

  const joinedEvent = waitForEvent(black, "game:joined");
  const whiteJoinedEvent = waitForEvent(white, "game:state");
  black.emit("game:join", { gameId: created.gameId, username: "Bob" });
  const [joined, whiteJoined] = await Promise.all([joinedEvent, whiteJoinedEvent]);
  assert.equal(joined.phase, "active");
  assert.equal(joined.players.black?.username, "Bob");
  assert.equal(whiteJoined.fen, joined.fen);

  const outOfTurnError = waitForEvent(black, "game:error");
  black.emit("game:move", { gameId: created.gameId, from: "e7", to: "e5" });
  assert.equal((await outOfTurnError).code, "NOT_YOUR_TURN");

  const whiteMoveEvent = waitForEvent(white, "game:state");
  const blackMoveEvent = waitForEvent(black, "game:state");
  white.emit("game:move", { gameId: created.gameId, from: "e2", to: "e4" });
  const [whiteAfterE4, blackAfterE4] = await Promise.all([whiteMoveEvent, blackMoveEvent]);
  assert.equal(whiteAfterE4.fen, blackAfterE4.fen);
  assert.equal(whiteAfterE4.turn, "b");
  assert.deepEqual(whiteAfterE4.moveHistory.map(move => move.san), ["e4"]);

  const illegalMoveError = waitForEvent(black, "game:error");
  black.emit("game:move", { gameId: created.gameId, from: "e7", to: "e4" });
  assert.equal((await illegalMoveError).code, "ILLEGAL_MOVE");

  const whiteAfterE5Event = waitForEvent(white, "game:state");
  const blackAfterE5Event = waitForEvent(black, "game:state");
  black.emit("game:move", { gameId: created.gameId, from: "e7", to: "e5" });
  const [whiteAfterE5, blackAfterE5] = await Promise.all([whiteAfterE5Event, blackAfterE5Event]);
  assert.equal(whiteAfterE5.fen, blackAfterE5.fen);
  assert.equal(whiteAfterE5.turn, "w");
  assert.deepEqual(whiteAfterE5.moveHistory.map(move => move.san), ["e4", "e5"]);

  const spectatorError = waitForEvent(spectator, "game:error");
  spectator.emit("game:move", { gameId: created.gameId, from: "a7", to: "a6" });
  assert.equal((await spectatorError).code, "NOT_IN_GAME");

  const endedEvent = waitForEvent(white, "game:ended");
  black.disconnect();
  const ended = await endedEvent;
  assert.equal(ended.gameId, created.gameId);
  assert.equal(ended.reason, "player-disconnected");
});
