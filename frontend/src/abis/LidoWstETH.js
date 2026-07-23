/**
 * Minimal Lido wstETH ABI for staking (spec 065). wstETH is the non-rebasing
 * wrapper members hold as their liquid position. A plain ETH transfer to the
 * wstETH `receive()` stakes via Lido and returns wstETH in one tx.
 */
export const LIDO_WSTETH_ABI = [
  'function wrap(uint256 _stETHAmount) returns (uint256)',
  'function unwrap(uint256 _wstETHAmount) returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function getStETHByWstETH(uint256 _wstETHAmount) view returns (uint256)',
  'function getWstETHByStETH(uint256 _stETHAmount) view returns (uint256)',
  'function stEthPerToken() view returns (uint256)',
  'function tokensPerStEth() view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]

export default LIDO_WSTETH_ABI
