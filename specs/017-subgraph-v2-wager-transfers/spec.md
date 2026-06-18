# Feature Specification: v2 WagerRegistry subgraph + per-transfer transaction records

**Feature Branch**: `017-subgraph-v2-wager-transfers`

**Created**: 2026-06-17

**Status**: Draft

**Input**: User description: "Migrate the subgraph to index the v2 WagerRegistry and add per-transfer transaction-hash records so the wager tax/activity report can be built RPC-free." (GitHub issue #704 — follow-up to spec `016-wager-tax-report`, superseding the interim client-side mitigation in PR #703.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Indexed view reflects the live v2 wagers (Priority: P1)

The wager indexing layer points at the contract that real wagers are actually created on,
on every network the app supports, so that anything reading the index (the activity/tax
report, "my wagers" lists, site stats) sees a current and complete picture instead of an
empty or stale one.

**Why this priority**: Today the index is wired to a legacy contract with a placeholder
address, so for v2 it returns nothing. Every downstream consumer is therefore broken or
empty. Nothing else in this feature — or the tax report it unblocks — can deliver value
until the index reflects the live wagers. This is the foundational, independently
demonstrable slice.

**Independent Test**: On a network with at least one v2 wager, query the index for that
network and confirm it returns the wager with correct creator, opponent, token, stakes,
and a status that tracks the wager's real on-chain lifecycle (created → accepted →
resolved / refunded / cancelled).

**Acceptance Scenarios**:

1. **Given** a network whose live v2 wager contract has a recorded deployment, **When** the
   index is built for that network, **Then** it reads from the live contract's real address
   starting at the contract's deployment point — never from a placeholder address or from
   the chain's genesis block.
2. **Given** a wager that has been created and then accepted on-chain, **When** the index is
   queried, **Then** the wager appears with both parties and a status reflecting acceptance.
3. **Given** a wager that is later resolved, refunded, or cancelled, **When** the index is
   queried, **Then** the wager's status reflects that terminal state and (for resolution)
   records the winner and resolution time.

---

### User Story 2 - Every value-moving event is a queryable transfer record with its transaction hash (Priority: P1)

For each event that moves stablecoin value into or out of escrow — a creator's deposit, an
opponent's deposit, a payout, or a refund — the index records a distinct transfer row that
captures who the value moved between, how much, in which token, in which direction, when,
and the full transaction hash that carried it. A consumer can then list a given person's
transfers across the entire wager lifecycle directly from the index.

