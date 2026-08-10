/**
 * Minimal Polygon PoS ValidatorShare ABI (spec 065) — per-validator delegation
 * on Ethereum L1. POL-suffixed method variants (post MATIC→POL migration).
 * Delegate: buyVoucherPOL. Undelegate: sellVoucherPOL → unbond nonce, then
 * unstakeClaimTokens_newPOL after the withdrawal delay.
 */
export const POLYGON_VALIDATOR_SHARE_ABI = [
  'function buyVoucherPOL(uint256 _amount, uint256 _minSharesToMint) returns (uint256)',
  'function sellVoucherPOL(uint256 claimAmount, uint256 maximumSharesToBurn)',
  'function unstakeClaimTokens_newPOL(uint256 unbondNonce)',
  'function withdrawRewardsPOL()',
  'function restakePOL() returns (uint256, uint256)',
  'function getTotalStake(address user) view returns (uint256, uint256)',
  'function getLiquidRewards(address user) view returns (uint256)',
  'function exchangeRate() view returns (uint256)',
  'function unbondNonces(address user) view returns (uint256)',
  'function unbonds_new(address user, uint256 unbondNonce) view returns (uint256 shares, uint256 withdrawEpoch)',
]

/** Minimal ERC-20 ABI for POL (approve to StakeManager, balance). */
export const POL_TOKEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]

export default POLYGON_VALIDATOR_SHARE_ABI
