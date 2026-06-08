# Quickstart: Validating Runtime Chain Consistency

How to prove the feature works end-to-end. Implementation details live in
`tasks.md` (Phase 2) and the code; this is a run/validation guide.

## Prerequisites

- `cd frontend && npm install`
- A browser wallet (e.g. MetaMask) able to switch between **Polygon (137)** and
  **Polygon Amoy (80002)**.
- For the "tier leak" scenario: an account that holds a membership on **Amoy**
  but **not** on mainnet (the exact reported repro).

## Automated checks (fast, CI-equivalent)

```bash
cd frontend
npm run lint        # regression guard (R1/R2): build-bound resolution in a
                    # user-facing path fails the build
npx vitest run      # per-path chain-aware tests + the source-scanning guard test
```

Expected: lint passes; the full suite is green (currently 851 tests, plus the
new chain-aware tests). The regression-guard test fails if `getContractAddress(`
or argless `getProvider()` is reintroduced into `src/hooks|components|pages` or
chain-scoped `src/utils|data`.

## Manual validation matrix

Run `npm run frontend`, connect the wallet, and for **each supported network**
(Amoy, then mainnet) walk the modals. Every chain-scoped value must match the
connected network.

| Area | What to confirm |
|---|---|
| Membership purchase modal | Tier gating, prices, limits, balance reflect the connected chain. On mainnet with no membership → all tiers offered (no "already Silver"). |
| Wager create (`useFriendMarketCreation`) | Token, balances, registry reads are the connected chain's; tx executes there. |
| Wager list/details (`FriendMarketsModal`, `MyMarketsModal`) | Wagers shown are the connected chain's. |
| Accept / claim / refund (`MarketAcceptancePage`) | Reads + writes target the connected chain; pre-sign amounts match execution. |
| Admin panel (`AdminPanel`, `useTreasuryVault`) | Treasury/fees/roles read from the connected chain. |
| Stats (`useSiteStats`) | Stats are the connected chain's. |

### Scenario A — the reported tier-leak repro (must pass)

1. Connect on **Amoy** (account holds Silver) → membership shows Silver. ✔
2. Switch the wallet to **Polygon mainnet** (no membership there).
3. Open the membership modal.
4. **Expected**: prompted to buy, **all** tiers offered from the lowest; **no**
   "current membership is already Silver"; prices/limits are mainnet's.

### Scenario B — switch refresh (SC-002)

1. Open any chain-scoped modal on network A.
2. Switch to network B in the wallet.
3. **Expected**: within ~2 s all values re-resolve to B; a loading state shows
   meanwhile; no network-A value lingers.

### Scenario C — unavailable network (FR-006/008)

1. Connect to a supported network that lacks a needed deployment (or an
   unsupported chain).
2. Open the affected action.
3. **Expected**: `NetworkUnavailableNotice` with a clear message naming a
   supported network and a working one-click switch — **no** generic "contract
   not found" and **no** build-time data shown.

### Scenario D — cache scoping (FR-007)

1. With a cached role/purchase recorded on network A, switch to network B.
2. **Expected**: the network-A cached value is not shown on B; B reads fresh
   from its own chain.

## Done when

- Automated checks green; Scenarios A–D pass on both Amoy and mainnet.
- Re-targeting the build-time default network and reloading does **not** change
  what a connected wallet sees (SC-006) — the UI follows the wallet.
