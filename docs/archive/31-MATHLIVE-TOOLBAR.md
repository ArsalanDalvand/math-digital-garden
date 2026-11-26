# Inline MathLive and responsive previews

## Contract and plan

The user rejected a separate formula panel. The MathLive toolbar button now opens
its virtual keyboard and places a Mathfield directly at the CodeMirror selection.
Input synchronizes raw LaTeX and autosave immediately; there is no insertion dialog
or extra field above/below the note. Existing formulas reopen in place. Escape
returns to the document. Code/read-only contexts reject activation; identity cleanup
clears the field and keyboard. The toolbar stays reachable with sticky mode off.

Callout previews use one initial batch, deduplicate pending work and reuse up to 64
rendered previews in this editor only. Identity changes invalidate pending results
and clear the cache. Document parsing is reused across cursor-only changes. The
server skips rebuilding embedded-note HTML when the preview contains no embeds.
Batch output is bounded to 128 callout/embed blocks; remaining blocks use individual
requests. Active callout source stays editable; leaving it restores its preview.

Scope: shared toolbar, WorkspaceNote, inline math extension, block preview, private
preview cache/API and tests. No dependency or Markdown-source migration. Existing
public resolver and HTML/KaTeX sanitization are reused. Context7 `/arnog/mathlive`
confirmed focus, input synchronization and explicit virtual keyboard show/hide.

## Verification

127 frontend tests and TypeScript pass; production build completes. Real Chrome
uses the running main backend with synthetic accounts/notes: inline virtual-key
insertion, saved raw LaTeX, reopening, Escape, RTL mobile, nonsticky mode and reading.
All four proof callouts in the reported canonical note render without editing it.
A four-callout fixture requires one initial preview request; unchanged return to
reading requires none. Timing and screenshots are in
`../../logs/mathlive-toolbar-2026-10-16/` (latest `latency.json`, `browser.json`).
Cold requests and changed content still require server rendering; warm timing is
not a universal latency claim. No production-load benchmark or Firefox automation
was performed. The initial separate-panel implementation and its failed Escape
check are superseded by the inline implementation and final evidence.
