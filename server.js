const express = require("express");
const simpleGit = require("simple-git");
const fs = require("fs/promises");
const path = require("path");
const { execSync } = require("child_process");
const { version } = require("./package.json");

const app = express();
const PORT = 3100;
const BACKUP_DIR = "/backup";
const CONFIG_DIR = "/config";
const WORKSPACE_DIR = "/workspace";
// OpenClaw home is mounted at /config inside the container.
const REMOTE_URL = process.env.BACKUP_REMOTE_URL || "";
const SSH_KEY_NAME = process.env.SSH_KEY_NAME || "id_ed25519";
const GIT_SSH_COMMAND = `ssh -i /ssh/${SSH_KEY_NAME} -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/tmp/known_hosts`;

const SENSITIVE_PATTERN = /token|key|password|secret|access|refresh|authorization|cookie/i;

function redactJson(obj) {
  if (Array.isArray(obj)) return obj.map(redactJson);
  if (obj !== null && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_PATTERN.test(k) && typeof v === "string") {
        result[k] = "REDACTED";
      } else {
        result[k] = redactJson(v);
      }
    }
    return result;
  }
  return obj;
}

async function ensureGitRepo(git) {
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    await git.init();
    await git.addConfig("user.email", "abo+openclaw_backup_app@alt-f1.be");
    await git.addConfig("user.name", "Abdelkrim BOUJRAF");
  }
}

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function copyRedactedJson(src, dest) {
  const raw = await fs.readFile(src, "utf8");
  const data = JSON.parse(raw);
  const redacted = redactJson(data);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, JSON.stringify(redacted, null, 2) + "\n");
}

