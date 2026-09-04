# Crimson Harbor World 3D Factory Kit

Deterministically generates the lightweight boat, fish, rock, star, and harbor layout used by the Crimson Wheeler portfolio. Five reviewed coral GLBs are consumed unchanged from `LuminaryLabs-Dev/NexusFactory-Kits` commit `627c4aeb864f438c3b1a24a00b152a17d24e8cf9` under the included MIT license.

```bash
npm run harbor:test
npm run harbor:generate
npm run harbor:validate
npm run harbor:headless
```

The browser Studio-style preview is `factory/harbor-world-3d/index.html`. The public Website consumes only the generated files under `public/assets/harbor/`; it does not require the Factory Kit at runtime.

The packaged Kit is self-contained under `exports/`. Its six-operation factory API is in `src/factory.mjs`; `npm test`, `npm run generate`, and `npm run validate` are the clean-room entry points.
