# Sketch Party — Design Spec

Date: 2026-07-18
Status: Approved (brainstorming complete)

## Summary

A mobile-first, portrait, real-time drawing-and-guessing party game. 2 to 10 players
join a room by a short code, one player draws a secret word on a shared canvas while
everyone else guesses in real time, and points are awarded by how fast each player
guesses. Play rotates so everyone draws. No login and no database: rooms live in server
memory and disappear when empty.

"Pictionary" is a Mattel trademark, so the product is named **Sketch Party** and the repo
folder is `sketch-party` to avoid any trademark question on a public repo.

This project proves: real-time systems, WebSockets, a server-authoritative game loop, a
custom typed protocol, React performance (live stroke sync), and accessibility around an
inherently visual surface.

## Goals

- A lone recruiter can experience a real game from an iframe (no bots required).
- The backend survives a cold start with a visible "waking" state and a keep-warm ping.
- Server owns the word, the timer, and all scoring. Clients cannot cheat on timing or points.
- WCAG 2.2 AA on everything around the canvas; Lighthouse 95+; green CI.

## Non-goals (YAGNI)

No accounts, no database, no persistent leaderboard, no bot players, no free-text chat
beyond guesses, no custom word packs, no multi-instance scaling, no spectator mode.

## Architecture

- **Backend:** FastAPI. One WebSocket endpoint `GET /ws/{roomCode}` plus thin HTTP routes:
  `POST /rooms` (create a room, returns a code), `GET /healthz` (keep-warm). An in-memory
  `RoomManager` holds all rooms. Each `Room` runs a server-authoritative state machine and
  owns the secret word, the turn timer, the stroke buffer, and scoring.
- **Frontend:** Vite + React 19 + strict TypeScript + Tailwind v4. A Zustand store fed by a
  single typed WebSocket client (`useGameSocket`). HTML5 `<canvas>` with Pointer Events.
- **Single instance is a deliberate constraint.** In-memory state means one machine. Scaling
  out would require Redis pub/sub for room state; that is documented as future work, not built.

### Real-time transport decision

Chosen: FastAPI native WebSockets with a custom typed JSON protocol and a
server-authoritative room manager. Rejected: managed realtime (Ably/Pusher/Supabase
Realtime) because it reads as an API wrapper and adds a vendor dependency; Socket.IO
because it hides the primitives this project is meant to demonstrate. Reconnection is
handled deliberately in application code.

## Game flow (state machine)

`LOBBY -> WORD_SELECT -> DRAWING -> TURN_END -> (next turn) ... -> GAME_OVER -> (play again -> LOBBY)`

- **Lobby:** host sees players joining, a share code + QR, and settings: round count (1 to 5,
  default 3) and turn length (default 4 minutes). Host starts when there are at least 2 players.
- **Word select:** the active drawer privately picks 1 of 3 random words from a curated
  built-in word list (tiered easy/medium/hard). Others see "Alex is choosing a word."
- **Drawing:** the drawer has the canvas and tools; guessers see live strokes and a guess box.
  The server runs the turn timer and broadcasts ticks.
- **Turn end:** reveal the word, show points earned this turn, short interstitial, rotate drawer.
- **Game over:** final scoreboard, "play again" resets scores and returns to the lobby.

A **round** is every player drawing once. Drawer rotation is round-robin by join order. A
disconnected ("away") player's draw turn is skipped.

## Scoring (server-computed)

Based on each guesser's own elapsed time at the moment they guess correctly:

- <= 1 min: **10**
- <= 2 min: **9**
- <= 3 min: **8**
- > 3 min up to the 4-min cap: **7**
- wrong or no guess: **0**

Rules:

- Multiple players can each score their own time bucket. A correct guesser is locked in for
  the rest of the turn.
- The turn ends early once **all** non-drawer players have guessed correctly.
- **Drawer's points = the mean of the non-drawer players' points for that turn, rounded to
  the nearest integer**, including 0s from anyone who did not guess. This rewards drawing
  clearly enough that everyone gets it. (Decision locked per user: mean including zeros, not
  mean of correct guessers only.)

Edge cases the scoring engine must cover in tests: nobody guesses (drawer gets 0), everybody
guesses, a single guesser, ties, and a guesser who runs out the clock.

## Real-time protocol

Typed JSON messages. Pydantic models on the server mirrored by hand-written TypeScript types.
A short shared contract doc (`docs/protocol.md`) keeps the two in sync.

- **Client to server:** `join`, `chooseWord`, `stroke` (batched points), `undo`,
  `clearCanvas`, `guess`, `startGame`, `playAgain`.
