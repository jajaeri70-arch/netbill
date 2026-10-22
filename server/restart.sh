#!/usr/bin/env bash
# =============================================================
# Restart NetBill server agar perubahan route/halaman baru aktif
# (dibuat setelah penambahan modul Mapping — /api/mapping).
# Jalankan:  bash /www/wwwroot/billing/server/restart.sh
# =============================================================
set -e
LOG="$(dirname "$0")/netbill.log"

# Hentikan pemilik port aplikasi; command Node dapat berupa path absolut sehingga
# tidak aman dicari hanya dengan pola "node src/index.js".
PIDS=$(fuser -n tcp 3000 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "Menghentikan proses lama pada port 3000: $PIDS"
  kill -TERM $PIDS 2>/dev/null || true
  # Tunggu port 3000 benar-benar lepas (maks 10s).
  for i in $(seq 1 10); do
    fuser -n tcp 3000 >/dev/null 2>&1 || break
    sleep 1
  done
fi

cd "$(dirname "$0")"
nohup node src/index.js >> "$LOG" 2>&1 &
NEWPID=$!
sleep 3
if kill -0 "$NEWPID" 2>/dev/null && pgrep -f "node src/index.js" >/dev/null; then
  echo "Server dimulai ulang (PID $NEWPID) — log: $LOG"
else
  echo "Gagal memulai server — periksa $LOG"
  tail -20 "$LOG" || true
  exit 1
fi