### Material Missing Display Features & Review Concerns

- **BiDi Inline Math Isolation (`RTL`):** In mixed Persian-English mathematical prose, inline KaTeX spans must enforce `direction: ltr !important` and `unicode-bidi: isolate`. Without explicit boundary isolation, operators, minus signs, and trailing punctuation invert within RTL text nodes.
- **Deep-Linked PDF Page Anchors (`Better PDF`):** Obsidian-style PDF transclusions referencing fragment identifiers (e.g., `![[source.pdf#page=4]]`) render as broken static links without a client-side `PDF.js` handler or iframe query adapter.
- **Academic Callout & Layout Utility Tokens (`Minimal settings`):** Custom academic callout types (`[!theorem]`, `[!definition]`, `[!lemma]`, `[!proof]`) and Minimal's layout utility classes (e.g., table styling, image grids) require custom CSS variables to avoid falling back to generic callout boxes.
- **Excalidraw Dark Mode Theme Adaptation (`Excalidraw`):** Pre-rendered SVG/PNG sidecars embed static light backgrounds and dark strokes. Displaying them in dark mode without CSS filter inversion (`filter: invert(...) hue-rotate(180deg)`) or dual light/dark sidecar manifests causes harsh visual contrast.

---

### Justification for Desktop Exclusions

- **Templater & Commander:** Depend on desktop Node.js runtimes, arbitrary JavaScript evaluation (`<% ... %>`), and Electron UI command registration. Disabling them preserves the zero-trust web boundary and prevents cross-user code execution in multi-tenant environments.
- **Note Refactor:** Destructively splits files and restructures directories on disk. On the web, note lifecycles and lineage are managed via atomic Git forks and database relations rather than ad-hoc client-side filesystem edits.
- **Unsandboxed Pandoc & Enhancing Export:** Desktop versions execute arbitrary shell scripts and unvalidated Lua filters. Restricting the web tier to an owner-only, fixed-argument `pandoc --sandbox` binary protects against local file inclusion and remote code execution.
- **In-situ Calctex & Mutating Linter:** Desktop plugins directly modify document text. Excluding them enforces the **Zero Round-Trip Loss** principle—preventing unexpected diff pollution in PR branches, with linting limited to non-destructive diagnostics and computation delegated to ephemeral web workers.