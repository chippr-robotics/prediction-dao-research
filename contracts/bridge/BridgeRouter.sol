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
import {IAcrossSpokePool} from "../interfaces/external/IAcrossSpokePool.sol";
import {IBridgeRouter} from "./IBridgeRouter.sol";

/// @title BridgeRouter
/// @notice Per-network on-chain control surface for the spec-067 cross-chain bridge, and the path a
///         member's bridge takes so the spec-060 `bridge.transfer` platform fee reaches the treasury.
///         It holds the curated route registry (asset + destination chain, with per-transaction
///         limits), the Across SpokePool address, and a per-network emergency pause; and it charges
///         the fee by reading the FeeRouter (the single fee source of truth), skimming to the
///         treasury and forwarding the net to Across atomically.
/// @dev    Value-bearing but TRANSIENT-custody only: the fund-moving entrypoint is `nonReentrant`,
///         follows checks-effects-interactions, resets approvals to 0, and asserts no residual member
///         funds remain (FR-013). Config is gated by LIQUIDITY_ADMIN_ROLE; the emergency pause by
///         GUARDIAN_ROLE. Storage is append-only with a trailing `__gap` for in-place UUPS upgrades.
///
///         ── THE SAFETY PROPERTY THIS CONTRACT EXISTS TO GET RIGHT ─────────────────────────────
///         Across refunds a deposit no relayer fills by `fillDeadline` to the **`depositor` address
///         on the origin chain**. `depositor` is an ordinary parameter, independent of `msg.sender`.
///         This router therefore passes **`msg.sender` — the member** — as `depositor`, never
///         `address(this)`.
///
///         Naming the router would send every unfilled bridge into this contract, which has no
///         per-member accounting and no withdrawal path, permanently stranding funds on the one path
///         that is supposed to be the safety net. The failure is silent: the happy path is unaffected,
///         so it would only surface in production, on the unhappy path, with real money. See
///         `specs/067-bridge-pool-liquidity/research.md` R2 and the merge-blocking fork test T038.
///         ──────────────────────────────────────────────────────────────────────────────────────
///
///         The router is NEVER in the exit path: fills and refunds settle directly to the member, so
///         a pause or upgrade here can never trap an in-flight bridge (FR-043). There is deliberately
///         no rescue/claim function — see IBridgeRouter.
contract BridgeRouter is IBridgeRouter, UUPSManaged, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /// @notice Holders may curate routes, limits, and the protocol/guard addresses (config).
    bytes32 public constant LIQUIDITY_ADMIN_ROLE = keccak256("LIQUIDITY_ADMIN_ROLE");
    /// @notice Holders may pause/unpause NEW bridges on this network (emergency lever).
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /// @notice FeeRouter service id for the bridge fee. Read at submit time for the live rate.
    bytes32 public constant bridgeTransferServiceId = keccak256("bridge.transfer");

    /// @dev Bounds on a route's advisory delivery window: one minute to one day.
    uint32 private constant MIN_FILL_SECONDS = 60;
    uint32 private constant MAX_FILL_SECONDS = 86_400;

    // ---------------------------------------------------------------- storage (append-only)

    /// @notice Reference to the spec-060 FeeRouter (rate + treasury source of truth). Never cached.
    address public feeRouter;
    /// @notice Across SpokePool on this network.
    address public spokePool;
    /// @notice Sanctions/deny-list guard. Zero ⇒ screening disabled (mirrors the platform pattern).
    address public sanctionsGuard;
    /// @notice Curated routes by id, plus their enumerable id set (no indexer needed).
    mapping(bytes32 => Route) private _routes;
    EnumerableSet.Bytes32Set private _routeIds;

    uint256[44] private __gap;

    // ---------------------------------------------------------------- init

    /// @param admin Granted DEFAULT_ADMIN_ROLE + UPGRADER_ROLE (UUPSManaged) and LIQUIDITY_ADMIN_ROLE
    ///        + GUARDIAN_ROLE. A multisig in production.
    /// @param feeRouter_ The spec-060 FeeRouter (must be non-zero — the fee path must never silently
    ///        no-op; an unset router reverts the bridge rather than assuming a zero rate).
    /// @param spokePool_ Across SpokePool on this network (must be non-zero).
    /// @param sanctionsGuard_ Optional; zero disables screening.
    function initialize(
        address admin,
        address feeRouter_,
        address spokePool_,
        address sanctionsGuard_
    ) external initializer {
        if (admin == address(0) || feeRouter_ == address(0) || spokePool_ == address(0)) revert ZeroAddress();
        __UUPSManaged_init(admin);
        __ReentrancyGuard_init();
        __Pausable_init();
        _grantRole(LIQUIDITY_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);

        feeRouter = feeRouter_;
        spokePool = spokePool_;
        sanctionsGuard = sanctionsGuard_;
    }

    // ---------------------------------------------------------------- route id

    /// @notice Deterministic route id. Includes THIS chain so the same (asset, destination) pair on a
    ///         different origin chain is a different id — ids are never portable across deployments.
    function computeRouteId(address inputToken, uint256 destinationChainId) public view returns (bytes32) {
        return keccak256(abi.encode(inputToken, block.chainid, destinationChainId));
    }

    // ---------------------------------------------------------------- config (LIQUIDITY_ADMIN_ROLE)

    /// @notice Create or update a route. Validation runs BEFORE any state change (FR-042).
    function setRoute(Route calldata route) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        if (route.inputToken == address(0) || route.outputToken == address(0)) revert ZeroAddress();
        if (route.destinationChainId == 0 || route.destinationChainId == block.chainid) {
            revert InvalidDestinationChain();
        }
        if (route.expectedFillSeconds < MIN_FILL_SECONDS || route.expectedFillSeconds > MAX_FILL_SECONDS) {
            revert InvalidFillWindow();
        }

        bytes32 routeId = computeRouteId(route.inputToken, route.destinationChainId);
        _routes[routeId] = route;
        _routeIds.add(routeId); // idempotent: re-setting an existing route updates it in place

        emit RouteSet(
            routeId,
            route.inputToken,
            route.destinationChainId,
            route.outputToken,
            route.maxAmount,
            route.expectedFillSeconds,
            route.nativeInput,
            msg.sender
        );
    }

    function setRouteEnabled(bytes32 routeId, bool enabled) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        if (!_routeIds.contains(routeId)) revert RouteUnknown();
        _routes[routeId].enabled = enabled;
        emit RouteEnabledChanged(routeId, enabled, msg.sender);
    }

    function setRouteLimit(bytes32 routeId, uint256 maxAmount) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        if (!_routeIds.contains(routeId)) revert RouteUnknown();
        uint256 old = _routes[routeId].maxAmount;
        _routes[routeId].maxAmount = maxAmount;
        emit RouteLimitChanged(routeId, old, maxAmount, msg.sender);
    }

    /// @notice Remove a route entirely.
    /// @dev Safe here in a way pool removal is NOT on `LiquidityRouter`: a route holds no member
    ///      position. Removing it only stops NEW bridges — in-flight deposits live in the SpokePool
    ///      and settle or refund regardless of this contract's state.
    function removeRoute(bytes32 routeId) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        if (!_routeIds.remove(routeId)) revert RouteUnknown();
        delete _routes[routeId];
        emit RouteRemoved(routeId, msg.sender);
    }

    function setSpokePool(address newSpokePool) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        if (newSpokePool == address(0)) revert ZeroAddress();
        emit SpokePoolUpdated(spokePool, newSpokePool, msg.sender);
        spokePool = newSpokePool;
    }

    function setFeeRouter(address newFeeRouter) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        if (newFeeRouter == address(0)) revert ZeroAddress();
        emit FeeRouterUpdated(feeRouter, newFeeRouter, msg.sender);
        feeRouter = newFeeRouter;
    }

    /// @notice Set or clear (zero) the sanctions guard.
    function setSanctionsGuard(address newGuard) external onlyRole(LIQUIDITY_ADMIN_ROLE) {
        emit SanctionsGuardUpdated(sanctionsGuard, newGuard, msg.sender);
        sanctionsGuard = newGuard;
    }

    // ---------------------------------------------------------------- reads

    function getRoute(bytes32 routeId) external view returns (Route memory) {
        return _routes[routeId];
    }

    function routeCount() external view returns (uint256) {
        return _routeIds.length();
    }

    function routeAt(uint256 index) external view returns (bytes32) {
        return _routeIds.at(index);
    }

    // ---------------------------------------------------------------- emergency pause (GUARDIAN_ROLE)

    /// @dev Pausing blocks NEW bridges only. In-flight deposits are held by the SpokePool and settle
    ///      or refund to the member regardless — a pause can never trap member value (FR-043).
    ///      Deliberately depends on nothing but this contract's own state, so it remains exercisable
    ///      while every optional service (gateway, quoting) is degraded (FR-044).
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(GUARDIAN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------- member action

    /// @notice Bridge `inputAmount` of a route's asset to `recipient` on the route's destination
    ///         chain, net of the platform fee. Atomic and `nonReentrant`.
    /// @param maxFeeBps The rate the member was shown; a live rate above it reverts (FR-028).
    /// @dev Ordering is checks → effects → interactions. No persistent state is written, so the only
    ///      "effect" is the event; funds move strictly in the interactions phase.
    function bridgeWithFee(
        bytes32 routeId,
        uint256 inputAmount,
        uint256 outputAmount,
        address recipient,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityDeadline,
        address exclusiveRelayer,
        uint16 maxFeeBps
    ) external payable nonReentrant whenNotPaused {
        // ---------------- checks ----------------
        Route memory route = _routes[routeId];
        if (route.inputToken == address(0)) revert RouteUnknown();
        if (!route.enabled) revert RouteDisabled();
        if (inputAmount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (route.maxAmount != 0 && inputAmount > route.maxAmount) revert AmountAboveRouteLimit();
        if (fillDeadline <= block.timestamp) revert DeadlineInPast();

        if (route.nativeInput) {
            if (msg.value != inputAmount) revert NativeValueMismatch();
        } else if (msg.value != 0) {
            // An ERC-20 route must not receive native value: it would be unrecoverable here.
            revert UnexpectedNativeValue();
        }

        _screen(msg.sender);

        IFeeRouter router = IFeeRouter(feeRouter);
        (uint256 fee, uint256 net) = router.quoteFee(bridgeTransferServiceId, inputAmount);
        // Consent ceiling. Only bites when a fee is actually charged: a treasury-unset network quotes
        // fee 0, so a zero-fee bridge is never blocked by a stale configured rate (mirrors spec 066).
        if (fee > 0 && router.feeBps(bridgeTransferServiceId) > maxFeeBps) revert FeeAboveQuoted();

        // ---------------- effects ----------------
        // `depositor` is msg.sender — see the contract-level note. Recorded in the event so the
        // property is externally auditable without decoding the SpokePool's own log.
        emit BridgeInitiated(
            routeId,
            msg.sender,
            recipient,
            route.destinationChainId,
            inputAmount,
            fee,
            net,
            msg.sender
        );

        // ---------------- interactions ----------------
        if (route.nativeInput) {
            _bridgeNative(route, inputAmount, net, fee, outputAmount, recipient, router.treasury(), quoteTimestamp, fillDeadline, exclusivityDeadline, exclusiveRelayer);
        } else {
            _bridgeErc20(route, inputAmount, net, fee, outputAmount, recipient, router.treasury(), quoteTimestamp, fillDeadline, exclusivityDeadline, exclusiveRelayer);
        }
    }

    // ---------------------------------------------------------------- internals

    /// @dev Split out to keep `bridgeWithFee` under the stack limit. Both legs assert the router
    ///      retains none of the member's funds afterwards (FR-013).
    function _bridgeErc20(
        Route memory route,
        uint256 inputAmount,
        uint256 net,
        uint256 fee,
        uint256 outputAmount,
        address recipient,
        address treasury,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityDeadline,
        address exclusiveRelayer
    ) private {
        IERC20 token = IERC20(route.inputToken);
        uint256 startBalance = token.balanceOf(address(this));

        token.safeTransferFrom(msg.sender, address(this), inputAmount);
        if (fee > 0) token.safeTransfer(treasury, fee);

        token.forceApprove(spokePool, net);
        _deposit(route, net, outputAmount, recipient, quoteTimestamp, fillDeadline, exclusivityDeadline, exclusiveRelayer, 0);
        token.forceApprove(spokePool, 0);

        if (token.balanceOf(address(this)) != startBalance) revert ResidualFunds();
    }

    function _bridgeNative(
        Route memory route,
        uint256 inputAmount,
        uint256 net,
        uint256 fee,
        uint256 outputAmount,
        address recipient,
        address treasury,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityDeadline,
        address exclusiveRelayer
    ) private {
        // Robust against force-sent ETH: we assert we consume exactly `inputAmount`.
        uint256 startBalance = address(this).balance - inputAmount;

        if (fee > 0) {
            (bool ok, ) = treasury.call{value: fee}("");
            if (!ok) revert ResidualFunds();
        }
        // Across wraps the native value itself when `inputToken` is the wrapped native token.
        _deposit(route, net, outputAmount, recipient, quoteTimestamp, fillDeadline, exclusivityDeadline, exclusiveRelayer, net);

        if (address(this).balance != startBalance) revert ResidualFunds();
    }

    /// @dev The single call site of `depositV3`. `depositor` is `msg.sender` — the member — so an
    ///      expired deposit refunds to THEM on this chain, not into this contract. Changing this
    ///      argument is a fund-stranding bug; see the contract-level note and fork test T038.
    function _deposit(
        Route memory route,
        uint256 net,
        uint256 outputAmount,
        address recipient,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityDeadline,
        address exclusiveRelayer,
        uint256 nativeValue
    ) private {
        IAcrossSpokePool(spokePool).depositV3{value: nativeValue}(
            msg.sender, // depositor — THE MEMBER. Never address(this).
            recipient,
            route.inputToken,
            route.outputToken,
            net,
            outputAmount,
            route.destinationChainId,
            exclusiveRelayer,
            quoteTimestamp,
            fillDeadline,
            exclusivityDeadline,
            ""
        );
    }

    /// @dev Sanctions screen (spec 007 pattern). No-op when unset; otherwise reverts
    ///      ISanctionsGuard.SanctionedAddress. Read-only, during the checks phase — so a wallet
    ///      deny-listed between quote and submission is still refused (FR-032).
    function _screen(address account) private view {
        address guard = sanctionsGuard;
        if (guard != address(0)) ISanctionsGuard(guard).checkBlocked(account);
    }
}
