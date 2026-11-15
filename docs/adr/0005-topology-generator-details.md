# ADR-0005: Topology generator details

- **Status:** accepted
- **Date:** 2026-10-08
- **Checkpoint / task:** CP04 (T1–T9)

## Context

CP04 specifies the topology generator closely (`docs/checkpoints/CP04-topology-generator.md`).
Implementing it raised points the checkpoint leaves open, one conflict with PD9, and one
acceptance criterion that the literal algorithm does not meet:

- A plain implementation of T3 failed the asymmetric-share range (V9) far too often:
  **70 % of easy levels needed a retry** (target < 2 %), 14 % of medium levels and 1.4 % of
  hard ones. Easy averaged 30 % one-way links against a 0–25 % range.
- Tools such as the CLI and tests need Node crypto and timers, which the determinism rule bans
  in `packages/generator/**`.

## Decision

### 1. PD9 in the generator

- Sealing (T3 step 7) picks only free slots that are **not** the arrival point of any link;
  every later step skips sealed doors as arrival doors. This replaces "a sealed door is
  preferably an arrival door".
- At most one sealed door per room, so no room is mostly closed doors.
- The validator's V5 rejects any link into a sealed door.

### 2. Exact special counts

Self-links, sealed doors and long back links (target depth ≤ source depth − 3) are created
only in step 7, so each count is exactly the drawn value:

- reciprocation (step 8) skips self-links;
- pairing (step 9) joins slots of different rooms at most one layer apart;
- step 10 sends back links only 1 or 2 layers back.

Open-ended ranges (hard `longBackLinks` 4–99) draw from min … min + 3.

### 3. Lower-variance random decisions

Reciprocation (step 8) and pairing (step 9) use **systematic sampling**: a running total
starting at a random 0–999 adds `reciprocalPerMille` per decision and says yes each time it
passes 1000. Each decision still has exactly the table's probability, but over n decisions
the number of yeses is always ⌊n·p⌋ or ⌈n·p⌉, without binomial noise. On houses this small,
that noise alone pushed many medium and hard levels outside their range.

Pairing visits the most constrained free slot first (fewest possible partners) and picks the
partner with the fewest partners of its own, which leaves fewer slots without any partner.

### 4. Steering toward the asymmetric-share range

The free choices the checkpoint leaves open are steered per difficulty (`STEERING` in
`src/topology/steps.ts`):

| Steering                                                                 | easy | medium | hard |
| ------------------------------------------------------------------------ | ---- | ------ | ---- |
| Specials go to the free slots least able to pair (and not arrival doors) | yes  | yes    | no   |
| Reciprocity-friendly construction (below)                                | yes  | no     | no   |

Reciprocity-friendly construction (easy):

- Before the capacity rebalance, a deterministic local search moves decoys between layers
  1…L−1 and changes door counts within the table's range (hallways keep their +1) to minimise
  the estimated share of forced one-way links. The estimate covers funnels (more rooms at
  layer k than layer k+1 can answer), start and goal doors that their single neighbour layer
  cannot pair, odd slot totals, and the expected reciprocation refusals.
- Mandatory links leave arrival doors free when they can (so step 8 can answer them).
- Coverage prefers parents without a forward link yet, then "most free slots, ties by id"
  (fewer progress links are needed).
- Progress links prefer target rooms that still have an unused, free door.

### 5. Other choices

- **Order of drawing:** each step keeps its own stream `topology#<attempt>/<step>`, but door
  counts (step 5) are drawn before depths (step 4) because layer capacity needs them, and the
  twin rooms (step 3) are chosen before types (step 2) so all six types appear among the
  non-twin rooms. Twins copy spine rooms other than the goal; originals are distinct.
- **Spawn:** the start-room centre, facing the wall of door `d0` squarely (yaw 0, π, ±π/2).
  The yaw is an exact constant, so no trigonometry is needed in the generator. The door is
  at most about 50° off-centre, inside the default horizontal field of view (about 107° at
  16:9).
- **Level hash:** SHA-256 in plain TypeScript (32-bit integer operations) instead of Node
  `crypto`, so the generator needs no Node API and no lint exception. Tests check it against
  the NIST vectors and Node `crypto`.
- **CLI and tests:** `src/cli/**` and `*.test.ts` may use Node crypto, `Date` and
  `performance` (ESLint override); they are not generation logic. The CLI is excluded from
  coverage. `pnpm gen` builds the generator (Turborepo cache) and runs `dist/cli/main.js`.
- **Shortest path:** BFS order, then door id, first discovery wins (CP04 T7). The
  architecture's "ties by room id" is superseded by the checkpoint.

## Consequences

10 000-seed sweeps (`pnpm gen sweep`, Linux container, Node 22):

|                  | easy   | medium | hard   |
| ---------------- | ------ | ------ | ------ |
| invalid levels   | 0      | 0      | 0      |
| retried levels   | 1.18 % | 0.54 % | 0.09 % |
| p95 ms per level | 1.4    | 2.1    | 3.7    |

- The asymmetric share is no longer a pure function of the reciprocal probability: the
  steering rules are part of the generator's output and fall under the golden seeds.
- Easy houses lean toward 2-door rooms and fuller first and last layers.
- Changing any steering rule changes output; before v1.0.0 that means regenerating the golden
  hashes, after v1.0.0 a `GENERATOR_VERSION` bump.

## Alternatives considered

- **Widen the easy range (for example 0–35 %).** Simplest, but the table is the product
  owner's to tune at G2. Kept as the fallback if the steering ever proves too rigid.
- **Rejection only (retry until the metrics fit).** Correct, but 70 % of easy levels would
  need a retry, against the < 2 % target.
- **Rewire links after construction to fix the share.** Risks breaking the construction
  invariants that make the house solvable by construction.
- **Node `crypto` for the hash.** Allowed by CP04, but needs a lint exception in generation
  code and ties the generator to Node.
