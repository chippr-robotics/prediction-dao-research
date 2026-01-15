/**
 * TreasuryVault ABI
 *
 * Secure vault contract for managing DAO treasury funds with:
 * - Authorized spender management
 * - Transaction limits per token
 * - Rate limits per time period
 * - Emergency pause capability
 * - Nullifier integration
 */

export const TREASURY_VAULT_ABI = [
  // Read functions
  "function owner() external view returns (address)",
  "function paused() external view returns (bool)",
  "function guardian() external view returns (address)",
  "function authorizedSpenders(address) external view returns (bool)",
  "function transactionLimit(address token) external view returns (uint256)",
  "function rateLimitPeriod(address token) external view returns (uint256)",
  "function periodLimit(address token) external view returns (uint256)",
  "function periodStart(address token) external view returns (uint256)",
  "function periodSpent(address token) external view returns (uint256)",
  "function nullifierRegistry() external view returns (address)",
  "function enforceNullificationOnWithdrawals() external view returns (bool)",
  "function getETHBalance() external view returns (uint256)",
  "function getTokenBalance(address token) external view returns (uint256)",
  "function isAuthorizedSpender(address spender) external view returns (bool)",
  "function getRemainingPeriodAllowance(address token) external view returns (uint256)",
  "function isRecipientNullified(address recipient) external view returns (bool)",

  // Write functions - Admin
  "function authorizeSpender(address spender) external",
  "function revokeSpender(address spender) external",
  "function setTransactionLimit(address token, uint256 limit) external",
  "function setRateLimit(address token, uint256 period, uint256 limit) external",
  "function updateGuardian(address newGuardian) external",
  "function setNullifierRegistry(address _nullifierRegistry) external",
  "function setNullificationEnforcement(bool _enforce) external",

  // Write functions - Emergency
  "function pause() external",
  "function unpause() external",

  // Write functions - Deposits
  "function depositETH() external payable",
  "function depositERC20(address token, uint256 amount) external",

  // Write functions - Withdrawals
  "function withdrawETH(address payable to, uint256 amount) external",
  "function withdrawERC20(address token, address to, uint256 amount) external",

  // Events
  "event Deposit(address indexed token, address indexed from, uint256 amount)",
  "event Withdrawal(address indexed token, address indexed to, uint256 amount, address indexed authorizedBy)",
  "event SpenderAuthorized(address indexed spender)",
  "event SpenderRevoked(address indexed spender)",
  "event TransactionLimitUpdated(address indexed token, uint256 limit)",
  "event RateLimitUpdated(address indexed token, uint256 period, uint256 limit)",
  "event EmergencyPause(address indexed by)",
  "event EmergencyUnpause(address indexed by)",
  "event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian)",
  "event NullifierRegistryUpdated(address indexed nullifierRegistry)",
  "event NullificationEnforcementUpdated(bool enforce)",
  "event WithdrawalBlockedByNullification(address indexed recipient, address indexed token, uint256 amount)"
]

export default TREASURY_VAULT_ABI
