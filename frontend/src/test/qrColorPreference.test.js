import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  QR_COLOR_PALETTE,
  DEFAULT_QR_COLOR_ID,
  getQRColorPreference,
  setQRColorPreference,
} from '../utils/qrColorPreference'

// Spec 011 — palette + persistence contract (contracts/address-qr-ui-contract.md,
// C7 and P1–P4). The palette is the single source of truth for QR colors: every
// entry must be provably scannable (dark-on-white, WCAG >= 4.5:1) so the user
// can never select an unscannable combination (FR-006).

const STORAGE_KEY = 'fairwins_qrcolor_v1'

// WCAG 2.1 relative luminance (sRGB) — same math the design used to vet the
// palette (research D2), re-derived here so the test fails if anyone adds a
// low-contrast color later.
function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const linear = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  )
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastOnWhite(hex) {
  return (1.0 + 0.05) / (relativeLuminance(hex) + 0.05)
}

describe('QR_COLOR_PALETTE (C7)', () => {
  it('offers exactly the four curated entries, in order', () => {
    expect(QR_COLOR_PALETTE.map((e) => e.id)).toEqual([
      'midnight',
      'forest',
      'ocean',
      'plum',
    ])
    expect(QR_COLOR_PALETTE.map((e) => e.fg)).toEqual([
      '#0E141B',
      '#14532D',
      '#1E3A8A',
      '#581C87',
    ])
  })

  it('every entry has a non-empty human-readable name (never color-only)', () => {
    for (const entry of QR_COLOR_PALETTE) {
      expect(typeof entry.name).toBe('string')
      expect(entry.name.trim().length).toBeGreaterThan(0)
    }
    expect(QR_COLOR_PALETTE.map((e) => e.name)).toEqual([
      'Midnight',
      'Forest',
      'Ocean',
      'Plum',
    ])
  })

  it('every entry is dark-on-white with WCAG contrast >= 4.5:1 (SC-002 structural proof)', () => {
    const whiteLuminance = 1.0
    for (const entry of QR_COLOR_PALETTE) {
      expect(entry.fg).toMatch(/^#[0-9A-F]{6}$/i)
      // Foreground must be the darker color — inverted (light-on-dark) QR
      // codes are unreliable with common scanners and are excluded (D2).
      expect(relativeLuminance(entry.fg)).toBeLessThan(whiteLuminance)
      expect(contrastOnWhite(entry.fg)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('uses midnight (the spec-009 foreground) as the default', () => {
    expect(DEFAULT_QR_COLOR_ID).toBe('midnight')
    expect(QR_COLOR_PALETTE.find((e) => e.id === 'midnight')?.fg).toBe('#0E141B')
  })
})

describe('getQRColorPreference / setQRColorPreference (P1–P4)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('P1: returns the default when no value is stored', () => {
    expect(getQRColorPreference()).toBe('midnight')
  })

  it('P1: returns the default when the stored value is not a palette id', () => {
    localStorage.setItem(STORAGE_KEY, 'hot-pink')
    expect(getQRColorPreference()).toBe('midnight')
  })

  it('P1/P4: returns the default (and does not throw) when storage access throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => getQRColorPreference()).not.toThrow()
    expect(getQRColorPreference()).toBe('midnight')
  })

  it('P2: round-trips a palette id as a plain string under fairwins_qrcolor_v1', () => {
    setQRColorPreference('forest')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('forest')
    expect(getQRColorPreference()).toBe('forest')

    setQRColorPreference('plum')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('plum')
    expect(getQRColorPreference()).toBe('plum')
  })

  it('P3: ignores unknown ids — the stored value stays valid', () => {
    setQRColorPreference('ocean')
    setQRColorPreference('red')
    setQRColorPreference('')
    setQRColorPreference(undefined)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ocean')
    expect(getQRColorPreference()).toBe('ocean')
  })

  it('P4: never throws when storage writes fail (private browsing / quota)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => setQRColorPreference('forest')).not.toThrow()
  })
})
