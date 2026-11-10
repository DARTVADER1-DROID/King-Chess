import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square
} from "chess.js";

export interface ChessMoveInput {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export type BoardPiece = {
  type: PieceSymbol;
  color: Color;
} | null;

export type GameStatus =
  | "active"
  | "check"
  | "checkmate"
  | "stalemate"
  | "draw";

export interface ChessBoardSnapshot {
  fen: string;
  turn: Color;
  board: BoardPiece[][];
  status: GameStatus;
  isGameOver: boolean;
  pgn: string;
  moveHistory: Move[];
}

/**
 * Server-side chess board and rules wrapper.
 *
 * This class owns one game's authoritative position. Do not accept a FEN
 * supplied by a client as proof that a move is legal; call makeMove() here
 * and broadcast the resulting snapshot to both players.
 */
export class ChessBoard {
  private game: Chess;

  constructor(fen?: string) {
    this.game = fen ? new Chess(fen) : new Chess();
  }

  /** Return the current position in Forsyth–Edwards Notation. */
  getFen(): string {
    return this.game.fen();
  }

  /** Return the side to move: "w" for White or "b" for Black. */
  getTurn(): Color {
    return this.game.turn();
  }

  /** Return a copy of the 8x8 board, with rank 8 first and rank 1 last. */
  getBoard(): BoardPiece[][] {
    return this.game.board().map((rank) =>
      rank.map((piece) =>
        piece ? { type: piece.type, color: piece.color } : null
      )
    );
  }

  /** List legal moves. Pass a square to restrict moves to one piece. */
  getLegalMoves(square?: Square): string[] {
    return this.game.moves(square ? { square } : undefined);
  }

  /** List legal moves with structured move details. */
  getVerboseLegalMoves(square?: Square): Move[] {
    return this.game.moves({
      ...(square ? { square } : {}),
      verbose: true
    });
  }

  /**
   * Apply a legal move and return chess.js move details.
   * Throws an error if the move is illegal or the game has ended.
   */
  makeMove(input: ChessMoveInput): Move {
    return this.game.move(input);
  }

  /** Undo the most recent move. Returns null when there is no move to undo. */
  undoMove(): Move | null {
    return this.game.undo();
  }

  /** Restore the standard starting position and clear move history. */
  reset(): void {
    this.game.reset();
  }

  /**
   * Load a FEN position. chess.js validates the FEN and throws if invalid.
   * A successful load also resets the move history.
   */
  loadFen(fen: string): void {
    const nextGame = new Chess(fen);
    this.game = nextGame;
  }

  /** Whether the side to move is currently in check. */
  isCheck(): boolean {
    return this.game.isCheck();
  }

  isCheckmate(): boolean {
    return this.game.isCheckmate();
  }

  isStalemate(): boolean {
    return this.game.isStalemate();
  }

  isDraw(): boolean {
    return this.game.isDraw();
  }

  isGameOver(): boolean {
    return this.game.isGameOver();
  }

  /** Return the complete move history in standard algebraic notation. */
  getMoveHistory(): string[] {
    return this.game.history();
  }

  /** Return structured move history, including from/to squares and SAN. */
  getVerboseMoveHistory(): Move[] {
    return this.game.history({ verbose: true });
  }

  /** Return the game as Portable Game Notation. */
  getPgn(): string {
    return this.game.pgn();
  }

  /** Return the current game status for API and Socket.IO responses. */
  getStatus(): GameStatus {
    if (this.game.isCheckmate()) return "checkmate";
    if (this.game.isStalemate()) return "stalemate";
    if (this.game.isDraw()) return "draw";
    if (this.game.isCheck()) return "check";
    return "active";
  }

  /** Return a serializable snapshot of the current game state. */
  getSnapshot(): ChessBoardSnapshot {
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