**Why this priority**: This is the core new capability. It is what lets the tax/activity
report enumerate a user's money movements and obtain each transaction hash from the index,
so the report no longer has to scan chain logs to discover those hashes (the scan that
floods public RPCs — see issue #703). It is independently valuable and testable as a data
query, before any UI consumes it.

**Independent Test**: For an account that has created a wager, had it accepted, and seen it
resolved (or refunded), query the index for that account's transfer rows and confirm it
returns one row per value movement, each with the correct counterparties, amount, token,
direction, timestamp, and a transaction hash that resolves to the originating transaction
on-chain — ordered by time.

**Acceptance Scenarios**:

1. **Given** a wager is created with a creator stake, **When** transfers are queried, **Then**
   there is a deposit row attributing the creator's stake moving from the creator into
   escrow, carrying the creation transaction's hash.
2. **Given** a wager is accepted with an opponent stake, **When** transfers are queried,
   **Then** there is a deposit row attributing the opponent's stake moving from the opponent
   into escrow, carrying the acceptance transaction's hash.
3. **Given** a wager pays out to a winner, **When** transfers are queried, **Then** there is a
   payout row attributing the paid amount moving from escrow to the winner, carrying the
   payout transaction's hash.
4. **Given** a wager is refunded or drawn, **When** transfers are queried, **Then** there is a
   refund row per affected party (each party's own stake moving from escrow back to that
   party); **and** for a wager cancelled before acceptance there is a single creator-refund
   row.
5. **Given** two value movements occur in the same transaction, **When** transfers are
   queried, **Then** each has a distinct identity (the transaction hash is not sufficient
   alone to tell them apart) and both are returned.
6. **Given** a filter on a single party, **When** that party's transfers are queried, **Then**
   the result includes their deposits, payouts, and refunds across creation, acceptance,
   payout, and refund — and excludes transfers belonging only to the counterparty.

---

### User Story 3 - The activity/tax report is built without scanning chain logs (Priority: P2)

The user-facing wager activity/tax report (spec 016) gets the list of wagers and the
per-transfer details — including each transaction hash, counterparties, amount, token, and
timestamp — from the index, and only ever contacts a blockchain node to look up the network
fee for an individual transaction by its known hash. It never performs an open-ended log
scan.

**Why this priority**: This converts the new index capability into the end-user outcome that
motivated the work — a report that generates reliably on public RPCs without rate-limit
floods. It depends on Stories 1 and 2, so it is sequenced after them, but it is the visible
payoff.

**Independent Test**: Generate a report for an account over a period containing several
wagers and observe the network traffic: confirm there are zero open-ended log-scan requests
and at most one fee-lookup request per transfer, and that the report's line items and totals
match the transfers held in the index.

**Acceptance Scenarios**:

1. **Given** an account with several wagers in the selected period, **When** a report is
   generated, **Then** no open-ended chain-log scan is performed.
2. **Given** the report needs the network fee for a transfer, **When** it resolves that fee,
   **Then** it performs at most one fee lookup per transfer, keyed by the transaction hash
   supplied by the index.
3. **Given** a network that has no index configured, **When** a report is requested, **Then**
   the user is told the report needs the index for that network (or, where retained, the
   interim bounded fallback is used) rather than the request silently flooding the node.

---

### Edge Cases

- **Draw / two-party refund**: a draw or two-party refund must produce one refund row per
  party, each for that party's own stake, not a single combined row.
- **Cancel before acceptance**: only the creator deposited, so only a single creator-refund
  row is produced (no opponent transfer ever existed).
- **Declined wager**: a decline moves no value and must not produce a transfer row (it may
  still update status).
- **Multiple transfers in one transaction**: transfer identity must remain unique within a
  transaction so co-located movements are not collapsed or overwritten.
- **Network with no index**: report generation must degrade with a clear message (or the
  retained interim fallback), never an unbounded scan.
- **Chain reorg**: transfer rows reflect canonical chain state after reorg handling; an
  individual transfer record is not mutated after the fact (corrections come from
  re-indexing the canonical chain).
- **Fee for a transaction the user did not send**: the network fee is only meaningful for the
  transaction's sender; for a transfer carried by a counterparty-sent transaction the fee
  is surfaced as a known gap rather than misattributed (unchanged from spec 016, FR-015).
- **Token decimals**: transfer amounts are recorded in the token's base units; conversion to
  human/USD values is the report's responsibility, not the index's.

## Requirements *(mandatory)*

### Functional Requirements

#### Indexing the live v2 contract (Story 1)

- **FR-001**: The index MUST source wagers from the live v2 wager contract, replacing the
  legacy contract it currently references.
- **FR-002**: For each supported network — Polygon (137), Polygon Amoy (80002), Mordor (63),
  and the local development chain (1337) — the index MUST be configured with that network's
  real deployed contract address and MUST begin reading at the contract's deployment point,
  never at the chain's genesis block and never from a placeholder/zero address.
- **FR-003**: The index MUST track each wager's lifecycle status (created, accepted, resolved,
  refunded, cancelled, drawn, and — where applicable — draw-proposed/declined) from the v2
  contract's events.
- **FR-004**: For a resolved wager the index MUST record the winner and the time of
  resolution; for created wagers it MUST record creation time, both parties, the staked
  token, and each party's stake amount.
- **FR-005**: The index definition MUST stay in sync with the live contract's published
  interface, and the source of that interface MUST be the same artifact the rest of the app
  uses (no hand-divergent copy).

#### Per-transfer transaction records (Story 2)

- **FR-006**: The index MUST record a distinct transfer entry for every value-moving event:
  the creator's deposit at creation, the opponent's deposit at acceptance, a payout to a
  winner, and a refund to each affected party on refund/draw/cancel.
- **FR-007**: Each transfer entry MUST capture: the wager it belongs to, the party it is
  attributed to, the direction (deposit, payout, or refund), the token, the amount in the
  token's base units, the source and destination addresses, the full transaction hash, the
  block number, and the block timestamp.
- **FR-008**: Each transfer's amount MUST be taken from the on-chain value carried in the
  triggering event itself (e.g., the stake or payout amount), not inferred or recomputed
  off-chain.
- **FR-009**: Each transfer entry MUST be uniquely identifiable even when multiple value
  movements share a single transaction, so co-located transfers are neither merged nor
  overwritten.
- **FR-010**: A consumer MUST be able to retrieve all transfers for a given party, ordered by
  time, spanning creation, acceptance, payout, and refund.
- **FR-011**: A consumer MUST be able to retrieve all transfers belonging to a given wager.
- **FR-012**: Transfer entries MUST be treated as immutable historical records once written
  (corrections arise only from re-indexing the canonical chain), so consumers can rely on a
  transaction hash recorded against a transfer.

