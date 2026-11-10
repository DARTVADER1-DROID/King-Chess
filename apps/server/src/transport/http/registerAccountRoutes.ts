import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Player } from "../../domain/accounts/Player.js";
import { AccountConflictError, AccountCredentialsError, AccountInputError, AccountService } from "../../application/accounts/AccountService.js";

const COOKIE_NAME = "king_chess_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const secureCookie = process.env.NODE_ENV === "production";

function readSessionToken(request: FastifyRequest): string | null {
  const cookie = request.headers.cookie;
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(value.join("="));
  }
  return null;
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.header("set-cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secureCookie ? "; Secure" : ""}`);
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.header("set-cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie ? "; Secure" : ""}`);
}

function publicAccount(player: Player) {
  return { player };
}

async function requirePlayer(service: AccountService, request: FastifyRequest, reply: FastifyReply): Promise<Player | null> {
  const player = await service.authenticate(readSessionToken(request));
  if (!player) {
    await reply.code(401).send({ error: "Authentication required." });
    return null;
  }
  return player;
}

export async function registerAccountRoutes(app: FastifyInstance, service: AccountService): Promise<void> {
  const handleError = (error: unknown, reply: FastifyReply) => {
    if (error instanceof AccountInputError) return reply.code(400).send({ error: error.message });
    if (error instanceof AccountConflictError) return reply.code(409).send({ error: error.message });
    if (error instanceof AccountCredentialsError) return reply.code(401).send({ error: error.message });
    app.log.error({ err: error }, "Account operation failed");
    return reply.code(500).send({ error: "Internal server error." });
  };

  app.post("/api/accounts/register", async (request, reply) => {
    try {
      const result = await service.register(request.body);
      setSessionCookie(reply, result.token);
      return reply.code(201).send(publicAccount(result.player));
    } catch (error) { return handleError(error, reply); }
  });

  app.post("/api/accounts/login", async (request, reply) => {
    try {
      const result = await service.login(request.body);
      setSessionCookie(reply, result.token);
      return reply.send(publicAccount(result.player));
    } catch (error) { return handleError(error, reply); }
  });

  app.post("/api/accounts/logout", async (request, reply) => {
    await service.logout(readSessionToken(request));
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get("/api/accounts/me", async (request, reply) => {
    const player = await requirePlayer(service, request, reply);
    return player ? reply.send(publicAccount(player)) : reply;
  });

  app.patch("/api/accounts/me", async (request, reply) => {
    const player = await requirePlayer(service, request, reply);
    if (!player) return reply;
    try { return reply.send(publicAccount(await service.updateProfile(player.id, request.body))); }
    catch (error) { return handleError(error, reply); }
  });

  app.delete("/api/accounts/me", async (request, reply) => {
    const player = await requirePlayer(service, request, reply);
    if (!player) return reply;
    try {
      const body = request.body as { password?: unknown } | undefined;
      await service.deleteAccount(player.id, body?.password);
      clearSessionCookie(reply);
      return reply.code(204).send();
    } catch (error) { return handleError(error, reply); }
  });
}
