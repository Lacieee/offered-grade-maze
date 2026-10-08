# ADR-0006: Furnishing details

- **Status:** accepted
- **Date:** 2026-10-08
- **Checkpoint / task:** CP05 (T1–T8)

## Context

CP05 specifies the furniture placer, reserved zones, signatures, twins and checks V7, V8 and
V11. Building it raised points the checkpoint leaves open, and two acceptance criteria that
the CP04 room sizes could not meet:

- **Missing required items.** With CP04's sizes and door counts, 3.3 % (medium) to 3.9 % (hard) of rooms missed a required item, almost all of them small bathrooms with 3–4 doors. The target is at most 0.1 %.
- **Implausible plans.** Nightstands stood across the room from the bed, and stoves away from the counter.

## Decision

### 1. Interpretations of the placement rules

- **Clearance zones.** An item's _footprint_ must avoid:
  - blocking items;
  - reserved zones;
  - other items' front clearances.

  Its _front clearance_ must avoid blocking items only: it may overlap reserved zones and other clearances. Both are free floor that must stay free; CP05 T4 step 5 allows overlapping clearances.

- **Door clearance on the grid.** The 1.4 × 1.2 m door clearance covers every cell it touches: 6 × 5 cells (1.5 × 1.25 m) centred on the door. The spawn zone (4 × 4 cells) and the goal zone (6 × 6 cells) sit at the room centre.
- **Walkability.**
  - Blocking items and the wall ring are inflated by one cell (8-neighbourhood).
  - Every free cell of every zone must be reachable (4-connected) from the first zone.
  - Every zone needs at least one free cell.
- **Wall-hung items.**
  - `PrefabMeta` gains an optional `mountY` (centre height, m). The client needs it to hang the item; the placer needs it to keep the item clear of tall furniture.
  - A hung item needs free wall: no door opening ± 0.1 m (cells c − 3 … c + 2), no other hung item, and no blocking item on that wall whose top reaches its bottom edge.
  - The reverse also holds: tall furniture may not stand under a hung item.
- **Bathtub or shower.** The bathroom draws one of the two and falls back to the other when the first does not fit.
- **Furnishing streams** do not include the attempt number (`room:<tempId>:furnish`), as CP05 specifies.

### 2. Room sizes and door counts (changes CP04 output)

- **Size grows with the door count.** A room's footprint lower bound rises through its type's range, by a third of the span per door above one. The goal room counts one extra door for its goal zone. A 4-door bathroom is therefore 4 × 4 m, and a 2-door one may be 3 × 3 m.
- **Bathrooms have at most 3 doors** (`RoomTypeParams.maxDoors`). With four door clearances, a 3–4 m bathroom often has no wall left for a bathtub or a shower. The cap applies to:
  - the door-count draw;
  - the layer-capacity rebalance;
  - the easy steering optimiser.

The topology metrics are unchanged (sweeps below).

### 3. Plausibility

Some items first try positions next to an already placed partner (`NEAR` in `src/furnish/furnish.ts`), then fall back to the normal shuffled search:

- nightstand and side table: beside the bed or sofa;
- stove and fridge: beside the counter run;
- filing cabinet: beside the desk;
- coffee table: within 1 m of the sofa.

### 4. Identity

- **Palettes.** Six palettes per room type, with walls pairwise ≥ 40 apart in some RGB channel (unit test). Rooms of one type take unused palettes while any remain (temporary-id order, each room's own palette stream).
- **Signatures.** Drawn from the `identity` stream in furnishing order, unique by (prefab, colours, painting pattern + seed). A signature that does not fit is replaced by another prefab.
- **Twins.**
  - A twin replays its original's non-signature items with the same ids.
  - Its own signature first avoids the original's signature prefab, so the landmark looks different, not just recoloured.
  - The twin's signature takes the original signature's id, so ids stay `f00…` without gaps.

### 5. Lights

The lights are, in order:

1. the ceiling light at (0, 2.6, 0);
2. one `lamp` light per floor lamp (at most 2);
3. the goal light (`#ffcf6b`, 1.2) in the goal room only.

V11 checks the count (≤ 4, also enforced by the schema) and the goal light.

### 6. Fixture house

`pnpm gen fixtures --write` furnishes the client's CP02 fixture house with the same code:

- seed label `FIXTURE`;
- every room gets a spawn zone, because the dev scene spawns in each room's centre;
- r05 is the goal room, and its goal moves to the room centre.

Doors, links, sizes, palettes and ceiling lights stay as authored. A generator test runs V7, V8 and V11 on the fixture files. The Playwright visual baselines were regenerated.

## Consequences

10 000-seed sweeps (`pnpm gen sweep`, Linux container, Node 22):

|                               | easy    | medium  | hard    |
| ----------------------------- | ------- | ------- | ------- |
| invalid levels (V1–V11)       | 0       | 0       | 0       |
| retried levels                | 1.18 %  | 0.61 %  | 0.13 %  |
| rooms missing a required item | 0.032 % | 0.052 % | 0.041 % |
| p95 ms per level              | 6.8     | 9.8     | 14.4    |

All the remaining misses are washbasins in the smallest bathrooms.

The golden hashes are regenerated: furniture, palettes and lights are new, and room sizes and door counts changed (section 2).

Generation now takes about 10 ms per level, so the 3 000-seed property test runs about 2 minutes under coverage. It is split into one file per difficulty, so Vitest can run them in parallel.

## Alternatives considered

- **Treat a missing required item as a failed attempt.** Retries would rise above 2 % on hard.
- **Larger bathrooms in the type table.** This changes the CP04 table, which the product owner tunes at G2.
- **Place doors with furniture in mind** (doors near corners in small rooms). More complex, and it changes door distributions everywhere.
