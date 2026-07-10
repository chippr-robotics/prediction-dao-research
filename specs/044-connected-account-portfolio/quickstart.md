# Quickstart: Connected Account Portfolio

**Feature**: 044-connected-account-portfolio

## Prerequisites

- `npm ci` at repo root (workspaces install the frontend).
- No contracts, deployments, or env vars required — the feature is frontend-only.

## Run the tests

```bash
# Full frontend suite (includes the new portfolio tests)
npm run test:frontend

# Just this feature
cd frontend && npx vitest run src/test/portfolio
```

Expected: registry, hook, panel, and axe suites pass; no other suites regress
(`WalletPage` tests still pass with the new Finance tab).

## Validate in the app

```bash
npm run frontend   # Vite dev server
```

1. Open `http://localhost:5173/wallet?tab=portfolio` (deep link resolves the new tab).
2. **Disconnected**: the Portfolio section shows a connect prompt — no data (FR-014).
3. Connect a wallet on Polygon (137) or Amoy (80002):
   - Header shows "Total portfolio balance" in USD; if any listed asset has no price
     (e.g. WETH/WBTC/LINK holdings), the total is labeled **partial** and those rows
     show "—", never $0.00 (FR-010).
   - Native MATIC (and WMATIC/WETH/WBTC if held) appear under **Digital Commodities**;
     USDC under **Payment Stablecoins**; LINK and any held MembershipVoucher (item
     count) under **Digital Tools**; empty categories show an explicit empty state.
   - Each row discloses its classification source (SEC baseline / curated registry /
     app configuration); the informational + coverage disclaimers are visible (FR-013).
4. Collapse/expand a category with mouse and keyboard — header stays visible with the
   subtotal; `aria-expanded` flips (FR-016).
5. Switch networks (e.g. to Mordor 63): the view resets and shows only ETC-family
   assets — ETC native, USC stablecoin, WETC if configured — with native USD shown as
   unavailable (no MATIC-rate leakage) and totals partial (SC-004, R4).
6. Click refresh: balances reload; disconnect: back to the connect prompt.

## Reference

- Interfaces: [contracts/asset-registry.md](./contracts/asset-registry.md)
- Entities/states: [data-model.md](./data-model.md)
- Decisions: [research.md](./research.md)
