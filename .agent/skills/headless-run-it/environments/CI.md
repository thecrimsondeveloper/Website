# CI

1. Use the checkout supplied by the CI runner.
2. Record commit SHA and workflow/job metadata when available.
3. Install browser/runtime dependencies deterministically.
4. Prefer stable software rendering when GPU availability is not guaranteed.
5. Preserve screenshots, logs, renderer metadata, and validation JSON as CI artifacts.
6. Fail the job when required acceptance checks fail.
