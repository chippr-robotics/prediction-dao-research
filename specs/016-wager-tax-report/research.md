# Phase 0 Research: Wager Tax & Activity Report Generation

All Technical Context unknowns were resolved by inspecting the codebase; there are no
remaining `NEEDS CLARIFICATION` items. Decisions below drive Phase 1 design.

## D1. Authoritative data source for report rows

**Decision**: Build report rows from **on-chain event logs + transaction receipts** (via
`ethers`), using the **subgraph (`WagerRepository`) only to enumerate** which wagers the
user participated in within the period.

**Rationale**:
- The subgraph `Wager` entity (`subgraph/schema.graphql`) stores wager-level fields
  (`creator`, `participants`, `stakeToken`, `stakePerParticipant`, `createdAt`,
  `resolvedAt`, `winner`, `status`) but **does not persist transaction hashes**, and The
  Graph mappings have **no access to gas/fee data** at all.
- The report mandates the full **transaction hash** (FR-006) and **network/gas fees**
  (FR-005). Fees can only come from a transaction **receipt** (`gasUsed × effectiveGasPrice`),
  so an RPC receipt path is unavoidable regardless of subgraph changes.
- Once we are reading receipts/logs for fees, the same logs yield the txHash and the precise
  per-transfer block timestamp — so no subgraph change is needed for v1.
- The subgraph remains the right tool for the one thing it is good at here: quickly listing
  the user's wagers (it already filters by `creator`/`participants` and is built for the
  "millions of bets" NFR).

**Alternatives considered**:
- *Extend the subgraph with a `WagerTransfer` entity (from/to/txHash/amount/type/timestamp)*
  — rejected for v1: it still cannot provide gas fees, and it requires multi-network
  redeploy + reindex (more change than the initial self-service slice needs). The report
  builder and history schema are designed so a richer index can later replace the
  enumeration step without changing the report's shape.
- *Pure `EventsSource` log-scan for everything (no subgraph)* — workable but a full block-range
  scan over a year is heavier on public RPCs than a targeted per-wager `queryFilter`; using
  the subgraph to narrow to the user's wagers first is cheaper and scales better.

## D2. Deriving transfers from wager lifecycle events

**Decision**: Map each lifecycle event to one or more **Transfer Line Items** with explicit
sending/receiving addresses, using the `WagerRegistry` (escrow) address as the counterparty.

| Event | Transfer(s) | From → To | Fee attributed to user? |
|-------|-------------|-----------|--------------------------|
| `WagerCreated` | creator stake deposit | creator → WagerRegistry | Yes (creator sent the tx) |
| `WagerAccepted` | opponent stake deposit | opponent → WagerRegistry | Yes (opponent sent the tx) |
| `PayoutClaimed` | winner payout | WagerRegistry → winner | Yes (claimer sent the tx) |
| `WagerRefunded` | refund to each party | WagerRegistry → creator / opponent | Only if user sent the refund tx |
| `WagerCancelled` | creator refund | WagerRegistry → creator | Only if user sent the cancel tx |
| `WagerDrawn` | stake returned to each party | WagerRegistry → creator / opponent | Only if user sent the tx |

**Rationale**: Addresses are derivable (user address from event args + the escrow address
from synced `config/contracts.js` `wagerRegistry`), so sending/receiving addresses need no
new data. The gas **fee** belongs only to the account that **sent** the transaction; for
transfers settled by a counterparty/arbitrator the user paid no gas, so the fee field is
recorded as not-applicable (surfaced honestly per FR-015, not faked).

**Edge handling**: Only **terminal/effective** transfers are emitted (a deposit always
counts; payouts/refunds count when they occurred). Open/active wagers contribute the
deposit row only. This satisfies the spec's truthful-representation edge cases.

## D3. Fair market value & cost basis (v1)

**Decision**: Value every stablecoin transfer at a **$1.00 par baseline per token**, stored
in a structured `usdValue` field; cost basis uses the same valuation at staking time
(per the spec clarification). The report header discloses the par baseline.

**Rationale**: Matches the recorded clarification; avoids the heavy lift of historical
per-timestamp price feeds for v1 while keeping the field structured so an oracle/external
price source can populate it later without changing the report shape.

