# Paper Globe

Paper Globe is a browser-based projection workshop that turns any 2:1 equirectangular world image into a printable globe template. Image decoding, Cassini reprojection, layout, and export all happen locally in the browser—the source image is never uploaded.

## Current MVP

- Validates PNG, JPEG, and WebP source maps for a 2:1 aspect ratio.
- Uses inverse spherical Cassini projection with bilinear raster sampling.
- Creates 4, 6, 8, or 12 radial gores for north and south hemispheres.
- Separates raster projection from vector cut, fold, tab, and logo layers.
- Exports the active sheet as SVG and opens a two-sheet Print / PDF layout.
- Supports Letter, A4, and Tabloid layouts plus an authorized logo layer.
- Includes a wrapped-globe coverage preview.

## Development

The deployable application lives in `site/`.

```bash
cd site
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Architecture

The projection code is isolated under `site/src/globe/`:

- `coordinates.ts` maps equirectangular pixels to and from longitude/latitude.
- `cassini.ts` implements forward and inverse spherical Cassini transforms.
- `gore.ts` samples the uploaded raster and composes hemisphere gores.
- `export.ts` combines the raster with vector template geometry for SVG and print output.

The UI is a React/Vinext application under `site/app/`, prepared for OpenAI Sites and Cloudflare Workers hosting.

## Privacy

Uploaded maps and logos remain in the browser. The MVP has no upload endpoint, database, or object storage.

## License

MIT. See [LICENSE](LICENSE).
