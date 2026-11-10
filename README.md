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

## Multiplayer Socket.IO events

The server currently supports invite-code game rooms (the game ID is a UUID).
A client connects to `http://localhost:3001` and uses these typed events from
`@king-chess/shared`:

| Direction | Event | Payload / result |
|---|---|---|
| Client → server | `game:create` | `{ username }`; creator receives `game:created` |
| Client → server | `game:join` | `{ gameId, username }`; joiner receives `game:joined` |
| Client → server | `game:move` | `{ gameId, from, to, promotion? }` |
| Client → server | `game:leave` | No payload; ends the room |
| Server → clients | `game:state` | Authoritative FEN, board, turn, status, players and move history |
| Server → client | `game:error` | `{ code, message }` for rejected requests |
| Server → opponent | `game:ended` | Sent when the other player leaves or disconnects |

The first player is White and the second player is Black. The server rejects
moves from non-members, out-of-turn moves, malformed squares, invalid
promotions and moves rejected by `chess.js`. Clients should render the
broadcast `game:state`; they must not treat their local board as authoritative.

**Current MVP limitations:** game rooms live in server memory and are lost on
server restart. A disconnected player ends the room; reconnect/resume,
authentication, matchmaking, persistence and multi-instance coordination are
not implemented yet.
