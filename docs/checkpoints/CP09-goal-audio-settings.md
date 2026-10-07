# Checkpoint 09 — Goal object, audio and settings

**Product:** Offered Grade Maze — Release 1.0
**Track:** A (engine) · **Planned dates:** Mon 9 Nov – Thu 12 Nov 2026
**Depends on:** CP08 · **Unlocks:** CP10 · **Human gate:** **G3 Content complete — Fri 13 Nov** (together with CP10 Part A)

---

## 1. Goal

Make the Offered Grade (Megajánlott jegy) the unmistakable, glowing, floating target of the game. Give the house its sound: footsteps per floor, an uncanny ambient score, a spatial hum from the goal that can be followed through doorways, and a clearly distinct completion sound. Add the settings screen.

## 2. Standing rules

Same as CP01 section 2 (`AGENTS.md`). Product decisions apply: the goal is collected by walking into it (PD2), the timer never pauses (PD1), English default UI with Hungarian (PD3). All audio is synthesised with the Web Audio API: no audio files.

## 3. Scope

**In scope:** goal model, animation, glow and pickup sequence; audio engine; footsteps; ambient bed; spatial goal hum through the portal tree; completion stinger; head bob; settings screen with persistence.

**Out of scope:** debug view (CP10); recorded audio samples (possible later through the same interfaces).

## 4. Requirements

### T1 — Goal object (`src/engine/goal/`)

1. **Model:** procedural low-poly rolled diploma about 0.45 m long: a cream-white scroll cylinder with rolled ends, a red ribbon tied around the middle and a gold wax seal (a flat cylinder with a star relief). It replaces the CP08 placeholder.
2. **Position:** `RoomDTO.goal` (centre of the goal zone, y = 1.2 m) in the goal room's scene, so it is visible through portals like any other object.
3. **Motion** from game time `t` (seconds since the start of play, shared by all render passes in a frame): `y = 1.2 + 0.08 · sin(2π t / 3)`; yaw = `0.6 · t` rad; constant 10° tilt about X.
4. **Glow:** emissive warm gold (`#ffcf6b`) on the seal and ribbon edges; an additive camera-facing halo sprite 1.4 m wide (soft radial canvas texture); the room's `goal` light (from `LightDTO`) pulses ±15 % with the bob; 20 sparkle particles slowly orbiting within 0.6 m (Points, additive). No post-processing bloom.
5. It must stand out from the doorway: test screenshots from each door of three generated goal rooms show it as the brightest object.
6. **Pickup:** when the player's horizontal distance to the goal is < 0.9 m (and the game is `playing`): freeze input; over 0.6 s the diploma flies toward the camera, scales up and fades with a white-gold flash overlay; the completion stinger plays at the moment of pickup; then the CP08 completion flow continues (`flush` → `/complete` → result).

### T2 — Audio engine (`src/engine/audio/`)

1. One `AudioContext`, created and `resume()`d inside the click handler that starts the game (the Ready screen click), as browsers block audio before a gesture. Handle Safari's `webkitAudioContext` fallback if needed.
2. Graph: `music bus` and `sfx bus` (each a `GainNode` driven by settings) → `master gain` → soft `DynamicsCompressorNode` → destination. A shared reverb send: `ConvolverNode` with a generated 1.8 s decaying-noise impulse response.
3. Interfaces so sounds can later be replaced by samples:

```ts
interface FootstepVoice { step(floor: FloorKind, side: 'L' | 'R'): void }
interface MusicBed { start(): void; stop(): void; duck(db: number, seconds: number): void }
interface GoalVoice { setSource(position: THREE.Vector3 | null, attenuationDb: number): void; start(): void; stop(): void }
interface Stinger { play(): void }
```

4. The listener follows the camera every frame (position and orientation via `AudioListener` parameters or `setPosition`/`setOrientation` fallbacks).

### T3 — Footsteps

1. Trigger by distance travelled: the first step after 0.15 m of movement, then one step every 1.3 m (about 2.3 steps/s at 3 m/s). No new steps while speed < 0.3 m/s, so the sound stops with the player. Steps alternate L/R with ±0.15 stereo pan.
2. Synthesis per step: a filtered white-noise burst (attack 2 ms, decay 60–120 ms) plus a short low sine thump (80–120 Hz, 50 ms).
   - `wood`: band-pass around 450 Hz, Q 1.2, plus a faint hollow resonance;
   - `tile`: band-pass around 1.8 kHz, sharper attack, brighter;
   - `carpet`: low-pass 600 Hz, 6 dB quieter, longer soft decay.
