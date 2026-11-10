# King Chess

A real-time, web-based multiplayer chess application.

## Stack

- Web: React, Vite, TypeScript
- API/realtime: Node.js, Fastify, Socket.IO
- Chess rules: chess.js (server-authoritative validation)
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

## Workspace

```text
apps/
  web/       React + Vite client
  server/    Fastify API + Socket.IO server
packages/
  shared/    Shared TypeScript contracts
```

## Useful commands

```bash
pnpm dev
pnpm build
pnpm typecheck
```

## Development principles

- The server is authoritative: clients request moves; the server validates them.
- Keep chess/game rules out of UI components and transport handlers.
- Keep shared request/event contracts in `packages/shared`.
- Start with one server process; add Redis only when horizontal scaling is needed.
