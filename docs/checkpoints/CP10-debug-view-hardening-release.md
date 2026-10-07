# Checkpoint 10 — Debug view, autopilot, hardening and release

**Product:** Offered Grade Maze — Release 1.0
**Track:** Part A: B (platform), Thu 5 Nov – Thu 12 Nov 2026 · Part B: both tracks, Mon 16 Nov – Fri 20 Nov 2026
**Depends on:** Part A: CP07, CP08 · Part B: CP09 and Part A
**Human gates:** G3 Content complete (Fri 13 Nov, with CP09) · **G4 Release candidate (Thu 19 Nov)** · **Release v1.0.0 Fri 20 Nov**

---

## 1. Goal

Part A delivers the admin/debug view, which shows the house's real graph and a guaranteed solution path. It also adds an autopilot that plays the game through the normal controls and proves solvability end to end. Part B hardens the product against every release target and packages version 1.0.0 to run locally (PD4).

## 2. Standing rules

Same as CP01 section 2 (`AGENTS.md`). Product decisions: the debug view is enabled in release builds (PD6); opening it flags the result `debugUsed` but never pauses the timer (PD1, PD8); English default with Hungarian (PD3); reference machine MacBook Pro M1 Max (PD5).

---

## Part A — Debug view and autopilot

### A1 — Toggle

1. Keys: `event.code` `Backquote`, `IntlBackslash` or `F9`. On Apple ISO keyboards the key under Esc reports `IntlBackslash`, on ANSI keyboards `Backquote`; F9 may need the fn key on a Mac. None of these is used by normal controls.
2. Opening: release Pointer Lock, dim the game behind a 30 % backdrop (the game keeps running; the timer does not pause), set the session's `debugUsed = true`, fetch `GET /games/:id/debug`.
3. Refetch after each accepted transition while open (to update `current` and `pathFromCurrent`). Closing returns to the game; one click re-locks the pointer.
4. Code-split the overlay (`import()` on first open).

### A2 — Overlay content (`src/app/debug/`, React + SVG)

- **Header:** seed code, difficulty, generator version, short `levelHash` (first 12 hex characters), room and door counts, metrics (asymmetric share, self-links, sealed doors, long back links, twins, misleading doors, shortest path), elapsed time.
- **Layout:** layered left to right by `depth` (start at the left, goal at the right); rooms within a layer sorted by id; computed in `src/app/debug/layout.ts` (no graph library).
- **Room nodes:** a box showing the localised type name and id (for example "Kitchen · r07") and a compact door list. Start: green fill; goal: gold fill; current: thick blue outline; twins: a twin icon and a thin dotted line to their original.
- **Links:** an arrow from the source door's side of the box to the target box, labelled `d1→d2` on hover. Reciprocal pairs are drawn as one line with two arrowheads; self-links as loops; sealed doors as a small crossed square on the box edge; non-reciprocated (one-way) links dashed.
- **Solution path:** `pathFromCurrent` drawn thick in orange above all other links; a toggle switches to `pathFromStart`. Below the graph, the path as text in this format:
  `START (Living room r03) → Kitchen r07 [d1→d2] → Living room r03 [d2→d0] → Hallway r11 → Bedroom r05 → GOAL (Bathroom r09)`
- **In-world labels toggle:** floating labels above each door frame in 3D showing `d1 → r07.d2` (or `sealed`), visible through portals as well.
- Pan and zoom (mouse drag and wheel). Esc or the toggle key closes the overlay.
- All strings in English and Hungarian.

### A3 — Test API and autopilot

1. Extend `window.__ogm` (dev and test builds only; **excluded** from production builds, but a release-build flag `?autopilot=1` enables only `autopilot` for live demonstrations):

```ts
window.__ogm = {
  getState(): { room; x; z; yaw; pitch; status; elapsedMs; seed },
  setPose(room, x, z, yaw, pitch): void,
  step(n: number): void,
  debug(): Promise<DebugResponse>,
  autopilot: { followPath(from?: 'current' | 'start'): Promise<'completed' | 'stuck'>; stop(): void },
}
```

2. The autopilot reads `pathFromCurrent`. In each room, it plans a walk from the current position to the exit door's centre line with A* over the room's 0.25 m free grid (blocking furniture inflated by 1 cell), then walks through the door. It drives the **normal input system** (synthetic key states and yaw changes, max 180°/s turn rate), so the real controller, collision, crossing, streaming and server validation are exercised. After each crossing it re-reads the path. It reports `stuck` if no progress is made for 5 s.

### A4 — End-to-end playthroughs (Playwright)

- `playthrough.spec.ts`: for 3 fixed seeds per difficulty, start a game through the UI, run `autopilot.followPath()`, then assert the result screen, a stored result (via the API), and `missingPortalTargets = 0`.
- `seed-replay.spec.ts`: copy the seed from the result screen, start "Play this seed again", and assert the same start room and furniture.
- `debug.spec.ts`: open and close the debug view, check that the path text starts with START and ends with GOAL, and that the result shows the debug marker.

### Part A acceptance criteria

- [ ] Debug view shows all required elements (spec §16): current room, start, goal, directed links, goal location, and a highlighted guaranteed path from the current room and from the start.
- [ ] The autopilot completes all 9 e2e seeds in CI, following the debug path.
- [ ] Opening the debug view does not pause the timer and sets `debug_used` on the stored result.
- [ ] Production build: `window.__ogm` is undefined; `?autopilot=1` exposes only `autopilot`.

