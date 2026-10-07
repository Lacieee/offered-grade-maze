# Checkpoint 05 — Room furnishing and identity (generator)

**Product:** Offered Grade Maze — Release 1.0
**Track:** B (platform) · **Planned dates:** Thu 22 Oct – Wed 28 Oct 2026
**Depends on:** CP04 · **Unlocks:** CP06 (client prefab visuals), CP07 (API)

---

## 1. Goal

Fill every generated room with procedural, deterministic furniture that never blocks a door or the path to the goal. Give every room a recognisable identity (palette plus a unique signature landmark) and implement twin rooms. The server decides **what goes where**; the client (CP06) decides **how it looks**. Because the client and the validator both depend on prefab metadata, the prefab catalogue lives in `@ogm/shared`.

## 2. Standing rules

Same as CP01 section 2 (`AGENTS.md`). The generator stays deterministic: integer grid maths, quarter-turn rotations only, randomness from `rngFor(seed, 'room:<tempId>:furnish')`, `'room:<tempId>:palette'` and `'identity'`. Use the **pre-shuffle temporary id** in labels, so furnishing does not depend on the final id permutation.

## 3. Scope

**In scope:** prefab catalogue (metadata), palettes, placement algorithm, reserved zones (doors, spawn, goal), walkability check, lights from lamps, signatures, twins' furniture copy, validator checks V7 and V8, golden hash refresh, CLI dump update (furniture in the SVG per-room view).

**Out of scope:** 3D geometry of prefabs (CP06), HTTP (CP07).

## 4. Requirements

### T1 — Prefab catalogue (`packages/shared/src/prefabs/catalog.ts`)

```ts
export type Anchor = 'wall' | 'corner' | 'center' | 'wallHung' | 'floorFlat';
export interface PrefabMeta {
  id: PrefabId;
  footprint: [w: number, d: number][];  // grid units (0.25 m) per variant, unrotated; the front faces local +Z
  height: number;                       // metres, for the client and for wallHung placement
  anchors: Anchor[];                    // allowed anchors
  frontClearance: number;               // grid units of free floor required in front (+Z side)
  blocks: boolean;                      // false for floorFlat and wallHung
  colorSlots: number;                   // how many colours the client expects in FurnitureDTO.colors
  light?: { y: number; color: string; intensity: number }; // lamp prefabs
  roomTypes: RoomType[] | 'any';
  role: 'required' | 'optional' | 'decor' | 'signature';
}
```

Ship this catalogue (sizes in grid units = metres × 4). The client builds matching geometry in CP06. Adjust a size only with a note in the PR.

