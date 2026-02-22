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

## Manual operations runbook (step-by-step)

This section explains how to do manually what the automation does.

### 1) Release a new version manually

```bash
# from repo root
npm version minor --no-git-tag-version   # or patch / major
VERSION=$(node -p "require('./package.json').version")
git add package.json package-lock.json
git commit -m "chore: bump version to ${VERSION}"
git tag "v${VERSION}"
GIT_SSH_COMMAND="ssh -i ~/.ssh/openclaw-backup-bot-2026-02-21 -o StrictHostKeyChecking=accept-new" git push origin main --tags
```

What happens next:
- `release-publish.yml` builds and pushes GHCR image (`vX.Y.Z` + `latest`)
- `release-test.yml` and `release-docs.yml` run automatically for minor/major tags

### 2) Force workflows manually (when needed)

From GitHub UI:
- Actions → **Release Publish (GHCR)** → Run workflow
- Actions → **Release Test Environment** → Run workflow (optionally pass `tag`)
- Actions → **Release Tutorial Docs** → Run workflow (optionally pass `tag`)

From CLI:

```bash
gh workflow run "Release Test Environment" -f tag=v1.8.0
gh workflow run "Release Tutorial Docs" -f tag=v1.8.0
gh run list --limit 10
gh run watch <run-id>
```

### 3) Update running environments manually

Publish success does not replace running containers automatically. Recreate them:

```bash
backup-staging-restart   # port 3100 (GHCR image)
backup-dev-restart       # port 3101 (local dev build)
backup-all-restart       # both
```

Direct compose alternative:

```bash
# staging
cd ~/.openclaw/deploy/openclaw-backup/staging
docker compose pull
docker compose up -d

# dev
cd ~/.openclaw/deploy/openclaw-backup/dev
docker compose up -d --build
```

Verify:

```bash
curl http://127.0.0.1:3100/api/status
curl http://127.0.0.1:3101/api/status
```

### 4) If Push to GitHub fails with "fetch first"

The app now auto-heals this, but manual recovery is:

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/openclaw-backup-bot-2026-02-21 -o StrictHostKeyChecking=accept-new"   git -C ~/.openclaw/data/openclaw-backup fetch origin master

git -C ~/.openclaw/data/openclaw-backup reset --hard origin/master
```

Then click **Backup Configuration** and **Push to GitHub** again.

### 5) Generate tutorial + screenshot manually

```bash
# generate tutorial markdown
TAG=v1.8.0 KIND=minor TEST_STATUS=pass python3 scripts/release/generate_tutorial.py

# run app locally for screenshot
# (example endpoint: http://127.0.0.1:33110)
npx -y playwright@1.52.0 install chromium
npx -y playwright@1.52.0 screenshot --device="Desktop Chrome"   http://127.0.0.1:33110 docs/tutorials/v1.8.0-app.png
```

### 6) Service control (systemd user units)

```bash
systemctl --user status openclaw-backup-staging.service
systemctl --user status openclaw-backup-dev.service
systemctl --user restart openclaw-backup-staging.service
systemctl --user restart openclaw-backup-dev.service
backup-staging-logs
backup-dev-logs
```


## Visual guides

### Update and deployment flow

![OpenClaw Backup update flow](docs/update-flow-4k.png)

### Dev vs Staging architecture

![OpenClaw Backup dev vs staging architecture](docs/dev-staging-architecture-4k.png)

## Release automation (how it works)

### Tutorial generation workflow

![Release tutorial generation workflow](docs/tutorial-generation-flow-4k.png)


This repo now uses **3 workflows** instead of one:

1. **Publish image** → `.github/workflows/release-publish.yml`
2. **Run release tests** → `.github/workflows/release-test.yml`
3. **Generate tutorial docs** → `.github/workflows/release-docs.yml`

### Trigger rules

- Tags `vX.Y.0` (minor) and `vX.0.0` (major): run automatically.
- Patch tags `vX.Y.Z` with `Z>0`: publish image, while test/docs are manual by default.
- Manual `workflow_dispatch`: always available.

### What each workflow does

#### 1) `release-publish.yml`
- Builds and pushes image to GHCR:
  - `ghcr.io/alt-f1-openclaw/openclaw-backup-app:vX.Y.Z`
  - `ghcr.io/alt-f1-openclaw/openclaw-backup-app:latest`

#### 2) `release-test.yml` (full test environment)
- Builds a test image
- Starts ephemeral container
- Validates:
  - container startup + `/api/status`
  - `/api/backup`
  - push auto-resync behavior on non-fast-forward
  - read-only mount flags for `/config` and `/workspace`

#### 3) `release-docs.yml`
- Generates release tutorial markdown in `docs/tutorials/`
- Uploads tutorial/images as workflow artifacts
- Commits tutorial file back to `main`
- Docs job policy:
  - **major** release: strict (fails pipeline if docs fail)
  - **minor** release: warning mode (continue-on-error)

### Release flow

```bash
# after bumping version + commit
VERSION=$(node -p "require('./package.json').version")
git tag "v${VERSION}"
GIT_SSH_COMMAND="ssh -i ~/.ssh/openclaw-backup-bot-2026-02-21 -o StrictHostKeyChecking=accept-new" git push origin main --tags
```

### Runtime update behavior

`docker-compose.yml` uses:
- `image: ghcr.io/alt-f1-openclaw/openclaw-backup-app:latest`
- `pull_policy: always`

Important: publishing a new image does **not** replace an already-running container.
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
