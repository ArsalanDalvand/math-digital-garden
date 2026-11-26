# Notion-style frontend and Obsidian editor SDD

## Scope and acceptance

Keep Astro, CodeMirror, the personal-fork API, and raw Markdown. Editing a note must leave the reading layout in place. Hide only a valid leading YAML frontmatter block from CodeMirror; edit it in the existing Properties panel below the note. Saving, switching modes, and retrying errors must preserve the original Markdown bytes outside intentional edits.

Render inactive Obsidian callouts through the existing authenticated preview path. Activating one by mouse or keyboard must expose its complete source for editing. Missing or failed previews leave source readable. Math, code, links, and embeds keep their existing security boundaries. Use the installed editor extensions and libraries; no new dependency or live database changes.

## Frontend review and design direction

Audit home, search, note reader/editor, workspace, account, and review at desktop and 390px mobile widths. Check navigation, responsive layout, RTL, focus, loading and error states, contrast, touch targets, and console/network failures. Preserve the current product's Persian identity while applying Notion's quiet document surface, restrained borders, compact controls, neutral surfaces, and clear hierarchy. Reference: Better Design's public `components/notion/globals.css` and component examples. Better Design MCP is currently unavailable; its review loop remains pending connection.

## Implementation slices

1. Add focused failing tests for frontmatter exclusion, byte-preserving body and Properties edits, callout preview and activation, and long-note layout. Fix the source boundary in one shared editor helper.
2. Reuse the existing block preview only for supported inactive Obsidian blocks. Correct callout selectors. Check reader/editor parity for tables, tasks and highlights using installed capabilities before any dependency proposal.
3. Apply a small set of shared Notion-style tokens and controls across existing page layouts, then inspect rendered desktop/mobile pages. Avoid replacing the editor, authentication flow, or data model.
4. Run frontend tests, Astro/TypeScript checks, production build, and a Chromium journey with mocked fork/preview responses. Keep that distinct from authenticated backend tests. Document observed limitations and retain all preexisting untracked files.

## Initial audit findings

The reader strips YAML, while the editor currently displays the whole raw note. The installed `@atomic-editor/editor@0.6.2` has no callout or frontmatter extension; `frontend/src/lib/block-preview.ts` is available but unused. Reader callout type selectors target the wrong attribute. The reader's Markdown pipeline leaves pipe tables, task markers, and `==highlight==` literal despite richer editor parsing. The existing CSS has repeated overrides and some controls below a 44px touch target. These are concrete acceptance gaps, not a reason to change the backend or source vault.

## Result and remaining review

The editor now excludes valid leading YAML from the writing surface and edits it through Properties while retaining raw Markdown. Inactive callouts and note embeds use the existing preview endpoint; source remains selectable for editing. The reader uses the approved `remark-gfm@4.0.1` for tables and task lists. The navigation toggle stays available on desktop and opens a keyboard closable drawer on mobile. Anonymous workspace responses hide private panels and offer sign in. Preview HTML is no longer reused from a client cache across account changes.

Latest verification: `pnpm test` 90/90, `pnpm check` 53 files with zero diagnostics, and `pnpm build` completed, all exit 0. Chromium `tests/browser/editor-mode.mjs` passed against an isolated development server with the existing backend for the public note and mocked fork/preview requests. An `agent-browser` session at 390px confirmed the mobile library opens and closes with Escape. This does not establish authenticated backend access control or data isolation.

Open UX findings from source review: proposal selection errors in `review.astro` leave the prior selection visible, and decision buttons remain enabled after terminal decisions. Review workflow changes remain outside the current scope. Several graph and assistant controls are under 44px. `==highlight==` remains literal in reader: a text replacement would mishandle escapes and nested Markdown. Existing workspace/review screenshots labeled mobile are 1280px captures and are not mobile evidence. Better Design MCP was unavailable during this pass, so its principles and review checks remain pending connection; the public Notion source supplied only visual reference. Context7 documentation fetch failed with a network error.
