# Phase 1 Data Model: v2 WagerRegistry subgraph + per-transfer transaction records

All structures live in **The Graph store** (subgraph entities), populated by the v2
`WagerRegistry` event mappings. No new on-chain or backend schema. The report's client-side
structures (`TransferLineItem`, `ActivityReport`, …) are owned by spec 016; this model defines
the *indexed* records the report reads from.

## Enum: TransferDirection

| Value | Meaning |
|-------|---------|
| `deposit` | value moved **party → escrow** (a stake going in) |
| `payout` | value moved **escrow → winner** |
| `refund` | value moved **escrow → party** (stake returned) |

## Entity: Wager (rewritten for v2)

Mutable; keyed by the on-chain wager id. Tracks the wager's identity, stakes, and lifecycle.
The stakes are stored here at creation so refund/accept transfers can derive their amounts
without contract reads (research R3).

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id` | ID! | `event.params.wagerId.toString()` | on-chain wager id |
| `creator` | Bytes! | `WagerCreated.creator` | wager creator |
| `opponent` | Bytes! | `WagerCreated.opponent` | designated opponent (may be zero for open wagers) |
| `token` | Bytes! | `WagerCreated.token` | staked stablecoin |
| `creatorStake` | BigInt! | `WagerCreated.creatorStake` | base units; used to derive creator refund |
| `opponentStake` | BigInt! | `WagerCreated.opponentStake` | base units; used to derive opponent deposit & refund |
| `resolutionType` | Int! | `WagerCreated.resolutionType` | v2 ResolutionType enum index |
| `metadataUri` | String | `WagerCreated.metadataUri` | off-chain metadata pointer (may be empty) |
| `metadataHash` | Bytes | `WagerCreated.metadataHash` | integrity hash of metadata |
| `status` | WagerStatus! | derived from events | see state transitions below |
| `winner` | Bytes | `WagerResolved.winner` / `PayoutClaimed.winner` | set on resolution |
| `createdAt` | BigInt! | `event.block.timestamp` at create | unix seconds |
| `resolvedAt` | BigInt | `event.block.timestamp` at resolve | unix seconds; null until resolved |
| `transfers` | [WagerTransfer!]! | `@derivedFrom(field: "wager")` | reverse relation, not stored |

### Enum: WagerStatus (v2)

`open` (created, awaiting acceptance) → `active` (accepted) → terminal:
`resolved` | `refunded` | `cancelled` | `drawn`. Optional intermediate `draw_proposed`,
and `declined` (opponent declined an open wager). Exact enum values finalized against the
frontend's canonical status mapping during implementation; the report only needs `status` to
display wager state, not to gate transfers.

### State transitions

```text
            WagerCreated
                 │
                 ▼
              [open] ──WagerDeclined──► [declined]
                 │
            WagerAccepted
                 │
                 ▼
             [active] ──┬─ WagerResolved (+ PayoutClaimed) ─► [resolved]
                        ├─ WagerDrawn ───────────────────────► [drawn]
                        ├─ WagerRefunded ────────────────────► [refunded]
                        ├─ WagerCancelled ───────────────────► [cancelled]
                        └─ DrawProposed / DrawRevoked ───────► [draw_proposed] ⇄ [active]
```

Only the **value-moving** transitions also create `WagerTransfer` rows (next entity). Status-only
events (`WagerResolved`, `DrawProposed`, `DrawRevoked`, `WagerDeclined`) update `Wager` and emit
no transfer.

## Entity: WagerTransfer (NEW — core entity for the report)

**Immutable** (`@entity(immutable: true)`); one row per value movement. This is the record that
carries the **transaction hash**, removing the report's need to scan chain logs.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `id` | ID! | `txHash.concatI32(logIndex)` | unique even for co-located transfers (FR-009, R6) |
| `wager` | Wager! | the wager's id | relation; powers `transfers` derived field |
| `party` | Bytes! | creator / opponent / winner | the user whose value moved (FR-007) |
| `direction` | TransferDirection! | per handler | `deposit` \| `payout` \| `refund` |
| `token` | Bytes! | `wager.token` (or event) | staked stablecoin |
| `amount` | BigInt! | event or stored stake (R3) | **base units**; never recomputed off-chain (FR-008) |
| `from` | Bytes! | derived (R4) | `party` (deposit) or `event.address` (payout/refund) |
| `to` | Bytes! | derived (R4) | `event.address` (deposit) or `party` (payout/refund) |
| `txHash` | Bytes! | `event.transaction.hash` | **the key addition** (FR-007) |
| `blockNumber` | BigInt! | `event.block.number` | |
| `timestamp` | BigInt! | `event.block.timestamp` | unix seconds; per-transfer time (FR-007) |

### Per-event production rules (FR-006, research R3/R7)

| Event | Rows emitted | party | direction | amount | from → to |
|-------|--------------|-------|-----------|--------|-----------|
| `WagerCreated` | 1 | creator | `deposit` | `creatorStake` (event) | creator → registry |
| `WagerAccepted` | 1 | opponent | `deposit` | `opponentStake` (stored) | opponent → registry |
| `PayoutClaimed` | 1 | winner | `payout` | `amount` (event) | registry → winner |
| `WagerRefunded` | 2 | creator, opponent | `refund` | resp. stake (stored) | registry → party |
| `WagerDrawn` | 2 | creator, opponent | `refund` | resp. stake (stored) | registry → party |
| `WagerCancelled` | 1 | creator | `refund` | `creatorStake` (stored) | registry → creator |
| `WagerResolved` | 0 (status only) | — | — | — | — |
| `WagerDeclined` / `DrawProposed` / `DrawRevoked` | 0 (status only) | — | — | — | — |

**Immutability rationale**: a transfer is a historical fact tied to a confirmed log; it is never
edited (corrections come only from re-indexing the canonical chain after a reorg). Consumers can
therefore rely on the recorded `txHash` (FR-012).

## Indexed access patterns (the queries consumers issue)

- **By party, time-ordered** (the report's enumeration): `wagerTransfers(where: { party: $user }, orderBy: timestamp, orderDirection: asc)` (FR-010, SC-003).
- **By wager**: `wager(id: $id) { transfers { … } }` via `@derivedFrom` (FR-011).
- **My Wagers / site stats**: `wagers(where, orderBy: createdAt|status|resolutionType)` against the v2 `Wager` fields (consumers updated per research R5).

## Field-availability matrix — after this feature (cf. spec 016 data-model)

Spec 016 marked `txHash` and per-transfer `from/to/timestamp` as **not in subgraph**. This
feature flips them; only the network **fee** stays receipt-only.

| Report field | Subgraph (017) | Receipt | Config | Notes |
|--------------|:--------------:|:-------:|:------:|-------|
| timestamp (per transfer) | ✓ | | | `WagerTransfer.timestamp` (was wager-level only) |
| token / amount | ✓ | | | `WagerTransfer.token` / `.amount` |
| **txHash** | ✓ | | | `WagerTransfer.txHash` ← **new; removes log scan** |
| from / to | ✓ | | | `WagerTransfer.from` / `.to` (was "derived") |
| direction | ✓ | | | `WagerTransfer.direction` |
| **fee** | ✗ | ✓ | | **receipt only** — one `getTransactionReceipt(txHash)` per transfer |
| ticker / decimals | | | ✓ | `networks.js` (+ on-chain fallback) — unchanged |
| usdValue / costBasis | | | | computed ($1.00 par) — owned by spec 016 |
```
