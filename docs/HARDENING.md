# Hardening decisions and verification

This implementation addresses the review of source revision `78c89447ebc5a7e1010bedb4f2dc5a41b7cdc431` and issues #1–#12. The original planning document is preserved as `IMPLEMENTATION_PLAN.md`. Source changes and test evidence are not a claim that production has been deployed or physical assembly has passed.

## Decisions used by this PR

### Physical geometry and paper fit (#1, #2)

Keep the existing radial north/south layout and spherical Cassini projection. Define the requested diameter as the nominal outside-surface diameter. For sphere diameter D, the central-meridian arc from pole to equator is `pi*D/4`. That determines the template radius; it is no longer a footer-only value.

The page model uses exact millimeters: Letter 215.9×279.4, A4 210×297, Tabloid 279.4×431.8. Reserve 12 mm margins, a 20 mm header region, and 48 mm for annotations/instructions/calibration. Fit conservatively includes the complete raster artwork square, including its transparent border. Unsupported sizes are rejected; no silent scale-to-fit is applied. The initial diameter is 3.5 inches so the default fits Letter and A4. Larger paper permits a larger globe, not automatic enlargement. An 8-inch globe does not fit this two-sheet layout and must not be mislabeled as fitting.

The 25.4 mm calibration line is in physical coordinates. Printer scaling, printer margins, paper thickness, pole/seam overlap, and assembly technique can alter the real outcome. Maintain the manual acceptance gate below.

Each tab's fill is separate from its cut and fold geometry. The exterior cut boundary detours around the trapezoid; the attachment segment is exclusively a fold line. Disabling cut lines hides tab cut outlines too. Turning off fold marks hides the tab fold treatment.

### Canonical composition (#4, #7, #8)

Preview, SVG, and print use the same `createTemplateSvg` scene with millimeter geometry, text, logo order, and mark visibility. The preview is a local SVG image, not separately positioned CSS overlays. Pole logos suppress the pole badge so it cannot obscure the mark. Near-equator placement is an illustrative near-edge position, not a claim that a flat logo is spherically reprojected.

Render results are keyed by source ID, source projection, gore count, hemisphere, and retry generation. A raster whose key differs is not paired with current geometry. Export produces a new final-resolution raster and does not read a mounted preview canvas. Changing preview modes therefore cannot remove the export source. The source renderer remains owned by the session; preview mounting owns only a temporary display URL.

### Input and resource policy (#5, #9)

- Maps: at most 20 MiB encoded, 8,388,608 pixels decoded, 8,192 pixels per side.
- Logos: at most 5 MiB encoded, 1,048,576 pixels decoded, 2,048 pixels per side.
- Still PNG/JPEG/WebP only. Sniff the signature and encoded dimensions before browser decode; reject misleading nonempty MIME declarations and known PNG/WebP animation containers. Decode and revalidate dimensions, allowing orientation-related swaps.
- Logos are decoded and normalized to PNG before preview/export. SVG logos, external image URLs, and arbitrary markup are not accepted.
- No source/filename/setting is sent to analytics, error services, or an upload endpoint.
- A failed replacement preserves the accepted source. Latest-selection ownership invalidates old callbacks, releases stale successes, and ignores stale failures. Clear/unmount invalidates pending work and releases the owned URL. File inputs are reset so the same file can be retried.

These are conservative initial allocation limits, not a proven peak-memory ceiling for every browser. One maximum-size decoded RGBA source is 32 MiB. The worker retains another bounded copy so a main-thread fallback remains possible; output is capped at 6,000,000 pixels (about 22.9 MiB RGBA) per hemisphere. Decoder, Canvas, encoding, SVG strings, and browser internals add overhead. Print renders the hemispheres sequentially. Mobile/Safari peak-memory validation remains required before broad release.

### Rendering and output resolution (#6, #10)

A DOM-independent generator performs alpha-weighted bilinear interpolation and preserves the existing wrapping/clamping/projection rules. Sampling interpolates premultiplied color, then unpremultiplies to straight RGBA for ImageData. Transparent black therefore cannot darken neighboring red pixels.

Source pixels are decoded once per accepted file. A worker owns its cached content bounds per source projection. Raster jobs and margin scans yield between rows, with approximately 8 ms scheduling slices and throttled progress. A newer job cancels the old one; results carry job IDs. Worker startup/runtime-loading failure terminates that worker and uses the same cooperative pipeline on the main thread. Cancellation and disposal settle pending promises.

Preview is 720×720. Final raster defaults to 200 DPI computed from the physical artwork side, with an output-pixel cap. Vector marks remain vector. The render API supports bounded 72–300 DPI values, but the UI intentionally uses the tested 200-DPI default rather than exposing an unbounded quality slider.

### UI behavior (#3, #12)

