# ADR-0003: Portal renderer and test details (CP03)

- **Status:** accepted
- **Date:** 2026-10-08
- **Checkpoint / task:** CP03-T2, T3, T4, T6, T7

## Context

CP03 specifies the portal maths, renderer, crossing, quality steps and tests closely. A few
points were left open or turned out to need a different detail in practice.

## Decision

1. **Opening rectangles are clipped, not widened.** CP03 T3 says a doorway with any corner
   behind the camera (w ≤ 0) uses the whole parent rectangle. That made every side door
   expand into a full-screen pass. The opening quad is now clipped against w ≥ 1e-4 in clip
   space and the clipped polygon's bounds are used. The result always contains the
   visible part of the opening, so nothing visible is lost, and side doors cost nothing.
2. **The pass budget counts the main pass.** `maxPasses = 12` render passes per frame in
   total (main + at most 11 portal passes), so the §7 "≤ 12 passes per frame" holds in
   either reading of T3.2.
3. **Portal render targets are RGBA16F (HalfFloat)** when the GPU can render to them, else
   RGBA8. Targets stay linear (CP03 T2.2); 16-bit avoids banding in dark colours before
   the final sRGB conversion.
4. **Shader programs are pre-compiled for both outputs.** Three.js compiles a separate
   program for screen passes (sRGB output) and render-target passes (linear output).
   `loadRooms` compiles each room for both, so entering a room never compiles a shader.
5. **Linked doorways keep a conditional collider.** CP03 removes the CP02 collider across
   linked openings. It is kept but only active while the target room is not loaded, so the
   player can never walk out of the house while rooms stream in (CP08).
6. **Floor and ceiling are tessellated into ≤ 0.5 m tiles.** At every door crossing the
   camera passes the footprint edge, where the room's corner vertices lie. A two-triangle
   ceiling with a vertex a few millimetres from the camera plane interpolated its lighting
   wrongly in SwiftShader (a visible diagonal). Small tiles remove it. SwiftShader also
   drops triangles with a vertex exactly on the camera plane (clip w = 0): with the 0.5 m
   tile grid that happens for poses on exact grid coordinates with an axis-aligned yaw,
   which continuous movement never produces. Test poses avoid such coordinates, and the
   deterministic crossing sequence is offset by 2 cm from wall planes.
7. **Test hook extras.** Besides `getState`, `setPose` and `step(n)`, the hook offers
   `step(n, keys)` (walking frames), `info()`, `portalTree()`, `setQuality()`,
   `slowFrames(ms)` (the "forced slow frames" dev toggle) and `portalCheck(door)` (the
   correctness check, rendered in the browser). `?overlay=0` hides the HUD and `?quality=`
   pins quality for deterministic screenshots.
8. **Playwright 1.56.1 (Chromium 141).** Pinned to the browser build preinstalled in the
   cloud environment, so baselines made there match CI. Baselines are stored per platform
   (`-linux`, `-darwin`); the first run on a new platform writes them (and reports them as
   new), after that they are compared.
9. **Depth-3 baselines.** In the fixture house no r00 pose looks through three truly aligned
   doors. `r00-depth3` uses the r00 pose with the clearest level-3 view (through d2 into the
   hallway); `r04-depth3` adds a clearer one (hallway → kitchen → living room → hallway).

## Consequences

- Fewer wasted passes; the budget goes to portals that are actually on screen.
- The correctness check matches exactly (mean difference 0.000/255 on all 10 poses) and
  detects a 20 cm camera error (16/255), so it is sensitive enough.
- Known cosmetic issue for CP06: the fixture ceiling light at 2.6 m makes a bright spot on
  the ceiling with linear falloff.

## Alternatives considered

- **Stencil portals:** rejected in the architecture (D2); render targets compose better with
  per-level resolution and MSAA.
- **Polygon offset instead of tessellation:** does not fix varying interpolation.
