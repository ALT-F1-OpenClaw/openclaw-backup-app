#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import os
import re
import textwrap


def safe_tag(value: str) -> str:
    """Allow only release-tag-like filenames."""
    return value if re.fullmatch(r"v\d+\.\d+\.\d+", value or "") else "v0.0.0"


tag = safe_tag(os.environ.get("TAG", "v0.0.0"))
kind = os.environ.get("KIND", "minor")
status = os.environ.get("TEST_STATUS", "unknown")
out = Path(f"docs/tutorials/{tag}.md")
out.parent.mkdir(parents=True, exist_ok=True)
now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

content = textwrap.dedent(
    f"""\
    # Release Tutorial {tag}

    Generated: {now}

    ## Current use cases

    The current OpenClaw Backup app is designed for these day-to-day operations:

    - **One-click backup** of OpenClaw configuration and workspace metadata
    - **Safe redaction** of sensitive values before storing backup snapshots
    - **Git-based history** of backup snapshots for auditability and rollback
    - **Push to remote backup repository** with auto-recovery on non-fast-forward
    - **Downloadable archive export** for offline copy/transfer
    - **Environment-aware operation** (dev/staging/production indicator)

    ## Current application screenshot

    ![Current running app UI](./{tag}-app.png)

    ## Scope
    - Release type: **{kind}**
    - Test status: **{status}**

    ## Pipeline Overview

    ![Update flow](../update-flow-4k.png)

    ![Dev vs Staging](../dev-staging-architecture-4k.png)

    ## Operator Steps
    1. Confirm image published for `{tag}` in GHCR and `latest` updated.
    2. Restart environments:
       - `backup-staging-restart`
       - `backup-dev-restart`
       - or `backup-all-restart`
    3. Verify:
       - `curl http://127.0.0.1:3100/api/status`
       - `curl http://127.0.0.1:3101/api/status`
    4. Validate backup + push from UI.

    ## Test Matrix
    - Container starts: required
    - `/api/status` version check: required
    - `/api/backup`: required
    - Push auto-resync behavior: required
    - Read-only mount flags: required
    """
)

out.write_text(content + "\n", encoding="utf-8")
print(out)
