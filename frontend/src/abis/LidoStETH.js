/**
 * Minimal Lido stETH ABI for staking (spec 065). Human-readable fragments,
 * ethers v6. `submit` stakes ETH (msg.value) and returns stETH ~1:1; the
 * `_referral` is an on-chain attribution marker only (no revenue — R1). Share
 * views let us account in shares to avoid rebase drift.
 */
export const LIDO_STETH_ABI = [
  'function submit(address _referral) payable returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function sharesOf(address account) view returns (uint256)',
  'function getSharesByPooledEth(uint256 ethAmount) view returns (uint256)',
  'function getPooledEthByShares(uint256 sharesAmount) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]

export default LIDO_STETH_ABI
