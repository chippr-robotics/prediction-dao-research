// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IUniswapV3PoolTickSpacing
/// @notice Minimal view of a Uniswap V3 pool — only `tickSpacing`, used to derive full-range bounds.
/// @dev Read from the pool rather than mapped from the fee tier so a non-standard or future tier
///      cannot silently produce misaligned ticks (`mint` would revert, but late and opaquely).
interface IUniswapV3PoolTickSpacing {
    function tickSpacing() external view returns (int24);
}

/// @title ILiquidityRouter
/// @notice Interface for the per-network liquidity-supply control surface (spec 067). It curates the
///         pools members may supply to — of BOTH kinds — and charges the spec-060
///         `liquidity.deposit` platform fee on Uniswap trading-pool supplies.
///
/// @dev    THE ASYMMETRY, STATED UP FRONT:
///
///         - `TRADING_LP` (Uniswap V3) deposits pass THROUGH this router and ARE fee-charged.
///           `NonfungiblePositionManager.mint` takes a `recipient`, so the router can skim the fee
///           and mint the position NFT straight to the member — atomic and custody-free.
///
///         - `BRIDGE_LP` (Across HubPool) deposits do NOT pass through this router and are FEE-FREE.
///           `addLiquidity` has no recipient parameter, so LP tokens mint to `msg.sender`; any
///           fee-taking wrapper would own the position and the member could never exit it. This is
///           the same ruling spec 066 made for delegated staking: a fee is charged only where it can
///           be charged atomically WITHOUT taking custody (research R3).
///
///         For `BRIDGE_LP` the router is therefore the REGISTRY and the LISTING flag — not the path,
///         and not a contract-enforced killswitch. `pause()` stops Uniswap supplies only. Any admin
///         surface must say so plainly rather than implying a stop it cannot make.
interface ILiquidityRouter {
    enum PoolKind {
        Unlisted, // 0 — an unset entry, so a missing pool is never mistaken for a bridge pool
        BridgeLp, // single asset supplied to Across's HubPool. Direct member call; fee-free.
        TradingLp // asset pair supplied to a Uniswap V3 pool through this router; fee-charged.
    }

    /// @notice One curated pool.
    /// @param token0 `TradingLp`: the pair's token0 (Uniswap sort order). `BridgeLp`: the L1 token.
    /// @param token1 `TradingLp`: the pair's token1. `BridgeLp`: address(0).
    /// @param poolAddress `TradingLp`: the Uniswap V3 pool. `BridgeLp`: the Across HubPool.
    /// @param feeTier Uniswap fee tier (500/3000/10000). 0 for `BridgeLp`.
    /// @param enabled false = RETIRED: closed to new deposits, still listed and still withdrawable.
    /// @param maxDepositPerTx PER-TRANSACTION ceiling (FR-045). 0 = uncapped.
    ///        Named for what it actually enforces: it is NOT a cumulative TVL cap, and calling it
    ///        `depositCap` would imply an aggregate limit this contract does not track.
    struct PoolListing {
        PoolKind kind;
        bool enabled;
        uint24 feeTier;
        address token0;
        address token1;
        address poolAddress;
        uint256 maxDepositPerTx;
    }

    // --- events: config (the on-chain audit history, FR-046) ---
    event PoolListed(
        bytes32 indexed poolId,
        PoolKind indexed kind,
        address indexed poolAddress,
        address token0,
        address token1,
        uint24 feeTier,
        uint256 maxDepositPerTx,
        address actor
    );
    event PoolEnabledChanged(bytes32 indexed poolId, bool enabled, address indexed actor);
    event PoolLimitChanged(bytes32 indexed poolId, uint256 oldMax, uint256 newMax, address indexed actor);
    event PositionManagerUpdated(address oldManager, address newManager, address indexed actor);
    event FeeRouterUpdated(address oldRouter, address newRouter, address indexed actor);
    event SanctionsGuardUpdated(address oldGuard, address newGuard, address indexed actor);

    /// @notice Emitted once per member supply. `owner` is recorded because the position NFT owner is
    ///         the custody-critical value: it must always be the member, never this contract.
    event LiquiditySupplied(
        bytes32 indexed poolId,
        address indexed member,
        uint256 indexed tokenId,
        uint256 amount0,
        uint256 amount1,
        uint256 fee0,
        uint256 fee1,
        address owner
    );

    // --- errors ---
    error ZeroAddress();
    error ZeroAmount();
    error FeeAboveQuoted();
    error ResidualFunds();
    error PoolUnknown();
    error PoolRetired();
    error NotTradingPool();
    error AmountAbovePoolLimit();
    error PositionManagerUnset();
    error MintFailed();

    // --- reads ---
    function feeRouter() external view returns (address);
    function positionManager() external view returns (address);
    function sanctionsGuard() external view returns (address);
    function liquidityDepositServiceId() external view returns (bytes32);
    function getPool(bytes32 poolId) external view returns (PoolListing memory);
    function poolCount() external view returns (uint256);
    function poolAt(uint256 index) external view returns (bytes32);
    function computePoolId(PoolKind kind, address poolAddress, address token0, address token1)
        external
        pure
        returns (bytes32);

    // --- config (LIQUIDITY_ADMIN_ROLE) ---
    //
    // NOTE: there is deliberately NO removePool. Retirement is `setPoolEnabled(poolId, false)`.
    // FR-024 requires a retired pool to stay visible and withdrawable for members holding a position;
    // deleting the listing would erase the metadata the app needs to render and exit that position —
    // hiding a pool while a member's money is inside it is exactly what the requirement forbids.
    function listPool(PoolListing calldata pool) external;
    function setPoolEnabled(bytes32 poolId, bool enabled) external;
    function setPoolLimit(bytes32 poolId, uint256 maxDepositPerTx) external;
    function setPositionManager(address newManager) external;
    function setFeeRouter(address newFeeRouter) external;
    function setSanctionsGuard(address newGuard) external;

    // --- emergency (GUARDIAN_ROLE) ---
    function pause() external;
    function unpause() external;

    // --- member action (TradingLp only) ---
    function mintFullRangeWithFee(
        bytes32 poolId,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline,
        uint16 maxFeeBps
    ) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}
