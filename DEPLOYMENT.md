# Deployment

King Chess is configured as two independent Render services from one monorepo:

- **Web:** React + Vite static site.
- **API/realtime:** Fastify + Socket.IO Docker web service. The Docker image installs the Stockfish executable.

The Blueprint is `render.yaml`. It targets `refactor/analysis-engine-modularity` and explicitly sets automatic deploys to off. A branch push therefore does not, by itself, publish a new version.

## Current service configuration

The configured public origins in the current Blueprint are:

- Web: https://king-chess-web-yrlt.onrender.com
- API: https://king-chess-api-yrlt.onrender.com
- API liveness endpoint: https://king-chess-api-yrlt.onrender.com/api/health

These hostnames are configuration values in the repository; verify the Render Dashboard if a service has been renamed or recreated.

## Render resources

The Blueprint defines:

| Service | Render type | Runtime |
|---|---|---|
| `king-chess-web` | Static site | Vite production build |
| `king-chess-api` | Web service | Docker, Node.js 22 + Stockfish |

Both services are configured for the Singapore region and Free plan in the current Blueprint.

## Environment variables

### API service

| Variable | Value / purpose |
|---|---|
| `WEB_ORIGIN` | Frontend origin allowed by Fastify and Socket.IO CORS. Comma-separated origins are supported. |
| `PORT` | Supplied by Render; Docker image defaults to 10000. |
| `STOCKFISH_PATH` | Docker image sets `/usr/games/stockfish`. |

### Static site

| Variable | Value / purpose |
|---|---|
| `VITE_API_URL` | Public API origin, compiled into the frontend at build time. |
| `SKIP_INSTALL_DEPS` | Render configuration workaround used with the explicit pnpm build command. |

If Render assigns new hostnames, update `WEB_ORIGIN` and `VITE_API_URL` in `render.yaml`, then manually deploy the affected services.

## Deploying deliberately

1. Review the exact branch and commit intended for deployment.
2. In Render, select the existing Blueprint/services for King Chess only.
3. Check the service branch, build command, environment variables and deploy settings before triggering a deploy.
4. Deploy the API and wait for its health endpoint to respond.
5. Deploy the static frontend after confirming its `VITE_API_URL` points to the intended API.
6. Run the smoke tests below.

Do not change unrelated Render resources. Player accounts are paused; do not provision a database or add `DATABASE_URL` as part of the current MVP deployment.

## Local development

Run `pnpm dev` from the repository root. Vite serves the web client at http://localhost:5173 and proxies API plus Socket.IO traffic to http://localhost:3001.

For a separately hosted frontend, set `VITE_API_URL` to the API origin before building the static site.

## Smoke-test checklist

Use two separate browsers or devices for online multiplayer.

1. Open the frontend and confirm the page loads without console/runtime errors.
2. Start an AI game as White; make a legal move and confirm the AI replies.
3. Start an AI game as Black; confirm the AI makes the opening move.
4. Start a local game; play moves for both sides and check move history, undo and board flip.
5. Toggle analysis on and off in each game mode.
6. Request a shallow analysis first; verify evaluation, best move, candidate lines and variation preview.
7. Toggle the evaluation bar. Remember that the current bar displays the latest manual analysis and is not automatically refreshed after each move.
8. In online play, create a room in browser A and join it from browser B using the invite code.
9. Play moves from both sides and verify both clients receive the same position and move history.
10. Test online draw offer, decline and acceptance; test resignation.
11. Confirm a disconnect ends the room as currently designed.
12. Confirm `/api/accounts` remains disabled and does not prevent chess gameplay.

## Operational limitations

- Render Free services may spin down after inactivity; the first HTTP request or Socket.IO connection after idle can be slow.
- Deep Stockfish searches can be slow on small shared compute. The API uses one Stockfish process, one active search slot and a bounded queue of two waiting requests. Requests beyond that capacity receive HTTP 429. Searches have a 60-second timeout; disconnected clients cancel queued work or stop active UCI searches. This is not a substitute for per-client/IP rate limiting.
- `GET /api/health` reports API liveness/configuration; it does not launch Stockfish or guarantee analysis readiness.
- Multiplayer rooms are process-local. A restart clears active rooms; disconnect ends a room. Use one API instance until shared room coordination is implemented.
- No automatic deploys are configured. Keep the draft PR unmerged until the owner has completed the desired testing and explicitly approves integration.
