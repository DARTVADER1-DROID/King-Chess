# Deployment

King Chess is deployed as two independent Render services from the same monorepo:

- **Web:** React + Vite static site (`king-chess-web`)
- **API/realtime:** Fastify + Socket.IO Node service (`king-chess-api`)

The root `render.yaml` is the Render Blueprint. It targets the `refactor/analysis-engine-modularity` branch and has automatic deploys disabled so changes are not published unexpectedly.

## Deploy with Render

1. Push this branch to GitHub and open the Render Dashboard.
2. Choose **New → Blueprint**, connect `DARTVADER1-DROID/King-Chess`, and select `refactor/analysis-engine-modularity`.
3. Review the two services in `render.yaml` and apply the Blueprint.
4. Wait for the API health check at `/api/health` to pass, then deploy the web service. The configured public origins are:
   - `https://king-chess-api.onrender.com`
   - `https://king-chess-web.onrender.com`
5. Open the web URL in two separate browsers/devices. Create a room in one, join using its invite code in the other, and test moves from both sides.

If Render assigns different public hostnames, update both `VITE_API_URL` on the static site and `WEB_ORIGIN` on the API service to the actual URLs, then redeploy both services. `WEB_ORIGIN` accepts a comma-separated list if more than one frontend origin is required.

## Local development

Run `pnpm dev` from the repository root. Vite proxies both `/api` requests and Socket.IO websocket traffic to `http://localhost:3001`. For a separately hosted frontend, set `VITE_API_URL` to the backend origin at build time.

## Current test scope and limitations

- Render's free Node service may spin down while idle; the first request can take time to wake it.
- Multiplayer rooms are held in server memory. Keep one API instance; restarting it clears rooms. Reconnect/resume and multi-instance coordination are not implemented.
- Stockfish is not bundled. Install it on the API host and set `STOCKFISH_PATH` to its executable to enable analysis. If it is unavailable, the analysis endpoint returns HTTP 503; ordinary chess and multiplayer remain usable.
- Accounts remain disabled. No database or `DATABASE_URL` is required.
- Do not enable automatic deploys or merge the draft PR until the two-player smoke test has passed.