# King Chess

A real-time, web-based multiplayer chess application.

## Stack
- Web: React, Vite, TypeScript
- API/realtime: Node.js, Fastify, Socket.IO
- Rules and position validation: chess.js
- Analysis: Stockfish through the UCI protocol (optional local executable)
- Accounts: Fastify routes, PostgreSQL (`pg`), Argon2id password hashing and opaque server-managed sessions
- Shared contracts: TypeScript workspace package
- Package manager: pnpm workspaces

## Requirements
- Node.js 22 or newer
- pnpm 10 or newer

## Getting started
```bash
corepack enable
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm dev
```
The web app runs at http://localhost:5173 and the API at http://localhost:3001.

## Workspace architecture
```text
apps/
  web/                         React + Vite client
  server/
    src/
      domain/chess/             ChessGame, position-bound piece views
      application/games/         Game-room use cases and orchestration
      analysis/                  Analysis service and engine port
      infrastructure/engine/     Stockfish UCI process adapter
      transport/http/             Fastify routes
      transport/socket/           Socket.IO event registration
packages/
  shared/                       API and realtime contracts
```

The dependency direction is transport → application/domain. The chess domain does not depend on Socket.IO or Fastify. The analysis service depends on an engine interface; Stockfish is an infrastructure adapter.

## Commands
```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm --filter @king-chess/server test
```

## Multiplayer events
The first player is White and the second player is Black. Clients create or join invite-code rooms with `game:create` and `game:join`, submit UCI-coordinate moves with `game:move`, and render authoritative `game:state` snapshots. The server checks membership, turn ownership, input shape and move legality before broadcasting. A disconnect currently ends the room.

## Chess analysis engine
Install Stockfish on the server host and set `STOCKFISH_PATH` to its executable path (or ensure `stockfish` is on PATH). The backend starts it lazily and speaks UCI; no engine binary is bundled in this repository.

`POST /api/analysis`:
```json
{ "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "depth": 15 }
```
Depth is limited to 1–22. The response includes best move, score (from the side-to-move perspective), completed depth, nodes, elapsed engine time and principal variation. If Stockfish is not installed/configured, the route returns HTTP 503. The engine serializes searches and currently supports one analysis at a time.

## Security and MVP limitations
- The server owns game positions; clients never submit a trusted board state.
- Game rooms are in-memory and are lost on restart.
- Authentication, reconnect/resume, matchmaking, persistence, analysis rate limiting and multi-instance coordination remain future work.
- Deployments must provide a trusted Stockfish executable; do not accept a client-supplied engine path.

## Player accounts

Player accounts use **independent PostgreSQL on Render**. There is no Supabase, Firebase or external identity provider. The API owns registration, password verification, sessions and profile rules.

### Database setup

1. Create a PostgreSQL database in Render.
2. Copy its **internal** connection URL into the API service environment as `DATABASE_URL` (use the external URL only when connecting from outside Render).
3. Set `DATABASE_SSL=true` for Render PostgreSQL. For a local non-TLS PostgreSQL instance, set it to `false`.
4. Apply the initial schema once:
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/server/migrations/001_player_accounts.sql
   ```
5. Deploy the API. Account endpoints are enabled only when `DATABASE_URL` is configured.

### Account API

- `POST /api/accounts/register` — email, username, displayName, password; creates an account and signs it in.
- `POST /api/accounts/login` — verifies credentials and issues a session.
- `POST /api/accounts/logout` — revokes the current session.
- `GET /api/accounts/me` — returns the authenticated player profile.
- `PATCH /api/accounts/me` — updates displayName and avatarUrl.
- `DELETE /api/accounts/me` — deletes the account after password confirmation.

Passwords are hashed with Argon2id. Random session tokens are stored only as SHA-256 hashes in PostgreSQL and delivered in HttpOnly, SameSite=Lax cookies. Sessions expire after 30 days; expired sessions are cleaned at server startup. Use HTTPS in production. Email verification, password reset/email delivery, login throttling, CSRF/origin hardening and account UI are not implemented yet and should be completed before public launch.
