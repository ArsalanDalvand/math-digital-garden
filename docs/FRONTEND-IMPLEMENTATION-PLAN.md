# Frontend implementation plan — 2026-10-09

Scope: existing Astro/Starlight pages `/`, `/search`, `/sample`, `/notes/[slug]`, `/account`, `/workspace`, `/review`, and the note assistant. Read mode for notes/discovery; Operate for account/workspace/review. Preserve raw Markdown, existing authentication/API contracts, CodeMirror, MathLive, merge, drawings and graphs. No backend changes, migrations, secret edits, commits or pushes.

Recovery: source-only backup `/tmp/math-frontend-source-1791557017.tar.gz`; excludes secrets, databases, dependencies and evidence clones. Initial source is untracked.

1. Baseline: 66 frontend tests pass; capture home using isolated agent-browser session math-ux-build. Existing frontend on :4321 is responding. Backend /health returns 404; use existing frontend proxy and catalogue to inspect actual behavior.
2. Shared shell: separate study and personal navigation, suppress empty TOC and artificial next/previous links, retain local Vazirmatn/KaTeX. Home keeps one main heading and a visible study action. Semantic surface/action/state tokens, logical RTL spacing and 44px controls.
3. Reader: optional assistant beside the note at wide widths, stacked on small screens; preserve selection, scope/hash verification and editor/diff. Busy and cancel feedback; never claim real Dify connectivity without evidence.
4. Operate: retain account mode/field validation and independent workspace loading/history; improve review retry, empty state, translated statuses and mutation/selection locking. Existing proposal comments survive errors.
5. Red/green review interaction tests, frontend tests, check, tsc, build and built reader integration. Two bounded browser rounds across desktop/mobile/light/dark, keyboard and embedded axe. Screenshots/logs under docs/verification/frontend-redesign. Failures and untested real-service paths explicitly reported.

Research: Context7 CLI resolved official shadcn/ui, Material Web and Starlight and fetched current documentation. Apply shadcn paired CSS tokens and labeled/invalid form behavior; Material 3 surface hierarchy and state feedback. This is guidance adaptation, not installation of React/shadcn/Material Web. Keep existing dependencies.
