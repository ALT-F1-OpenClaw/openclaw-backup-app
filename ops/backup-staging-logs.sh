#!/usr/bin/env bash
set -euo pipefail
journalctl --user -u openclaw-backup-staging.service -n 120 --no-pager
