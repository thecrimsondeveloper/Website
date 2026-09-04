# Crimson Harbor World 3D Factory Kit

Deterministically generates the 129×129 seabed heightfield, 256×256 height/normal/albedo/AO maps, Catmull–Rom composition curves, and constrained placements used by the Crimson Wheeler portfolio. The high profile contains 48 logical rock clusters expanded into 192 instanced rocks, 42 coral placements, 18 curve-following fish, and 6 interactive stars. Reviewed high-detail runtime GLBs retain their recorded Objaverse and NexusFactory-Kits provenance.

```bash
npm run harbor:test
npm run harbor:generate
npm run harbor:validate
npm run harbor:mesh
npm run harbor:layout
npm run harbor:performance
npm run harbor:interaction
npm run harbor:headless
npm run harbor:review
```

The browser Studio-style preview is `factory/harbor-world-3d/index.html`. The public Website consumes only the generated files under `public/assets/harbor/`; it does not require the Factory Kit at runtime.

The packaged Kit is self-contained under `exports/`. Its six-operation factory API is in `src/factory.mjs`; `npm test`, `npm run generate`, and `npm run validate` are the clean-room entry points.
