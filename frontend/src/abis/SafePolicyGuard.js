// Spec 049 — SafePolicyGuard (multisig policy engine) + PolicyGuardSetup ABIs.
// Human-readable fragments curated from contracts/custody/SafePolicyGuard.sol and
// PolicyGuardSetup.sol; includes every custom error so violation revert data decodes to a
// typed rule (FR-011) in frontend/src/lib/custody/policy.js.

export const SAFE_POLICY_GUARD_ABI = [
  // guard hooks (present for completeness; the app never calls these directly)
  'function checkTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures, address msgSender)',
  'function checkAfterExecution(bytes32 txHash, bool success)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',

  // configuration (called by the vault itself as a threshold-approved self-transaction)
  'function configureRules((address asset, uint128 perTxLimit, uint128 windowLimit)[] limits, uint32 cooldown, bool allowlistEnabled, address[] allowlistAdd, address[] allowlistRemove)',

  // views
  'function WINDOW() view returns (uint256)',
  'function MAX_COOLDOWN() view returns (uint32)',
  'function MAX_ASSETS() view returns (uint256)',
  'function MAX_ALLOWLIST_BATCH() view returns (uint256)',
  'function getPolicy(address safe) view returns (bool hasRules, bool allowlistEnabled, uint32 allowlistCount, uint32 cooldown, uint64 lastCountedTxAt, address[] configuredAssets)',
  'function getAssetRule(address safe, address asset) view returns (uint128 perTxLimit, uint128 windowLimit, uint128 spentInWindow, uint64 windowStart)',
  'function getAllowlist(address safe) view returns (address[])',
  'function isAllowlisted(address safe, address who) view returns (bool)',
  'function remainingInWindow(address safe, address asset) view returns (uint256)',
  'function nextAllowedAt(address safe) view returns (uint64)',
  'function previewTransaction(address safe, address to, uint256 value, bytes data, uint8 operation) view returns (bool ok, bytes revertData)',

  // events (notification feed, FR-016)
  'event RulesConfigured(address indexed safe, address indexed asset, uint128 perTxLimit, uint128 windowLimit)',
  'event CooldownSet(address indexed safe, uint32 cooldown)',
  'event AllowlistEnabled(address indexed safe, bool enabled)',
  'event AllowlistChanged(address indexed safe, address indexed entry, bool allowed)',

  // typed rule errors (FR-011 — decoded by decodePolicyError)
  'error DelegatecallBlocked()',
  'error GasRefundBlocked()',
  'error RecipientNotAllowed(address recipient)',
  'error CooldownActive(uint64 nextAllowedAt)',
  'error PerTxLimitExceeded(address asset, uint256 amount, uint256 limit)',
  'error WindowLimitExceeded(address asset, uint256 attempted, uint256 remaining)',
  'error ValueToGuardBlocked()',
  'error EmptyAllowlist()',
  'error CooldownTooLong()',
  'error TooManyAssets()',
  'error AllowlistBatchTooLarge()',
]

export const POLICY_GUARD_SETUP_ABI = [
  'function enablePolicy(address guard, bytes configureCalldata)',
  'event ChangedGuard(address indexed guard)',
  'error ZeroGuard()',
  'error NotAGuard()',
]