**Alternatives considered**: on-chain oracle / external historical price API / indexer-captured
price — all deferred (documented in spec Clarifications) as a later enhancement.

## D4. Report-history persistence

**Decision**: Persist **metadata only** in `localStorage`, keyed
`fw_user_<address>_tax_report_history_v1_<chainId>`; regenerate the document on demand. Each
entry: `{ id, periodLabel, from, to, chainId, createdAt }`. Users can delete entries.

**Rationale**: The project is a **frontend-only SPA with no backend** (`README.md`); existing
user data (preferences, activity feed) already lives in `localStorage` via
`utils/userStorage.js` and `data/notifications/activityStore.js`, which this mirrors
(including chainId scoping and versioned keys). Because source data is immutable on-chain,
regeneration reproduces equivalent content (FR-010), and storing only metadata avoids keeping
a store of documents containing wallet addresses.

**Trade-off (documented)**: history is per-device/browser, not synced across devices. A
future backend could replace the store behind the same interface. Acceptable for v1.

## D5. Period selection & resolution

**Decision**: Resolve named presets (last month, last quarter, last year = trailing 12
months, last calendar year) and custom from/to ranges to explicit `[from, to]` instants in
a single fixed reporting time zone (**UTC**). Validate: `to ≥ from`, no future `to`, presets
map to deterministic boundaries.

**Rationale**: Deterministic, testable boundaries (spec Edge Cases); UTC avoids ambiguity at
period edges. Pure functions in `utils/reportPeriods.js` are trivially unit-tested.

## D6. Document generation libraries

**Decision**: Add `jspdf` + `jspdf-autotable` (tabular PDF), `papaparse` (CSV), and
`file-saver` (download trigger). PDF is the primary human-readable output (matches the
attached sample's intent); CSV supports import into tax software.

**Rationale**: No PDF/CSV/export capability exists in `frontend/package.json` today. These
are small, widely used, browser-side libraries with no backend requirement. Per Constitution
"Additional Constraints", this is a library addition (not a core-stack change) and is
justified here. `@react-pdf/renderer` was considered but is heavier; `jspdf-autotable`
covers a row/column tax table with less bundle cost.

## D7. Token metadata, network scoping, contract addresses

**Decision**: Resolve the stablecoin **ticker/decimals** from `config/networks.js`
(`NETWORKS[chainId].stablecoin`), falling back to an on-chain `symbol()/decimals()` lookup for
any non-default token address (memoized per address+chainId). Read the escrow
(`wagerRegistry`) address and ABIs from the **synced** `config/contracts.js` artifacts. Scope
every query and every history key to the active `chainId` from `useChainId()`.

**Rationale**: Constitution V mandates synced artifacts (never hardcoded); Constitution III
mandates strict network scoping. Both mechanisms already exist and are reused.

## D8. Testing approach

**Decision**: Vitest unit + integration tests under `frontend/src/test/`, with a new
`fixtures/wagers.js` providing sample wagers, lifecycle logs, and receipts. Mock
`global.fetch` for subgraph enumeration and reuse the existing ethers/provider mocks
(`test/setup.js`) for logs/receipts. Cover: period resolution + validation, transfer
derivation per event type, fee/timestamp enrichment (including the "user didn't send the tx →
no fee" case), $1.00 valuation + totals reconciliation, CSV/PDF content, history add/list/
remove, network scoping, and empty/invalid-range states.

**Rationale**: Constitution II (test-first) and existing frontend test conventions.

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| Where do txHash + fees come from? | On-chain logs + transaction receipts (subgraph cannot provide either) |
| Subgraph schema change needed? | No (v1); enumeration only. Richer index deferred. |
| Backend for history? | None exists; use `localStorage` (per address+chainId) |
| Sending/receiving addresses? | Derived: user address (event args) ↔ `wagerRegistry` escrow (synced config) |
| FMV/cost basis source | $1.00 par baseline, structured field (per clarification) |
| Period semantics | UTC, deterministic presets + validated custom range |
| PDF/CSV tooling | `jspdf`+`jspdf-autotable`, `papaparse`, `file-saver` |
