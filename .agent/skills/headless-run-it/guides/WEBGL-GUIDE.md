# WEBGL GUIDE

For WebGL/Three.js applications verify:
- a canvas exists and has non-zero dimensions
- WebGL or WebGL2 context creation succeeds
- vendor and renderer are recorded
- the application rendered frames after initialization
- required models/textures/shaders loaded
- software rendering is identified when Lavapipe/llvmpipe is used

A launch flag requesting Vulkan/Lavapipe is not proof that the renderer is active. Inspect the actual WebGL renderer information.
