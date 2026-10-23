# Note connections boundary and UX review

## Scope and acceptance

Request: separate note content from the outgoing/backlink area; review that area's
UX and propose improvements. Add one themed border above the group with 32px
margin and 24px inner spacing. Preserve both existing connection lists and previews.
Only `frontend/src/pages/notes/[slug].astro` changed in application source.

Production build completed in 70.70s, exit 0. Real Chrome on the running site
verified the 1px solid boundary, two sections, all five existing links/previews and
no horizontal overflow at 1440px light/dark and 390px dark. Zero JavaScript errors.
Evidence: `../../logs/connections-2026-10-18/`. No data or backend changes.
No new unit test for this static markup/CSS change; browser checks cover it.
Repository remains unborn on `feat/phase-1-foundation`; no unrelated initial commit.

## Recommendations approved below (initial review)

- Add visible counts beside each section title and explain link direction once:
  outgoing means notes linked from this note; incoming means notes linking here.
- Keep preview disclosure on the same compact row as the note title. Its current
  repeated title adds visual noise and list rows take substantial vertical space.
  Preserve unique accessible names even if visible text becomes simply Preview.
- Backlinks should ideally show the paragraph containing the reference; generic
  first-paragraph previews do not explain why the source note points here.
- Give empty states direction-specific wording. For long lists, offer progressive
  disclosure with a count and Show more; keep keyboard/mobile controls accessible.

Used existing product tokens, local Better Design spacing/navigation guidance and
ui-ux-pro-max accessibility principles. No redesign or new dependency was added.

## Approved implementation plan — 2026-10-18

Scope: Connections component, its note-page caller, rendered reference snippets,
and knowledge tests. Add directional counts/help/empty states; first five rows
plus native disclosure for remaining rows. Capture the first referring paragraph
from resolved HTML before embed expansion; remove IDs. Preserve public catalogue
boundaries, source Markdown, links, anchors and the existing separator. Use the
site's 14px controls, 16px section titles and 4/8px spacing scale.
Acceptance: contextual/escaped/code/ambiguous/embed tests, full frontend tests,
TypeScript, final build, Chrome keyboard/RTL/mobile/light/dark checks.

## Implemented and verified

- Counts, directional help/empty states and compact title/preview rows.
- First five rows remain visible; native details exposes remaining rows with an
  accurate count and Show less. Unique accessible preview names remain intact.
- Backlinks show the first resolved referring paragraph, or a list/table/heading
  block when no paragraph exists. Capture precedes embed expansion, preventing
  borrowed links from becoming source context. Snippet IDs are removed and table/
  list wrappers normalized. Source Markdown and heading destinations are intact.
- Existing separator retained; 14px UI/preview text, 16px section headings,
  24px section spacing, shared 4/8px tokens and 44px interactive targets.

Final application tree: frontend 128/128 tests, TypeScript and production build
all exit 0; build completed in 83.65s. The added regression test first failed
before implementation. Real Chrome checked existing public notes against backend
8003: outgoing 3/backlinks 2; a 13-backlink list shows 5 plus 8 on disclosure;
directional empty state; contextual backlinks; Enter/Space disclosure; 390/1440px
light/dark; no horizontal overflow or browser JavaScript errors. No fixture data
was written. Detailed commands, exits, source hashes and runnable browser check:
`../../logs/connections-polish-2026-10-18/acceptance.json`.

Limits: Firefox/Safari and unchanged backend suite were not rerun. Disclosure
reduces visible rows, not payload size. Existing KaTeX corpus warnings are outside
this footer change. No dependency, database, original note or Atomic change.

Git remains unborn on `feat/phase-1-foundation`; a scoped initial commit would
not be a runnable repository, so unrelated source was not staged. Recoverable
source snapshot: `../../archive/legacy-connections-polish-2026-10-18.tar.gz`.
