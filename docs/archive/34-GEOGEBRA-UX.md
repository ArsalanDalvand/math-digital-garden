# GeoGebra reading experience

## Approved scope and plan

Remove the erroneous code-block wrapper around rendered GeoGebra figures. Load
visible diagrams automatically (near-viewport lazy loading for long notes),
without stealing focus or opening the keyboard. Keep algebra input enabled by
default, preserve diagram commands/source, and fit the available width. Keep the
existing isolated viewer hostname, sandbox, script restrictions and message checks.
Provide loading/error/retry feedback, compact source disclosure and no grey card.

Touch points: Markdown renderer, GeoGebra client binding and isolated viewer,
shared figure styles, lifecycle/renderer tests. No dependencies, note/database
writes or Atomic changes. Acceptance: regression tests first, full frontend suite,
TypeScript, production build and real vendor applet in desktop/mobile Chrome.
External vendor failures must remain visible; a mocked applet is not browser proof.
