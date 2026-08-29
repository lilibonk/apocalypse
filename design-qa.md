# Design QA — CRUD 电路传导揭幕

- Source visual truth: user-provided 800 × 533 circuit-board style reference.
- Implementation screenshot: `pixel-circuit-fixed-dark.png` (local QA artifact, not versioned).
- Combined comparison: `circuit-fixed-reference-comparison.png` (local QA artifact, not versioned).
- Viewport: 1280 × 720 CSS px, implementation capture 1280 × 720 px, device scale 1.
- Source: 800 × 533 px. It is a style reference rather than the same application viewport, so no density normalization was used for layout judgments.
- Focused implementation region: dialog crop at 448 × 596 px, compared at equal 596 px height with the resized reference.
- State: dark theme, 新增菜单 dialog, circuit reveal approximately 240ms after open.

## Full-view comparison evidence

The dialog keeps the existing product layout and blank dark surface while the transient circuit layer stays clipped to the dialog. The animation does not shift, resize, or obscure surrounding management UI after its 0.84s lifetime.

## Focused comparison evidence

The combined comparison confirms the reference's defining geometry is present: one asymmetric conductive network, varied turns, branch junctions, brighter traveling heads, dim energized tails, and small terminals. The implementation intentionally omits the photographic board texture, orange secondary palette, depth of field, and dense component field because the requested CRUD treatment remains a clean light/dark blank surface using the product's mint brand token.

## Required fidelity surfaces

- Fonts and typography: existing dialog typography is unchanged; circuit rendering contains no text and does not affect antialiasing or hierarchy.
- Spacing and layout rhythm: dialog dimensions, padding, radius, fields, and action alignment remain unchanged; the effect is an absolute clipped overlay.
- Colors and tokens: traces use inherited `--brand` (and `--destructive` for destructive confirmations) on the existing `--background`; no gray material, gradient, or new hard-coded palette was introduced.
- Image quality and asset fidelity: the source is used as motion/style reference, not embedded product imagery. The dynamic Canvas implementation is sharp at the tested density and is appropriate for a live transmitting path rather than a static raster asset.
- Copy and content: all CRUD labels and values remain unchanged and become readable during the latter half of the reveal.

## Comparison history

1. Earlier implementation used regularly spaced pixel nodes and grid-like orthogonal links. Finding: P1 topology still read as a pixel grid rather than PCB routing.
2. Intermediate fix used several generated parallel traces. Finding: P1 repeated spacing and direction still looked algorithmically regular.
3. Final fix: replaced generation with one fixed main route and five deliberately asymmetric branches. A single pulse enters through the main route; each branch starts only when the pulse reaches its junction. Every opening now has identical topology and timing.
4. Post-fix evidence: `circuit-fixed-reference-comparison.png` shows the reference and fixed implementation together. No actionable P0/P1/P2 mismatch remains for the requested style translation.

## Findings

No actionable P0/P1/P2 findings.

## Primary interactions tested

- Open and close 新增菜单.
- Light and dark theme reveal.
- Content remains usable after the transient Canvas unmounts.
- Browser console checked: no warnings or errors from the effect.

## Follow-up polish

None required for this iteration.

final result: passed
