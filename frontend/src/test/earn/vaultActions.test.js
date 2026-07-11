/**
 * Vault action tests (spec 050, US1 edge cases) — every bad amount is
 * rejected with a member-facing reason BEFORE any wallet prompt, the
 * sendCalls batch builders produce correct approve/deposit/withdraw/redeem
 * calldata (signer-free, so passkey sessions work), and the display
 * formatters stay honest about missing data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ fns: {} }))

vi.mock('ethers', async (orig) => {
  const actual = await orig()
  function FakeContract() {
    return new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return undefined
          const key = String(prop)
          const fn = (...args) => {
            const f = m.fns[key]
            if (!f) throw new Error('unmocked contract method: ' + key)
            return f(...args)
          }
          fn.staticCall = (...args) => {
            const f = m.fns[`${key}.staticCall`]
            if (!f) throw new Error('unmocked staticCall: ' + key)
            return f(...args)
          }
          return fn
        },
      },
    )
  }
  return { ...actual, Contract: vi.fn(FakeContract) }
})

import { Interface } from 'ethers'
import {
  validateDepositAmount,
  validateWithdrawAmount,
  buildDepositCalls,
  buildWithdrawCalls,
} from '../../lib/earn/vaultActions'
import { ERC4626_VAULT_ABI } from '../../abis/ERC4626Vault'
import { formatApy, formatTvl } from '../../lib/earn/format'

const VAULT_IFACE = new Interface(ERC4626_VAULT_ABI)
const ERC20_IFACE = new Interface(['function approve(address spender, uint256 value) returns (bool)'])

const ACCOUNT = '0x00000000000000000000000000000000000000ac'
const VAULT = {
  address: '0x00000000000000000000000000000000000000a1',
  asset: { address: '0x00000000000000000000000000000000000000c0', symbol: 'USDC', decimals: 6 },
}

const BALANCE = 1_000_000n // 1 USDC at 6 decimals

describe('validateDepositAmount', () => {
  it('rejects empty/zero/negative amounts', () => {
    expect(validateDepositAmount({ amount: null, walletBalance: BALANCE }).ok).toBe(false)
    expect(validateDepositAmount({ amount: 0n, walletBalance: BALANCE }).ok).toBe(false)
    expect(validateDepositAmount({ amount: -1n, walletBalance: BALANCE }).ok).toBe(false)
  })

  it('rejects more than the wallet balance with a plain reason', () => {
    const res = validateDepositAmount({ amount: BALANCE + 1n, walletBalance: BALANCE })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/more than you have/i)
  })

  it('rejects more than the vault currently accepts', () => {
    const res = validateDepositAmount({
      amount: 600n,
      walletBalance: BALANCE,
      maxDepositAssets: 500n,
    })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/vault currently accepts/i)
  })

  it('accepts a valid amount (dust included — no artificial minimum)', () => {
    expect(validateDepositAmount({ amount: 1n, walletBalance: BALANCE }).ok).toBe(true)
    expect(
      validateDepositAmount({ amount: BALANCE, walletBalance: BALANCE, maxDepositAssets: 0n }).ok,
    ).toBe(true) // maxDeposit 0 is treated as "no cap signal", not a hard stop
  })
})

describe('validateWithdrawAmount', () => {
  it('rejects zero and over-liquidity amounts honestly', () => {
    expect(validateWithdrawAmount({ amount: 0n, maxWithdrawAssets: BALANCE }).ok).toBe(false)
    const res = validateWithdrawAmount({ amount: BALANCE + 1n, maxWithdrawAssets: BALANCE })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/withdrawn right now/i)
  })

  it('accepts up to the available liquidity bound', () => {
    expect(validateWithdrawAmount({ amount: BALANCE, maxWithdrawAssets: BALANCE }).ok).toBe(true)
  })
})

describe('buildDepositCalls (sendCalls batch)', () => {
  beforeEach(() => {
    m.fns = {}
  })

  it('prepends an exact-amount approval when the allowance is short', async () => {
    m.fns.allowance = async () => 0n
    const { calls, requiresApproval } = await buildDepositCalls({
      vault: VAULT,
      account: ACCOUNT,
      amount: 5_000_000n,
      provider: {},
    })
    expect(requiresApproval).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[0].target).toBe(VAULT.asset.address)
    const approve = ERC20_IFACE.decodeFunctionData('approve', calls[0].data)
    expect(approve[0].toLowerCase()).toBe(VAULT.address)
    expect(approve[1]).toBe(5_000_000n) // exact amount — never unlimited
    expect(calls[1].target).toBe(VAULT.address)
    const deposit = VAULT_IFACE.decodeFunctionData('deposit', calls[1].data)
    expect(deposit[0]).toBe(5_000_000n)
    expect(deposit[1].toLowerCase()).toBe(ACCOUNT)
  })

  it('skips the approval and dry-runs the deposit when the allowance covers it', async () => {
    m.fns.allowance = async () => 10_000_000n
    const dryRun = vi.fn(async () => 5_000_000n)
    m.fns['deposit.staticCall'] = dryRun
    const { calls, requiresApproval } = await buildDepositCalls({
      vault: VAULT,
      account: ACCOUNT,
      amount: 5_000_000n,
      provider: {},
    })
    expect(requiresApproval).toBe(false)
    expect(calls).toHaveLength(1)
    expect(dryRun).toHaveBeenCalled()
  })

  it('propagates a dry-run revert so nothing is signed for a doomed deposit', async () => {
    m.fns.allowance = async () => 10_000_000n
    m.fns['deposit.staticCall'] = async () => {
      throw new Error('vault paused')
    }
    await expect(
      buildDepositCalls({ vault: VAULT, account: ACCOUNT, amount: 5_000_000n, provider: {} }),
    ).rejects.toThrow(/vault paused/)
  })
})

describe('buildWithdrawCalls (sendCalls batch)', () => {
  beforeEach(() => {
    m.fns = {}
  })

  it('encodes withdraw(assets) for partial exits after a dry-run', async () => {
    m.fns['withdraw.staticCall'] = async () => 1n
    const { calls } = await buildWithdrawCalls({
      vault: VAULT,
      account: ACCOUNT,
      amount: 2_000_000n,
      redeemAllShares: null,
      provider: {},
    })
    const decoded = VAULT_IFACE.decodeFunctionData('withdraw', calls[0].data)
    expect(decoded[0]).toBe(2_000_000n)
  })

  it('encodes redeem(shares) for full exits so dust never strands', async () => {
    m.fns['redeem.staticCall'] = async () => 1n
    const { calls } = await buildWithdrawCalls({
      vault: VAULT,
      account: ACCOUNT,
      amount: 8_000_000n,
      redeemAllShares: 10_000_000n,
      provider: {},
    })
    const decoded = VAULT_IFACE.decodeFunctionData('redeem', calls[0].data)
    expect(decoded[0]).toBe(10_000_000n)
  })
})

describe('display formatters (honest "—" for missing data)', () => {
  it('formats APY fractions and preserves null', () => {
    expect(formatApy(0.0432)).toBe('4.32%')
    expect(formatApy(null)).toBe('—')
  })

  it('formats TVL compactly and preserves null', () => {
    expect(formatTvl(12_345_678)).toBe('$12.3M')
    expect(formatTvl(45_000)).toBe('$45K')
    expect(formatTvl(999)).toBe('$999')
    expect(formatTvl(null)).toBe('—')
  })
})
