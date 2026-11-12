# King Chess

King Chess is a browser-based chess application with three play modes, Stockfish analysis, and real-time invite-code multiplayer.

## Features

- **AI game:** Play Stockfish as White or Black. The current presets select search depth (Easy 5, Club 10, Strong 15, Expert 20, Maximum 22); they do not yet represent calibrated Elo ratings.
- **Online multiplayer:** Create an invite room and share its code. The first player is White and the second is Black. The server validates every move and broadcasts authoritative game state.
- **Local multiplayer:** Two players share one browser/device.
- **Analysis:** Optional in every mode. Request a Stockfish analysis with up to three candidate lines, evaluations, principal variation, nodes and engine time. Candidate lines can be previewed without changing the actual game.
- **Evaluation bar:** Toggle the board-side evaluation display. It reflects the most recently completed manual analysis; it is not continuously refreshed after every move.
- **Game actions:** Undo in supported non-online games, draw actions, resignation, board flip, move history and game status.

## Technology

| Area | Technology |
|---|---|
| Web client | React 19, Vite 6, TypeScript |
| API and realtime | Node.js 22, Fastify 5, Socket.IO 4 |
| Chess rules | chess.js |
| Analysis | Stockfish executable over UCI |
| Shared contracts | TypeScript workspace package |
| Package manager | pnpm 10 workspaces |
| Hosting configuration | Render Blueprint |

The web app is client-side rendered (CSR). The backend is authoritative for online game state. Player accounts are intentionally disabled; the current application does not require PostgreSQL or Supabase.

## Repository layout

```text
apps/
  web/
    src/
      App.tsx                 Main game workspace and UI state
      hooks/                  Realtime client hooks
      lib/                    API URL helpers
  server/
    src/
      domain/chess/            Chess position and domain rules
      application/games/       Multiplayer room orchestration
      analysis/                Analysis use case and engine port
      infrastructure/engine/   Stockfish UCI process adapter
      transport/http/           Fastify HTTP routes
      transport/socket/         Socket.IO event registration
    test/                      Node test-runner tests
    migrations/                 Dormant account migration
packages/
  shared/src/                  HTTP and Socket.IO TypeScript contracts
docs/                           Architecture, review and handover notes
```

The intended dependency direction is transport → application/domain. The chess domain does not depend on Fastify or Socket.IO. Analysis depends on a `ChessEngine` port, with Stockfish implemented as an infrastructure adapter.

## Requirements

- Node.js 22.x
- pnpm 10.x (Corepack can provide pnpm)

## Local development

```bash
corepack enable
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm dev
```

- Web client: http://localhost:5173
- API and Socket.IO: http://localhost:3001
- Vite proxies `/api` and Socket.IO traffic to the local API.

Useful commands from the repository root:

```bash
pnpm dev
pnpm typecheck
pnpm build
pnpm test
pnpm --filter @king-chess/server test
```

## Configuration

Server environment variables (see `apps/server/.env.example`):

| Variable | Purpose | Default |
|---|---|---|
| `HOST` | HTTP bind address | `0.0.0.0` |
| `PORT` | HTTP port | `3001` |
| `WEB_ORIGIN` | Comma-separated allowed browser origins for CORS | `http://localhost:5173` |
| `STOCKFISH_PATH` | Stockfish executable path | `stockfish` on PATH |

The frontend reads `VITE_API_URL` at build time. Leave it unset for same-origin/local Vite proxy use; set it to the public API origin for a separately hosted frontend.

## HTTP API

### `GET /api/health`

Returns API process status and configuration hints. **This is a liveness/configuration response, not a proof that Stockfish can start or complete a search.**

### `POST /api/analysis`

Request:

```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "depth": 15
}
```

- `fen` is required and must describe a valid, non-terminal chess position.
- `depth` is optional; defaults to 15 and must be an integer from 1 through 22.
- Response includes the normalized FEN, best move, score, completed depth, nodes, elapsed engine time, principal variation and candidate lines.
- Scores are expressed from the **side-to-move perspective**.
- Invalid input returns HTTP 400, a full analysis queue returns HTTP 429, and engine failures return HTTP 503.

The current server uses one shared Stockfish process, with one active search and up to two queued requests. Further requests receive HTTP 429 rather than creating unbounded work. Client disconnects and stale browser analysis requests cancel queued work or send UCI `stop` to the active search. Searches have a 60-second limit; an engine that does not stop is discarded and restarted lazily. Searches request three candidate lines. See [Architecture and review](docs/architecture-and-review.md) for operational constraints.

### Player accounts

All `/api/accounts` routes return HTTP 503 while accounts are paused. No database connection or `DATABASE_URL` is required. The retained account implementation and SQL migration are not active application functionality.

## Multiplayer protocol

The first player creates a room and receives an invite code; the second player joins as Black. The browser sends commands such as `game:create`, `game:join`, `game:move`, `game:draw-offer`, `game:draw-response`, `game:resign` and `game:leave`. The server validates membership, turn ownership, payloads and move legality before broadcasting a snapshot.

Room state is held in memory. A server restart or player disconnect ends the room; reconnect/resume and persistent game records are not implemented. See [Architecture and review](docs/architecture-and-review.md).

## Deployment

The Render Blueprint is `render.yaml`; service configuration and smoke-test instructions are in [DEPLOYMENT.md](DEPLOYMENT.md). Automatic deploys are disabled. Do not merge an open draft pull request or trigger a production deployment as part of routine documentation work.

## Further documentation

- [Deployment guide](DEPLOYMENT.md)
- [Architecture, code review and known limitations](docs/architecture-and-review.md)
- [Operations, pause state and future work](docs/operations-and-roadmap.md)
