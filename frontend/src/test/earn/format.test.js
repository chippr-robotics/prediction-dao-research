/**
 * Shared Earn formatters (lib/earn/format.js).
 *
 * `toBaseUnitString`/`formatTokenAmount` exist because external APIs quote
 * wei-scale amounts as JSON doubles (issue #977): they must always yield
 * something BigInt() accepts, or an honest "—" — never a throw on a render path.
 */
import { describe, it, expect } from 'vitest'
import { toBaseUnitString, formatTokenAmount, formatApy, formatTvl } from '../../lib/earn/format'

describe('toBaseUnitString', () => {
  it('expands exponential notation from a JSON double', () => {
    expect(toBaseUnitString(1.2105466892436343e26)).toBe('121054668924363430000000000')
    expect(toBaseUnitString('2.5111200087021933e+24')).toBe('2511120008702193300000000')
  })

  it('passes integer strings through, canonicalized', () => {
    expect(toBaseUnitString('1000000000000000000000000')).toBe('1000000000000000000000000')
    expect(toBaseUnitString('+007')).toBe('7')
  })

  it('accepts bigints and plain integers', () => {
    expect(toBaseUnitString(10n ** 30n)).toBe('1000000000000000000000000000000')
    expect(toBaseUnitString(42)).toBe('42')
  })

  it('truncates a fractional base unit rather than rejecting the amount', () => {
    expect(toBaseUnitString('12.9')).toBe('12')
  })

  it('returns null for anything it cannot represent', () => {
    expect(toBaseUnitString(null)).toBeNull()
    expect(toBaseUnitString(undefined)).toBeNull()
    expect(toBaseUnitString('')).toBeNull()
    expect(toBaseUnitString('  ')).toBeNull()
    expect(toBaseUnitString('0x1f')).toBeNull()
    expect(toBaseUnitString('not-a-number')).toBeNull()
    expect(toBaseUnitString(Number.NaN)).toBeNull()
    expect(toBaseUnitString(Number.POSITIVE_INFINITY)).toBeNull()
    expect(toBaseUnitString({})).toBeNull()
  })
})

describe('formatTokenAmount', () => {
  it('formats wei-scale amounts compactly', () => {
    expect(formatTokenAmount('1000000000000000000000000', 18, 'POL')).toBe('1.0M POL')
    expect(formatTokenAmount('5000000000000000000000', 18, 'POL')).toBe('5K POL')
    expect(formatTokenAmount('12340000000000000000', 18, 'POL')).toBe('12.34 POL')
  })

  it('formats an exponential-notation amount rather than throwing', () => {
    expect(formatTokenAmount('1.2105466892436343e+26', 18, 'POL')).toBe('121.1M POL')
  })

  it('omits the unit when no symbol is given', () => {
    expect(formatTokenAmount('12340000000000000000', 18)).toBe('12.34')
  })

  it('is total: unusable input renders "—", never a throw', () => {
    expect(formatTokenAmount(null, 18, 'POL')).toBe('—')
    expect(formatTokenAmount('nonsense', 18, 'POL')).toBe('—')
    expect(formatTokenAmount('100', Number.NaN, 'POL')).toBe('—')
  })
})

describe('formatApy / formatTvl', () => {
  it('renders "—" for missing protocol data', () => {
    expect(formatApy(null)).toBe('—')
    expect(formatTvl(null)).toBe('—')
  })

  it('formats known values', () => {
    expect(formatApy(0.043)).toBe('4.30%')
    expect(formatTvl(1_200_000)).toBe('$1.2M')
    expect(formatTvl(450_000)).toBe('$450K')
  })
})