async function copyIfExists(src, dest) {
  try {
    await copyFile(src, dest);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

async function copyRedactedJsonIfExists(src, dest) {
  try {
    await copyRedactedJson(src, dest);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

const WORKSPACE_FILES = [
  "MEMORY.md",
  "SOUL.md",
  "USER.md",
  "TOOLS.md",
  "IDENTITY.md",
  "AGENTS.md",
  "HEARTBEAT.md",
];

async function collectFiles() {
  // Core OpenClaw config (redacted)
  await copyRedactedJsonIfExists(
    path.join(CONFIG_DIR, "openclaw.json"),
    path.join(BACKUP_DIR, "config", "openclaw.json")
  );

  // Node file (no known secrets)
  await copyIfExists(
    path.join(CONFIG_DIR, "node.json"),
    path.join(BACKUP_DIR, "config", "node.json")
  );

  // Auth/session identity files (always redacted)
  await copyRedactedJsonIfExists(
    path.join(CONFIG_DIR, "agents", "main", "agent", "auth-profiles.json"),
    path.join(BACKUP_DIR, "config", "agent", "auth-profiles.json")
  );
  await copyRedactedJsonIfExists(
    path.join(CONFIG_DIR, "agents", "main", "agent", "auth.json"),
    path.join(BACKUP_DIR, "config", "agent", "auth.json")
  );
  await copyRedactedJsonIfExists(
    path.join(CONFIG_DIR, "identity", "device-auth.json"),
    path.join(BACKUP_DIR, "config", "identity", "device-auth.json")
  );

  // Workspace top-level files
  for (const file of WORKSPACE_FILES) {
    await copyIfExists(path.join(WORKSPACE_DIR, file), path.join(BACKUP_DIR, "workspace", file));
  }

  // Workspace/memory/*.md and *.json
  const memoryDir = path.join(WORKSPACE_DIR, "memory");
  try {
    const entries = await fs.readdir(memoryDir);
    for (const entry of entries) {
      if (entry.endsWith(".md") || entry.endsWith(".json")) {
        await copyIfExists(
          path.join(memoryDir, entry),
          path.join(BACKUP_DIR, "workspace", "memory", entry)
        );
      }
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  // Useful automation scripts under ~/.openclaw/scripts
  const scriptsDir = path.join(CONFIG_DIR, "scripts");
  async function copyScriptsRecursive(srcDir, destDir) {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      const src = path.join(srcDir, entry.name);
      const dest = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        await copyScriptsRecursive(src, dest);
      } else if (entry.isFile() && (entry.name.endsWith(".sh") || entry.name.endsWith(".md"))) {
        await copyIfExists(src, dest);
      }
    }
  }
  try {
    await copyScriptsRecursive(scriptsDir, path.join(BACKUP_DIR, "scripts"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

let lastBackup = null;

app.use(express.static("public"));

app.get("/api/status", (_req, res) => {
  res.json({ version, lastBackup });
});

app.post("/api/backup", async (_req, res) => {
  try {
    await collectFiles();

    const git = simpleGit(BACKUP_DIR);
    await ensureGitRepo(git);
    await git.add("-A");

    const status = await git.status();
    if (status.isClean()) {
      lastBackup = { time: new Date().toISOString(), status: "success", message: "No changes to backup" };
      return res.json(lastBackup);
    }

    const timestamp = new Date().toISOString();
    await git.commit(`Backup ${timestamp}`);

    lastBackup = { time: timestamp, status: "success", message: "Backup created" };
    res.json(lastBackup);
  } catch (err) {
    lastBackup = { time: new Date().toISOString(), status: "error", message: err.message };
    res.status(500).json(lastBackup);
  }
});

app.post("/api/push", async (_req, res) => {
  try {
    if (!REMOTE_URL) {
      return res.status(400).json({ status: "error", message: "BACKUP_REMOTE_URL not configured" });
    }

    const git = simpleGit(BACKUP_DIR).env("GIT_SSH_COMMAND", GIT_SSH_COMMAND);
    await ensureGitRepo(git);

    // Ensure there's at least one commit
    const log = await git.log().catch(() => null);
    if (!log || !log.total) {
      return res.status(400).json({ status: "error", message: "No backups yet. Run a backup first." });
    }

    const remotes = await git.getRemotes(true);
    const hasOrigin = remotes.some((r) => r.name === "origin");

    if (!hasOrigin) {
      await git.addRemote("origin", REMOTE_URL);
    } else {
      await git.remote(["set-url", "origin", REMOTE_URL]);
    }

    const branchSummary = await git.branchLocal();
    const branch = branchSummary.current || "master";

    try {
      await git.push("origin", branch, ["--set-upstream"]);
      return res.json({ status: "success", message: `Pushed to ${REMOTE_URL}` });
    } catch (pushErr) {
      const msg = String(pushErr?.message || pushErr || "");
      const nonFastForward =
        /non-fast-forward|fetch first|failed to push some refs|Updates were rejected/i.test(msg);

      if (!nonFastForward) throw pushErr;

      // Auto-heal divergent history: sync to remote head, recreate backup commit, push again.
      await git.fetch("origin", branch);
      await git.reset(["--hard", `origin/${branch}`]);

      await collectFiles();
      await git.add("-A");
      const status = await git.status();
      if (!status.isClean()) {
        const timestamp = new Date().toISOString();
        await git.commit(`Backup ${timestamp} (auto-resync)`);
      }

      await git.push("origin", branch, ["--set-upstream"]);
      return res.json({
        status: "success",
        message: `Remote had new commits. Auto-resynced and pushed latest backup to ${REMOTE_URL}`,
      });
    }
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/download", async (_req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `openclaw-backup-${timestamp}.tar.gz`;

    execSync(`tar -czf /tmp/${filename} --exclude='.git' -C ${BACKUP_DIR} .`, { timeout: 30000 });

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/gzip");

    const stream = require("fs").createReadStream(`/tmp/${filename}`);
    stream.pipe(res);
    stream.on("end", () => {
      require("fs").unlinkSync(`/tmp/${filename}`);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`OpenClaw Backup running on port ${PORT}`);
});
