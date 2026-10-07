# Checkpoint 03 — Portal rendering and door crossing

**Product:** Offered Grade Maze — Release 1.0
**Track:** A (engine) · **Planned dates:** Mon 19 Oct – Fri 23 Oct 2026
**Depends on:** CP02 · **Unlocks:** CP06, CP08 · **Human gate:** **G1 Portal feel — Fri 23 Oct**

---

## 1. Goal

Make every linked doorway a live, seamless window into its target room, and let the player walk through it with no visible cut, fade, flash or hitch. This is the product's number-one priority. It is proven here on the CP02 fixture house before any procedural content exists.

## 2. Standing rules

Same as CP01 section 2 (`AGENTS.md`). Product decisions PD1–PD8 apply. Reference machine: MacBook Pro M1 Max, Chrome and Safari.

## 3. Scope

**In scope:** portal maths, recursive render-target portal renderer, portal culling and budget, door crossing, sealed-door behaviour, automatic quality, WebGL context-loss recovery, Playwright setup with first visual baselines, a minimal test hook.

**Out of scope:** procedural rooms, networking, audio, goal object.

## 4. Key concepts

- Each room is its own `THREE.Scene` in its own coordinates (from CP02). There is no global map.
- A link D (door of room A) → E (door of room B) defines the transform from A's coordinates to B's coordinates:

```
T(D→E) = M_E · R_y(π) · M_D⁻¹
```

`M_X` is door X's frame matrix in its room (translation `origin`, rotation `yaw` about +Y, from `doorFrame()`), and `R_y(π)` is a half-turn about +Y. A point just outside D (door-local z = −ε) maps to just inside E (door-local z = +ε). The transform is always a rotation about Y plus a translation, never a mirror.

## 5. Requirements

### T1 — Portal maths (`src/engine/portals/portalMath.ts`)

1. `doorMatrix(frame: DoorFrame): THREE.Matrix4` and `portalTransform(fromFrame, toFrame): THREE.Matrix4` implementing the formula above. `yawDelta(fromFrame, toFrame) = toFrame.yaw + π − fromFrame.yaw`, normalised to (−π, π].
2. `obliqueProjection(projection: THREE.Matrix4, clipPlaneView: THREE.Vector4): THREE.Matrix4`: Lengyel's oblique near-plane technique, the same as three.js `examples/jsm/objects/Reflector.js`:

```
q.x = (sign(c.x) + e[8]) / e[0]
q.y = (sign(c.y) + e[9]) / e[5]
q.z = -1
q.w = (1 + e[10]) / e[14]
c   = c * (2 / dot(c, q))
e[2] = c.x;  e[6] = c.y;  e[10] = c.z + 1;  e[14] = c.w
```

