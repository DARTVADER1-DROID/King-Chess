import test from "node:test";
import assert from "node:assert/strict";
import { parseUciInfo } from "../src/infrastructure/engine/UciStockfishEngine.js";

test("parses centipawn search information and principal variation", () => {
  assert.deepEqual(parseUciInfo("info depth 18 seldepth 25 score cp 34 nodes 123456 time 987 pv e2e4 e7e5 g1f3"), {
    depth: 18, nodes: 123456, timeMs: 987,
    score: { kind: "centipawns", value: 34, perspective: "side-to-move" },
    principalVariation: ["e2e4", "e7e5", "g1f3"]
  });
});

test("parses mate scores and ignores unrelated UCI output", () => {
  assert.deepEqual(parseUciInfo("info depth 12 score mate -3 pv e1e2"), {
    depth: 12, score: { kind: "mate", value: -3, perspective: "side-to-move" },
    principalVariation: ["e1e2"]
  });
  assert.equal(parseUciInfo("readyok"), null);
});
