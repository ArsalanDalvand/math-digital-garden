# Comments on default notes

## Contract and plan

Default canonical notes have a shared comment thread independent of personal
forks/publications. Signed-in members can read, comment, reply, edit/delete their
own comments. Authors/admins can resolve canonical threads. Anonymous visitors
see a sign-in prompt. Existing published personal-note comments remain separate.

Reuse library comment UI and handlers. Migration 0008 adds a nullable canonical
note target, makes the personal item target nullable and enforces exactly one
target. All existing comment rows remain attached to their original item.
Reject cross-note replies, foreign edits, missing notes, CSRF and stale responses.
Opening comments must not create a fork or personal library item. Show explicitly
that these comments belong to the site's original note, including on personal edits.

Verify with two students, author, anonymous, existing personal comments, migration
rerun/preservation, frontend checks and a real-browser synthetic note. Back up and
rehearse before deploying 0008 and restarting this project's backend. User approval
for this project's migrations/deployment persists; no renewed approval is needed.

## Acceptance and deployment (2026-10-17)

- Original schema 0005 imported the current comment model, which would add future
  columns prematurely on fresh installs. Its comment table definition is now frozen
  to the original columns. Both fresh upgrade and 0007->0008 work; rerun is a no-op.
- Full backend suite: 68 passed, zero skipped, exit 0, independent PostgreSQL.
  Includes two students/author/anonymous, own edits/deletes, cross-target replies,
  canonical resolution and unchanged personal-publication ACL. Tests originally
  failed because the route did not exist; final route acceptance is green.
- Full frontend suite: 127 passed, zero skipped, exit 0. Includes comments without
  materialization/publication and late-response invalidation. TypeScript exit 0;
  production build completed in 72.18 seconds, exit 0. Ruff touched files: exit 0.
- Main-site Chrome journey: 7 checks passed, real backend, synthetic original note
  and two students. Comments/replies work, foreign editing is rejected, anonymous
  visitors see sign-in, and mobile RTL fits. No JavaScript errors. An earlier
  browser run failed on a malformed test selector; corrected run passed.
- Live backup restored independently, rehearsed migration and rerun. All 16 old
  tables matched row fingerprints before/after (the new null column excluded).
  Main database upgraded to 0008 and backend 8003 restarted; frontend remains 4321.
  This is the same original database, not the synthetic test database.

Commands from this checkout (with independent `DATABASE_URL`/`TEST_DATABASE_URL`):
`env -u LD_PRELOAD timeout 120s .venv/bin/python -m pytest -q --tb=short`,
`env -u LD_PRELOAD timeout 120s npm --prefix frontend test`,
`env -u LD_PRELOAD timeout 120s npm --prefix frontend run tsc`,
`env -u LD_PRELOAD TMPDIR=/home/a7vat4r/.tmp timeout 240s npm --prefix frontend run build`.
For focused API tests add `-p tests.test_workspace tests/test_canonical_library.py`.

Evidence: `../../logs/canonical-comments-2026-10-17/`. Private backup/runtime details
are under the path recorded by `/home/a7vat4r/.tmp/garden-current-deployment`.
No dependencies were added. Git remains unborn on `feat/phase-1-foundation`; no
unrelated initial commit was created. Scoped source archive/patch preserve recovery.
Browser author moderation is covered by API tests, not an author browser journey.
