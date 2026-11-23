import { Chess } from "chess.js";
import type { AnalysisRequest, AnalysisResponse } from "@king-chess/shared";
import type { ChessEngine } from "./engine/EnginePort.js";

export class AnalysisInputError extends Error {}
export class AnalysisUnavailableError extends Error {}

const MIN_DEPTH = 1;
const MAX_DEPTH = 22;
const MAX_FEN_LENGTH = 128;
const MIN_ELO = 1320;
const MAX_ELO = 3190;
const CANDIDATE_LINES = 3;

export class AnalysisService {
  constructor(private readonly engine: ChessEngine) {}

  async analyze(input: unknown): Promise<AnalysisResponse> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new AnalysisInputError("Request body must be an object.");
    }
    const body = input as Partial<AnalysisRequest>;
    if (typeof body.fen !== "string" || body.fen.length > MAX_FEN_LENGTH) {
      throw new AnalysisInputError("A valid FEN string is required.");
    }
    const depth = body.depth ?? 15;
    const elo = body.elo;
    if (!Number.isInteger(depth) || depth < MIN_DEPTH || depth > MAX_DEPTH) {
      throw new AnalysisInputError("Depth must be an integer between 1 and 22.");
    }
    if (elo !== undefined && (!Number.isInteger(elo) || elo < MIN_ELO || elo > MAX_ELO)) {
      throw new AnalysisInputError("Elo must be an integer between 1320 and 3190.");
    }

    let chess: Chess;
    try { chess = new Chess(body.fen); }
    catch { throw new AnalysisInputError("The supplied FEN is invalid."); }
    const fen = chess.fen();
    if (chess.isGameOver()) throw new AnalysisInputError("This position is already terminal.");

    try {
      const result = elo === undefined
        ? await this.engine.analyze(fen, depth, CANDIDATE_LINES)
        : await this.engine.analyze(fen, depth, CANDIDATE_LINES, elo);
      return { fen, ...result };
    } catch (error) {
      throw new AnalysisUnavailableError(error instanceof Error ? error.message : "Analysis engine unavailable.");
    }
  }
}
