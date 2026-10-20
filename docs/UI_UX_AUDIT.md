# UI/UX audit

This document lists the UI and UX problems found in Paper Globe and the recommended fixes. It is written so another person can pick up the work.

## Scope and baseline

- **What was audited:** `main` at `02a4887` ("Add globe favicon, map-based export names, and glue-tab shapes"). The files reviewed were `site/app/page.tsx`, `GorePreview.tsx`, `globals.css`, `layout.tsx`, `site/src/globe/export.ts` and the README.
- **What the Status column means:** whether each item is still a problem on `fix/review-issues-1-12` at `8ec9c8e`. That branch rewrote most of the UI (`page.tsx`, `useWorkshop.ts`, `workshop.css`, the canonical SVG scene and the render worker), so many findings are already fixed there.
- **Method:** The audit comes from reading the code. The app was not run or tested in a browser. Contrast ratios are approximate calculations against the `#fffdfa` panel background and should be confirmed with a contrast tool.

| Status | Meaning |
|---|---|
| Fixed | Fixed on `fix/review-issues-1-12`; no further work needed. |
| Partial | Improved on the branch, but part of the problem remains. |
| Open | Still a problem on the branch. |
| New | Introduced or exposed by the branch rewrite. |

Severity: **P0** means broken or misleading, **P1** means a significant UX or accessibility gap, and **P2** means polish.

---

## Summary

| ID | Title | Status |
|---|---|---|
| P0-1 | Status messages invisible once a map is loaded | Fixed |
| P0-2 | Adding a logo makes the map upload card look like an error | Fixed |
| P0-3 | "Export SVG" silently fails on the Map and Globe tabs | Fixed |
| P0-4 | "Reset view" button does nothing | Fixed |
| P0-5 | Diameter slider has no real effect | Fixed |
| P0-6 | Preview does not match the export | Fixed |
| P0-7 | Globe tab shows a mock-up as if it were a preview | Partial |
| P0-8 | UI freezes while projecting | Fixed |
| P0-9 | Glue-tab shape picker and map-based file names missing on the branch | New |
| P1-1 | Export actions split up and look alike | Open |
| P1-2 | Layout doesn't fit a normal laptop screen | Open |
| P1-3 | Mobile and tablet layout | Open |
| P1-4 | Paper frame around Map/Globe; hemisphere switch shown everywhere | Partial |
| P1-5 | Choosing a hemisphere | Open |
| P1-6 | Uploading a map | Partial |
| P1-7 | Choosing the source projection | Partial |
| P1-8 | Sample or empty template isn't labeled | Open |
| P1-9 | Assembly mark controls | Open |
| P1-10 | Choosing the number of gores | Open |
| P1-11 | Notes and legend are truncated silently | Partial |
| P1-12 | Logo section | Partial |
| P1-13 | Guide dialog content | Partial |
| P1-14 | Preview loses the map image during every re-render | New |
| P1-15 | Feedback banner can be off-screen | New |
| A-1 | Text is too small | Open |
| A-2 | Text contrast fails WCAG AA | Open |
| A-3 | Focus indicator is too faint | Partial |
| A-4 | Missing or wrong semantics | Partial |
| A-5 | Status changes aren't announced | Fixed |
| A-6 | Touch targets are too small | Open |
| P2-1 | Hardcoded colors; unused dark theme | Open |
| P2-2 | Section headings inconsistent | Open |
| P2-3 | "Live preview" indicator always on | Fixed |
| P2-4 | Units are inches only | Open |
| P2-5 | Jargon in status text | Fixed |
| P2-6 | Render error has no recovery | Fixed |
| P2-7 | Overlay and map out of sync after hemisphere switch | Fixed |
| P2-8 | Site description is outdated | Open |
| P2-9 | Settings are lost on refresh | Open |
| P2-10 | Export resolution too low | Fixed |

---

## P0: Broken or misleading behavior

### P0-1. Status messages invisible once a map is loaded — Fixed
- **Problem (`main`):** `page.tsx` only showed `notice` when `!sourceMap`. After a map was loaded, these messages were never visible:
  - the aspect-ratio warning,
  - logo accepted or rejected,
  - "SVG downloaded",
  - the pop-up-blocked print error,
  - errors from invalid replacement files.
- **Branch:** Notices now have a type (`{ kind: 'error' | 'success' | 'info' }` in `useWorkshop.ts`) and are shown in a global `aria-live` feedback region. See P1-15 for a remaining placement issue.

