# Canonical notes: complete personal actions

Current status: deployed on `http://127.0.0.1:4321`, backend `8003`, schema `0007`.
The isolation and pending-decision sections below record the pre-deployment stage;
they are superseded by [the completed deployment](#live-deployment-completed).

## Contract and plan

1. Reuse LibraryActions on `/notes/<slug>`: no copy prompt, duplicate entry or URL
   change. Reading does not create a personal copy. First personal action creates
   one owner-scoped association idempotently, preserving an existing fork.
2. Add migration 0007 with a separate canonical-to-library association table.
   Keep fork and library content/history in the same transaction. Lock order is
   canonical note, fork, library item. Existing reset/proposal behavior survives.
3. Share/publish the saved personal revision explicitly using existing snapshot,
   attachment, comment, favorite and watch APIs. Later edits remain private until
   republished. Original attachments are never inherited.
4. Rename, move and trash affect this user's library only. Keep canonical location
   until an explicit move; hide the original slot after a move/trash. Owner-only
   metadata requests accept at most 100 slugs; no private content is needed for
   tree construction. Clear all overlays/pending UI on identity changes.
5. Test API ownership, CSRF, raw content, history, publication, restore, placement,
   migration preservation/idempotency; frontend stale responses and shared menu;
   build and real-browser two-user journey on independent data.

## Scope

Backend: library models/routes, fork persistence, migration, existing test callers.
Frontend: shared menu, canonical page, editor metadata, sidebar/library overlays,
linked-library redirect and tests. No dependency, AI, framework or vault changes.
Docmost reference: `page-header-menu.tsx` and its existing share/history/attachment
actions. Preserve the current product theme; local Better Design navigation,
spacing and review guidance applies. Gemini delegation unavailable: configured
model `ag/gemini-3.8-flash-high` is rejected by the agent service.

## Development isolation

Work in `build-cache/legacy-canonical-menu`, copied byte-for-byte from the verified
2026-10-16 source archive. Existing development site hot-reloads source, so changes
are tested separately before deployment. No live DB migration or restart occurs.
Schema 0007 deployment requires explicit approval after independent acceptance.
The original repository remains unborn; no broad initial commit is authorized.

## Implemented

- `LibraryCanonical` uniquely associates each owner/note with one `LibraryItem`.
  GET does not create anything; POST resolves/creates transactionally, serializing
  concurrent initial actions on the canonical row. Existing fork revisions are
  copied with their original timestamps; raw content, including empty forks, is
  retained. Fork save/reset and library revision restore update both stores in one
  transaction. Publication remains an explicit frozen snapshot.
- `/api/library/canonical/metadata` accepts at most 100 slugs and returns only this
  owner's title/hidden overlay. Sidebar requests metadata per expanded folder;
  browser requests the current folder. Public metadata is never mutated/cached
  with private titles. Identity generation guards discard late responses.
- Shared actions resolve lazily at the original URL. The same favorite, watch,
  attachment, comment, history and publication endpoints apply. Linked `/library`
  links redirect to `/notes`; explicit move replaces the original tree slot.
- Deleted obsolete `frontend/src/scripts/canonical-actions.ts`; its previous
  independent-copy behavior remains recoverable from the pre-change source
  archive. Former raw-byte and stale-history tests now exercise the shared menu.
- Canonical title storage uses the existing library's 255-character limit; original
  canonical title/content are preserved. Uploaded personal attachments are separate
  from original assets. Comments continue to require explicit share/publication.

## Verification and limitations

Backend uses real isolated PostgreSQL, not mock ownership. Frontend unit tests use
jsdom. Browser journeys use Chrome through agent-browser, real FastAPI and a fresh
synthetic note/accounts on ports 4323/8004. These are not tests against live notes.
Migration recovery uses only new `_test` databases. Existing AI/provider tests
remain in the full suite; they do not establish a real AI-provider connection.
No dependency or lockfile changed. No live source, database or service changed.

Reproduce from this candidate with existing dependencies:

```sh
# Export DATABASE_URL / TEST_DATABASE_URL for an isolated database ending _test.
# Do not print or put credentials in shell history.
env -u LD_PRELOAD timeout 180s .venv/bin/python -m pytest -q --tb=short
env -u LD_PRELOAD timeout 180s .venv/bin/python tests/check_canonical_migration.py
env -u LD_PRELOAD TMPDIR=/home/a7vat4r/.tmp timeout 90s npm --prefix frontend test
env -u LD_PRELOAD timeout 90s npm --prefix frontend run tsc
env -u LD_PRELOAD timeout 120s npm --prefix frontend run check
env -u LD_PRELOAD TMPDIR=/home/a7vat4r/.tmp API_BASE_URL=http://127.0.0.1:8004 timeout 240s npm --prefix frontend run build
# Preview: cwd frontend, HOST=127.0.0.1 PORT=4323 API_BASE_URL=http://127.0.0.1:8004 node dist/server/entry.mjs
# Seed only the synthetic docmost-browser-fixture note before the browser journey.
env -u LD_PRELOAD CANONICAL_EVIDENCE_DIR=/absolute/evidence/path timeout 480s node tests/browser/canonical-actions.mjs
```

The migration check creates uniquely named synthetic databases and preserves them;
its JSON output records both source and restore names. `pg_dump`/`pg_restore`
execute inside the existing PostgreSQL container. A migration rerun is idempotent
through Alembic revision tracking, not unconditional replay of CREATE TABLE.

## Pending deployment decision

User approval is needed for the following concrete live change because the previous
approval covered only 0002->0006, not a new migration or backend restart:

1. Pause editing for the short deployment window; take a fresh restricted-access
   live pg_dump and source snapshot. Verify restoration on an independent DB.
2. Recheck that original source hashes match the recorded baseline; preserve any
   new user edits before applying the scoped patch. Apply only listed source files
   from the verified candidate to `math-digital-garden`, plus the one recorded
   deletion. Do not copy dependencies, generated output or private files.
3. Upgrade live schema from 0006 to 0007 (adds one empty association table, does
   not rewrite any existing row). Restart only the approved legacy backend and
   frontend; keep the same live database and user URL 4321. No Atomic/Docker/vault
   or unrelated service changes are needed.
4. Verify authenticated reading and menu resolution without publishing/modifying
   an existing user note. Use the independent journey for destructive test actions.

Rollback before accepting new writes: restore previous source/runtime with schema
0007 retained (additive). After accepting writes, first pause editing and preserve
all new data; do not downgrade/drop the association table or restore a stale DB.
Old writers do not synchronize linked fork/library snapshots, so they must not be
used as a writable fallback after activation. Recovery then requires reconciliation
from the authoritative personal forks before re-enabling new writers.

Do not claim this candidate is active on 4321 until that approved step is complete.

## Acceptance (2026-10-16)

| Check | Selected/result | Exit |
| --- | --- | --- |
| Full backend suite | 67 passed, zero skipped; includes author/two-student/anonymous ACL | 0 |
| Full frontend suite | 119 passed, zero skipped; includes stale private title/history/resolver responses | 0 |
| TypeScript | `tsc --noEmit`, no diagnostics | 0 |
| Astro check | 80 source files, zero errors/warnings/hints | 0 |
| Production build | Complete at 22:23:25 local; 76.18 seconds | 0 |
| Migration + recovery | 0006->0007; 15 pre-existing tables, 8 populated fixture tables unchanged; rerun/restore identical | 0 |
| Real browser | 20 checks on final build; two students, anonymous, desktop/mobile RTL, zero JS errors | 0 |
| Ruff touched Python | No findings | 0 |

Backend author behavior is covered by real API tests; the browser role journey uses
students and anonymous. Stale-response races are injected in jsdom tests, not
claimed as network-race browser evidence. Browser editor/publication uses real
persisted raw content and HTTP ACL checks. Attachment byte equality is checked in
browser; published attachment/revocation and reset synchronization are checked in
API tests. Concurrent resolver requests from the browser return the same owner ID.

Visual review: desktop 1440x1000 and mobile 390x844 screenshots were inspected.
Dialogs fit viewport and retain native focus trapping/Escape; touch controls retain
44px targets. Restored existing product dialog colors/border/radius; no design
system change. Local Better Design navigation/spacing/review resources were used;
no Better Design MCP result is claimed. No JS browser errors; no unexpected 5xx
requests observed on the isolated backend.

Evidence: `../../logs/canonical-menu-2026-10-16/acceptance.json`, test logs, browser
report/screenshots and `source-manifest.json`. Paths are workspace-relative in the
manifest. Baseline branch is `feat/phase-1-foundation`, HEAD UNBORN. No commit was
created: staging the unrelated untracked project as an initial commit is outside
this change. The verified source archive and scoped patch provide recovery.

## Live deployment completed

Executed on 2026-10-16 after explicit approval. The user also authorized routine
database transfers, migrations and deployment for this project without repeated
confirmation. Preserve normal backups and scope changes to this project.

- Verified all 20 scoped patch entries against the source manifest before applying.
- Stopped the main frontend/backend, backed up the live database (195089 bytes),
  restored it independently and rehearsed 0006->0007. All 15 pre-existing tables
  retained identical row fingerprints. Live upgrade and rerun both exited 0;
  the new association table was empty before traffic resumed.
- Main checkout now serves frontend 4321 and backend 8003 with the original DB.
  Health and site requests return 200. Local processes are not boot services.
- Re-ran `npm --prefix frontend test` and `.venv/bin/python -m pytest -q --tb=short`
  from the deployed checkout: 119 frontend and 67 backend tests, zero skipped,
  both exit 0. Backend tests used an independent test database.
- Live Chrome smoke passed 8 checks, exit 0: authenticated reading without a fork,
  full menu, private resolution at the same URL, mobile dialog, logout isolation,
  unchanged canonical Markdown and no JavaScript errors. The account was synthetic;
  no real note was edited or published. Deleted that exact account and verified
  its dependent rows absent in seven tables. Cleanup initially rejected normalized
  email casing without deleting anything; UUID plus case-insensitive email matched
  the registered test account and cleanup exited 0.
- The independent 20-check browser journey remains the publication/editing evidence;
  live smoke deliberately did not publish a real note. TypeScript, Astro and build
  results above apply to the same deployed application source; later edits only
  update documentation and deployment evidence.

Sanitized evidence: `../../logs/canonical-menu-2026-10-16/deployment.json` and
`live-source-{frontend,backend}-tests.log`. Private backup, original source archive,
runtime configuration and restore evidence are retained under
`/home/a7vat4r/.local/state/math-garden-deploy/20261016T190615Z-canonical-menu`.
Never publish this private directory. Backend 8001 is not a safe writable fallback
for linked notes; use the recovery constraints above. No initial Git commit was
created in the unborn repository.
