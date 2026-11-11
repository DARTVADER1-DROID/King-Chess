# Operations and project handover

This is the handover note for pausing active King Chess development. It records what is implemented, what is deliberately disabled, and what should be checked before work resumes.

## Current project state

- Repository: `DARTVADER1-DROID/King-Chess` (private).
- Default branch: `main`.
- The former draft PR #1 was merged into `main` on 2026-11-10.
- Current development work should use a branch created from the latest `main`; inspect open PRs rather than assuming a fixed PR number or branch head.
- Render automatic deploys are disabled in `render.yaml`.
- Code changes and CI do not authorize a production deployment.

Always inspect the latest `main` commit, active branch heads, open PRs and CI before resuming. Do not use an old branch as the source of truth.

## Implemented product surface

- React/Vite client-side rendered chess workspace.
- AI, local same-device and online invite-code game modes.
- AI colour selection, including Stockfish opening when the human chooses Black.
- Stockfish analysis with depth selection, three candidate lines, evaluations and variation preview.
- Analysis enable/disable controls in all game modes.
- Optional evaluation bar (latest manual analysis only).
- Move history, board flip, undo where supported, draw actions and resignation.
- Server-authoritative online moves and room snapshots.
- Online draw offer, accept and decline.

Refer to the root README and architecture guide for behavior and API details.

## Intentionally paused

### Player accounts

Account domain/service/repository code and the initial SQL migration are retained for later work, but account routes are disabled. Requests to `/api/accounts` return HTTP 503. The running server does not connect to PostgreSQL and does not require `DATABASE_URL`.

Do not create a database, enable account routes or reuse another project's database without a separate explicit decision. Before enabling accounts, complete database provisioning, migration execution, email verification, password reset, login throttling, CSRF/origin protection and end-to-end persistence tests.

### Not implemented yet

- Calibrated AI opponent Elo levels. Current AI presets are depth presets only.
- Live/automatic evaluation-bar refresh.
- Client-side Stockfish WASM.
- Analysis queue, cancellation, rate limiting and caching.
- Multiplayer reconnect/resume, matchmaking, persistent games and multi-instance room coordination.
- Player accounts, ratings and profiles.
- Clocks, promotion selection UI and full online game lifecycle polish.
- Full browser-level end-to-end coverage across two independent browser contexts.

## Known technical risks

1. One shared Stockfish process accepts one active search at a time.
2. Depth-22 searches can exceed the current 30-second wait on constrained compute.
3. Search cancellation is not propagated from HTTP clients to UCI.
4. Public analysis has no rate limiter or bounded queue.
5. Socket.IO connects even for local/AI-only use.
6. Health endpoint does not prove Stockfish readiness.
7. Multiplayer rooms are memory-only and end on disconnect/restart.
8. Main React workspace component is large and should be modularized carefully.
9. The evaluation bar is based on the last requested analysis and can become stale after moves.

See [architecture-and-review.md](./architecture-and-review.md) for details and suggested remedies.

## Suggested restart sequence

1. Read this file, [README.md](../README.md), [DEPLOYMENT.md](../DEPLOYMENT.md) and [architecture-and-review.md](./architecture-and-review.md).
2. Inspect the latest `main` commit, open PRs, active branch heads and CI status. Do not assume a previous branch or PR number is still current.
3. Check the live Render services and deployment history without changing them.
4. Run `pnpm install`, `pnpm typecheck`, `pnpm build` and `pnpm test` on the latest development branch.
5. Reproduce any reported issue locally before changing code.
6. Prioritize Stockfish lifecycle, cancellation, bounded concurrency and analysis abuse protection. The server now has a real Socket.IO client/server integration test; retain browser-level multiplayer regression coverage as a separate validation step.
7. Deploy only after explicit approval and a reviewed smoke-test plan.

## Documentation maintenance

When implementation changes, update the matching docs in the same pull request:

- User-visible features and commands → root `README.md`.
- Render services, environment variables and smoke tests → `DEPLOYMENT.md`.
- Module boundaries, event contracts and engineering constraints → `docs/architecture-and-review.md`.
- Pause state, deliberate deferrals and restart checklist → this file.

Keep documentation factual. Distinguish verified behavior from proposed work, and do not describe a feature as deployed merely because it exists on a development branch.
