import test from "node:test";
import assert from "node:assert/strict";
import { ChessGame } from "../src/domain/chess/ChessGame.js";

test("starts in the standard position and exposes 20 legal moves", () => {
  const game = new ChessGame();
  assert.equal(game.getTurn(), "w");
  assert.equal(game.getLegalMoves().length, 20);
  assert.equal(game.getPieces().length, 32);
});

test("applies and undoes moves without losing position state", () => {
  const game = new ChessGame();
  game.makeMove({ from: "e2", to: "e4" });
  assert.equal(game.getTurn(), "b");
  assert.match(game.getFen(), / b KQkq - 0 1$/);
  assert.equal(game.getMoveHistory()[0], "e4");
  game.undoMove();
  assert.equal(game.getTurn(), "w");
  assert.equal(game.getLegalMoves().length, 20);
});

test("rejects illegal moves and invalid FEN without corrupting state", () => {
  const game = new ChessGame();
  const initial = game.getFen();
  assert.throws(() => game.makeMove({ from: "e2", to: "e5" }));
  assert.equal(game.getFen(), initial);
  assert.throws(() => game.loadFen("not a fen"));
  assert.equal(game.getFen(), initial);
});

test("reports checkmate after the two-rook ladder", () => {
  const game = new ChessGame();
  for (const [from, to] of [["f2","f3"],["e7","e5"],["g2","g4"],["d8","h4"]] as const) {
    game.makeMove({ from, to });
  }
  assert.equal(game.getStatus(), "checkmate");
  assert.equal(game.isGameOver(), true);
});
