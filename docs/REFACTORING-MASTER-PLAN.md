# Math Digital Garden — Master Refactoring & Evolution Plan

> **Status:** User-approved master specification (created 2026-11-26).
> **Scope:** Execute ALL items below in phased order (Phase 1 → Phase 2 → Phase 3 → Phase 4), verifying each phase with tests, live browser verification, production build, and safe deployment before proceeding.

---

## 0. Environment, Assets & Hard Constraints

- **Repository:** `/home/a7vat4r/projects/arsalandalvand/math-digital-garden`
- **Live Server:** `https://test.atomathix.ir` | SSH alias: `math-garden` | Remote path: `/opt/math-digital-garden` | Service: `math-garden-frontend.service` (and backend service)
- **Offline Server Note:** `math-garden` has no outbound DNS to `github.com` or `registry.npmjs.org`. Deploy via `git bundle` over SSH (or verified offline sync) and never assume remote `npm install` works without bundling/pre-caching.
- **Production Data Safety (NEVER BREAK):**
  - Never delete or overwrite live DB volumes, secrets (`.env`), or server vault media (`frontend/src/lib/vault-assets.json`, `frontend/public/vault/abstract-algebra-and-matrices/`).
  - **Zero Round-Trip Markdown Loss:** Raw Markdown in PostgreSQL remains the lossless source of truth.
  - **Full Markdown Compatibility:** MUST preserve and support **Standard Markdown + GitHub Flavored Markdown (GFM) + Obsidian Markdown** (wikilinks, embeds/transclusions, callouts, footnotes, LaTeX/KaTeX, `.excalidraw`, `.canvas`, `mermaid`, GeoGebra). **Do NOT remove Excalidraw or Mermaid support** — isolate and lazy-load them cleanly instead!
  - **RTL / BiDi Rules:** Persian prose `direction: rtl`; all inline/display math and code `direction: ltr !important; unicode-bidi: isolate`.
- **Available Project Skills & References (use them!):**
  - `.agents/skills/`: `shadcn`, `frontend-design`, `accessibility`, `tailwind-design-system`, `react-best-practices`, `astro`, `fastapi`, `fastapi-templates`, `supabase-postgres-best-practices`, `sqlalchemy-alembic-expert-best-practices-code-review`, `playwright-best-practices`
  - `.agent/skills/impeccable/`
  - Offline UI/UX references inside repo: `docs/reference/better-design/` (Notion kit tokens, `ui-*.json`, `ux-*.json`, `review-rules.json`) and `docs/reference/docmost/`
  - Plugins enabled in Antigravity: `Context7` (up-to-date docs) and `Chrome DevTools` (browser debugging/verification).
  - Writing style guide reference (evolving UMKO standard): `/home/a7vat4r/Documents/Obsidian/jozve/شیوه‌نامه نگارش/`
- **Current Baseline:** Commit `ef1d67d` on `main` (D3 Canvas knowledge graph + UMKO v1.1 typed edges + DAG layout live on `test.atomathix.ir`).

---

## 1. Approved Target Architecture & Tech Stack

- **Frontend:**
  - **Astro 5 (pure, NO `@astrojs/starlight`, NO `starlight-site-graph`)** for fast SSR reading pages (Markdown/KaTeX/Obsidian HTML with zero unnecessary hydration).
  - **React 19 + Tailwind CSS v4 + shadcn/ui + Nano Stores** as the **single standard** for ALL interactive UI (Graph HUD & Quick Peek Drawer, Personal Library, Editor/Workspace, Study Assistant AI, Account Menu, Quick Search `Cmd+K`). **No new manual DOM manipulation** (`document.createElement` / `innerHTML` / `querySelector` spaghetti).
  - **Canvas/D3 Engine:** Pure TypeScript modular engine (`d3` force simulation + 2D High-DPI Canvas) mounted inside a clean React island wrapper.
  - **TypeScript Strict:** `npm run tsc` MUST pass with **0 errors** (fix all 30 existing errors across `markdown.mjs`, `folder-tree.mjs`, `library-links.mjs`, `library-navigation.ts`).
  - **Unified CSS Design System:** Single CSS token layer (`tokens.css` + Tailwind v4 `@theme`), zero Starlight `--sl-*` tokens, expand & replace the 62.6 KB minified `workspace.css` wall of `!important`.
