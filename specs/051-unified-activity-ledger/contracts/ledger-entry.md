# Contract: LedgerEntry Schema & Identity

Normative schema lives in [`../data-model.md`](../data-model.md). This
contract fixes the guarantees consumers may rely on and producers must uphold.

## Consumers

- `useActivityLedger` / Account tab (`RecentActivityFeed`, summary tiles,
  P&L chart, breakdowns)
- `TransferActivityList` (ledger filtered to `class: 'transfer'`)
- Tax/activity report (`reportDataSource` → `reportBuilder` → CSV/PDF)
- Backup (`activityLedger` synced object — client-provenance records only)

## Guarantees

| # | Guarantee | Backing requirement |
|---|---|---|
| G1 | `entryId` is stable across sessions, re-derivations, and restores | FR-009, FR-011 |
| G2 | `timestamp` is real activity time in epoch ms, or `null` with `timestampProvenance: 'unavailable'`; the value `0` never appears | FR-005, FR-006 |
| G3 | Entries with `status: 'failed'` never contribute to any total (dashboard, breakdowns, report) but always appear in listings/exports | FR-003, SC-006 |
| G4 | Every entry with `provenance: 'onchain'` carries a `txHash` resolvable on the entry's `chainId` block explorer | FR-004 |
| G5 | An entry's `chainId` equals the query's `chainId` — no cross-network leakage | FR-007 |
| G6 | `valuationStatus: 'unvalued'` entries are present in every consumer's output, flagged, never zero-filled | FR-016 |
| G7 | For a given (account, chainId, period, filter), the report builder and the Account tab receive the identical entry set | FR-014, FR-015, SC-002 |
| G8 | Persisted client records are append-only; supersession is expressed via `supersedes`, and prior records remain readable | FR-008 |

## CSV export column mapping (report)

Extends the spec-016 layout; one row per LedgerEntry:

`date (ISO, from timestamp or "unavailable"), network, class, kind, direction,
status, failureReason, token, amount, valueUsd, valuationStatus,
counterparty, txHash, entryId`

Rows are ordered by timestamp ascending; entries with `timestamp: null` sort
last within their class and are flagged. The report header states the network
scope and any `prunedBefore` disclosure (FR-013).
