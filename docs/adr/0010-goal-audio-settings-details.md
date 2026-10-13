# ADR-0010: Goal, audio and settings details

- **Status:** accepted
- **Date:** 2026-10-13
- **Checkpoint / task:** CP09 (T1–T7)

## Context

CP09 adds the Offered Grade object, all game sound and the settings screen. Building and
testing them raised points the checkpoint leaves open, and a few places where following its
text literally would cost the player or the tests something.

## Decision

### 1. "The brightest object": how it is measured

T1.5 asks for screenshots from each door of three goal rooms that show the goal as the
brightest object. The renderer writes 8-bit sRGB, and in every generated room the ceiling
around the lamp already clips to white. Measured naively, the ceiling would always be the
brightest thing on screen.

`e2e/tests/brightness.ts` therefore measures objects, not room surfaces:

- **Objects only.** A second frame draws walls, floor, ceiling and door frames black (the
  `maskSurfaces` test hook). Pixels that stay lit belong to objects. The halo is additive,
  so it stays visible in that frame too.
- **Blocks scaled to the goal.** Brightness is the mean luminance (Rec. 709) of square
  blocks a third of the halo's projected radius (4–12 px), so a far goal is compared at its
  own size.
- **Where the goal is.** The goal's block is the brightest block within half a halo radius
  of the goal's projection (the `goalScreen` hook). Through portals, `goalScreen` uses the
  same source position as the hum.
- **Visibility.** `goalScreen` reports the goal only when the projection lies inside the
  doorway that shows the goal room and no furniture in the current room or the goal room
  is in the way (ray cast to the diploma).
- **Ties at white.** Lamps and the goal's core both clip to white, and two saturated blocks
  differ by a few levels of noise. Differences of 3 levels or less (of 255) count as equal.

### 2. A hot core in addition to the halo (addition to T1.4)

The 1.4 m halo of T1.4 alone did not outshine a lit lampshade or a white bed sheet under a
lamp, because its soft falloff leaves only a small centre near full strength. A second
additive sprite, 0.6 m wide and nearly white, sits at the halo's centre and is fully opaque
out to 35 % of its radius. Through a doorway the goal now reads as the brightest point of the
frame. There is still no post-processing bloom.

### 3. Textures and sparkles are deterministic

- The halo, core and sparkle textures are generated `DataTexture`s rather than canvas
  textures. They look the same, and they work in unit tests without a DOM.
- The 20 sparkles follow fixed golden-angle orbits instead of random ones, so every render
  pass and every test sees the same picture.

### 4. The goal's clock is the engine's animation clock

T1.3 drives the motion from "seconds since the start of play". The goal uses `ambientTime`,
the clock that already drives the fish and the TV static. It advances with every rendered
frame and is shared by all render passes of a frame, which is what the portal identity check
needs. In test-hook mode it stands still (0 unless a test sets it), so screenshots repeat.
Players cannot see the difference: the motion is periodic.

### 5. Head bob is off in test-hook mode

The 1 cm head bob (T3.5) follows the footstep phase. Scripted walks would otherwise shift
every test screenshot by a different amount. The setting still applies in normal play.

### 6. The result screen waits for the pickup animation

At the pickup the timer stops, input freezes and the stinger plays (T1.6, T6). The
completion request runs at the same time. The result screen appears only after the 0.6 s
fly-and-fade animation has finished, even if the server answered first.

### 7. The language stays in `ogm.lang`

T7 lists the language among the settings. CP08 already stores it in `ogm.lang`, and the
title screen's EN | HU toggle uses it. The settings screen edits the same store. `ogm.settings`
(version 1) holds everything else, so a broken settings entry never resets the language.

### 8. One audio context per game

T2.1 asks for one `AudioContext`, created in the click that starts the game. The context is
created in the Ready click of each game and closed when the game ends or is abandoned, so
only one exists at a time. Browsers limit the number of live contexts, and a fresh context
starts with a clean graph.

### 9. Audio details

- Volume sliders map to gain as `(percent / 100)²`, so the steps sound even.
- The reverb's 1.8 s impulse response is deterministic noise (a fixed seed). It decays to
  −60 dB and fades in over 4 ms, so it never clicks.
- In dev builds, `window.__ogmAudio` reports the context state, the footstep and stinger
  counts and whether the hum is on. The sound smoke test (`e2e/tests/sound.spec.ts`) uses it.

## Consequences

- The brightness test depends on two test hooks, `maskSurfaces` and `goalScreen`. Both exist
  only in dev and test builds.
- A clear view of the whole diploma through two doorways (portal level 2) is rare in
  generated houses. A search near every door that leads towards the goal room, in 27 houses,
  found level-1 views in all of them but level-2 views in only 2 (`view-M1-0000-0007`,
  `view-M1-0000-0002`). Either the furniture of the goal room or the middle room stands in
  the way (twice a globe on a stand), or the middle room's doors do not line up. The goal
  test pins the spots it found (`VIEWS` in `goal.spec.ts`). The generator could keep a clear
  sight line from some doors to the goal later. That changes generator output and needs its
  own task.