- **Backend:**
  - **FastAPI + Async SQLAlchemy 2 + Alembic + PostgreSQL 16 (`JSONB` + `pg_trgm` + `pgvector`)**.
  - **Schema-Flexible / Config-Driven UMKO Support:** Because the writing/UMKO rules are actively evolving, NEVER hardcode 30+ rigid columns in PostgreSQL. Store parsed frontmatter in `frontmatter JSONB` (GIN-indexed) and store links/relations in a generic `note_edges` table `(source_note_id, target_note_id, relation_type TEXT, edge_source TEXT)`. Define visual/semantic metadata (kinds, relations, colors, shapes, planes, DAG direction) in a **single shared registry config file** (`schema/knowledge-schema.json`) with clean fallbacks for plain Obsidian/GitHub notes that lack UMKO frontmatter.
- **Testing Strategy — E2E-First (Testing Trophy):**
  - **Delete brittle source-regex tests** in `tests/frontend/` that read `.astro`/`.css` files with `readFileSync` and assert regex patterns against class names/markup.
  - **Consolidate the 28 scattered scripts in `tests/browser/`** into a clean, fast, parallel **Playwright E2E test suite** (6–8 golden user-journey specs covering: reading + KaTeX/RTL + previews, knowledge graph light/dark/DAG/fullscreen/Quick Peek, diagrams Mermaid/GeoGebra/Excalidraw/Canvas, search & navigation, auth + fork + editor + save, personal library Git/Zip/sharing/comments).
  - **Keep real Backend Integration Tests (`pytest`)** for auth boundaries/IDOR, SSRF/Zip-Slip security, DB migrations, search, and AI endpoints.
  - **Keep focused Pure Unit Tests (2–3 files only)** for algorithmic edge cases: Markdown/Obsidian/GFM/KaTeX parser (lossless guarantee) and Graph/DAG layout algorithms (cycle safety, topological ranking).
- **Code Quality & Hygiene:**
  - Add **Biome** (frontend lint/format) + **Ruff** (backend lint/format).
  - Replace `AGENTS.md` / `CLAUDE.md` with a single concise, accurate `AGENTS.md` matching the new architecture.
  - Fix weird `0600` file permissions on source files, clean up untracked/stray artifacts (e.g., `tests/browser/e2e-reading-failure.png`, `navigation-order.json`).

---

## 2. Phased Execution Roadmap

### Phase 1 — Speed Overhaul & Critical Backend Fixes (P0 — Execute FIRST)
1. **Eliminate the 38–52s Cold Page Load (`frontend/src/lib/markdown.mjs`, `catalogue.mjs`, `pages/notes/[slug].astro`, `pages/api/preview.ts`, `pages/api/library-tree.ts`):**
   - Root causes identified:
     - `fetchCatalogue()` has a 5s TTL and does 6 sequential HTTP fetches pulling full `current_content` of all 523 notes.
     - `buildKnowledge()` uses `LRUCache({ max: 1 })` keyed on `JSON.stringify(notes)`. Any single edit invalidates everything and renders ALL 523 notes **twice** (outlines pass + full pass), then parses all 523 HTML docs back to HAST (`htmlParser.parse`), `structuredClone`s all 523 trees, and re-stringifies all 523 even when a note has no embeds!
   - Fix:
     - Implement **per-note render caching keyed by `(slug, current_hash, renderer_version)`** (plus only parse/expand embeds for notes that actually contain `data-embed-slug`).
     - Separate lightweight metadata/index fetching from full single-note rendering so visiting `/notes/[slug]` renders ONLY the requested note (if cache miss) in **< 30ms** instead of rebuilding 523 notes!
     - Eliminate `fetchCatalogue()` full-body dumps on `/api/preview.ts` and `/api/library-tree.ts`.
