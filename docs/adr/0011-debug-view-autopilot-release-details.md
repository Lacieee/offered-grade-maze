# ADR-0011: Debug view, autopilot and release details

- **Status:** accepted
- **Date:** 2026-10-14
- **Checkpoint / task:** CP10 (A1–A4, B1–B5)

## Context

CP10 adds the debug view and an autopilot that plays through the normal controls, then
hardens and packages release 1.0.0. Several points are left open by the checkpoint, and a
few would not work as literally written in the test environment (software WebGL at 1–2
frames per second) or on the reference machine.

## Decision

### 1. The autopilot drives the input once per simulation step

A3 asks the autopilot to drive "the normal input system (synthetic key states and yaw
changes, max 180°/s)". The engine accepts an input driver (`Engine.setDriver`) that is
called before every fixed simulation step. It holds keys through `InputState.drive` and
turns through `InputState.turn`; the step then runs exactly as for a player (movement,
collision, door crossing, goal pickup, streaming, server validation).

- Steering happens in game time, so it behaves the same at 1 FPS (SwiftShader) and at
  120 FPS. The 180°/s limit is per simulated second.
- Synthetic keys count without Pointer Lock, so the autopilot also walks while the debug
  view is open or the mouse is released (live demonstrations).
- Installing a driver leaves the test hook's manual stepping: driving needs real time.
- "Stuck" means no progress for 5 s of game time. Waiting in front of a doorway whose room
  has not streamed in yet is not counted (up to 30 s).

### 2. Route planning: one cell of margin where possible

A* runs over a 0.25 m grid with furniture inflated by one cell, as A3 specifies. In small
rooms (a 4 × 3.5 m bathroom with a large globe, Hard seed `H1-7K2Q-X9MP`, room r15) that
margin leaves no route between two doors. The planner then retries with 0.1 m and 0.02 m.
Walls and door jambs always block at the player's radius.

### 3. The autopilot reads the debug view's path

The path comes from `GET /games/:id/debug` (`pathFromCurrent`), so a game played by the
autopilot is marked `debug_used` (PD8), like a player who opened the view. After each
crossing the path is read again; until the answer arrives, the autopilot continues on the
same breadth-first search over the debug graph that the server uses (`shortestPath`).

### 4. The test API

- `getState()` adds `status` (the game phase: `playing`, `completing`, `result`, …),
  `elapsedMs` and `seed` to the player state.
- The autopilot API adds `lastStop()` (why the last walk ended) and `tour(seconds, seed)`
  (plays one seed again and again; used by the performance walk). Release builds with
  `?autopilot=1` expose exactly `{ autopilot }`; without it, `window.__ogm` is undefined.

### 5. Debug view details

- Reciprocal pairs are one line with two arrowheads, labelled `d1↔d2` on hover; one-way
  links `d1→d2`, dashed.
- The path text puts `[exit→arrival]` after each room between the start and the goal:
  `START (Living room r03) → Kitchen r07 [d1→d2] → … → GOAL (Bathroom r09)`. When the
  player stands in the goal room it reads `START = GOAL (…)`.
- The asymmetric share is shown in per cent (the generator reports per mille).
- The view refetches after each accepted crossing; it closes itself at the pickup.

### 6. "No shader compiles after the first visit to each room"

Rooms are prewarmed (`renderer.compile`) when they are built, often in the background while
the player is elsewhere. Counting every new shader program would therefore count prewarming.
The engine counts programs created while _rendering_ (`EngineInfo.renderCompiles`): those
are the hitches. The performance log tolerates them on a room's first visit and reports any
other as a late compile. In the walks so far there were none at all.

### 7. Performance walk and long tests

- `pnpm perf:walk` drives a real Chrome (or Edge) with Playwright through the 3-minute Hard
  walk, in Auto quality and in Low quality at full screen. Playwright cannot drive Safari
  (WebKit is not Safari), so Safari and Firefox use the manual procedure in
  `docs/release/browser-checklist.md` (`tour(180)` and **Copy log**).
- The 100-run latency test (B2) takes about 1.5 hours in SwiftShader. It is opt-in
  (`E2E_LONG=1`) rather than part of every CI run; it was run for the release candidate.
- The e2e CI job's time limit is raised to 90 minutes for the nine playthroughs.

### 8. UI baselines without the 3D view

The baselines of the UI screens (B2) hide the canvas and mask the clocks, so they compare
only the UI. The 3D view has its own baselines (portals, crossing, the goal through a
doorway).

### 9. A body limit on every route

The security review (B4) found `POST /games` accepting large bodies (Fastify's 1 MiB
default). Every route now has a 16 kB limit; `/client-errors` keeps its 8 kB.

### 10. Release candidate tag

The checkpoint tags `v1.0.0` after the product owner approves gate G4. Until then the branch
is tagged `v1.0.0-rc.1` and the Docker image is built as `offered-grade-maze:1.0.0`.

## Consequences

- Autopilot results depend on the debug endpoint: with `DEBUG_VIEW_ENABLED=false` the
  autopilot reports `stuck` ("could not read the path").
- The perf numbers that decide B1 can only be measured on the reference machine; the cloud
  runs check that the scripts work, not the targets.
