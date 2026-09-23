# CHATGPT ONLINE

## Repository acquisition
Use the GitHub connector as the authoritative repository source.

Required sequence:
```text
GitHub connector
  -> resolve main/default branch
  -> resolve exact HEAD SHA
  -> read recursive tree
  -> materialize required source + runtime assets into sandbox
  -> verify required files
  -> run headless-run-kit
```

Do not treat `git clone` as the primary acquisition path in ChatGPT Online.

## Workspace
Prefer a deterministic workspace under `/mnt/data/headless-run/<repo>/` with separate repository and evidence areas. Do not silently reuse an older partial reconstruction.

## Graphics
Locate Chromium and Mesa/Vulkan. When software rendering is required, locate an `lvp_icd` file and configure Lavapipe. Verify renderer identity after launch.

## Binary assets
Source code alone is insufficient. GLB, images, videos, fonts, textures, and other runtime assets required by the application must exist locally before claiming the repository is materialized.
