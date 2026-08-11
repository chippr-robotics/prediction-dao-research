/**
 * Statement palette derivation (issue #1026, spec 072 branding).
 *
 * The point of deriving the palette rather than hand-picking it is that a
 * tenant can choose ANY primary — including a pale one — and still get a
 * legible document. These tests are that guarantee: they assert the contrast
 * floors hold for brands nobody has designed against, which is exactly the case
 * a visual review can never cover.
 */

import { describe, it, expect } from 'vitest'
import {
  brandTokensFromTheme,
  contrast,
  mix,
  parseColor,
  readableInk,
  statementTheme,
  toHex,
} from '../../data/reports/statement/theme'

const PAPER = [255, 255, 255]

/** Brands chosen to break a hand-tuned palette: pale, dark, and unsaturated. */
const BRANDS = {
  'FairWins green': '#36B37E',
  'pale yellow': '#F7E96B',
  'near-white': '#F2F2F2',
  'deep navy': '#0B1F4B',
  'hot magenta': '#FF2D9B',
  'mid grey': '#808080',
}

describe('colour helpers', () => {
  it('parses the hex forms a manifest can carry', () => {
    expect(parseColor('#36B37E')).toEqual([54, 179, 126])
    expect(parseColor('#abc')).toEqual([170, 187, 204])
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3])
    expect(parseColor('not a colour')).toBeNull()
  })

  it('round-trips through hex', () => {
    expect(toHex(mix([0, 0, 0], [255, 255, 255], 0.5))).toBe('#808080')
  })

  it('picks the ink a background can actually carry', () => {
    expect(readableInk([10, 10, 10])).toEqual([255, 255, 255])
    expect(readableInk([250, 250, 250])).toEqual([17, 22, 28])
  })
})

describe('statementTheme derivation', () => {
  for (const [name, primary] of Object.entries(BRANDS)) {
    describe(name, () => {
      const theme = statementTheme({ primary })

      // The masthead is a background, not a brand swatch. A tenant picking a
      // pale primary must still get a band whose text can be read.
      it('darkens the masthead band until its ink clears AA for body text', () => {
        expect(contrast(theme.band, theme.bandInk)).toBeGreaterThanOrEqual(4.5)
      })

      it('keeps the band’s secondary text legible too', () => {
        expect(contrast(theme.band, theme.bandInkSoft)).toBeGreaterThanOrEqual(3)
      })

      // A chart mark nobody can see against paper is decoration, not data.
      it('steps chart marks until they clear the 3:1 non-text floor on paper', () => {
        for (const token of ['accent', 'positive', 'negative']) {
          expect(contrast(theme[token], PAPER)).toBeGreaterThanOrEqual(3)
        }
      })

      it('keeps body ink well clear of paper', () => {
        expect(contrast(theme.ink, PAPER)).toBeGreaterThanOrEqual(7)
        expect(contrast(theme.inkSoft, PAPER)).toBeGreaterThanOrEqual(4.5)
      })

      it('keeps row washes light enough to read ink on', () => {
        for (const wash of ['wash', 'washWarn', 'zebra', 'accentSoft']) {
          expect(contrast(theme[wash], theme.ink)).toBeGreaterThanOrEqual(7)
        }
      })
    })
  }

  it('carries the brand hue into the document rather than a fixed green', () => {
    const green = statementTheme({ primary: '#36B37E' })
    const navy = statementTheme({ primary: '#0B1F4B' })
    expect(toHex(green.band)).not.toBe(toHex(navy.band))
    expect(toHex(green.accent)).not.toBe(toHex(navy.accent))
  })

  // Money in / money out is a polar reading, not a brand statement: it stays
  // stable across tenants so the same colour means the same thing everywhere.
  it('keeps money-out warm even for a brand that does not define it', () => {
    const theme = statementTheme({ primary: '#0B1F4B' })
    expect(theme.negative[0]).toBeGreaterThan(theme.negative[2])
  })

  it('produces a complete theme from a tenant that themes nothing', () => {
    const theme = statementTheme(brandTokensFromTheme(undefined))
    expect(contrast(theme.band, theme.bandInk)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(theme.accent, PAPER)).toBeGreaterThanOrEqual(3)
  })

  it('reads the manifest’s own tokens when it has them', () => {
    const tokens = brandTokensFromTheme({
      base: { '--brand-primary': '#4B3FA7', '--semantic-loss': '#B3392B' },
    })
    expect(tokens.primary).toBe('#4B3FA7')
    expect(tokens.negative).toBe('#B3392B')
  })
})
