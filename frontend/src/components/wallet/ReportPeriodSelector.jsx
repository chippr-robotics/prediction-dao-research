/**
 * ReportPeriodSelector — choose a named preset or a custom from/to range for a
 * wager tax/activity report (spec 016-wager-tax-report, FR-002/FR-013;
 * contracts/reports-ui.md).
 *
 * Emits the chosen period as `{ kind, from, to }` (epoch ms for custom) to the
 * parent's `onGenerate`. Custom ranges are validated client-side; an
 * inverted/future range shows an accessible error and disables generation.
 */

import { useMemo, useState } from 'react'
import { PERIOD_KINDS, PERIOD_PRESETS, validateRange } from '../../utils/reportPeriods'

function toMs(dateStr, endOfDay = false) {
  if (!dateStr) return NaN
  // date input value is YYYY-MM-DD; interpret in UTC for deterministic bounds.
  const base = Date.parse(`${dateStr}T00:00:00.000Z`)
  if (!Number.isFinite(base)) return NaN
  return endOfDay ? base + (24 * 3600 * 1000 - 1) : base
}

export default function ReportPeriodSelector({ onGenerate, disabled = false, nowMs }) {
  const [kind, setKind] = useState(PERIOD_KINDS.LAST_MONTH)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  // Resolve "now" once (lazy init keeps the impure clock read out of render).
  const [effectiveNow] = useState(() => nowMs ?? Date.now())

  const isCustom = kind === PERIOD_KINDS.CUSTOM

  const customRange = useMemo(
    () => ({ from: toMs(fromDate), to: toMs(toDate, true) }),
    [fromDate, toDate],
  )
  const validation = useMemo(() => {
    if (!isCustom) return { valid: true, error: null }
    if (!fromDate || !toDate) return { valid: false, error: 'Choose a start and end date.' }
    return validateRange(customRange, effectiveNow)
  }, [isCustom, fromDate, toDate, customRange, effectiveNow])

  const handleGenerate = () => {
    if (!validation.valid) return
    if (isCustom) onGenerate({ kind, from: customRange.from, to: customRange.to })
    else onGenerate({ kind })
  }

  return (
    <div className="report-period-selector">
      <fieldset>
        <legend>Reporting period</legend>
        <div role="radiogroup" aria-label="Reporting period">
          {PERIOD_PRESETS.map((p) => (
            <label key={p.kind} className="period-option">
              <input
                type="radio"
                name="report-period"
                value={p.kind}
                checked={kind === p.kind}
                onChange={() => setKind(p.kind)}
              />
              {p.name}
            </label>
          ))}
          <label className="period-option">
            <input
              type="radio"
              name="report-period"
              value={PERIOD_KINDS.CUSTOM}
              checked={isCustom}
              onChange={() => setKind(PERIOD_KINDS.CUSTOM)}
            />
            Custom range
          </label>
        </div>

        {isCustom && (
          <div className="custom-range">
            <label>
              From
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label="Custom start date"
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label="Custom end date"
              />
            </label>
          </div>
        )}
      </fieldset>

      {!validation.valid && (
        <p className="period-error" role="alert">
          {validation.error}
        </p>
      )}

      <button
        type="button"
        className="generate-report-btn"
        onClick={handleGenerate}
        disabled={disabled || !validation.valid}
      >
        Generate report
      </button>
    </div>
  )
}
