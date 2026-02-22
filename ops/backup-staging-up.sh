#!/usr/bin/env bash
set -euo pipefail
systemctl --user start openclaw-backup-staging.service
curl -fsS http://127.0.0.1:3100/api/status; echo
