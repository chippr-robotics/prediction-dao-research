/**
 * ERC-4626 vault reads + actions for the Earn section (spec 050).
 *
 * Deposits and withdrawals run directly from the member's own wallet against
 * curated Morpho vaults — FairWins never takes custody. Safety rails
 * (research.md R1/R9):
 *   - pure validators reject bad amounts BEFORE any wallet prompt;
 *   - deposits are quoted with previewDeposit and dry-run with staticCall
 *     before the real transaction;
 *   - withdrawals are bounded by maxWithdraw (the vault's honest liquidity
 *     limit), full exits use redeem(shares) so dust never strands.
 */
import { Contract } from 'ethers'
import { ERC4626_VAULT_ABI } from '../../abis/ERC4626Vault'

const ERC20_MIN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
]

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
 * Whether a deposit of `amount` needs an approval transaction first.
 */
export async function needsApproval({ vault, account, amount, provider }) {
  const token = new Contract(vault.asset.address, ERC20_MIN_ABI, provider)
  const allowance = await token.allowance(account, vault.address)
  return allowance < amount
}

/**
 * Send the approval for exactly `amount` (no unlimited allowances — the
 * member approves what they are depositing). Returns the tx receipt.
 */
export async function approveDeposit({ vault, amount, signer }) {
  const token = new Contract(vault.asset.address, ERC20_MIN_ABI, signer)
  const tx = await token.approve(vault.address, amount)
  return tx.wait()
}

/**
 * Quote then execute a deposit. The staticCall dry-run surfaces vault-side
 * rejections (cap reached, paused) before the member pays gas.
 * Returns { receipt, expectedShares }.
 */
export async function depositToVault({ vault, account, amount, signer }) {
  const vaultContract = new Contract(vault.address, ERC4626_VAULT_ABI, signer)
  const expectedShares = await vaultContract.previewDeposit(amount)
  await vaultContract.deposit.staticCall(amount, account)
  const tx = await vaultContract.deposit(amount, account)
  const receipt = await tx.wait()
  return { receipt, expectedShares }
}

/**
 * Withdraw `amount` of the underlying, or the full position via redeem when
 * `redeemAllShares` is set (so share dust never strands). Returns { receipt }.
 */
export async function withdrawFromVault({ vault, account, amount, redeemAllShares, signer }) {
  const vaultContract = new Contract(vault.address, ERC4626_VAULT_ABI, signer)
  let tx
  if (redeemAllShares != null && redeemAllShares > 0n) {
    await vaultContract.redeem.staticCall(redeemAllShares, account, account)
    tx = await vaultContract.redeem(redeemAllShares, account, account)
  } else {
    await vaultContract.withdraw.staticCall(amount, account, account)
    tx = await vaultContract.withdraw(amount, account, account)
  }
  const receipt = await tx.wait()
  return { receipt }
}
