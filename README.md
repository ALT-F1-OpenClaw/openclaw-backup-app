# OpenClaw Backup

Minimalist web app for backing up OpenClaw configuration with automatic secret redaction, running in a hardened Docker container.

## Features

- **One-click backup** via web UI on `http://localhost:3100`
- **Automatic secret redaction** — JSON fields matching `token`, `key`, `password`, or `secret` are replaced with `REDACTED`
- **Git-versioned backups** — each backup is a git commit in `./backup-data/`, giving you full history and diffs
- **Hardened container** — read-only filesystem, all capabilities dropped, no-new-privileges, non-root user

## What gets backed up

| Source | Destination | Notes |
|--------|------------|-------|
| `~/.openclaw/openclaw.json` | `backup-data/config/openclaw.json` | Secrets redacted |
| `~/.openclaw/node.json` | `backup-data/config/node.json` | Copied as-is |
| `~/.openclaw/workspace/*.md` | `backup-data/workspace/` | MEMORY, SOUL, USER, TOOLS, IDENTITY, AGENTS, HEARTBEAT |
| `~/.openclaw/workspace/memory/*.md` | `backup-data/workspace/memory/` | All memory files |

## Quick start

```bash
git clone <repo-url> && cd openclaw-backup-app
docker compose up -d --build
```

Open http://localhost:3100 and click **Backup Configuration**.

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Returns app version and last backup status |
| `/api/backup` | POST | Triggers a backup |

Example response from `/api/status`:

```json
{
  "version": "1.0.0",
  "lastBackup": {
    "time": "2026-02-21T17:00:00.000Z",
    "status": "success",
    "message": "Backup created"
  }
}
```

## Development

### Prerequisites

- Node.js 22+
- Docker & Docker Compose

### Local setup (without Docker)

```bash
npm install
npm start
```

### Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by **commitlint** and **husky**.

```
feat: add new feature
fix: fix a bug
chore: maintenance task
docs: documentation update
refactor: code refactoring
```

### Releasing a new version

```bash
npm run release          # auto-bump based on commits (fix→patch, feat→minor)
npm run release:minor    # force minor bump
npm run release:major    # force major bump
```

This bumps `package.json` version, generates `CHANGELOG.md`, creates a git commit and tag.

## Tech stack

- **Runtime**: Node.js 22 Alpine
- **Server**: Express
- **Git**: simple-git
- **Process manager**: tini (proper PID 1 signal handling)
- **UI**: Vanilla HTML/CSS/JS, dark theme

## Security

The Docker container is hardened with:

- `read_only: true` — immutable filesystem (except `/backup` and `/tmp`)
- `cap_drop: ALL` — all Linux capabilities removed
- `no-new-privileges` — prevents privilege escalation
- `user: 1000:1000` — runs as non-root, matching host user
- Config volumes mounted as read-only (`:ro`)