#### Report consumption (Story 3)

- **FR-013**: The activity/tax report MUST obtain its wager enumeration and its per-transfer
  details — including each transaction hash, counterparties, amount, token, and timestamp —
  from the index.
- **FR-014**: The report MUST NOT perform an open-ended chain-log scan to discover transaction
  hashes; the only per-transfer node call permitted is a single network-fee lookup keyed by
  the transaction hash supplied by the index.
- **FR-015**: Network fees remain derived from the transaction record (not available from the
  index) and remain attributed only to transactions the user sent; this attribution rule is
  unchanged from spec 016 (FR-015).
- **FR-016**: For a network without a configured index, the report MUST behave predictably —
  either surfacing a clear "index required for this network" message or using the retained
  interim bounded fallback — and MUST NOT fall back to an unbounded scan.
- **FR-017**: The per-network index endpoint MUST be documented for configuration (e.g., in
  the example environment file) so each supported network can be pointed at its index.
- **FR-018**: Migrating the indexed wager records to the v2 shape MUST NOT break existing index
  consumers (the "my wagers" list and site statistics). Their queries are updated to the v2
  shape in the same change, and the existing direct-chain (RPC) fallback is retained for any
  field the v2 records do not provide.

### Key Entities *(include if feature involves data)*

- **Wager (v2)**: A single peer-to-peer wager. Key attributes: identifier, creator, opponent,
  staked token, creator stake, opponent stake, lifecycle status, winner (when resolved),
  creation time, resolution time. Relates to many transfers.
- **WagerTransfer**: One value movement in a wager's lifecycle and the core new record. Key
  attributes: a unique identity (stable even when several transfers share one transaction),
  the owning wager, the attributed party, direction (deposit / payout / refund), token,
  amount in base units, source address, destination address, transaction hash, block number,
  and timestamp. Relates to exactly one wager and is attributed to one party.
- **TransferDirection**: The classification of a transfer — deposit (party → escrow), payout
  (escrow → winner), or refund (escrow → party).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On each supported network, querying the index returns live v2 wagers (creator,
  opponent, token, stakes, lifecycle status) — where it currently returns none.
- **SC-002**: Across a full wager lifecycle (create → accept → resolve, and separately
  refund/draw/cancel), 100% of value-moving events produce a transfer record with a correct
  direction, counterparties, amount, token, transaction hash, and timestamp.
- **SC-003**: A query for one party's transfers returns that party's deposits, payouts, and
  refunds ordered by time, and excludes transfers that belong only to the counterparty.
- **SC-004**: Generating an activity/tax report for an account performs zero open-ended
  chain-log scans and at most one network-fee lookup per transfer.
- **SC-005**: No supported network's index is configured with a placeholder/zero address or a
  genesis (block 0) start point.
- **SC-006**: Report generation that previously failed with node range/rate-limit errors on
  public RPCs now completes for the same account and period.

## Assumptions

- The v2 wager events carry the value amounts needed for each transfer (creator stake and
  opponent stake at creation/acceptance, payout amount at payout), so transfer amounts can be
  taken directly from event data without additional contract reads.
- Escrow is held by the wager contract itself, so deposit destinations and payout/refund
  sources resolve to the wager contract's address.
- Each supported network has a recorded deployment for the live v2 contract from which its
  address and deployment start point can be obtained; obtaining the exact deployment block
  number per network is a planning/implementation task, not a scope decision.
- The activity/tax report from spec 016 already exists and already enumerates via the index;
  this feature changes where the report's transfer details and transaction hashes come from,
  not the report's user-facing behavior.
- The interim client-side bounded log-scan mitigation (PR #703) is retained as a fallback for
  networks without an index and may be removed once every live network has the v2 index.
- USD fair-market-value and cost-basis valuation rules (par $1.00 baseline, staking-time
  valuation) are owned by spec 016 and are out of scope here; this feature only supplies the
  transfer facts the report values.

## Dependencies

- Builds on spec `016-wager-tax-report` (the report this feature serves) and supersedes the
  interim mitigation in PR #703.
- Depends on the recorded v2 deployments for Polygon (137), Polygon Amoy (80002), Mordor (63),
  and the local development chain (1337) for per-network addresses and start points.

## Out of Scope

- Any change to the report's user-facing layout, period selection, valuation, or download
  formats (owned by spec 016).
- Admin/operations report generation on behalf of users and the Operations role (deferred by
  spec 016).
- Historical USD price feeds / de-peg pricing (deferred by spec 016).
- Indexing networks beyond the four supported chains listed above.
