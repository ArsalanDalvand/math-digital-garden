# Account, personal library and writing tools

## Specification and plan — 2026-10-16

Target is the legacy Astro/React + FastAPI project, not Atomic. Existing untracked
work and the live database remain intact. Docmost reference is the user's local
`references/docmost`, revision `744c82bdf86f454ca44a2e19dc150900e884a11e`, at port 3000.
Its interaction patterns are studied; no AGPL/Enterprise implementation is copied.
Local Better Design references and ui-ux-pro-max guide styling/accessibility.

### Delivery slices

1. Account: server identity, display name/avatar, profile name/email/password,
   preferences (theme/reading width and typography/default mode/fixed toolbar).
   Exclude MFA/devices and unused email settings. Remove header search shortcut.
2. Writing: existing CodeMirror engine, fixed accessible Markdown toolbar, same
   save path and source preservation. No replacement editor or rich-text database.
3. Personal library: private folders/notes, bounded metadata browsing, favorites,
   move/trash/restore, exact Markdown revisions, authorized attachments.
4. Sharing: explicit single-note publication snapshots and revocable unlisted links;
   later draft edits remain private. Page-level comment threads, watch state,
   manual administrator verification of published content. No new approval workflow,
   access-permission UI, export, PDF or automatic descendant publication.
5. Integrate/test using independent PostgreSQL, real backend HTTP journeys and
   browser interaction. Verify migration rerun and existing source regressions.
   Prepare concrete live migration/rollback steps before requesting deployment.

### Integration and scope

- `account_settings.py`, User fields and migrations 0004; account pages/menu and
  shared preference event. Account identity comes from authenticated server state.
- `library.py`, `library_models.py`, migrations 0005/0006; owner-scoped queries and
  published DTOs. New personal documents do not join the existing public catalogue.
- `Reader.astro`, `WorkspaceNote.astro`, `workspace-note.ts`, existing proxy/main;
  new library components/routes and editor toolbar. Admin link starts hidden.
- Existing canonical notes/forks retain their workflows. Independent copies into
  the personal library are explicit, so new publication does not mutate originals.
- Every mutation uses existing session/CSRF checks. Shared snapshot reads exclude
  parent paths, drafts and unauthorized attachments. Revocation applies to fresh
  requests; caches use no-store. UI clears stale state after identity changes.

### Acceptance

- Profile persists; unsafe/oversize avatar files rejected and decoded raster only.
  Credential changes require current password and invalidate other sessions.
- Student/anonymous see no review navigation. No role from local storage.
- Formatting commands preserve untouched Markdown, math, code and selection;
  toolbar works with keyboard, RTL and narrow screens without hiding the document.
- Two users cannot read/write each other's private items, metadata, history or bytes.
  Invalid names, folder cycles, stale hashes and hidden publish references fail closed.
- Sharing, publication, comments, watching, revisions, favorites and trash have
  actual persistence and visible error/retry states; no decorative action buttons.
- Full frontend tests/types/check/build and isolated backend tests are rerun after
  final implementation. Browser fixtures are labeled separately from real HTTP tests.

### Initial environment

App frontend 4321/backend 8001 remain running. Isolated database
`garden_docmost_20261016_test` is separate from live notes. Private environment file
is outside the project; no credentials are documented. Repository HEAD is unborn,
branch `feat/phase-1-foundation`; no bulk staging or fabricated initial commit.
Three supported subagents handle account, library backend and library UI. Gemini
is unavailable in this harness. Pillow is added under the user's current permission
for necessary external dependencies, avoiding a custom image decoder.

### Presentation mode

Added native `Presentation.astro`, `presentation.ts` and a small section helper;
Reader integration consists only of import plus component. The note menu gains
«حالت ارائه» when a real note article exists. A title slide precedes complete
rendered sections split on h1/h2/hr. Oversized sections scroll; Markdown is never
rewritten. Private library or active personal/editor scopes acknowledge save and
use the existing authenticated sanitized preview API. Public canonical/shared
readers clone only the already authorized sanitized article, so anonymous canonical
presentation works without authentication and no hidden references are fetched.
Native modal isolates background interaction and traps focus; next/previous,
Home/End/arrows, Escape, focus return, counter, optional browser fullscreen and
identity/request invalidation are implemented. No dependency or backend was added.

Checks: three DOM tests passed (section preservation, navigation/focus/public DOM,
late private preview discarded after identity change); `npm --prefix frontend run
tsc` exit 0. Real agent-browser session `presentation-check` used only test app4322
and synthetic canonical `docmost-browser-fixture`: title slide, End=3/3, actual
second heading, Escape closes/clears and returns button focus. At390px modal width
390, no horizontal modal/content overflow, all visible controls44px. Anonymous
canonical rerun passed; screenshot `../logs/docmost-workspace-2026-10-16/
presentation-390.png` was visually inspected. Initial Vite cache overlays blocked
interaction; root repaired isolated cache before successful checks; no overlay was
removed or mocked. One initial navigation timed out before retry; not counted as a
pass. Local Better Design spacing/navigation/review snapshots were applied; live
MCP tools were unavailable, so no MCP comprehension/spacing certification is claimed.
Limit: section slides scroll rather than Docmost's measured height auto-pagination;
laser pointer is omitted. Physical fullscreen, Safari and screen-reader testing
remain unverified. Root runs final whole-project gates after integration.
