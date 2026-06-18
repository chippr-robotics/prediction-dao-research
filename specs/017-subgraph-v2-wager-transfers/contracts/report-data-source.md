# Contract: Frontend report data source (`frontend/src/data/reports/reportDataSource.js`)

The report's data-access boundary. This feature changes *where transfers come from*, not the
report's behavior. After this change the report builds line items from `WagerTransfer` and makes
**zero** open-ended log scans; the only per-transfer node call is one receipt for the gas fee.

## Method contract (`createReportDataSource(opts)` returns)

| Method | Before (#703) | After (this feature) |
|--------|---------------|----------------------|
| `enumerateWagers({ account })` | subgraph wager ids + `createdAt` | unchanged (still subgraph), or subsumed by `listTransfers` |
| `getWagerEvents(wagerId)` | **bounded `eth_getLogs` scan** per wager | **REMOVED** (replaced by `listTransfers`) |
| `listTransfers({ account, from, to })` | — (new) | subgraph `wagerTransfers(where:{party})`, time-ordered |
| `getTransactionReceipt(txHash)` | per discovered txHash | **kept** — exactly one per transfer, for `feeNative` only |
| `getBlock(blockNumber)` | for per-transfer timestamp | optional — `timestamp` now comes from `WagerTransfer` |

### `listTransfers` shape (consumed by `transferDerivation.js`)

```js
// returns transfers for the account, time-ordered ascending
[
  {
    wagerId: string,
    direction: 'deposit' | 'payout' | 'refund',
    token: string,        // address (base-unit amount; decimals applied downstream)
    amount: string,       // base units (BigInt-as-string)
    from: string,         // address
    to: string,           // address
    txHash: string,       // full hash — fed to getTransactionReceipt for the fee only
    blockNumber: number,
    timestamp: number,    // unix seconds (from the subgraph, not a getBlock call)
  },
  // …
]
```

This maps 1:1 onto spec 016's `TransferLineItem` (the report then adds `usdValue`/`costBasis`
valuation and the receipt-derived `feeNative`).

## Behavioral contract (acceptance)

- **Zero log scans (FR-014, SC-004)**: generating a report performs no `eth_getLogs` /
  `queryFilter` call. The only blockchain reads are `getTransactionReceipt(txHash)`, at most one
  per transfer, for the fee.
- **Fee attribution unchanged (FR-015)**: `feeNative` is populated only for transactions the
  user **sent**; otherwise `null` with a `feeUnavailableReason` (same as spec 016).
- **No-subgraph fallback (FR-016)**: when `VITE_SUBGRAPH_URL` is unset/unreachable for the
  active network, surface a clear "index required for this network" message, or use the retained
  #703 bounded scan — never an unbounded scan.
- **Network scoping**: transfers are read from the active network's subgraph only; no
  testnet/mainnet mixing (constitution III).

## Config / env

- `VITE_SUBGRAPH_URL` (per network) documented in `frontend/.env.example`.
- The Graph deploy key is used only via `graph auth`; stays in local `.env`, never committed.

## Downstream doc

Update spec 016's `data-model.md` field-availability matrix so `txHash`, per-transfer
`timestamp`, and `from`/`to` are marked subgraph-sourced, leaving only `fee` as receipt-only
(mirrored in this feature's [data-model.md](../data-model.md)).
