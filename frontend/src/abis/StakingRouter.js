/**
 * StakingRouter ABI subset (spec 066 — staking control surface + liquid fee router).
 *
 * Covers the reads the member app + AdminPanel Staking tab need (provider addresses,
 * validator allowlist enumeration, pause state, roles), the config setters + pause the
 * tab writes, the two LIQUID fee-and-forward stake entrypoints the member flow routes
 * through when a fee applies, and the events the tab renders as on-chain audit history.
 * Delegated staking is fee-free in v1 and stays a direct `ValidatorShare` call — it is
 * intentionally NOT an entrypoint here.
 *
 * Kept byte-compatible with contracts/staking/StakingRouter.sol. Human-readable
 * fragments, ethers v6.
 */
export const STAKING_ROUTER_ABI = [
  // --- reads: config ---
  'function feeRouter() view returns (address)',
  'function lidoSteth() view returns (address)',
  'function lidoWsteth() view returns (address)',
  'function spolController() view returns (address)',
  'function spolToken() view returns (address)',
  'function polToken() view returns (address)',
  'function polygonStakeManager() view returns (address)',
  'function stakeLidoServiceId() view returns (bytes32)',
  'function stakeSpolServiceId() view returns (bytes32)',
  // --- reads: validator allowlist ---
  'function validatorCount() view returns (uint256)',
  'function validatorAt(uint256 index) view returns (address)',
  'function isValidator(address validatorShare) view returns (bool)',
  // --- reads: pause + roles ---
  'function paused() view returns (bool)',
  'function STAKING_ADMIN_ROLE() view returns (bytes32)',
  'function GUARDIAN_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  // --- config setters (STAKING_ADMIN_ROLE) ---
  'function setFeeRouter(address newFeeRouter)',
  'function setLidoContracts(address steth, address wsteth)',
  'function setSpolContracts(address controller, address token)',
  'function setPolygonContracts(address polToken, address stakeManager)',
  'function addValidator(address validatorShare)',
  'function removeValidator(address validatorShare)',
  // --- emergency pause (GUARDIAN_ROLE) ---
  'function pause()',
  'function unpause()',
  // --- role administration (DEFAULT_ADMIN_ROLE) ---
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  // --- member actions: LIQUID fee-and-forward ---
  'function stakeLido(uint16 maxFeeBps) payable returns (uint256 wstOut)',
  'function stakeSpol(uint256 amount, uint16 maxFeeBps) returns (uint256 spolOut)',
  // --- events: config + audit history ---
  'event FeeRouterUpdated(address oldRouter, address newRouter, address indexed actor)',
  'event LidoContractsUpdated(address steth, address wsteth, address indexed actor)',
  'event SpolContractsUpdated(address controller, address token, address indexed actor)',
  'event PolygonContractsUpdated(address polToken, address stakeManager, address indexed actor)',
  'event ValidatorAdded(address indexed validatorShare, address indexed actor)',
  'event ValidatorRemoved(address indexed validatorShare, address indexed actor)',
  'event LiquidStaked(address indexed provider, address indexed member, uint256 gross, uint256 fee, uint256 net, uint256 lstOut)',
  // --- events: pause + roles (OZ) ---
  'event Paused(address account)',
  'event Unpaused(address account)',
  'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
  'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
]

export default STAKING_ROUTER_ABI
