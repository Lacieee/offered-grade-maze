# Clean-clone check (CP10 B5)

`git clone` → `pnpm start:local` → a playable game at <http://localhost:8080> → a result
stored and still there after `docker compose restart`.

## Cloud run (2026-10-14, release candidate `v1.0.0-rc.1`)

In the cloud sandbox (Linux, Docker 27, software WebGL). The sandbox needs its CA
certificate inside the build, so `docker compose up --build` there adds a build override
(`COPY --from=ccr ca-bundle.crt`, `NODE_EXTRA_CA_CERTS`); on a normal machine
`pnpm start:local` needs nothing extra.

1. `git clone` of the repository, branch `feat/CP10-debug-view-hardening-release` at the
   release candidate; `docker compose up --build -d --wait`:
   - image **`offered-grade-maze:1.0.0`** built (395 MB), `app` and `db` healthy;
   - `GET /api/v1/health` → `{"status":"ok","db":"ok","version":"1.0.0"}`.
2. A playable game: `E2E_API_PORT=8080 pnpm test:e2e release` against the running product:
   - the production build has no `window.__ogm`;
   - with `?autopilot=1` it exposes only the autopilot, which played an Easy game to the
     result screen (no console errors).
3. Stored: `select count(*) from results` 0 → 1 (`E1-FWD5-3PP4`, 91 390 ms, `debug_used`
   true because the autopilot reads the debug path).
4. `docker compose restart`: health is back, the result is still there (count 1), and
   `POST /games/:id/complete` again returns the stored result unchanged
   (`"completionMs":91390`).

## On the Mac (G4)

1. `git clone` into a new folder, `pnpm start:local`, open <http://localhost:8080>.
2. Play one game to the result screen (any difficulty).
3. `docker compose restart`, then check the result is still stored:
   `docker compose exec db psql -U ogm -c 'select seed_code, completion_ms from results'`.
