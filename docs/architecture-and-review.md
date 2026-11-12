# Architecture and code review

This document describes the implementation on `refactor/analysis-engine-modularity`. It is a code-level guide, not a claim that every production scenario has been load-tested.

## System overview

```text
Browser (React + Vite, CSR)
  ├── HTTP POST /api/analysis ──> Fastify
  │                                └── AnalysisService
  │                                     └── ChessEngine port
  │                                          └── UciStockfishEngine
  │                                               └── Stockfish process (UCI)
  │
  └── Socket.IO commands ───────> GameRoomService
                                   └── ChessGame
                                        └── chess.js position/rules
                                     └── authoritative room snapshots
```

The browser owns presentation and local/AI game interaction. For online games, the server owns the canonical position and validates submitted moves. Shared TypeScript interfaces in `packages/shared` describe the HTTP and Socket.IO payloads.

## Module boundaries

| Module | Responsibility |
|---|---|
| `apps/web/src/App.tsx` | Main game workspace, mode selection, board rendering, analysis UI and game controls. |
| `apps/web/src/hooks/useMultiplayerGame.ts` | Socket.IO client lifecycle, event listeners and multiplayer commands. |
| `apps/web/src/lib/api.ts` | Resolves the configured API base URL. |
| `apps/server/src/domain/chess/ChessGame.ts` | Canonical chess position, legal moves, FEN/PGN and game status. |
| `apps/server/src/application/games/GameRoomService.ts` | Room creation/joining, player seats, commands, draw/resign and snapshot broadcasting. |
| `apps/server/src/analysis/AnalysisService.ts` | Validates FEN/depth and coordinates analysis use cases. |
| `apps/server/src/application/analysis/AnalysisQueue.ts` | Serializes access to the single Stockfish process and bounds pending requests. |
| `apps/server/src/analysis/engine/EnginePort.ts` | Engine abstraction consumed by the analysis service. |
| `apps/server/src/infrastructure/engine/UciStockfishEngine.ts` | Starts and controls the Stockfish child process using UCI. |
| `apps/server/src/transport/http` | Fastify HTTP route adapters. |
| `apps/server/src/transport/socket` | Socket.IO event registration. |
| `packages/shared/src/index.ts` | Shared request, response and event contracts. |

The intended dependency direction is transport → application/domain. The chess domain does not depend on Fastify or Socket.IO. The analysis service depends on an engine interface; Stockfish is an infrastructure adapter.

The legacy `apps/server/src/game` modules are compatibility re-exports; new code should use the domain/application paths.

## Game modes and rules

### AI

The client maintains the interactive game position and requests an AI move from the server-side Stockfish engine. The player can select White or Black; when the player chooses Black, the AI makes the opening move. Current presets select search depth only: Easy 5, Club 10, Strong 15, Expert 20 and Maximum 22. They are not calibrated Elo tiers and do not currently use Stockfish's UCI Elo limiter.

### Local

Two people play on the same browser/device. Moves are handled locally using chess.js.

### Online

- The first player creates a room and is assigned White.
- The second player joins the invite UUID and is assigned Black.
- The server checks room membership, seat, turn, payload shape, square format, promotion choice and move legality.
- The server broadcasts a snapshot containing FEN, board, turn, PGN, move history, status and game result.
- Online draw offers require an opponent response; an accepted offer ends the game as a draw.
- Resignation records which colour resigned.
- Leaving or disconnecting ends the room. Reconnection/resume is not implemented.

For local and AI games, the draw control ends the game immediately as a draw; it is not a negotiated draw offer.

## Analysis flow

1. The frontend sends the current FEN and selected depth to `POST /api/analysis`.
2. `AnalysisService` validates the request, parses the FEN with chess.js, rejects terminal positions and normalizes the FEN.
3. The service calls the `ChessEngine` port.
4. `UciStockfishEngine` lazily starts the configured executable, performs UCI initialization, sets MultiPV to three and searches to the requested depth.
5. The adapter returns best move, score, completed depth, nodes, engine time, principal variation and candidate lines.

Important details:

- Allowed depth is 1–22; default is 15.
- Candidate count is currently fixed to three by `AnalysisService`.
- Scores are from the side-to-move perspective, not always White's perspective.
- One shared engine process supports one active search and up to two queued requests. Requests beyond the bounded queue receive HTTP 429.
- Searches wait up to 60 seconds for `bestmove`. On timeout the adapter sends `stop` and waits up to five seconds; if the process does not recover, it is discarded and restarted lazily for the next request.
- Client disconnects cancel queued requests or send UCI `stop` to the active search. Server shutdown also cancels active work, sends `quit`, and force-kills the process if it does not exit within 1.5 seconds.
- The evaluation bar reflects the last manual analysis response. It is not live analysis and can be stale/empty after the board changes.

## HTTP and realtime contracts

### HTTP

- `GET /api/health`: API liveness/configuration response. It does not verify that Stockfish can start.
- `POST /api/analysis`: FEN/depth analysis. Invalid requests return HTTP 400, a full bounded queue returns HTTP 429, and engine failures return HTTP 503.
- `/api/accounts` and `/api/accounts/*`: deliberately return HTTP 503 while player accounts are paused.

### Socket.IO client-to-server events

