# Phase 1 UI Contract: QR Share & Scan

This is a frontend SPA; the "contracts" are the component prop contract and the observable DOM/behavior guarantees that tests assert. No network or on-chain interface is added.

## 1. `WagerQRCode` component contract

**Import**: `components/ui/WagerQRCode.jsx`

**Props**: see `data-model.md` (`value` required; `size`, `ariaLabel`, `className` optional).

**Guarantees** (assertable in Vitest + Testing Library):

- G1. Given a non-empty `value`, renders an `<svg>` QR reachable by its accessible name (`getByLabelText(ariaLabel)`).
- G2. The encoded payload equals `value` (qrcode.react renders deterministically for a given value; assert the component is invoked with `value` and that the same string appears in the surface's copy field — see G7).
- G3. Renders with `bgColor="#FFFFFF"` and a dark `fgColor` (assert via rendered SVG attributes / props), i.e. dark-on-white.
- G4. Renders **without** any embedded center image: no `imageSettings` is passed and the output contains **no `<image>` element** (`container.querySelector('image')` is null). This is the FR-002/FR-004 guarantee.
- G5. Given an empty/missing `value`, the component does not render a broken or partial QR (the surface decides the fallback message — FR-008).

## 2. Per-surface contract (all three QR Surfaces)

- G6. Opening the surface renders exactly one `WagerQRCode` with the surface's link.
- G7. The encoded link equals the value shown in that surface's copy-link / acceptance-link input (FR-005).
- G8. No broken-image placeholder element is present (`querySelector('image')` null; no `<img>` in error state in the QR area).

## 3. QR-Scan Affordance contract (`FriendMarketsModal`)

- S1. The scan button renders an inline `<svg>` icon with explicit non-zero width/height (assert the element has width/height attributes or a CSS size class; the icon is not collapsed by the global `svg { height: auto }` rule).
- S2. The button exposes accessible name `"Scan QR code"` (`getByRole('button', { name: /scan qr code/i })`).
- S3. Activating the button sets the scanner open (renders `QRScanner` / calls `openQrScanner('opponent')`).
- S4. A successful scan of a valid `0x`-prefixed 40-hex address updates `opponent` and `opponentResolved` (FR-013). A scan that is not a valid address does not populate the field.

## 4. Accessibility contract

- A1. QR images carry an accessible name (G1); decorative wrappers are not focus traps.
- A2. The scan icon meets WCAG 1.4.11 non-text contrast (≥3:1) against its button background in both `theme-light` and `theme-dark`.
- A3. The axe/Lighthouse CI gate passes for the create-wager form and each share surface (constitution V).

## 5. Out of contract (unchanged)

- `QRScanner` camera lifecycle (`html5-qrcode` start/stop) — behavior unchanged; existing `QRScanner.test.jsx` continues to pass.
- Copy-link / native-share fallbacks — unchanged except where a surface adopts `WagerQRCode`.
