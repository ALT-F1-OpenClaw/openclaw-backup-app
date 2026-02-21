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

const SENSITIVE_PATTERN = /token|key|password|secret/i;

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
  // Redact and copy openclaw.json
  const openclawSrc = path.join(CONFIG_DIR, "openclaw.json");
  try {
    await copyRedactedJson(openclawSrc, path.join(BACKUP_DIR, "config", "openclaw.json"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  // Copy node.json as-is
  const nodeSrc = path.join(CONFIG_DIR, "node.json");
  try {
    await copyFile(nodeSrc, path.join(BACKUP_DIR, "config", "node.json"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  // Copy workspace top-level files
  for (const file of WORKSPACE_FILES) {
    const src = path.join(WORKSPACE_DIR, file);
    try {
      await copyFile(src, path.join(BACKUP_DIR, "workspace", file));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  // Copy workspace/memory/*.md
  const memoryDir = path.join(WORKSPACE_DIR, "memory");
  try {
    const entries = await fs.readdir(memoryDir);
    for (const entry of entries) {
      if (entry.endsWith(".md")) {
        await copyFile(
          path.join(memoryDir, entry),
          path.join(BACKUP_DIR, "workspace", "memory", entry)
        );
      }
    }
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
