# Docmost-inspired document workspace

## Specification and plan — 2026-10-16

Target: legacy `math-digital-garden`, branch `feat/phase-1-foundation` (unborn).
The source is already untracked; this task does not stage an initial repository.
Reference: Docmost `744c82bdf86f454ca44a2e19dc150900e884a11e`, local
`../docs/reference/docmost` and Better Design navigation/spacing/review guidance.
Adapt interaction patterns, not AGPL source. Gemini is unavailable in this harness;
a supported subagent performs independent source research.

## Feature placement

| Region | Existing capabilities |
| --- | --- |
| Global header | Navigation toggle, garden identity, search shortcut, account |
| Right sidebar | Search first, home, personal notes, proposal review, library tree, theme |
| Document toolbar | Document title, persistent Read/Write group, save when dirty, reading preferences, note actions |
| Note actions | Bookmark, original version, proposal, reset (visually separated) |
| Document | Existing metadata, Markdown reader/editor, lower YAML properties |

Reading preferences remain one click away and retain size, leading, width and focus.
No workspace selector, collaboration, new sharing permissions or AI features.

## Acceptance checks

1. Both mode buttons stay visible; selected state reflects successful mode changes.
   A failed save or preview keeps editing active and its text intact.
2. Controls have stable placement at every width. The mobile toolbar may use two
   compact rows; no horizontal page overflow, no extra editor frame.
3. Search is near the sidebar top and remains reachable when it is collapsed.
   Account and theme do not mix with note actions.
4. Reading settings and note actions support keyboard, outside click and Escape,
   with focus restored. Sidebar retains mobile backdrop/inert and persisted focus.
5. Source Markdown, authentication, save/proposal/reset APIs and live data remain
   intact. Real read-only browsing and synthetic editing evidence are separated.

## Change scope and verification order

1. Add failing behavior checks for persistent mode controls and menu interaction.
2. Update `Reader.astro`, `WorkspaceNote.astro`, `workspace-note.ts` and scoped
   layout rules in `workspace.css`; preserve existing selectors and API callers.
3. Update affected frontend/browser checks; test desktop/mobile, RTL, keyboard,
   dark theme, preferences, mode transitions and failures.
4. Run full frontend tests, TypeScript, Astro check and production build on the
   final tree. Save command exits, counts, screenshots and limitations here.

## Implemented

- Global header now contains garden identity, navigation, search and account.
  The right sidebar places search first, keeps the library independently scrollable,
  and keeps the theme button reachable below it.
- A separate sticky document bar contains a persistent Read/Write group, reading
  preferences, outline, study-panel toggle and note actions. Secondary actions no
  longer move between unrelated menus at a breakpoint. Mobile uses two rows, with
  44px mode targets and no overlap even at 320px.
- Existing study content opens through its current mobile Sheet or a desktop
  panel toggle. No assistant implementation or server endpoint changed.
- Outline reads the currently visible reader DOM, preserves generated heading IDs,
  uses text-only labels, and returns focus. It reports no available headings while
  editing instead of showing stale canonical headings.
- Reading settings retain their existing storage. Focus mode survives reload;
  leaving it restores navigation and honors the user's independent panel choice.
- Save/preview failure preserves editing. Competing mode/original buttons are
  disabled while returning to reading; edits made during preview prevent the switch.
- Native proposal dialogs own Escape; closing returns focus to the visible note
  menu trigger. This fixed a failure found by the real browser journey.

## Verification

Evidence: workspace `logs/docmost-workspace-2026-10-16/`.
Commands use explicit working directories; Node/browser runs unset `LD_PRELOAD`.

| Working directory | Command | Result |
| --- | --- | --- |
| `math-digital-garden` | `timeout 30s node --test tests/frontend/note-toolbar.test.mjs` before implementation | Exit 1: persistent mode test correctly failed |
| `math-digital-garden` | `timeout 30s node --test tests/frontend/navigation.test.mjs` before dialog fix | Exit 1: Escape intercepted native dialog dismissal |
| `math-digital-garden/frontend` | `timeout 60s npm test` | Exit 0; 101 tests, 101 passed, zero skipped |
| `math-digital-garden/frontend` | `timeout 90s npm run tsc` | Exit 0 |
| `math-digital-garden/frontend` | `timeout 90s npm run check` | Exit 0; 54 files, zero diagnostics |
| `math-digital-garden/frontend` | `TMPDIR=/home/a7vat4r/.tmp timeout 240s npm run build` | Exit 0; server/client build complete, 70.55s |
| `math-digital-garden` | `timeout 240s node tests/browser/docmost-workspace.mjs` | Exit 0; 64 checks |

Browser reproduction:

```sh
# cwd: Math-Garden-Workspace/math-digital-garden
env -u LD_PRELOAD TMPDIR=/home/a7vat4r/.tmp \
  WORKSPACE_TEST_URL=http://127.0.0.1:4321/notes/math1-074e386630982b76 \
  WORKSPACE_EVIDENCE_DIR=../logs/docmost-workspace-2026-10-16 \
  timeout 240s node tests/browser/docmost-workspace.mjs
```

The journey covers 1440, 1024, 901, 390 and 320px; RTL geometry and non-overlap;
settings/menu/outline Escape and focus; mobile drawer and study sheet; desktop tools;
focus persistence after reload; dark theme; mode switching, failed preview, synthetic
autosave and proposal-dialog cancellation. Three scoped axe checks (toolbar, header,
sidebar) report zero violations and zero incomplete checks, with 15/13/14 passes.
Screenshots: `reader-1440.png`, `reader-390.png`, `reader-dark.png`.
The app remains available at `http://127.0.0.1:4321`; final public-note HTTP check
returned 200. Backend remains on 8001. This Astro application has server output;
the Atomic service-worker build gate is not applicable here.

## Limits and repository state

- Public reading uses the real running backend. Editing, saves and proposal UI use
  explicit browser fetch interception; they do not prove backend ACL or persistence.
  No live note, vault, account or database was mutated.
- Earlier browser sessions had CDP disconnects/timeouts; those are not passes. The
  final named-session journey exits 0. Outline checks wait for native toggle rendering.
- Astro emits the existing loader notice about missing `src/content/docs/`; notes
  are served from the backend. Diagnostic checks still report zero warnings.
- No dependency, Atomic file or MCP configuration changed. Docmost is a UX reference;
  its AGPL implementation was not copied. No Better Design MCP approval is claimed.
- Branch remains `feat/phase-1-foundation`, HEAD unborn. The pre-existing untracked
  repository was not staged or given a partial initial commit. A scoped pre-change
  source snapshot is in `source-before.tar.gz`; final fingerprints accompany evidence.
