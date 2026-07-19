# Sketch Party

Real-time, mobile-first drawing-and-guessing party game. 2 to 10 players join a room by
code, one draws a secret word while everyone guesses in real time, and points scale with
how fast you guess. No login, no database: rooms live in server memory.

Built to demonstrate real-time systems, a server-authoritative game loop over WebSockets,
a custom typed protocol, React performance, and accessibility around an inherently visual
surface.

## Status

Phase 1 (backend domain core) in progress. See `docs/superpowers/plans/` for the build plan.

## Local run (backend core)

```bash
cd api
uv sync
uv run pytest -v
```

## Architecture

Backend: FastAPI WebSockets + an in-memory, server-authoritative room manager (Phase 2).
Frontend: Vite + React 19 + TypeScript + Tailwind (Phase 3+). Single instance by design;
scaling out would use Redis pub/sub (documented as future work).
