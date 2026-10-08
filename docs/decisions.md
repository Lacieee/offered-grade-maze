# Product decisions

Final decisions from the product owner (recorded in CP01). They override
`docs/architecture.md` wherever the two differ.

| ID   | Decision                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PD1  | The timer never pauses: not on Esc, not on tab switch, not while the debug view is open.                                                                                             |
| PD2  | The goal (the Offered Grade diploma) is collected by walking into it. There is no interaction key.                                                                                   |
| PD3  | UI language: **English is the default**, Hungarian is available as a second language.                                                                                                |
| PD4  | The game runs **locally** via Docker Compose (app + PostgreSQL). There is no cloud deployment, no staging environment.                                                               |
| PD5  | Reference machine for performance: **MacBook Pro with Apple M1 Max**, macOS, latest Chrome and Safari.                                                                               |
| PD6  | The admin/debug view stays enabled in release builds.                                                                                                                                |
| PD7  | Product name shown in the UI: **Offered Grade Maze**. The goal object is called "Offered Grade" in English and "Megajánlott jegy" in Hungarian.                                      |
| PD8  | The result is flagged `debug_used = true` if the debug view was opened during the game; the result is still valid.                                                                   |
| PD9  | Sealed (closed) doors are decorative: no link may arrive at a sealed door. One-way passages come only from asymmetric links. (G1 feedback, 8 Oct 2026)                               |
| PD10 | Every doorway looks identical in every room: the same frame, jamb and doorstep colours, unaffected by room lighting, so crossing a door is not noticeable. (G1 feedback, 8 Oct 2026) |

## Where these change `docs/architecture.md`

| Architecture text                                                                                                                                                                      | Overridden by |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| A3: Hungarian is the default UI language                                                                                                                                               | PD3           |
| A5, §20: cloud container hosting, staging and production                                                                                                                               | PD4           |
| §18, T1.1: Intel Iris Xe class reference laptop                                                                                                                                        | PD5           |
| §2 "One-way door = an arrival door sealed from the inside"; §8.2 step 7 "Sealing prefers doors that are already the arrival point of a non-reciprocated link"                          | PD9           |
| CP02 T3 link table: `r03.d0 → r01.d3` (now `r03.d0 → r01.d2`)                                                                                                                          | PD9           |
| CP04 T3 step 7: a sealed door is preferably an arrival door. Instead, a sealed door must never be an arrival door; the validator rejects a link into a sealed door (structural check). | PD9           |
| CP02 T2: door casing in `palette.trim`; jambs and threshold in the room's colours                                                                                                      | PD10          |
| §24 open items (timer, pickup, language, hosting, laptop…)                                                                                                                             | PD1–PD8       |
