/**
 * Perps fee unit conversions (spec 083, contracts/fee-rails.md).
 *
 * Every conversion is exercised in BOTH directions and at its exact venue ceiling, because this
 * module is the one place in the feature where an arithmetic slip becomes money the member pays.
 */
import { describe, it, expect } from 'vitest'
import {
  GMX_UI_FEE_FACTOR_PER_BPS,
  GMX_MAX_UI_FEE_FACTOR,
  GMX_MAX_UI_FEE_BPS,
  HL_BUILDER_F_PER_BPS,
  HL_MAX_BUILDER_F,
  HL_MAX_BUILDER_BPS,
  HL_MAX_FEE_RATE,
  bpsToGmxUiFeeFactor,
  gmxUiFeeFactorToBps,
  bpsToHyperliquidBuilderFee,
  hyperliquidBuilderFeeToBps,
  bpsToHyperliquidMaxFeeRate,
  feeAmountFromNotional,
  feeUsdFromNotional,
} from '../../lib/perps/feeUnits'

const JUNK = [null, undefined, NaN, Infinity, -Infinity, 'nope', '', {}, [], true, false, -1, -1n]

describe('perps feeUnits — totality', () => {
  it('junk in → null out, never a throw (these run during disclosure render)', () => {
    for (const junk of JUNK) {
      expect(() => bpsToGmxUiFeeFactor(junk)).not.toThrow()
      expect(bpsToGmxUiFeeFactor(junk)).toBeNull()
      expect(gmxUiFeeFactorToBps(junk)).toBeNull()
      expect(bpsToHyperliquidBuilderFee(junk)).toBeNull()
      expect(hyperliquidBuilderFeeToBps(junk)).toBeNull()
      expect(bpsToHyperliquidMaxFeeRate(junk)).toBeNull()
      expect(feeAmountFromNotional(junk, 5)).toBeNull()
      expect(feeAmountFromNotional(1_000n, junk)).toBeNull()
      expect(feeUsdFromNotional(junk, 5)).toBeNull()
      expect(feeUsdFromNotional(1000, junk)).toBeNull()
    }
  })

  it('accepts the bigint that ethers v6 returns for a uint rate', () => {
    expect(bpsToGmxUiFeeFactor(5n).factor).toBe(5n * 10n ** 26n)
    expect(bpsToHyperliquidBuilderFee(5n).f).toBe(50)
    expect(bpsToHyperliquidMaxFeeRate(5n).maxFeeRate).toBe('0.05%')
  })
})

describe('perps feeUnits — GMX uiFeeFactor', () => {
  it('bps → factor is bps × 1e26 (launch rate 5 bps = 5e26)', () => {
    expect(bpsToGmxUiFeeFactor(5).factor).toBe(500_000_000_000_000_000_000_000_000n)
    expect(bpsToGmxUiFeeFactor(1).factor).toBe(GMX_UI_FEE_FACTOR_PER_BPS)
    expect(bpsToGmxUiFeeFactor(0).factor).toBe(0n)
    expect(bpsToGmxUiFeeFactor(2.5).factor).toBe(250_000_000_000_000_000_000_000_000n)
  })

  it('the factor is a BigInt — 1e26 is past Number.MAX_SAFE_INTEGER', () => {
    const { factor } = bpsToGmxUiFeeFactor(5)
    expect(typeof factor).toBe('bigint')
    // The float form of 5e26 is wrong by ~6.6e11; the exact form must not be.
    expect(factor).not.toBe(BigInt(5e26))
  })

  it('clamps at the exact MAX_UI_FEE_FACTOR ceiling and says it clamped', () => {
    const atCeiling = bpsToGmxUiFeeFactor(GMX_MAX_UI_FEE_BPS)
    expect(atCeiling.factor).toBe(GMX_MAX_UI_FEE_FACTOR)
    expect(atCeiling.factor).toBe(10n ** 27n)
    expect(atCeiling.clamped).toBe(false)

    const over = bpsToGmxUiFeeFactor(25)
    expect(over.factor).toBe(GMX_MAX_UI_FEE_FACTOR)
    expect(over.clamped).toBe(true)
    expect(over.requestedBps).toBe(25) // a caller can disclose the gap instead of quietly rewriting it
    expect(over.bps).toBe(10)
  })

  it('factor → bps reads the DataStore rate back, exactly, from a bigint or a decimal string', () => {
    expect(gmxUiFeeFactorToBps(500_000_000_000_000_000_000_000_000n)).toBe(5)
    expect(gmxUiFeeFactorToBps('500000000000000000000000000')).toBe(5)
    expect(gmxUiFeeFactorToBps(GMX_MAX_UI_FEE_FACTOR)).toBe(10)
    expect(gmxUiFeeFactorToBps(0n)).toBe(0)
    expect(gmxUiFeeFactorToBps(250_000_000_000_000_000_000_000_000n)).toBe(2.5)
  })

  it('the read direction does NOT clamp — it reports what the venue actually said', () => {
    expect(gmxUiFeeFactorToBps(50n * 10n ** 26n)).toBe(50)
  })
})

