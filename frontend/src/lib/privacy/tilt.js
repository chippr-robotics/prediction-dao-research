/**
 * Pure device-orientation classifier for tilt-to-hide (spec 046).
 *
 * Turns a DeviceOrientationEvent reading ({ beta, gamma }) into a coarse
 * 'viewing' | 'hidden' state. No DOM, no side effects, fully deterministic — all
 * the tilt math lives here so it can be unit-tested without a device.
 *
 * Model: the phone is "flat" (hidden) when its screen faces up or down — i.e. the
 * screen normal points near-vertical. Held at a viewing angle (portrait OR
 * landscape) the normal points sideways. We measure the screen normal's
 * inclination from flat and apply hysteresis (separate enter/exit thresholds) so
 * the state does not flicker near the boundary (FR-005).
 */

/** Default tunables. `settleMs` is consumed by the provider, not this module. */
export const TILT_DEFAULTS = {
  // Enter 'hidden' only when inclination-from-flat drops to/below this (deg).
  enterFlatDeg: 20,
  // Enter 'viewing' only when inclination-from-flat rises to/above this (deg).
  exitFlatDeg: 35,
  // Sustained-state debounce applied by PrivacyProvider (ms).
  settleMs: 200,
}

const DEG = Math.PI / 180

/**
 * Inclination of the screen from flat, in degrees: 0 = perfectly flat (face up
 * or down), 90 = held fully upright (portrait or landscape viewing).
 *
 * The screen normal's vertical component ≈ cos(beta)·cos(gamma). Taking the
 * absolute value folds face-down onto face-up (both are "flat"). The angle of
 * that normal from vertical is the inclination-from-flat we compare against.
 */
export function inclinationFromFlat(beta, gamma) {
  const verticality = Math.abs(Math.cos(beta * DEG) * Math.cos(gamma * DEG))
  // Clamp to guard against tiny FP overshoot before acos.
  const clamped = Math.min(1, Math.max(0, verticality))
  return Math.acos(clamped) / DEG
}

/**
 * Classify a reading into 'viewing' | 'hidden' with hysteresis.
 *
 * @param {{beta:number|null, gamma:number|null}} reading DeviceOrientationEvent angles (deg)
 * @param {'viewing'|'hidden'} prevState previous committed state (for hysteresis)
 * @param {{enterFlatDeg?:number, exitFlatDeg?:number}} [options]
 * @returns {'viewing'|'hidden'}
 */
export function classifyOrientation(reading, prevState = 'viewing', options = {}) {
  const enterFlatDeg = options.enterFlatDeg ?? TILT_DEFAULTS.enterFlatDeg
  const exitFlatDeg = options.exitFlatDeg ?? TILT_DEFAULTS.exitFlatDeg

  const beta = reading ? reading.beta : null
  const gamma = reading ? reading.gamma : null

  // No usable data — never flip state on a null/garbage reading.
  if (beta == null || gamma == null || Number.isNaN(beta) || Number.isNaN(gamma)) {
    return prevState === 'hidden' ? 'hidden' : 'viewing'
  }

  const incl = inclinationFromFlat(beta, gamma)

  if (incl <= enterFlatDeg) return 'hidden'
  if (incl >= exitFlatDeg) return 'viewing'
  // Dead-band between thresholds: hold the previous state (anti-flicker).
  return prevState === 'hidden' ? 'hidden' : 'viewing'
}
