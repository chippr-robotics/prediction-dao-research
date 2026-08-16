# Research: Multi-Chain Activity Ledger

## R1 — Where the merge belongs

**Decision**: a new module `data/ledger/estateLedger.js` that calls the existing per-chain
`listEntries` once per cohort chain and merges above it.

**Rationale**: `normalizeEntry` enforces G5 — an entry whose `chainId` differs from its query
scope throws, by design ("a leaked chainId is a SOURCE bug"). Widening `listEntries` itself to
accept multiple chains would delete that guard. Merging above the per-chain boundary keeps every
existing invariant (per-source staleness, bridge collapse, dedup, enrichment against the right
network's token metadata) untouched per chain.

**Alternatives considered**: (a) multi-chain `listEntries` — rejected, kills G5 and forces every
source to become chain-aware at once; (b) merging in the hook — rejected, the merge has honest-
state rules of its own that deserve a unit-testable seam and reuse by the tax report later.

## R2 — Per-chain read state vs per-source staleness

**Decision**: two disclosure layers, deliberately distinct. A CHAIN resolves
read/not-deployed*/unreachable (estate pattern); within a `read` chain, individual SOURCES keep
the existing `staleClasses` degradation. (*for the ledger, "not-deployed" collapses into `read`
with zero on-chain entries — client-recorded classes can exist on any cohort chain, so a chain
without a FairWins deployment is still readable and genuinely empty, per FR-005.)

**Rationale**: one dead endpoint must not be reported as "earn is stale" (it is the whole chain),
and one broken subgraph must not be reported as "Polygon unreachable" (eight other sources read
fine). Collapsing the two layers loses exactly the honesty the spec demands.

## R3 — Deduplication across chains

**Decision**: dedup the merged stream by `entryId`.

**Rationale**: every entryId already embeds its chainId (`oc:<chainId>:…`, `dv:<chainId>:…`,
`cl:` client ids carry chain in their record scope), so cross-chain collisions are impossible
(FR-007) and the dedup's only real effect is collapsing reference-chain sources (membership)
that return the same rows when queried from multiple scopes. Verified: membership's source
queries the subgraph for the chain it is asked about; ids are `onchainEntryId({chainId,…})`.

## R4 — Polling and load

**Decision**: keep the existing 60s poll; per-chain reads run concurrently; the wallet's own
provider is reused for the active chain and `getReadProvider` (member endpoints + failover,
spec 069) for the rest. No stagger in v1.

**Rationale**: cohort ≤ 7 chains; reads are subgraph queries and bounded derived scans that the
single-chain path already performs; provider instances are cached. SC-005 requires comparable
wall-clock, which concurrency gives (slowest chain bounds latency, and an unreachable chain
times out inside its own isolation). If field telemetry shows cost, staggering non-recent chains
is a compatible follow-up.

## R5 — What happens to `isSupportedNetwork`

**Decision**: the estate path drops the active-network escrow gate for Activity/Stats; the
wallet-balance tile keeps reading the connected wallet's active chain.

**Rationale**: the gate existed because single-chain history was meaningless without an escrow
on the active chain. Merged history is meaningful regardless of where the wallet points — the
spec's US1 acceptance explicitly requires the record not to change on network switch. The
"Network not supported" empty state becomes unreachable-chain/partial disclosures instead.

## R6 — Wager statuses and titles across chains

**Decision**: wager records load per cohort chain (same isolation), and every lookup keyed by
wager id becomes keyed by `(chainId, wagerId)` — status for settled-filtering, and the
wager-message titles shipped with spec 091's PR.

**Rationale**: wager #12 exists independently on two chains (spec edge case); a flat id map
would let one chain's title/status shadow another's.

## R7 — Bitcoin

**Decision**: out of scope v1 (spec assumption). The merge module takes an explicit EVM cohort
list; a follow-up can add non-EVM sources behind the same per-chain state contract without
changing consumers.
