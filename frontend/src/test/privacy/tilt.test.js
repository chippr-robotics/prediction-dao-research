import { describe, it, expect } from 'vitest'
import { classifyOrientation, inclinationFromFlat, TILT_DEFAULTS } from '../../lib/privacy/tilt'

describe('tilt classifier (spec 047)', () => {
  describe('inclinationFromFlat', () => {
    it('is ~0deg when the phone lies flat, face up', () => {
      expect(inclinationFromFlat(0, 0)).toBeLessThan(2)
    })

    it('is ~0deg when the phone lies flat, face down', () => {
      // beta near 180 => normal points down => still "flat"
      expect(inclinationFromFlat(180, 0)).toBeLessThan(2)
    })

    it('is large when held upright in portrait', () => {
      expect(inclinationFromFlat(70, 0)).toBeGreaterThan(60)
    })

    it('is large when held in landscape (gamma dominant)', () => {
      expect(inclinationFromFlat(0, 80)).toBeGreaterThan(60)
    })
  })

  describe('classifyOrientation', () => {
    it('classifies a flat, face-up phone as hidden', () => {
      expect(classifyOrientation({ beta: 0, gamma: 0 }, 'viewing')).toBe('hidden')
    })

    it('classifies a face-down phone as hidden', () => {
      expect(classifyOrientation({ beta: 180, gamma: 0 }, 'viewing')).toBe('hidden')
    })

    it('classifies a portrait viewing tilt as viewing', () => {
      expect(classifyOrientation({ beta: 70, gamma: 0 }, 'hidden')).toBe('viewing')
    })

    it('classifies a landscape viewing tilt as viewing', () => {
      expect(classifyOrientation({ beta: 0, gamma: 80 }, 'hidden')).toBe('viewing')
    })

    it('holds the previous state inside the hysteresis dead-band', () => {
      // ~28deg inclination sits between enterFlatDeg (20) and exitFlatDeg (35).
      const reading = { beta: 28, gamma: 0 }
      expect(classifyOrientation(reading, 'viewing')).toBe('viewing')
      expect(classifyOrientation(reading, 'hidden')).toBe('hidden')
    })

    it('holds the previous state on a null / NaN reading', () => {
      expect(classifyOrientation({ beta: null, gamma: null }, 'hidden')).toBe('hidden')
      expect(classifyOrientation({ beta: NaN, gamma: 0 }, 'viewing')).toBe('viewing')
      expect(classifyOrientation(null, 'hidden')).toBe('hidden')
    })

    it('exposes sane default thresholds with enter < exit', () => {
      expect(TILT_DEFAULTS.enterFlatDeg).toBeLessThan(TILT_DEFAULTS.exitFlatDeg)
    })
  })
})
