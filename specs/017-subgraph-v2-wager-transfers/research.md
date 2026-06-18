# Phase 0 Research: v2 WagerRegistry subgraph + per-transfer transaction records

All NEEDS CLARIFICATION from the Technical Context are resolved below. Each entry is a
decision, its rationale, and the alternatives rejected.

## R1 — Per-network start blocks (no genesis indexing)

**Decision**: Configure each network's data source at the `WagerRegistry` contract's
**deployment block**, sourced from `deployments/<net>-v2.json` (extended to record the block)
and surfaced via `subgraph/networks.json`:

| Network | chainId | WagerRegistry address | startBlock |
|---------|--------:|-----------------------|-----------:|
| Polygon | 137 | `0x5023765809fDA93ab9F11B684fdb76521eD31774` | **88118344** (known — `frontend/src/config/contracts.js` `DEPLOYMENT_BLOCKS_BY_CHAIN[137]`) |
| Amoy | 80002 | `0x916841aEe4832a2e9DD42470fa05a7329486e75a` | **TODO** — resolve from Amoy PolygonScan contract-creation tx (currently `0` in frontend config) |
| Mordor | 63 | `0xAE5b3148E1509973e4A03Dc809A78098215c5Eff` | **TODO** — resolve from Mordor Blockscout contract-creation tx (currently `0`) |
| Hardhat/local | 1337 | `0x31F2B0a0d14a8814af2430154ee39E551b66BA8A` | local deployment block (low; read from the local deployment, not `0` for a fresh chain unless genesis) |

**Rationale**: Genesis indexing (`startBlock: 0`) was the root cause of the RPC flood being
fixed (the contract didn't exist for the first ~88M blocks on Polygon — scanning them is pure
waste and trips public-node range limits). The deployment block is the earliest the contract
can have emitted an event. Polygon's is already recorded in the frontend; the same source of
truth (`deployments/`) should carry it for all chains.

**Action item**: Resolving the Amoy and Mordor `wagerRegistry` deployment blocks is a concrete
implementation task (query the explorer for the contract-creation transaction). Until resolved
they MUST NOT be left at `0` — that is a hard acceptance-criteria failure (SC-005).

**Alternatives rejected**: (a) `startBlock: 0` — the bug we're removing. (b) Hardcoding blocks
only in the manifest — splits the source of truth from `deployments/`; instead extend the
deployment records and derive `networks.json`.

## R2 — Multi-network manifest strategy

**Decision**: Use a single manifest with a `networks.json` and build per network via
`graph build --network <name>` (the pattern `graph-cli` 0.80 supports natively). `networks.json`
holds `{ "<network>": { "WagerRegistry": { "address", "startBlock" } } }` for `polygon`,
`polygon-amoy`, `mordor` (or its Graph network slug), and a local entry. Deploy one subgraph
per network (separate Studio/hosted deployments), matching the per-network `VITE_SUBGRAPH_URL`.

**Rationale**: One manifest + `networks.json` keeps event handlers and schema defined once and
avoids drift between near-duplicate manifests. It matches The Graph's documented multi-chain
workflow and keeps the diff reviewable.

