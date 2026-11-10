/** @deprecated Import ChessGame from the domain/chess module instead. */
export { ChessGame as ChessBoard } from "../domain/chess/ChessGame.js";
export type {
  ChessMoveInput,
  BoardPiece,
  GameStatus,
  ChessGameSnapshot as ChessBoardSnapshot
} from "../domain/chess/ChessGame.js";
