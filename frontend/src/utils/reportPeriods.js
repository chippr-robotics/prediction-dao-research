/**
 * Reporting-period resolution for the wager tax/activity report
 * (spec 016-wager-tax-report, FR-002 / FR-013).
 *
 * All boundaries are resolved in a single fixed reporting time zone — UTC —
 * so a given preset always maps to the same instants regardless of the
 * viewer's locale (spec Edge Cases: "Period boundaries / time zone").
 *
 * Pure module: no I/O, no ambient clock. The current time arrives as `nowMs`
 * so resolution and validation are deterministic and unit-testable. Instants
 * are epoch-millisecond numbers; ranges are inclusive [from, to].
 */

export const PERIOD_KINDS = Object.freeze({
  CUSTOM: 'custom',
  LAST_MONTH: 'last_month',
  LAST_QUARTER: 'last_quarter',
  LAST_YEAR: 'last_year',
  LAST_CALENDAR_YEAR: 'last_calendar_year',
})

/** Named presets in display order, for rendering a selectable list (FR-002). */
export const PERIOD_PRESETS = Object.freeze([
  { kind: PERIOD_KINDS.LAST_MONTH, name: 'Last month' },
  { kind: PERIOD_KINDS.LAST_QUARTER, name: 'Last quarter' },
  { kind: PERIOD_KINDS.LAST_YEAR, name: 'Last year' },
  { kind: PERIOD_KINDS.LAST_CALENDAR_YEAR, name: 'Last calendar year' },
])

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** Inclusive end of a UTC day/period: the last millisecond before `nextStartMs`. */
function endOfRange(nextStartMs) {
  return nextStartMs - 1
}

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Resolve a named preset to an inclusive UTC [from, to] range plus a stable
 * human label. Custom periods are resolved by `resolveCustomPeriod`.
 *
 * @param {string} kind - one of PERIOD_KINDS (excluding CUSTOM)
 * @param {number} nowMs - current time in epoch ms (caller-supplied clock)
 * @returns {{kind: string, from: number, to: number, label: string}}
 */
export function resolvePreset(kind, nowMs) {
  const now = new Date(nowMs)
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() // 0-11

  switch (kind) {
    case PERIOD_KINDS.LAST_MONTH: {
      const from = Date.UTC(y, m - 1, 1)
      const to = endOfRange(Date.UTC(y, m, 1))
      const d = new Date(from)
      return {
        kind,
        from,
        to,
        label: `Last month (${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()})`,
      }
    }
    case PERIOD_KINDS.LAST_QUARTER: {
      const currentQuarter = Math.floor(m / 3) // 0-3
      // Previous completed quarter (may roll into the prior year).
      let qYear = y
      let qIndex = currentQuarter - 1
      if (qIndex < 0) {
        qIndex = 3
        qYear -= 1
      }
      const startMonth = qIndex * 3
      const from = Date.UTC(qYear, startMonth, 1)
      const to = endOfRange(Date.UTC(qYear, startMonth + 3, 1))
      return { kind, from, to, label: `Last quarter (Q${qIndex + 1} ${qYear})` }
    }
    case PERIOD_KINDS.LAST_YEAR: {
      // Trailing 12 months ending now.
      const from = Date.UTC(y - 1, m, now.getUTCDate(),
        now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds())
      const to = nowMs
      return {
        kind,
        from,
        to,
        label: `Last year (${isoDate(from)} – ${isoDate(to)})`,
      }
    }
    case PERIOD_KINDS.LAST_CALENDAR_YEAR: {
      const year = y - 1
      const from = Date.UTC(year, 0, 1)
      const to = endOfRange(Date.UTC(year + 1, 0, 1))
      return { kind, from, to, label: `Last calendar year (${year})` }
    }
    default:
      throw new Error(`Unknown period preset: ${kind}`)
  }
}

/**
 * Build a custom inclusive range from user from/to instants.
 *
 * @param {number} fromMs - inclusive start (epoch ms)
 * @param {number} toMs - inclusive end (epoch ms)
 * @returns {{kind: string, from: number, to: number, label: string}}
 */
export function resolveCustomPeriod(fromMs, toMs) {
  return {
    kind: PERIOD_KINDS.CUSTOM,
    from: fromMs,
    to: toMs,
    label: `Custom (${isoDate(fromMs)} – ${isoDate(toMs)})`,
  }
}

/**
 * Validate a resolved range (FR-013). Returns a typed result rather than
 * throwing so the UI can disable generation and show the message.
 *
 * Rules: both bounds finite numbers; `to` not before `from`; `to` not in the
 * future relative to `nowMs`.
 *
 * @param {{from: number, to: number}} range
 * @param {number} nowMs - current time in epoch ms
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateRange(range, nowMs) {
  const { from, to } = range || {}
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return { valid: false, error: 'Enter both a start and end date.' }
  }
  if (to < from) {
    return { valid: false, error: 'The end date must be on or after the start date.' }
  }
  if (to > nowMs) {
    return { valid: false, error: 'The end date cannot be in the future.' }
  }
  return { valid: true, error: null }
}

/**
 * Convenience: resolve any period kind (preset or custom) to a labelled range.
 *
 * @param {object} input
 * @param {string} input.kind - PERIOD_KINDS value
 * @param {number} [input.from] - custom start (epoch ms), required when kind=custom
 * @param {number} [input.to] - custom end (epoch ms), required when kind=custom
 * @param {number} input.nowMs - current time in epoch ms
 * @returns {{kind: string, from: number, to: number, label: string}}
 */
export function resolvePeriod({ kind, from, to, nowMs }) {
  if (kind === PERIOD_KINDS.CUSTOM) return resolveCustomPeriod(from, to)
  return resolvePreset(kind, nowMs)
}
