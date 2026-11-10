import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  GameRoomSnapshot,
  ServerToClientEvents
} from "@king-chess/shared";

type ChessSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useMultiplayerGame() {
  const socketRef = useRef<ChessSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [room, setRoom] = useState<GameRoomSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setSocketId(socket.id ?? null);
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setSocketId(null);
      setRoom(null);
      setError("Connection lost. Any active room has ended; reconnect and create a new game.");
    });
    socket.on("game:created", snapshot => {
      setRoom(snapshot);
      setError("");
    });
    socket.on("game:joined", snapshot => {
      setRoom(snapshot);
      setError("");
    });
    socket.on("game:state", snapshot => {
      setRoom(current => current?.gameId === snapshot.gameId ? snapshot : current);
    });
    socket.on("game:error", event => setError(event.message));
    socket.on("game:ended", event => {
      setRoom(current => current?.gameId === event.gameId ? null : current);
      setError(event.reason === "player-left"
        ? "The other player left the game."
        : "The other player disconnected. The game has ended.");
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  function createGame(username: string) {
    setError("");
    socketRef.current?.emit("game:create", { username });
  }

  function joinGame(gameId: string, username: string) {
    setError("");
    socketRef.current?.emit("game:join", { gameId, username });
  }

  function submitMove(gameId: string, from: string, to: string) {
    socketRef.current?.emit("game:move", { gameId, from, to, promotion: "q" });
  }

  function leaveGame() {
    socketRef.current?.emit("game:leave");
    setRoom(null);
    setError("");
  }

  return { connected, socketId, room, error, createGame, joinGame, submitMove, leaveGame, clearError: () => setError("") };
}
