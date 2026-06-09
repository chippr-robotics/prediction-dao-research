# Quickstart: Validate the QR Share & Scan Fix

How to prove the fix works end-to-end. References: [spec.md](./spec.md), [research.md](./research.md), [contracts/qr-ui-contract.md](./contracts/qr-ui-contract.md).

## Prerequisites

- Node + repo deps installed (`npm install` at repo root and in `frontend/` per project setup).
- A wallet/browser able to reach the create-wager flow (or use the dev server).

## Automated checks (CI-equivalent)

Run from repo root:

```bash
# Frontend unit/integration tests (Vitest)
npm run test:frontend

# Lint must stay clean (errors block the build per constitution IV/V)
cd frontend && npm run lint
```

**Expected**: new/updated tests pass —
- `WagerQRCode.test.jsx`: QR renders by accessible name; encodes the given URL; dark-on-white; **no `<image>` element** (G4); renders with no logo prop.
- `ShareModal.test.jsx`, `ShareWagerModal.test.jsx`, `FriendMarketsModal.test.jsx`: each surface renders one QR whose payload matches the displayed copy link (G7); no broken-image element (G8).
- `FriendMarketsModal.test.jsx` (scan button): icon present with non-zero size (S1), accessible name "Scan QR code" (S2), opens scanner on click (S3), valid scanned address fills the Opponent field (S4).

## Manual validation (real rendering + scannability)

```bash
npm run frontend   # start the Vite dev server
```

1. **Create-wager scan button** — go to `/app`, open Create Wager, choose a 1v1/bookmaker type. **Expect**: the QR-scan button next to **Opponent Address** shows a visible QR icon (not a blank box) in the default light theme. Toggle to dark theme and confirm it stays visible (FR-012, SC-007).
2. **Create-wager success QR** — complete a wager creation. **Expect**: a crisp dark-on-white QR (no warning triangle); the "Acceptance link" field shows the same URL the QR encodes (FR-005).
3. **Share Wager / Market Share modals** — open each share surface. **Expect**: dark-on-white scannable QR, no broken-image triangle, link matches the copy field.
4. **Real scan** — scan each QR with a phone camera. **Expect**: it opens the exact link shown in the copy field (SC-002, SC-003). Try in both light and dark theme and, if possible, a mobile in-app webview (the reported failure environment).
5. **Logo-failure resilience** — (optional) in devtools, block `/assets/*logo*.svg`. **Expect**: QR still renders fully and scans (FR-004, SC-004) because no logo is embedded.

## Pass criteria

- Zero broken-image placeholders on any QR surface (SC-001).
- Every QR scans to the correct link on first try in normal lighting (SC-002, SC-003).
- Scan-button icon visible in light and dark themes (SC-007).
- `npm run test:frontend` and `npm run lint` green; axe/Lighthouse CI gate passes.
