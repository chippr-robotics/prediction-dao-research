/**
 * FeeRouter ABI subset (spec 060 — unified platform-fee registry + atomic fee wrapper).
 * Covers the reads the member surfaces and Fees admin tab need, the admin setters the
 * Fees tab writes, the wrapped-deposit action the Earn flow routes through when a
 * lending fee is configured, and the events the tab renders as change history.
 * Human-readable fragments, ethers v6.
 */
export const FEE_ROUTER_ABI = [
  // Reads
  'function treasury() view returns (address)',
  'function MAX_WRAPPED_FEE_BPS() view returns (uint16)',
  'function FEE_ADMIN_ROLE() view returns (bytes32)',
  'function getService(bytes32 serviceId) view returns (tuple(uint16 capBps, uint16 feeBps, uint8 kind))',
  'function feeBps(bytes32 serviceId) view returns (uint16)',
  'function serviceCount() view returns (uint256)',
  'function serviceAt(uint256 index) view returns (bytes32)',
  'function quoteFee(bytes32 serviceId, uint256 grossAmount) view returns (uint256 feeAmount, uint256 netAmount)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  // Admin
  'function registerService(bytes32 serviceId, uint16 capBps, uint8 kind)',
  'function setTreasury(address newTreasury)',
  'function setFeeBps(bytes32 serviceId, uint16 newBps)',
  // Member action (atomic fee + ERC-4626 deposit)
  'function depositToVaultWithFee(bytes32 serviceId, address vault, uint256 assets, address receiver, uint16 maxFeeBps) returns (uint256 shares)',
  // Events (change history + reconciliation)
  'event ServiceRegistered(bytes32 indexed serviceId, uint16 capBps, uint8 kind)',
  'event FeeBpsChanged(bytes32 indexed serviceId, uint16 oldBps, uint16 newBps, address indexed actor)',
  'event TreasuryChanged(address oldTreasury, address newTreasury, address indexed actor)',
  'event FeeCharged(bytes32 indexed serviceId, address indexed payer, address indexed asset, uint256 grossAmount, uint256 feeAmount, address vault, address receiver)',
  'event FeeSkippedNoTreasury(bytes32 indexed serviceId, address indexed payer, uint256 grossAmount)',
]

export default FEE_ROUTER_ABI
