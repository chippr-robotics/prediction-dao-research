# Phase 1 Data Model: Wager Tax & Activity Report Generation

All structures are **client-side** (no new on-chain or backend schema). Persisted data is
limited to report-history metadata in `localStorage`; everything else is computed in memory
at generation time.

## Entity: ReportingPeriod

A resolved span used to filter transfers. Produced by `utils/reportPeriods.js`.

| Field | Type | Notes |
|-------|------|-------|
| `kind` | enum | `custom` \| `last_month` \| `last_quarter` \| `last_year` \| `last_calendar_year` |
| `from` | instant (UTC) | inclusive start |
| `to` | instant (UTC) | inclusive end |
| `label` | string | human label, e.g. "Last calendar year (2025)" |

**Resolution rules** (time zone = UTC):
- `last_month`: first→last instant of the previous calendar month.
- `last_quarter`: previous completed calendar quarter.
- `last_year`: trailing 12 months ending now.
- `last_calendar_year`: Jan 1–Dec 31 of the previous calendar year.
- `custom`: user `from`/`to`.

**Validation**: `to ≥ from`; `to` not in the future; `from`/`to` are valid dates. Invalid →
typed error surfaced in UI (FR-013), no report produced.

## Entity: TransferLineItem

One wager-related stablecoin movement. Built by `transferDerivation.js` and enriched by
`receiptEnrichment.js` + `valuation.js`. This is the core row of the report.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `wagerId` | string | subgraph/event | relates row to its wager |
| `direction` | enum | derived | `deposit` \| `payout` \| `refund` |
| `timestamp` | instant (UTC) | block of the tx | exact transfer time (FR-004) |
| `tokenAddress` | address | wager.stakeToken | stake currency |
| `tokenTicker` | string | networks.js / on-chain | e.g. `USDC`, `USC` (FR-004) |
| `tokenDecimals` | int | networks.js / on-chain | for amount formatting |
| `amount` | decimal | event/stake | exact token amount transferred (FR-004) |
| `usdValue` | decimal | valuation | `amount × 1.00` par baseline v1 (FR-005) |
| `costBasis` | decimal | valuation | par value at staking time (FR-015) |
| `feeNative` | decimal \| `null` | receipt | `gasUsed × effectiveGasPrice`; `null` when user didn't send the tx |
| `feeUnavailableReason` | string \| null | derived | set when `feeNative` is `null` (FR-005/FR-015 honesty) |
| `txHash` | hex string | log | full transaction hash (FR-006) |
| `fromAddress` | address | derived | sender (user or escrow) |
| `toAddress` | address | derived | recipient (escrow or user) (FR-006) |
| `chainId` | int | active chain | network scoping (FR-014) |

**Derivation rules** (see research D2): `deposit` rows set `from = user`, `to = wagerRegistry`;
`payout`/`refund` rows set `from = wagerRegistry`, `to = user`. `feeNative` is populated only
for transactions the user **sent**; otherwise `null` with a reason. Rows whose `timestamp`
falls outside the `ReportingPeriod` are excluded (FR-003).

## Entity: ActivityReport (document, in-memory)

The full rendered output produced on demand from a period (fresh request or a history entry).

| Field | Type | Notes |
|-------|------|-------|
| `account` | address | the signed-in user the report covers (FR-008/FR-012) |
| `chainId` | int | active network (+ human network name) |
| `period` | ReportingPeriod | covered span |
| `generatedAt` | instant | generation time (FR-008) |
| `lineItems` | TransferLineItem[] | sorted by `timestamp` ascending |
| `totals` | ReportTotals | per-ticker + overall (FR-008) |
| `valuationNote` | string | discloses $1.00 par baseline (FR-005/FR-009) |
| `disclaimer` | string | "informational record, not tax advice" (FR-009) |

### Value object: ReportTotals

Per-stablecoin and overall aggregates; MUST reconcile exactly to the included line items
(SC-004).

| Field | Type | Notes |
|-------|------|-------|
| `byTicker` | map ticker → { deposits, payouts, refunds, net, usdValue, fees } | grouped totals |
| `overall` | { usdValue, fees } | sums across tickers |

## Entity: ReportHistoryEntry (persisted — `localStorage`)

The only persisted structure. Store: `reportHistoryStore.js`. Key:
`fw_user_<lowercased_address>_tax_report_history_v1_<chainId>` → JSON array of entries.

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | uuid/timestamp id |
| `periodKind` | enum | from ReportingPeriod.kind |
| `from` | ISO string (UTC) | period start |
| `to` | ISO string (UTC) | period end |
| `label` | string | display label |
| `chainId` | int | redundant with key; kept for portability |
| `createdAt` | ISO string | when first generated (FR-010) |

**Operations** (contract in `contracts/report-history-store.md`):
- `list(address, chainId)` → entries (newest first)
- `add(address, chainId, entry)` → persists a new entry on successful generation
- `remove(address, chainId, id)` → deletes one entry (FR-011); underlying wager data
  untouched
- No rendered document is stored; re-opening an entry regenerates from chain data.

**Validation / lifecycle**: entries are scoped strictly to `address`+`chainId` (no
cross-network or cross-account read, FR-012/FR-014); corrupt/unparseable store is treated as
empty (defensive), never throws into the UI.

## Relationships

```text
ReportingPeriod ──filters──► TransferLineItem[] ──aggregates──► ReportTotals
        │                                   │
        └──────────────► ActivityReport ◄───┘   (rendered to PDF + CSV)
                              ▲
ReportHistoryEntry ──regenerates──┘  (persisted metadata only)
```

## Field availability matrix (sources)

> Updated by **spec 017** (`WagerTransfer` entity): `txHash`, per-transfer
> `timestamp`, and `from`/`to` now come straight from the subgraph, so the report
> performs **zero `eth_getLogs` scans** — only one `getTransactionReceipt` per
> transfer (for the fee). The "On-chain log" column is the legacy/no-subgraph
> bounded-scan fallback (#703).

| Report field | Subgraph (017) | On-chain log (fallback) | Receipt | Config | Notes |
|--------------|:-------:|:------------:|:-------:|:------:|-------|
| timestamp | ✓ (per-transfer) | ✓ (via block) | | | `WagerTransfer.timestamp` |
| ticker / decimals | | | | ✓ | networks.js (+ on-chain fallback) |
| amount | ✓ | ✓ | | | `WagerTransfer.amount` / event args |
| usdValue / costBasis | | | | | computed ($1.00 par) |
| **fee** | ✗ | | ✓ | | **receipt only** (subgraph blind) |
| **txHash** | ✓ | ✓ | ✓ | | `WagerTransfer.txHash` ← spec 017 (was not in subgraph) |
| from / to | ✓ | ✓ | | ✓ | `WagerTransfer.from`/`to` (escrow = `wagerRegistry`) |
| direction | ✓ | derived | | | `WagerTransfer.direction` |
| participants | ✓ | ✓ | | | enumeration |
