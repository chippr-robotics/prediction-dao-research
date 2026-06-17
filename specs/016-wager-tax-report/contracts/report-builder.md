# Contract: Report Builder (`data/reports/reportBuilder.js`)

Internal module contract for producing an `ActivityReport` for a user + period on the active
network. Pure orchestration over the data layer; no UI, no persistence.

## Function: buildReport

```text
buildReport({ account, chainId, period, repository, provider, contracts, networkMeta, onProgress })
  → Promise<ActivityReport>
```

**Inputs**
- `account` (address) — signed-in user; the report covers only this account (FR-012).
- `chainId` (int) — active network; all data scoped to it (FR-014).
- `period` (ReportingPeriod) — already resolved + validated.
- `repository` — existing `WagerRepository` (subgraph enumeration of the user's wagers).
- `provider` — ethers provider for logs/receipts/blocks (from wagmi).
- `contracts` — synced addresses/ABIs (`wagerRegistry`, etc.) from `config/contracts.js`.
- `networkMeta` — `NETWORKS[chainId]` (stablecoin ticker/decimals, network name, isTestnet).
- `onProgress(fraction, label)` — optional callback for UI progress.

**Behavior**
1. Enumerate wagers where `account ∈ {creator, participants}` via `repository`.
2. For each candidate wager, derive `TransferLineItem`s (`transferDerivation.js`).
3. Enrich each item with `txHash`, exact `timestamp`, and `feeNative` (`receiptEnrichment.js`).
4. Drop items whose `timestamp` is outside `period` (FR-003).
5. Apply `valuation.js` ($1.00 par `usdValue`/`costBasis`).
6. Compute `ReportTotals` that reconcile exactly to the retained items (SC-004).
7. Return an `ActivityReport` (sorted by timestamp; includes valuation note + disclaimer).

**Guarantees / errors**
- Deterministic for a fixed `(account, chainId, period)` against immutable chain data
  (FR-010) — regeneration yields equivalent content.
- Empty period → a valid report with zero line items (not an error) (Story 1 AC4).
- Never returns another account's data; never mixes chains (FR-012/FR-014).
- A field that cannot be determined (e.g., fee for a tx the user didn't send) is returned as
  `null` + reason, never fabricated (FR-005/FR-015).
- Propagates a typed error if chain data is unreachable; partial/silent truncation is not
  allowed (caller shows the failure).