**Open consideration**: Mordor (ETC testnet, chainId 63) may not be a first-class network slug
on the target indexer. If the chosen indexer can't host Mordor, that network falls back to the
client-side bounded scan (R-/#703 fallback) and is documented as "no subgraph" — it does not
block the Polygon/Amoy deployments. Capture the supported slug during implementation.

**Alternatives rejected**: Separate per-network manifest files (`subgraph.polygon.yaml`, …) —
more files to keep in lockstep; `networks.json` is the lighter, idiomatic choice.

## R3 — Deriving transfer amounts when events carry none

**Decision**: At `WagerCreated`, persist `creatorStake`, `opponentStake`, `token` on the
`Wager`. Derive transfer amounts as:

| Event | Transfer(s) | Amount source |
|-------|-------------|---------------|
| `WagerCreated` | creator deposit | `event.params.creatorStake` (in event) |
| `WagerAccepted` | opponent deposit | `wager.opponentStake` (stored at create) |
| `PayoutClaimed` | payout | `event.params.amount` (in event) |
| `WagerRefunded` | refund ×2 (creator, opponent) | `wager.creatorStake`, `wager.opponentStake` (stored) |
| `WagerDrawn` | refund ×2 (creator, opponent) | `wager.creatorStake`, `wager.opponentStake` (stored) |
| `WagerCancelled` | refund ×1 (creator only) | `wager.creatorStake` (stored) |

Mappings perform **no `try_*` contract calls**.

**Rationale**: `WagerAccepted(wagerId, opponent)`, `WagerRefunded(wagerId, creator, opponent)`,
`WagerDrawn(wagerId, creator, opponent, by)`, and `WagerCancelled(wagerId)` do not include
amounts (verified against `frontend/src/abis/WagerRegistry.js`). The stakes are immutable once
the wager is created, so reading them from the stored entity is exact. Avoiding contract reads
means a handler can never revert on a bad call, keeps indexing fast, and needs no contract ABI
function bindings — only event definitions. This aligns with constitution III (honest, exact
on-chain values) and IV/simplicity.

**Alternatives rejected**: `WagerRegistry.bind(event.address).try_wagers(id)` to read amounts —
adds revert risk, slows sync, and is unnecessary because the stakes are already in hand.

## R4 — Escrow address for `from`/`to`

**Decision**: Escrow is the `WagerRegistry` contract itself; use `event.address` for the escrow
side. Deposit: `from = party`, `to = event.address`. Payout/refund: `from = event.address`,
`to = party`. This matches spec 016's existing derivation (`from/to` around `wagerRegistry`).

**Rationale**: The registry custodies staked funds in v2; `event.address` is the emitting
registry, always correct per network without extra config.

**Alternatives rejected**: A separate vault/escrow address — not the v2 architecture; would need
extra lookup.

## R5 — Backward compatibility for existing subgraph consumers

**Decision**: The v2 `Wager` entity uses canonical v2 field names (`creator`, `opponent`,
`token`, `creatorStake`, `opponentStake`, `status`, `winner`, `createdAt`, `resolvedAt`,
`resolutionType`, `metadataUri`). The two existing consumers are updated to match in this PR:
- `frontend/src/data/wagers/SubgraphSource.js` (My Wagers pagination) — query v2 fields; map
  `participants` ⇐ `[creator, opponent]`, `stakeToken` ⇐ `token`, keep `status`/`createdAt`/
  `resolutionType`.
- `frontend/src/hooks/useSiteStats.js` — query `status`/`creator`/`createdAt` from v2 `Wager`.

My Wagers retains its `EventsSource` (RPC) fallback for any field the v2 events don't provide
(notably trading/resolution **deadlines** and `endTime`, which `WagerCreated` does not emit).
That gap is documented as a known limitation, not silently regressed.

**Rationale**: The current subgraph indexes the *wrong* (v1) contract, so for v2 these consumers
already get nothing and fall back to RPC. Migrating the schema would make a configured v2
`VITE_SUBGRAPH_URL` return GraphQL field errors against the old queries unless updated. Updating
them is the honest, non-breaking choice (constitution III) and is low-risk because the RPC
fallback remains.

**Alternatives rejected**: (a) Backward-compatible alias fields on the v2 `Wager` (e.g. fake
`marketType`, `stakePerParticipant`, contract-read `endTime`) — reintroduces contract reads for
deadlines and ships semantically dishonest fields (asymmetric stakes flattened to one). (b)
Leaving consumers untouched — a configured v2 subgraph URL would break My Wagers/site stats.

## R6 — `WagerTransfer` identity

**Decision**: `id = event.transaction.hash.concatI32(event.logIndex.toI32())`.

**Rationale**: A single transaction can produce multiple transfers (e.g. a draw refunds two
parties from one tx, or batched operations). `txHash` alone is not unique; appending the log
index guarantees a stable, collision-free id and is the canonical Graph pattern for
event-derived immutable entities (FR-009).

**Alternatives rejected**: `txHash` alone (collides on multi-transfer tx); `wagerId-party-kind`
(not stable if an event type can recur; harder to map back to the originating log).

## R7 — Direction model and multi-row events

**Decision**: `TransferDirection` enum = `deposit | payout | refund`. Each transfer is attributed
to one `party` (the user whose money moved). `WagerDrawn`/`WagerRefunded` emit **two** rows
(creator + opponent, each their own stake). `WagerCancelled` emits **one** (creator). Deposits
are one row each (`WagerCreated` → creator, `WagerAccepted` → opponent). `PayoutClaimed` → one
payout row to the winner. `WagerDeclined` and status-only events (`WagerResolved`,
`DrawProposed`, `DrawRevoked`) emit **no** transfer row but may update `Wager.status`.

**Rationale**: Mirrors the report's per-party, per-direction line-item model (spec 016
`TransferLineItem`) so the frontend maps 1:1 with no reshaping. Two-row refunds keep each
party's record independently queryable (FR-010, edge case "two-party refund").

**Alternatives rejected**: A single combined refund row per wager — breaks per-party queries and
per-party totals.

## R8 — Generated ABI, env docs, and CI gating

**Decision**:
- **Generated JSON ABI**: extend `scripts/utils/sync-frontend-contracts.js` to also emit
  `frontend/src/abis/WagerRegistry.json` (the subgraph's `abis[].file`). The subgraph consumes
  this generated artifact — never a hand-copied ABI (constitution V).
- **Env docs**: document `VITE_SUBGRAPH_URL` per network in `frontend/.env.example` (and root
  `.env.example` if present). The Graph **deploy key** is a secret used only via `graph auth`
  and stays in local `.env` — never committed (constitution key-management).
- **CI**: add/confirm a CI job that runs `graph codegen && graph build` and `graph test` for the
  subgraph as failing gates (no `continue-on-error`), alongside the existing frontend Vitest run
  (constitution IV).
- **#703 fallback**: keep the client-side bounded `getWagerEvents` scan as the path for networks
  without a configured subgraph; remove it once all live networks have the v2 subgraph (tracked,
  not done in this feature).

**Rationale**: Closes the spec's FR-005 (synced ABI), FR-017 (env docs), and SC-005 alignment
while honoring the constitution's generated-artifact and fail-loudly principles.

**Alternatives rejected**: Hand-maintaining `WagerRegistry.json` (drifts from the contract —
see [[frontend-abis-hand-maintained]]); committing the deploy key (secret leak).

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| Where do refund/accept amounts come from? | Stored `Wager.creatorStake/opponentStake` at create (R3) |
| Per-network startBlock values | Polygon 88118344 known; Amoy/Mordor resolve from explorer; local from deployment (R1) |
| One manifest or many? | One manifest + `networks.json`, build `--network` (R2) |
| Escrow address | `event.address` (the registry) (R4) |
| Will the schema change break My Wagers / site stats? | Yes — update both consumers' queries; RPC fallback retained (R5) |
| Transfer id uniqueness | `txHash.concatI32(logIndex)` (R6) |
| Mordor indexer support | If unsupported, Mordor uses the #703 bounded-scan fallback; doesn't block 137/80002 (R2) |
