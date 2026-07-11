/**
 * Vault action validator tests (spec 050, US1 edge cases) — every bad amount
 * is rejected with a member-facing reason BEFORE any wallet prompt, and the
 * display formatters stay honest about missing data.
 */
import { describe, it, expect } from 'vitest'
import { validateDepositAmount, validateWithdrawAmount } from '../../lib/earn/vaultActions'
import { formatApy, formatTvl } from '../../lib/earn/format'

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
