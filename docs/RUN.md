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
| `SESSION_SECRET` | demo value | Signs the persona session cookie |
| `DEMO_MODE` | true | Enables persona switching, reset and the demo clock |
| `DEMO_CLOCK` | 2026-09-27T09:00:00+03:00 | Frozen "now" (Asia/Riyadh); empty = real clock |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | — / claude-haiku-4-5-20251001 | Optional model-backed intent parsing/explanations |
| `GOOGLE_MAPS_API_KEY` | — | Google Maps tiles on the campus map (OpenStreetMap otherwise) |

## Data
The first start seeds `data/unijourney.db`. Uploaded files live in `data/uploads/` and are served only through
authorized `/api/documents/:id/file` requests. `npm run reset` truncates every table, clears uploads and reseeds.

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
