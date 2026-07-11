/**
 * Minimal ERC-4626 vault ABI for the Earn section (spec 050). Covers the reads
 * and actions the lending flow needs against Morpho Vault V1 (MetaMorpho)
 * vaults — which implement the standard faithfully, including working
 * maxDeposit/maxWithdraw. Human-readable fragments, ethers v6.
 */
export const ERC4626_VAULT_ABI = [
  // Identity / underlying
  'function asset() view returns (address)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  // Share accounting
  'function balanceOf(address account) view returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
  // Quotes + honest limits
  'function previewDeposit(uint256 assets) view returns (uint256)',
  'function previewWithdraw(uint256 assets) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
  'function maxDeposit(address receiver) view returns (uint256)',
  'function maxWithdraw(address owner) view returns (uint256)',
  // Actions
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
]

export default ERC4626_VAULT_ABI
