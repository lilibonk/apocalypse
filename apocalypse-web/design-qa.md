# PixelWave 登录页图 3 忠实度 QA

## Evidence

- Source visual truth: `D:/IDE/KimiProject/apocalypse/apocalypse-web/.design-audit/00-reference-letterpress.png`
- Initial implementation: `D:/IDE/KimiProject/apocalypse/apocalypse-web/.design-audit/01-current-login.png`
- Final implementation: `D:/IDE/KimiProject/apocalypse/apocalypse-web/.design-audit/03-continuous-pass2.png`
- Full-view comparison: `D:/IDE/KimiProject/apocalypse/apocalypse-web/.design-audit/compare-pass2.png`
- Mobile verification: `D:/IDE/KimiProject/apocalypse/apocalypse-web/.design-audit/04-mobile.png`
- Source pixels: 1025 × 851
- Implementation pixels: 1025 × 851
- CSS viewport: 1025 × 851
- Implementation devicePixelRatio: 1
- Source density: unknown; normalized by comparing the supplied 1025 × 851 raster against an equal-pixel implementation capture.
- State: dark theme, first active letterpress wave, approximately 1.8s after wave emission.

## Full-view comparison

The final comparison places the supplied research screenshot and the browser-rendered login page in one 2050 × 851 image. The login implementation now shows the same defining structure: a complete fixed-pitch grid, a continuous radial wave boundary, broad exponential height tail, tall extruded columns, and spatially coherent edge color. The login form remains isolated on a solid surface by product requirement.

Focused-region comparison was not required: at 1025 × 851 and DPR 1, the 28px faces, 4px gaps, side walls, and 1–2px edge cores are all legible in the full-view comparison. Mobile was checked separately at 390 × 844.

## Required fidelity surfaces

- Fonts and typography: the reference contains only the research HUD, not the login typography. Existing login font family, weights, wrapping, and copy were intentionally preserved; no effect line crosses the protected title/description block.
- Spacing and layout rhythm: login letterpress uses a fixed 32px pitch (28px face + 4px gap), matching the research demo's large mechanical type scale. The wave fills the brand stage while the form column stays clean.
- Colors and tokens: top faces remain exactly `--background`; side depth uses `--border` plus low-alpha `--foreground`; edge hue forms a continuous 180° spatial band with per-wave jitter. This intentionally adapts the reference material to both project themes without color literals.
- Image quality and asset fidelity: the target is procedural Canvas motion, so no raster replacement was introduced. Integer geometry and DPR-aware canvas sizing keep edges crisp.
- Copy and content: login copy, labels, actions, language switch, and authentication behavior are unchanged.

## Comparison history

### Iteration 0 — blocked

- P1: `PARTICIPATION = 0.35` produced isolated empty frames instead of a continuous wave.
- P1: square-ring timing, diagonal corridor, and a 0.5s hard window could not produce the research demo's broad height field.
- P2: the 48-column fill division made the login blocks materially smaller than the reference.

Fixes: added a login-only Euclidean wave field with 100% wave-packet participation, random non-repeating corners, 0.09s attack, 0.38s exponential tail, 7s interval, and fixed 32px pitch.

### Iteration 1 — blocked

- P2: per-cell random hue read as confetti instead of a continuous flow along the arc.
- P2: opaque `--muted-foreground` side walls created bright bars in dark mode.

Fixes: changed hue to a spatially continuous 180° arc band moving at 120°/s with only ±38° per-wave jitter; changed the far side wall to low-alpha `--foreground`; raised overall stage visibility from 70% to 90%.

### Iteration 2 — passed

- Continuous wave boundary, full grid participation, height variation, side-wall depth, and edge flow are all visibly present.
- Intentional deviations are acceptable: the reference fills a standalone canvas, while the product implementation is clipped to the brand stage and protects readable UI content; top faces remain theme-background colored per the user's earlier explicit requirement.
- Mobile 390 × 844 keeps the dense wave within the brand header and does not overlap form controls.
- Browser console: no warnings or errors.

## Interaction checks

- Login inputs and submit button remain visible and enabled.
- Canvas remains `pointer-events-none`.
- Desktop 1025 × 851 and mobile 390 × 844 responsive states rendered correctly.
- Form submission was not performed because this QA concerns the visual effect and no credentials were transmitted.

final result: passed

## v2.11 Performance follow-up — passed

- Reference loop: `letterpress-ripples/index.html` advances `t` and calls `render()` on every
  `requestAnimationFrame`.
- Root cause in v2.10: login letterpress passed its timeline through `stepTime`, so visible height
  and hue updates occurred only at ~10fps despite the surrounding rAF loop.
- Fix: only `flowlight` remains quantized; `letterpress` now paints from continuous rAF time.
- Hot-path reductions: precomputed `arrival` and `huePhase`, active-window early exit before
  `Math.exp`, reused typed-array buffers, opaque desynchronized Canvas, DPR cap 2.
- Browser frame samples: `.design-audit/perf-frame-a.png`, `perf-frame-b.png`, and
  `perf-frame-c.png` were captured 35ms apart in the active wave region; every adjacent sample
  changed, confirming the old 100ms visual hold is gone.