Operation notices are independent of source presence and distinguish errors from information/success. Invalid replacements and popup errors remain visible with the old map loaded. Projection failure has a retry action. Reset view means **Template + North**, preserving map, logo, diameter, marks, notes, and projection. South is sheet 2, and hemisphere buttons expose `aria-pressed`.

The Globe tab remains explicitly an illustration, not an interactive or geometrically verified 3D globe. This PR does not introduce WebGL or claim that the illustration verifies geography or assembly.

## Automated verification

`npm test` compiles the test dependency graph with the project's directly declared TypeScript package and runs Node's native test runner in a unique OS temporary directory. Current coverage includes 20 named tests: geographic/Cassini round trips, all supported widths/windings, physical dimensions/fit, tab attachment topology, toggles, XML escaping, logo policy, output resolution, MIME/signature/dimension checks, animation rejection, latest-selection races, cleanup, scheduling, raster alpha, deterministic projection/count/hemisphere fixtures, cancellation, and retry.

`npm run test:browser` uses a self-contained CommonJS-to-browser test adapter and native Chrome/Chromium. The adapter supplies the worker as a data-URL module rather than Vite's emitted URL, so production bundling is deliberately outside this test's claim. It tests real browser image decode, Canvas/SVG rasterization, native worker/fallback equality over all 32 combinations, cancellation, startup failure fallback, responsiveness, pole-logo pixels, two decoded print images, popup failure, and a representative source benchmark.

`npm run test:workflow -- <base-url>` exercises the real React page: file upload, failed replacement feedback, export from Map and Globe, popup denial, fit rejection, cut toggles, pole logo, injected Canvas failure/retry, reset/sheet/accessibility state, and a narrow viewport. CI runs this against a local Vinext development server after the production build. A production URL can be supplied separately after deployment.

The source hygiene gate is non-mutating; oxfmt remains the explicit full formatter. CI installs the committed lockfile, runs lint/full type checking/tests/browser checks, builds the production Worker, tests the workflow, and checks that validation did not modify tracked source. No deployment runs in CI.

### Measurements in the implementation environment

Node 22.16.0 with the available TypeScript 5.8.3 compiler: all 20 Node tests passed. The repository remains pinned to TypeScript 5.9.3; clean CI must verify that pinned toolchain. Strict domain-module checks and TSX syntax/transpilation checks were also run. A full dependency installation/Vinext build and complete React workflow were not executable in the network-restricted implementation environment; their gates are provided but must be observed passing in CI.

Nine self-contained Chromium browser checks passed. In one non-representative headless Linux run, the cooperative 1000×1000 render was about 235 ms; a 4096×2048 source rendered a 720×720 worker preview in about 154 ms and a 1400×1400 worker raster in about 456 ms. These are single-run smoke measurements, not p95 budgets or mobile guarantees. Re-run the harness to obtain the exact figures for each environment. Pixel equality, rather than speed, is the automated correctness gate.

## Release acceptance

Before marking this work production-ready:

- [ ] Observe clean `npm ci`, lint, pinned type checker, all automated checks, and the production build passing in CI. Inspect the generated Worker configuration and verify the named Worker and static assets, including the browser-worker bundle.
- [ ] Run the React workflow against the actual deployed build, not only the development server. Check real downloaded SVGs and browser Save as PDF.
- [ ] Print at actual size on Letter, A4, and Tabloid; measure the 25.4 mm marker and pole-to-equator arc. Record printer, paper, settings, requested diameter, measured dimensions, and tolerance.
- [ ] Assemble a north/south pair for each of 4/6/8/12 gores; inspect attachment folds, seams, winding, poles, tab overlap, and geographic alignment. Decide whether conventional gores are needed if the radial arrangement fails the physical trial.
- [ ] Exercise current Chrome/Edge, Firefox, Safari, and iOS Safari: input extremes, memory pressure, worker/fallback cancellation, export, popup restrictions, actual-size printing, and keyboard/screen-reader status behavior. Record peak-memory observations and revise limits downward if needed.
- [ ] Capture network traffic with synthetic files and confirm image bytes, names, metadata, and settings are not transmitted. Ordinary app asset/framework requests are expected.
- [ ] Before deployment record the current Worker version as the rollback target. Deploy a clean main revision explicitly; never conflate a PR branch with production.
- [ ] Save `.release/<sha>.json`, the actual Worker version, source SHA, source/asset smoke result, full workflow result, and rollback target outside ignored working files in the team's release record. The CLI output is retained if version-ID parsing requires manual confirmation.
- [ ] Perform a rollback rehearsal through Cloudflare's version/deployment tooling and document the verified steps for the owning account.

This checklist makes the remaining human/provider verification explicit rather than asserting that a code-only PR has already passed it. The PR should remain a draft until its automated integration gates pass, and production readiness should wait for the physical/browser checks.
