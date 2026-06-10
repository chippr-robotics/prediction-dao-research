# Implementation Plan: Wallet Address QR Display & Sharing

**Branch**: `011-wallet-address-qr` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-wallet-address-qr/spec.md`

## Summary

Add a "Show QR" affordance to the Account tab of the existing Account Center
(`/wallet`, `WalletPage.jsx`) that opens a FairWins-branded modal rendering the
connected wallet address as a QR code, with copy-to-clipboard, native share
(with copy fallback), and a curated, persisted color choice. The QR is rendered
with the already-installed `qrcode.react` via a new thin `AddressQRCode`
component; branding is expressed through the surrounding frame (white quiet-zone
card, brand corner accents, FairWins wordmark) — **no embedded logo and no new
QR library**, preserving the spec 009 lessons and contracts. The color
preference persists per device in `localStorage` following the existing
`viewPreference.js` pattern (no backend, per project constraint).

## Technical Context

**Language/Version**: JavaScript (ES2022), React 19.2.0, Vite

**Primary Dependencies**: `qrcode.react@4.2.0` (already installed — QR SVG
rendering), `wagmi@3.1.0` + `WalletContext` (address/connection state),
`react-router-dom@7.11.0`. **No new runtime dependencies.** Browser APIs:
`navigator.clipboard`, `navigator.share` (both already used in `ShareModal.jsx`).

**Storage**: `localStorage`, key `fairwins_qrcolor_v1` (plain string palette id,
per-device global; follows `marketViewPreference` / `viewPreference.js` pattern).
No backend — hard project constraint.

**Testing**: Vitest 4.0.18 + @testing-library/react 16.1.0 + vitest-axe, tests
in `frontend/src/test/` (flat, co-located convention). Clipboard/share mocked
via `Object.defineProperty(navigator, ...)`; `qrcode.react` mockable per
existing `FriendMarketsModal.test.jsx` pattern. Manual device scan matrix in
`quickstart.md` covers real decode verification (SC-002).

**Target Platform**: Browser SPA (desktop + mobile web, including in-app
webviews) served by nginx on Cloud Run at fairwins.app

**Project Type**: Web frontend only — no contract, subgraph, or deploy-script
changes

**Performance Goals**: QR modal interactive < 100 ms after tap (SVG render is
synchronous); no new network requests; zero bundle growth from new dependencies
(reuses installed libs); Lighthouse performance gate (≥ 0.7) unaffected

**Constraints**: WCAG 2.1 AA (axe + Lighthouse ≥ 0.9 accessibility gates in
CI); every offered QR color ≥ 4.5:1 contrast on white (palette enforces ≥ 7:1);
spec 009 QR contract (`specs/009-fix-qr-share/contracts/qr-ui-contract.md`)
must not regress — `WagerQRCode` and its tests stay untouched; no embedded
center image in any QR (G4); camera Permissions-Policy untouched (display-only
feature)

**Scale/Scope**: 1 modified page (WalletPage Account tab), 2 new UI components
(AddressQRCode, AddressQRModal), 1 new utility (qrColorPreference), 1 new hook
(useClipboard), ~5 new test files; 4-color curated palette

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| I. Security-First Smart Contracts | No changes under `contracts/`. Feature is read-only display of the connected address; no funds, access-control, or oracle paths touched. No Slither/Medusa/security-agent run required. | PASS (N/A) |
| II. Test-First & Comprehensive Coverage | Vitest unit tests planned for every new artifact (AddressQRCode, AddressQRModal, qrColorPreference, useClipboard, WalletPage integration) including failure paths (clipboard denied, share unavailable, disconnected). No contract interface changes. | PASS |
| III. Honest State, No Mocks in Shipped Paths | Address comes live from `useWallet()` (WalletContext → wagmi); QR never renders for a missing address (connect prompt instead); no placeholder data. Preference is per-device display state only and is not chain- or finality-relevant. | PASS |
| IV. Fail Loudly in CI | No CI workflow changes; new tests join the existing fail-loud pipeline. No `continue-on-error` introduced. | PASS |
| V. Accessible, Consistent Frontend | Modal follows existing dialog pattern (role=dialog, aria-modal, Escape, focus trap); color picker is a keyboard-operable radiogroup with visible text names (never color-only differentiation); axe test added; no contract addresses consumed. | PASS |
| Tech stack constraint | No new core technology — reuses installed `qrcode.react`, plain CSS with existing theme tokens. | PASS |
| No-backend constraint | Color preference in `localStorage` only. | PASS |

**Post-Phase-1 re-check (2026-06-09)**: Design artifacts introduce no new
violations — no new dependencies, no contract surface, storage stays local,
a11y contracts (A1–A5) encoded in `contracts/address-qr-ui-contract.md`. PASS.

**Violations requiring justification**: none — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/011-wallet-address-qr/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── address-qr-ui-contract.md   # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit-specify output)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   └── ui/
│   │       ├── AddressQRCode.jsx        # NEW — thin QR renderer (qrcode.react), palette fg on fixed white bg
│   │       ├── AddressQRModal.jsx       # NEW — branded modal: QR, address, copy/share, color radiogroup
│   │       ├── AddressQRModal.css       # NEW — modal styling (ShareModal.css patterns, theme tokens)
│   │       ├── WagerQRCode.jsx          # UNTOUCHED — spec 009 contract stays locked
│   │       └── ShareModal.jsx           # UNTOUCHED — reference for share/copy patterns
│   ├── hooks/
│   │   └── useClipboard.js              # NEW — shared copy hook: { copied, error, copy }
│   ├── utils/
│   │   └── qrColorPreference.js         # NEW — QR_COLOR_PALETTE + get/set (localStorage 'fairwins_qrcolor_v1')
│   └── pages/
│       ├── WalletPage.jsx               # MODIFIED — "Show QR" button + modal mount in Account tab
│       └── WalletPage.css               # MODIFIED (minor) — button placement styling
└── src/test/
    ├── AddressQRCode.test.jsx           # NEW — render, palette contrast ≥4.5:1, no <image>, null on empty
    ├── AddressQRModal.test.jsx          # NEW — a11y (axe), copy/share success+failure, radiogroup, Escape
    ├── qrColorPreference.test.js        # NEW — round-trip, default, invalid-value fallback
    ├── useClipboard.test.jsx            # NEW — success, denial error, missing-API fallback state
    └── WalletPage.test.jsx              # NEW or EXTENDED — Account tab entry point, connect gating
```

**Structure Decision**: Frontend-only change inside the existing
`frontend/src/` layout. New UI lives in `components/ui/` beside the other QR
components; persistence helper follows the `utils/viewPreference.js` precedent;
tests go in the flat `frontend/src/test/` directory per repo convention. No
changes to `contracts/`, `subgraph/`, `scripts/`, or CI workflows.

## Complexity Tracking

> No constitution violations — table intentionally empty.
