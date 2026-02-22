#!/usr/bin/env bash
set -euo pipefail
systemctl --user start openclaw-backup-dev.service
curl -fsS http://127.0.0.1:3101/api/status; echo
