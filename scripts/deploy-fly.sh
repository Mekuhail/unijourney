#!/bin/bash
# One-command permanent deploy to Fly.io. First run: logs you in (browser), creates the app, a 1 GB volume and a secret.
# Later runs just redeploy. The public URL is https://<app>.fly.dev
set -euo pipefail
cd "$(dirname "$0")/.."
flyctl auth whoami >/dev/null 2>&1 || flyctl auth login
APP_FILE=.fly-app
if [ -f "$APP_FILE" ]; then APP=$(cat "$APP_FILE"); else APP=${1:-unijourney-yu-$(openssl rand -hex 3)}; echo "$APP" > "$APP_FILE"; fi
REGION=${REGION:-fra}
if ! flyctl status -a "$APP" >/dev/null 2>&1; then
  flyctl apps create "$APP"
  flyctl volumes create unijourney_data --size 1 --region "$REGION" -a "$APP" -y
  flyctl secrets set SESSION_SECRET="$(openssl rand -hex 24)" -a "$APP" --stage
fi
# Docker Desktop on macOS exposes its socket under ~/.docker; flyctl only looks at DOCKER_HOST / /var/run/docker.sock.
if [ -z "${DOCKER_HOST:-}" ] && [ -S "$HOME/.docker/run/docker.sock" ]; then export DOCKER_HOST="unix://$HOME/.docker/run/docker.sock"; fi
if docker info >/dev/null 2>&1; then
  flyctl deploy -a "$APP" --local-only --ha=false
else
  echo "Local Docker not reachable - building on Fly remote builder instead"
  flyctl deploy -a "$APP" --remote-only --ha=false
fi
echo
echo "Live at: https://$APP.fly.dev"