---

## Part B — Hardening and release

### B1 — Performance (reference: MacBook Pro M1 Max, Chrome and Safari)

1. Scripted 3-minute autopilot walk on a Hard seed with `?perf=1` logging frame times.
2. Targets: average ≥ 60 FPS, p95 frame time ≤ 16.7 ms, ≤ 12 passes per frame, `missingPortalTargets = 0`, no shader compiles after the first visit to each room. Low quality must also hold 60 FPS with the browser window at full screen.
3. JavaScript bundle ≤ 600 kB gzipped (checked in CI with a bundle-size script); title screen interactive in < 3 s on `localhost`.

### B2 — Robustness tests

- Latency: 100 autopilot runs (Easy and Medium mixed) with a 300 ms delay on every API route: 0 empty doorways, 100 % completion.
- Outage: block the API for 10 s during play, then for 10 s during completion: no lost transitions; the result is saved after recovery.
- Visual regression: finalise the baseline set (portal views, self-link, sealed door, crossing sequence, goal through a doorway, debug overlay, every UI screen in EN and HU).
- Generator: nightly-equivalent sweep of 10 000 seeds per difficulty passes on the final difficulty table (after any G2 tuning).

### B3 — Cross-browser pass (macOS)

Checklist in `docs/release/browser-checklist.md`, filled in for Chrome, Safari, Firefox and Edge: Pointer Lock (including Safari's lack of `unadjustedMovement`), WASD on ANSI and ISO keyboards, debug toggle keys, audio start, clipboard copy, settings persistence, context-loss recovery, full playthrough.

### B4 — Security and privacy review

`docs/release/security-checklist.md`: Zod validation on every route; body limits; rate limits active; helmet headers present; no stack traces in responses; no IP or user agent stored; game ids are random UUIDs; `DEBUG_VIEW_ENABLED` documented; dependencies audited (`pnpm audit` with no high/critical issues, or each justified).

### B5 — Release packaging (local, PD4)

1. Final `GENERATOR_VERSION = 1`; golden seeds frozen. From this tag on, any generator output change needs a version bump.
2. `README.md`: what the game is; requirements (Docker Desktop on macOS, or Node 22 + pnpm + PostgreSQL); **Run locally** (`pnpm start:local` → `http://localhost:8080`); controls (WASD, mouse, Esc, debug key); sharing seeds; resetting data (`docker compose down -v`); development commands; troubleshooting (WebGL2, Pointer Lock, audio).
3. `CHANGELOG.md` with the 1.0.0 entry.
4. `docs/release/traceability.md`: the 28 success criteria of spec §23, each with the evidence that proves it (test name, screenshot or checklist line). Use this mapping:

| # | Criterion | Evidence source |
| --- | --- | --- |
| 1 | 3D game in the browser | e2e playthrough |
| 2 | Separate frontend and backend | package structure, API |
| 3 | First-person navigation | e2e autopilot |
| 4 | WASD + mouse | input unit tests, G1 |
| 5 | Target room visible through doors in real time | visual baselines (CP03) |
| 6 | Visually continuous crossing | crossing frame-sequence test, G1 |
| 7 | Asymmetric links | generator metrics, fixture test |
| 8 | Same room reachable via several doors | generator property tests |
| 9 | Same door need not lead back | generator property tests |
| 10 | Persistent room identity | world-store cache tests, twin test |
| 11 | Procedural topology | sweep report |
| 12 | Procedural furnishing | sweep report, gallery |
| 13 | Several difficulties | metric ranges, G2 |
| 14 | Seed reproduces level | golden seeds, seed-replay e2e |
| 15 | User can enter a seed | e2e |
| 16 | Every level validated | validator negative tests |
| 17 | Every accepted level solvable | property tests, autopilot |
| 18 | Goal at sufficient depth | V3 tests |
| 19 | Floating, moving, turning, glowing goal | CP09 screenshots, G3 |
| 20 | Footsteps | CP09 tests, G3 |
| 21 | Ambient music | G3 |
| 22 | Completion sound | G3 |
| 23 | Toggleable debug view | debug e2e |
| 24 | Debug view shows a guaranteed path | debug e2e + autopilot |
| 25 | Completion time measured | API integration tests |
| 26 | Seed and time stored persistently | API integration tests |
| 27 | Result screen shows result and seed | e2e |
| 28 | Main challenge is impossible-space navigation | G2 playtest |

5. Tag `v1.0.0`; build the Docker image locally with tag `offered-grade-maze:1.0.0`; verify `pnpm start:local` on a clean clone.

### Part B acceptance criteria

- [ ] All B1 performance targets met on the M1 Max in Chrome and Safari (perf logs attached).
- [ ] All B2 robustness tests green.
- [ ] Browser and security checklists complete with no open blockers.
- [ ] `docs/release/traceability.md` complete; every row has evidence.
- [ ] Clean-clone check: `git clone` → `pnpm start:local` → playable game at `http://localhost:8080`, a result stored and visible after `docker compose restart`.

## 3. Gate G4 — release candidate (product owner, Thu 19 Nov)

- Walk through `traceability.md` row by row.
- Play one full game per difficulty in Chrome and Safari on the M1 Max, in English and Hungarian.
- Approve → tag and release v1.0.0 on Fri 20 Nov 2026.