- **Server to client:** `roomState` (full snapshot on join/reconnect), `playerJoined`,
  `playerLeft`, `turnStarted` (word sent only to the drawer; length and masked blanks to
  guessers), `strokeBroadcast`, `guessResult` (private to the guesser), `playerGuessedCorrectly`
  (public, word hidden), `timerTick`, `turnEnded` (reveal and scores), `gameOver`, `error`.

**Answer matching:** normalize the guess (lowercase, trim, collapse spaces, strip punctuation
and diacritics) and require an exact match to score. A one-character-off guess returns a
private "So close!" hint to that guesser only. Wrong guesses appear in a shared guess feed;
correct guesses are hidden from others and shown as "Alex guessed it!".

## Drawing and canvas

Portrait `<canvas>` sized to the viewport. Tools: a solid-color palette (~10 colors, no
gradients per project rules), 3 brush sizes, eraser, undo (last stroke), and clear. Strokes
are vectors: `{ color, size, points[] }`. Pointer moves are coalesced to about 60fps and
flushed in about 50ms batches to keep bandwidth reasonable. The server retains the current
turn's stroke list so a late joiner or a reconnect replays the canvas. Only the active
drawer's strokes are accepted; the server enforces this.

## Frontend screens and state

Screens: **Home** (create or join by code), **Lobby**, **Game** (role-aware: drawer view vs
guesser view), **GameOver**. The Zustand store holds `connection`, `room`, `me`, `turn`, and
`canvas`. The `useGameSocket` hook owns the socket lifecycle and dispatches typed messages
into the store. Player id and name are persisted in `sessionStorage` for reconnects.

## Reconnection and lifecycle

On a socket drop: auto-reconnect with backoff and re-send `join` with the stored player id.
The server keeps a disconnected player for a ~20s grace period (marked "away") before removing
them, and skips an away player's draw turn. Empty rooms are garbage-collected. If the drawer
leaves mid-turn, the turn ends immediately and rotates.

## Demo, iframe, and cold start (P0)

- A visible "Waking the demo..." state while the WebSocket connects, plus a keep-warm ping to
  `/healthz` so the free instance does not cold-start into a blank screen.
- Lone-visitor path: an **"Open a second player"** button spawns a pre-joined second tab, plus
  a QR and a 4-letter code, so a single visitor can play a real 2-player game across two tabs
  with no bots.
- Hard caps (max rooms, max players per room, max strokes buffered) so a public demo cannot
  exhaust the free instance. HTTP routes are rate-limited (slowapi); WebSocket connections are
  capped per IP.

## Accessibility and performance

- The canvas is inherently visual. Everything around it (lobby, guess input, scoreboard, timer,
  turn changes, "guessed it" events) is keyboard-navigable and announced via `aria-live`. The
  timer is text, not only a ring. Palette buttons are labeled. `prefers-reduced-motion` is
  respected. The README states plainly that the drawing surface itself is not screen-reader
  usable, which is inherent to the medium.
- Targets: Lighthouse 95+, WCAG 2.2 AA (axe-core in CI).
- Perf story for the README: batched/coalesced strokes and an optional dev overlay showing
  round-trip latency and message rate.

## Testing

- **Backend:** unit tests for the scoring engine (every time bucket and drawer-average edge
  case), state machine transitions, word normalization and matching, and turn rotation.
  WebSocket integration tests drive 2 to 3 simulated clients through a full turn.
- **Frontend:** store/reducer unit tests, canvas-tool component tests, and a **Playwright
  two-client e2e** where two browser contexts play a turn and assert a guess scores. That
  two-client test is the flagship proof for a real-time app.

## Deployment, cost, and embedding

- **Frontend:** Vercel Hobby (free, no cold start). **Backend:** Fly.io, a single small
  auto-stop machine (effectively free at demo scale; Fly requires a card on file). The backend
  is a portable Docker container configured only by a `WS_URL`/allowed-origins env, so it can
  move to Render's free tier (no card, but a ~30-60s cold start that the "waking" state hides)
  without a rewrite.
- **Embedding:** the frontend sets `frame-ancestors` to allow the portfolio origin; the backend
  allows the matching WS origin. An "open full screen" link accompanies the iframe because a
  portrait game is tall.
- Docker for the backend, `.env.example`, MIT license.

## CI and repo

- Own GitHub repo under the user's account. Conventional Commits, one PR per phase, merge on
  green CI.
- GitHub Actions mirrors DesertCharge: repo hygiene + backend (ruff, mypy, pytest) + frontend
  (oxlint, tsc, vitest, build, axe). Status badge in the README.
- Design tokens follow `bhande/ui` intent; since that package is not published yet, mirror
  DesertCharge's local-token approach and keep components extraction-ready.

## Open decisions

None outstanding. Product name (`Sketch Party`) and drawer-average rule (mean including zeros)
are locked per user direction ("do what you recommend").
