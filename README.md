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

The deployable static site is written to `out/`. Pushes to `main` are deployed to GitHub Pages by `.github/workflows/deploy.yml`.

## Harbor Factory Kit

The reusable Factory Kit is in `factory/harbor-world-3d/`. It deterministically generates the boat, fish, rocks, stars, and world layout, then combines them with the reviewed coral GLBs sourced from NexusFactory-Kits.

```bash
npm run harbor:test
npm run harbor:generate
npm run harbor:validate
npm run harbor:package
```

The generated Website assets live in `public/assets/harbor/`. The Kit includes its source contract, provenance, six-operation service API, clean-room package, and validation evidence.
