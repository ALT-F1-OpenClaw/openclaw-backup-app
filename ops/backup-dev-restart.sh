#!/usr/bin/env bash
set -euo pipefail

systemctl --user restart openclaw-backup-dev.service
for i in {1..30}; do
  if OUT=$(curl -fsS http://127.0.0.1:3101/api/status 2>/dev/null); then
    echo "$OUT"
    exit 0
  fi
  sleep 1
done

echo "dev endpoint not ready after 30s" >&2
exit 1
