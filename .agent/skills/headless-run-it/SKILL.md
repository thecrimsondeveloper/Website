# HEADLESS-RUN-IT

Purpose: route website and webgame validation through the real application.

## Always
1. Read `RUN.md`.
2. Detect the current execution environment.
3. Read the matching environment guide.
4. Select only the workflows required for the task.
5. Execute through `.agent/plugins/headless-run-kit`.
6. Validate before reporting success.

## Never
- Reconstruct the website instead of running it.
- Substitute invented/static HTML for the real application.
- Ignore missing runtime assets.
- Claim a render succeeded without evidence.
- Treat direct Three.js scene rendering as equivalent to browser validation.

## Router
- Universal workflow router: `RUN.md`
- Environment-specific setup: `environments/`
- Exact execution procedures: `workflows/`
- Viewing/operation/acceptance guidance: `guides/`
