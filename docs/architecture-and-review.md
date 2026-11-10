# Architecture and code review

## Target module boundaries

- **domain/chess** owns the chess.js-backed position and piece views. It has no transport or persistence dependencies.
- **application/games** coordinates room membership and game commands.
- **analysis** defines the engine port and validates analysis use cases.
- **infrastructure/engine** adapts a Stockfish executable to UCI.
- **transport/http** and **transport/socket** translate network input/output and delegate to application services.
- **packages/shared** contains wire contracts only.

The old `game/ChessBoard.ts`, `game/GameRoomService.ts` and `game/pieces` paths remain as deprecated re-exports to avoid breaking imports while callers migrate.

## Bugs and risks found

1. **Socket room joins were fire-and-forget.** The previous implementation emitted room state without awaiting adapter membership. Room joins are now awaited; failed joins roll back the reserved seat.
2. **Concurrent joins could race.** Previously two clients could both observe an empty Black seat before either completed joining. The new service reserves the seat synchronously before awaiting Socket.IO.
3. **Untrusted payloads need runtime validation.** Socket event types disappear at runtime. The service now checks object shape, username bounds/control characters, UUID shape, squares and promotion values.
4. **Chess rules must have one source of truth.** Piece views continue delegating legal move generation to chess.js; the new `ChessGame` domain module owns the canonical position.
5. **The analysis engine is an external runtime dependency.** Stockfish is not bundled. Deployments without the executable receive a controlled 503 instead of silently returning a fake evaluation.
6. **Searches are serialized.** The first version intentionally supports one Stockfish search at a time. Add a queue, cancellation and per-user rate limits before exposing analysis to a large public audience.
7. **Game state is process-local.** Restart loses rooms and multi-instance deployments need shared persistence/coordination. This is documented rather than prematurely adding Redis or a database.

## Follow-up test coverage

The initial node:test suite covers standard-position move counts, make/undo, invalid move/FEN handling, checkmate, UCI score parsing and analysis request validation. Add integration tests with real Socket.IO clients and a real Stockfish binary in CI/deployment before treating multiplayer and engine lifecycle as production-ready.
