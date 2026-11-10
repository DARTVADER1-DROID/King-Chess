import test from "node:test";
import assert from "node:assert/strict";
import { AccountInputError, AccountService } from "../src/application/accounts/AccountService.js";

const repository = {
  async createPlayer(input: { email: string; username: string; displayName: string; passwordHash: string }) {
    return { id: "player-1", email: input.email, username: input.username, displayName: input.displayName, avatarUrl: null, rating: 1200, gamesPlayed: 0, gamesWon: 0, gamesDrawn: 0, createdAt: new Date().toISOString() };
  },
  async createSession() {},
  async findByEmail() { return null; },
  async findById() { return null; },
  async findPlayerBySession() { return null; },
  async deleteSession() {},
  async updateProfile() { return null; },
  async deleteAccount() {},
  async findByEmailForAccountDeletion() { return null; }
};

test("registration validates required account fields", async () => {
  const service = new AccountService(repository as never);
  await assert.rejects(() => service.register({ email: "not-an-email", username: "ab", password: "short" }), AccountInputError);
  await assert.rejects(() => service.register({ email: "player@example.com", username: "valid_user", password: "short" }), AccountInputError);
});

test("registration normalizes email and username and creates a session", async () => {
  let created: { email: string; username: string } | undefined;
  let sessionCreated = false;
  const fake = {
    ...repository,
    async createPlayer(input: { email: string; username: string; displayName: string; passwordHash: string }) {
      created = { email: input.email, username: input.username };
      return { id: "player-1", email: input.email, username: input.username, displayName: input.displayName, avatarUrl: null, rating: 1200, gamesPlayed: 0, gamesWon: 0, gamesDrawn: 0, createdAt: new Date().toISOString() };
    },
    async createSession() { sessionCreated = true; }
  };
  const service = new AccountService(fake as never);
  const result = await service.register({ email: "PLAYER@example.com", username: "Chess_User", displayName: "Chess Player", password: "a-long-test-password" });
  assert.deepEqual(created, { email: "player@example.com", username: "chess_user" });
  assert.equal(sessionCreated, true);
  assert.equal(result.player.id, "player-1");
  assert.ok(result.token.length > 30);
});
