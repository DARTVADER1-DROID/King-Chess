# King Chess

A real-time, web-based multiplayer chess application.

## Stack
- Web: React, Vite, TypeScript
- API/realtime: Node.js, Fastify, Socket.IO
- Rules and position validation: chess.js
- Analysis: Stockfish through the UCI protocol (optional local executable)
- Accounts: planned; implementation retained but routes intentionally disabled for the current MVP
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
The first player is White and the second player is Black. The web client connects to Socket.IO automatically. Enter a display name, create a room, and share its invite code; the second player joins with that code. The UI listens for `game:created`, `game:joined`, `game:state`, `game:error` and `game:ended`. Moves are submitted as `game:move`; the browser does not commit multiplayer moves locally. The server checks room membership, turn ownership, input shape and chess legality before broadcasting an authoritative snapshot. A disconnect currently ends the room. Local play remains available without joining a room.

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

## Player accounts (paused)

The account backend and initial PostgreSQL migration are retained in the repository for a future milestone, but **account routes are disabled in the current MVP**. Requests to `/api/accounts` return HTTP 503. The server does not connect to PostgreSQL, create account tables, or require `DATABASE_URL`. No account database or deployment configuration is needed to run multiplayer chess.

Before enabling accounts in a future release, provision a dedicated database, apply the migration, and complete the remaining security work (email verification, password reset, login throttling, CSRF/origin protection and end-to-end database tests).


## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the two-service Render Blueprint, environment variables and two-browser multiplayer smoke test. The Blueprint is defined in `render.yaml`; automatic deploys are disabled and it targets the current development branch.
