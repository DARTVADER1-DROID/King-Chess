import { Chess } from "chess.js";
import type { AnalysisRequest, AnalysisResponse } from "@king-chess/shared";
import type { ChessEngine } from "./engine/EnginePort.js";
import { AnalysisQueue, AnalysisQueueFullError } from "../application/analysis/AnalysisQueue.js";

export class AnalysisInputError extends Error {}
export class AnalysisUnavailableError extends Error {}

const MIN_DEPTH = 1;
const MAX_DEPTH = 22;
const MAX_FEN_LENGTH = 128;
const CANDIDATE_LINES = 3;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function createAbortError(): Error {
  const error = new Error("Analysis request was cancelled.");
  error.name = "AbortError";
  return error;
}

export class AnalysisService {
  constructor(
    private readonly engine: ChessEngine,
    private readonly queue = new AnalysisQueue(2)
  ) {}

  async analyze(input: unknown, signal?: AbortSignal): Promise<AnalysisResponse> {
    if (signal?.aborted) throw createAbortError();
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new AnalysisInputError("Request body must be an object.");
    }
    const body = input as Partial<AnalysisRequest>;
    if (typeof body.fen !== "string" || body.fen.length > MAX_FEN_LENGTH) {
      throw new AnalysisInputError("A valid FEN string is required.");
    }
    const depth = body.depth ?? 15;
    if (!Number.isInteger(depth) || depth < MIN_DEPTH || depth > MAX_DEPTH) {
      throw new AnalysisInputError("Depth must be an integer between 1 and 22.");
    }

    let chess: Chess;
    try { chess = new Chess(body.fen); }
    catch { throw new AnalysisInputError("The supplied FEN is invalid."); }
    const fen = chess.fen();
    if (chess.isGameOver()) throw new AnalysisInputError("This position is already terminal.");

    try {
      const result = await this.queue.run(
        () => this.engine.analyze(fen, depth, CANDIDATE_LINES, signal),
        signal
      );
      return { fen, ...result };
    } catch (error) {
      if (isAbortError(error) || error instanceof AnalysisQueueFullError) throw error;
      throw new AnalysisUnavailableError(error instanceof Error ? error.message : "Analysis engine unavailable.");
    }
  }
}