### P0-2. Adding a logo makes the map upload card look like an error — Fixed
- **Problem (`main`):** The upload card got the red `invalid` class whenever `notice && !sourceMap`. Adding a logo before a map turned the map card red and showed "Logo added…" under it with a warning icon.
- **Branch:** The card no longer depends on the notice.

### P0-3. "Export SVG" silently fails on the Map and Globe tabs — Fixed
- **Problem (`main`):** `canvasRef` was only attached while the Template tab was mounted. Exporting from Map or Globe hit a null canvas and showed a misleading notice that was itself hidden (P0-1).
- **Branch:** `exportTemplates` renders through `RenderClient`, independent of the current tab.

### P0-4. "Reset view" button does nothing — Fixed
- **Problem (`main`):** The button had no `onClick`.
- **Branch:** It now returns to the northern template and keeps the map and settings. It has a tooltip and is explained in the guide.

### P0-5. Diameter slider has no real effect — Fixed
- **Problem (`main`):** Diameter only changed label text.
- **Branch:** `paperLayout()` uses it as a physical size. The UI shows the maximum diameter for the paper and rejects layouts that don't fit (`fitError`). Inches-only units remain a separate issue (P2-4).

### P0-6. Preview does not match the export — Fixed
- **Problem (`main`):** The preview and exported SVG differed in header text ("Sheet 1 of 2" was hardcoded), annotation truncation and position, the cut/fold legend, and logo size limits.
- **Branch:** The preview shows the same `createTemplateSvg()` output that is exported and printed.

### P0-7. Globe tab shows a mock-up as if it were a preview — Partial
- **Problem:** The Globe tab is a CSS circle with the flat image as its background. It only works for equirectangular maps and doesn't represent the actual globe.
- **Branch:** It is now labeled "Illustration only — not a 3D projection", with a note that it doesn't verify anything.
- **Remaining:**
  - Either rename the tab to "Coverage" (or similar) so the tab name doesn't suggest a 3D view, or
  - draw a real orthographic globe on a canvas using the existing sampling code, with drag to rotate, for all four source projections.
- **Done when:** The tab name and content are accurate for every source projection.

### P0-8. UI freezes while projecting — Fixed
- **Problem (`main`):** Projection ran synchronously on the main thread, so the "Projecting map…" badge probably never painted.
- **Branch:** `render.worker.ts` and `RenderClient` show progress, support cancellation and ignore stale results.

### P0-9. Glue-tab shape picker and map-based file names missing on the branch — New
- **Problem:** `fix/review-issues-1-12` was branched from `78c8944`, before `main`'s `02a4887`. That commit added the glue-tab shape picker (`GLUE_TAB_OPTIONS`) and file names based on the uploaded map's name (`templateExportName`). The branch rewrote the same files, so neither feature exists on the branch and merging conflicts in six files.
- **Fix:** Merge or rebase `main` into the branch. Port the tab-shape picker into the new `page.tsx` and `geometry.ts`/`createTemplateSvg()`. Decide between the two file-name schemes (`exportFilename` on the branch, `templateExportName` on `main`); a combination such as map name + hemisphere + gores + diameter + paper is recommended.
- **Done when:** Both features work on the merged branch and appear in preview, SVG and print.

---

## P1: Workflow and layout

### P1-1. Export actions split up and look alike — Open
- **Where:** "Export SVG" is in the top bar and "Print / PDF" is in the preview footer (`site/app/page.tsx`). Both use the `outline` style.
- **Problem:**
  - There is no clear primary action.
  - "Export SVG" downloads only the hemisphere currently shown, and the label doesn't say which.
  - Disabled buttons don't say why they are disabled.
- **Fix:**
  - Put both actions in one export area.
  - Primary button: "Print / Save PDF (both sheets)".
  - Secondary button: "Download SVG", with a menu offering North, South and Both.
  - When disabled, show the reason (for example "Choose a map to export" or "Diameter too large for this paper").
- **Done when:** There is one visually primary export action, the SVG option names its hemisphere, and every disabled state has visible reason text.

