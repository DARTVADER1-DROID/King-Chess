export interface PlayerSummary {
  id: string;
  username: string;
  rating: number;
}
export interface MoveRequest {
  gameId: string;
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}
export interface GameSnapshot {
  gameId: string;
  fen: string;
  turn: "w" | "b";
  players: { white: PlayerSummary; black: PlayerSummary };
}

export type ChessColor = "w" | "b";
export type GamePhase = "waiting" | "active" | "finished";
export interface GamePlayer { id: string; username: string; color: ChessColor; }
export interface ChessPieceSnapshot { type: "p" | "n" | "b" | "r" | "q" | "k"; color: ChessColor; }
export interface ChessMoveRecord {
  color: ChessColor; from: string; to: string; piece: ChessPieceSnapshot["type"];
  san: string; lan: string; flags: string; before: string; after: string;
  captured?: ChessPieceSnapshot["type"]; promotion?: ChessPieceSnapshot["type"];
}
export interface GameRoomSnapshot {
  gameId: string; phase: GamePhase; fen: string; turn: ChessColor;
  board: (ChessPieceSnapshot | null)[][];
  status: "active" | "check" | "checkmate" | "stalemate" | "draw";
  isGameOver: boolean; pgn: string; moveHistory: ChessMoveRecord[];
  players: { white: GamePlayer; black: GamePlayer | null };
}
export interface CreateGameRequest { username: string; }
export interface JoinGameRequest { gameId: string; username: string; }
export interface SubmitMoveRequest { gameId: string; from: string; to: string; promotion?: "q" | "r" | "b" | "n"; }

export interface EngineScore {
  kind: "centipawns" | "mate";
  value: number;
  perspective: "side-to-move";
}
export interface AnalysisRequest { fen: string; depth?: number; }
export interface AnalysisLine {
  rank: number;
  move: string | null;
  score: EngineScore | null;
  depth: number;
  nodes: number | null;
  timeMs: number | null;
  moves: string[];
}
export interface AnalysisResponse {
  fen: string;
  bestMove: string | null;
  score: EngineScore | null;
  depth: number;
  nodes: number | null;
  timeMs: number | null;
  principalVariation: string[];
  lines: AnalysisLine[];
}

export interface ClientToServerEvents {
  "game:create": (payload: CreateGameRequest) => void;
  "game:join": (payload: JoinGameRequest) => void;
  "game:move": (payload: SubmitMoveRequest) => void;
  "game:leave": () => void;
}
export interface ServerToClientEvents {
  "game:created": (snapshot: GameRoomSnapshot) => void;
  "game:joined": (snapshot: GameRoomSnapshot) => void;
  "game:state": (snapshot: GameRoomSnapshot) => void;
  "game:error": (error: { code: string; message: string }) => void;
  "game:ended": (event: { gameId: string; reason: "player-left" | "player-disconnected" }) => void;
}
