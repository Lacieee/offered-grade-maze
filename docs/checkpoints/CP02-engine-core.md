# Checkpoint 02 — Client engine core

**Product:** Offered Grade Maze — Release 1.0
**Track:** A (engine) · **Planned dates:** Wed 14 Oct – Fri 16 Oct 2026
**Depends on:** CP01 · **Unlocks:** CP03 (portals), CP06 (prefab visuals)

---

## 1. Goal

Build the framework-free 3D engine inside `packages/client`. It renders one room at a time from a `RoomDTO`. The player walks around it in first person with WASD and the mouse, collides with walls and furniture, and a performance overlay is available. Doors are not yet see-through (CP03 adds portals), but the six-room fixture house that CP03 will use is created here.

## 2. Standing rules

Same as CP01 section 2 (see `AGENTS.md`). Key reminders for this checkpoint: client never imports `@ogm/generator`; all room data comes from `@ogm/shared` DTOs; product decisions PD1–PD8 in `docs/decisions.md` apply.

## 3. Scope

**In scope:** Vite + React app shell (minimal), engine loop, renderer, room builder, fixed light rig, placeholder furniture, player controller, collision, perf overlay, fixture house, dev scene.

**Out of scope:** portals and door crossing (CP03), real furniture models (CP06), network (CP08), menus beyond a dev launcher (CP08), audio (CP09).

## 4. Requirements

### T1 — App and engine skeleton

1. `packages/client`: Vite, React 18, Zustand, Three.js (exact version pinned), TypeScript.
2. `src/main.tsx` mounts `<App/>`: a full-window `<canvas>` owned by the engine plus a React overlay layer (`position: fixed`, pointer events only on interactive elements).
3. Engine lives in `src/engine/` and has no React imports. Folders: `loop/`, `render/`, `rooms/`, `player/`, `world/`, `debug/`, `util/` (later: `portals/`, `prefabs/`, `audio/`, `goal/`, `net/`).
4. Public engine API (class `Engine` in `src/engine/Engine.ts`):

```ts
init(canvas: HTMLCanvasElement): void           // throws UnsupportedError if WebGL2 missing
loadRooms(rooms: RoomDTO[]): void               // builds and caches RoomViews by id
setCurrentRoom(id: RoomId, spawn: Spawn): void
start(): void; stop(): void; dispose(): void
on(event: 'roomChanged' | 'frame', cb): Unsubscribe
getState(): { room: RoomId; x: number; z: number; yaw: number; pitch: number }
```

5. **Loop:** fixed simulation step of 1/60 s with an accumulator. Clamp frame delta to 0.25 s. Rendering interpolates position and yaw between the previous and current simulation state (`alpha = accumulator / step`).
6. **Renderer:** `THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false })`. Require WebGL2 (`renderer.capabilities.isWebGL2`). Pixel ratio = `min(devicePixelRatio, 1.5)`. Output colour space sRGB, no tone mapping. Camera: `PerspectiveCamera`, vertical FOV 75°, near 0.05, far 50. Resize on window resize.

### T2 — Room builder

`buildRoom(dto: RoomDTO): RoomView` in `src/engine/rooms/`. A `RoomView` contains:

```ts
interface RoomView {
  id: RoomId;
  scene: THREE.Scene;                       // the room in its own local coordinates
  colliders: Collider[];                    // see T4
  doors: Map<DoorId, { frame: DoorFrame; link: Link | null; anchor: THREE.Object3D }>;
  lights: { hemi: THREE.HemisphereLight; points: [THREE.PointLight, THREE.PointLight, THREE.PointLight, THREE.PointLight] };
  dispose(): void;
}
```

Geometry rules (use `doorFrame()` from `@ogm/shared`, never re-derive door positions):

- Floor plane and ceiling plane covering the footprint.
- Each wall is built from boxes spanning from the footprint edge outward to the portal plane (thickness `WALL_HALF` = 0.15 m), height 2.8 m, with an opening of 1.0 × 2.1 m at each door: wall segments left and right of every opening, plus a lintel from 2.1 m to 2.8 m. The opening's side faces (jambs) and top face (head) are part of the room.
- Door casing (trim) on the room side: 0.08 m wide, 0.02 m proud of the wall, in `palette.trim`.
- A door whose `link` is `null` (sealed) gets a closed door panel (0.04 m thick slab with a simple handle) filling the opening at the portal plane.
- In CP02 a door with a link shows a flat black plane at the portal plane (CP03 replaces it with a portal).
- Materials: `MeshLambertMaterial` with flat colours from `palette`; floor colour from `palette.floor`.
- Placeholder furniture: every `FurnitureDTO` renders as a box. Size comes from `params.w`, `params.h`, `params.d` if present, otherwise 0.6 × 0.8 × 0.6 m; colour `colors[0]` or grey. Position (`x`, `z`), rotation `rot × 90°`.
- Merge all static meshes per material (`BufferGeometryUtils.mergeGeometries`). Target ≤ 60 draw calls per room (check `renderer.info.render.calls`).

**Fixed light rig (mandatory, do not vary per room):** one `HemisphereLight` (sky = ceiling colour, ground = floor colour, intensity 0.6) and exactly 4 `PointLight`s. Map `LightDTO`s onto the point lights in order; unused point lights stay in the scene with intensity 0. Reason: Three.js compiles shader programs per light count, so a constant count prevents shader recompiles when another room is shown (critical for CP03). Call `renderer.compile(scene, camera)` after building a room.

### T3 — Fixture house

Create six hand-authored `RoomDTO` JSON files in `src/dev/fixtures/` plus `index.ts` that validates them with the Zod schemas at load time. Start room `r00`; temporary goal room `r05`. Door positions: choose `offset`s that satisfy the rules (≥ 0.5 m from corners, ≥ 0.6 m between doors; use `maxDoorOffset`). The links below are the contract; CP03 tests depend on them.