### P1-2. Layout doesn't fit a normal laptop screen — Open
- **Where:** `globals.css` `.app-shell` and `.workspace` (`min-height: 100vh` / `calc(100vh - 72px)`), and `.canonical-preview` in `workshop.css` (`width: min(100%, 650px)`).
- **Problem:** A 650px-wide Letter sheet is about 840px tall. Adding the 72px top bar and the toolbar and footer, the page is taller than a 1366×768 or 1920×1080 browser window. The hemisphere switch and Print button end up below the fold, and the sidebar scrolls with the page.
- **Fix:**
  - `.workspace { height: calc(100dvh - 72px) }`
  - sidebar `overflow-y: auto`
  - size the preview by the available height (`max-height: 100%` with the paper's aspect ratio)
  - replace `100vh` with `100dvh`
- **Done when:** At 1366×768, the whole preview, hemisphere switch and export actions are visible without scrolling the page.

### P1-3. Mobile and tablet layout — Open
- **Where:** `globals.css` `@media (max-width: 800px)` and `workshop.css` `@media (max-width: 760px)`.
- **Problem:** On narrow screens all settings sections stack above the preview, so after uploading the user has to scroll a long way to see a result.
- **Fix:**
  - Show the preview first, or add a sticky mini preview.
  - Collapse settings into an accordion (`components/ui/accordion.tsx` exists).
  - Add a sticky bottom bar with the export actions.
  - On iOS, lead with SVG download because browser printing there is unreliable (as the README says).
- **Done when:** At 375px wide, the user can upload and see the projected template without scrolling past all settings, and export is always reachable.

### P1-4. Paper frame around Map/Globe; hemisphere switch shown everywhere — Partial
- **Branch:** The Map and Globe tabs no longer sit inside the paper frame.
- **Remaining:** The North/South switch is still shown on the Map and Globe tabs, where it does nothing. Hide it, or disable it with a tooltip, outside the Template tab.

### P1-5. Choosing a hemisphere — Open
- **Problem:** The switch is at the bottom left, far from the sheet title, and there's no way to see both sheets at once.
- **Fix:**
  - Move it into the preview toolbar as a segmented control labeled "Sheet 1 · North" / "Sheet 2 · South".
  - On screens 1400px wide or more, offer a side-by-side view of both sheets.

### P1-6. Uploading a map — Partial
- **Fixed on the branch:**
  - Choosing the same file again now works (`event.target.value = ''`).
  - There are file-size and pixel limits with clear messages (`input.ts`).
  - The card shows a "Checking image…" state while loading.
- **Remaining:**
  - **Dropping files:** There is no visual change when dragging a file over the card. Dropping a file outside the card makes the browser open the image, and the session is lost. Block the default `dragover`/`drop` on the whole `window` and show a full-page drop overlay.
  - **Thumbnail and remove:** There is no thumbnail of the loaded map and no "Remove map" action. Add a small thumbnail with "Replace" and "Remove".
  - **Empty Map tab:** It shows plain text ("Choose a world map to begin."). Make it a button or drop zone that opens the file picker.
  - **After upload:** The app jumps straight to the Template tab (`chooseMap` in `useWorkshop.ts`). The README flow says to confirm the source first, so consider opening on the Map tab with a "Looks right → Continue" step. This is a product decision.

### P1-7. Choosing the source projection — Partial
- **Fixed on the branch:** The aspect-ratio warning is now recalculated when the projection changes.
- **Remaining:**
  - **Narrow warning:** The warning only covers equirectangular. Add expected-aspect checks for the other projections: Web Mercator about 1:1, Robinson about 1.97:1, Natural Earth about 1.92:1. The Robinson and Natural Earth checks should only apply to the detected map area, not the full image.
  - **Auto-suggest:** Suggest a projection from the image, for example "Detected: looks like Web Mercator (1:1). Switch?"
  - **Jargon:** Hints like "equal pixels per degree" don't help most users. Add small outline thumbnails of each projection, like the glue-tab picker on `main`, so users can match their map by eye.

### P1-8. Sample or empty template isn't labeled — Open
- **Problem:** With no map loaded, the Template tab shows the template outlines with no map and no label. On `main` it showed a styled sample. Either way, users may think it is their output or that something failed.
- **Fix:** Add a "Sample — choose a map to see yours" badge and an upload button over the preview when no map is loaded.

### P1-9. Assembly mark controls — Open
- **Where:** `markOptions` in `page.tsx`.
- **Problem:**
  - "Dashed cut outline" is a separate checkbox that only works when "Cut lines" is on.
  - Nothing explains what fold lines are for.
- **Fix:**
  - Replace the two cut-line checkboxes with one "Cut line: Solid / Dashed / None" segmented control.
  - Add a one-line explanation of fold lines.
  - Put the glue-tab shape picker (P0-9) next to the "Glue tabs" toggle, and hide it when tabs are off instead of greying it out.

### P1-10. Choosing the number of gores — Open
- **Problem:** The select ("4 gores", "6 gores"…) doesn't explain the trade-off.
- **Fix:** Use a segmented control or cards with small petal icons and a hint: "More gores = rounder globe, more cutting."

### P1-11. Notes and legend are truncated silently — Partial
- **Fixed on the branch:** The preview now truncates exactly like the export.
- **Remaining:** `wrapText()` in `export.ts` caps each box at 6 lines and ends with "…". The text boxes allow 240 and 180 characters with no counter, so long text, or a legend with many short lines, is cut off without warning.
- **Fix:**
  - Add a live counter.
  - Show a warning when `wrapText()` truncates, for example by exporting a `truncated` flag.
  - Optionally, turn the legend into a structured editor (color swatch + label rows).

### P1-12. Logo section — Partial
- **Fixed on the branch:**
  - Logos can be removed.
  - The disclosure button has `aria-controls`.
  - SVG logos are rejected.
  - Size limits are explained.
- **Remaining:**
  - The section has no number and is styled differently from sections 01–04. Make it "05 · Logo (optional)" with the same heading pattern.
  - "Near equator" puts the logo on both sheets (`visible` in `createTemplateSvg()` is true for both hemispheres), so it prints twice. Confirm whether that is intended and say so next to the option.
  - The "authorized marks" reminder appears twice (the success notice and the panel text). Keep one.

### P1-13. Guide dialog content — Partial
- **Fixed on the branch:** The guide now covers file limits, printing at actual size, the scale check, and cut versus fold.
- **Remaining:** Add assembly steps:
  - suggested paper weight,
  - cutting order,
  - which way the glue tabs fold,
  - how the North and South halves join at the equator.

  Consider adding an optional third "Assembly instructions" page to the print output.

### P1-14. Preview loses the map image during every re-render — New
- **Where:** `previewSvg` in `useWorkshop.ts` passes `raster: undefined` whenever `ready` is false.
- **Problem:** Changing the gore count, hemisphere or projection removes the map image until the worker finishes, leaving only the outlines. This flickers and goes against the README requirement to keep the last good preview visible during re-renders.
- **Fix:** Keep the last good raster on screen, dimmed and with a "Updating…" overlay, but don't pair it with new geometry for export. Export is already protected because `canExport` requires `ready`.
- **Done when:** Changing a setting never shows an empty template while a map is loaded.

### P1-15. Feedback banner can be off-screen — New
- **Where:** `.feedback-region` sits between the sticky top bar and the workspace.
- **Problem:** The banner is not sticky. On a short window, a print error or "SVG downloaded" message triggered from the bottom of the page appears above the visible area. Screen readers still announce it, but sighted users may miss it.
- **Fix:** Make the region sticky under the top bar, or show export and print results as a toast (`components/ui/toast.tsx`) near the action that triggered them.

---

## P1: Accessibility (target WCAG 2.2 AA)

### A-1. Text is too small — Open
- **Where:** `globals.css`. For example:
  - `.guide-dialog li p` is 10.5px,
  - `.upload-copy small` and `.projection-help` are 9.5px,
  - `.range-notes` and `.branding-row span` are 9px,
  - `.hemisphere-switch button` and `.preview-footer p` are 10px,
  - `.field-stack select` is 11px.

  The branch's `.render-status` is 11px.
- **Fix:**
  - Helper and meta text: at least 12px.
  - Labels: 13–14px.
  - Inputs, selects and text boxes on mobile: 16px, otherwise iOS Safari zooms the page when they are focused.

### A-2. Text contrast fails WCAG AA — Open
WCAG AA requires at least 4.5:1 for normal-size text.

| Color | Used for | Approx. ratio |
|---|---|---|
| `#92968f` | `.range-notes` | 3.0:1 |
| `#8a8f88` | `.branding-row` "Optional"/"Added" chip | 3.2:1 |
| `#8a8b82` | `.paper-header`, `.paper-footer` | 3.2:1 |
| `#7b817b` | `.section-heading p`, `.projection-help`, `.preview-footer p` | 4.0:1 |
| `#707972` | `.upload-copy small`, on the tinted card background | 3.9:1 |

Disabled controls at 46% or 65% opacity also fail. Use `--muted-foreground` (`#6d766f`, about 4.7:1) or darker for secondary text.

### A-3. Focus indicator is too faint — Partial
- **Fixed on the branch:** `workshop.css` adds a strong `:focus-visible` outline inside `.workshop-controls`.
- **Remaining:**
  - The global `* { outline-ring/50 }` (`globals.css`) still makes focus rings 50% transparent everywhere else: the hemisphere buttons, the top-bar buttons and the preview tabs.
  - Add one global rule, `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }`, and make sure `--ring` contrasts at least 3:1 with the background.

### A-4. Missing or wrong semantics — Partial
- **Fixed on the branch:**
  - Hemisphere buttons have `aria-pressed` inside a `fieldset`.
  - Diameter is a native range input with a label and description.
  - The preview `img` has descriptive alt text.
- **Remaining:**
  - The brand link is labeled "Paper Globe home" but points to `#workspace`. Add a real "Skip to workspace" link and remove the misleading label.
  - `.globe-placeholder` has an `aria-label` but no role. Add `role="img"`, or remove the label and rely on the visible text.
  - The hemisphere `fieldset` uses `aria-label`. Use a visually hidden `<legend>` instead.

### A-5. Status changes aren't announced — Fixed
- **Branch:** The feedback region and `.render-status` `<output>` are `aria-live="polite"`, and errors use `role="alert"`.

### A-6. Touch targets are too small — Open
- **Problem:** Hemisphere buttons are 30px tall (`globals.css`), checkboxes are 16px, and the logo disclosure row is about 16px tall.
- **Fix:** Aim for 44×44px, with 24×24px as the absolute minimum (WCAG 2.5.8).

---

## P2: Polish and consistency

### P2-1. Hardcoded colors; unused dark theme — Open
- **Problem:** `globals.css` and `workshop.css` contain about 40 hardcoded hex colors instead of theme tokens. The `.dark` theme is defined but never used.
- **Fix:**
  - Move colors into semantic tokens (for example `--text-subtle`, `--surface-tint`) so A-2 can be fixed in one place.
  - Either delete `.dark` or wire it to `prefers-color-scheme`. The paper preview should stay light either way.

### P2-2. Section headings inconsistent — Open
- **Problem:** Section 03 has no subtitle (`.section-heading.compact`) and the logo section has no number.
- **Fix:** Use the same heading pattern for every section.

### P2-3. "Live preview" indicator always on — Fixed
- **Branch:** Replaced by a status that reflects the real state.

### P2-4. Units are inches only — Open
- **Problem:** Diameter is in inches (`3.5"`, "Maximum for this paper: … in"), while paper sizes are now shown in mm.
- **Fix:** Add an in/cm toggle, or default to cm for A4, and use the same unit throughout.

### P2-5. Jargon in status text — Fixed
- **Branch:** Status now reads like "Sheet 1 of 2 ready." and "Projecting locally: 40%".

### P2-6. Render error has no recovery — Fixed
- **Branch:** Errors appear in the status line with "Retry projection" and "Cancel" actions.
- **Optional:** Also offer "Choose another image".

### P2-7. Overlay and map out of sync after hemisphere switch — Fixed
- **Branch:** Geometry is never paired with a raster that doesn't match. See P1-14 for the trade-off this introduced.

### P2-8. Site description is outdated — Open
- **Where:** `site/app/layout.tsx`.
- **Problem:** The `description` says "Turn any 2:1 equirectangular world map…", but four source projections are supported.
- **Fix:** Update it to mention the supported projections, or make it projection-neutral.

### P2-9. Settings are lost on refresh — Open
- **Problem:** Gore count, paper, marks and similar settings are lost when the page reloads.
- **Fix:** Consider saving non-content preferences to `localStorage`. **Confirm with the project owner first**: the README's privacy contract rules out storing maps or generated templates, and it is unclear whether settings are allowed.

### P2-10. Export resolution too low — Fixed
- **Branch:** Exports render at `EXPORT_DPI = 200`, sized to the physical diameter.

---

## Suggested order of work

1. **Unblock the merge (P0-9):** Merge `main` into `fix/review-issues-1-12`, then restore the glue-tab picker and map-based file names.
2. **Quick fixes:** A-3 (global focus ring), A-2 (contrast tokens), P2-8, P1-4 (hide the hemisphere switch outside Template), P1-8 (sample badge).
3. **Preview behavior:** P1-14 (keep the last good preview), P1-15 (feedback placement).
4. **Layout:** P1-2 (fit the viewport), P1-1 (export area), P1-5 (hemisphere control), then P1-3 (mobile).
5. **Helping users with input:** P1-6, P1-7, P1-9, P1-10, P1-11, P1-12.
6. **Remaining accessibility and polish:** A-1, A-4, A-6, P2-1, P2-2, P2-4, P1-13, P0-7, P2-9.
