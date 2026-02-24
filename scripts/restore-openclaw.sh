#!/usr/bin/env bash
set -euo pipefail

ARCHIVE=""
PASS=""
YES=0
DRY_RUN=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive) ARCHIVE="$2"; shift 2 ;;
    --passphrase) PASS="$2"; shift 2 ;;
    --yes) YES=1; shift ;;
    --apply) DRY_RUN=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      cat <<'EOF'
Usage: restore-openclaw.sh --archive <file.tar.gz|file.tar.gz.gpg> [--passphrase <v>] [--dry-run|--apply] [--yes]

Step-by-step restore helper with confirmations.
Default mode is --dry-run (safe preview).
EOF
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$ARCHIVE" ]] || { echo "ERROR: --archive is required" >&2; exit 2; }
[[ -f "$ARCHIVE" ]] || { echo "ERROR: archive not found: $ARCHIVE" >&2; exit 2; }

confirm() {
  local msg="$1"
  if [[ $YES -eq 1 ]]; then
    echo "[auto-yes] $msg"
    return 0
  fi
  read -r -p "$msg [y/N]: " ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

echo "== OpenClaw Restore Assistant =="
echo "Archive: $ARCHIVE"
echo "Mode: $([[ $DRY_RUN -eq 1 ]] && echo DRY-RUN || echo APPLY)"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

payload="$ARCHIVE"
if [[ "$ARCHIVE" == *.gpg ]]; then
  echo "Step 1/5: decrypt encrypted archive"
  confirm "Proceed with decryption?" || exit 1
  payload="$tmp/payload.tar.gz"
  if [[ -n "$PASS" ]]; then
    gpg --batch --yes --pinentry-mode loopback --passphrase "$PASS" --decrypt --output "$payload" "$ARCHIVE"
  else
    gpg --decrypt --output "$payload" "$ARCHIVE"
  fi
else
  echo "Step 1/5: archive is not encrypted (.gpg), skipping decryption"
fi

echo "Step 2/5: inspect archive"
confirm "Extract and inspect backup content?" || exit 1
tar -xzf "$payload" -C "$tmp"
root="$(find "$tmp" -maxdepth 1 -type d -name 'openclaw-backup-*' | head -n1)"
[[ -d "$root" ]] || { echo "ERROR: invalid archive layout" >&2; exit 1; }

echo "Detected files:"
find "$root/home" -type f | sed "s|$root/home|$HOME|"

echo "Step 3/5: prepare destination paths"
confirm "Continue to destination validation?" || exit 1
mkdir -p "$HOME/.openclaw" "$HOME/.openclaw-pitagone" "$HOME/.config/openclaw" "$HOME/.config/systemd/user"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "Step 4/5: DRY-RUN only (no files written)"
  echo "Would restore files listed above to your HOME paths."
  echo "Step 5/5: done"
  exit 0
fi

echo "Step 4/5: apply restore"
confirm "Apply restore now (this overwrites existing files)?" || exit 1
while IFS= read -r -d '' f; do
  rel="${f#$root/home/}"
  dst="$HOME/$rel"
  mkdir -p "$(dirname "$dst")"
  cp -a "$f" "$dst"
done < <(find "$root/home" -type f -print0)

chmod 700 "$HOME/.config/openclaw" 2>/dev/null || true
chmod 600 "$HOME/.config/openclaw"/*.env 2>/dev/null || true

echo "Step 5/5: reload systemd + restart services"
confirm "Reload and restart gateway services now?" || exit 1
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway.service openclaw-pitagone-gateway.service

echo "Restore completed successfully."
