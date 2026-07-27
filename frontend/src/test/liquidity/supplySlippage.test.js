/**
 * Spec 067 — the Uniswap supply path must carry a real slippage bound (T150 security review).
 *
 * `amount0Min`/`amount1Min` become Uniswap's `MintParams` minimums, where `LiquidityManagement`
 * enforces `require(amount0 >= amount0Min && amount1 >= amount1Min, 'Price slippage check')`. They
 * used to default to `0n` in `buildSupplyCalls`, and `SupplySheet` — the only production caller —
 * never passed them, so every member position was minted with that check switched off and the
 * deposit was open to being sandwiched at a manipulated price.
 *
 * The contract is not the right place to fix it: forwarding a caller-supplied minimum verbatim is
 * what Uniswap's own periphery does. So the bound is computed by the caller and the defaults are
 * gone. These tests pin both halves — the computation, and the refusal to build without one.
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SUPPLY_SLIPPAGE_BPS,
  POOL_KIND,
  buildSupplyCalls,
  supplyMinimums,
} from '../../lib/liquidity/liquidityRouter'

const ROUTER = '0x1111111111111111111111111111111111111111'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const pool = {
  poolId: '0x' + '11'.repeat(32),
  kind: POOL_KIND.TRADING_LP,
  enabled: true,
  token0: USDC,
  token1: WETH,
  poolAddress: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
  feeTier: 500,
  maxDeposit0PerTx: 0n,
  maxDeposit1PerTx: 0n,
}

describe('supplyMinimums — the bound is computed on NET, not gross', () => {
  it('defaults to a 0.50% tolerance', () => {
    expect(DEFAULT_SUPPLY_SLIPPAGE_BPS).toBe(50)
  })

  it('at a zero fee rate, floors each leg at the tolerance below what was offered', () => {
    const { amount0Min, amount1Min } = supplyMinimums({
      amount0Desired: 1_000_000_000n, // 1,000 USDC
      amount1Desired: 10n ** 18n, // 1 WETH
      bps: 0,
    })
    expect(amount0Min).toBe((1_000_000_000n * 9_950n) / 10_000n)
    expect(amount1Min).toBe((10n ** 18n * 9_950n) / 10_000n)
  })

  it('is computed AFTER the fee, so a non-zero rate cannot make every supply revert', () => {
    // The fee is taken before the mint, so the position manager can never consume the gross. A
    // bound derived from the gross would exceed the maximum possible consumption and revert every
    // supply the day a rate goes live — which is the trap this test exists to prevent.
    const gross = 1_000_000_000n
    const bps = 250
    const { amount0Min } = supplyMinimums({ amount0Desired: gross, amount1Desired: 0n, bps })
    const net = gross - (gross * BigInt(bps)) / 10_000n
    expect(amount0Min).toBe((net * 9_950n) / 10_000n)
    expect(amount0Min).toBeLessThan(net)
  })

  it('leaves a leg the member is not supplying at zero', () => {
    const { amount0Min, amount1Min } = supplyMinimums({
      amount0Desired: 1_000_000_000n,
      amount1Desired: 0n,
      bps: 0,
    })
    expect(amount1Min).toBe(0n)
    expect(amount0Min).toBeGreaterThan(0n)
  })

  it('rejects a nonsensical tolerance rather than silently clamping it', () => {
    expect(() => supplyMinimums({ amount0Desired: 1n, amount1Desired: 0n, bps: 0, slippageBps: 10_001 })).toThrow(
      /tolerance in basis points/i,
    )
  })
})

describe('buildSupplyCalls — a missing bound is an error, not a silent zero', () => {
  const base = {
    routerAddress: ROUTER,
    pool,
    amount0Desired: 1_000_000_000n,
    amount1Desired: 10n ** 18n,
    deadline: 1_900_000_000,
    maxFeeBps: 0,
  }

  it('refuses to build calldata when the minimums are omitted', () => {
    // This is the exact shape the shipped caller used before the security review: every argument
    // present except the two that switch Uniswap's slippage check on.
    expect(() => buildSupplyCalls(base)).toThrow(/amount0Min and amount1Min are required/i)
  })

  it('refuses a non-bigint bound rather than coercing it', () => {
    expect(() => buildSupplyCalls({ ...base, amount0Min: 0, amount1Min: 0n })).toThrow(
      /amount0Min and amount1Min are required/i,
    )
  })

  it('builds when real bounds are supplied, and an explicit zero remains expressible', () => {
    const withBounds = buildSupplyCalls({ ...base, ...supplyMinimums({ ...base, bps: 0 }) })
    expect(withBounds.calls.length).toBeGreaterThan(0)
    // `0n` is still a legal answer — it just has to be asked for in so many words.
    expect(() => buildSupplyCalls({ ...base, amount0Min: 0n, amount1Min: 0n })).not.toThrow()
  })
})
