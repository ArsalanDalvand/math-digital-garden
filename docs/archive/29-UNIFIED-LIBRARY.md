# Unified library

## Contract and plan (2026-10-16)

User approved one library without official/personal sections. Published canonical
notes appear for everyone in the same hierarchy. Existing owner forks override the
reader at the same canonical URL; editing never changes other accounts' copies.
Keep the existing fork store, original preview, raw Markdown and authorization.

1. Replace the two sidebar trees with one tree and one library destination. Reuse
   existing public catalogue and owner-scoped library APIs; no DB migration.
2. Put a plus control beside the tree title, following Docmost's space-sidebar and
   space-tree-row. Offer note/folder creation with a name, retained errors, cancel,
   keyboard focus, and direct editing after note creation. Owner folders also allow
   child creation. Canonical folders retain their publisher-controlled hierarchy.
3. Include canonical items in the library browser alongside owner items. Preserve
   favorites, watching, trash, rename/move and the older workspace history route.
4. Verify two students and anonymous, existing and empty forks, reload, identity
   cleanup, delayed requests, sidebar creation, RTL/mobile and final build.

Scope: Reader, navigation component/script, public metadata adapter, library browser,
entry links, note default edit query, regression tests and browser evidence. Public
tree responses contain only public labels/links, never owner data. All owner requests
remain uncached and are invalidated on identity changes. No live fixture writes.

Reference: `references/docmost/apps/client/src/features/space/components/sidebar/space-sidebar.tsx`
and `features/page/tree/components/space-tree-row.tsx`. Keep the existing product
theme; local Better Design navigation/spacing/review guidance and ui-ux-pro-max apply.
Gemini delegation failed because the configured model was unavailable.

## Implementation

`LibraryNavigation.astro` replaces the separate personal sidebar. Its shared root
sorts canonical hierarchy and authorized owner rows together. The plus beside the
title opens a native, labelled name/type dialog; owner folder rows have child-create
controls. Cancelling restores focus, pending submits cannot duplicate a create, and
identity changes clear owner nodes/forms and invalidate late responses. Successful
note creation navigates to its existing library route with `?edit=1`.

`GET /api/library-tree` is an Astro adapter over the existing public canonical
catalogue. It emits labels/links/hierarchy only, no note content or owner data, with
`no-store`. Canonical links retain `/notes/<slug>`; the existing preferred-version
reader loads only the current owner's fork, including empty content. No database
copy is created simply by reading. The unified library browser includes the same
canonical folders and owner items. Account/home entry links now lead there; the
older workspace history/proposal screen remains reachable as an activity link.

Private children load on expansion in pages of 50, with an explicit more button;
the management list keeps pages of 100. Publisher-controlled canonical folders
cannot be moved or given new children by a student. Users can create root folders
and notes, or children in their own folders. Sharing, publishing, original preview,
favorites, watching, history, attachments and comments keep their existing rules.

## Verification and evidence

Evidence: `../logs/unified-library-2026-10-16/`. Node/browser commands clear
`LD_PRELOAD` and use disk `TMPDIR=/home/a7vat4r/.tmp`. Cwd is `frontend/` for npm and
the project root for Python/browser scripts. Timeouts are 120s for unit/TypeScript,
180s for diagnostics/backend and 240s for build/browser journeys.

- `npm test`: 115 passed, zero skipped, exit 0 (`frontend-tests.log`).
- `npm run tsc`: exit 0 (`typescript.log`).
- `npm run check`: 81 files, zero errors/warnings/hints, exit 0 (`astro-check.log`).
- `API_BASE_URL=http://127.0.0.1:8002 npm run build`: exit 0, complete at 21:40:57
  local in 86.37s (`build.log`). Astro SSR; this product does not build a service worker.
- `.venv/bin/python -m pytest -q --tb=short`: 63 passed, exit 0, isolated PostgreSQL
  `garden_unified_suite_20261016_test` (`backend-isolated-tests.log`). Credentials are
  passed only in process environment. No backend source or schema changes were needed.
- `node tests/browser/unified-library.mjs`: real backend with synthetic accounts;
  18 checks passed, exit 0 on the final build; result and desktop1440/mobile390
  screenshots in `browser/`.
- `node tests/browser/library-acceptance.mjs`: existing real-backend library
  regression with `LIBRARY_EVIDENCE_DIR` set to this evidence root's
  `library-regression/`; 41 checks passed, exit 0 on the final build; final result in
  `report.json` there. This includes sidebar refresh after creation in the main list.

Browser preview is the final production output on `4322`, upstream `8002`, database
`garden_docmost_20261016_test`. The new journey covers two students, author and
anonymous; same-URL saved forks, unchanged original bytes, empty personal content,
private metadata/read isolation, default notes across routes, sidebar root/child
creation, keyboard focus, Escape and mobile overflow. Delayed-response and duplicate
submission tests use jsdom mocks and are reported separately from backend evidence.

Read-only live smoke on `4321/library` confirmed one tree, existing default folders,
the create control, absence of the old separate section, no overflow and no browser
page errors. No synthetic writes, canonical publication, vault import, live migration
or live process restart occurred in this slice. Existing Astro dev serves the source.

Initial checks exposed stale test assumptions, not relaxed requirements: account
entry now targets `/library`, the sidebar component was replaced, and action status
queries must be scoped to the action component. The new browser test initially
selected the hidden preview article; it now inspects the reader article explicitly.
An existing published fixture made a full backend suite's empty-global-list assertion
fail (62 passed, 1 failed); a fresh independent test database passed all 63 without
deleting fixtures or weakening that assertion. The prior `8002` test process also
stopped; only that isolated backend was relaunched before rerunning browser tests.
The folder-entry browser wait was also corrected to await completion of the empty
folder load and the enabled submit button before creating its child. Prior failure
artifacts remain as diagnostic history; final `report.json` files are acceptance.

## Recovery and limits

Branch remains `feat/phase-1-foundation`, HEAD unborn; the preexisting project is
untracked. No broad initial commit or fictional commit SHA is claimed. Source before
this slice is preserved in `../archive/unified-library-before-2026-10-16.tar.gz`.
The final source snapshot is `../archive/legacy-unified-library-source-2026-10-16.tar.gz`
with SHA256 alongside it; inspect/restore into a new empty directory, never over an
active checkout. No database, credentials, dependencies or build output belong in it.

The public catalogue still uses the existing per-request derivation and five-second
cache; this is not a new indexed metadata backend. There is no shared-folder ACL
editor, drag/drop move, public-folder mutation or new collaboration workflow. No new
dependencies, AI work or Atomic changes were introduced. Local servers still lack
automatic startup after reboot.
