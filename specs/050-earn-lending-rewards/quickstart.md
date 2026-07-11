# Quickstart: validating the Earn section (spec 050)

## Prerequisites

- `npm ci` at repo root (workspaces install the frontend).
- For live-flow checks: a browser wallet with a small USDC balance on Polygon (137) — the
  cheapest real-money validation path — or Ethereum mainnet (1).

## Automated validation

```bash
npm run test:frontend            # full Vitest suite, includes frontend/src/test/earn/*
npm run test:frontend -- earn    # just the earn feature tests
npm run lint --workspace frontend
npm run build --workspace frontend
```

Expected: all green; earn tests cover API normalization, claimable math, amount validation,
capability gating, honest unavailable states, activity source contract, and axe (WCAG) passes.

## Manual validation script

1. `npm run frontend` → open the app, connect a wallet.
2. **Nav (US1/AS1)**: open the nav drawer → Finance shows **Earn** with its own icon; mobile
   bottom bar shows it among Finance siblings. Route: `/wallet?tab=earn`.
3. **Unsupported network honesty (US1/AS5)**: switch to Mordor → Earn explains lending isn't
   available here and names Ethereum & Polygon; no vault data, no dead buttons.
4. **Vault list (US1/AS2)**: switch to Polygon → Lend area lists curated Morpho vaults with
   asset, APY, total deposits, curator; every term has an InfoTip; "Powered by Morpho" + risk
   disclosure visible; docs link opens the user guide.
5. **Deposit (US1/AS3)**: pick a USDC vault → enter amount (try 0, dust, > balance — all
   rejected pre-wallet with reasons; Max works) → summary explains approval + deposit prompts →
   confirm both → success state; position appears with current value.
6. **Withdraw (US1/AS4)**: open the position → withdraw part (bounded by available liquidity,
   shown honestly) → balance returns to wallet.
7. **Rewards (US2)**: open Earn → Rewards with an address holding Merkl rewards → claimable
   amounts + freshness copy shown; Claim → wallet prompt → tokens arrive; empty state explains
   accrual when there's nothing to claim; kill network → explicit "temporarily unavailable".
8. **Portfolio entry (US3/AS1-2)**: Portfolio → USDC detail → **Earn** action routes to
   `/wallet?tab=earn&chain=137&token=USDC` with the list prefiltered; on a non-earn network the
   action is disabled with a reason.
9. **Activity audit (US3/AS3)**: after steps 5–7, the activity feed shows earn entries
   (deposit/withdraw/claim) with amounts and working tx links.
10. **Docs (FR-014)**: `pip install -r requirements.txt && mkdocs serve` → User Guide → "Earn"
    page renders; developer guide "Earn integration" documents config + the deferred
    treasury-fee decision.

## Reference

- Data shapes: [data-model.md](./data-model.md)
- Config/API/claim contracts: [contracts/](./contracts/)
- External decisions & sources: [research.md](./research.md)
