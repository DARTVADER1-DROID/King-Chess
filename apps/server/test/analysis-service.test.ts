import test from "node:test";
import assert from "node:assert/strict";
import { AnalysisInputError, AnalysisService } from "../src/analysis/AnalysisService.js";
import type { ChessEngine } from "../src/analysis/engine/EnginePort.js";

const fakeEngine: ChessEngine = {
  async analyze(fen, depth) {
    return { bestMove: "e2e4", score: { kind: "centipawns", value: 25, perspective: "side-to-move" }, depth, nodes: 100, timeMs: 10, principalVariation: ["e2e4"], lines: [{ rank: 1, move: "e2e4", score: { kind: "centipawns", value: 25, perspective: "side-to-move" }, depth, nodes: 100, timeMs: 10, moves: ["e2e4"] }] };
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

test("forwards a supported Elo target to Stockfish", async () => {
  let received: number | undefined;
  const engine: ChessEngine = {
    async analyze(fen, depth, multiPv, elo) {
      received = elo;
      return { bestMove: "e2e4", score: null, depth, nodes: 1, timeMs: 1, principalVariation: ["e2e4"], lines: [] };
    },
    async close() {}
  };
  const service = new AnalysisService(engine);
  await service.analyze({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", depth: 12, elo: 1900 });
  assert.equal(received, 1900);
});

test("rejects Elo values outside Stockfish supported bounds", async () => {
  const service = new AnalysisService(fakeEngine);
  const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  for (const elo of [0, 1319, 3191, 4000, 1500.5, "1900", null]) {
    await assert.rejects(() => service.analyze({ fen, elo }), AnalysisInputError, String(elo));
  }
});

test("keeps unrestricted engine strength when Elo is omitted", async () => {
  let argumentCount = 0;
  const engine: ChessEngine = {
    async analyze(...args) {
      argumentCount = args.length;
      const depth = args[1];
      return { bestMove: "e2e4", score: null, depth, nodes: 1, timeMs: 1, principalVariation: ["e2e4"], lines: [] };
    },
    async close() {}
  };
  const service = new AnalysisService(engine);
  await service.analyze({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" });
  assert.equal(argumentCount, 3);
});
