// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IBridgeRouter
/// @notice Interface for the per-network cross-chain bridge control surface + fee-and-forward router
///         (spec 067). It governs which routes are offered (asset + destination chain), their
///         per-transaction limits, the Across SpokePool address, and a per-network emergency pause;
///         and it charges the spec-060 `bridge.transfer` platform fee by reading the FeeRouter rate,
///         skimming to the treasury, and forwarding the net to Across atomically.
/// @dev    The router is NEVER in the exit path. Across fills and refunds settle directly to the
///         member, so a pause, misconfiguration, or upgrade here cannot affect an already-submitted
///         bridge (FR-043). There is deliberately no "rescue" or "claim refund" function: adding one
///         would imply an operator can reach a member's in-flight transfer, which is untrue.
interface IBridgeRouter {
    /// @notice A curated bridge route: one asset, from THIS chain, to one destination chain.
    /// @param inputToken Asset pulled on this chain. For a native route this is the WRAPPED native
    ///        token address Across expects (Across wraps the `msg.value` itself) — see `nativeInput`.
    /// @param outputToken Asset delivered on `destinationChainId`. Recorded for member disclosure;
    ///        the destination-side guarantee is Across's, not this contract's.
    /// @param destinationChainId Target EVM chain. Never this chain, never 0.
    /// @param maxAmount Per-transaction ceiling (FR-045). 0 = uncapped.
    /// @param expectedFillSeconds Expected delivery window, drives the member-facing
    ///        requires-attention threshold (FR-011). Advisory: not enforced on-chain.
    /// @param enabled Operator toggle (FR-041). Disabled ⇒ submission refuses.
    /// @param nativeInput True when the member pays in the chain's NATIVE coin (`msg.value`) rather
    ///        than an ERC-20. Explicit rather than inferred: inferring from `msg.value > 0` would make
    ///        a wrapped-token route and a native route indistinguishable.
    struct Route {
        address inputToken;
        bool enabled;
        bool nativeInput;
        uint32 expectedFillSeconds;
        address outputToken;
        uint256 destinationChainId;
        uint256 maxAmount;
    }

    // --- events: config (each mutation emits one — the on-chain audit history, FR-046) ---
    event RouteSet(
        bytes32 indexed routeId,
        address indexed inputToken,
        uint256 indexed destinationChainId,
        address outputToken,
        uint256 maxAmount,
        uint32 expectedFillSeconds,
        bool nativeInput,
        address actor
    );
    event RouteEnabledChanged(bytes32 indexed routeId, bool enabled, address indexed actor);
    event RouteLimitChanged(bytes32 indexed routeId, uint256 oldMax, uint256 newMax, address indexed actor);
    event RouteRemoved(bytes32 indexed routeId, address indexed actor);
    event SpokePoolUpdated(address oldSpokePool, address newSpokePool, address indexed actor);
    event FeeRouterUpdated(address oldRouter, address newRouter, address indexed actor);
    event SanctionsGuardUpdated(address oldGuard, address newGuard, address indexed actor);

    /// @notice Emitted once per member bridge. `depositor` is recorded explicitly because it is the
    ///         origin-chain refund address and the single most safety-critical value in the call — an
    ///         indexer or auditor must be able to confirm it was the member, not this contract.
    event BridgeInitiated(
        bytes32 indexed routeId,
        address indexed member,
        address indexed recipient,
        uint256 destinationChainId,
        uint256 grossAmount,
        uint256 feeAmount,
        uint256 netAmount,
        address depositor
    );

    // --- errors ---
    error ZeroAddress();
    error ZeroAmount();
    error FeeAboveQuoted();
    error ResidualFunds();
    error RouteUnknown();
    error RouteDisabled();
    error RouteAlreadyListed();
    error AmountAboveRouteLimit();
    error InvalidDestinationChain();
    error InvalidFillWindow();
    error DeadlineInPast();
    error NativeValueMismatch();
    error UnexpectedNativeValue();

    // --- reads ---
    function feeRouter() external view returns (address);
    function spokePool() external view returns (address);
    function sanctionsGuard() external view returns (address);
    function bridgeTransferServiceId() external view returns (bytes32);
    function getRoute(bytes32 routeId) external view returns (Route memory);
    function routeCount() external view returns (uint256);
    function routeAt(uint256 index) external view returns (bytes32);
    function computeRouteId(address inputToken, uint256 destinationChainId) external view returns (bytes32);

    // --- config (LIQUIDITY_ADMIN_ROLE) ---
    function setRoute(Route calldata route) external;
    function setRouteEnabled(bytes32 routeId, bool enabled) external;
    function setRouteLimit(bytes32 routeId, uint256 maxAmount) external;
    function removeRoute(bytes32 routeId) external;
    function setSpokePool(address newSpokePool) external;
    function setFeeRouter(address newFeeRouter) external;
    function setSanctionsGuard(address newGuard) external;

    // --- emergency (GUARDIAN_ROLE) ---
    function pause() external;
    function unpause() external;

    // --- member action ---
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
    ) external payable;
}
