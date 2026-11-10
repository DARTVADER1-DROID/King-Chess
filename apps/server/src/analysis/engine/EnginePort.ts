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
}

export interface ChessEngine {
  analyze(fen: string, depth: number): Promise<EngineAnalysis>;
  close(): Promise<void>;
}