2. **Cut Note HTML Size from ~781 KB to ~40 KB:**
   - Remove the 453.5 KB HTML-escaped `data-sitemap` inline dump from `NoteGraph.astro` / `notes/[slug].astro`.
   - Serve graph data from a cacheable **`GET /api/graph.json`** endpoint with `ETag` / `Cache-Control` fetched once by the client graph component.
   - Remove inline `<template data-preview-slug>` pre-rendering (`InlinePreviews.astro`) and fetch hover previews **on-demand** via lightweight API endpoint with client-side caching.
   - Serve link index on-demand (for editor autocomplete) instead of embedding all 523 notes in every read-only page.
3. **Fix Critical Backend Bugs, Disable Legacy AI & Security Issues:**
   - **Disable AI Assistant & Dify for now (Clean Feature Off until Phase 5):**
     - Hide/disable the AI assistant UI in the frontend (`Tutor.astro`, `StudyAssistant.tsx`, mobile study-assistant trigger) so users do not see the broken legacy chat, and disable/gate `/api/ai/chat` (e.g., behind a feature flag `ai_enabled: bool = False` in `backend/app/config.py`, returning `503` / feature disabled) without spending time fixing Dify.
     - Keep `pgvector` schema/tables (`note_embeddings`, `ai_conversations`) intact in PostgreSQL so Phase 5 can cleanly build the new native Hybrid Graph-RAG on top.
     - In Phase 2, also remove the heavy `@assistant-ui/react` dependency (~536 KB) cleanly since the AI chat UI will be rewritten from scratch with React 19 + shadcn/ui in Phase 5.
   - **`backend/app/library.py` (lines 878, 931, 966):** Move blocking synchronous `clone_git_repo()` and `extract_zip_archive()` off the FastAPI async event loop using `run_in_threadpool`.
   - **`backend/app/library_import.py`:** Validate `branch` against leading `-` (prevent git option injection), pass `--` before positional args, and add `-c core.hooksPath=/dev/null` (matching `content_sync.py`).
   - **`backend/app/workspace.py:55`:** Remove hardcoded LAN IP `"http://192.168.1.191"` from `write_guard()` (make extra origins env-configurable via `Settings`).
   - **`backend/app/manage.py`:** Add safe `--update` / upsert capability to `import-vault` so edited Obsidian notes and updated assets can actually be synced instead of silently skipped as `conflicts`.

---