| Event | Payload / intent |
|---|---|
| `game:create` | `{ username }` creates a room; creator is White. |
| `game:join` | `{ gameId, username }` joins as Black. |
| `game:move` | `{ gameId, from, to, promotion? }` requests a legal move. |
| `game:draw-offer` | Offers a draw to the opponent. |
| `game:draw-response` | `{ accept }` accepts or declines the pending offer. |
| `game:resign` | Resigns the caller's game. |
| `game:leave` | Leaves the current room. |

### Socket.IO server-to-client events

| Event | Meaning |
|---|---|
| `game:created` | Creator receives the initial room snapshot. |
| `game:joined` | Joining player receives the room snapshot. |
| `game:state` | Players receive an updated authoritative snapshot. |
| `game:error` | Command rejected; includes a code and message. |
| `game:ended` | Room ended because a player left or disconnected. |

The exact TypeScript payload definitions are in `packages/shared/src/index.ts`.

## Configuration and runtime dependencies

- Node.js 22.x and pnpm 10.x.
- `WEB_ORIGIN`: comma-separated CORS allow-list for HTTP and Socket.IO.
- `PORT` and `HOST`: API listener configuration.
- `STOCKFISH_PATH`: executable path; defaults to `stockfish` on PATH.
- Production Docker image installs Stockfish and sets its path to `/usr/games/stockfish`.
- Frontend `VITE_API_URL` is compiled at build time.
- No PostgreSQL connection is active in the current MVP. Account routes are disabled and no `DATABASE_URL` is required.

## Existing safeguards and fixes

1. Socket room joins are awaited; failed joins roll back the reserved seat.
2. Black's seat is reserved synchronously before awaiting Socket.IO room membership, preventing simultaneous joiners from claiming the same seat.
3. Socket payloads receive runtime validation because TypeScript types are erased at runtime.
4. chess.js remains the source of truth for legal moves.
5. Missing Stockfish is surfaced as a controlled analysis-unavailable response rather than a fabricated score.
6. Finished online games reject additional moves and draw actions.

## Known limitations and bottlenecks

These are implementation observations, not measured production performance results.

| Priority | Area | Current limitation | Suggested next step |
|---|---|---|---|
| High | Stockfish concurrency | One process and one active slot; two requests may wait in the bounded queue. | Measure queue wait and engine throughput before considering a worker pool. |
| High | Search lifecycle | Search timeout and stop/restart recovery are implemented, but real-process fault injection and production timing remain unverified. | Exercise timeout/restart paths against the packaged Stockfish binary and collect duration/NPS metrics. |
| Medium | Request cancellation | Browser and HTTP disconnect cancellation now reaches queued work and active UCI searches. | Add browser-level tests for rapid position changes and client disconnect during analysis. |
| High | Public analysis endpoint | Queue capacity is bounded, but there is no authentication, per-IP rate limiting or result cache. | Add per-client limits and a cache keyed by FEN/depth/options before exposing the endpoint broadly. |
| Medium | Multiplayer lifecycle | Rooms live in a process-local Map; disconnect ends a game; restarts clear all rooms. | Add reconnect grace/resume and persistence only when product requirements justify it. |
| Medium | Socket connection | The multiplayer hook opens a Socket.IO connection on app mount, including AI/local sessions. | Connect lazily when Online mode is entered. |
| Medium | Health/readiness | Health endpoint reports API liveness and config only; it does not perform an engine readiness check. | Separate liveness from readiness and expose safe engine diagnostics. |
| Medium | UI maintainability | `App.tsx` contains the board, game controls, modes and analysis UI in one large component. | Extract board, analysis panel, move list and game controls into components/hooks without changing behavior. |
| Low | Snapshot traffic | Full FEN/PGN/history/board snapshots are sent on every move. | Profile payload sizes first; consider compact move events plus periodic snapshots. |
| Low | Evaluation bar | It shows the last manual analysis, not a live evaluation. | Add explicit auto-analysis policy only after client/server compute strategy is decided. |

Do not assume the server CPU is the sole analysis bottleneck without collecting Render CPU, memory, Stockfish NPS, search duration, achieved depth and concurrency measurements.

## Tests and verification

The server uses Node's test runner through `tsx --test`. Existing tests cover chess domain behavior, room service commands, analysis validation and UCI info parsing.

Useful commands:

```bash
pnpm typecheck
pnpm build
pnpm test
```

A passing unit suite does not replace:
- A real Stockfish executable lifecycle test.
- Two-browser Socket.IO integration tests.
- Browser/UI regression tests.
- Concurrent analysis and timeout/recovery tests.
- Render smoke tests after an explicitly approved deployment.

## Future architecture decisions

- Keep the server authoritative for online chess moves.
- Consider Stockfish WASM in a Web Worker for local client-side analysis to move compute off the API; benchmark device performance and battery/thermal impact before switching.
- Keep analysis and opponent difficulty independent. A future opponent Elo limiter should be calibrated with automated games rather than assigning assumed Elo labels to depth values.
- Add accounts only as a separate milestone with dedicated PostgreSQL, migrations, authentication hardening and tests.
- Do not introduce Redis, PostgreSQL or multiple API instances until persistence/reconnect/scaling requirements are approved.
