# ADR-0007: Prefab visuals details

- **Status:** accepted
- **Date:** 2026-10-08
- **Checkpoint / task:** CP06 (T1–T6)

## Context

CP06 turns the CP05 furniture into low-poly geometry built from primitives, adds procedural
textures and a prefab gallery, and refreshes the visual baselines. Building it raised points
the checkpoint leaves open, and one place where following the text literally would break a
CP03 guarantee (identical pixels on every machine).

## Decision

### 1. Textures are `DataTexture`s, not `CanvasTexture`s (deviation from T3)

T3 asks for canvas textures. Canvas 2D drawing (anti-aliasing, arc rasterisation, colour
management) differs between browsers and GPUs, and is not available in the Node unit tests.

- Paintings (256 × 192) and floors (512 × 512) are pure pixel functions of their parameters
  (`textures/pixels.ts`, seeded with mulberry32), wrapped in a `THREE.DataTexture`.
- The same params give the same bytes in every browser and in Vitest; the unit tests hash the
  bytes, and Playwright hashes the rendered painting across reloads.
- Rows are flipped once when the painting texture is made, so row 0 is the top of the picture.
- Floor textures are shared by every room with the same floor kind and colour, and counted:
  the last room using one disposes it. Painting textures belong to their room.

The visual result is the same as the canvas version T3 describes; only the drawing API differs.

### 2. Recipe tolerances

T1 asks for the footprint to match within 2 cm and the height to come from `meta.height`.

- **Footprint.** No part of any item leaves its footprint; handles and door fronts count.
  Blocking items also reach each side of the footprint within 2 cm, so the visual base
  matches the collider. Non-blocking items (rugs, wall-hung items, a towel rack) may be smaller.
- **Height.** The top of each item is within 0.25 m of `meta.height`. Plants and lamps have
  organic tops; a tighter rule made them look cut off.
- **Bottom.** Floor items start at y = 0. Wall-hung items are centred on `meta.mountY`, so
  they start at `mountY − height / 2`.
- **Triangles.** 12–600 per item. T1 targets 50–600; tiny items (a bin, an umbrella stand)
  need fewer than 50 and look right.

A unit test checks all four rules for every prefab and variant.

### 3. Lighting additions

- **Ceiling fixture.** Each ceiling `LightDTO` gets a small emissive disc and rod. Without it,
  the bright patch the point light makes on the ceiling read as a rendering fault.
- **Ceiling self-light.** The ceiling faces down, so the hemisphere light gave it the floor's
  dark colour. The ceiling material now has an emissive term of 0.35 × its palette colour.
- Lamps (`meta.light`) and the clock face, aquarium water and lamp shade are in the `emissive`
  group, as T1.7 asks.

### 4. Colour rules added to recipes

- **The red armchair is always red (generator change).** CP05 drew both colours of
  `sig_red_armchair` from the signature colours, so "the red armchair" could be blue.
  The generator now draws its upholstery colour from five red shades (`RED_SHADES`); the legs
  still take any signature colour. This changes generated levels, so the golden hashes were
  refreshed (allowed before v1.0.0).
- **Foliage is always green.** Plant leaf colour comes from the item colour, which is often a
  brown or amber accent; under warm room light those looked like dead leaves. The item colour
  now picks one of five greens and tints it by 8 %, so plants still differ between rooms.

### 5. Room merge

- One mesh for all `solid` parts of a room (furniture and ceiling fixtures), one for all
  `emissive` parts, and one per painting texture. Walls, floor, ceiling and door casings stay
  as in CP02.
- Colliders still come from the catalogue footprint, never from the mesh.
- Measured on 30 generated rooms (5 Hard seeds × 6 room types): at most 13 draw calls and
  about 3 600 triangles per room, against budgets of 60 and 60 000.

### 6. Dev tools

- **Gallery** (`/?dev=prefabs`): own renderer and scene, outside the engine. Wall-hung items
  get a wall behind them. Options `only=`, `camera=x,y,z,yaw,pitch` and `outlines=1` make
  repeatable screenshots; `window.__gallery` tells Playwright when it is ready.
- **Level loader** (`/?dev=level&file=<name>&room=<id>`): loads `src/dev/levels/<name>.json`
  through `import.meta.glob` and checks rooms and spawn with the shared schemas (zod is not a
  client dependency). Only `sample-medium.json` (M1-7K2Q-X9MP) and `sample-hard.json`
  (H1-7K2Q-X9MP) are committed.
- The clock pendulum is static; T4 marks the swing as optional.

## Consequences

- Textures are identical on every machine, so visual baselines stay stable.
- Generated levels changed (red armchair), so the golden hashes were refreshed. The fixture
  house has no red armchair and did not change.
- New prefabs must pass the recipe test (footprint, height, bottom and triangle count) before
  they can merge.