- Runtime surface checked at 1096×1318 CSS/canvas pixels, DPR 1; browser console contained no
  warning or error.
- Pure field benchmark: 2400 cells × 600 continuous frames completed in 24.83ms total
  (0.0414ms average compute time per frame versus a 16.67ms 60Hz frame budget).

---

# Pixel Axolotl 登录页品牌替换 QA

## Evidence

- Source visual truth: `D:/IDE/KimiProject/apocalypse/apocalypse-web/public/brand/packet-axolotl-master.png`
- Desktop dark implementation: `D:/IDE/KimiProject/apocalypse/apocalypse-web/.product-design-qa/login-dark-implementation-v2.png`
- Desktop light implementation: `D:/IDE/KimiProject/apocalypse/apocalypse-web/.product-design-qa/login-light-implementation.png`
- Desktop gaze-right state: `D:/IDE/KimiProject/apocalypse/apocalypse-web/.product-design-qa/login-dark-gaze-right.png`
- Desktop sleeping state: `D:/IDE/KimiProject/apocalypse/apocalypse-web/.product-design-qa/login-dark-sleeping.png`
- Mobile implementation: `D:/IDE/KimiProject/apocalypse/apocalypse-web/.product-design-qa/login-mobile-dark.png`
- Focused source/implementation comparison: `D:/IDE/KimiProject/apocalypse/apocalypse-web/.product-design-qa/mascot-reference-vs-implementation.png`
- Source pixels: 1254 × 1254.
- Desktop implementation pixels / CSS viewport: 1280 × 720, DPR 1.
- Mobile implementation pixels / CSS viewport: 390 × 844, DPR 1.
- State: idle centered gaze, pointer gaze-right, password-focus sleeping, light/dark theme, desktop/mobile.

## Full-view comparison

The login page keeps its established split layout and PixelWave atmosphere while replacing the
old signal-window sphere with the approved mint pixel axolotl. The mascot remains a single focal
object on desktop and a compact brand header on mobile. The header `A/` block and the redundant
square frame around the main mascot were removed; the approved mascot now supplies the static
brand mark and favicon.

## Focused comparison

`mascot-reference-vs-implementation.png` places the 256px normalized approved master next to the
browser-rendered 256px mascot. Body silhouette, six gills, cream portal, paws, ledge, tail, palette,
crop, and pixel density match. The only intentional difference is the pupil layer: the runtime
pupils are separately rendered so both eyes can track the pointer without changing the body.

## Required fidelity surfaces

- Fonts and typography: existing Chinese/English font stacks, weights, line heights, wrapping, and
  page hierarchy were preserved. Replacing `A/` with the mascot mark did not change wordmark spacing.
- Spacing and layout rhythm: desktop remains a 3:2 split with one 256px focal mascot; mobile keeps a
  128px mascot above the form without horizontal overflow. Removing the old square frame gives the
  circular badge the same clean silhouette as the source.
- Colors and visual tokens: the default brand pair is now v3 + `mint`. The approved mint/coral/cream/
  dark-teal raster remains stable in both themes; the letterpress surface still renders white-on-white
  in light mode and black-on-black in dark mode with colored edge flow.
- Image quality and asset fidelity: project assets are 1254px PNG masters with true transparent
  exterior pixels. Runtime uses 2× Canvas frames and a finer 1 CSS-pixel pupil grid; no checkerboard,
  transparency halo, clipping, sprite-sheet crop, or body-frame morph is visible.
- Copy and content: login title, description, field labels, validation path, CTA, language switch, and
  authentication behavior are unchanged.

## Comparison history

### Iteration 0 — blocked

- P1: the generated checkerboard transparency preview was baked into the PNG and rendered visibly
  around the mascot in dark mode.
- P2: the first dynamic pupil pass used a 2 CSS-pixel cell and purple-blue outline, visibly coarser
  and less faithful than the approved dark-teal pupil.

Fixes: extracted the connected neutral checkerboard region to real alpha without removing internal
highlights; changed pupil cells to approximately 1 CSS pixel; aligned pupil colors to the source's
deep teal; enlarged the square catchlight.

### Iteration 1 — passed

- Source and implementation silhouettes match at 256px.
- Pointer movement changes only the pupil layer; both eyes move in the same direction and remain
  inside the cream sclera.
- Password focus switches to the dedicated closed-eye image without duplicate eyes or leftover pupil.
- Light and dark desktop captures show no transparent-background artifact or form overlap.
- Mobile 390 × 844 is centered, readable, and free of horizontal overflow.
- PixelWave remains continuous and large-scale; browser console contains no warning or error.

## Interaction checks

- Pointer gaze-right: passed.
- Password-focus sleeping / closed eyes: passed.
- Random blink uses the same closed-eye asset and three-frame timing: passed by implementation and
  existing `blinkLid` contract test.
- Login inputs and button remain visible and enabled; no credential was submitted during QA.
- Browser console: no warnings or errors.
- Automated checks: 172 tests passed; production build passed; lint completed with eight pre-existing
  warnings and zero errors.

final result: passed
