# Sketch Party

Real-time, mobile-first drawing-and-guessing party game. 2 to 10 players join a room by
code, one draws a secret word while everyone guesses in real time, and points scale with
how fast you guess. No login, no database: rooms live in server memory.

Built to demonstrate real-time systems, a server-authoritative game loop over WebSockets,
a custom typed protocol, React performance, and accessibility around an inherently visual
surface.

## Status

Phase 2 (WebSocket transport) complete: FastAPI app, typed protocol, room/connection
managers, game hub, server-authoritative turn timer, and end-to-end WebSocket
integration tests. See `docs/superpowers/plans/` for the build plan.

## Local run (backend core)

```bash
cd api
uv sync
uv run pytest -v
```

## Run the server

```bash
cd api
uv sync
uv run uvicorn sketch_party.app:create_app --factory --reload
```

## Architecture

Backend: FastAPI WebSockets + an in-memory, server-authoritative room manager (Phase 2).
Frontend: Vite + React 19 + TypeScript + Tailwind (Phase 3+). Single instance by design;
scaling out would use Redis pub/sub (documented as future work). The server is
authoritative for the secret word, the turn timer, and scoring; clients never send
elapsed time or scores, only guesses and intents.
