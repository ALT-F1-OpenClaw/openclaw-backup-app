# OpenClaw Backup

Minimalist web app for backing up OpenClaw configuration with automatic secret redaction, running in a hardened Docker container.

![OpenClaw Backup screenshot](docs/screenshot.png)

## Features

- **One-click backup** via web UI on `http://localhost:3100`
- **Confirmation prompts** before Backup / Push / Download actions
- **Automatic secret redaction** — JSON fields matching `token`, `key`, `password`, or `secret` are replaced with `REDACTED`
- **Git-versioned backups** — each backup is a git commit in `./backup-data/`, giving you full history and diffs
- **Hardened container** — read-only filesystem, all capabilities dropped, no-new-privileges, non-root user

## What gets backed up

| Source | Destination | Notes |
|--------|------------|-------|
| `~/.openclaw/openclaw.json` | `backup-data/config/openclaw.json` | Secrets redacted |
| `~/.openclaw/node.json` | `backup-data/config/node.json` | Copied as-is |
| `~/.openclaw/workspace/*.md` | `backup-data/workspace/` | MEMORY, SOUL, USER, TOOLS, IDENTITY, AGENTS, HEARTBEAT |
| `~/.openclaw/workspace/memory/*.{md,json}` | `backup-data/workspace/memory/` | Memory notes + state json files |
| `~/.openclaw/agents/main/agent/auth-profiles.json` | `backup-data/config/agent/auth-profiles.json` | Secrets redacted |
| `~/.openclaw/agents/main/agent/auth.json` | `backup-data/config/agent/auth.json` | Secrets redacted |
| `~/.openclaw/identity/device-auth.json` | `backup-data/config/identity/device-auth.json` | Secrets redacted |
| `~/.openclaw/scripts/**/*.{sh,md}` | `backup-data/scripts/` | Automation scripts + docs |

## Quick start

```bash
git clone <repo-url> && cd openclaw-backup-app
docker compose up -d --build
```

Open http://localhost:3100 and click **Backup Configuration**.


## Visual guides

### Update and deployment flow

![OpenClaw Backup update flow](docs/update-flow-4k.png)

### Dev vs Staging architecture

![OpenClaw Backup dev vs staging architecture](docs/dev-staging-architecture-4k.png)

## Automatic Docker publishing (GitHub → GHCR)

This repo auto-builds and publishes a Docker image to **GHCR** on version tags:

- Workflow: `.github/workflows/docker-publish.yml`
- Trigger: push tag `v*` (example: `v1.4.0`)
- Image: `ghcr.io/alt-f1-openclaw/openclaw-backup-app`
- Tags published: `vX.Y.Z` and `latest`

### Release flow

```bash
# after bumping version + commit
git tag v1.4.0
GIT_SSH_COMMAND="ssh -i ~/.ssh/openclaw-backup-bot-2026-02-21 -o StrictHostKeyChecking=accept-new" git push origin main --tags
```

### Runtime update behavior

`docker-compose.yml` uses:
- `image: ghcr.io/alt-f1-openclaw/openclaw-backup-app:latest`
- `pull_policy: always`

Important: publishing a new image does **not** magically replace an already-running container.
You must recreate the container to run the new image:

```bash
docker compose pull
docker compose up -d
```

Quick verification:

```bash
curl http://127.0.0.1:3100/api/status
```

## Environments

### Staging (port 3100)
- Image-based (`ghcr.io/...:latest`)
- Production-like behavior

### Dev (port 3101)
- Local source build
- Fast testing loop

### Helper commands

```bash
backup-dev-restart
backup-staging-restart
backup-all-restart
```

## Push conflict auto-recovery (backup-data)

If `Push to GitHub` hits a non-fast-forward error (`[rejected] fetch first`), the app now auto-heals by:
1. fetching remote backup-data head,
2. resetting local backup repo to remote,
3. rebuilding backup files,
4. creating a fresh backup commit,
5. retrying push.

This avoids manual git recovery during normal app usage.

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

## Notifications — GitHub → Discord Webhook

This repository is connected to a Discord channel via GitHub Webhooks for real-time activity notifications.

```
┌──────────────────────┐         HTTPS POST          ┌──────────────────────┐
│                      │  (push, PR, issue, release)  │                      │
│   GitHub             │ ──────────────────────────►  │   Discord            │
│   ALT-F1-OpenClaw/   │                              │   #dev-activity      │
│   openclaw-backup-app│  Payload: application/json   │   (webhook)          │
│                      │  Endpoint: /github suffix    │                      │
└──────────────────────┘                              └──────────────────────┘
```

### How it works

1. **GitHub fires a webhook** on every push, pull request, issue, or release event
2. **Discord receives the payload** at a webhook URL with the `/github` suffix
3. **Discord formats the event** natively (commit messages, PR titles, issue labels, etc.)

### Events tracked

| Event | Trigger | What appears in Discord |
|-------|---------|------------------------|
| Push | Code pushed to any branch | Commit hash, message, author, branch |
| Pull Request | Opened, merged, closed | PR title, author, status, link |
| Issues | Opened, closed, commented | Issue title, labels, assignee |
| Release | New release published | Version, release notes |

### Setup (for engineers)

To replicate this webhook on a new repo:

1. Go to your GitHub repo → **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL:** `<Discord webhook URL>/github` (the `/github` suffix is required for Discord formatting)
3. **Content type:** `application/json`
4. **Secret:** leave empty (the webhook URL token acts as authentication)
5. **Events:** "Send me everything" or select specific events
6. Click **Add webhook**

To create the Discord webhook:
1. Go to the Discord channel → **Edit Channel** → **Integrations** → **Webhooks**
2. Click **New Webhook**, name it `GitHub`, copy the URL

### Architecture context

```
┌─────────────────────────────────────────────────────┐
│  ALT-F1-004 (WSL2)                                 │
│                                                     │
│  OpenClaw Gateway (:18789)                          │
│  ├── Agent (Claude Opus 4)                          │
│  ├── Discord Bot ──► #bot-openclaw-setup            │
│  │                   #bot-general                   │
│  │                   #cron-logs                     │
│  │                   #dev-activity ◄── GitHub WHK   │
│  └── Backup App (Docker :3100) ──► this repo        │
│                                                     │
│  GitHub (ALT-F1-OpenClaw org)                       │
│  ├── openclaw-backup-app ──webhook──► #dev-activity │
│  ├── openclaw-backup-data (backup storage)          │
│  └── altf1be-hubspot-openclaw ──webhook──► same     │
└─────────────────────────────────────────────────────┘
```

## Security

The Docker container is hardened with:

- `read_only: true` — immutable filesystem (except `/backup` and `/tmp`)
- `cap_drop: ALL` — all Linux capabilities removed
- `no-new-privileges` — prevents privilege escalation
- `user: 1000:1000` — runs as non-root, matching host user
- Config volumes mounted as read-only (`:ro`)
