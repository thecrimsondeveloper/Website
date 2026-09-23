# ACQUIRE REPOSITORY

## Goal
Acquire the exact repository state required for the run.

## ChatGPT Online
1. Use the GitHub connector as the authoritative source.
2. Resolve repository, default branch, and exact HEAD SHA.
3. Read the repository tree.
4. Materialize required source files and runtime assets into the sandbox workspace.
5. Verify required files exist before proceeding.
6. Record repository, branch, SHA, acquisition source, and missing files in `repository.json`.

Do not begin with `git clone` when the environment guide says connector acquisition is required.

## Failure rule
If required binary/runtime assets are unavailable, fail repository acquisition explicitly. Do not reconstruct the application.
