#!/usr/bin/env python3
from pathlib import Path
import os, datetime

tag=os.environ.get('TAG','v0.0.0')
kind=os.environ.get('KIND','minor')
status=os.environ.get('TEST_STATUS','unknown')
out=Path(f'docs/tutorials/{tag}.md')
out.parent.mkdir(parents=True, exist_ok=True)
now=datetime.datetime.utcnow().isoformat()+"Z"
out.write_text(f'''# Release Tutorial {tag}\n\nGenerated: {now}\n\n## Scope\n- Release type: **{kind}**\n- Test status: **{status}**\n\n## Pipeline Overview\n\n![Update flow](../update-flow-4k.png)\n\n![Dev vs Staging](../dev-staging-architecture-4k.png)\n\n## Operator Steps\n1. Confirm image published for `{tag}` in GHCR and `latest` updated.\n2. Restart environments:\n   - `backup-staging-restart`\n   - `backup-dev-restart`\n   - or `backup-all-restart`\n3. Verify:\n   - `curl http://127.0.0.1:3100/api/status`\n   - `curl http://127.0.0.1:3101/api/status`\n4. Validate backup + push from UI.\n\n## Test Matrix\n- Container starts: required\n- `/api/status` version check: required\n- `/api/backup`: required\n- Push auto-resync behavior: required\n- Read-only mount flags: required\n\n''')
print(out)
