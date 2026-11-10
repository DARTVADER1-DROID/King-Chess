import type { Pool } from "pg";
import type { Player, PlayerRecord } from "../../domain/accounts/Player.js";

interface PlayerRow {
  id: string; email: string; username: string; display_name: string; avatar_url: string | null;
  password_hash: string; rating: number; games_played: number; games_won: number; games_drawn: number;
  created_at: Date;
}

function toRecord(row: PlayerRow): PlayerRecord {
  return {
    id: row.id, email: row.email, username: row.username, displayName: row.display_name,
    avatarUrl: row.avatar_url, passwordHash: row.password_hash, rating: row.rating,
    gamesPlayed: row.games_played, gamesWon: row.games_won, gamesDrawn: row.games_drawn,
    createdAt: row.created_at.toISOString()
  };
}

function publicPlayer(record: PlayerRecord): Player {
  const { passwordHash: _passwordHash, ...player } = record;
  return player;
}

export class PostgresPlayerRepository {
  constructor(private readonly pool: Pool) {}

  async createPlayer(input: { email: string; username: string; displayName: string; passwordHash: string }): Promise<Player> {
    const result = await this.pool.query<PlayerRow>(
      `INSERT INTO players (email, username, display_name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, username, display_name, avatar_url, password_hash, rating,
         games_played, games_won, games_drawn, created_at`,
      [input.email, input.username, input.displayName, input.passwordHash]
    );
    return publicPlayer(toRecord(result.rows[0]));
  }

  async findByEmail(email: string): Promise<PlayerRecord | null> {
    const result = await this.pool.query<PlayerRow>(
      `SELECT id, email, username, display_name, avatar_url, password_hash, rating,
        games_played, games_won, games_drawn, created_at FROM players WHERE email = $1`, [email]
    );
    return result.rows[0] ? toRecord(result.rows[0]) : null;
  }

  async findById(id: string): Promise<Player | null> {
    const result = await this.pool.query<PlayerRow>(
      `SELECT id, email, username, display_name, avatar_url, password_hash, rating,
        games_played, games_won, games_drawn, created_at FROM players WHERE id = $1`, [id]
    );
    return result.rows[0] ? publicPlayer(toRecord(result.rows[0])) : null;
  }

  async createSession(playerId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      `INSERT INTO player_sessions (player_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [playerId, tokenHash, expiresAt]
    );
  }

  async findPlayerBySession(tokenHash: string): Promise<Player | null> {
    const result = await this.pool.query<PlayerRow>(
      `SELECT p.id, p.email, p.username, p.display_name, p.avatar_url, p.password_hash,
        p.rating, p.games_played, p.games_won, p.games_drawn, p.created_at
       FROM player_sessions s JOIN players p ON p.id = s.player_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`, [tokenHash]
    );
    return result.rows[0] ? publicPlayer(toRecord(result.rows[0])) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.pool.query("DELETE FROM player_sessions WHERE token_hash = $1", [tokenHash]);
  }

  async updateProfile(id: string, displayName: string, avatarUrl: string | null): Promise<Player | null> {
    const result = await this.pool.query<PlayerRow>(
      `UPDATE players SET display_name = $2, avatar_url = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, username, display_name, avatar_url, password_hash, rating,
         games_played, games_won, games_drawn, created_at`, [id, displayName, avatarUrl]
    );
    return result.rows[0] ? publicPlayer(toRecord(result.rows[0])) : null;
  }

  async deleteAccount(id: string): Promise<void> {
    await this.pool.query("DELETE FROM players WHERE id = $1", [id]);
  }

  async cleanupExpiredSessions(): Promise<void> {
    await this.pool.query("DELETE FROM player_sessions WHERE expires_at <= NOW()");
  }
}
