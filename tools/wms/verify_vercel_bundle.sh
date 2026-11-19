#!/usr/bin/env bash
# Meniru cara Vercel mengemas api/server.ts:
#   - compile per-berkas, TANPA bundling (--packages=external)
#   - hanya api/server.js + node_modules yang ada di /var/task
#   - TIDAK ada src/lib, TIDAK ada dist
#
# Kalau skrip ini gagal padahal `npm run build` lulus, berarti kode
# bergantung pada berkas yang tidak diunggah Vercel. Itulah yang membuat
# production 500 pada PR #6 dan #7.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TASK="$(mktemp -d "${TMPDIR:-/tmp}/vertask.XXXXXX")"
PORT="${PORT:-$(( 3500 + RANDOM % 400 ))}"
PID=""

cleanup() {
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "$PID" 2>/dev/null || break
      sleep 0.3
    done
    kill -9 "$PID" 2>/dev/null
  fi
  rm -rf "$TASK"
}
trap cleanup EXIT

echo "== kemas seperti Vercel =="
mkdir -p "$TASK/api"
if ! npx esbuild "$ROOT/api/server.ts" \
  --platform=node --format=esm --packages=external \
  --outfile="$TASK/api/server.js" >"$TASK/esbuild.log" 2>&1; then
  echo "GAGAL: esbuild tidak bisa mengompilasi api/server.ts"; cat "$TASK/esbuild.log"; exit 1
fi
ln -sfn "$ROOT/node_modules" "$TASK/node_modules"
echo "isi /var/task tiruan:"
find "$TASK" -maxdepth 2 \( -name '*.js' -o -name 'package.json' \) | sed "s|$TASK|  /var/task|"

echo "== jalankan (tanpa src/lib, tanpa dist) =="
( cd "$TASK" && PORT="$PORT" NODE_ENV=production SPREADSHEET_ID=x \
  GOOGLE_DRIVE_FOLDER_ID=x GOOGLE_DRIVE_PO_FOLDER_ID=x \
  TEMPLATE_PR_ID=x TEMPLATE_PO_ID=x \
  JWT_SECRET=abcdefghijklmnopqrstuvwxyz123456 \
  node api/server.js >"$TASK/log" 2>&1 ) &
PID=$!

CODE="000"
for _ in $(seq 1 40); do
  sleep 0.5
  CODE=$(curl -s -m 3 -o "$TASK/health.json" -w '%{http_code}' \
    "http://127.0.0.1:$PORT/api/health" 2>/dev/null)
  [ -n "$CODE" ] || CODE="000"
  [ "$CODE" != "000" ] && break
  kill -0 "$PID" 2>/dev/null || break
done

echo "/api/health -> HTTP $CODE"
cat "$TASK/health.json" 2>/dev/null; echo

if [ "$CODE" != "200" ]; then
  echo "GAGAL. log:"; tail -30 "$TASK/log"
  exit 1
fi

GUARD=$(curl -s -m 8 -o /dev/null -w '%{http_code}' \
  "http://127.0.0.1:$PORT/api/wms/stock" 2>/dev/null || echo 000)
echo "/api/wms/stock -> HTTP $GUARD (401 = route terdaftar)"
if [ "$GUARD" != "401" ]; then
  echo "GAGAL: route stok tidak terdaftar"; tail -30 "$TASK/log"; exit 1
fi

echo "LULUS: bundle berjalan seperti di Vercel"