describe('perps feeUnits — Hyperliquid builder fee', () => {
  it('A MISSING ×10 ON THE HL CONVERSION IS A 10× OVERCHARGE: f is TENTHS of a bp', () => {
    // f = 50 is 5 bps. If f were set to the bps number itself (5), the member is charged a tenth
    // of the intended rate; if the ×10 were applied twice (500) they are charged ten times it —
    // and Hyperliquid enforces whatever number reaches it.
    expect(bpsToHyperliquidBuilderFee(5).f).toBe(50)
    expect(bpsToHyperliquidBuilderFee(5).f).not.toBe(5)
    expect(bpsToHyperliquidBuilderFee(5).f).not.toBe(500)
    expect(HL_BUILDER_F_PER_BPS).toBe(10)
    // And the inverse must undo exactly that ×10, not a ×100 or a ×1.
    expect(hyperliquidBuilderFeeToBps(50)).toBe(5)
    expect(hyperliquidBuilderFeeToBps(bpsToHyperliquidBuilderFee(5).f)).toBe(5)
  })

  it('clamps at the exact f ≤ 100 ceiling and says it clamped', () => {
    const atCeiling = bpsToHyperliquidBuilderFee(HL_MAX_BUILDER_BPS)
    expect(atCeiling.f).toBe(HL_MAX_BUILDER_F)
    expect(atCeiling.f).toBe(100)
    expect(atCeiling.clamped).toBe(false)

    const over = bpsToHyperliquidBuilderFee(50)
    expect(over.f).toBe(100)
    expect(over.clamped).toBe(true)
    expect(over.requestedBps).toBe(50)
    expect(over.bps).toBe(10)
  })

  it('fractional tenths floor (member’s favour) without float dust', () => {
    expect(bpsToHyperliquidBuilderFee(0.7).f).toBe(7) // 0.7 * 10 is 6.99999… in floats
    expect(bpsToHyperliquidBuilderFee(0.75).f).toBe(7)
    expect(bpsToHyperliquidBuilderFee(0.04).f).toBe(0)
  })

  it('f → bps is the read direction and does not clamp', () => {
    expect(hyperliquidBuilderFeeToBps(0)).toBe(0)
    expect(hyperliquidBuilderFeeToBps(100)).toBe(10)
    expect(hyperliquidBuilderFeeToBps(250)).toBe(25)
  })
})

describe('perps feeUnits — Hyperliquid maxFeeRate string', () => {
  it('renders a percent string and THE % SIGN IS REQUIRED', () => {
    expect(bpsToHyperliquidMaxFeeRate(5).maxFeeRate).toBe('0.05%')
    expect(bpsToHyperliquidMaxFeeRate(1).maxFeeRate).toBe('0.01%')
    expect(bpsToHyperliquidMaxFeeRate(2.5).maxFeeRate).toBe('0.025%')
    expect(bpsToHyperliquidMaxFeeRate(0).maxFeeRate).toBe('0%')
    for (const bps of [0, 1, 2.5, 5, 10]) {
      expect(bpsToHyperliquidMaxFeeRate(bps).maxFeeRate.endsWith('%')).toBe(true)
    }
  })

  it('clamps at the exact "0.1%" ceiling, spelled as the venue spells it', () => {
    const atCeiling = bpsToHyperliquidMaxFeeRate(HL_MAX_BUILDER_BPS)
    expect(atCeiling.maxFeeRate).toBe('0.1%') // not '0.10%'
    expect(atCeiling.maxFeeRate).toBe(HL_MAX_FEE_RATE)
    expect(atCeiling.clamped).toBe(false)

    const over = bpsToHyperliquidMaxFeeRate(25)
    expect(over.maxFeeRate).toBe('0.1%')
    expect(over.clamped).toBe(true)
    expect(over.requestedBps).toBe(25)
  })
})

