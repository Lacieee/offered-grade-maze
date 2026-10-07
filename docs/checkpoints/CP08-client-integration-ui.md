# Checkpoint 08 — Client integration, streaming and UI shell

**Product:** Offered Grade Maze — Release 1.0
**Track:** A (engine) · **Planned dates:** Mon 2 Nov – Fri 6 Nov 2026
**Depends on:** CP06, CP07 · **Unlocks:** CP09, CP10 · **Human gate:** **G2 Playable slice — Fri 6 Nov**

---

## 1. Goal

Connect the engine to the backend so the full player journey works end to end. A player opens the game, starts a random or seeded house, explores it with rooms streamed ahead (never an empty doorway), reaches the goal and sees a stored result with a copyable seed. The goal object is a placeholder here (final visuals and sound in CP09).

## 2. Standing rules

Same as CP01 section 2 (`AGENTS.md`). Product decisions: **English is the default UI language, Hungarian available (PD3)**; the timer never pauses (PD1); the goal is collected by walking into it (PD2); product name **Offered Grade Maze** (PD7).

## 3. Scope

**In scope:** API client, ordered transition queue, mock API mode, world store with streaming and background room building, game controller (state machine), UI shell screens, i18n (en, hu), HUD timer, completion flow with a placeholder goal, seed copy and share links, error and reconnect handling.

**Out of scope:** final goal visuals and audio (CP09), settings screen (CP09), debug overlay (CP10).

## 4. Requirements

### T1 — API client (`src/engine/net/api.ts`)

1. Typed functions for every endpoint in CP07, using `fetch` with relative URLs (`/api/v1/...`). Parse every response with the `@ogm/shared` Zod schema; a schema failure is reported to `POST /client-errors` and treated as an error.
2. Timeouts: 8 s for create, 5 s for others. In development, Vite proxies `/api` to `http://localhost:8080`.

### T2 — Transition queue (`src/engine/net/transitionQueue.ts`)

1. On the engine's `roomChanged { from, door, to }`, enqueue `{ seq, from, door, clientElapsedMs }` with `seq` incrementing from 1. Rendering never waits for the queue.
2. Send strictly in order, one request in flight. Retry on network errors with exponential backoff (0.5 s, 1 s, 2 s … max 8 s), indefinitely while the game runs.
3. On success, pass returned rooms to the world store. On 409 `desync`, log to `/client-errors`, mark the session `desync`, drop the rejected event and continue. The server flags the game, and the result stays valid but flagged.
4. While any request has been failing for > 3 s, show a small non-blocking "Reconnecting…" badge.
5. `flush(): Promise<void>` resolves when the queue is empty (used before completion).

### T3 — Mock API (`?mock=1`, dev only)

An in-browser implementation of the API over the CP02 fixture house (start r00, goal r05), with artificial latency (`?latency=300` in ms). It allows UI work and e2e tests without the server. It must not import `@ogm/generator`.

### T4 — World store and streaming (`src/engine/world/`)

1. Room cache keyed by `RoomId`: `RoomDTO` plus its built `RoomView`. `RoomDTO`s are immutable; never rebuild a room that is already built.
2. Incoming rooms are queued for **background building**: build at most one room per frame, within a 4 ms budget, scheduled with `requestIdleCallback` where available and a `setTimeout(0)` fallback (Safari). After building, run `renderer.compile(scene, camera)` for the room.
3. **Safety net:** after each `roomChanged`, compute rooms within 3 hops of the current room from cached `DoorDTO` links. Any linked target missing from the cache is fetched with `GET /games/:id/rooms?ids=…`.
4. If the portal renderer needs a room that is not built yet, the portal shows the fallback colour (CP03), never black or empty. Count these events in the perf overlay as `missingPortalTargets`.

### T5 — Game controller (`src/app/game/controller.ts`)

State machine: `title → newGame → loading → ready → playing → completing → result`, plus `error`.

- `loading`: `POST /games`, hand rooms to the world store, wait until the start room and its direct link targets are built and compiled, then `ready`.
- `ready`: shows "Click to start". The click requests Pointer Lock, calls `POST /start`, records `t0 = performance.now()` and enters `playing`.
- `playing`: HUD timer = `performance.now() − t0`, shown as `mm:ss`; it never pauses (PD1).
- **Pickup (placeholder):** in the goal room, a placeholder glowing box at `RoomDTO.goal`. When the player's horizontal distance to it is < 0.9 m (PD2): freeze input, enter `completing`, `await queue.flush()`, then `POST /complete` with `clientElapsedMs = round(performance.now() − t0)`, `debugUsed` from the session. Show the result on success; on network failure keep retrying behind a "Saving result…" message.

