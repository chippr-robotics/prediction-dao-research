/**
 * BridgeRouter ABI subset (spec 067 — per-network cross-chain bridge control surface
 * + fee-and-forward router).
 *
 * Covers the reads the Bridge surface needs (curated route enumeration, the Across
 * SpokePool + FeeRouter references, the fee cap, pause state, roles), the config
 * setters + pause the AdminPanel Bridge tab writes, the single member entrypoint
 * (`bridgeWithFee`), and the events the tab renders as on-chain audit history.
 *
 * Two shapes here are load-bearing and must not drift from
 * contracts/bridge/BridgeRouter.sol:
 *   - the `Route` tuple FIELD ORDER (packed as `inputToken, enabled, nativeInput,
 *     expectedFillSeconds, outputToken, destinationChainId, maxAmount`) — ethers
 *     decodes positionally, so a reordered tuple silently mis-reads every route;
 *   - `computeRouteId(inputToken, outputToken, destinationChainId)` — `outputToken`
 *     is part of the route identity (it was added during review precisely so a
 *     re-`setRoute` with a different delivered asset cannot overwrite a route in
 *     place).
 *
 * Human-readable fragments, ethers v6.
 */
export const BRIDGE_ROUTER_ABI = [
  // --- reads: config ---
  'function feeRouter() view returns (address)',
  'function spokePool() view returns (address)',
  'function sanctionsGuard() view returns (address)',
  'function bridgeTransferServiceId() view returns (bytes32)',
  'function MAX_FEE_BPS() view returns (uint16)',
  // --- reads: curated routes (enumerable — no indexer needed) ---
  'function getRoute(bytes32 routeId) view returns (tuple(address inputToken, bool enabled, bool nativeInput, uint32 expectedFillSeconds, address outputToken, uint256 destinationChainId, uint256 maxAmount))',
  'function routeCount() view returns (uint256)',
  'function routeAt(uint256 index) view returns (bytes32)',
  'function computeRouteId(address inputToken, address outputToken, uint256 destinationChainId) view returns (bytes32)',
  // --- reads: pause + roles ---
  'function paused() view returns (bool)',
  'function LIQUIDITY_ADMIN_ROLE() view returns (bytes32)',
  'function GUARDIAN_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  // --- config setters (LIQUIDITY_ADMIN_ROLE) ---
  'function setRoute(tuple(address inputToken, bool enabled, bool nativeInput, uint32 expectedFillSeconds, address outputToken, uint256 destinationChainId, uint256 maxAmount) route)',
  'function setRouteEnabled(bytes32 routeId, bool enabled)',
  'function setRouteLimit(bytes32 routeId, uint256 maxAmount)',
  'function removeRoute(bytes32 routeId)',
  'function setSpokePool(address newSpokePool)',
  'function setFeeRouter(address newFeeRouter)',
  'function setSanctionsGuard(address newGuard)',
  // --- emergency pause (GUARDIAN_ROLE) ---
  'function pause()',
  'function unpause()',
  // --- role administration (DEFAULT_ADMIN_ROLE) ---
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  // --- member action: fee-and-forward to Across ---
  'function bridgeWithFee(bytes32 routeId, uint256 inputAmount, uint256 outputAmount, address recipient, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, address exclusiveRelayer, uint16 maxFeeBps) payable',
  // --- events: config + audit history ---
  'event RouteSet(bytes32 indexed routeId, address indexed inputToken, uint256 indexed destinationChainId, address outputToken, uint256 maxAmount, uint32 expectedFillSeconds, bool nativeInput, address actor)',
  'event RouteEnabledChanged(bytes32 indexed routeId, bool enabled, address indexed actor)',
  'event RouteLimitChanged(bytes32 indexed routeId, uint256 oldMax, uint256 newMax, address indexed actor)',
  'event RouteRemoved(bytes32 indexed routeId, address indexed actor)',
  'event SpokePoolUpdated(address oldSpokePool, address newSpokePool, address indexed actor)',
  'event FeeRouterUpdated(address oldRouter, address newRouter, address indexed actor)',
  'event SanctionsGuardUpdated(address oldGuard, address newGuard, address indexed actor)',
  // --- events: member bridges (`depositor` is recorded so the refund address is auditable) ---
  'event BridgeInitiated(bytes32 indexed routeId, address indexed member, address indexed recipient, uint256 destinationChainId, uint256 grossAmount, uint256 feeAmount, uint256 netAmount, address depositor)',
  // --- events: pause + roles (OZ) ---
  'event Paused(address account)',
  'event Unpaused(address account)',
  'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
  'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
]

export default BRIDGE_ROUTER_ABI
