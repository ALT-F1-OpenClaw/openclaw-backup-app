# OpenClaw Backup App

## Overview
Minimalist web app in a hardened Docker container. One button: "Backup Configuration".

## Requirements

### Web App (Node.js + Express, minimal)
- Single HTML page with one button: "Backup Configuration"
- On click: creates a git commit of the OpenClaw config (redacted secrets)
- Shows status: last backup time, success/failure
- No auth needed (runs on localhost only)
- Port: 3100

### What to backup
- `/config/openclaw.json` → redact all tokens/keys/passwords before committing
- `/config/node.json`
- `/workspace/` directory (MEMORY.md, SOUL.md, USER.md, TOOLS.md, IDENTITY.md, AGENTS.md, HEARTBEAT.md, memory/*.md)
- Commit to a local git repo inside the container at `/backup`

### Redaction rules
- Any JSON field containing "token", "key", "password", "secret" (case-insensitive) → replace value with "REDACTED"
- Preserve structure, only redact string values

### Docker (hardened)
- Multi-stage build, distroless or alpine final
- Non-root user
- Read-only filesystem (except /backup and /tmp)
- No capabilities added
- Health check
- Mount openclaw config as read-only volume

### docker-compose.yml
- Mount `~/.openclaw` as `/config:ro`
- Mount `~/.openclaw/workspace` as `/workspace:ro`  
- Mount a named volume for `/backup`
- Port 3100:3100

### Tech stack
- Node.js 22 alpine
- Express (minimal)
- simple-git
- Vanilla HTML/CSS (no frameworks)
- Dark theme matching OpenClaw dashboard style
