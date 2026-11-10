export interface PlayerSummary {
  id: string;
  username: string;
  rating: number;
}

export interface MoveRequest {
  gameId: string;
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

export interface GameSnapshot {
  gameId: string;
  fen: string;
  turn: "w" | "b";
  players: {
    white: PlayerSummary;
    black: PlayerSummary;
  };
}
