# Quickstart: Validating Wallet Address QR Display & Sharing

**Feature**: `011-wallet-address-qr` | **Date**: 2026-06-09

How to prove the feature works end-to-end. Contracts referenced below live in
[contracts/address-qr-ui-contract.md](./contracts/address-qr-ui-contract.md);
entities in [data-model.md](./data-model.md).

## Prerequisites

- Node 20+, repo dependencies installed (`npm ci` at repo root installs the
  workspace; frontend deps live in `frontend/`).
- A browser wallet (MetaMask or WalletConnect-capable mobile wallet) on
  Polygon mainnet (137) or Amoy (80002).
- For the device scan matrix: one iOS device and one Android device with
  default camera apps, plus a second device to display the QR.

## Automated validation (CI-equivalent)

```bash
# Full frontend suite — includes all new tests
npm run test:frontend

# Focused runs while iterating
cd frontend
npx vitest run src/test/qrColorPreference.test.js
npx vitest run src/test/useClipboard.test.jsx
npx vitest run src/test/AddressQRCode.test.jsx
npx vitest run src/test/AddressQRModal.test.jsx
npx vitest run src/test/accessibility.test.jsx   # axe job parity (pre-existing suite)
```

**Expected**: all green, including
- palette contrast assertions (contract C7 — every palette entry ≥ 4.5:1 on
  white, fg darker than bg),
- no-embedded-image assertions (C4),
- copy failure-path tests (M5/H2),
- share fallback tests (M7),
- axe `toHaveNoViolations` on the open modal (A2),
- `WagerQRCode.test.jsx` still green and untouched (W3).

## Manual validation — user stories

```bash
npm run frontend   # Vite dev server, open the printed localhost URL
```

### US1 — Display my address as a QR (P1)

1. Connect a wallet → header → **My Account** (routes to `/wallet`).
2. On the **Account** tab, click **Show QR** (1 interaction → SC-001).
3. Expect a branded modal with the QR code and full address text (after US2
   is implemented the modal also shows Copy/Share buttons; after US3, the
   four named color swatches — validating US1 alone needs only QR +
   address).
4. Scan the QR with another device's stock camera → decoded text must equal
   the connected address exactly, including capitalization (EIP-55).
5. Switch accounts in the wallet extension while the modal is open → QR and
   address text update to the new address (M10/FR-009).
6. Disconnect → Account Center shows the connect prompt; no QR entry point
   (W2/FR-008).

### US2 — Copy or share (P2)

1. In the modal, click **Copy** → button shows "Copied!" (~2 s); paste
   somewhere → exact address.
2. Copy-failure path: in DevTools console run
   `Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })`,
   click **Copy** → visible inline error appears; address text is still
   selectable (M5). Reload to restore.
3. On a share-capable device (mobile browser), click **Share** → native share
   sheet opens pre-filled with
   `My FairWins wallet address:` + the address on its own line (M6). Cancel →
   no error UI.
4. On desktop (no `navigator.share`), click **Share** → behaves as copy with
   confirmation (M7).

### US3 — Customize the color (P3)

1. In the modal, pick **Forest** → QR foreground changes immediately (M8).
2. Tab to the swatch group and change selection with arrow keys → works
   without a pointer (M9).
3. Close the modal, reload the page, reopen → **Forest** still selected and
   applied (FR-007). Verify `localStorage.getItem('fairwins_qrcolor_v1')`
   returns `forest`.
4. Each swatch shows a readable name — selection ring/check visible beyond
   color alone.

## Manual device scan matrix — SC-002 acceptance gate

Per research decision D10, optical decode is verified manually before merge
and the results recorded in the PR description. Scan **each of the four
palette colors** with each scanner; every cell must decode to the exact
address. **Any failed cell blocks merge** until the failure mode is
identified and fixed:

| Scanner | Midnight | Forest | Ocean | Plum |
|---------|----------|--------|-------|------|
| iOS Camera (stock) | ☐ | ☐ | ☐ | ☐ |
| Android Camera / Google Lens | ☐ | ☐ | ☐ | ☐ |
| FairWins in-app QRScanner (create-wager → scan opponent) | ☐ | ☐ | ☐ | ☐ |

For the FairWins-scanner row, the scanned address must populate the opponent
field (plain-address extraction path verified in research — the scanner's
`/0x[a-fA-F0-9]{40}/` extraction accepts raw addresses).

## Accessibility & CI gates

- `npm run test:frontend` — includes the axe suite (constitution V).
- Lighthouse runs in `.github/workflows/frontend-testing.yml` (a11y ≥ 0.9,
  perf ≥ 0.7) — no waivers expected: the feature adds no network requests and
  no new dependencies.
- ESLint: `cd frontend && npm run lint` must be clean.

## Out-of-scope checks (should NOT change)

- `git diff` shows no changes under `contracts/`, `subgraph/`,
  `frontend/src/components/ui/WagerQRCode.*`, or `frontend/src/test/WagerQRCode.test.jsx`.
- No new entries in `frontend/package.json` dependencies.
- nginx Permissions-Policy untouched (`camera=(self)` regression test still
  green).
