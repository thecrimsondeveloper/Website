# headless-run-kit

Reusable implementation behind `.agent/skills/headless-run-it`.

The kit validates the real locally served website. It captures responsive screenshots, browser console output, environment metadata, WebGL renderer information, and a machine-readable validation report. It does not reconstruct or replace the target application.

```bash
node .agent/plugins/headless-run-kit/scripts/run.mjs --target . --url / --views desktop,tablet,mobile --webgl --lavapipe
```

The target must be running on localhost. Pass `--base-url http://127.0.0.1:PORT` when auto-detection is not appropriate.

Default output: `evidence/headless-run/`.
