/**
 * LiquidityRouter ABI subset (spec 067 — per-network liquidity-supply control surface).
 *
 * Covers the reads the Supply area needs (curated pool enumeration, the Uniswap position
 * manager + FeeRouter references, the router's own fee ceiling, pause state, roles), the
 * config setters + pause the AdminPanel Supply tab writes, the single member entrypoint
 * (`mintFullRangeWithFee`), and the events the tab renders as on-chain audit history.
 *
 * THREE SHAPES HERE ARE LOAD-BEARING and must not drift from
 * contracts/liquidity/ILiquidityRouter.sol:
 *
 *   1. The `PoolListing` tuple FIELD ORDER — `kind, enabled, feeTier, token0, token1,
 *      poolAddress, maxDeposit0PerTx, maxDeposit1PerTx`. ethers decodes positionally, so a
 *      reordered tuple silently mis-reads every pool (a retired pool would read as enabled,
 *      a bridge pool as a trading pool).
 *
 *   2. `computePoolId(kind, poolAddress, token0, token1)` — the `kind` leads and is part of
 *      the identity. The interface changed during security review; an id computed without
 *      `kind` addresses nothing on-chain.
 *
 *   3. TWO per-transaction ceilings, not one (`maxDeposit0PerTx` AND `maxDeposit1PerTx`). A
 *      pair's legs routinely differ in decimals (USDC 6, WETH 18), so a single scalar
 *      compared against both is meaningless.
 *
 * There is deliberately NO `removePool` fragment, because the contract has no such function:
 * retirement is `setPoolEnabled(poolId, false)`, and a retired pool stays visible and
 * withdrawable (FR-024).
 *
 * `mintFullRangeWithFee` is the ONLY member entrypoint. Exits are not here and never will
 * be: the member owns the position NFT and calls Uniswap's position manager directly, so no
 * withdrawal can carry a platform fee (FR-030) and no router state can block an exit
 * (FR-021). `BRIDGE_LP` deposits are likewise absent — Across's `addLiquidity` has no
 * recipient parameter, so routing it would make FairWins the owner of a position the member
 * could never exit (research R3). Those are direct member calls and are fee-free.
 *
 * Human-readable fragments, ethers v6.
 */
export const LIQUIDITY_ROUTER_ABI = [
  // --- reads: config ---
  'function feeRouter() view returns (address)',
  'function positionManager() view returns (address)',
  'function sanctionsGuard() view returns (address)',
  'function liquidityDepositServiceId() view returns (bytes32)',
  'function MAX_FEE_BPS() view returns (uint16)',
  // --- reads: curated pools (enumerable — no indexer needed) ---
  'function getPool(bytes32 poolId) view returns (tuple(uint8 kind, bool enabled, uint24 feeTier, address token0, address token1, address poolAddress, uint256 maxDeposit0PerTx, uint256 maxDeposit1PerTx))',
  'function poolCount() view returns (uint256)',
  'function poolAt(uint256 index) view returns (bytes32)',
  'function computePoolId(uint8 kind, address poolAddress, address token0, address token1) pure returns (bytes32)',
  // Full-range bounds straight from the pool's own tick spacing. The app derives these
  // locally too (lib/liquidity/uniswapPositions.js) so a member is never blocked by one RPC;
  // this read is the on-chain cross-check.
  'function fullRangeTicks(address pool) view returns (int24 tickLower, int24 tickUpper)',
  // --- reads: pause + roles ---
  'function paused() view returns (bool)',
  'function LIQUIDITY_ADMIN_ROLE() view returns (bytes32)',
  'function GUARDIAN_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  // --- config setters (LIQUIDITY_ADMIN_ROLE) ---
  'function listPool(tuple(uint8 kind, bool enabled, uint24 feeTier, address token0, address token1, address poolAddress, uint256 maxDeposit0PerTx, uint256 maxDeposit1PerTx) pool)',
  'function setPoolEnabled(bytes32 poolId, bool enabled)',
  'function setPoolLimit(bytes32 poolId, uint256 maxDeposit0PerTx, uint256 maxDeposit1PerTx)',
  'function setPositionManager(address newManager)',
  'function setFeeRouter(address newFeeRouter)',
  'function setSanctionsGuard(address newGuard)',
  // --- emergency pause (GUARDIAN_ROLE) ---
  // Stops NEW Uniswap supplies ONLY. Bridge-pool deposits never touch this contract, so it
  // cannot stop them — an admin surface that implies otherwise is lying (research R3).
  'function pause()',
  'function unpause()',
  // --- role administration (DEFAULT_ADMIN_ROLE) ---
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  // --- member action: fee-and-forward to Uniswap V3, position NFT minted to the member ---
  'function mintFullRangeWithFee(bytes32 poolId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline, uint16 maxFeeBps) returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  // --- events: config + audit history ---
  'event PoolListed(bytes32 indexed poolId, uint8 indexed kind, address indexed poolAddress, address token0, address token1, uint24 feeTier, uint256 maxDeposit0PerTx, uint256 maxDeposit1PerTx, address actor)',
  'event PoolEnabledChanged(bytes32 indexed poolId, bool enabled, address indexed actor)',
  'event PoolLimitChanged(bytes32 indexed poolId, uint256 newMax0, uint256 newMax1, address indexed actor)',
  'event PositionManagerUpdated(address oldManager, address newManager, address indexed actor)',
  'event FeeRouterUpdated(address oldRouter, address newRouter, address indexed actor)',
  'event SanctionsGuardUpdated(address oldGuard, address newGuard, address indexed actor)',
  // --- events: member supplies ---
  // `amount0`/`amount1` are what Uniswap ACTUALLY consumed and `fee0`/`fee1` are charged on
  // those, not on what the member offered — the remainder is refunded whole. `owner` is
  // recorded because the position NFT owner is the custody-critical value.
  'event LiquiditySupplied(bytes32 indexed poolId, address indexed member, uint256 indexed tokenId, uint256 amount0, uint256 amount1, uint256 fee0, uint256 fee1, address owner)',
  // --- events: pause + roles (OZ) ---
  'event Paused(address account)',
  'event Unpaused(address account)',
  'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
  'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
]

export default LIQUIDITY_ROUTER_ABI
