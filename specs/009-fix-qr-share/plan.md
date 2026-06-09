# Implementation Plan: Fix QR Share & Scan Rendering

**Branch**: `009-fix-qr-share` (working on git branch `fix/membership-purchase-chain-aware`; a dedicated `fix/qr-share-rendering` branch is recommended before implementing) | **Date**: 2026-06-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-fix-qr-share/spec.md`

## Summary

Two related defects make the QR features look broken to users:

1. **QR display renders as a broken-image triangle / not scannable.** All three QR-display surfaces pass a **~237 KB SVG** (`/assets/logo_fairwins.svg`, `/assets/fairwins_no-text_logo.svg`) to `qrcode.react`'s `QRCodeSVG` via `imageSettings.src`. `QRCodeSVG` embeds that as an SVG `<image href>`; the heavy SVG-wrapping-raster asset fails to load/paint inside the QR in mobile webviews, producing the broken-image placeholder. Compounding it, the QR uses `fgColor="#36B37E"` (brand green) on `bgColor="transparent"` over theme-dependent dark/glassy modal backgrounds — green-on-dark is low-contrast and not reliably scannable.

2. **QR-scan button icon is never visible.** The `.fm-scan-btn` next to the Opponent Address field renders an inline `<svg width="20" height="20">` with `fill="currentColor"`. A global `svg { height: auto }` rule in `App.css` collapses the inline icon, and its color/background come from theme tokens (`--text-secondary` / `--bg-primary`) that were authored against dark mode (note the dark hex fallbacks `#AAB6C2` / `#0E141B`) — on the live **light** page they resolve to low/near-invisible contrast. The button renders as a blank box.

**Technical approach**: A frontend-only fix. (A) Introduce one shared `WagerQRCode` presentational component that renders a high-contrast, theme-independent QR (dark modules on a solid white quiet-zone background) and **drops the heavy embedded center logo** (decorative per FR-004), so the broken-image dependency is removed and all three surfaces render identically. (B) Fix the scan button: pin the icon's CSS dimensions so the global `svg { height: auto }` can't collapse it, and give it an explicit AA-contrast icon color that holds in both themes. Cover every surface with Vitest tests and keep within the existing client-side/no-backend footprint.

## Technical Context

**Language/Version**: JavaScript (ES2022) + JSX; React 18 function components

**Primary Dependencies**: React 18, Vite, `qrcode.react@^4.2.0` (exports `QRCodeSVG`, `QRCodeCanvas`), `html5-qrcode` (camera scanner). No new dependency introduced.

**Storage**: N/A (no persistence; share links derive from on-chain wager/market data at render time)

**Testing**: Vitest + @testing-library/react (jsdom). Existing suites: `frontend/src/test/ShareModal.test.jsx`, `QRScanner.test.jsx`, `FriendMarketsModal.test.jsx`, `Dashboard.test.jsx`.

**Target Platform**: Modern desktop + mobile browsers and in-app webviews (Android/Brave/Samsung Internet observed in the bug reports). Must not assume a particular OS theme.

**Project Type**: Web application — frontend SPA only (no backend, no contract changes).

**Performance Goals**: QR renders synchronously on modal open with no external image fetch (removing the 237 KB asset eliminates a render-blocking/broken dependency). No perceptible delay (<100 ms) to first paint of the QR.

**Constraints**: Client-side only (no backend may be added — existing no-backend footprint). WCAG 2.1 AA. ESLint must stay clean (errors block build). QR must be scannable: dark-on-light modules with adequate quiet zone, theme-independent.

**Scale/Scope**: 3 QR-display call sites + 1 QR-scan button. Net change: 1 new shared component, edits to 3 modals + 1 button/CSS, ~4–6 test files. No data model, no API surface.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| **I. Security-First Smart Contracts (NON-NEGOTIABLE)** | No `contracts/` changes; purely a frontend rendering fix. No funds/access-control/oracle surface touched. | N/A |
| **II. Test-First & Comprehensive Coverage (NON-NEGOTIABLE)** | Vitest tests are authored alongside each change: per-surface QR-render tests (correct URL encoded, white bg / dark fg, no broken-image dependency, logo-failure tolerance) and scan-button tests (visible non-zero icon, accessible name, opens scanner). | Pass (commit to test-first) |
| **III. Honest State, No Mocks in Shipped Paths** | A broken/blank QR is dishonest UX; the fix restores a truthful, working control. No mock/placeholder enters the shipped path; the encoded link always equals the displayed link (FR-005). | Pass |
| **IV. Fail Loudly in CI** | New tests + lint + axe run as hard gates; no `continue-on-error` added. | Pass |
| **V. Accessible, Consistent Frontend** | QR gets dark-on-white non-text contrast (WCAG 1.4.11) and keeps its accessible name; scan icon gets AA contrast in both themes; a shared component enforces consistency across surfaces (FR-010). axe/Lighthouse gates apply. | Pass |
| **Additional — no new core tech / no backend** | Reuses `qrcode.react` + `html5-qrcode`; QR stays client-side; no server dependency added. | Pass |

**Result**: PASS. No violations → no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/009-fix-qr-share/
├── spec.md              # Feature spec (/speckit-specify)
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 — root-cause analysis + decisions
├── data-model.md        # Phase 1 — UI entities (Share Link, QR Surface, QR-Scan Affordance)
├── quickstart.md        # Phase 1 — how to validate the fix (manual + Vitest)
├── contracts/
│   └── qr-ui-contract.md # Phase 1 — WagerQRCode props + scan-button behavior contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── WagerQRCode.jsx        # NEW — shared QR renderer (high-contrast, logo-optional)
│   │   │   ├── WagerQRCode.css        # NEW — white quiet-zone container
│   │   │   ├── ShareModal.jsx         # EDIT — use WagerQRCode
│   │   │   ├── ShareModal.css         # EDIT — ensure white QR frame
│   │   │   ├── QRScanner.jsx          # (unchanged behavior; verified by tests)
│   │   │   └── QRScanner.css
│   │   └── fairwins/
│   │       ├── FriendMarketsModal.jsx # EDIT — use WagerQRCode in success step; fix .fm-scan-btn icon
│   │       ├── FriendMarketsModal.css # EDIT — pin scan-icon size + AA-contrast color
│   │       ├── ShareWagerModal.jsx    # EDIT — use WagerQRCode; white QR container
│   │       └── ShareWagerModal.css    # EDIT
│   ├── App.css                        # REVIEW — global `svg { height: auto }` (scope/override)
│   └── theme.css                      # REVIEW — light/dark tokens (no edit expected)
└── src/test/
    ├── WagerQRCode.test.jsx           # NEW
    ├── ShareWagerModal.test.jsx       # NEW/EXTEND
    ├── ShareModal.test.jsx            # EXTEND
    └── FriendMarketsModal.test.jsx    # EXTEND — success-step QR + scan-button icon
```

**Structure Decision**: Web-application frontend only. All work lives under `frontend/src/`. A single shared presentational component (`components/ui/WagerQRCode.jsx`) centralizes QR rendering so the three display surfaces are provably consistent (FR-010); the scan-button fix is local to `FriendMarketsModal` + its CSS plus a review of the global `svg` rule in `App.css`. No backend, contracts, or subgraph involvement.

## Complexity Tracking

> No constitution violations. No entries required.
