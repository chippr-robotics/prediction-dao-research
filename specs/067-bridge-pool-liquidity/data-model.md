# Phase 1 Data Model: Cross-Chain Bridge & Pool Liquidity (spec 067)

Entities are grouped by where they live: **on-chain** (router state, the operator source of truth),
**client** (the activity ledger and in-flight tracking), and **derived** (assembled at read time for
display). Nothing here duplicates the `FeeRouter` — rates are always read through it (FR-027).

---

## 1. On-chain — `BridgeRouter` (per network)

### `Route`

The operator-curated unit of bridge availability. Keyed by `routeId = keccak256(abi.encode(inputToken,
originChainId, destinationChainId))`.

| Field | Type | Notes |
|---|---|---|
| `inputToken` | `address` | Asset on this (origin) network. `address(0)` = native. |
| `destinationChainId` | `uint256` | Target EVM chain. Bitcoin ids can never appear (non-numeric; FR-006). |
| `outputToken` | `address` | Expected asset on the destination — recorded for disclosure, not enforced here. |
| `enabled` | `bool` | FR-041 toggle. Disabled ⇒ quoting and submission both refuse. |
| `maxAmount` | `uint256` | Per-transaction ceiling (FR-045). `0` = no explicit cap. |
| `expectedFillSeconds` | `uint32` | Drives the requires-attention threshold (FR-011). |

Stored as `mapping(bytes32 => Route)` plus an `EnumerableSet.Bytes32Set` of ids so the admin tab and the
member app can enumerate without an indexer.

**Validation**: `destinationChainId != block.chainid` and `!= 0`; `inputToken` must be a contract or
`address(0)`; `expectedFillSeconds` within `[60, 86400]`. Invalid input reverts before state change
(FR-042).

### Router-level state

| Field | Type | Notes |
|---|---|---|
| `spokePool` | `address` | Across SpokePool on this network. Operator-updatable (FR-042). |
| `feeRouter` | `address` | Spec-060 `FeeRouter`. Rate + treasury read at call time, never cached. |
| `paused` | `bool` | `GUARDIAN_ROLE` killswitch (FR-043). Blocks new bridges only. |

**Invariant (safety-critical)**: the router holds no token balance between transactions. Any
`inputToken` balance at the end of `bridgeWithFee` is a bug — asserted in tests.

### Events (the FR-046 audit trail)

`RouteSet`, `RouteRemoved`, `RouteEnabledChanged`, `RouteLimitChanged`, `SpokePoolChanged`,
`FeeRouterChanged`, `Paused`, `Unpaused`, `BridgeInitiated(member, routeId, inputAmount, feeAmount, depositId)`.

Each carries the acting operator (`msg.sender`) and, where applicable, before/after values.

---

## 2. On-chain — `LiquidityRouter` (per network)

### `PoolListing`

One curated pool, of either kind. Keyed by `poolId = keccak256(abi.encode(kind, primaryAddress, token0, token1))`.

| Field | Type | Notes |
|---|---|---|
| `kind` | `enum {BRIDGE_LP, TRADING_LP}` | Drives the disclosure shown (FR-018 vs FR-019) and the call path. |
| `token0` / `token1` | `address` | `TRADING_LP`: the pair, sorted. `BRIDGE_LP`: `token0` = the L1 token, `token1` = `address(0)`. |
| `poolAddress` | `address` | `TRADING_LP`: the Uniswap V3 pool. `BRIDGE_LP`: the Across HubPool. |
| `feeTier` | `uint24` | Uniswap fee tier (500/3000/10000). `0` for `BRIDGE_LP`. |
| `enabled` | `bool` | `false` = **retired**: no new deposits, still listed and withdrawable (FR-024). |
| `depositCap` | `uint256` | Per-pool cap (FR-045). `0` = uncapped. |

**Retirement is not deletion.** `PoolListing` entries are never removed from the set once a member could
have deposited — FR-024 requires a retired pool to remain visible and withdrawable. `enabled = false` is
the only retirement mechanism.

### Router-level state

| Field | Type | Notes |
|---|---|---|
| `positionManager` | `address` | Uniswap V3 NFPM. `address(0)` on networks without Uniswap. |
| `feeRouter` | `address` | Spec-060 `FeeRouter`. |
| `paused` | `bool` | Guardian killswitch. Blocks new `TRADING_LP` deposits. |

**Note on scope of the pause**: `BRIDGE_LP` deposits do not pass through this router (they call Across
`HubPool.addLiquidity` directly — research R3), so the on-chain pause cannot block them at the contract
level. The `enabled` flag is what the member app honors for those, and the admin tab must say so
plainly rather than implying a contract-enforced stop. This is an honest-capability boundary, not a gap
to hide.

### Events

`PoolListed`, `PoolUpdated`, `PoolRetired`, `PoolCapChanged`, `PositionManagerChanged`,
`FeeRouterChanged`, `Paused`, `Unpaused`, `LiquiditySupplied(member, poolId, amount0, amount1, feeAmount0, feeAmount1, tokenId)`.

---

## 3. Client — activity ledger entries

Extends `frontend/src/data/ledger/constants.js` additively. No existing entry is reclassified.

```js
LEDGER_CLASS.BRIDGE    = 'bridge'      // NEW
LEDGER_CLASS.LIQUIDITY = 'liquidity'   // NEW — distinct from LEDGER_CLASS.POOL ('pool' = wager pools)
```

### `BridgeEntry` — one entry per bridge, not two (FR-035)

