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
///            stay visible and withdrawable (FR-024).///
///         NON-STANDARD TOKENS: as with BridgeRouter, the paired residual checks make this fail
///         CLOSED. A fee-on-transfer or rebasing leg leaves the contract's balance different from
///         `start0`/`start1` and reverts `ResidualFunds` rather than stranding dust or short-changing
///         the position. Such tokens are not curatable as trading pools.
///         ──────────────────────────────────────────────────────────────────────────────────────
contract LiquidityRouter is ILiquidityRouter, UUPSManaged, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    bytes32 public constant LIQUIDITY_ADMIN_ROLE = keccak256("LIQUIDITY_ADMIN_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /// @notice FeeRouter service id for the liquidity fee. Read at supply time for the live rate.
    bytes32 public constant liquidityDepositServiceId = keccak256("liquidity.deposit");

    /// @notice Hard ceiling this router will charge, whatever the FeeRouter reports.
    /// @dev FeeRouter enforces its own MAX_WRAPPED_FEE_BPS only for `Wrapped` services, and these are
    ///      registered `ConfigOnly` (so that FeeRouter.depositToVaultWithFee cannot be pointed at
    ///      them). Enforcing the 250 bps cap here as well makes it a property of the charging contract
    ///      rather than of a registration argument, and bounds the damage if `feeRouter` is ever
    ///      repointed at a hostile implementation.
    uint16 public constant MAX_FEE_BPS = 250;

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
        // These are shape errors, not zero-address errors — reverting ZeroAddress for a missing fee
        // tier told the operator to check an address that was perfectly fine.
        if (pool.kind == PoolKind.TradingLp) {
            if (pool.token1 == address(0) || pool.feeTier == 0) revert InvalidPoolListing();
            // Cross-check the listing against the pool it actually names. Without this, listing a
            // 0.3% pool's address with feeTier 500 was ACCEPTED and the mint then SUCCEEDED against a
            // DIFFERENT pool than the one curated — reproduced on a Polygon fork during adversarial
            // review. The listing metadata is what the member is shown, so it has to be true.
            IUniswapV3PoolTickSpacing p = IUniswapV3PoolTickSpacing(pool.poolAddress);
            if (p.token0() != pool.token0 || p.token1() != pool.token1 || p.fee() != pool.feeTier) {
                revert PoolListingMismatch();
            }
        } else if (pool.token1 != address(0) || pool.feeTier != 0) {
            revert InvalidPoolListing();
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
            pool.maxDeposit0PerTx,
            pool.maxDeposit1PerTx,
            pool.enabled,
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

    function setPoolLimit(bytes32 poolId, uint256 maxDeposit0PerTx, uint256 maxDeposit1PerTx)
        external
        onlyRole(LIQUIDITY_ADMIN_ROLE)
    {
        if (!_poolIds.contains(poolId)) revert PoolUnknown();
        _pools[poolId].maxDeposit0PerTx = maxDeposit0PerTx;
        _pools[poolId].maxDeposit1PerTx = maxDeposit1PerTx;
        emit PoolLimitChanged(poolId, maxDeposit0PerTx, maxDeposit1PerTx, msg.sender);
    }

    // ------------------------------------------- protocol wiring (DEFAULT_ADMIN_ROLE)
    //
    // These three are NOT curation, and deliberately sit a role above it.
    //
    // `positionManager` is approved and mints the member's position; `feeRouter` names both the rate
    // and the `treasury()` the fee is transferred to; `sanctionsGuard` is the compliance gate. Whoever
    // can write them can redirect where member funds go, so they are DEFAULT_ADMIN_ROLE while
    // LIQUIDITY_ADMIN_ROLE stays what its name says — which pools are curated, at what ceiling.
    // Curating a pool badly is recoverable by retiring it; pointing the router at a hostile contract
    // is not. The amount-bound in `_supply` is the second half of this: even an admin cannot configure
    // a FeeRouter that takes more than MAX_FEE_BPS of a member's capital.

    /// @dev Zero is rejected: an unset manager is reached through `PositionManagerUnset` on the supply
    ///      path, so there is no reason to allow writing the router into that state deliberately.
    function setPositionManager(address newManager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newManager == address(0)) revert ZeroAddress();
        emit PositionManagerUpdated(positionManager, newManager, msg.sender);
        positionManager = newManager;
    }

    function setFeeRouter(address newFeeRouter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFeeRouter == address(0)) revert ZeroAddress();
        emit FeeRouterUpdated(feeRouter, newFeeRouter, msg.sender);
        feeRouter = newFeeRouter;
    }

    function setSanctionsGuard(address newGuard) external onlyRole(DEFAULT_ADMIN_ROLE) {
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
        if (pool.maxDeposit0PerTx != 0 && amount0Desired > pool.maxDeposit0PerTx) {
            revert AmountAbovePoolLimit();
        }
        if (pool.maxDeposit1PerTx != 0 && amount1Desired > pool.maxDeposit1PerTx) {
            revert AmountAbovePoolLimit();
        }
        address nfpm = positionManager;
        if (nfpm == address(0)) revert PositionManagerUnset();

        _screen(msg.sender);

        IFeeRouter router = IFeeRouter(feeRouter);
        (uint256 quoted0, uint256 net0) = router.quoteFee(liquidityDepositServiceId, amount0Desired);
        (uint256 quoted1, uint256 net1) = router.quoteFee(liquidityDepositServiceId, amount1Desired);
        // Consent ceiling on the RATE, checked before any funds move. The amounts the fee is finally
        // charged on are settled after the mint (see _supply), but always at this same rate.
        uint16 liveBps = router.feeBps(liquidityDepositServiceId);
        if (liveBps > MAX_FEE_BPS) revert FeeAboveCap();
        if ((quoted0 > 0 || quoted1 > 0) && liveBps > maxFeeBps) revert FeeAboveQuoted();
        // Exact-split, checked before any funds move: `net0`/`net1` are what get approved to the
        // position manager, so a FeeRouter that under-reports them would shrink the member's position
        // by the difference. See the amount-bound in `_supply` for the other half of not trusting the
        // configured FeeRouter's account of itself.
        if (quoted0 + net0 != amount0Desired || quoted1 + net1 != amount1Desired) {
            revert FeeSplitMismatch();
        }

        // ---------------- interactions ----------------
        uint256 fee0;
        uint256 fee1;
        (tokenId, liquidity, amount0, amount1, fee0, fee1) = _supply(
            pool,
            nfpm,
            router.treasury(),
            [amount0Desired, amount1Desired, net0, net1, amount0Min, amount1Min],
            deadline
        );

        emit LiquiditySupplied(poolId, msg.sender, tokenId, amount0, amount1, fee0, fee1, msg.sender);
    }

    // ---------------------------------------------------------------- internals

    /// @dev Split out to stay under the stack limit. `a` packs the amounts:
    ///      [0]=gross0 [1]=gross1 [2]=net0 [3]=net1 [4]=min0 [5]=min1.
    ///
    /// @dev THE FEE IS CHARGED ON WHAT UNISWAP ACTUALLY CONSUMED, NOT ON WHAT WAS OFFERED.
    ///
    ///      An earlier version skimmed the fee from the member's GROSS desired amounts BEFORE the
    ///      mint. Uniswap almost never consumes both legs exactly — it takes whatever the current
    ///      price ratio needs and leaves the rest — so the member was charged a fee on capital that
    ///      was then handed straight back to them, unsupplied. Adversarial review reproduced this on
    ///      a live fork; four independent reviewers found it.
    ///
    ///      So the fee now lands after the mint, quoted against `amount0`/`amount1` — the amounts
    ///      that actually became the position. The member pays the disclosed rate on the capital
    ///      they actually deployed and nothing on the remainder, which is refunded whole. Quoting
    ///      through the same `quoteFee` keeps the rate identical to the one the consent ceiling was
    ///      checked against earlier in this same transaction.
    function _supply(
        PoolListing memory pool,
        address nfpm,
        address treasury,
        uint256[6] memory a,
        uint256 deadline
    )
        private
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1, uint256 fee0, uint256 fee1)
    {
        IERC20 t0 = IERC20(pool.token0);
        IERC20 t1 = IERC20(pool.token1);
        uint256 start0 = t0.balanceOf(address(this));
        uint256 start1 = t1.balanceOf(address(this));

        if (a[0] > 0) t0.safeTransferFrom(msg.sender, address(this), a[0]);
        if (a[1] > 0) t1.safeTransferFrom(msg.sender, address(this), a[1]);

        (int24 tickLower, int24 tickUpper) = fullRangeTicks(pool.poolAddress);

        // Approve only the NET so the position is sized to what the member was shown, and the fee
        // can never be silently deployed as liquidity.
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
                amount0Min: a[4],
                amount1Min: a[5],
                // THE MEMBER owns the position. Never address(this) — a router-owned NFT would make
                // this custodial and leave the member unable to decreaseLiquidity/collect.
                recipient: msg.sender,
                deadline: deadline
            })
        );
        if (liquidity == 0) revert MintFailed();

        t0.forceApprove(nfpm, 0);
        t1.forceApprove(nfpm, 0);

        // Fee on capital actually deployed.
        IFeeRouter router = IFeeRouter(feeRouter);
        (fee0, ) = router.quoteFee(liquidityDepositServiceId, amount0);
        (fee1, ) = router.quoteFee(liquidityDepositServiceId, amount1);
        // THE CAP BINDS THE FEE ACTUALLY TAKEN, NOT ONLY THE RATE THE ROUTER REPORTS ABOUT ITSELF.
        // The ceiling checked before the mint reads `feeBps()`, which is the FeeRouter's own claim. A
        // FeeRouter reporting feeBps() = 0 while quoteFee() hands back most of the amount passes that
        // check, and these two transfers would then send the member's capital to its treasury. This
        // re-quote is also the one the member never consented to directly — it happens after the mint,
        // against amounts nobody knew in advance — so it is bounded here on the amounts themselves.
        if (
            fee0 > (amount0 * MAX_FEE_BPS) / 10_000 || fee1 > (amount1 * MAX_FEE_BPS) / 10_000
        ) revert FeeAboveCap();
        if (fee0 > 0) t0.safeTransfer(treasury, fee0);
        if (fee1 > 0) t1.safeTransfer(treasury, fee1);

        // Everything the position did not take and the fee did not claim goes back, whole.
        uint256 back0 = a[0] - amount0 - fee0;
        uint256 back1 = a[1] - amount1 - fee1;
        if (back0 > 0) t0.safeTransfer(msg.sender, back0);
        if (back1 > 0) t1.safeTransfer(msg.sender, back1);

        if (t0.balanceOf(address(this)) != start0 || t1.balanceOf(address(this)) != start1) {
            revert ResidualFunds();
        }
    }

    function _screen(address account) private view {
        address guard = sanctionsGuard;
        if (guard != address(0)) ISanctionsGuard(guard).checkBlocked(account);
    }
}
