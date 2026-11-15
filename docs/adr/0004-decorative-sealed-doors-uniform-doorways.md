# ADR-0004: Decorative sealed doors and uniform doorways (G1 feedback)

- **Status:** accepted
- **Date:** 2026-10-08
- **Checkpoint / task:** CP03 (G1 playtest), affects CP02 fixtures, CP04, CP06

## Context

The first G1 walk-through found two problems:

1. **Sealed arrival doors.** The fixture link `r03.d0 → r01.d3` arrived at a sealed door. The
   portal showed the back of the closed panel (a flat dark grey "door" you could walk
   through), the player arrived inside the panel, and the panel collider pushed the player
   out of the room into the void.
2. **Visible doorway seams.** Each doorway is a 0.3 m tunnel: one half belongs to each room.
   The halves used each room's wall, trim and floor colours under each room's lights, so the
   doorway visibly changed colour while walking through.

## Decision

1. **PD9 — sealed doors are decorative.** No link may arrive at a sealed door. One-way
   passages come from asymmetric links only (a door whose reverse leads elsewhere).
   - Fixture: `r03.d0 → r01.d2` (was `r01.d3`). Going back through the kitchen's d2 leads
     to the bedroom, so bathroom → kitchen is still a one-way trip.
   - Engine: `World.enterableTarget` refuses a link into a sealed door. Such a doorway is
     closed by a collider and its portal shows the fallback colour, so bad data can never
     put the player inside a panel again.
   - CP04: sealing must pick doors that are not the arrival point of any link, and the
     validator's structural check rejects a link into a sealed door.
2. **PD10 — uniform doorways.** Every doorway uses the same frame colour (casing, jambs,
   head) and a doorstep (a 1.2 cm oak strip across the whole tunnel with a 4 cm lip into the
   room). These parts are **unlit** (`MeshBasicMaterial`) with door-relative flat shading
   baked into vertex colours (top 1.0, faces into/out of the room 0.92, jamb faces 0.80,
   underside 0.62), so both halves of a doorway are identical whatever each room's lights.
   A unit test compares the tunnel geometry and colours of six doors in door-local
   coordinates. Sealed door panels use a fixed door colour.

## Consequences

- No more arriving inside doors or being pushed out of rooms.
- Crossing a doorway shows no colour change; the 7-frame crossing test's change at the
  crossing frame dropped from 6.88 to 5.13 (the other frames average 8.09).
- `palette.trim` is no longer used for doors; CP06 may use it for skirting boards.
- Looking back after a crossing still shows wherever the arrival door leads. That is the
  intended asymmetric mechanic (CP03 T5) and is unchanged.

## Alternatives considered

- **Removing sealed doors entirely:** loses a cheap source of visual variety and a
  difficulty knob.
- **Hiding the arrival panel in portal passes:** fixes the view but keeps the confusing
  "walk through a closed door" experience the playtest rejected.
- **Delaying the new room by a step at crossings:** hides nothing that uniform doorways do
  not already hide, and adds a visible lag.