### Phase 2 — Tech Stack Cleanup, Build Speed, CSS Unification, TypeScript & Test Modernization (P1)
1. **Remove Dead Frameworks & Fix Conflicting Packages (`frontend/package.json`, `astro.config.mjs`):**
   - Remove `@astrojs/starlight`, `starlight-site-graph`, `vite-plugin-node-polyfills`, `@astrojs/tailwind` (v3), and redundant `cn` package.
   - Remove dead Starlight shim files (`Head.astro`, `MobileMenuToggle.astro`, `Tutor.astro`, `sample.astro` if unused).
   - Deduplicate `katex` (currently bundled twice at 2×261 KB).
   - **Keep 100% Excalidraw, Canvas, Mermaid, GeoGebra support**, but isolate & lazy-load them cleanly (e.g., separate vendor/chunk boundary so routine builds don't re-bundle 5,700+ modules or require 4 GB RAM).
2. **Unify CSS Architecture:**
   - Unpack and replace the 62.6 KB single-line minified `frontend/src/styles/workspace.css` and reconcile `custom.css`, `garden-system.css`, `shadcn.css` into a single clean Tailwind v4 `@theme` + semantic CSS variable system (zero `--sl-color-*`, minimal/zero `!important` wars).
   - Align visual tokens with `docs/reference/better-design/` (Notion kit / UI principles) and `shadcn` / `tailwind-design-system` skills.
3. **TypeScript Strict (`0 errors`) & Modular Graph Engine:**
   - Resolve all 30 existing `tsc` errors so `npm run tsc` passes cleanly.
   - Split the 2,641-line `frontend/src/scripts/graph-component.ts` into clean modules:
     - `graph/types.ts` & `graph/schema.ts` (reading from shared knowledge schema)
     - `graph/dag-layout.ts` (topological ranking + cycle safety + barycenter ordering)
     - `graph/canvas-engine.ts` (pure TS D3 simulation + High-DPI 2D Canvas renderer + hit-testing)
     - `components/graph/GraphWidget.tsx` (React 19 + shadcn/ui + Tailwind v4 island for HUD, filters, legend, fullscreen modal, inspector, and Phase 4 features).
4. **Migrate Interactive UI to React 19 + shadcn/ui + Nano Stores (Incremental):**
   - Establish Nano Stores for cross-island state sharing (graph ↔ note ↔ AI assistant ↔ search).
   - Clean up `@assistant-ui/react` bloat if simpler React + shadcn chat UI is cleaner/lighter.
   - Refactor heavy manual-DOM scripts (`library-browser.ts`, `workspace-note.ts`, `account-settings.ts`) progressively into clean React + shadcn/ui components.
5. **Modernize Testing to E2E-First (Playwright + Pytest + Focused Unit Tests):**
   - Delete brittle regex-on-source tests in `tests/frontend/`.
   - Replace the 28 ad-hoc scripts in `tests/browser/` with a structured Playwright E2E suite (6–8 golden specs) using `playwright-best-practices`.
   - Keep `pytest` backend integration/security tests + 2–3 pure unit test files (Markdown/Obsidian parser & Graph/DAG algorithms).
   - Add Biome (frontend) & Ruff (backend) checks; update `AGENTS.md` (and remove duplicate `CLAUDE.md` or symlink it).

---

### Phase 3 — Flexible PostgreSQL Schema, Instant Search & Backend Modularization (P1/P2)
1. **Schema-Flexible PostgreSQL Indexing (Alembic Migration):**
   - Add `frontmatter JSONB` (with GIN index) + `search_vector` (`tsvector` + `pg_trgm` GIN index on title & content) + `rendered_html` / `render_meta JSONB` + `render_version` columns (or dedicated `note_render_cache` table) to PostgreSQL.
   - Add generic `note_edges` table: `(id, source_note_id, target_note_id, relation_type TEXT, edge_source TEXT, created_at)` with proper indexes — zero future migrations needed when UMKO relation types change!
   - Populate/sync `frontmatter`, `note_edges`, and search indexes automatically on note create/update/import.
2. **Dynamic APIs & Instant Search:**
   - Backend `GET /api/graph` (fast indexed query from `canonical_notes` + `note_edges`, ETag cached).
   - Backend `GET /api/books` / catalogue stats endpoint so `frontend/src/pages/index.astro` no longer hardcodes note counts (`۲۲۳ یادداشت`, `۳۰۰ یادداشت`) or hardcoded slugs!
   - Fast Persian + Math search (`GET /api/search` backed by `pg_trgm` + `tsvector`) + React `Cmd+K` Command Palette (`shadcn` Command).
3. **Backend Modularization & Asset Hygiene:**
   - Split the 1,478-line `backend/app/library.py` into clean domain routers/services (`items`, `sharing`, `imports`, `comments`, `canonical`).
   - Split the 617-line `backend/app/workspace.py` cleanly (`auth`, `forks`, `proposals`, `security`).
   - Move `LibraryAttachment` binary storage from Postgres `BYTEA` (`LargeBinary`) to disk/volume storage (with safe migration) and decouple `vault-assets` (`/var/lib/math-garden/vault-assets`) from the git working tree on `math-garden`.
   - Create single shared `schema/knowledge-schema.json` used by both backend and frontend for UMKO kinds, relations, planes, colors, shapes, and fallbacks.

---

### Phase 4 — All 6 User-Approved Knowledge Graph UX Enhancements (Built Cleanly on React + Canvas Engine)
All 6 features below were explicitly approved by the user and should be implemented cleanly inside the new modular Graph Engine + React/shadcn HUD:
1. **Context-Aware Default Filtering of MOCs / Roadmaps & Raw OCR Orphans:**
   - On atomic notes (`definition`, `theorem`, `proof`, `example`, `exercise`, etc.), hide hub MOC/collection/roadmap nodes (`kind === 'moc' | 'collection'` or title matching `نقشه راه` / `فهرست`) and raw OCR page orphans (`صفحه-XX` / `متن خام OCR`) by default so local Depth-2 neighborhoods stay mathematically focused (e.g., 149 → 82 nodes on `تعریف گروه جابجایی`).
   - On MOC/roadmap pages themselves, show MOCs normally.
   - Provide an explicit toggle in the HUD (`نمایش نقشه‌راه‌ها و صفحات خام`) so users can opt in anytime.
2. **Prerequisite & Impact Path Tracer (`مسیر یادگیری`):**
   - Two-mode interactive path highlight on the current/selected node:
     - **`پیش‌نیازها` (Prerequisites chain):** Traces upstream dependency edges (`rel_depends_on`, `rel_prerequisite_of`, `rel_uses`, etc.) with numbered hop depth.
     - **`کاربردها` (Impact / Downstream chain):** Traces what theorems, proofs, and exercises rely on this concept.
   - Dims unrelated nodes/edges smoothly and shows an ordered study-path list.
3. **Fullscreen Quick Peek Drawer + Pivot/Re-center (Without Leaving the Graph):**
   - Clicking a node in fullscreen opens a sleek RTL slide-over **Quick Peek Drawer** (React + shadcn Sheet) showing its UMKO badges, `slogan_fa`, rendered mathematical summary/preview (fetched on-demand), and typed connections.
   - Includes two primary actions: **`تمرکز روی این گره` (Pivot / Re-center graph on this node without page reload)** and **`باز کردن یادداشت کامل` (Navigate to full note)**.
4. **Subtle Geometric Node Shape Coding by UMKO Kind:**
   - Distinct, crisp geometric glyphs on Canvas (beyond color alone — great for accessibility & instant scanning):
     - `definition` / `axiom`: Circle / Double-ring circle
     - `theorem` / `lemma` / `proposition` / `corollary`: Hexagon
     - `proof`: Square / Rounded-square
     - `example` / `counterexample` / `exercise`: Diamond / Triangle
     - `moc` / `collection`: Octagon / Star-hub
     - Plain/untagged notes: Clean circle fallback.
5. **Color-By Analytical Lens (`رنگ‌بندی بر اساس`):**
   - Switchable color encoding in the HUD:
     - **`نوع مفهوم` (`kind`)** — default semantic UMKO palette
     - **`سطح دشواری` (`level` L1–L5)** — progression heat scale
     - **`فصل / کتاب` (`chapter` / `book`)** — structural clustering across vaults.
6. **Compact Sidebar Summary Strip:**
   - Above/inside the sidebar graph widget, show an instant, scannable summary pill bar (e.g., `۳ پیش‌نیاز · ۲ قضیه وابسته · ۴ تمرین`) with click-to-highlight or open fullscreen directly in that filter mode.

---

### Phase 5 — Future / Deferred: Native Hybrid Graph-RAG & AI Assistant Rewrite (Do NOT Start Until Explicitly Requested)
- **Direction:** Completely remove **Dify** (`backend/app/dify.py` and Dify docs/DSL) and rebuild the AI assistant natively on FastAPI + React/shadcn.
- **Why deferring until after Phases 1–4 is ideal:** Phases 1–3 build the exact foundations required for a world-class mathematical AI tutor:
  - **Hybrid Retrieval:** `pgvector` (semantic embeddings) + `pg_trgm`/`tsvector` (exact Persian/LaTeX symbol & theorem matching) + **Graph-RAG** via `note_edges` (automatically pulling prerequisites, related proofs, and counterexamples of the active note!).
  - Clean streaming SSE chat UI in React 19 + shadcn/ui with real persisted conversation history and citations linking directly to notes/Quick Peek.
- **Rule for Phases 1–4:** Keep legacy AI untouched/quarantined (no time spent polishing Dify) and preserve `pgvector` readiness.

---

## 3. Definition of Done for Each Phase
1. `npm run tsc` passes with **0 errors**.
2. `npm run build` completes cleanly (tracking build time & bundle size improvements).
3. Playwright E2E suite + `pytest` + pure unit tests pass **100%** with **0 browser console/page errors**.
4. Live visual inspection (Light & Dark modes, RTL/BiDi, mobile & desktop) via Chrome DevTools / screenshots.
5. Clean git commit pushed to `origin/main` and verified live on `https://test.atomathix.ir`.