3. Per-step randomisation: pitch ±6 %, gain ±2 dB, filter frequency ±10 %, so no two consecutive steps are identical.
4. Floor type comes from the current room's `RoomDTO.floor`.
5. Optional head bob, synchronised with steps: camera y offset of 1 cm amplitude per step cycle; on by default, switchable in settings.

### T4 — Ambient music bed

1. Two detuned low oscillators (for example 55 Hz and 55.4 Hz, triangle) through a slowly modulated low-pass filter; quiet filtered pink-noise room tone; and a sparse chime every 6–14 s, picked from a whole-tone scale (sine plus a soft FM partial, 3 s decay) and sent to the reverb.
2. Overall level about 24 dB below full scale; it must never mask footsteps or the goal hum.
3. Starts with the game; fades out over 2 s on the result screen.

### T5 — Spatial goal hum

1. Two soft sines (for example 220 Hz and 330 Hz) with 0.3 Hz tremolo through a `PannerNode` (`HRTF`, inverse distance, refDistance 1, rolloff 1.2).
2. Source position each frame:
   - if the goal room is the current room: the diploma's position;
   - else, search `PortalRenderer.getPortalTree()` (CP03) for a node whose room is the goal room; take the shallowest one, map the diploma position into the current room with the inverse of that node's `cameraFromRoot` chain, and attenuate by 6 dB per portal level;
   - else: silent (ramp gain to 0 over 0.5 s).
3. Result: standing in a room next to the goal room, the hum comes from the doorway that shows the goal.

### T6 — Completion stinger

A bright bell-like rising arpeggio (major triad plus octave, FM bell timbre, about 2.5 s with reverb) on the sfx bus. The music ducks by 12 dB for 3 s. It plays exactly once per game.

### T7 — Settings screen

Reachable from the title screen and the pause overlay. Persisted in `localStorage` key `ogm.settings` (versioned JSON with defaults on parse failure). Changes apply live.

| Setting | Range | Default |
| --- | --- | --- |
| Language | English, Magyar | English |
| Mouse sensitivity | 0.5×–2.0× of 0.0022 rad/px | 1.0× |
| Invert Y | on/off | off |
| Field of view | 60–90° | 75° |
| Head bob | on/off | on |
| Master / Music / Effects volume | 0–100 % | 80 / 60 / 80 |
| Graphics quality | Auto, High, Low (CP03 T6) | Auto |

All strings in English and Hungarian.

## 5. Acceptance criteria

- [ ] The goal is visible and recognisable through a doorway at portal level 1 and 2 in three generated houses (screenshots in the PR); it is the brightest object in each frame.
- [ ] Bob, rotation and glow are identical in the main view and through a portal in the same frame (screenshot pair).
- [ ] Walking within 0.9 m triggers the pickup sequence once; the completion stinger plays once; the result is stored.
- [ ] Footstep unit tests: cadence 1.3 m; first step at 0.15 m; zero steps when stationary or below 0.3 m/s; the last step fires no later than one step after stopping.
- [ ] Each floor type sounds clearly different (human check at G3), and no audible clicks or pops occur in 30 minutes of play (human check).
- [ ] The goal hum comes from the correct doorway when the goal room is visible through it (a unit test on the source position from a mocked portal tree, plus a human check).
- [ ] Audio starts on the start click in Chrome, Safari, Firefox and Edge on macOS; no autoplay warnings.
- [ ] Settings persist across reloads and apply live; FOV and sensitivity changes take effect without restarting the game.

## 6. Gate G3 — human checklist (product owner, Fri 13 Nov; also covers CP10 Part A)

- Goal object: unmistakable from the doorway, pleasant motion, satisfying pickup.
- Audio mix: footsteps audible but not tiring, ambience uncanny but quiet, goal hum followable, completion clearly distinct.
- Debug view (CP10 Part A) approved.
- All screens complete in English and Hungarian.