| Field | Notes |
|---|---|
| `entryId` | `clientEntryId('bridge:<originChainId>:<depositId>')` — stable and idempotent across reconciliations. |
| `class` | `'bridge'` |
| `kind` | `'bridge_transfer'` |
| `chainId` | **Origin** chain (the entry's home network). |
| `destinationChainId` | Extra field — the second network the single entry references. |
| `direction` | `'none'` — a member moving their own assets between networks is **not** income and **not** a disposal (FR-036). Only the fee is a cost. |
| `status` | `PENDING` → `SETTLED` (delivered) \| `CANCELLED` (refunded) \| `FAILED` (source tx reverted). |
| `srcTxHash` / `dstTxHash` | Both surfaced; `dstTxHash` is what promotes the entry out of `PENDING` (FR-009). |
| `feeAmountRaw` | The FairWins platform fee actually charged — the only value reported as a cost. |
| `bridgeState` | UI-level detail beyond ledger status: `submitted` \| `source_confirmed` \| `in_flight` \| `delivered` \| `refunded` \| `needs_attention`. |
| `expectedBy` | Timestamp after which `in_flight` becomes `needs_attention` (FR-011). |
| `provenance` | `CLIENT` at capture, carrying real tx hashes; both hashes are chain-verifiable. |

**State machine** (FR-009 — `delivered` is reachable only from destination-side evidence):

```
submitted ──src mined──> source_confirmed ──indexed──> in_flight ──dst fill──> delivered   (SETTLED)
    │                                                       │
    │ src revert                                            ├── expiry refund ──> refunded (CANCELLED)
    └──────────> FAILED                                     └── past expectedBy ─> needs_attention
                                                                                   (still PENDING)
```

`needs_attention` is **not terminal** — it can still resolve to `delivered` or `refunded`. Nothing but a
confirmed destination fill may set `delivered`.

### `LiquidityEntry`

| Field | Notes |
|---|---|
| `entryId` | `clientEntryId('liquidity:<chainId>:<action>:<txHash>')` |
| `class` | `'liquidity'` |
| `kind` | `'lp_supply'` \| `'lp_withdraw'` \| `'lp_fees_claim'` |
| `direction` | `out` / `in` / `in` respectively |
| `poolId` / `poolKind` | Links back to the `PoolListing`; `poolKind` distinguishes the two disclosures. |
| `tokenId` | Uniswap position NFT id (`TRADING_LP` only). |
| `feeAmountRaw` | Zero for `BRIDGE_LP` (fee-free — research R3) and for every withdrawal (FR-030). |

---

## 4. Notification domains

Extends `data/notifications/domains.js` and `lib/notifications/deliveryPreferences.js`:

```js
// domains.js — DOMAIN_META
bridge:    { label: 'Bridge' },        // NEW
liquidity: { label: 'Liquidity' },     // NEW
pools:     { label: 'Wager Pool' },    // CHANGED from 'Pool' — research R6
```

```js
// deliveryPreferences.js — NOTIFICATION_CATEGORIES (appended; new domains default to delivered, FR-038)
{ domain: 'bridge',    label: 'Bridge',    description: 'Cross-chain transfers delivered, refunded, or needing attention' },
{ domain: 'liquidity', label: 'Liquidity', description: 'Pools closed to deposits and positions affected by protocol events' },
```

The `pools` label change is the one edit to an existing surface. It makes the wager-pool feed tag
accurate on its own terms and is what keeps FR-039 true in the activity feed, where the collision would
otherwise be invisible until a member had both kinds of activity.

---

## 5. Derived — read-time view models (not persisted)

### `BridgeQuote`

Assembled from the gateway's Across `suggested-fees` response plus a live `FeeRouter` read. Never
cached across the validity window.

| Field | Notes |
|---|---|
| `inputAmount` / `outputAmount` | The spread is Across's LP + relayer fee. |
| `lines[]` | Itemized for FR-007: `{ label, amountRaw, tokenSymbol }` — bridge protocol fee, destination delivery cost, FairWins platform fee. |
| `platformFeeBps` | Live rate; passed back as `maxFeeBps` on submit (FR-028). |
| `expiresAt` | Staleness boundary (FR-008). Past it, the confirm control is disabled until refreshed. |
| `estimatedFillSeconds` | From the route's `expectedFillSeconds` and the quote. |
| `destinationGasWarning` | Set when the member's destination-chain native balance is zero (FR-012). |

### `PoolOption` / `LiquidityPosition`

`PoolOption` merges the on-chain `PoolListing` with live protocol reads (estimated return, total
supplied) and carries `available: boolean` plus an `unavailableReason` so the UI can render the honest
state rather than hiding the card. `LiquidityPosition` carries `currentValue`, `earningsToDate`,
`composition` (`TRADING_LP` only), and `isEstimate: true` — every value on both is labelled an estimate
sourced from the underlying protocol, never a guarantee (spec Assumptions).

---

## 6. Config additions

`frontend/src/config/contracts.js` — two address keys per network, empty until synced:
`bridgeRouter`, `liquidityRouter` (plus `bridgeRouterImpl`, `liquidityRouterImpl` in `deployments/`).

`frontend/src/config/networks.js` — a per-network `bridge` block (`{ spokePool, hubPool | null }`) used
only as the build-time fallback for display; the authoritative values are read from the router at
runtime (FR-051). Polygon's existing `dex` block is reused unchanged for Uniswap.

**Boundary guard**: every entry point into bridge and liquidity code paths asserts a numeric chain id
via the existing `isBitcoinNetworkId` check, so Bitcoin string ids can never reach
`getContractAddressForChain` or wagmi (spec 061 rule, FR-006).
