import type { Color, Move, PieceSymbol, Square } from "chess.js";
import type { BoardPiece, ChessGame } from "../ChessGame.js";

/** Position-bound piece view. All legality comes from the canonical chess.js position. */
export abstract class ChessPiece {
  abstract readonly type: PieceSymbol;

  constructor(public readonly color: Color, public readonly square: Square) {}

  getLegalMoves(game: ChessGame): Move[] {
    const current = game.getPieceAt(this.square);
    if (!current || current.color !== this.color || current.type !== this.type) return [];
    return game.getVerboseLegalMoves(this.square);
  }

  canMoveTo(game: ChessGame, target: Square): boolean {
    return this.getLegalMoves(game).some(move => move.to === target);
  }

  getLegalDestinations(game: ChessGame): Square[] {
    return this.getLegalMoves(game).map(move => move.to);
  }
}

export class Pawn extends ChessPiece { readonly type = "p"; }
export class Knight extends ChessPiece { readonly type = "n"; }
export class Bishop extends ChessPiece { readonly type = "b"; }
export class Rook extends ChessPiece { readonly type = "r"; }
export class Queen extends ChessPiece { readonly type = "q"; }
export class King extends ChessPiece { readonly type = "k"; }

export type PieceInstance = Pawn | Knight | Bishop | Rook | Queen | King;

export function createPiece(piece: Exclude<BoardPiece, null>, square: Square): PieceInstance {
  switch (piece.type) {
    case "p": return new Pawn(piece.color, square);
    case "n": return new Knight(piece.color, square);
    case "b": return new Bishop(piece.color, square);
    case "r": return new Rook(piece.color, square);
    case "q": return new Queen(piece.color, square);
    case "k": return new King(piece.color, square);
    default: {
      const exhaustive: never = piece.type;
      throw new Error("Unsupported chess piece: " + exhaustive);
    }
  }
}

export function createPieceFromBoard(piece: BoardPiece, square: Square): PieceInstance | null {
  return piece ? createPiece(piece, square) : null;
}
