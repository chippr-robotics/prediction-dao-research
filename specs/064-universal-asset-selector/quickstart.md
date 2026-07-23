# Quickstart: Universal Asset Selector

Validation guide proving the feature end-to-end. Frontend-only; no contracts,
subgraph, or deploys involved.

## Prerequisites

- Repo installed: `npm install` at root (and `frontend/` deps as usual).
- An account with holdings on more than one configured network (e.g. USDC + native
  on the connected chain, plus WBTC/WETH on another), and — for the Bitcoin checks —
  a ready passkey Bitcoin wallet (spec 061).

## Run the tests (primary validation)

```bash
npm run test:frontend
```

Expected: the new suites pass —
- `hooks/__tests__/useSelectableAssets.test.*` — option assembly, activity scoping,
  acting-account source, zero-balance defaults, invalid-selection fallback.
- `lib/assets/__tests__/assetActivity.test.*` — allowed kinds, filter, default key.
- `components/ui/__tests__/UniversalAssetSelect.test.*` — nested `AssetLogo` per
  row, symbol/network/balance text, gasless marker, listbox a11y, empty state.
- `components/fairwins/__tests__/PayPanel.*`, `RequestPanel.*`,
  `CreateChallengePanel.*` — selector wiring, switch-gating, Wager denomination.
- `components/wallet/__tests__/TransferForm.*` — unchanged asset set, now with logos.

## Run the app (manual walkthrough)

```bash
npm run frontend
```

### Scenario A — Pay any held asset (US1)
1. Land on Home → **Pay**. Open the currency selector under the amount.
2. **Expect**: every held asset across all networks is listed, each with a nested
   logo (glyph + network sub-badge), symbol, network, balance, ⚡ where gasless.
3. Pick a non-default asset **on the connected chain**, enter an amount, choose a
   recipient, Pay. **Expect**: settles through the normal confirm/screening/fee flow.
4. Pick a held asset **on another network**. **Expect**: primary button reads
   "Switch to {network}"; only after switching can you pay. No wrong-chain send.

### Scenario B — Bitcoin in Pay/Request, not in Wager (US1/US2/US3)
1. With a ready BTC wallet, open the **Pay** selector. **Expect**: Bitcoin appears
   with its logo; selecting it routes the existing BTC send path; fee text says
   Bitcoin is never gasless.
2. Open **Request**, select Bitcoin, generate. **Expect**: a Bitcoin-appropriate
   request is produced; the view discloses the paid-to account.
3. Open **Wager**. Open the stake selector. **Expect**: Bitcoin is **absent**;
   native coin is absent; only ERC-20 assets (USDC + tokens) are offered.

### Scenario C — Request any asset (US2)
1. Home → **Request**. Select a non-stablecoin held asset, enter an amount, Request.
2. **Expect**: the generated payment request/QR encodes that asset + network.
3. Change the selected asset. **Expect**: the displayed request is invalidated
   (no stale QR for the previous asset).

### Scenario D — Wager beyond USDC (US3)
1. Home → **Wager**. **Expect**: default asset is USDC (unchanged first-render).
2. Select another held, allowlisted ERC-20; set a stake; create the challenge.
3. **Expect**: stake/escrow/payout denominate in the selected asset. Selecting a
   held ERC-20 the registry doesn't allow surfaces "That stake token is not
   allowed." (no silent failure).

### Scenario E — Trade view nested logos (US4)
1. Open the wallet **Transfer** ("trade") view.
2. **Expect**: the same assets as before, now each with a nested logo matching Earn
   and the home selector; the send flow is otherwise identical.

## Accessibility check

- Tab to the selector; open/close and choose with the keyboard (Enter/Space/Escape).
- With a screen reader, each option announces symbol + network + balance (the logo
  is decorative/`aria-hidden`).
- `npm run test:frontend` + CI axe/Lighthouse show no new a11y violations (SC-006).

## Done when

- All new + existing frontend tests pass; ESLint clean.
- Manual scenarios A–E behave as described; no wrong-chain send, no unsupported
  asset offered where it can't work, no fake balances.
