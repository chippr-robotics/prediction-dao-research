/**
 * ERC-4626 vault reads + actions for the Earn section (spec 050).
 *
 * Deposits and withdrawals run from the member's own account against curated
 * Morpho vaults — FairWins never takes custody. Writes are expressed as
 * `{ target, data, value }` call batches for WalletContext.sendCalls (spec
 * 041's unified rail): passkey sessions authorize the WHOLE batch (approve +
 * deposit) with ONE ceremony via UserOp; classic wallets sign sequentially.
 * A raw ethers signer is never required — passkey sessions don't have one.
 *
 * Safety rails (research.md R1/R9):
 *   - pure validators reject bad amounts BEFORE any wallet prompt;
 *   - actions that are spendable now are dry-run with staticCall (from the
 *     member's address) before anything is signed;
 *   - approvals are for the exact amount (no unlimited allowances);
 *   - withdrawals are bounded by maxWithdraw (the vault's honest liquidity
 *     limit), full exits use redeem(shares) so dust never strands.
 */
import { Contract, Interface } from 'ethers'
import { ERC4626_VAULT_ABI } from '../../abis/ERC4626Vault'

const ERC20_MIN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
]

const VAULT_IFACE = new Interface(ERC4626_VAULT_ABI)
const ERC20_IFACE = new Interface(ERC20_MIN_ABI)

/**
 * Read the member's state against one vault over a read provider:
 * shares, current value in underlying assets, honest withdraw bound, wallet
 * balance of the underlying, and the vault's deposit cap for the member.
 */
export async function readVaultUserState({ vault, account, provider }) {
  const vaultContract = new Contract(vault.address, ERC4626_VAULT_ABI, provider)
  const token = new Contract(vault.asset.address, ERC20_MIN_ABI, provider)
  const [shares, walletBalance, maxDepositAssets] = await Promise.all([
    vaultContract.balanceOf(account),
    token.balanceOf(account),
    vaultContract.maxDeposit(account),
  ])
  let assets = 0n
  let maxWithdrawAssets = 0n
  if (shares > 0n) {
    ;[assets, maxWithdrawAssets] = await Promise.all([
      vaultContract.convertToAssets(shares),
      vaultContract.maxWithdraw(account),
    ])
  }
  return { shares, assets, maxWithdrawAssets, walletBalance, maxDepositAssets }
}

/**
 * Validate a deposit amount before any wallet prompt.
 * Returns { ok: true } or { ok: false, reason } with member-facing wording.
 */
export function validateDepositAmount({ amount, walletBalance, maxDepositAssets }) {
  if (amount == null || amount <= 0n) {
    return { ok: false, reason: 'Enter an amount greater than zero.' }
  }
  if (walletBalance != null && amount > walletBalance) {
    return { ok: false, reason: 'That is more than you have in your wallet.' }
  }
  if (maxDepositAssets != null && maxDepositAssets > 0n && amount > maxDepositAssets) {
    return { ok: false, reason: 'That is more than this vault currently accepts.' }
  }
  return { ok: true }
}

/**
 * Validate a withdrawal amount before any wallet prompt.
 */
export function validateWithdrawAmount({ amount, maxWithdrawAssets }) {
  if (amount == null || amount <= 0n) {
    return { ok: false, reason: 'Enter an amount greater than zero.' }
  }
  if (maxWithdrawAssets != null && amount > maxWithdrawAssets) {
    return {
      ok: false,
      reason: 'That is more than can be withdrawn right now — see the available amount above.',
    }
  }
  return { ok: true }
}

/**
 * Build the sendCalls batch for a deposit: an exact-amount approval when the
 * current allowance is short, then the deposit itself. When the deposit is
 * already spendable (no approval leg), it is dry-run with staticCall from the
 * member's address so vault-side rejections (cap reached, paused) surface
 * before anything is signed. Reads go over the chain's read `provider` — a
 * signer is never needed here.
 * Returns { calls, requiresApproval }.
 */
export async function buildDepositCalls({ vault, account, amount, provider }) {
  const token = new Contract(vault.asset.address, ERC20_MIN_ABI, provider)
  const allowance = await token.allowance(account, vault.address)
  const requiresApproval = allowance < amount
  const calls = []
  if (requiresApproval) {
    calls.push({
      target: vault.asset.address,
      data: ERC20_IFACE.encodeFunctionData('approve', [vault.address, amount]),
      value: 0n,
    })
  } else {
    // Only dry-runnable when the allowance already covers the deposit — with
    // an approval leg in the batch the simulation would revert on allowance.
    const vaultContract = new Contract(vault.address, ERC4626_VAULT_ABI, provider)
    await vaultContract.deposit.staticCall(amount, account, { from: account })
  }
  calls.push({
    target: vault.address,
    data: VAULT_IFACE.encodeFunctionData('deposit', [amount, account]),
    value: 0n,
  })
  return { calls, requiresApproval }
}

/**
 * Build the sendCalls batch for a withdrawal: `withdraw(assets)` for partial
 * exits, `redeem(shares)` for full exits (so share dust never strands). The
 * call is dry-run with staticCall from the member's address first.
 * Returns { calls }.
 */
export async function buildWithdrawCalls({ vault, account, amount, redeemAllShares, provider }) {
  const vaultContract = new Contract(vault.address, ERC4626_VAULT_ABI, provider)
  let data
  if (redeemAllShares != null && redeemAllShares > 0n) {
    await vaultContract.redeem.staticCall(redeemAllShares, account, account, { from: account })
    data = VAULT_IFACE.encodeFunctionData('redeem', [redeemAllShares, account, account])
  } else {
    await vaultContract.withdraw.staticCall(amount, account, account, { from: account })
    data = VAULT_IFACE.encodeFunctionData('withdraw', [amount, account, account])
  }
  return { calls: [{ target: vault.address, data, value: 0n }] }
}
