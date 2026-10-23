# Reader navigation repair

Scope: Reader.astro shared shell, workspace.css, navigation regression test. All Reader callers receive the same behavior; no API, content, fixtures, dependencies, or exports change.

Acceptance: a header button remains available when desktop navigation is collapsed; its expanded state follows visibility. At <=900px navigation starts closed and opens as a nonmodal RTL drawer. Close and Escape return focus to the header button; resizing resets to the appropriate desktop/mobile default. Hidden navigation is inert. Existing links and folder tree are reused.

Verification: execute the actual Reader client script in jsdom with desktop/mobile media-query fixtures. Browser layout verification is separate; synthetic DOM tests do not establish rendered layout or server authorization.

Evidence: targeted navigation tests first failed 2/2 on missing expanded-state initialization (exit 1), then passed 2/2 after repair (exit 0). Final frontend command `node --test --test-isolation=none ../tests/frontend/*.test.mjs` from `frontend/`: 90 passed, 0 failed, exit 0. Build and browser checks are recorded by the coordinating task. The explicit reading setting “study without sidebar” still hides navigation intentionally.
