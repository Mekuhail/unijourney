#!/bin/bash
# Keeps two account-less tunnels to the production server alive and writes the current public URLs to PUBLIC_URL.txt.
# Usage: nohup scripts/tunnel.sh 8790 > /tmp/uj-tunnel-watchdog.log 2>&1 &
PORT=${1:-8790}
OUT=/Users/mekuhail/Downloads/unijourney/PUBLIC_URL.txt
CFLOG=/tmp/uj-cf.log; LHRLOG=/tmp/uj-lhr.log
start_cf() { : > "$CFLOG"; nohup cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate --edge-ip-version 4 --protocol http2 >> "$CFLOG" 2>&1 & }
start_lhr() { : > "$LHRLOG"; nohup ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -R "80:localhost:$PORT" nokey@localhost.run >> "$LHRLOG" 2>&1 & }
# fresh start: stop any stray tunnels from earlier sessions
pkill -f "cloudflared tunnel --url" 2>/dev/null; pkill -f "nokey@localhost.run" 2>/dev/null; sleep 1
start_cf; start_lhr; sleep 30
while true; do
  CF=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$CFLOG" | grep -v "^https://api\." | head -1)
  LHR=$(grep -oE "https://[a-z0-9.-]+\.lhr\.life" "$LHRLOG" | head -1)
  if ! pgrep -f "cloudflared tunnel --url" >/dev/null; then start_cf; sleep 25; fi
  if ! pgrep -f "nokey@localhost.run" >/dev/null; then start_lhr; sleep 15; fi
  if [ -n "$CF" ]; then
    code=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "$CF/api/health" || echo 000)
    if [ "$code" != "200" ]; then pkill -f "cloudflared tunnel --url"; sleep 1; start_cf; sleep 25; fi
  fi
  if [ -n "$LHR" ]; then
    body=$(curl -s -m 15 "$LHR/api/health" || true)
    if ! echo "$body" | grep -q '"ok":true'; then pkill -f "nokey@localhost.run"; sleep 1; start_lhr; sleep 15; fi
  fi
  CF=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$CFLOG" | grep -v "^https://api\." | head -1)
  LHR=$(grep -oE "https://[a-z0-9.-]+\.lhr\.life" "$LHRLOG" | head -1)
  printf "updated: %s\nprimary (Cloudflare): %s\nbackup (localhost.run): %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "${CF:-starting…}" "${LHR:-starting…}" > "$OUT"
  sleep 30
done
