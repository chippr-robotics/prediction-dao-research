/**
 * Minimal sPOL controller ABI (spec 065) — Polygon's official native liquid
 * staking (research.md R2). Canonical mint/unstake on Ethereum L1. sPOL is an
 * exchange-rate (value-accruing) token; exit is sellSPOL → unbonding →
 * withdrawPOL, with an instant DEX-swap alternative. `rewardFee` is Polygon's
 * fee (on rewards), read for honest disclosure.
 */
export const SPOL_CONTROLLER_ABI = [
  'function buySPOL(uint256 _amount) returns (uint256)',
  'function sellSPOL(uint256 _amount) returns (uint256[])',
  'function withdrawPOL()',
  'function withdrawPOL(address _user)',
  'function convertPOLtoSPOL(uint256 _amount) view returns (uint256)',
  'function convertSPOLtoPOL(uint256 _amount) view returns (uint256)',
  'function totalsPOLBalance() view returns (uint256)',
  'function getUserOpenNonces(address _user) view returns (tuple(uint256 nonce, uint256 shares, uint256 withdrawEpoch, uint256 polAmount)[])',
  'function rewardFee() view returns (uint16)',
  'function feeReceiver() view returns (address)',
]

/** Minimal sPOL ERC-20 token ABI (balance for position display). */
export const SPOL_TOKEN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
]

export default SPOL_CONTROLLER_ABI
