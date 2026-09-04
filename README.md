# Crimson Wheeler — Portfolio

A statically exported Next.js portfolio with a custom `<shader-renderer>` element. The element uses Three.js for a top-down 3D harbor, a low-level GLSL water pass, and automatic WebM/WebP fallbacks.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production build

```bash
npm run build
```

The deployable static site is written to `out/`.

## GitHub Pages deployment

This repository uses GitHub Pages' branch deployment and does not require a custom GitHub Actions workflow. Build the `/Website` version and prepare the committed `docs/` directory with:

```bash
npm run build:pages
```

Then commit both the source changes and generated `docs/` files to `main`. In GitHub, set **Settings → Pages** to deploy from the `main` branch and the `/docs` folder.

## Harbor Factory Kit

The reusable Factory Kit is in `factory/harbor-world-3d/`. It deterministically generates a heightmapped seabed, curved rock/coral/fish layouts, six stars, and the production world description, then combines them with the reviewed high-detail GLBs sourced from Objaverse and NexusFactory-Kits.

```bash
npm run harbor:test
npm run harbor:generate
npm run harbor:validate
npm run harbor:layout
npm run harbor:performance
npm run harbor:mesh
npm run harbor:interaction
npm run harbor:headless
npm run harbor:review
npm run harbor:package
```

The generated Website assets live in `public/assets/harbor/`. High quality renders 48 logical rock clusters as 192 instanced rocks, 42 coral placements, 18 curve-following fish, and 6 interactive stars. The Kit includes its source contract, provenance, six-operation service API, clean-room package, locked multi-angle visual review, and technical validation evidence.
