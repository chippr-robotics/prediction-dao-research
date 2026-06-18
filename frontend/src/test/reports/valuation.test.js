import { describe, it, expect } from 'vitest'
import {
  PAR_USD_PER_TOKEN,
  VALUATION_SOURCE_PAR,
  PAR_VALUATION_NOTE,
  valueTransfer,
} from '../../data/reports/valuation'

describe('valuation (par $1.00 baseline, FR-005/FR-016)', () => {
  it('values a transfer at par and records the structured source', () => {
    const v = valueTransfer(250)
    expect(v.usdValue).toBe(250)
    expect(v.costBasis).toBe(250)
    expect(v.valuationSource).toBe(VALUATION_SOURCE_PAR)
  })

  it('cost basis equals usd value under the par baseline', () => {
    const v = valueTransfer('12.5')
    expect(v.usdValue).toBe(12.5)
    expect(v.costBasis).toBe(12.5)
  })

  it('uses the documented par constant', () => {
    expect(PAR_USD_PER_TOKEN).toBe(1)
    expect(valueTransfer(1).usdValue).toBe(PAR_USD_PER_TOKEN)
  })

  it('degrades non-numeric amounts to 0 without throwing', () => {
    expect(valueTransfer(undefined).usdValue).toBe(0)
    expect(valueTransfer('abc').usdValue).toBe(0)
  })

  it('discloses the par baseline in the valuation note', () => {
    expect(PAR_VALUATION_NOTE).toMatch(/\$1\.00/)
    expect(PAR_VALUATION_NOTE).toMatch(/de-pegging/i)
  })
})
