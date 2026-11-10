export interface Player {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesDrawn: number;
  createdAt: string;
}

export interface PlayerRecord extends Player {
  passwordHash: string;
}
