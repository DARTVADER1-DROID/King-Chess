import type { Color, Move, PieceSymbol, Square } from "chess.js";
import type { BoardPiece, ChessBoard } from "../ChessBoard.js";

/**
 * Base class for a piece at a particular square.
 *
 * Movement legality is intentionally delegated to ChessBoard/chess.js so
 * pins, check, castling, en passant and promotion are handled consistently.
 */
export abstract class ChessPiece {
  abstract readonly type: PieceSymbol;

  constructor(
    public readonly color: Color,
    public readonly square: Square
  ) {}

  /** All currently legal moves for this piece in the supplied position. */
  getLegalMoves(board: ChessBoard): Move[] {
    const currentPiece = board.getPieceAt(this.square);

    // A piece object is a position-specific view; don't return stale moves
    // after the piece has moved, been captured, or been promoted.
    if (
      !currentPiece ||
      currentPiece.color !== this.color ||
      currentPiece.type !== this.type
    ) {
      return [];
    }

    return board.getVerboseLegalMoves(this.square);
  }

  /** Whether this piece can legally move to the target square right now. */
  canMoveTo(board: ChessBoard, target: Square): boolean {
    return this.getLegalMoves(board).some((move) => move.to === target);
  }

  /** Destination squares for the piece's currently legal moves. */
  getLegalDestinations(board: ChessBoard): Square[] {
    return this.getLegalMoves(board).map((move) => move.to);
  }
}

export class Pawn extends ChessPiece {
  readonly type = "p";
}

export class Knight extends ChessPiece {
  readonly type = "n";
}

export class Bishop extends ChessPiece {
  readonly type = "b";
}

export class Rook extends ChessPiece {
  readonly type = "r";
}

export class Queen extends ChessPiece {
  readonly type = "q";
}

export class King extends ChessPiece {
  readonly type = "k";
}

export type PieceInstance =
  | Pawn
  | Knight
  | Bishop
  | Rook
  | Queen
  | King;

/** Create the correct piece class for a piece on a board square. */
export function createPiece(
  piece: Exclude<BoardPiece, null>,
  square: Square
): PieceInstance {
  switch (piece.type) {
    case "p":
      return new Pawn(piece.color, square);
    case "n":
      return new Knight(piece.color, square);
    case "b":
      return new Bishop(piece.color, square);
    case "r":
      return new Rook(piece.color, square);
    case "q":
      return new Queen(piece.color, square);
    case "k":
      return new King(piece.color, square);
  }
}

/** Create a piece instance from a board lookup, or null for an empty square. */
export function createPieceFromBoard(
  piece: BoardPiece,
  square: Square
): PieceInstance | null {
  return piece ? createPiece(piece, square) : null;
}
