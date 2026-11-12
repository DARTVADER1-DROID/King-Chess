export type EngineScore =
  | { kind: "centipawns"; value: number; perspective: "side-to-move" }
  | { kind: "mate"; value: number; perspective: "side-to-move" };

export interface EngineAnalysis {
  bestMove: string | null;
  score: EngineScore | null;
  depth: number;
  nodes: number | null;
  timeMs: number | null;
  principalVariation: string[];
  lines: Array<{ rank: number; move: string | null; score: EngineScore | null; depth: number; nodes: number | null; timeMs: number | null; moves: string[] }>;
}

export interface ChessEngine {
  analyze(fen: string, depth: number, multiPv?: number, signal?: AbortSignal): Promise<EngineAnalysis>;
  close(): Promise<void>;
}
