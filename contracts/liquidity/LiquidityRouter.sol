// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import {IFeeRouter} from "../fees/IFeeRouter.sol";
import {ISanctionsGuard} from "../interfaces/ISanctionsGuard.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";
import {ILiquidityRouter, IUniswapV3PoolTickSpacing} from "./ILiquidityRouter.sol";

/// @title LiquidityRouter
/// @notice Per-network control surface for spec-067 liquidity supply. It curates the pools members
///         may supply to — Uniswap V3 trading pools AND Across bridge pools — and is the
///         fee-charging path for Uniswap supplies only.
/// @dev    Value-bearing but TRANSIENT-custody only: the fund-moving entrypoint is `nonReentrant`,
///         resets approvals to 0, refunds every unspent wei to the member, and asserts no residual
///         member funds remain (FR-023). Storage is append-only with a trailing `__gap`.
///
///         ── WHAT THIS CONTRACT DELIBERATELY DOES NOT DO ───────────────────────────────────────
///         1. It is never in an EXIT path. `TradingLp` members own the position NFT and call the
///            position manager directly; `BridgeLp` members own the LP tokens and call Across's
///            HubPool directly. So a pause, a misconfiguration, or an upgrade can never block a
///            member from getting out (FR-021/FR-024/FR-043), and no withdrawal can ever carry a
///            platform fee (FR-030) — there is no code path that could charge one.
///
///         2. It does not touch `BRIDGE_LP` deposits. Across's `addLiquidity` has no recipient
///            parameter, so LP tokens mint to `msg.sender`; wrapping it would make this contract the
///            owner of a position the member could never exit. Those deposits are direct and
///            fee-free, and `pause()` therefore stops Uniswap supplies ONLY (research R3).
///
///         3. It has no `removePool`. Retirement is `setPoolEnabled(false)` — a retired pool must
///            stay visible and withdrawable (FR-024).
///         ──────────────────────────────────────────────────────────────────────────────────────
contract LiquidityRouter is ILiquidityRouter, UUPSManaged, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 public constant LIQUIDITY_ADMIN_ROLE = keccak256("LIQUIDITY_ADMIN_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /// @notice FeeRouter service id for the liquidity fee. Read at supply time for the live rate.
    bytes32 public constant liquidityDepositServiceId = keccak256("liquidity.deposit");

    /// @dev Uniswap V3's absolute tick bounds. Full range is these, aligned to the pool's spacing.
    int24 private constant MIN_TICK = -887272;
    int24 private constant MAX_TICK = 887272;

    // ---------------------------------------------------------------- storage (append-only)

    address public feeRouter;
    address public positionManager;
    address public sanctionsGuard;
    mapping(bytes32 => PoolListing) private _pools;
    EnumerableSet.Bytes32Set private _poolIds;

    uint256[44] private __gap;

    // ---------------------------------------------------------------- init

    /// @param positionManager_ Uniswap V3 NonfungiblePositionManager FOR THIS NETWORK. May be zero on
    ///        a network without Uniswap (bridge pools can still be curated); `mintFullRangeWithFee`
    ///        then reverts `PositionManagerUnset` rather than failing opaquely.
    /// @dev ⚠️ This address is NOT the same on every chain — Base's differs from the set Ethereum,
    ///      Polygon, Arbitrum and Optimism share. Always take it from this chain's own deployment
    ///      record (research R4b); `scripts/ops/verify-protocol-addresses.js` gates that.
    function initialize(
        address admin,
        address feeRouter_,
        address positionManager_,
        address sanctionsGuard_
    ) external initializer {
        if (admin == address(0) || feeRouter_ == address(0)) revert ZeroAddress();
        __UUPSManaged_init(admin);
        __ReentrancyGuard_init();
        __Pausable_init();
        _grantRole(LIQUIDITY_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);

        feeRouter = feeRouter_;
        positionManager = positionManager_;
        sanctionsGuard = sanctionsGuard_;
    }

    // ---------------------------------------------------------------- pool id

    function computePoolId(PoolKind kind, address poolAddress, address token0, address token1)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(kind, poolAddress, token0, token1));
    }

    // ---------------------------------------------------------------- config (LIQUIDITY_ADMIN_ROLE)

    function listPool(PoolListing calldata pool) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        if (pool.kind == PoolKind.Unlisted) revert PoolUnknown();
        if (pool.poolAddress == address(0) || pool.token0 == address(0)) revert ZeroAddress();
        // A trading pool needs both legs and a real fee tier; a bridge pool has exactly one asset.
        if (pool.kind == PoolKind.TradingLp) {
            if (pool.token1 == address(0) || pool.feeTier == 0) revert ZeroAddress();
        } else if (pool.token1 != address(0)) {
            revert ZeroAddress();
        }

        bytes32 poolId = computePoolId(pool.kind, pool.poolAddress, pool.token0, pool.token1);
        _pools[poolId] = pool;
        _poolIds.add(poolId); // idempotent: re-listing updates in place

        emit PoolListed(
            poolId,
            pool.kind,
            pool.poolAddress,
            pool.token0,
            pool.token1,
            pool.feeTier,
            pool.maxDepositPerTx,
            msg.sender
        );
    }

    /// @notice Retire (false) or re-open (true) a pool. Retiring closes it to NEW deposits only —
    ///         existing positions stay listed and exitable (FR-024).
    function setPoolEnabled(bytes32 poolId, bool enabled) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        if (!_poolIds.contains(poolId)) revert PoolUnknown();
        _pools[poolId].enabled = enabled;
        emit PoolEnabledChanged(poolId, enabled, msg.sender);
    }

    function setPoolLimit(bytes32 poolId, uint256 maxDepositPerTx) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        if (!_poolIds.contains(poolId)) revert PoolUnknown();
        uint256 old = _pools[poolId].maxDepositPerTx;
        _pools[poolId].maxDepositPerTx = maxDepositPerTx;
        emit PoolLimitChanged(poolId, old, maxDepositPerTx, msg.sender);
    }

    function setPositionManager(address newManager) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        emit PositionManagerUpdated(positionManager, newManager, msg.sender);
        positionManager = newManager;
    }

    function setFeeRouter(address newFeeRouter) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        if (newFeeRouter == address(0)) revert ZeroAddress();
        emit FeeRouterUpdated(feeRouter, newFeeRouter, msg.sender);
        feeRouter = newFeeRouter;
    }

    function setSanctionsGuard(address newGuard) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        emit SanctionsGuardUpdated(sanctionsGuard, newGuard, msg.sender);
        sanctionsGuard = newGuard;
    }

    // ---------------------------------------------------------------- reads

    function getPool(bytes32 poolId) external view returns (PoolListing memory) {
        return _pools[poolId];
    }

    function poolCount() external view returns (uint256) {
        return _poolIds.length();
    }

    function poolAt(uint256 index) external view returns (bytes32) {
        return _poolIds.at(index);
    }

    /// @notice Full-range tick bounds for a pool, aligned to its own tick spacing.
    /// @dev Solidity integer division truncates toward zero, which is ceil for the negative bound and
    ///      floor for the positive one — exactly the alignment Uniswap requires.
    function fullRangeTicks(address pool) public view returns (int24 tickLower, int24 tickUpper) {
        int24 spacing = IUniswapV3PoolTickSpacing(pool).tickSpacing();
        tickLower = (MIN_TICK / spacing) * spacing;
        tickUpper = (MAX_TICK / spacing) * spacing;
    }

    // ---------------------------------------------------------------- emergency pause

    /// @dev Stops NEW Uniswap supplies only. `BridgeLp` deposits bypass this contract entirely, so
    ///      the contract cannot stop them — only the `enabled` flag (honoured by the app) withholds
    ///      those. Admin surfaces MUST label this control accordingly (research R3).
    ///      Depends on nothing but this contract's own state, so it stays exercisable while every
    ///      optional service is degraded (FR-044).
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(GUARDIAN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------- member action

    /// @notice Supply a token pair to a curated Uniswap V3 pool as a FULL-RANGE position, net of the
    ///         platform fee. The position NFT is minted directly to the caller.
    /// @param maxFeeBps The rate the member was shown; a live rate above it reverts (FR-028).
    /// @return tokenId The position NFT id, owned by the member.
    function mintFullRangeWithFee(
        bytes32 poolId,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline,
        uint16 maxFeeBps
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        // ---------------- checks ----------------
        PoolListing memory pool = _pools[poolId];
        if (pool.kind == PoolKind.Unlisted) revert PoolUnknown();
        // A bridge pool is curated here but is NOT routable — its deposit path is a direct member
        // call to Across (research R3). Rejecting explicitly beats failing opaquely downstream.
        if (pool.kind != PoolKind.TradingLp) revert NotTradingPool();
        if (!pool.enabled) revert PoolRetired();
        if (amount0Desired == 0 && amount1Desired == 0) revert ZeroAmount();
        if (pool.maxDepositPerTx != 0) {
            if (amount0Desired > pool.maxDepositPerTx || amount1Desired > pool.maxDepositPerTx) {
                revert AmountAbovePoolLimit();
            }
        }
        address nfpm = positionManager;
        if (nfpm == address(0)) revert PositionManagerUnset();

        _screen(msg.sender);

        IFeeRouter router = IFeeRouter(feeRouter);
        (uint256 fee0, uint256 net0) = router.quoteFee(liquidityDepositServiceId, amount0Desired);
        (uint256 fee1, uint256 net1) = router.quoteFee(liquidityDepositServiceId, amount1Desired);
        if ((fee0 > 0 || fee1 > 0) && router.feeBps(liquidityDepositServiceId) > maxFeeBps) {
            revert FeeAboveQuoted();
        }

        // ---------------- interactions ----------------
        (tokenId, liquidity, amount0, amount1) = _supply(
            pool,
            nfpm,
            router.treasury(),
            [amount0Desired, amount1Desired, net0, net1, fee0, fee1, amount0Min, amount1Min],
            deadline
        );

        emit LiquiditySupplied(poolId, msg.sender, tokenId, amount0, amount1, fee0, fee1, msg.sender);
    }

    // ---------------------------------------------------------------- internals

    /// @dev Split out to stay under the stack limit. `a` packs the amounts:
    ///      [0]=gross0 [1]=gross1 [2]=net0 [3]=net1 [4]=fee0 [5]=fee1 [6]=min0 [7]=min1.
    function _supply(
        PoolListing memory pool,
        address nfpm,
        address treasury,
        uint256[8] memory a,
        uint256 deadline
    ) private returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        IERC20 t0 = IERC20(pool.token0);
        IERC20 t1 = IERC20(pool.token1);
        uint256 start0 = t0.balanceOf(address(this));
        uint256 start1 = t1.balanceOf(address(this));

        if (a[0] > 0) t0.safeTransferFrom(msg.sender, address(this), a[0]);
        if (a[1] > 0) t1.safeTransferFrom(msg.sender, address(this), a[1]);
        if (a[4] > 0) t0.safeTransfer(treasury, a[4]);
        if (a[5] > 0) t1.safeTransfer(treasury, a[5]);

        (int24 tickLower, int24 tickUpper) = fullRangeTicks(pool.poolAddress);

        t0.forceApprove(nfpm, a[2]);
        t1.forceApprove(nfpm, a[3]);

        (tokenId, liquidity, amount0, amount1) = INonfungiblePositionManager(nfpm).mint(
            INonfungiblePositionManager.MintParams({
                token0: pool.token0,
                token1: pool.token1,
                fee: pool.feeTier,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: a[2],
                amount1Desired: a[3],
                amount0Min: a[6],
                amount1Min: a[7],
                // THE MEMBER owns the position. Never address(this) — a router-owned NFT would make
                // this custodial and leave the member unable to decreaseLiquidity/collect.
                recipient: msg.sender,
                deadline: deadline
            })
        );
        if (liquidity == 0) revert MintFailed();

        // Uniswap rarely consumes both desired amounts exactly. Return every unspent wei to the
        // member and zero the approvals, so the router keeps nothing (FR-023).
        t0.forceApprove(nfpm, 0);
        t1.forceApprove(nfpm, 0);
        if (a[2] > amount0) t0.safeTransfer(msg.sender, a[2] - amount0);
        if (a[3] > amount1) t1.safeTransfer(msg.sender, a[3] - amount1);

        if (t0.balanceOf(address(this)) != start0 || t1.balanceOf(address(this)) != start1) {
            revert ResidualFunds();
        }
    }

    function _screen(address account) private view {
        address guard = sanctionsGuard;
        if (guard != address(0)) ISanctionsGuard(guard).checkBlocked(account);
    }
}
