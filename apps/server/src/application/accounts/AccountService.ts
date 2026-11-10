import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { Player, PlayerRecord } from "../../domain/accounts/Player.js";
import { PostgresPlayerRepository } from "../../infrastructure/accounts/PostgresPlayerRepository.js";

const SESSION_DAYS = 30;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export class AccountInputError extends Error {}
export class AccountConflictError extends Error {}
export class AccountCredentialsError extends Error {}

export class AccountService {
  constructor(private readonly players: PostgresPlayerRepository) {}

  async register(input: unknown): Promise<{ player: Player; token: string; expiresAt: Date }> {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new AccountInputError("A registration object is required.");
    const body = input as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : username;
    const password = typeof body.password === "string" ? body.password : "";

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountInputError("Enter a valid email address.");
    if (!/^[a-z0-9_]{3,20}$/.test(username)) throw new AccountInputError("Username must be 3–20 characters using letters, numbers or underscores.");
    if (displayName.length < 2 || displayName.length > 40) throw new AccountInputError("Display name must be 2–40 characters.");
    if (password.length < 12 || password.length > 128) throw new AccountInputError("Password must be at least 12 characters.");
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    let player: Player;
    try {
      player = await this.players.createPlayer({ email, username, displayName, passwordHash });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new AccountConflictError("That email or username is already registered.");
      }
      throw error;
    }
    return this.issueSession(player);
  }

  async login(input: unknown): Promise<{ player: Player; token: string; expiresAt: Date }> {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new AccountInputError("A login object is required.");
    const body = input as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password || password.length > 128) throw new AccountInputError("Email and password are required.");
    const record = await this.players.findByEmail(email);
    if (!record || !(await argon2.verify(record.passwordHash, password))) throw new AccountCredentialsError("Email or password is incorrect.");
    const { passwordHash: _passwordHash, ...player } = record;
    return this.issueSession(player);
  }

  async authenticate(token: string | null): Promise<Player | null> {
    if (!token || token.length > 128) return null;
    return this.players.findPlayerBySession(hashToken(token));
  }

  async logout(token: string | null): Promise<void> {
    if (token) await this.players.deleteSession(hashToken(token));
  }

  async updateProfile(playerId: string, input: unknown): Promise<Player> {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new AccountInputError("A profile object is required.");
    const body = input as Record<string, unknown>;
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const avatarUrl = body.avatarUrl === null || body.avatarUrl === "" ? null : body.avatarUrl;
    if (displayName.length < 2 || displayName.length > 40) throw new AccountInputError("Display name must be 2–40 characters.");
    if (avatarUrl !== null && (typeof avatarUrl !== "string" || avatarUrl.length > 500 || !/^https:\/\//i.test(avatarUrl))) {
      throw new AccountInputError("Avatar URL must be an HTTPS URL.");
    }
    const player = await this.players.updateProfile(playerId, displayName, avatarUrl as string | null);
    if (!player) throw new AccountCredentialsError("Account no longer exists.");
    return player;
  }

  async deleteAccount(playerId: string, password: unknown): Promise<void> {
    if (typeof password !== "string" || password.length === 0) throw new AccountInputError("Confirm your password to delete your account.");
    const record: PlayerRecord | null = await this.players.findByEmailForAccountDeletion(playerId);
    if (!record || !(await argon2.verify(record.passwordHash, password))) throw new AccountCredentialsError("Password is incorrect.");
    await this.players.deleteAccount(playerId);
  }

  private async issueSession(player: Player): Promise<{ player: Player; token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await this.players.createSession(player.id, hashToken(token), expiresAt);
    return { player, token, expiresAt };
  }
}
