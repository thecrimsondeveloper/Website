# headless-run-it

Render and validate the real website or webgame from its repository. Do not substitute a visual reconstruction for the running application.

## Required flow

1. Read `RUN.md` in this skill directory before doing environment setup.
2. Use `.agent/plugins/headless-run-kit` as the implementation.
3. Inspect the target and detect its framework, package manager, build command, output directory, and Three.js/WebGL usage.
4. Install only the dependencies needed to run the target and kit.
5. Build the real target and serve it over localhost.
6. Render the localhost application in a real headless browser.
7. When WebGL is required, prefer an available native adapter and fall back to Mesa Lavapipe when hardware GPU access is unavailable.
8. Capture desktop, tablet, and mobile views unless the request scopes the viewports differently.
9. Record browser console errors, renderer information, environment information, and validation results.
10. Return the generated evidence paths and clearly distinguish passed, failed, and untested checks.

## Acceptance contract

A successful website run means the repository's real code was built, served, executed, and captured. A Three.js/WebGL target must obtain a valid WebGL context and render the actual scene. Static mockups, reconstructed screenshots, or replacement scenes do not satisfy acceptance.

Expected evidence lives under `evidence/headless-run/` and normally includes `validation.json`, `environment.json`, `browser-console.log`, `renderer.json`, `desktop.png`, `tablet.png`, `mobile.png`, and `contact-sheet.png`.
