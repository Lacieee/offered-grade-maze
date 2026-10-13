# Changelog

All notable changes to Offered Grade Maze. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## 1.0.0 - 2026-11-20

The first release: a first-person game in an impossible house, played in the browser and run
locally with Docker Compose.

### The game

- **Impossible house.** Generated from a seed: 8–10 rooms (Easy), 12–16 (Medium) or 18–24
  (Hard), living rooms, kitchens, bedrooms, bathrooms, hallways and studies, linked by doors
  that do not always lead back. Self-links, sealed doors, long back links, twins and
  misleading doors grow with the difficulty. Every level is validated and solvable; the goal
  is at least 4 / 6 / 8 doors from the start.
- **Seamless doors.** Every doorway is a live view of the room behind it, up to three
  doorways deep, and walking through is invisible. Rooms stream in as you go.
- **Furnished rooms.** Procedural furniture from a catalogue of prefabs, a signature
  landmark in every room, lamps and paintings, an aquarium, a TV.
- **The Offered Grade.** A floating, turning, glowing diploma; walk into it to finish.
- **Sound.** Footsteps by floor type, an uncanny ambient score, a hum from the goal that you
  can follow through doorways, and a completion stinger. All synthesised with Web Audio.
- **Results and seeds.** The server times the game (the timer never pauses) and stores the
  result. Share the seed; anyone can type it or open `/?seed=…` to play the same house.
- **Debug view** (\` / § / F9). The house's real graph, the guaranteed path from here or from
  the start, as a graph and as text, and door labels in the house. Using it marks the
  result.
- **Settings.** Mouse sensitivity, invert Y, field of view, head bob, volumes, graphics
  quality, language.
- **English and Hungarian.**

### For developers and testers

- Autopilot: `window.__ogm.autopilot.followPath()` (release builds: `?autopilot=1`) plays
  through the normal controls along the debug path; `tour(seconds)` for performance walks.
- `?perf=1`: frame times, passes, missing portal targets, shader compiles, and a copyable
  performance log; `pnpm perf:walk` drives Chrome or Edge through the release check.
- Deterministic generator (`GENERATOR_VERSION = 1`, golden seeds frozen), `pnpm gen` CLI.
- Playwright suite: portal and visual baselines, the full journey on the mock and the real
  API, nine autopilot playthroughs, the debug view, seed replay, outages, latency runs,
  every UI screen in English and Hungarian.

### Requirements

Docker Desktop (or Docker) to run; a desktop browser with WebGL2 (Chrome, Safari, Firefox,
Edge). Reference machine: MacBook Pro M1 Max.
