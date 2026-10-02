# Paper Globe

A browser-local workshop for turning complete projected world-map images into printable north/south paper-globe templates. Maps and logos are decoded, reprojected, and exported on the user's device; they are not uploaded.

**Status:** hardening implementation, pending clean-build/CI review and physical print/assembly acceptance. The nominal physical dimensions are now derived mathematically, but an assembled globe's tolerances are not certified by software tests. Do not describe the CSS globe illustration as a verified 3D preview.

The previous planning README is retained verbatim as [the historical implementation plan](docs/IMPLEMENTATION_PLAN.md). Its "current prototype" section describes the pre-hardening revision, not the current code. Current choices and remaining acceptance gates are documented in [Hardening and verification](docs/HARDENING.md).

## Features

- Still PNG, JPEG, and WebP world maps in equirectangular, Natural Earth, Robinson, or Web Mercator projection.
- 4, 6, 8, or 12 gores, opposite north/south winding, Letter/A4/Tabloid paper.
- Physical-size layout, explicit fit rejection, and a 25.4 mm / 1 inch scale check. Print at **100% / actual size**, with fit-to-page disabled.
- One SVG scene for preview, downloadable SVG, and two-sheet browser printing. Map pixels are raster; cut/fold lines and labels are vector.
- Independent 720-pixel preview and 200-DPI final raster output.
- Browser Web Worker reprojection with progress, cancellation, latest-result protection, and a cooperative main-thread fallback.
- Optional bounded description/legend text and raster-only logos. SVG logos are deliberately rejected rather than passed through unsanitized.
- SVG export from any preview tab; visible error/recovery messages; non-destructive Reset view; accessible hemisphere selection.

A complete globe still requires both hemispheres. Download each hemisphere or choose Print / PDF for the two-page set. Browser Save as PDF is not a separate server-side PDF service.

## Development

Use Node.js **22.13 or later** and the committed npm lockfile:

```bash
cd site
npm ci
npm run dev
```

The development command prints the local URL. No Cloudflare credentials, D1, R2, or application environment variables are required for the image-processing workflow.

```bash
npm test                 # portable, strictly compiled Node assertions
npm run test:projection  # focused geometry/projection/export assertions
npm run test:browser     # real Chrome/Chromium Canvas, Worker, image decode, print fixtures
npm run check            # non-mutating whitespace check, lint, full type check, tests
npm run build            # generates build.json and the Vinext Worker bundle
```

Browser checks use Node's built-in WebSocket/CDP support and a local Chrome/Chromium executable, without adding a test framework dependency. Set `CHROME_BIN` when Chrome is not on PATH (for example on Windows or macOS). The self-contained browser harness performs no external requests. It tests the rendering modules, not Vite's worker bundling or the complete React application.

For full React workflow smoke tests, start the application in one terminal and run:

```bash
npm run dev -- --port 4173
# In another terminal:
npm run test:workflow -- http://127.0.0.1:4173
```

`format:check` enforces LF, final newlines, and no trailing whitespace without changing release source. `npm run format` retains oxfmt for full formatting when intentionally editing. CI additionally runs lint, type checking, the production build, the browser fixtures, and the React workflow tests. Dependencies are unchanged; the existing lockfile remains authoritative. The old reliance on an undeclared esbuild executable and a shared Unix `/tmp` test filename has been removed.

## Architecture

| Module | Responsibility |
| --- | --- |
| `site/app/page.tsx` | Single-screen UI and accessible native settings controls |
| `site/app/useWorkshop.ts` | Source ownership, view/settings state, render identity, export orchestration |
| `site/app/GorePreview.tsx` | Displays the canonical local SVG scene; owns only its temporary display URL |
| `site/src/globe/coordinates.ts`, `cassini.ts` | Pure geographic transforms |
| `site/src/globe/geometry.ts`, `paper.ts` | Gore/tab boundaries and physical layout/fit rules |
| `site/src/globe/source-projection.ts` | Source projection mapping and cancellable footprint detection |
| `site/src/globe/raster.ts` | DOM-independent RGBA sampling and cooperative rendering pipeline |
| `site/src/globe/render.worker.ts`, `render-client.ts` | Background rendering, cancellation, stale-result rejection, fallback |
| `site/src/globe/input.ts`, `lifecycle.ts` | Encoded/decoded validation and latest-selection resource ownership |
| `site/src/globe/export.ts` | Shared SVG scene, local PNG encoding, download, two-page print lifecycle |

## Hosting

The documented production URL is **https://paper-globe.mtaxmraz.workers.dev**. This repository uses **Cloudflare Workers and Workers Static Assets**, not Pages, D1, R2, KV, or a conversion backend. The inline Vite configuration declares the Worker name and compatibility date. A *browser* Web Worker is unrelated to Cloudflare Workers and does not introduce another hosted resource.

The legacy `site/.openai/hosting.json` is not used by the Cloudflare deployment. User imagery remains local. `/build.json` contains only source revision and dirty-checkout status, not user data.

Production deployment is an explicit maintainer action, never part of PR CI:

```bash
cd site
npm run deploy:cloudflare
```

The release command requires a clean `main` checkout, runs the checks/build, tags the deployed Worker with its source SHA, and records local release evidence under ignored `.release/`. Cloudflare authentication is needed only for that deployment step. Record the previous Worker version before deploying.

After deployment:

```bash
npm run smoke -- https://paper-globe.mtaxmraz.workers.dev <40-character-source-SHA>
npm run test:workflow -- https://paper-globe.mtaxmraz.workers.dev
```

Complete the [release checklist](docs/HARDENING.md#release-acceptance) and retain the resulting Worker version, smoke evidence, and rollback target. A repository PR does not establish what is currently deployed.

## License

MIT; see [LICENSE](LICENSE). Users remain responsible for rights to the maps and logos they reproduce.
