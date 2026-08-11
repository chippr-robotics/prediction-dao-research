/** Perps formatters (spec 082) — every function must be TOTAL: junk in, '—' out, never a throw. */
import { describe, it, expect } from 'vitest'
import {
  formatPairPrice,
  formatFundingRate,
  formatFundingAnnualized,
  formatUsdCompact,
  formatUsd,
  formatSignedUsd,
  formatLeverage,
  bpsToPct,
} from '../../lib/perps/format'

const JUNK = [null, undefined, NaN, Infinity, -Infinity, 'nope', {}]

describe('perps format', () => {
  it('every formatter is total over junk inputs', () => {
    for (const junk of JUNK) {
      expect(() => formatPairPrice(junk)).not.toThrow()
      expect(formatPairPrice(junk)).toBe('—')
      expect(formatFundingRate(junk)).toBe('—')
      expect(formatFundingAnnualized(junk)).toBe('—')
      expect(formatUsdCompact(junk)).toBe('—')
      expect(formatUsd(junk)).toBe('—')
      expect(formatSignedUsd(junk)).toBe('—')
      expect(formatLeverage(junk)).toBe('—')
      expect(bpsToPct(junk)).toBe('—')
    }
  })

  it('formats prices across magnitudes', () => {
    expect(formatPairPrice(63412.53)).toBe('63,412.5')
    expect(formatPairPrice(3.14159)).toBe('3.14')
    expect(formatPairPrice(0.069419)).toBe('0.06942')
    expect(formatPairPrice(0)).toBe('—') // zero price is not a price
    expect(formatPairPrice(-5)).toBe('—')
  })

  it('formats funding with explicit sign and interval', () => {
    expect(formatFundingRate(0.0000125, 1)).toBe('+0.0013%/1h')
    expect(formatFundingRate(-0.0000125, 1)).toBe('-0.0013%/1h')
    expect(formatFundingRate(0, 1)).toBe('0.0000%/1h')
    expect(formatFundingAnnualized(0.0000125, 1)).toBe('+11.0%/yr')
  })

  it('formats compact and exact USD', () => {
    expect(formatUsdCompact(182_400_000)).toBe('$182.4M')
    expect(formatUsdCompact(45_230)).toBe('$45.2K')
    expect(formatUsdCompact(912.4)).toBe('$912')
    expect(formatUsdCompact(2_100_000_000)).toBe('$2.1B')
    expect(formatUsd(1234.56)).toBe('$1,234.56')
    expect(formatSignedUsd(120.5)).toBe('+$120.50')
    expect(formatSignedUsd(-34.12)).toBe('−$34.12')
  })

  it('formats leverage and bps', () => {
    expect(formatLeverage(150)).toBe('150×')
    expect(formatLeverage(7.5)).toBe('7.5×')
    expect(formatLeverage(0)).toBe('—')
    expect(bpsToPct(5)).toBe('0.05%')
    expect(bpsToPct(0)).toBe('0.00%')
  })
})
