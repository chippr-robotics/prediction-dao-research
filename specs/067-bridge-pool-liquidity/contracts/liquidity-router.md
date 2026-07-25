# Contract: `LiquidityRouter` (spec 067)

**Path**: `contracts/liquidity/LiquidityRouter.sol` · **Pattern**: UUPS proxy via `UUPSManaged`

Deployed to all five mainnet networks. Two jobs: (1) the fee-charging path for **Uniswap V3
full-range** supplies, and (2) the per-network registry and killswitch for **both** curated pool kinds — including the Across bridge pools whose
deposits do *not* pass through it.

---

## The asymmetry, stated up front

| Pool kind | Deposit path | Platform fee | Why |
|---|---|---|---|
| `TRADING_LP` (Uniswap V3) | Through this router | **Charged** (`liquidity.deposit`) | `NonfungiblePositionManager.mint` takes a `recipient` — the position NFT goes straight to the member, so the fee is atomic and custody-free. |
| `BRIDGE_LP` (Across HubPool) | **Direct member call**, router not involved | **Fee-free in v1** | `addLiquidity(address,uint256)` has **no recipient parameter** — LP tokens mint to `msg.sender`. A wrapper would own the position and the member could never `removeLiquidity`. |

This mirrors spec 066's ruling on delegated staking: a fee is charged only where it can be charged
atomically **without taking custody**. See [research.md](../research.md) R3.

Consequence the Supply admin tab must state honestly: for `BRIDGE_LP`, `enabled = false` is respected by the
**app**, not enforced by a contract. It is a listing flag, not a chain-level stop. Do not present it as
an on-chain killswitch.

---

## Roles

| Role | Grants |
|---|---|
| `LIQUIDITY_ADMIN_ROLE` | Supply list add/update/retire, caps, `positionManager` / `feeRouter` addresses. |
| `GUARDIAN_ROLE` | `pause()` / `unpause()`. |
| `UPGRADER_ROLE` | Inherited. |

Fee rates are read from `FeeRouter` (`FEE_ADMIN_ROLE` owns them elsewhere) — FR-049.

---

## The value path (Uniswap only)

```solidity
function mintFullRangeWithFee(
    bytes32 poolId,
    uint256 amount0Desired,
    uint256 amount1Desired,
    uint256 amount0Min,
    uint256 amount1Min,
    uint256 deadline,
    uint16  maxFeeBps
) external payable nonReentrant whenNotPaused
  returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
```

### Ordering

1. **Checks** — pool exists, `kind == TRADING_LP`, `enabled`; cap not exceeded; sanctions guard passes;
   `positionManager != address(0)`.
2. **Fee read** — `quoteFee(LIQUIDITY_DEPOSIT_SERVICE_ID, amountN)` **per token**; revert
   `FeeAboveQuoted` if `bps > maxFeeBps`.
3. **Effects** — emit `LiquiditySupplied`.
4. **Interactions** — pull both tokens; send both fee legs to `feeRouter.treasury()`; approve NFPM for
   the net; `mint` with **`recipient = msg.sender`**; refund any unspent remainder to the member and
   zero the approvals.

### Full-range ticks

```
tickLower = ceil(-887272 / tickSpacing) * tickSpacing
tickUpper = floor( 887272 / tickSpacing) * tickSpacing
```

Computed from the pool's own `tickSpacing` (500 → 10, 3000 → 60, 10000 → 200). There is no member-facing
range control, no out-of-range state, and no rebalancing — spec FR-016.

### Post-conditions asserted in tests

- Router token balances are zero for both tokens after every call.
- The position NFT is owned by the **member**, never the router.
- Unspent `amountNDesired - amountNActual` is returned to the member (Uniswap rarely consumes both
  amounts exactly).
- Approvals to the NFPM are left at zero.

---

## Registry surface

```solidity
function listPool(bytes32 poolId, PoolListing calldata p) external onlyRole(LIQUIDITY_ADMIN_ROLE);
function setPoolEnabled(bytes32 poolId, bool enabled)     external onlyRole(LIQUIDITY_ADMIN_ROLE);
function setPoolCap(bytes32 poolId, uint256 cap)          external onlyRole(LIQUIDITY_ADMIN_ROLE);
function setPositionManager(address nfpm)                 external onlyRole(LIQUIDITY_ADMIN_ROLE);
function setFeeRouter(address newFeeRouter)               external onlyRole(LIQUIDITY_ADMIN_ROLE);
function pause() / unpause()                              external onlyRole(GUARDIAN_ROLE);

function getPool(bytes32 poolId) external view returns (PoolListing memory);
function poolCount() external view returns (uint256);
function poolAt(uint256 i) external view returns (bytes32);
```

**There is no `removePool`.** Retirement is `setPoolEnabled(poolId, false)`. FR-024 requires a retired
pool to stay visible and withdrawable for members holding a position, and deleting the listing would
erase the metadata the app needs to render and exit that position — hiding a pool while a member's money
is inside it is exactly what the requirement forbids.

---

## Withdrawals and claims are not here

Exits go **direct**, always:

- `TRADING_LP`: the member owns the NFT and calls `decreaseLiquidity` / `collect` on the NFPM.
- `BRIDGE_LP`: the member owns the LP tokens and calls `HubPool.removeLiquidity`.

No exit passes through this router, so a pause, a misconfiguration, or an upgrade can never block a
member from getting out (FR-021, FR-024, FR-043), and no withdrawal can ever carry a platform fee
(FR-030) because there is no code path that could charge one.

---

## Storage layout

Append-only, trailing `uint256[50] __gap`, covered by `npm run check:storage-layout`. Ordering:
`positionManager`, `feeRouter`, `paused`, `_pools` mapping, `_poolIds` set, `__gap`.

---

## Test plan

**Unit** (`test/liquidity/LiquidityRouter.test.js`): role gating; `mintFullRangeWithFee` rejects a
`BRIDGE_LP` poolId; retired pool rejects new supply; cap enforcement; `FeeAboveQuoted`; zero fee ⇒ no
treasury transfer and identical behavior (FR-029); pause blocks supply only; no `removePool` exists.

**Fork** (`test/fork/liquidityRouter.fork.test.js`) — against real Uniswap V3 on Polygon:

1. Full-range mint on a live pool; assert both fee legs at treasury, **NFT owned by the member**, router
   balances zero, approvals zeroed.
2. Tick bounds correct for each of the three fee tiers.
2a. Run the mint case on **each** of the five networks — in particular Base, whose Uniswap addresses
   differ from the canonical set (research R4b); a copied address would revert or hit a foreign contract.
3. Unspent-amount refund returns to the member.
4. Member exits directly via `decreaseLiquidity` + `collect` **without touching the router**, including
   while the router is paused and while the pool is retired.
5. Across `HubPool.addLiquidity` / `removeLiquidity` round trip from the member's own address, asserting
   LP tokens land on the member and the router is never an intermediary.

**Static/fuzz**: Slither and Medusa; no new high/critical findings.