(`e` = column-major `projection.elements` of a copy; `c` = clip plane in the virtual camera's view space.)

3. Unit tests: for all 16 wall pairs (N/E/S/W × N/E/S/W) with non-zero offsets, a point at door-local (x, y, −ε) of D maps to door-local (−x, y, +ε) of E. A camera rotated by `yawDelta` keeps its relative heading. For each reciprocal pair, `T(E→D) · T(D→E)` equals the identity (tolerance 1e-9).

### T2 — Portal meshes

1. For every linked door, the room builder adds a **portal mesh**: a box 1.0 m wide × 2.1 m high × `PORTAL_BOX_DEPTH` (0.25 m), placed **behind** the portal plane (door-local z from −0.25 to 0), with all faces rendered (`side: DoubleSide`). It replaces the CP02 black plane and the temporary collider across the opening.
2. Portal shader (`ShaderMaterial`): output colour = `texture2D(portalTex, gl_FragCoord.xy / viewportSize)`. Include `#include <colorspace_fragment>` so colour-space conversion happens only on the final screen pass. All render targets stay in linear colour space (Three.js default).
3. Uniforms: `portalTex`, `viewportSize`, `fallbackColor`, `useFallback` (bool). When `useFallback` is true, output `fallbackColor` (the target room's wall colour × 0.35).
4. Why a box: when the camera's near plane cuts through the doorway, it still sees box faces carrying the same screen-space image, so no gap or flash appears. The box is deeper than the near-plane half-diagonal (≈ 0.08 m at near = 0.05 m, FOV 75°).

### T3 — Portal renderer (`src/engine/portals/PortalRenderer.ts`)

Per frame:

1. **Build a portal tree.** Root node = current room, main camera, screen rectangle = full viewport, level 0. For every node and every linked door of that node's room:
   - skip the door if it is the node's **arrival door** (the door the node was entered through; its portal box sits between the virtual camera and the room);
   - skip if the node camera's position, in door-local coordinates, has z ≤ 0 (looking at the back of the portal);
   - project the opening's 4 corners (door-local (±0.5, 0, 0) and (±0.5, 2.1, 0)) with the node's camera. If any corner has w ≤ 0, use the parent rectangle; otherwise use the projected bounding rectangle. Intersect with the parent rectangle; skip if empty;
   - create a child: room = link target, camera world matrix = `T(D→E) · parentCameraWorld`, arrival door = E, level = parent + 1, rectangle = the intersection.
2. **Limits.** `maxDepth = 3` (Low quality: 2). At most `maxPasses = 12` child passes per frame; when over budget keep the largest rectangles. A door that would exceed depth or budget becomes a **fallback** portal (`useFallback = true`).
3. **Oblique near plane.** Each child camera uses the main projection modified with `obliqueProjection`. The clip plane is the arrival door E's plane in B coordinates, normal = E's inward direction, moved **1 mm toward the camera** (door-local z = −0.001), transformed into the child camera's view space. Set `frustumCulled = false` on room meshes (Three.js culling assumes a standard projection).
4. **Render children first** (post-order, depth-first). Each child renders into a pooled `WebGLRenderTarget` with its own depth buffer, `samples = 4` (WebGL2 MSAA). Size = drawing buffer size × scale, where scale is 1.0 at level 1, 0.75 at level 2 and 0.5 at level 3. Use `setScissor`/`setScissorTest` with the node rectangle (in target pixels) to limit work.
5. Before rendering a room pass, point each of that room's portal materials at the matching child target (or set `useFallback`), hide the arrival-door portal mesh, set the camera, render, then restore.
6. **Main pass** renders the current room to the screen with its portal materials pointing at the level-1 targets.
7. The same room may appear several times in one tree (self-links, loops). Always render the cached scene with per-pass uniforms; never clone room scenes.
8. Expose `getPortalTree(): ReadonlyArray<{ room: RoomId; level: number; cameraFromRoot: THREE.Matrix4; rect }>` for later use (goal audio in CP09, debug in CP10). Report `passes` to the perf overlay.

### T4 — Door crossing (`src/engine/portals/traversal.ts`)

1. Run after collision in every simulation step. For each linked door of the current room, express the eye position before and after the step in door-local coordinates. A **crossing** happens when z went from ≥ 0 to < 0 and, at the crossing point, |x| ≤ 0.5 and 0 ≤ y ≤ 2.1.
2. On crossing: apply `T(D→E)` to the current position, add `yawDelta` to yaw, rotate velocity by `yawDelta`, and apply the **same transform to the previous simulation state** (otherwise render interpolation jumps). Set the current room to the target and emit `roomChanged { from, door, to }`. Then continue the same step in the new room.
3. Collision near doors: the jamb colliders keep the player centre within 0.2 m of the door centre line. The player circle may reach up to 0.3 m past the portal plane before the crossing. That space is always free, because the target door's clearance zone holds no furniture, so target-room colliders do not need checking before the crossing.
4. Sealed doors: no portal mesh, a closed panel and a collider across the opening (from CP02).
5. One step moves at most 5 cm (3 m/s at 60 Hz), so a crossing can never be skipped.

### T5 — Expected asymmetric behaviour (do not "fix")

Walking through D into B keeps the forward view continuous. The view behind switches from A to wherever B's door E leads. The player sees the change only on turning around. This is the intended mechanic (spec §2, §3). The 0.3 m total wall thickness hides most side views while straddling a door.

### T6 — Quality and robustness

1. Automatic quality: if the 2-second average frame time exceeds 20 ms, step down in this order: MSAA off on render targets → level-1 scale 0.75 → `maxDepth` 2. Step back up one level after 10 s below 12 ms. Manual override `quality = 'auto' | 'high' | 'low'` (setting UI comes in CP09).
2. WebGL context loss: on `webglcontextlost` call `preventDefault`, pause the loop, show "Graphics reset — restoring…". On `webglcontextrestored` rebuild all GPU resources (room scenes, render targets) from cached `RoomDTO`s and resume.
3. Dev flag `?portalDebug=1`: tint each recursion level (level 1 red 10 %, level 2 green 10 %, level 3 blue 10 %) and draw node rectangles as outlines.

### T7 — Test hook and visual baselines

1. In dev and test builds only, expose `window.__ogm = { getState(), setPose(room, x, z, yaw, pitch), step(n) }`. `step(n)` advances n simulation steps with no input, for deterministic screenshots. Exclude it from production builds.
2. Set up Playwright in `/e2e` (Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader`, Firefox optional). Add a `visual.spec.ts` with these baselines on the fixture house:
   - `r00` facing d0 (kitchen through the doorway);
   - `r02` facing d1 (self-link: the bedroom inside the bedroom);
   - `r01` facing d3 (sealed panel);
   - `r00` looking along three aligned doors (recursion depth 3 visible);
   - a 7-frame sequence walking through r00.d0 into r01 (`step` between frames).

## 6. Deliverables

- `src/engine/portals/{portalMath,PortalRenderer,PortalMesh,traversal,renderTargetPool}.ts` with unit tests.
- Updated room builder, perf overlay (`passes`), quality manager, context-loss handler.
- `/e2e` Playwright config and `visual.spec.ts` with committed baselines.

## 7. Acceptance criteria

- [ ] Portal maths tests from T1 pass for all 16 wall pairs.
- [ ] **Correctness:** for 10 camera poses, the image inside a level-1 portal matches a direct render of the target room from `T · camera` (with the same oblique projection): mean absolute per-channel difference < 2.5/255, excluding a 2-pixel border.
- [ ] **Seamless crossing:** in the 7-frame crossing sequence, the per-frame mean pixel change at the crossing frame is no larger than 1.5 × the average change of the other frames.
- [ ] Position and heading are continuous across a crossing (unit test on `traversal`: the world-relative motion direction is unchanged).
- [ ] The full spec §2 scenario works by hand on the fixture house: living → kitchen → back to the same living room; kitchen's other door → same living room via its other door; through to the bedroom, turn around → bathroom through the same doorway; self-link in the bedroom; the sealed door after bathroom → kitchen.
- [ ] Recursion depth 3 is visible through aligned doors; deeper portals show the fallback colour, never an empty or black opening.
- [ ] ≤ 12 passes per frame; ≥ 60 FPS (p95 ≤ 16.7 ms) on the M1 Max reference in Chrome and Safari while looking through three aligned doors.
- [ ] Forced slow frames (dev toggle) step quality down; simulated context loss (`WEBGL_lose_context`) recovers without reloading the page.
- [ ] No shader compilation happens when entering a room after the first visit (check `renderer.info.programs.length` stays constant).

## 8. Gate G1 — human checklist (product owner, Fri 23 Oct)

- Walk the fixture house for 10 minutes in Chrome and Safari on the M1 Max.
- No visible seam, flash, black frame or stutter at any door, including walking through at an angle and turning while inside a doorway.
- Asymmetric, self-link and sealed doors behave as described in spec §2.
- If G1 fails, CP03 gets up to one extra week; all later dates move by the same amount.
