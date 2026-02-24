#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${HOME}/backups/openclaw"
STAMP="$(date +%F_%H%M%S)"
WITH_AGENTS=0
ENCRYPT=0
PASSPHRASE="${BACKUP_PASSPHRASE:-}"

MAIN_DIR="${OPENCLAW_MAIN_DIR:-$HOME/.openclaw}"
PITAGONE_DIR="${OPENCLAW_PITAGONE_DIR:-$HOME/.openclaw-pitagone}"
ENV_DIR="${OPENCLAW_ENV_DIR:-$HOME/.config/openclaw}"
SYSTEMD_USER_DIR="${OPENCLAW_SYSTEMD_USER_DIR:-$HOME/.config/systemd/user}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    --with-agents) WITH_AGENTS=1; shift ;;
    --encrypt) ENCRYPT=1; shift ;;
    --passphrase) PASSPHRASE="$2"; shift 2 ;;
    -h|--help)
      cat <<'EOF'
Usage: backup-openclaw.sh [--out-dir <dir>] [--with-agents] [--encrypt] [--passphrase <value>]
EOF
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

mkdir -p "$OUT_DIR"
BASE="openclaw-backup-${STAMP}"
TMP_ROOT="$(mktemp -d)"
DEST_DIR="${TMP_ROOT}/${BASE}"
mkdir -p "$DEST_DIR"

copy_if_exists() {
  local src="$1"
  local rel="$2"
  if [[ -e "$src" ]]; then
    if [[ ! -r "$src" ]]; then
      echo "WARN: skipping unreadable path: $src" >&2
      return 0
    fi
    mkdir -p "${DEST_DIR}/$(dirname "$rel")"
    cp -a "$src" "${DEST_DIR}/${rel}" || {
      echo "WARN: failed to copy $src" >&2
      return 0
    }
  fi
}

copy_if_exists "$MAIN_DIR/openclaw.json" "home/.openclaw/openclaw.json"
copy_if_exists "$PITAGONE_DIR/openclaw.json" "home/.openclaw-pitagone/openclaw.json"
copy_if_exists "$ENV_DIR/main-gateway.env" "home/.config/openclaw/main-gateway.env"
copy_if_exists "$ENV_DIR/pitagone-gateway.env" "home/.config/openclaw/pitagone-gateway.env"
copy_if_exists "$SYSTEMD_USER_DIR/openclaw-gateway.service" "home/.config/systemd/user/openclaw-gateway.service"
copy_if_exists "$SYSTEMD_USER_DIR/openclaw-pitagone-gateway.service" "home/.config/systemd/user/openclaw-pitagone-gateway.service"

if [[ $WITH_AGENTS -eq 1 ]]; then
  copy_if_exists "$MAIN_DIR/agents" "home/.openclaw/agents"
  copy_if_exists "$PITAGONE_DIR/agents" "home/.openclaw-pitagone/agents"
fi

( cd "$TMP_ROOT" && tar -czf "${OUT_DIR}/${BASE}.tar.gz" "$BASE" )
sha256sum "${OUT_DIR}/${BASE}.tar.gz" > "${OUT_DIR}/${BASE}.sha256"

if [[ $ENCRYPT -eq 1 ]]; then
  if [[ -n "$PASSPHRASE" ]]; then
    gpg --batch --yes --pinentry-mode loopback --passphrase "$PASSPHRASE" \
      --symmetric --cipher-algo AES256 \
      --output "${OUT_DIR}/${BASE}.tar.gz.gpg" "${OUT_DIR}/${BASE}.tar.gz"
  else
    gpg --symmetric --cipher-algo AES256 \
      --output "${OUT_DIR}/${BASE}.tar.gz.gpg" "${OUT_DIR}/${BASE}.tar.gz"
  fi
  sha256sum "${OUT_DIR}/${BASE}.tar.gz.gpg" > "${OUT_DIR}/${BASE}.gpg.sha256"
fi

rm -rf "$TMP_ROOT"

echo "Backup created: ${OUT_DIR}/${BASE}.tar.gz"
[[ $ENCRYPT -eq 1 ]] && echo "Encrypted backup: ${OUT_DIR}/${BASE}.tar.gz.gpg"
