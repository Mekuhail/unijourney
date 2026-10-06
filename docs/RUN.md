# Run guide

## Requirements
* Node.js 22.13 or newer (the prototype uses the built-in `node:sqlite`; no native modules, no Docker).
* macOS/Linux/Windows. No API keys required.

## Commands
```bash
npm install            # one time
npm run dev            # API http://localhost:8787 + Vite UI http://localhost:5173 (proxied /api)
npm run reset          # rebuild synthetic fixtures (also: Demo panel → Reset demo)
npm test               # vitest: domain + API tests on an in-memory database
npm run typecheck      # server + client
npm run build          # typecheck + production client build to dist/client
npm start              # serve the built client from the API server (http://localhost:8787)
```

## Environment (`.env`, all optional)
| Variable | Default | Effect |
|---|---|---|
| `API_PORT` | 8787 | API port |
| `DATA_DIR` | ./data | SQLite file and private uploads |
| `SESSION_SECRET` | ephemeral locally; required in production | Signs the persona session cookie (at least 32 random characters) |
| `DEMO_CONTROL_TOKEN` | unset | Enables operator-only reset, clock and policy controls (at least 32 random characters) |
| `DEMO_MODE` | true | Enables persona switching, reset and the demo clock |
| `DEMO_CLOCK` | 2026-09-27T09:00:00+03:00 | Frozen "now" (Asia/Riyadh); empty = real clock |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | — / claude-haiku-4-5-20251001 | Optional model-backed intent parsing/explanations |
| `GOOGLE_MAPS_API_KEY` | — | Google Maps tiles on the campus map (OpenStreetMap otherwise) |
| `CARTO_API_KEY` | — | CARTO Basemaps street tiles without the "API key required" watermark |

## Secrets and keys
- Local values go in `.env` at the repo root (copy `.env.example`). The server loads it at start; `.env` and every
  `.env.*` except the example are gitignored and excluded from the Docker build context.
- Production values are platform secrets, never files: `flyctl secrets set CARTO_API_KEY=... -a <app>` (add
  `--stage` to apply on the next deploy).
- A public deployment fails startup without a strong `SESSION_SECRET`. Store it in your secret manager and set it
  through Fly or Render before deployment. Docker Compose requires it in the environment as well.
- Shared demo controls are disabled until you set `DEMO_CONTROL_TOKEN` as a platform secret. Enter that value in the
  Demo panel's operator field when needed; the page keeps it only in memory. Keep it private and rotate it if shared.
- Keys that must reach the browser (`CARTO_API_KEY`, `GOOGLE_MAPS_API_KEY`) are served at runtime by
  `/api/config/public`, never compiled into client code. Restrict them to your domains in the provider dashboards.
- A pre-commit hook blocks secret files and common key formats. Enable it once per clone:
  `git config core.hooksPath .githooks`.
- If a key is ever committed or pasted somewhere public, rotate it at the provider; deleting the commit is not enough.

## Data
In demo mode, the first start seeds `data/unijourney.db`. Uploaded files live in `data/uploads/` and are served only through
authorized `/api/documents/:id/file` requests. A demo reset truncates every table, clears uploads and reseeds. When
`DEMO_MODE=false`, startup and reset never seed or delete data; this prototype does not provide real-user sign-in.

## Deploying for a permanent link

**Docker (verified locally).** `docker compose up -d` builds the image and runs it on http://localhost:8080 with a named
volume for data and `restart: unless-stopped`, so it comes back whenever Docker Desktop starts.

**Fly.io (permanent public URL).** `scripts/deploy-fly.sh` — logs in on first run (browser), creates the app, a 1 GB
volume and a session secret, builds the image locally and deploys it. Result: `https://<app>.fly.dev`, always on.
Re-run the same script to redeploy after changes. Fly requires a payment method on the account; this app fits the
smallest shared machine.

**Render (free tier).** Push the folder to GitHub, then Render → New → Blueprint → pick the repo (`render.yaml`).
Free services sleep after ~15 minutes idle (first request then takes ~1 minute) and have no disk, so demo data resets on
each restart — acceptable for a demo because the app reseeds itself.

**Any Docker host:** `docker build -t unijourney . && docker run -d -p 8080:8080 -v unijourney-data:/data --restart unless-stopped unijourney`.

## Temporary public link (tunnel watchdog)
`scripts/tunnel.sh 8080` keeps two account-less tunnels (Cloudflare quick tunnel + localhost.run) pointed at the
Docker container on port 8080, restarts them when they drop, and writes the current addresses to `PUBLIC_URL.txt`.
Addresses change whenever a tunnel is re-created, and everything stops when the laptop sleeps — use the Docker/Render/Fly
files above for a permanent link.

```bash
docker compose up -d                                   # container on :8080
nohup scripts/tunnel.sh 8080 > /tmp/uj-tunnel-watchdog.log 2>&1 &
cat PUBLIC_URL.txt
```