### T6 — UI shell (React, `src/app/`)

All text through i18n keys; **English default**; Hungarian (`hu`) available. Language stored in `localStorage` (`ogm.lang`); a language toggle (EN | HU) sits on the title screen (the settings screen in CP09 also includes it). Room labels such as `room.living` and difficulty names are i18n keys too.

| Screen | Content |
| --- | --- |
| Title | "Offered Grade Maze", tagline, **New game**, controls hint ("WASD to move · Mouse to look · Esc to release the mouse"), language toggle. Runs the WebGL2 check; on failure → Unsupported screen. |
| New game | Tab **Random house**: Easy / Medium / Hard with one-line descriptions, **Start**. Tab **Enter seed**: input with live validation via `parseSeed` (shows the decoded difficulty or the error message), **Start**. |
| Loading | "Building the house…", the seed code, a spinner. |
| Ready | "Click to start", seed code. |
| HUD | Timer top centre (`mm:ss`), seed code small bottom-left. Nothing else. |
| Pause overlay | Appears when Pointer Lock is lost: **Resume**, seed with copy button, **Quit to title**, and the note "The timer keeps running." |
| Result | "You got the Offered Grade!", completion time large as `mm:ss.cc`, difficulty, seed with **Copy**, **Play this seed again**, **New game**; a small "debug view used" marker when flagged. |
| Unsupported | "Offered Grade Maze needs a desktop browser with WebGL2 (Chrome, Edge, Firefox or Safari)." |
| Error | Create failure with message and **Retry** / **Back**. |

Hungarian strings to provide (the agent writes the rest consistently): title "Offered Grade Maze" (the product name is not translated), goal "Megajánlott jegy", result headline "Megszerezted a Megajánlott jegyet!", "Új játék", "Véletlen ház", "Seed megadása", "Könnyű / Közepes / Nehéz", "Kattints a kezdéshez", "Az idő tovább fut.", "Újrajátszás ezzel a seeddel".

Style: dark translucent panels over the canvas, one clear sans-serif font with a system fallback stack, keyboard-operable buttons (Tab/Enter), visible focus rings, WCAG AA contrast.

### T7 — Seed sharing

1. Copy buttons use `navigator.clipboard.writeText(canonicalSeed)` with a "Copied" confirmation and a select-text fallback.
2. `/?seed=M1-7K2Q-X9MP` opens New game on the **Enter seed** tab with the seed prefilled and validated.
3. **Play this seed again** starts a new game with the same seed (new game id, same house).

## 5. Acceptance criteria

- [ ] Full spec §21 flow works against `pnpm start:local` (`http://localhost:8080`) on Easy, Medium and Hard in Chrome and Safari on the M1 Max.
- [ ] A stored `results` row exists after completion, with seed, difficulty and time matching the result screen.
- [ ] Streaming: Playwright test with `?latency=300` on the mock API **and** with 300 ms route delay on the real API: 20 scripted runs (using `window.__ogm.setPose` / movement steps) produce `missingPortalTargets = 0`.
- [ ] Network outage test: block `/transitions` for 10 s mid-game; play continues, the reconnect badge appears and disappears, and no transition is lost (server `last_seq` equals the client's).
- [ ] Typed seed reproduces the same house (same start room id, same furniture in the start room) as the original game.
- [ ] English is the default on a fresh profile; switching to HU translates every visible string with no missing keys (a unit test fails on missing keys in either language).
- [ ] The timer keeps running while the pause overlay is shown and while the tab is hidden (PD1).
- [ ] No React re-render happens per frame (the HUD timer updates via a ref or `requestAnimationFrame` without re-rendering the tree).

## 6. Gate G2 — human checklist (product owner, Fri 6 Nov)

- Play two seeds per difficulty in Chrome and Safari on the M1 Max.
- Easy should feel mostly intuitive; Hard should clearly break spatial expectations but stay fair.
- Approve or adjust the difficulty table (CP04 T1). Adjustments are applied by Track B before CP10, with golden seeds regenerated (allowed before v1.0.0).
- No empty doorway, no hitch when entering new rooms, result stored and seed copy works.
