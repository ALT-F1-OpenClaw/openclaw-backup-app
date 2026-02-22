#!/usr/bin/env bash
set -euo pipefail
journalctl --user -u openclaw-backup-dev.service -n 120 --no-pager
