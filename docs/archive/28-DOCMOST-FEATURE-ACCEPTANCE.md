# Docmost-inspired account and personal library acceptance

Date: 2026-10-16. Target: `math-digital-garden`, Astro/React/CodeMirror and
FastAPI/PostgreSQL. This does not change Atomic or import a vault. Specification:
[19-DOCMOST-PRODUCT-FEATURES.md](19-DOCMOST-PRODUCT-FEATURES.md).

Status update: the pre-deployment limits below record acceptance before approval.
Live deployment was subsequently approved and completed; see
[Approved live deployment](#approved-live-deployment).

## Delivered behavior

- Account identity comes from the server: name/avatar menu, profile and preferences
  pages, current-password email/password changes, session revocation, decoded raster
  avatars. Only administrators see the review navigation. Header search is removed;
  sidebar search remains. Library has a separating line.
- Existing CodeMirror gains a fixed formatting toolbar, safe link insertion, math,
  lists, tables and undo/redo. Source Markdown and leading YAML remain preserved.
  Default edit mode preserves an existing personal fork, including an empty fork.
- Private folders/notes support creation, rename, bounded navigation, move, trash
  and restore. Notes have raw revisions/comparison/restore, authorized attachments,
  favorites and watched-publication updates. No email delivery is claimed.
- Share/publish explicitly snapshots one saved note and its current attachment
  whitelist. Future draft edits remain private; unlisted links rotate/revoke.
  Public pages omit owner/path metadata. Comments support one reply level, own edits,
  tombstone deletion and owner/admin resolution. Admin verification binds to a
  published revision; it does not add an author approval workflow.
- Original canonical notes and personal forks retain their existing workflow.
  Their menu adds raw copy, private history and an explicit independent private
  copy into the library. Publishing that copy never publishes/mutates the original.
- Presentation uses a native modal, title and heading/separator sections, keyboard
  navigation, optional browser fullscreen and focus return. Long sections scroll.
- Identity revalidation covers focus, visible tabs and bfcache. Late requests cannot
  refill cleared dialogs or navigate after a different identity; same-identity
  refresh preserves folder/form state. Preference writes can assert expected owner.

## Verification environment

Synthetic users/data only: frontend `127.0.0.1:4322`, backend `127.0.0.1:8002`,
PostgreSQL `garden_docmost_20261016_test`. Private connection settings are outside
Git at `/home/a7vat4r/.tmp/garden-docmost-test.env`. Do not print/source them into logs.
The browser role helper accepts only generated fixture emails and that exact DB.

Evidence root: `../logs/docmost-features-2026-10-16/`.
Commands use the repository cwd; npm commands use `frontend/`. All Node/browser
commands clear `LD_PRELOAD`, with `TMPDIR=/home/a7vat4r/.tmp`. Test commands have
90-240 second bounds. Tests are not run against live data.

| Gate | Command | Result |
| --- | --- | --- |
| Frontend unit/regression | `npm test` | Final log: `frontend-tests.log` |
| TypeScript | `npm run tsc` | Final log: `typescript.log` |
| Astro diagnostics | `npm run check` | Final log: `astro-check.log` |
| Production build | `npm run build` | Final log: `build.log` |
| Backend complete suite | `.venv/bin/python -m pytest -q --tb=short` | 63 passed, exit 0; `backend-tests.log` |
| Scoped Python lint | `.venv/bin/ruff check` on changed backend/migrations/tests | exit 0; `ruff.log` |
| Accounts browser | `.venv/bin/python tests/browser/account-settings.py <evidence>/accounts` | Real synthetic HTTP/browser; `accounts/result.json` |
| Library browser | `node tests/browser/library-acceptance.mjs` | 40 checks, exit 0; `library/report.json` |
| Canonical editor browser | `node tests/browser/canonical-actions.mjs` | 5 checks, exit 0; `canonical/report.json` |
| Existing shell/browser | `WORKSPACE_TEST_URL=http://127.0.0.1:4322/notes/docmost-browser-fixture WORKSPACE_EVIDENCE_DIR=<evidence>/shell node tests/browser/docmost-workspace.mjs` | 64 checks, exit 0; `shell/browser-results.json` |

Backend tests include real PostgreSQL account/library HTTP cases and existing unit
fakes; the account suite separately repeats checks with SQLite foreign keys. Browser
library/account/canonical cases use a real backend with synthetic data. Shell editing
and explicitly delayed-response lifecycle cases use synthetic fetch responses and
are **not** evidence of backend authorization. Profile/preferences accessibility
scans have zero reported WCAG A/AA violations; this is not a whole-product audit.

Independent migration preservation, repeat-upgrade and pg_dump/restore checks are
reproducible using `tests/check_library_migration.py`; commands and the comparison
of seven preexisting tables are in [personal-library-spec.md](personal-library-spec.md).
Live revision is still 0002; observed independent upgrade gate was 0003 to 0006.

## Regressions found and corrected

Browser checks caught a hidden admin link overridden by flex CSS, reading select
change not persisted, late default-mode initialization, personal draft replacement
when edit starts before preview, old dialog responses after close/identity change,
and enabled commands ignored while requests were pending. All have acceptance checks.
The two development servers initially shared Vite optimization cache and produced
504 module errors. The test server now uses an external native Astro config with a
separate cache under `frontend/node_modules/.vite-4322`; no custom CLI wrapper or
product configuration change was added. Keeping that cache outside node_modules
failed injected polyfill resolution; the successful location retains package lookup.

## Limits and release boundary

- No MFA/devices, export, print PDF, access-permission UI, new AI work or vault import.
- No live DB migration or live service restart. Source-hot-reloading frontend 4321
  still targets older backend 8001; new features there require deployment.
- Presentation has section slides, not automatic height pagination or laser pointer.
- Raw Markdown history comparison is side-by-side text; no new collaborative editor.
- Library metadata pages are bounded (sidebar 50, browser 100); modal lists continue
  explicitly in pages of 100 up to a visibly announced 1000-item ceiling.
- Avatar full decoding/reencoding does not claim malware scanning. Attachments remain
  octet-stream downloads; no new inline active-file rendering is enabled.
- Repository branch is `feat/phase-1-foundation`, HEAD is unborn. Existing entire
  repository was untracked at entry. No broad initial commit or staging of private
  data was performed; this report does not invent a commit SHA.
- Pillow 12.3.0 is the only dependency added in this slice, under the user's explicit
  permission for necessary dependencies; other package versions were not upgraded.

Deployment and non-destructive fallback are concrete in
[20-LEGACY-DEPLOYMENT-RUNBOOK.md](20-LEGACY-DEPLOYMENT-RUNBOOK.md). Approval must cover
private backup/restore rehearsal, live 0002-to-0006 upgrade and frontend/backend
switch. Downgrade or restoring a stale dump over later writes is not the rollback.

## Final built artifact

Final build started after the last product-source edit (20:33:16 local), completed
at 20:36:23 in 70.21 seconds, exit 0. `dist/server/entry.mjs` is running on test port
4322 with `API_BASE_URL=http://127.0.0.1:8002`, replacing only the test dev process.
This is Astro SSR, not Atomic's PWA pipeline; no service worker is part of this app.
Existing large-chunk warnings remain for the editor/drawing stack; no dependency
upgrade or bundle redesign was added to this feature slice.

Final frontend: **113 passed, zero skipped**, exit 0. TypeScript exit 0; Astro
checked 79 files with zero errors/warnings/hints, exit 0. Full backend: **63 passed**,
exit 0. Scoped Ruff exit 0. These are current executions, not reused historical logs.

The built output also passed the canonical journey (5 checks), library journey
(40 checks) and full account journey including two-tab logout. Account production
screenshots/results are under `accounts-production/`; library and canonical reports
were refreshed against production output. No live-data edits were made by any journey.

Production presentation additionally passed desktop1440/dark390 navigation, modal
focus/return, empty error list and identity cleanup. Evidence is `presentation/`.
Physical browser fullscreen and Safari were not tested.

A source-only recovery snapshot is kept at
`../archive/legacy-docmost-source-2026-10-16.tar.gz` with SHA256 beside it. It contains
reviewed application source, migrations, tests, package manifests/lockfiles and this
slice's docs, excluding dependencies, build output, databases, public/vault assets,
credentials and screenshots. Restore into a new empty directory for inspection;
never unpack over the active checkout. This is a snapshot, not a Git commit.

## Approved live deployment

Executed 2026-10-16 after explicit user approval of the runbook. Application source
was unchanged after the final build; 113 application/configuration files matched the
reviewed source archive. Subsequent edits only update deployment documentation.

- Main site: `http://127.0.0.1:4321`, original database and existing notes.
  Astro dev now uses `API_BASE_URL=http://127.0.0.1:8003`.
- New backend: Uvicorn `127.0.0.1:8003`, observed PID 618104. Frontend listener
  PID 618217. Old backend `8001`, PID 49738, remains available for limited fallback.
  PIDs are observations, not durable service identifiers.
- Independent production preview remains `4322` with backend `8002` and test DB.
- Live PostgreSQL moved from `0002` to `0006`; no vault import, publication,
  real-note edit, database container restart, or unrelated service change occurred.

Private recovery directory (outside Git/shared evidence):
`/home/a7vat4r/.local/state/math-garden-deploy/20261016T172422Z`.
It holds `live-before-0006.dump` (175087 bytes), SHA256 files, source archive,
`before-digests.json`, `result.json`, process IDs/logs, and `live-smoke.json`.
The local pointer is `/home/a7vat4r/.tmp/garden-current-deployment`.
Never publish these files or restore the dump over later writes.

| Executed gate | Result |
| --- | --- |
| `pg_dump` custom archive and `pg_restore` into independent DB | Exit 0; restore verified |
| `.venv/bin/alembic -c backend/alembic.ini upgrade 0006` on restored DB | Exit 0; rehearsal verified |
| Same upgrade on live DB, then repeated upgrade | Exit 0; revision 0006; idempotent |
| Preexisting table/column fingerprints before and after | All 8 tables preserved exactly; live unchanged since backup at upgrade start |
| HTTP health on 8001 and 8003 | Both 200 |
| Anonymous `/api/account` on 8003 and through 4321 | Both 401 |
| Anonymous `/api/library/items` through 4321 | 401; new API proxy works |
| `agent-browser --session garden-live-deploy` on existing canonical note | Loaded/hydrated; no page errors; no overflow at 1280 or 390px |
| Profile, preferences and library at 390px | All 3 routes loaded, required login, no horizontal overflow |

Browser commands use `env -u LD_PRELOAD TMPDIR=/home/a7vat4r/.tmp timeout 25s`.
Open each route with `agent-browser --session garden-live-deploy open <URL>`;
wait for island hydration and authentication completion, then inspect the DOM and
`errors`. The first library assertion exited 1 because it expected the literal
`وارد شوید` instead of the actual `وارد حساب شوید`. The corrected check waits for
authentication and matches the rendered login instruction; all three routes passed,
exit 0. No product change was needed. Final evidence is `live-smoke.json`.

Live smoke was read-only and anonymous. Authenticated write/account/share journeys
were tested against the independent production build above, not repeated on real
notes or accounts. Browser page errors were empty; expected anonymous HTTP 401s are
not application failures. This is not a new full-network or cross-browser audit.

For health checks use loopback without proxy, for example
`curl --noproxy '*' --fail http://127.0.0.1:8003/health`. Check schema read-only with
`docker exec math_garden_db sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT version_num FROM alembic_version"'`.
Use the runbook for process restart and fallback; do not repeat its initial migration
preconditions. Main frontend remains dev mode; processes have no automatic boot
startup. Fallback to 8001 preserves additive schema and data but disables new APIs;
it is not a complete historical UI rollback. No Git commit was created in the
preexisting unborn repository; the verified source snapshot preserves this delivery.
