#!/usr/bin/env bash
set -euo pipefail

echo '[1/2] Restarting staging...'
"$(dirname "$0")/backup-staging-restart.sh"

echo '[2/2] Restarting dev...'
"$(dirname "$0")/backup-dev-restart.sh"
