# Legacy account/library deployment and rollback

Current revision is **0008** as of 2026-10-17; canonical comments are deployed.
See [latest evidence](32-CANONICAL-COMMENTS.md#acceptance-and-deployment-2026-10-17).
The sections below retain historical deployment checkpoints. Do not rerun their
revision/PID assumptions. The latest private runtime/backup pointer is
`/home/a7vat4r/.tmp/garden-current-deployment`.

## Current status: schema 0007

The canonical-menu deployment on 2026-10-16 completed with user approval: frontend
4321, backend 8003, original database at 0007. Backup restoration, preservation of
15 existing tables, migration rerun, 186 tests and 8 live browser checks passed.
See [current deployment evidence](30-CANONICAL-FULL-MENU.md#live-deployment-completed).
The user now authorizes routine project database transfers/migrations/deployment
without repeated confirmation; normal backups and project boundaries still apply.

The 0006 procedure below is historical, including its older approval boundary.
Do not execute its old PID/revision checks or redirect writes to backend 8001:
old writers cannot synchronize the new linked fork/library records. Preserve new
writes and reconcile them before any recovery to old application code. No downgrade
or stale-dump overwrite is part of routine recovery.

## Historical 0006 deployment

Prepared and executed with explicit user approval on 2026-10-16. Backup restore,
rehearsal, live upgrade to `0006`, backend `8003`, and frontend `4321` switch succeeded.
The original pre-deployment observations and procedure below remain for provenance;
do not rerun the `0002` precondition against the now-upgraded database. See
[deployment results](28-DOCMOST-FEATURE-ACCEPTANCE.md#approved-live-deployment).
It applies only to `math-digital-garden`; it does not deploy
Atomic, Docmost, Dify or other containers. Commands assume a private operator terminal,
no shell tracing, and the current Linux user. Keep database archives outside the
workspace and never attach them to a PR, chat, screenshot or shared log.

## Read-only observed state before deployment

- Live frontend: `127.0.0.1:4321`, PID `47011`, Astro **dev**, API upstream
  `http://127.0.0.1:8001`; its source reloads when this checkout changes.
- Live backend: `127.0.0.1:8001`, PID `49738`, `.venv/bin/python -`, started
  2026-10-16 17:20:30 local time. No reload argument. OpenAPI currently exposes
  **zero** account/library routes, so current code has not silently replaced it.
- Isolated frontend/backend: `4322`/`8002`; backend PID `453005` runs Uvicorn
  `--reload`, with database `garden_docmost_20261016_test`. Never use this test
  environment file for deployment.
- Live DB container: `math_garden_db`, image `pgvector/pgvector:pg16`, Compose
  project `math-digital-garden`, service `db`, volume
  `math-digital-garden_postgres_data`, restart `unless-stopped`.
- Live Alembic revision read directly from configured `POSTGRES_DB`: **0002**.
  Upgrade to `0006` therefore also applies additive `0003` (`ai_conversations`),
  followed by account columns `0004`, document tables `0005`, favorites `0006`.
  No existing note/fork content is rewritten; no AI behavior is enabled by this plan.
- Compose contains the DB service only. No app systemd unit was found. Do not run
  `docker compose down`, recreate the DB container, remove a volume, or touch port
  8000 (another product uses it).

Immediate limitation: live Astro dev can already show newly edited UI while its
old backend lacks the routes/schema. Failed new-feature requests are possible until
approved deployment. The old backend itself does not auto-reload. Re-check PIDs,
ports, revision and test gates immediately before execution; PIDs are observations,
not permanent service identifiers.

## Preconditions and rollback strategy

Backend gate: 61 tests passed against isolated PostgreSQL, Ruff clean. Dedicated
migration evidence preserved user/session/canonical/fork/revision/proposal/bookmark
rows across `0003 -> 0006`, rerun and `pg_dump`/`pg_restore`; see
[personal-library-spec.md](personal-library-spec.md). Frontend/build/browser gates
must be complete on the final source tree before requesting live approval.

Keep old backend `8001` alive as the compatible fallback. Start the reviewed backend
on unused port **8003**, migrate once, then restart only frontend `4321` with upstream
`8003`. Rollback points frontend back to old backend `8001`, leaving all added DB
columns/tables intact. Never run Alembic downgrade: it would delete new user data.
The old UI code checkpoint is incomplete: `../logs/docmost-workspace-2026-10-16/
source-before.tar.gz` contains five frontend files only. Do not claim a complete
historical source rollback. During backend fallback, new account/library UI is
unavailable; data remains in the database for forward repair.

## 1. Prepare private backup and reviewed-source checkpoint

Run only after explicit live deployment approval. All following blocks are in the
same operator shell unless a block explicitly uses Python.

```bash
set -euo pipefail
set +x
umask 077
cd /home/a7vat4r/projects/arsalandalvand/Math-Garden-Workspace/math-digital-garden
DEPLOY_DIR="/home/a7vat4r/.local/state/math-garden-deploy/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEPLOY_DIR"
export DEPLOY_DIR
# Capture source only, not .env, databases, uploads, node_modules or private vaults.
tar --exclude=__pycache__ --exclude='*.pyc' \
  -czf "$DEPLOY_DIR/reviewed-source.tar.gz" backend/app backend/migrations \
  backend/alembic.ini frontend/src frontend/public frontend/astro.config.mjs \
  frontend/package.json package.json pyproject.toml requirements.lock pnpm-lock.yaml
sha256sum "$DEPLOY_DIR/reviewed-source.tar.gz" > "$DEPLOY_DIR/source.sha256"
```

If a named config file differs from the reviewed checkout, stop and correct this
explicit list before continuing; do not widen it to the entire workspace.

## 2. Maintenance, final consistent backup and restore rehearsal

Re-check the process belongs to this app before stopping it. Close active editors
and announce maintenance through the already approved channel. Stop only the live
frontend to remove browser write traffic. Do not terminate backend `8001`: it is the
rollback process. Confirm no direct API clients/background content importers are
writing; if they exist, stop them explicitly before taking the backup.

```bash
ps -p 47011 -o pid,args
readlink /proc/47011/cwd
kill -TERM 47011
# Wait for graceful frontend shutdown before continuing.
for attempt in $(seq 1 30); do
  if ! kill -0 47011 2>/dev/null; then break; fi
  sleep 1
done
if kill -0 47011 2>/dev/null; then echo 'Frontend still running; stop here'; exit 1; fi
# Uses container-owned identity only; no password enters command arguments or output.
timeout 120 docker exec math_garden_db sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$DEPLOY_DIR/live-before-0006.dump"
test -s "$DEPLOY_DIR/live-before-0006.dump"
sha256sum "$DEPLOY_DIR/live-before-0006.dump" > "$DEPLOY_DIR/database.sha256"
# This verifies archive readability without writing to the live database.
docker exec -i math_garden_db pg_restore --list \
  < "$DEPLOY_DIR/live-before-0006.dump" > "$DEPLOY_DIR/archive-contents.txt"
REHEARSAL_DB="garden_deploy_restore_$(date -u +%Y%m%d%H%M%S)"
docker exec math_garden_db sh -c \
  'exec createdb -U "$POSTGRES_USER" -T template0 "$1"' sh "$REHEARSAL_DB"
docker exec -i math_garden_db sh -c \
  'exec pg_restore -U "$POSTGRES_USER" --exit-on-error --no-owner -d "$1"' \
  sh "$REHEARSAL_DB" < "$DEPLOY_DIR/live-before-0006.dump"
docker exec math_garden_db sh -c \
  'exec psql -U "$POSTGRES_USER" -d "$1" -Atc "SELECT version_num FROM alembic_version"' \
  sh "$REHEARSAL_DB"
# Expected 0002 at observed state; if different, stop and review migration range.
```

The rehearsal DB is private and contains real data. Retain with restrictive operator
access for the maintenance window; do not expose it through test servers or publish
its name/content. No cleanup/drop is included in this plan.

## 3. Migrate with credentials in memory, start candidate backend

This block reads only three DB environment values from Docker inspection into
Python memory. It preserves application configuration from the existing `.env`;
secrets are never printed, added to process arguments, or written into new env files.
It verifies live revision before migrating and keeps old backend `8001` untouched.

```bash
.venv/bin/python - <<'PY'
import json, os, socket, subprocess
from pathlib import Path
from urllib.parse import quote

root = Path.cwd()
private = Path(os.environ['DEPLOY_DIR'])
with socket.socket() as sock:
    assert sock.connect_ex(('127.0.0.1', 8003)) != 0, 'Port 8003 is occupied'
info = json.loads(subprocess.check_output(['docker','inspect','math_garden_db']))[0]
values = dict(part.split('=',1) for part in info['Config']['Env'] if '=' in part)
url = ('postgresql+asyncpg://' + quote(values['POSTGRES_USER'], safe='') + ':' +
       quote(values['POSTGRES_PASSWORD'], safe='') + '@127.0.0.1:5432/' +
       quote(values['POSTGRES_DB'], safe=''))
env = {**os.environ, 'DATABASE_URL': url, 'FRONTEND_ORIGIN':'http://127.0.0.1:4321'}
env.pop('LD_PRELOAD', None)
revision = subprocess.check_output(['docker','exec','math_garden_db','sh','-c',
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT version_num FROM alembic_version"'])
assert revision.decode().strip() == '0002', 'Live revision changed; review before migration'
log = open(private/'migration-and-backend.log', 'ab', buffering=0)
result = subprocess.run([str(root/'.venv/bin/alembic'), '-c', 'backend/alembic.ini',
                         'upgrade', '0006'], env=env, stdout=log, stderr=log, timeout=120)
assert result.returncode == 0, 'Migration failed; keep maintenance, inspect private log'
process = subprocess.Popen([str(root/'.venv/bin/uvicorn'), 'backend.app.main:app',
                            '--host','127.0.0.1','--port','8003'], cwd=root, env=env,
                           stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                           start_new_session=True)
(private/'backend.pid').write_text(str(process.pid)+'\n')
print('Migration exit 0; candidate backend started on 8003')
PY
curl --fail --silent http://127.0.0.1:8003/health
# Expected unauthenticated statuses: account=401; library owner list=401.
curl --silent --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:8003/api/account
curl --silent --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:8003/api/library/items
docker exec math_garden_db sh -c \
  'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT version_num FROM alembic_version"'
# Expected 0006. Do not enable traffic on a migration/health failure.
```

If `.env` enables secure cookies for an HTTPS deployment, preserve that setting; do
not weaken it for a localhost example. The existing deployment here is loopback.

## 4. Restart frontend and verify

Use the same dev command as the current deployment; moving to a production process
manager is a separate change. The final source was already built and tested before
approval; avoid a new dependency install during maintenance.

```bash
nohup env -u LD_PRELOAD API_BASE_URL=http://127.0.0.1:8003 \
  npm --prefix frontend run dev -- --host 127.0.0.1 --port 4321 --strictPort \
  > "$DEPLOY_DIR/frontend.log" 2>&1 < /dev/null &
echo "$!" > "$DEPLOY_DIR/frontend-launcher.pid"
curl --fail --silent --output /dev/null http://127.0.0.1:4321/
```

Wait for startup before curl; inspect only private logs if it fails. Verify in an
existing authorized browser: existing canonical read, exact personal fork content,
bookmark, account profile, create/save/history/trash/restore in a clearly synthetic
private library note; public/unlisted snapshot and revocation; sign out/in identity
clearing; 390px and desktop layout. Remove only synthetic data through normal trash
controls. Do not overwrite an existing real note to test saving. Keep backend `8001`
and the private backup until user acceptance and the agreed retention period.

## Rollback without losing new writes

On migration/candidate failure keep maintenance; old backend `8001` remains alive.
If the new frontend was started, find its actual Astro PID by `ss -ltnp` and confirm
cwd/command before `kill -TERM`; the recorded npm launcher PID can differ from the
listening child PID. Restart frontend with the previous backend upstream:

```bash
# Only after stopping the confirmed current 4321 Astro listener.
nohup env -u LD_PRELOAD API_BASE_URL=http://127.0.0.1:8001 \
  npm --prefix frontend run dev -- --host 127.0.0.1 --port 4321 --strictPort \
  > "$DEPLOY_DIR/frontend-rollback.log" 2>&1 < /dev/null &
curl --fail --silent http://127.0.0.1:8001/health
curl --fail --silent --output /dev/null http://127.0.0.1:4321/
```

Keep database at `0006`; the old backend ignores additive columns/tables. Preserve
all new account/library/favorite data for forward repair. New feature UI requests
will fail against the old API; communicate feature unavailability. If reliable old
UI is required, keep maintenance until a fully verified previous source release is
available: the five-file checkpoint is insufficient for full application rollback.

Never restore the pre-upgrade dump over a database that accepted new writes. For a
confirmed corruption incident, stop all writers, take an additional private current
snapshot, restore the old archive into a **new** isolated database, reconcile later
writes, then get explicit approval for a database switch. Do not use `--clean`,
`dropdb`, volume deletion, downgrade, or blind source extraction into the active
checkout as routine rollback.

## Documentation source and approval boundary

Current PostgreSQL 16 backup syntax was fetched with Context7:
`library PostgreSQL`, then docs `/websites/postgresql_16` for custom archive restore
into a new empty database. Official references:
https://www.postgresql.org/docs/16/app-pgdump.html and
https://www.postgresql.org/docs/16/app-pgrestore.html.

Only read-only runtime/configuration/schema inspection was performed when preparing
this runbook. Subsequent explicit user approval covered: private live backup/restore rehearsal,
upgrade observed live `0002` through `0006`, candidate backend on `8003`, frontend
`4321` switch, and this compatibility rollback. That deployment is now complete;
approval of source code alone does not authorize future live deployments.
