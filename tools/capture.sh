#!/bin/bash
# Deterministic screenshot capture for the critic loop.
# Usage: tools/capture.sh [outdir]  (serves the repo, shoots every scene)
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$DIR/shots}"
mkdir -p "$OUT"
PORT=8791

python3 -m http.server $PORT --directory "$DIR" >/dev/null 2>&1 &
SRV=$!
trap "kill $SRV 2>/dev/null" EXIT
sleep 0.5

BROWSER="${BROWSER:-chromium}"
for shot in title help hero palms canyon pines dusk desert autumn harbor fields volcano snow bay metro savanna lastlight fork traffic results pause touch spin1 wreck2; do
  "$BROWSER" --headless --disable-gpu --hide-scrollbars \
    --window-size=1280,720 --virtual-time-budget=9000 \
    --screenshot="$OUT/$shot.png" \
    "http://localhost:$PORT/index.html?shot=$shot" 2>/dev/null
  echo "captured $shot"
done
