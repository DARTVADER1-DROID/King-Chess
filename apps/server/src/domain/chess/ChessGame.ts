import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import { createPieceFromBoard, type PieceInstance } from "./pieces/index.js";

export interface ChessMoveInput {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export type BoardPiece = { type: PieceSymbol; color: Color } | null;
export type GameStatus = "active" | "check" | "checkmate" | "stalemate" | "draw";

export interface ChessGameSnapshot {
  fen: string;
  turn: Color;
  board: BoardPiece[][];
  status: GameStatus;
  isGameOver: boolean;
  pgn: string;
  moveHistory: Move[];
}

/** Owns one position and its complete rules/history through chess.js. */
export class ChessGame {
  private game: Chess;

  constructor(fen?: string) {
    this.game = fen ? new Chess(fen) : new Chess();
  }

  getFen(): string { return this.game.fen(); }
  getTurn(): Color { return this.game.turn(); }

  getBoard(): BoardPiece[][] {
    return this.game.board().map(rank => rank.map(piece =>
      piece ? { type: piece.type, color: piece.color } : null
    ));
  }

  getPieceAt(square: Square): BoardPiece {
    const piece = this.game.get(square);
    return piece ? { type: piece.type, color: piece.color } : null;
  }

  getPiece(square: Square): PieceInstance | null {
    return createPieceFromBoard(this.getPieceAt(square), square);
  }

  getPieces(color?: Color): PieceInstance[] {
    const pieces: PieceInstance[] = [];
    for (let rank = 1; rank <= 8; rank += 1) {
      for (const file of "abcdefgh") {
        const piece = this.getPiece((file + rank) as Square);
        if (piece && (!color || piece.color === color)) pieces.push(piece);
      }
    }
    return pieces;
  }

  getLegalMoves(square?: Square): string[] {
    return square ? this.game.moves({ square }) : this.game.moves();
  }

  getVerboseLegalMoves(square?: Square): Move[] {
    return this.game.moves({ ...(square ? { square } : {}), verbose: true });
  }

  makeMove(input: ChessMoveInput): Move { return this.game.move(input); }
  undoMove(): Move | null { return this.game.undo(); }
  reset(): void { this.game.reset(); }

  loadFen(fen: string): void {
    const next = new Chess(fen);
    this.game = next;
  }

  isCheck(): boolean { return this.game.isCheck(); }
  isCheckmate(): boolean { return this.game.isCheckmate(); }
  isStalemate(): boolean { return this.game.isStalemate(); }
  isDraw(): boolean { return this.game.isDraw(); }
  isGameOver(): boolean { return this.game.isGameOver(); }
  getMoveHistory(): string[] { return this.game.history(); }
  getVerboseMoveHistory(): Move[] { return this.game.history({ verbose: true }); }
  getPgn(): string { return this.game.pgn(); }

  getStatus(): GameStatus {
    if (this.game.isCheckmate()) return "checkmate";
    if (this.game.isStalemate()) return "stalemate";
    if (this.game.isDraw()) return "draw";
    if (this.game.isCheck()) return "check";
    return "active";
  }

  getSnapshot(): ChessGameSnapshot {
    return {
      fen: this.getFen(),
      turn: this.getTurn(),
      board: this.getBoard(),
      status: this.getStatus(),
      isGameOver: this.isGameOver(),
      pgn: this.getPgn(),
      moveHistory: this.getVerboseMoveHistory()
    };
  }
}
