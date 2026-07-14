# Reporting module (spec 016-wager-tax-report, extended by spec 051)

Frontend-only generation of a user's **FairWins activity report** — a
downloadable, multichain, multi-use record of on-chain activity across every
ledger class (wager, transfer, earn, pool, membership). The primary path reads
the unified activity ledger (spec 051) so the report and the Account tab can
never disagree; a legacy wager-only path is kept for older callers/tests. No
backend, no contract or subgraph changes. See `specs/016-wager-tax-report/` and
`specs/051-unified-activity-ledger/`.

## Why on-chain receipts (not the subgraph)

The report needs the full **transaction hash** and the **network/gas fee** per
transfer. The subgraph persists neither (and The Graph mappings cannot access
gas at all), so the authoritative data path is on-chain **logs + receipts**.
The subgraph is reused only to enumerate the user's wagers.

## Pipeline

```
enumerate wagers ─► deriveTransfers ─► enrichTransfers ─► filter period ─► value ($1 par) ─► totals ─► render (PDF/CSV)
   (dataSource)      transferDerivation   receiptEnrichment   reportBuilder    valuation       reportBuilder   pdfReport/csvReport
```

| File | Responsibility |
|------|----------------|
| `reportBuilder.js` | Orchestrates the pipeline → `ActivityReport` |
| `transferDerivation.js` | Lifecycle events → transfer line items (direction, from/to) |
| `receiptEnrichment.js` | Adds txHash/timestamp/fee from blocks + receipts |
| `valuation.js` | $1.00 par USD value + cost basis (structured for a future feed) |
| `tokenMeta.js` | Stablecoin ticker/decimals (config + on-chain fallback) |
| `pdfReport.js` / `csvReport.js` | Render the report; `file-saver` triggers download |
| `reportHistoryStore.js` | localStorage metadata history (add/list/remove), per account+chainId |

I/O (chain reads) is injected via `dataSource` so the modules are unit-tested
without a provider; see `src/test/reports/` and `src/test/fixtures/wagers.js`.

`utils/reportPeriods.js` resolves preset/custom periods to UTC ranges.
