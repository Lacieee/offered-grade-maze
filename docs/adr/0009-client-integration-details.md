# ADR-0009: Client integration details

- **Status:** accepted
- **Date:** 2026-10-13
- **Checkpoint / task:** CP08 (T1–T7)

## Context

CP08 connects the engine to the CP07 API and adds the UI shell. Building and testing it
raised points the checkpoint leaves open, plus two places where its literal text would cost
the player something.

## Decision

### 1. Loading builds every room the first frames can show (deviation from T5)

T5 asks the loading step to wait for the start room and its direct link targets. The portal
renderer shows three levels, so rooms two and three hops away were visible in the first
frames, still unbuilt. In SwiftShader they stayed unbuilt for several seconds of play, and the
real-API streaming test counted missing portal targets.

Loading now builds every room within **3 hops** of the start synchronously, behind the loading
screen. Rooms further out (the server sends 4 hops) stream in the background as T4
describes: one room per idle slot, only with 4 ms or more left, nearest to the player first.

Loading takes about 1.9 s for Hard in SwiftShader and much less on real GPUs. The
architecture targets 1.5 s on the M1 Max.

### 2. The official client time is taken at the pickup

T5 says to flush the transition queue, then send `/complete` with
`clientElapsedMs = performance.now() − t0`. Read literally, the time would include saving,
and with a slow network the player would pay for their own connection.

The client therefore takes the time at the pickup, the moment the timer stops on screen. The
CP07 rule (client time official if `0 ≤ server − client ≤ 5 s`) still bounds it: a longer
flush makes the server time official.

### 3. Transition queue

- **No sending before `/start`.** Crossings are queued from the first frame, but nothing is
  sent before the game's `/start` succeeded (retried with backoff), so the server never
  answers `not_started`.
- **Rejected crossings.** A `desync`, or any other non-retryable rejection, is reported to
  `/client-errors`, dropped, and the queue continues. Network errors, 5xx and 429 are retried.
- **Renumbering.** After a rejection the remaining crossings are renumbered from the server's
  `lastSeq`. Otherwise every later crossing would be rejected for a gap.
- **Resync.** Once the queue is empty and the player stands in a different room than the
  server's `current`, the player is moved to the centre of the server's room. Without this,
  every later crossing would be rejected for its `from`, and the game could never complete.
  Desync only comes from bugs, so this is a safety valve, not gameplay.

### 4. Streaming safety net

- After a crossing, the client fetches rooms within 3 hops that it does not know, but only
  once the queue is empty. Until then the server may still think the player is elsewhere and
  answer 403. The queue triggers the check again after each accepted crossing.
- **`missingPortalTargets`** counts a door only when it is visible and its level is within
  the depth budget. Doors beyond the budget show the fallback colour by design. The perf
  overlay shows the count and the rooms still waiting to be built.

### 5. A Pointer Lock bug in the engine (CP02 code)

The first `mousemove` after gaining Pointer Lock carries the pointer's jump to the lock
position (−480, −270 on a 960 × 540 page in Chrome). It tilted the view when the player
clicked Ready. The input layer now drops the first movement after each lock gain; a unit test
covers it.

### 6. UI

- **i18n.**
  - A small typed dictionary, no library: `en.ts` defines the keys, and `hu.ts` must have
    the same ones (`Record<MessageKey, string>`).
  - Unit tests check that both have the same keys and placeholders, that no string is empty,
    and that every `t('…')` key used in the UI exists.
  - English is the default (PD3); the choice is stored in `localStorage` (`ogm.lang`).
- **Ready screen.** It is one full-screen button: the click locks the pointer (a user
  gesture) and starts the game, even if the lock is refused.
- **Pause overlay.** It fades in after 250 ms, so the moment between a click and the lock
  arriving does not flash it.
- **HUD timer.** It writes its text from `requestAnimationFrame` through a ref. A dev-only
  commit counter (`window.__ogmHudRenders`) lets e2e prove that React does not re-render per
  frame.
- **Placeholder goal.** A glowing 0.32 m box at `RoomDTO.goal`, until CP09.

### 7. Development and tests

- **Mock API** (`src/dev/mockApi.ts`, `?mock=1`, dev builds only). It applies the server's
  rules to the fixture house; every seed plays the fixture house. It exposes
  `window.__ogmMock.lastSeq(gameId)` for tests.
- **Vite proxy.** `/api` goes to `OGM_API_URL` (default `http://localhost:8080`).
- **Test hook additions:** `roomDto`, `doorPose`, `missingLog` and `game()`.
- **Pacing.** Scripted e2e walks look at each door for 1 s before walking through. A script
  without pacing crosses rooms faster than any player and outruns streaming by design.
- **Real-API e2e** (`api.spec.ts`) runs with `E2E_API=1`. Playwright then also starts the
  built server on :8090. CI runs it with a PostgreSQL service.

## Consequences

- Loading is slightly longer, but no unbuilt doorway shows in the first seconds.
- The official time never includes the time spent saving it.
- CP09 replaces the goal placeholder and adds the settings screen, including the language
  toggle.
