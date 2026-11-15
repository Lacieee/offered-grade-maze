# ADR-0002: Room rendering details in the CP02 engine

- **Status:** accepted
- **Date:** 2026-10-07
- **Checkpoint / task:** CP02-T2, CP02-T1

## Context

CP02 T2 says each wall is built from boxes (segments beside each opening plus a lintel).
In the first build, that showed a thin dark line running from every door head to the
ceiling. The cause: the hidden end face of a wall box meets the wall's front face at exactly
the same depth, so the two tie in the depth test along that edge. A T-junction where the
lintel meets the full-height segment adds the same kind of crack.

CP02 also fixes the light rig (1 hemisphere light + 4 point lights) but not how a
`LightDTO.intensity` maps to Three.js units.

## Decision

1. **Walls are built from their visible faces, not boxes.** Each wall's interior face is
   one polygon (`THREE.ShapeGeometry`) with a notch per door. Each opening adds two jamb
   quads and a head quad that run from the face to the portal plane. Same material, same
   merged draw call, same thickness (`WALL_HALF`), same jamb and head surfaces as CP02
   asks for. Only the hidden faces are gone. Casings, door panels, handles, thresholds and
   furniture stay boxes.
2. **Point lights use linear falloff** (`decay = 1`), with `POINT_LIGHT_SCALE = 8` converting
   `LightDTO.intensity` to Three.js intensity. Physical falloff (`decay = 2`) blew out the
   2.5 m hallway near the lamp while leaving the 7 × 7.5 m living room's corners dark,
   because there is no tone mapping (CP02 T1.6).
3. **`@ogm/shared` resolves to its TypeScript source in Vite and Vitest** (alias in
   `packages/client/vite.config.ts`), so `pnpm --filter @ogm/client dev` works without a
   prior build of `shared`. Type checking still uses the built declarations.

## Consequences

- No seams at door heads; fewer triangles per room (about 170–320 in the fixtures).
- Rooms with very different sizes look similarly bright. Revisit the scale when real
  furniture and lamps arrive in CP06.
- The wall geometry is in `rooms/buildRoom.ts` (`wallGeometries`); the collision layout
  stays in the pure `rooms/layout.ts`.

## Alternatives considered

- **Boxes with `polygonOffset`:** hides the line at some angles but not all, and couples
  every wall material to a depth bias.
- **Physical falloff with tone mapping:** CP02 requires no tone mapping.
