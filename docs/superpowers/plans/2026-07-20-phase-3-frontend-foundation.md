# Sketch Party - Phase 3: Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up the React frontend: the Vite/TS/Tailwind scaffold, a design-token system, a typed WebSocket client + Zustand store mirroring the Phase 2 protocol, and the Home (create/join) and Lobby screens, with a frontend CI job. Game and GameOver are placeholders filled in Phases 4-5.

**Architecture:** A single-page app with no router: a Zustand store holds connection status, local identity, and the server room snapshot; a `<App>` picks the screen from `store.screen` (derived from connection + room phase). A `useGameSocket` hook owns the WebSocket lifecycle and feeds incoming messages through a pure `applyServerMessage` reducer into the store; it exposes typed `send` helpers. The socket factory is injectable so the hook and reducer are unit-testable without a network.

**Tech Stack:** Vite, React 19, TypeScript strict, Tailwind v4 (`@tailwindcss/vite`, `@theme` tokens), Zustand, oxlint, prettier, vitest + @testing-library/react (jsdom). Mirrors the DesertCharge `web/` layout and CI.

**Design direction (follow rules.md: no gradients, no AI tells, solid colors + subtle depth):** A warm "paper and ink" party aesthetic. Near-white paper background, ink near-black text and primary buttons, a single coral accent for the logo and active states, and the existing player palette (the backend's PALETTE) as multiplayer identity colors. Rounded, friendly display type for the logo/headings, a clean sans for UI, a mono for the room code. Mobile-first portrait: everything designed for a ~390px-wide phone, centered with breathing room on wider screens. Motion subtle and `prefers-reduced-motion`-aware.

---

## File structure (Phase 3)

Under `web/`:
- Scaffold: `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `.oxlintrc.json`, `.prettierrc.json`, `.gitignore` (node), `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`, `src/test/setup.ts`.
- `src/config.ts` - backend URLs from `import.meta.env`.
- `src/protocol.ts` - TS types for every client and server message (camelCase), mirroring `api/src/sketch_party/protocol.py`.
- `src/store.ts` - Zustand store + the pure `applyServerMessage(state, msg)` reducer.
- `src/useGameSocket.ts` - the hook (injectable `socketFactory`), returns `{ createRoom, joinRoom, startGame, ... , status }`.
- `src/screens/Home.tsx`, `src/screens/Lobby.tsx`, `src/screens/GamePlaceholder.tsx`.
- `src/ui/Button.tsx`, `src/ui/TextInput.tsx`, `src/ui/Panel.tsx`, `src/ui/PlayerChip.tsx`.
- Tests: `src/store.test.ts`, `src/screens/Home.test.tsx`, `src/screens/Lobby.test.tsx`, `src/useGameSocket.test.ts`.

Modify repo root `.github/workflows/ci.yml` to add a `frontend` job.

---

## Task 1: Scaffold the web app

**Files:** create the `web/` scaffold listed above.

- [ ] **Step 1:** Create the Vite React-TS scaffold under `web/`. Mirror DesertCharge `web/`:
  - `package.json` scripts: `dev`, `build` (`tsc -b && vite build`), `lint` (`oxlint`), `typecheck` (`tsc -b --noEmit`), `test` (`vitest run`), `format` (`prettier --check src`), `preview`.
  - deps: `react@^19`, `react-dom@^19`, `zustand@^5`, `@fontsource/fredoka`, `@fontsource/public-sans`, `@fontsource/ibm-plex-mono`, `qrcode` (used in Phase 6; add now is optional - SKIP for Phase 3).
  - devDeps: `vite@^6`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `tailwindcss@^4`, `typescript`, `oxlint`, `prettier`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `@types/react`, `@types/react-dom`.
  - `vite.config.ts`: react + tailwind plugins, vitest config (jsdom, globals, `setupFiles: './src/test/setup.ts'`, `css: false`) - copy DesertCharge's exactly.
  - `tsconfig.app.json`: copy DesertCharge's strict config (target es2023, strict, noUncheckedIndexedAccess, noUnusedLocals/Parameters, verbatimModuleSyntax, jsx react-jsx).
  - `.oxlintrc.json` and `.prettierrc.json`: copy DesertCharge's.
  - `src/test/setup.ts`: `import '@testing-library/jest-dom'`.
  - `src/vite-env.d.ts`: typed `ImportMetaEnv` with `VITE_API_URL` and `VITE_WS_URL` optional strings.
- [ ] **Step 2:** `src/index.css` with `@import 'tailwindcss';`, the three `@fontsource` imports, and a `@theme` block with these tokens (solid, no gradients):
```css
@theme {
  --color-paper: #f6f3ec;
  --color-surface: #ffffff;
  --color-ink: #1b1e28;
  --color-ink-muted: #565b68;
  --color-line: #e6e0d5;
  --color-accent: #ef5b4c;
  --color-accent-strong: #b23d31;
  --color-p1: #e63946; --color-p2: #f4a261; --color-p3: #2a9d8f;
  --color-p4: #457b9d; --color-p5: #8338ec; --color-p6: #ff6b6b;
  --color-p7: #06d6a0; --color-p8: #118ab2; --color-p9: #ef476f; --color-p10: #ffd166;
  --font-display: 'Fredoka', system-ui, sans-serif;
  --font-sans: 'Public Sans', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
}
```
Add base styles: `body { background: var(--color-paper); color: var(--color-ink); font-family: var(--font-sans); }` and a `@media (prefers-reduced-motion: reduce)` that disables transitions/animations.
- [ ] **Step 3:** `index.html` titled "Sketch Party", `viewport` meta with `viewport-fit=cover`, `#root`. `src/main.tsx` renders `<App/>` in `<StrictMode>` (no react-query needed).
- [ ] **Step 4:** A trivial `src/App.tsx` returning a placeholder, and one smoke test `src/App.test.tsx` asserting it renders "Sketch Party". Run `npm install`, `npm run lint`, `npm run typecheck`, `npm run format`, `npm test`, `npm run build` - all green. (Commit `package-lock.json`.)
- [ ] **Step 5:** commit `chore: scaffold Sketch Party web app`.

---

## Task 2: Protocol types and config

**Files:** create `web/src/protocol.ts`, `web/src/config.ts`, `web/src/protocol.test.ts` (types-only sanity via a couple of runtime helpers).

- [ ] **Step 1:** `config.ts`:
```ts
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000'
export const config = { apiUrl: API_URL, wsUrl: WS_URL }
```
- [ ] **Step 2:** `protocol.ts` mirroring `api/src/sketch_party/protocol.py` exactly (camelCase). Define:
  - `GamePhase = 'lobby' | 'word_select' | 'drawing' | 'turn_end' | 'game_over'`.
  - `PlayerView = { id, name, color, score, connected }`.
  - Client messages (discriminated on `type`): `{type:'join', name, playerId?}`, `{type:'startGame'}`, `{type:'chooseWord', word}`, `{type:'guess', text}`, `{type:'playAgain'}`. Export `ClientMessage` union.
  - Server messages: `RoomStateMsg {type:'roomState', code, phase, players, round, totalRounds, currentDrawerId, youAreDrawer, wordLength, secondsLeft, yourPlayerId}`, `PlayerJoinedMsg {type:'playerJoined', player}`, `PlayerLeftMsg {type:'playerLeft', playerId}`, `WordChoicesMsg {type:'wordChoices', choices}`, `TurnStartedMsg {type:'turnStarted', drawerId, drawerName, round, wordLength, turnSeconds, word?}`, `GuessResultMsg {type:'guessResult', result, points}`, `PlayerGuessedMsg {type:'playerGuessedCorrectly', playerId, name}`, `TimerTickMsg {type:'timerTick', secondsLeft}`, `TurnEndedMsg {type:'turnEnded', word, scores:{playerId,score,gained}[]}`, `GameOverMsg {type:'gameOver', scores:{playerId,name,score}[]}`, `ErrorMsg {type:'error', message}`. Export `ServerMessage` union. Add `export function parseServerMessage(raw: string): ServerMessage | null` that JSON-parses and returns the object typed (return null on parse error).
- [ ] **Step 3:** `protocol.test.ts`: `parseServerMessage('{"type":"error","message":"x"}')` narrows to an error; malformed JSON returns null.
- [ ] **Step 4-5:** green; commit `feat: add wire protocol types and backend config`.

---

## Task 3: Store and reducer

**Files:** create `web/src/store.ts`, `web/src/store.test.ts`.

- [ ] **Step 1: Write failing tests** `store.test.ts` for the pure reducer `applyServerMessage(state, msg)`:
  - `roomState` replaces `room` and sets `me.playerId` from `yourPlayerId`.
  - `playerJoined` appends to `room.players` (no dupes if id already present).
  - `playerLeft` marks that player `connected:false` (keep in list so the lobby/scoreboard still shows them) OR removes if in lobby - DECISION: mark `connected:false` (consistent with the server's away semantics); a follow-up `roomState` will reconcile.
  - `error` sets `state.error`.
  - Messages not relevant yet (`timerTick`, etc.) return state unchanged (no throw).
  - `screen` selector: `deriveScreen(state)` returns `'home'` when `room===null`, `'lobby'` when `phase==='lobby'`, `'game'` for `word_select|drawing|turn_end`, `'gameover'` for `game_over`.
- [ ] **Step 2:** confirm failure. **Step 3:** implement `store.ts`: a Zustand store `{ status, me, room, error }` plus actions `setStatus`, `setError`, `ingest(msg)` (calls `applyServerMessage`), `reset()`. Export the pure `applyServerMessage(state, msg): Partial<State>` and `deriveScreen(state): Screen` so they are unit-tested directly. Keep the reducer total and immutable.
- [ ] **Step 4-5:** green; commit `feat: add game store and message reducer`.

---

## Task 4: useGameSocket hook

**Files:** create `web/src/useGameSocket.ts`, `web/src/useGameSocket.test.ts`.

The hook manages one WebSocket. It accepts an optional `socketFactory: (url: string) => WebSocketLike` (default `(url) => new WebSocket(url)`) so tests inject a `FakeSocket`. Define a minimal `WebSocketLike` interface (`send`, `close`, `onopen/onmessage/onclose/onerror`, `readyState`).

- [ ] **Step 1: Write failing tests** `useGameSocket.test.ts` using a `FakeSocket` and `@testing-library/react` `renderHook`:
  - `createRoom(name)`: POSTs to `${apiUrl}/rooms` (mock `fetch` to return `{code:'WXYZ'}`), then opens a socket to `${wsUrl}/ws/WXYZ`, and on open sends a `join` message with the name. Assert the fake socket received the join JSON.
  - `joinRoom(code, name)`: opens the socket and sends join (no POST).
  - an incoming `roomState` message drives the store (`store.room` populated).
  - `startGame()/guess()/chooseWord()/playAgain()` send the correct JSON when the socket is open, and are no-ops (no throw) when not open.
  - `onclose` sets status to `'closed'`.
- [ ] **Step 2:** confirm failure. **Step 3:** implement the hook. On mount it does nothing; `createRoom`/`joinRoom` establish the socket. `onmessage` runs `parseServerMessage` then `store.ingest`. Persist `playerId` and `name` to `sessionStorage` on a successful `roomState` (used by Phase 6 reconnect). Clean up the socket on unmount. (Full auto-reconnect is Phase 6; here just set status transitions.)
- [ ] **Step 4-5:** green; commit `feat: add websocket hook`.

---

## Task 5: Home and Lobby screens + UI kit

**Files:** create `web/src/ui/*.tsx`, `web/src/screens/Home.tsx`, `web/src/screens/Lobby.tsx`, `web/src/screens/GamePlaceholder.tsx`, tests for Home and Lobby; wire `src/App.tsx` to switch screens.

Follow the design direction. Build a small UI kit first (`Button` with `variant: 'primary' | 'secondary' | 'ghost'`, `TextInput` with a label and `aria` wiring, `Panel` a white rounded card with a hairline border and soft shadow, `PlayerChip` showing a color dot + name + optional host/drawer badge). Solid colors only; depth via border + shadow + spacing, never gradients. All interactive elements keyboard-focusable with a visible focus ring.

- **Home** (`screen==='home'`): the Sketch Party logo/wordmark (display font, coral accent), a one-line tagline, a nickname `TextInput` (required, max 20 chars), a primary "Create room" button, and a "Join with a code" affordance (code input, 4 letters, auto-uppercased, + "Join" button). Disable actions until a nickname is entered. On submit call `createRoom`/`joinRoom`. Show a friendly inline error if `store.error` is set (e.g. room not found / full).
- **Lobby** (`phase==='lobby'`): a big room `code` in mono with a "Copy" button (uses `navigator.clipboard`, with a copied confirmation), the player list as `PlayerChip`s (host = `players[0]` gets a small crown/"Host" label), a live count "N of 10 players", and either a primary "Start game" button (host only, disabled with fewer than 2 players and labelled why) or a "Waiting for the host to start" note for non-hosts. An `aria-live="polite"` region announces players joining/leaving.
- **GamePlaceholder** (`screen==='game'|'gameover'`): a simple "Game starting..." panel (Phases 4-5 replace it).
- `App.tsx`: read `deriveScreen(store)` and render the matching screen. Provide the `useGameSocket` instance via context or props so screens can call its actions.

- [ ] **Step 1: Write failing tests.** `Home.test.tsx`: renders the wordmark and tagline; "Create room" is disabled until a nickname is typed; typing a name and clicking calls the injected `createRoom`. `Lobby.test.tsx`: given a store seeded with a room of two players where `yourPlayerId` is the host, the "Start game" button is enabled; with one player it is disabled; a non-host sees the waiting note; the room code renders. Use a test helper to seed the Zustand store and inject socket actions.
- [ ] **Step 2:** confirm failure. **Step 3:** implement the UI kit and screens and wire `App.tsx`. Keep each component focused and under ~150 lines. **Step 4:** `npm run lint && npm run typecheck && npm run format && npm test && npm run build` all green. Manually confirm nothing uses a gradient and there are no em dashes. **Step 5:** commit `feat: add home and lobby screens with the ui kit`.

---

## Task 6: Frontend CI job

**Files:** modify `.github/workflows/ci.yml`.

- [ ] Add a `frontend` job mirroring DesertCharge: `runs-on: ubuntu-latest`, `defaults.run.working-directory: web`, `actions/setup-node@v4` with `node-version: "22"`, `cache: npm`, `cache-dependency-path: web/package-lock.json`; steps `npm ci`, `npm run lint`, `npm run format`, `npm run typecheck`, `npm test`, `npm run build`. Commit `ci: add frontend job`.

---

## Definition of done (Phase 3)
- [ ] `npm run lint && npm run typecheck && npm run format && npm test && npm run build` all green in `web/`.
- [ ] Home creates/joins a room against the real backend (manually verifiable with the server running); Lobby shows players, code, copy, and a host-only start.
- [ ] Store reducer and socket hook are unit-tested with a fake socket; no network in tests.
- [ ] Design follows rules.md: solid colors, no gradients, visible focus rings, mobile portrait, `prefers-reduced-motion` respected. No em dashes.
- [ ] Frontend CI job added and passing. Conventional Commits; ready for the Phase 3 PR.

## Self-review notes
- `applyServerMessage` and `deriveScreen` are pure and directly tested; the store just wraps them.
- The socket factory injection keeps the hook testable without a network; `sessionStorage` of `{playerId, name}` sets up Phase 6 reconnect.
- Screens beyond Home/Lobby are deliberate placeholders; Phases 4-5 fill Game/GameOver.
- The player palette tokens (`--color-p1..p10`) match the backend PALETTE so a player's color is consistent across server and client.
