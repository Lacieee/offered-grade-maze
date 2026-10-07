# Checkpoint 06 — Client prefab geometry and room visuals

**Product:** Offered Grade Maze — Release 1.0
**Track:** A (engine) · **Planned dates:** Mon 26 Oct – Fri 30 Oct 2026
**Depends on:** CP03, CP05 (prefab catalogue in `@ogm/shared`) · **Unlocks:** CP08

---

## 1. Goal

Turn `FurnitureDTO`s into recognisable low-poly 3D furniture, built entirely in code from primitives (no model files), so every room looks like a real, distinct home. Make signature landmarks unmistakable and keep each room within the draw-call budget that the portal renderer depends on.

## 2. Standing rules

Same as CP01 section 2 (`AGENTS.md`). Visual style: simple stylised low-poly, flat or vertex colours, no photorealism, no external textures or models (all procedural). Performance reference: MacBook Pro M1 Max.

## 3. Scope

**In scope:** a geometry recipe per catalogue prefab and variant; procedural canvas textures (paintings, floors); signature visuals; lamp emissive parts; merged per-room geometry; a dev prefab gallery; updating the room builder to use prefabs.

**Out of scope:** the goal object (CP09), animations other than the clock pendulum (optional), audio.

## 4. Requirements

### T1 — Prefab recipe system (`src/engine/prefabs/`)

1. One file per prefab family, registering `build(item: FurnitureDTO, meta: PrefabMeta): PrefabParts`. `PrefabParts` = lists of `BufferGeometry` grouped by material kind: `solid` (vertex-coloured Lambert), `emissive` (lamp shades, aquarium water, clock face) and `textured` (paintings).
2. Geometry is built in the item's local space: footprint centred at the origin, front facing local +Z, floor at y = 0. The footprint size comes from `meta.footprint[item.variant]` × 0.25 m and must match within 2 cm (the collider uses the footprint). Height comes from `meta.height`.
3. Primitives only: boxes, cylinders (6–12 segments), lathe and extrude shapes; target 50–600 triangles per item.
4. Colours: `item.colors` in the order the recipe documents (for example `sofa_3seat`: [upholstery, legs]). Write colours into vertex colour attributes so items can merge.
5. Variants change proportions or details (cushion count, door count on a wardrobe), not the footprint rules.
6. Placement: translate to (`x`, 0, `z`), rotate `rot × 90°` about Y. `wallHung` items take their y from the recipe (paintings centred at 1.5 m, cabinets bottom at 1.5 m, clocks at 1.9 m) and sit flush against the wall.
7. Prefabs with `meta.light` include a small emissive bulb or shade part where the `LightDTO` is.

### T2 — Room merge and budget

1. The room builder merges all `solid` parts of a room into one mesh, all `emissive` parts into one, and textured parts into one mesh per texture. Walls, floor and ceiling stay as in CP02 (they may also merge).
2. Budget per room: ≤ 60 draw calls including walls, portal meshes and casings; ≤ 60 000 triangles.
3. Colliders from furniture still use the catalogue footprint (CP02 T4), not the visual mesh.

### T3 — Procedural textures (`src/engine/prefabs/textures/`)

1. **Paintings:** `CanvasTexture` 256×192 generated from `params.pattern` (`stripes`, `circles`, `waves`, `grid`, `checks`), `params.seed` and `colors` (frame, primary, secondary), using a small seeded PRNG on the client. The same params always produce the same picture. Add a frame mesh around the canvas.
2. **Floors:** wood (planks with subtle tone variation), tile (grid lines), carpet (fine noise) as 512×512 tileable canvas textures tinted by `palette.floor`, repeat 1 per metre. One texture per floor kind per palette colour, cached.
3. Textures are generated once per unique parameter set and cached; dispose them with the room.

### T4 — Signature landmarks

Each signature must read as "the one special thing in this room" from the doorway:

| Prefab | Visual |
| --- | --- |
| `sig_painting` | large framed canvas (1.25 × 1.0 m) with a bold two-colour pattern |
| `sig_grandfather_clock` | tall wooden clock with an emissive face; optional swinging pendulum (cheap rotation, 1 s period) |
| `sig_red_armchair` | wing-back armchair in strong red (`colors[0]`) with contrasting legs |
| `sig_aquarium` | glass tank on a cabinet; emissive teal water and 3–5 simple fish shapes |
| `sig_giant_plant` | 2.1 m tall plant in a large pot, layered leaf clusters |
| `sig_large_globe` | 1.4 m floor globe on a stand, two-colour continents pattern |

### T5 — Dev prefab gallery

`/?dev=prefabs`: all catalogue prefabs and variants laid out on a grid with labels (DOM overlay), two colour sets each, plus a toggle for footprint outlines (to check visual vs collider size). Free-fly camera (WASD + mouse).

### T6 — Fixture house refresh

The CP02 fixture house (now using real prefab ids after CP05) renders with full furniture and stays portal-correct. Update the CP03 visual baselines in the same PR.

## 5. Acceptance criteria

- [ ] Every catalogue prefab and variant renders in the gallery; footprint outlines match the visual base within 2 cm (screenshot in PR).
- [ ] Each of 20 generated rooms (5 seeds × 4 room types, dumped via `pnpm gen dump --json` and loaded with `/?dev=level&file=…`) renders within ≤ 60 draw calls and ≤ 60 000 triangles.
- [ ] The same painting params render identical pixels across reloads (screenshot hash test in Playwright).
- [ ] Human review in the PR: each room type is recognisable from a screenshot with no labels; each signature is spotted from the doorway.
- [ ] Twin rooms from a Hard seed look identical except for the signature (side-by-side screenshots).
- [ ] Portal scene through three aligned furnished rooms keeps ≥ 60 FPS (p95 ≤ 16.7 ms) on the M1 Max in Chrome and Safari.
- [ ] Updated visual baselines committed; no shader recompiles when entering a new furnished room (CP03 criterion still holds).

> Implementation note: add a dev-only `/?dev=level&file=<path>` loader that reads a dumped level JSON from `src/dev/levels/` (git-ignored except two committed samples). It lets the client team work with generated houses before the API (CP07) exists, without importing the generator.