| id | footprint(s) w×d | h (m) | anchors | front clr | blocks | colours | role / room types |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sofa_3seat` | 8×4, 7×4 | 0.85 | wall | 3 | yes | 2 | required living |
| `coffee_table` | 4×2, 3×3 | 0.45 | center | 1 | yes | 1 | required living |
| `tv_unit` | 6×2, 7×2 | 1.1 | wall | 4 | yes | 2 | required living |
| `armchair` | 4×4 | 0.9 | wall, corner, center | 2 | yes | 2 | optional living, study |
| `bookshelf` | 4×2, 6×2 | 1.9 | wall | 2 | yes | 2 | optional living; required study |
| `floor_lamp` | 2×2 | 1.6 | corner | 0 | yes | 2 | optional any; light (y 1.5, #ffd9a0, 0.8) |
| `side_table` | 2×2 | 0.55 | wall, corner | 0 | yes | 1 | optional living, bedroom |
| `rug_large` | 10×7, 8×6 | 0.01 | floorFlat | 0 | no | 2 | optional living |
| `counter_run` | 8×3, 10×3, 12×3 | 0.92 | wall | 4 | yes | 3 | required kitchen (includes sink) |
| `stove` | 3×3 | 0.92 | wall | 4 | yes | 2 | required kitchen |
| `fridge` | 3×3 | 1.9 | wall, corner | 4 | yes | 1 | required kitchen |
| `dining_set` | 8×6, 6×6 | 0.95 | center | 1 | yes | 2 | optional kitchen (table with chairs) |
| `wall_cabinet` | 6×2 | 0.7 | wallHung | 0 | no | 2 | optional kitchen |
| `bin` | 1×1 | 0.6 | corner | 0 | yes | 1 | optional kitchen |
| `bed_double` | 7×8, 6×8 | 0.6 | wall | 2 | yes | 3 | required bedroom (headboard to wall) |
| `wardrobe` | 8×3, 6×3 | 2.0 | wall | 3 | yes | 2 | required bedroom |
| `nightstand` | 2×2 | 0.55 | wall | 0 | yes | 1 | required bedroom |
| `dresser` | 5×2 | 0.85 | wall | 3 | yes | 2 | optional bedroom |
| `mirror_standing` | 2×1 | 1.7 | wall | 1 | yes | 1 | optional bedroom |
| `rug_medium` | 8×6, 6×4 | 0.01 | floorFlat | 0 | no | 2 | optional bedroom, study |
| `bathtub` | 7×3 | 0.6 | wall, corner | 3 | yes | 2 | required bathroom (or `shower`) |
| `shower` | 4×4 | 2.0 | corner | 3 | yes | 2 | required bathroom (or `bathtub`) |
| `toilet` | 2×3 | 0.8 | wall | 3 | yes | 1 | required bathroom |
| `washbasin` | 3×2 | 0.9 | wall | 3 | yes | 2 | required bathroom |
| `towel_rack` | 3×1 | 1.1 | wallHung | 0 | no | 2 | optional bathroom |
| `laundry_basket` | 2×2 | 0.55 | corner | 0 | yes | 1 | optional bathroom |
| `mirror_wall` | 3×1 | 1.2 | wallHung | 0 | no | 1 | optional bathroom, hallway |
| `runner_rug` | 4×12, 4×16, 4×20 | 0.01 | floorFlat | 0 | no | 2 | required hallway |
| `coat_rack` | 2×2 | 1.8 | wall, corner | 1 | yes | 1 | required hallway |
| `shoe_cabinet` | 4×2 | 0.9 | wall | 2 | yes | 2 | optional hallway |
| `console_table` | 4×2 | 0.8 | wall | 2 | yes | 2 | optional hallway |
| `umbrella_stand` | 1×1 | 0.6 | corner | 0 | yes | 1 | optional hallway |
| `desk_set` | 5×5 | 0.75 | wall | 2 | yes | 3 | required study (desk + chair) |
| `filing_cabinet` | 2×3 | 1.3 | wall | 2 | yes | 1 | optional study |
| `globe` | 2×2 | 1.0 | corner, center | 0 | yes | 2 | optional study |
| `painting` | 4×1, 3×1 | 0.8 | wallHung | 0 | no | 3 | decor any (`params.pattern`, `params.seed`) |
| `wall_clock` | 2×1 | 0.4 | wallHung | 0 | no | 2 | decor any |
| `plant_small` | 1×1 | 0.5 | corner | 0 | yes | 2 | decor any |
| `plant_large` | 2×2 | 1.4 | corner | 0 | yes | 2 | decor any |
| `sig_painting` | 5×1 | 1.0 | wallHung | 0 | no | 2 | signature any (`params.pattern`, `params.seed`) |
| `sig_grandfather_clock` | 2×2 | 2.0 | wall, corner | 1 | yes | 2 | signature any |
| `sig_red_armchair` | 4×4 | 0.95 | corner, center | 2 | yes | 2 | signature any |
| `sig_aquarium` | 5×2 | 1.3 | wall | 2 | yes | 2 | signature any |
| `sig_giant_plant` | 3×3 | 2.1 | corner | 0 | yes | 2 | signature any |
| `sig_large_globe` | 3×3 | 1.4 | corner, center | 0 | yes | 2 | signature any |

Narrow `FurnitureDTO.prefab` in the Zod schema to the catalogue's id union. Painting `params.pattern` ∈ `stripes | circles | waves | grid | checks`; `params.seed` is an integer 0–9999.

### T2 — Palettes (`generator/src/identity/palettes.ts`)

At least 4 palettes per room type, each `{ wall, floor, trim, ceiling }` hex. Tone: soft, slightly desaturated domestic colours with one uncanny touch (for example a too-saturated trim). Two palettes of the same type must differ visibly: wall colours differ by ≥ 40 in at least one RGB channel (unit test). Rooms of the same type get different palettes when enough exist, except twins.

### T3 — Reserved zones (grid units, inside the footprint)

- **Door clearance:** for each door, a rectangle 1.4 m wide (centred on the door) × 1.2 m deep from the wall into the room.
- **Spawn zone** (start room): 4×4 cells centred at the room centre. Spawn = room centre, yaw facing the start room's door `d0`.
- **Goal zone** (goal room): 6×6 cells centred at the room centre; goal position `(0, 1.2, 0)`.
- Reserved zones admit only `floorFlat` items (rugs) and `wallHung` items.

### T4 — Placement algorithm (`generator/src/furnish/`)

Per room, using its own PRNG stream:

1. Occupancy grid of `w × d` cells (0.25 m). Mark reserved zones.
2. Pick required items for the type (bathroom picks one of `bathtub`/`shower`). Then pick optional items, each with probability 600 ‰ (max 4). Then decor: 1–3 items. Then the signature item (T5).
3. Placement order: required → signature → optional → decor; within each group, larger footprint first.
4. Candidate positions per anchor:
   - `wall`: along each wall segment (excluding door openings ± 0.1 m), back against the wall, front facing into the room;
   - `corner`: the four corners, facing the room diagonal (rounded to a quarter turn);
   - `center`: cells whose footprint stays ≥ 1.0 m from every wall;
   - `wallHung`: wall positions at a height suitable for the item (paintings centred at 1.5 m); they need free wall length, not floor;
   - `floorFlat`: anywhere not under a blocking item; rugs may lie in reserved zones.
   Shuffle candidates with the room PRNG; try up to 200 candidates per item.
5. A candidate is valid if its footprint plus front clearance are free of blocking items and reserved zones (front clearance may overlap other clearances) and it lies inside the footprint.
6. **Walkability after each blocking item:** build the free grid, inflate all blocking items and walls by 1 cell (0.25 m), then flood-fill (4-connected) from the spawn or goal zone, or from the first door zone. Every door clearance zone, the spawn zone and the goal zone must be in one connected component. If not, reject the candidate. This guarantees corridors ≥ 0.75 m wide for a 0.6 m player.
7. A required item that cannot be placed is skipped and counted in `metrics.missingRequired`.
8. Output `FurnitureDTO`s: `x`, `z` = footprint centre in metres; `rot` 0–3; `variant`; `colors` (count = `colorSlots`, from the room palette and a per-type accent list); ids `f00…` in placement order.

### T5 — Signatures and twins (`generator/src/identity/`)

1. Every room gets exactly one item with `signature: true`. Uniqueness across the house is by the triple (prefab, colours, `params.pattern` + `params.seed`), drawn from the `identity` stream. No two rooms may share a triple (validator check).
2. **Twins** (from CP04 step 3): after the original is furnished, the twin copies its palette and every non-signature `FurnitureDTO` exactly (same positions, rotations, variants, colours). It then gets its own unique signature, placed with the normal algorithm. Its door positions already match the original (CP04). If the twin's signature cannot be placed, retry with another signature prefab.

### T6 — Lights

`LightDTO` order: `ceiling` at (0, 2.6, 0) first; then one `lamp` per prefab with `light` (at item position, y from meta), max 2 lamps; the goal room reserves one slot for `{ kind: 'goal', x: 0, y: 1.2, z: 0, color: '#ffcf6b', intensity: 1.2 }`. Never exceed 4 lights.

### T7 — Validator additions

| ID | Check |
| --- | --- |
| V7 | furniture inside the footprint; no overlap between blocking footprints; no blocking item in a reserved zone; `colors.length === colorSlots`; prefab allowed for the room type; exactly one signature per room; signature triples unique |
| V8 | walkability as in T4 step 6, recomputed from the final `RoomDTO` (independent code from the placer) |
| V11 | light count ≤ 4 and goal light present only in the goal room |

### T8 — Golden refresh and CLI

Regenerate `test/golden.json` in this checkpoint (explain in the PR). Extend `pnpm gen dump --svg` with one small floor-plan panel per room: footprint, doors, clearance zones, item rectangles labelled by prefab id, signature in a highlight colour.

## 5. Acceptance criteria

- [ ] `pnpm gen sweep --count 10000` per difficulty: 0 invalid (V1–V11), retry rate < 2 %, `missingRequired` = 0 in ≥ 99.9 % of rooms, p95 total generation < 200 ms on the M1 Max.
- [ ] Twin test: for every twin, all non-signature furniture and palette equal the original's; the signatures differ.
- [ ] Signature uniqueness holds in 10 000 Hard houses (24 rooms each).
- [ ] Walkability negative tests: a sofa placed across a hallway, a wardrobe in a door clearance and a dining set enclosing the goal zone are each rejected by V8 or V7.
- [ ] Furniture output is deterministic: golden hashes stable across two runs and across separate processes.
- [ ] `FurnitureDTO.prefab` schema accepts only catalogue ids; the CP02 fixture house is updated to use real prefab ids (placeholder `params` sizes removed) and still validates.
- [ ] The SVG dump of a Medium seed shows furniture plans that a human reviewer finds plausible (attach to PR).
