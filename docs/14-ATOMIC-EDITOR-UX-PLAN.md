# Atomic editor experience in the previous garden

## Goal and scope

Keep the existing Astro, CodeMirror, Markdown and personal-fork API. Make writing on a note page feel like Atomic: enter editing in place, retain the cursor and draft, save in the background after a pause, show clear save state, and return to a clean reading view. Keep manual save and the existing proposal workflow available as separate actions.

## Implementation

1. Reuse the installed `@atomic-editor/editor` extensions and current serialized, revision-checked fork save. Schedule a bounded 1.5-second save after edits. Do not change canonical content or the source vault.
2. Centralize read/edit transitions so reentry restores focus and the personal-version indicator, while switching to the original restores the edit action. Do not destroy the CodeMirror instance or unsaved text.
3. Add Atomic-style keyboard controls for editing, saving and reading without intercepting typing in other fields. Show save progress and errors next to the editor. Make proposing a change an explicit action instead of a modal after every save.
4. Align editor controls and spacing with the existing reading theme on desktop and mobile; keep keyboard focus visible.

## Verification

Use focused unit tests for save scheduling and transition state, the full frontend suite, type and production builds, and a real browser with scoped mock fork/preview responses. Verify that the editor writes only through the existing private fork API. Do not write to the existing database during browser tests.

## Result (2026-10-13)

The existing Atomic editor now keeps its instance and cursor across reading/editing transitions. It focuses on entry, saves after 1.5 seconds, supports Ctrl/⌘+S and Ctrl/⌘+E, keeps manual save in the editor, and opens the proposal dialog only from **پیشنهاد اصلاح**. Revision conflicts stop later writes; transient failures can be retried. The note page shows the current version and save state. Desktop and 390px mobile layouts were inspected.

Changed paths: `frontend/src/components/WorkspaceNote.astro`, `frontend/src/pages/notes/[slug].astro`, `frontend/src/scripts/workspace-note.ts`, `frontend/src/lib/editor.mjs`, `frontend/src/styles/workspace.css`, `tests/browser/editor-mode.mjs`, and focused tests under `tests/frontend/`. No backend route, database schema, dependency, source vault or Markdown content changed.

Verification on the final source: `pnpm test` passed 86/86 tests, `pnpm check` reported zero errors across 53 files, and `pnpm build` completed its server and client outputs. `tests/browser/editor-mode.mjs` passed in Chromium with scoped mock fork/preview responses, including autosave, keyboard controls, mode reentry, proposal opening, mobile width, and zero page errors. This browser test did not write to the existing PostgreSQL database. The prior project has an unborn Git branch with all source files untracked, so these edits have no commit yet; stage and establish the whole source baseline only after reviewing its private evidence and Git ignore rules.

Follow-up: Escape now lets CodeMirror dismiss search or link suggestions before returning to reading. While the Properties panel is closed, frontmatter edits refresh its YAML field so reopening it cannot apply an old value over newer Markdown. The browser regression covers link suggestions, Properties refresh, and ordinary Escape. The existing database remains untouched by this mocked API test.

Long-note layout fix: the shared `.cm-scroller` rule capped height at `65vh`, while the reader override made overflow visible. Long Markdown then painted outside its layout box over Properties and following content. The reader now removes that cap, so the page grows with the editor; the review editor keeps its bounded scroll. The focus frame around the writing surface was removed so reading and writing stay visually aligned. The browser regression uses 80 synthetic sections, checks that the editor contains its content and ends before the following controls, and verifies no focus frame or mobile horizontal overflow. Captures: `../logs/local-legacy-review/editor-long-{desktop,mobile}.png`.
