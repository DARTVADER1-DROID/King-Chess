import test from "node:test";
import assert from "node:assert/strict";
import { AnalysisInputError, AnalysisService } from "../src/analysis/AnalysisService.js";
import type { ChessEngine } from "../src/analysis/engine/EnginePort.js";

const fakeEngine: ChessEngine = {
  async analyze(fen, depth) {
    return { bestMove: "e2e4", score: { kind: "centipawns", value: 25, perspective: "side-to-move" }, depth, nodes: 100, timeMs: 10, principalVariation: ["e2e4"] };
  },
  async close() {}
};

test("validates FEN and depth before calling the engine", async () => {
  const service = new AnalysisService(fakeEngine);
  await assert.rejects(() => service.analyze({ fen: "invalid", depth: 10 }), AnalysisInputError);
  await assert.rejects(() => service.analyze({ fen: "8/8/8/8/8/8/8/8 w - - 0 1", depth: 10 }), AnalysisInputError);
  await assert.rejects(() => service.analyze({ fen: "8/8/8/8/8/8/8/8 w - - 0 1", depth: 99 }), AnalysisInputError);
});

test("returns a normalized engine result for a valid position", async () => {
  const service = new AnalysisService(fakeEngine);
  const result = await service.analyze({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", depth: 10 });
  assert.equal(result.bestMove, "e2e4");
  assert.equal(result.depth, 10);
});