| Room | Type | Size w × d (m) | Doors (wall) |
| --- | --- | --- | --- |
| r00 | living | 7.0 × 7.5 | d0 (N), d1 (E), d2 (W) |
| r01 | kitchen | 5.0 × 5.0 | d0 (S), d1 (W), d2 (N), d3 (E) |
| r02 | bedroom | 5.0 × 5.5 | d0 (S), d1 (E) |
| r03 | bathroom | 3.5 × 3.5 | d0 (S), d1 (N) |
| r04 | hallway | 2.5 × 8.0 | d0 (S), d1 (N), d2 (E) |
| r05 | study | 4.5 × 4.5 | d0 (S), d1 (W) |

| From | → To | Why it exists (spec §2 scenario) |
| --- | --- | --- |
| r00.d0 | r01.d0 | living → kitchen |
| r01.d0 | r00.d0 | back through the same door → same living room (reciprocal) |
| r01.d1 | r00.d2 | kitchen's other door → the **same** living room via its other door |
| r00.d2 | r04.d0 | going back through that door leads to the hallway (asymmetric) |
| r01.d2 | r02.d0 | kitchen → bedroom |
| r02.d0 | r03.d0 | turn around in the bedroom: same door leads to the bathroom |
| r02.d1 | r02.d0 | self-link: bedroom → bedroom, arriving through d0 |
| r03.d0 | r01.d3 | bathroom → kitchen |
| r01.d3 | `null` | sealed: one-way passage bathroom → kitchen |
| r03.d1 | r05.d0 | bathroom → study |
| r05.d0 | r03.d1 | reciprocal |
| r05.d1 | r04.d1 | study → hallway |
| r04.d1 | r05.d1 | reciprocal |
| r04.d0 | r00.d1 | hallway → living room via d1 |
| r04.d2 | r01.d1 | hallway → kitchen via d1 |
| r00.d1 | r04.d2 | living → hallway via d2 |

Give each fixture room a distinct palette and 3–6 placeholder furniture boxes placed clear of a 1.4 × 1.2 m zone in front of each door. Each room gets one ceiling `LightDTO` at (0, 2.6, 0).

### T4 — Player controller and collision

1. **Input** (`src/engine/player/input.ts`): Pointer Lock requested on canvas click. Try `requestPointerLock({ unadjustedMovement: true })` and fall back to `requestPointerLock()` if it rejects (Safari). Keys by `event.code` only: `KeyW`, `KeyA`, `KeyS`, `KeyD`. Ignore key repeat. Clear all held keys on `blur` and on Pointer Lock loss.
2. **Look:** yaw unbounded, pitch clamped to ±85°. Sensitivity 0.0022 rad/px (configurable; invert-Y flag, default off).
3. **Movement:** wish direction from WASD relative to camera yaw, normalised. Acceleration 20 m/s² toward `WALK_SPEED` (3.0 m/s); when no key is held, decelerate to 0 within ~0.15 s. No vertical movement. Eye at `EYE_HEIGHT`.
4. **Colliders** (`Collider = Segment | Box`), generated by the room builder in room coordinates: wall segments along the footprint edge with gaps at door openings; jamb segments along both sides of each opening from the footprint edge to the portal plane; furniture boxes (axis-aligned after rotation); sealed door panels as segments across the opening; a segment across each **linked** opening at the portal plane (temporary, removed in CP03).
5. **Resolution:** circle of radius `PLAYER_RADIUS` vs colliders. Per step: move, then up to 4 iterations of "find deepest penetration, push out along its normal". Velocity component into a wall is removed (sliding).
6. Movement and collision are pure functions in `player/physics.ts` (no Three.js), unit-tested.

### T5 — Perf overlay and dev scene

1. `?perf=1` shows a small top-right panel: FPS, frame time average and p95 over the last 2 s, draw calls, triangles, and a `passes` counter (always 1 in CP02).
2. Dev launcher: `/?dev=fixtures&room=r00` loads the fixture house and spawns in the given room (centre, facing d0). In dev builds only, keys `Digit1`…`Digit6` jump to r00…r05. Dev code is excluded from production builds (`import.meta.env.DEV`).
3. A WebGL2-missing browser shows a plain "This game needs a desktop browser with WebGL2" message instead of crashing.

## 5. Deliverables

- `packages/client/src/{main.tsx, App.tsx}`, `src/engine/**`, `src/dev/fixtures/*.json`, unit tests for physics and room-builder helpers.
- `pnpm --filter @ogm/client dev` serves the dev scene.

## 6. Acceptance criteria

- [ ] `/?dev=fixtures&room=r00` renders the living room with walls, door openings, casings, the sealed door panel in r01 (d3) and placeholder furniture; no console errors.
- [ ] All six fixture rooms load, validate against Zod, and switch with keys 1–6.
- [ ] WASD movement follows the camera heading on QWERTY and QWERTZ layouts (verified by `event.code` unit test).
- [ ] The player cannot pass through walls, jambs, furniture, sealed panels or (in CP02) linked openings; slides along walls at an angle. Unit tests cover corner cases: head-on, 30° slide, corner pocket, between two boxes 0.7 m apart (passable), 0.5 m apart (blocked).
- [ ] Every room uses exactly 1 hemisphere + 4 point lights (unit test on `RoomView`).
- [ ] Each fixture room renders in ≤ 60 draw calls.
- [ ] Perf overlay shows ≥ 60 FPS, p95 frame time ≤ 16.7 ms on the reference MacBook Pro M1 Max in Chrome and Safari.
- [ ] Losing Pointer Lock (Esc) stops movement immediately; clicking re-locks.
