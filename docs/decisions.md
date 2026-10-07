# Product decisions

Final decisions from the product owner (recorded in CP01). They override
`docs/architecture.md` wherever the two differ.

| ID  | Decision                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| PD1 | The timer never pauses: not on Esc, not on tab switch, not while the debug view is open.                                                        |
| PD2 | The goal (the Offered Grade diploma) is collected by walking into it. There is no interaction key.                                              |
| PD3 | UI language: **English is the default**, Hungarian is available as a second language.                                                           |
| PD4 | The game runs **locally** via Docker Compose (app + PostgreSQL). There is no cloud deployment, no staging environment.                          |
| PD5 | Reference machine for performance: **MacBook Pro with Apple M1 Max**, macOS, latest Chrome and Safari.                                          |
| PD6 | The admin/debug view stays enabled in release builds.                                                                                           |
| PD7 | Product name shown in the UI: **Offered Grade Maze**. The goal object is called "Offered Grade" in English and "Megajánlott jegy" in Hungarian. |
| PD8 | The result is flagged `debug_used = true` if the debug view was opened during the game; the result is still valid.                              |

## Where these change `docs/architecture.md`

| Architecture text                                          | Overridden by |
| ---------------------------------------------------------- | ------------- |
| A3: Hungarian is the default UI language                   | PD3           |
| A5, §20: cloud container hosting, staging and production   | PD4           |
| §18, T1.1: Intel Iris Xe class reference laptop            | PD5           |
| §24 open items (timer, pickup, language, hosting, laptop…) | PD1–PD8       |
