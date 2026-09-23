# ChatGPT / sandbox run procedure

Use this procedure before invoking `headless-run-kit` in a ChatGPT sandbox or other headless Linux environment.

## 1. Locate and inspect

- Work from the real repository checkout.
- Read repository instructions before installing or building.
- Verify Node.js and the repository package manager.
- Locate Chromium/Chrome and record its executable path.
- Check for Vulkan/Mesa tools and a Lavapipe ICD such as `/usr/share/vulkan/icd.d/lvp_icd.x86_64.json`.

## 2. Prepare software rendering

When no usable GPU is exposed, configure Mesa/Lavapipe for the process rather than modifying the host globally. Typical environment values are:

```bash
export LIBGL_ALWAYS_SOFTWARE=1
export VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.x86_64.json
```

Do not assume the ICD path: detect it first. `MESA_LOADER_DRIVER_OVERRIDE` is optional and must match the actual installed Mesa driver.

## 3. Install and build

- Install the target project's dependencies using its lockfile/package manager.
- Install the kit dependencies from `.agent/plugins/headless-run-kit` when needed.
- Run the target's normal production build when one exists.
- Do not rewrite the site merely to make it render.

## 4. Serve

Start the built application or development server on localhost using the project's normal command. Confirm the HTTP endpoint responds before launching the browser.

## 5. Run the kit

```bash
node .agent/plugins/headless-run-kit/scripts/run.mjs \
  --target . \
  --url / \
  --views desktop,tablet,mobile \
  --webgl \
  --lavapipe
```

Use `--full-page` when full-page captures are requested. The kit writes evidence to `evidence/headless-run/` by default.

## 6. Validate

Acceptance requires:

- build/start succeeded;
- localhost responded;
- browser executed the real application;
- no fatal JavaScript error prevented rendering;
- requested screenshots are non-empty;
- when `--webgl` is requested, a WebGL context exists and renderer details were captured;
- the target scene/application reached a ready state or the run reports why readiness could not be established.

For Three.js projects that already expose a deterministic direct-render harness such as `@headless-three/renderer`, it may be run as additional evidence. It does not replace browser validation of the website.
