# Deployment

King Chess is configured as two independent Render services from the same monorepo:

- **Web:** React + Vite static site (`king-chess-web`), served from Render's static CDN.
- **API/realtime:** Fastify + Socket.IO Docker web service (`king-chess-api`). The Docker image installs Stockfish so position analysis is available as well as multiplayer.

The root `render.yaml` is the Render Blueprint. It targets the `refactor/analysis-engine-modularity` branch and has automatic deploys disabled so changes are not published unexpectedly.

## Deploy with Render

1. Push this branch to GitHub and open the Render Dashboard.
2. Choose **New → Blueprint**, connect `DARTVADER1-DROID/King-Chess`, and select `refactor/analysis-engine-modularity`.
3. Review the two services in `render.yaml` and apply the Blueprint. Both services use the free tier; the API image is built from `Dockerfile`.
4. Wait for the API health check at `/api/health` to pass, then deploy the web service. The configured public origins are:
   - `https://king-chess-api.onrender.com`
   - `https://king-chess-web.onrender.com`
5. Open the web URL in two separate browsers/devices. Create a room in one, join using its invite code in the other, and test moves from both sides. Also test the analysis controls with a shallow depth first.

If Render assigns different public hostnames, update both `VITE_API_URL` on the static site and `WEB_ORIGIN` on the API service to the actual URLs, then redeploy both services. `WEB_ORIGIN` accepts a comma-separated list if more than one frontend origin is required.

## Local development

Run `pnpm dev` from the repository root. Vite proxies both `/api` requests and Socket.IO websocket traffic to `http://localhost:3001`. For a separately hosted frontend, set `VITE_API_URL` to the backend origin at build time.

## Test notes and limitations

- Render's free Node/Docker web service may spin down after 15 minutes without inbound traffic. The first request or websocket connection after idle can take time to wake it.
- Free compute is intended for testing and hobby projects, not production. Deep Stockfish searches may be slow on the smallest compute plan.
- Multiplayer rooms are held in server memory. Keep one API instance; restarting it clears rooms. Reconnect/resume and multi-instance coordination are not implemented.
- Accounts remain disabled. No database or `DATABASE_URL` is required.
- Do not enable automatic deploys or merge the draft PR until the two-player smoke test has passed.