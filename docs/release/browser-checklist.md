# Cross-browser checklist (CP10 B3), macOS

Fill in on the reference machine (MacBook Pro M1 Max, latest macOS) with the product running
(`pnpm start:local`, <http://localhost:8080>). Mark each cell ✅, ❌ (with a note below) or
n/a, and write the browser version in the header. The last column is what the automated
suite already proves in headless Chromium (Linux, software WebGL); it does not replace the
Mac columns.

| #   | Check                                                                                                                                                                                                                                                                                | Chrome ___ | Safari ___ | Firefox ___ | Edge ___ | Automated (Chromium)                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------: | :--------: | :---------: | :------: | ---------------------------------------------------------------------------------- |
| 1   | **Pointer Lock**: the Ready click locks the mouse; Esc shows the pause overlay; one click on the game locks again; no tilt on the first movement after locking. Safari: no `unadjustedMovement`, the plain lock is used (no console error).                                          |            |            |             |          | `game.spec.ts` pause overlay; `input.test.ts` (first movement dropped, CP08 fix)   |
| 2   | **WASD on an ANSI keyboard** (US layout): forward, back, strafe; holding two keys moves diagonally.                                                                                                                                                                                  |            |            |             |          | `input.test.ts` "maps WASD by physical position"                                   |
| 3   | **WASD on an ISO keyboard** (Hungarian QWERTZ: W A S D are the same keys; the Z key does not move).                                                                                                                                                                                  |            |            |             |          | `input.test.ts` "ignores event.key: the QWERTZ "z" key …"                          |
| 4   | **Debug view keys**: the key under Esc (ANSI \`, Apple ISO §) and F9 (fn+F9) open and close it; Esc closes it; the timer keeps running; the pause overlay appears after closing.                                                                                                     |            |            |             |          | `debug.spec.ts` (Backquote, IntlBackslash, F9, Esc)                                |
| 5   | **Audio starts on the Ready click** with no autoplay warning in the console; footsteps, ambience, the goal hum near the goal and the completion stinger are heard.                                                                                                                   |            |            |             |          | `sound.spec.ts` (context running after the click, footsteps counted, stinger once) |
| 6   | **Clipboard copy**: Copy on the result screen; paste into New game → Enter seed works.                                                                                                                                                                                               |            |            |             |          | `seed-replay.spec.ts`, `game.spec.ts` journey                                      |
| 7   | **Settings persist** across a reload (FOV, sensitivity, invert Y, volumes, quality, language) and apply live.                                                                                                                                                                        |            |            |             |          | `settings.spec.ts`                                                                 |
| 8   | **Context-loss recovery**: in the console run `document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`, wait 2 s, then `….restoreContext()` (keep the extension object): the "Graphics reset" notice shows and the house comes back. |            |            |             |          | `portals.spec.ts` "a lost WebGL context is restored without reloading the page"    |
| 9   | **Full playthrough** of one game per difficulty in English and in Hungarian; the result is stored (shown again after `docker compose restart`).                                                                                                                                      |            |            |             |          | `playthrough.spec.ts` (9 seeds), `api.spec.ts`                                     |
| 10  | **Performance walk** (B1): Chrome and Edge `pnpm perf:walk` (`PERF_CHANNEL=msedge` for Edge); Safari and Firefox manual (below). Targets: avg ≥ 60 FPS, p95 ≤ 16.7 ms, ≤ 12 passes, 0 missing portal targets, 0 late shader compiles; Low quality also at full screen.               |            |            |             |          | script verified end to end in SwiftShader (numbers not meaningful there)           |

## Manual performance walk (Safari, Firefox)

1. Open `http://localhost:8080/?perf=1&autopilot=1&seed=H1-7K2Q-X9MP`.
2. Click **Start**, then the Ready screen.
3. Open the console (Safari: Develop → Show JavaScript Console; enable the Develop menu in
   Settings → Advanced) and run `await __ogm.autopilot.tour(180)`. It plays the Hard seed
   for 3 minutes and returns the number of completed games.
4. Press Esc, click **Copy log** in the perf panel (top right) and paste the log into
   `e2e/perf-results/perf-<browser>-auto.json`.
5. Repeat with `&quality=low` in full screen (View → Enter Full Screen) for the Low-quality
   check.

## Notes

(One line per ❌: browser, check, what happened, issue link.)
