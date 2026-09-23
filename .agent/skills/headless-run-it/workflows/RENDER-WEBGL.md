# RENDER WEBGL

## Sequence
1. Detect the application canvas.
2. Detect WebGL/WebGL2 support.
3. Attempt the environment's preferred browser renderer.
4. If appropriate, attempt ANGLE/Vulkan.
5. If GPU rendering is unavailable, configure Mesa Lavapipe.
6. Verify the renderer actually in use; do not infer success from flags alone.
7. Wait for the scene-ready condition.
8. Capture evidence.

Direct `@headless-three/renderer` execution may be used as a secondary deterministic scene-validation surface, but it does not replace browser validation of the website.

Read `../guides/WEBGL-GUIDE.md`.