describe('perps feeUnits — round trip', () => {
  // 0.0 … 10.0 bps in tenths: every rate either venue can express at launch.
  const RANGE = Array.from({ length: 101 }, (_, i) => Math.round(i) / 10)

  it('bps → GMX factor → bps is the identity across the whole legal range', () => {
    for (const bps of RANGE) {
      const forward = bpsToGmxUiFeeFactor(bps)
      expect(forward.clamped).toBe(false)
      expect(gmxUiFeeFactorToBps(forward.factor)).toBe(bps)
      expect(forward.factor).toBeLessThanOrEqual(GMX_MAX_UI_FEE_FACTOR)
    }
  })

  it('bps → HL f → bps is the identity across the whole legal range', () => {
    for (const bps of RANGE) {
      const forward = bpsToHyperliquidBuilderFee(bps)
      expect(forward.clamped).toBe(false)
      expect(hyperliquidBuilderFeeToBps(forward.f)).toBe(bps)
      expect(forward.f).toBeLessThanOrEqual(HL_MAX_BUILDER_F)
      expect(Number.isInteger(forward.f)).toBe(true)
    }
  })

  it('the two venue units agree with each other at every rate', () => {
    for (const bps of RANGE) {
      expect(gmxUiFeeFactorToBps(bpsToGmxUiFeeFactor(bps).factor)).toBe(
        hyperliquidBuilderFeeToBps(bpsToHyperliquidBuilderFee(bps).f),
      )
    }
  })

  it('every rate above a ceiling round-trips to that ceiling, and is flagged', () => {
    for (const bps of [10.1, 11, 25, 100, 10_000]) {
      const gmx = bpsToGmxUiFeeFactor(bps)
      expect(gmx.clamped).toBe(true)
      expect(gmxUiFeeFactorToBps(gmx.factor)).toBe(GMX_MAX_UI_FEE_BPS)

      const hl = bpsToHyperliquidBuilderFee(bps)
      expect(hl.clamped).toBe(true)
      expect(hyperliquidBuilderFeeToBps(hl.f)).toBe(HL_MAX_BUILDER_BPS)
    }
  })
})

describe('perps feeUnits — notional × bps → money', () => {
  it('is floored, in the member’s favour', () => {
    // 5 bps of 1,000.000001 USDC (1e6 decimals): the exact product is 500_000.0000005 base units.
    expect(feeAmountFromNotional(1_000_000_001n, 5)).toBe(500_000n)
    // 3 bps of 7 base units is 0.0021 — floors to nothing charged, never rounded up to 1.
    expect(feeAmountFromNotional(7n, 3)).toBe(0n)
  })

  it('is exact at GMX 1e30 notional, where a float would already be wrong', () => {
    const sizeDeltaUsd = 10_000n * 10n ** 30n // $10,000 notional
    expect(feeAmountFromNotional(sizeDeltaUsd, 5)).toBe(5n * 10n ** 30n) // $5
    expect(feeAmountFromNotional(sizeDeltaUsd, 0)).toBe(0n)
    expect(typeof feeAmountFromNotional(sizeDeltaUsd, 5)).toBe('bigint')
  })

  it('accepts decimal strings and honours fractional bps', () => {
    expect(feeAmountFromNotional('1000000', 5)).toBe(500n)
    expect(feeAmountFromNotional('1000000', 2.5)).toBe(250n)
  })

  it('the display helper agrees with the exact charge', () => {
    expect(feeUsdFromNotional(10_000, 5)).toBe(5)
    expect(feeUsdFromNotional(0, 5)).toBe(0)
    expect(feeUsdFromNotional(10_000, 0)).toBe(0) // zero rate ⇒ zero money ⇒ no fee line at all
  })
})
