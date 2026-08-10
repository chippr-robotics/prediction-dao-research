# Contract: `BridgeRouter` (spec 067)

**Path**: `contracts/bridge/BridgeRouter.sol` · **Pattern**: UUPS proxy via `UUPSManaged`
**Precedent**: `contracts/staking/StakingRouter.sol` (spec 066) — same shape, 252 lines.

The per-network control surface for Transfer → Bridge, and the path a member's bridge takes so the
`bridge.transfer` platform fee reaches the treasury atomically. Deployed to all five mainnet networks
(Ethereum, Polygon, Arbitrum, Base, Optimism), giving 20 directed routes per asset.

---

## Roles

| Role | Grants |
|---|---|
| `LIQUIDITY_ADMIN_ROLE` | Route add/update/remove, limits, `spokePool` and `feeRouter` addresses. |
| `GUARDIAN_ROLE` | `pause()` / `unpause()` only. |
| `UPGRADER_ROLE` | Inherited from `UUPSManaged`. |

Fee **rates** are not settable here — they live in the spec-060 `FeeRouter` under `FEE_ADMIN_ROLE`
(FR-049). This contract only reads them.

---

## The value path

```solidity
function bridgeWithFee(
    bytes32 routeId,
    uint256 inputAmount,
    uint256 outputAmount,
    address recipient,          // destination-chain recipient (usually the member)
    uint32  quoteTimestamp,
    uint32  fillDeadline,
    uint32  exclusivityDeadline,
    address exclusiveRelayer,
    uint16  maxFeeBps           // member consent ceiling (FR-028)
) external payable nonReentrant whenNotPaused;
```

### Ordering (checks-effects-interactions)

1. **Checks** — route exists and `enabled`; `inputAmount <= route.maxAmount` when capped; `recipient != 0`;
   sanctions guard passes for `msg.sender`; `fillDeadline` in the future.
2. **Fee read** — `feeRouter.quoteFee(BRIDGE_TRANSFER_SERVICE_ID, inputAmount)` → `(feeAmount, bps)`.
   Revert `FeeAboveQuoted(bps, maxFeeBps)` if `bps > maxFeeBps`.
3. **Effects** — emit `BridgeInitiated`. No persistent balance state is written; the router holds nothing.
4. **Interactions** — pull `inputAmount` from `msg.sender`; transfer `feeAmount` to `feeRouter.treasury()`;
   approve the SpokePool for `inputAmount - feeAmount`; call `depositV3`.

### The `depositor` invariant — the single most important line in this contract

```solidity
ISpokePool(spokePool).depositV3(
    msg.sender,                   // depositor  <-- THE MEMBER, never address(this)
    recipient,                    // destination-chain recipient
    route.inputToken,
    route.outputToken,
    inputAmount - feeAmount,
    outputAmount,
    route.destinationChainId,
    exclusiveRelayer,
    quoteTimestamp,
    fillDeadline,
    exclusivityDeadline,
    ""                            // no cross-chain message in v1
);
```

Across refunds an unfilled deposit **to `depositor` on the origin chain**, roughly 90 minutes past
`fillDeadline`. Naming the router as `depositor` would send every refund into this contract, which has
no per-member accounting and no withdrawal path — permanently stranding member funds on the one path
that is *supposed* to be the safety net.

`depositor` is independent of `msg.sender` in Across V3 (this is what makes Across's own SwapAndBridge
periphery contract work), so the router can supply the tokens while the member stays the refund
recipient.

**Post-conditions asserted in tests**:

- `IERC20(inputToken).balanceOf(address(this)) == 0` after every call.
- Allowance to `spokePool` is left at zero (approve exactly, or reset after).
- The emitted `FundsDeposited` event carries `depositor == member`.

---

## Configuration surface

```solidity
function setRoute(bytes32 routeId, Route calldata r)        external onlyRole(LIQUIDITY_ADMIN_ROLE);
function setRouteEnabled(bytes32 routeId, bool enabled)     external onlyRole(LIQUIDITY_ADMIN_ROLE);
function setRouteLimit(bytes32 routeId, uint256 maxAmount)  external onlyRole(LIQUIDITY_ADMIN_ROLE);
function removeRoute(bytes32 routeId)                       external onlyRole(LIQUIDITY_ADMIN_ROLE);
function setSpokePool(address newSpokePool)                 external onlyRole(LIQUIDITY_ADMIN_ROLE);
function setFeeRouter(address newFeeRouter)                 external onlyRole(LIQUIDITY_ADMIN_ROLE);
function pause()   external onlyRole(GUARDIAN_ROLE);
function unpause() external onlyRole(GUARDIAN_ROLE);

// Reads — used by both the member app and the admin tab
function getRoute(bytes32 routeId) external view returns (Route memory);
function routeCount() external view returns (uint256);
function routeAt(uint256 i) external view returns (bytes32);
function paused() external view returns (bool);
```

`removeRoute` is safe in a way `LiquidityRouter`'s pool removal is not: a route holds no member
position. Removing it stops new bridges; in-flight deposits live in the SpokePool and settle or refund
regardless of this contract's state (FR-043 — a pause can never trap value).

---

## What this contract deliberately does NOT do

- **It is not in the exit path.** There is no "claim refund" or "finish bridge" function. Across handles
  fills and refunds directly to the member. A router upgrade, pause, or misconfiguration cannot affect
  an already-submitted bridge.
- **It does not quote.** Relayer-fee pricing comes from Across's API through the gateway; the contract
  only enforces the fee ceiling the member consented to.
- **It does not store fee rates.** Every call reads `FeeRouter` live (FR-027).
- **It never sees a Bitcoin network.** Bitcoin ids are non-numeric and are filtered client-side; a
  `destinationChainId` of 0 is rejected on write.

---

## Storage layout

Append-only with a trailing `uint256[50] __gap`, registered with `npm run check:storage-layout` (CI
gating). Ordering: `spokePool`, `feeRouter`, `paused`, `_routes` mapping, `_routeIds` set, `__gap`.

---

## Test plan

**Unit** (`test/bridge/BridgeRouter.test.js`): role gating on every setter; route validation rejects
`destinationChainId == block.chainid` / `0`; `maxAmount` enforcement; `FeeAboveQuoted` revert; zero fee
produces no treasury transfer and byte-identical downstream behavior (FR-029); pause blocks
`bridgeWithFee` and nothing else; reentrancy guard.

**Fork** (`test/fork/bridgeRouter.fork.test.js`) — against real Across contracts:

1. Happy path: Polygon → Ethereum USDC bridge; assert fee at treasury, net deposited, router balance
   zero. Repeat across a representative sample of the five-network mesh, including an L2 → L2 route
   (Base → Arbitrum) that never touches L1 from the member's perspective.
2. **Expiry refund (MANDATORY, blocks merge)**: submit with a near `fillDeadline`, let it expire, and
   assert the refund lands on the **member's** address and **not** the router's. This is the only test
   that can catch the `depositor` bug class; the happy path passes either way.
3. Fee-rate change between quote and submit → `FeeAboveQuoted` reverts, member loses nothing.
4. Native-asset route via `msg.value`.

**Static/fuzz**: Slither and Medusa on the contract; no new high/critical findings.
