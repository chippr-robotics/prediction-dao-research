import { useState } from 'react'
import { formatTileClock, formatTileDay, formatTimelineSpan, toDatetimeLocal } from './wagerTimeline'
import './FriendMarketsModal.css'
import './OpenChallengeModal.css'

/**
 * DeadlineTimeline — the two-deadline timeline element shared by the wager create flows (open
 * challenge, group pool). Extracted from OpenChallengeModal (feature 024) so group pools present
 * their join/resolution windows the same way (pool-manager tester feedback): each deadline has a
 * slider for coarse picking, and tapping its stat tile opens a datetime-local input for exact
 * manual entry. All labels default to the open-challenge wording; callers rename them per surface.
 *
 * Both deadlines are controlled <input type="datetime-local"> string values. Sliding the first
 * deadline drags the second with it (constant gap) so the timeline can never be slid into a
 * first-after-second state.
 */
const HOUR_MS = 3600 * 1000
const DEFAULT_ACCEPT_MAX_HOURS = 30 * 24  // open-challenge contract MAX_ACCEPT_WINDOW (30 days)
const DEFAULT_RESOLVE_MAX_HOURS = 90 * 24 // slider cap — comfortably under the 180-day resolve window
const DEFAULT_RESOLVE_GAP_MS = 7 * 24 * HOUR_MS

export default function DeadlineTimeline({
  acceptBy,
  resolveBy,
  onAcceptChange,
  onResolveChange,
  disabled,
  idPrefix = 'oc',
  acceptLabel = 'Open for acceptance until',
  acceptHint = 'After this, the challenge can no longer be taken and your stake is refundable.',
  acceptTileHead = 'Open until',
  resolveLabel = 'Must be resolved by',
  resolveHint = 'The outcome must be submitted before this time.',
  resolveTileHead = 'Resolve by',
  acceptMaxHours = DEFAULT_ACCEPT_MAX_HOURS,
  resolveMaxHours = DEFAULT_RESOLVE_MAX_HOURS,
  summary = (openSpan, settleSpan) => `Open ${openSpan} for a taker · then up to ${settleSpan} to settle`,
}) {
  const [manualFor, setManualFor] = useState(null) // null | 'accept' | 'resolve'
  // Mount-time "now" anchors the slider scale so positions don't drift while the form is open.
  const [nowMs] = useState(() => Date.now())
  const acceptMs = acceptBy ? new Date(acceptBy).getTime() : NaN
  const resolveMs = resolveBy ? new Date(resolveBy).getTime() : NaN
  const acceptValid = Number.isFinite(acceptMs)
  const resolveValid = Number.isFinite(resolveMs)

  const clampHours = (h, max) => Math.min(max, Math.max(1, h))
  const acceptHours = acceptValid ? clampHours(Math.round((acceptMs - nowMs) / HOUR_MS), acceptMaxHours) : 48
  const resolveHours = acceptValid && resolveValid
    ? clampHours(Math.round((resolveMs - acceptMs) / HOUR_MS), resolveMaxHours)
    : 7 * 24

  const handleAcceptSlide = (e) => {
    const nextAccept = nowMs + Number(e.target.value) * HOUR_MS
    // Sliding the acceptance point drags the resolve point with it (constant gap) so the
    // timeline can never be slid into an accept-after-resolve state.
    const gap = acceptValid && resolveValid && resolveMs > acceptMs ? resolveMs - acceptMs : DEFAULT_RESOLVE_GAP_MS
    onAcceptChange(toDatetimeLocal(nextAccept))
    onResolveChange(toDatetimeLocal(nextAccept + gap))
  }

  const handleResolveSlide = (e) => {
    const base = acceptValid ? acceptMs : nowMs + 48 * HOUR_MS
    onResolveChange(toDatetimeLocal(base + Number(e.target.value) * HOUR_MS))
  }

  const describe = (ms) => Number.isFinite(ms)
    ? `${formatTileClock(new Date(ms))} · ${formatTileDay(new Date(ms))}`
    : '—'

  // Track percentages over the full now → resolve span (amber = open for acceptance,
  // green = active wager window) — same visual grammar as the 1v1 timeline.
  const span = Math.max(1, (resolveValid ? resolveMs : nowMs + 1) - nowMs)
  const acceptPct = acceptValid ? Math.max(0, Math.min(100, ((acceptMs - nowMs) / span) * 100)) : 0
  const trackStyle = {
    background: `linear-gradient(to right,` +
      ` var(--fm-accept) 0%, var(--fm-accept) ${acceptPct}%,` +
      ` var(--fm-active) ${acceptPct}%, var(--fm-active) 100%)`
  }

  const toggleManual = (which) => setManualFor((cur) => (cur === which ? null : which))

  return (
    <div className="fm-form-group fm-form-full fm-endtime oc-timeline">
      <div className="oc-deadline-slider">
        <div className="fm-input-header">
          <label htmlFor={`${idPrefix}-accept-slider`}>{acceptLabel} <span className="fm-required">*</span></label>
          <span className="fm-odds-value">{describe(acceptMs)}</span>
        </div>
        <input
          id={`${idPrefix}-accept-slider`} type="range" className="fm-odds-slider"
          min={1} max={acceptMaxHours} step={1}
          value={acceptHours} onChange={handleAcceptSlide} disabled={disabled}
          aria-valuetext={describe(acceptMs)}
        />
        <span className="fm-hint">{acceptHint}</span>
      </div>

      <div className="oc-deadline-slider">
        <div className="fm-input-header">
          <label htmlFor={`${idPrefix}-resolve-slider`}>{resolveLabel} <span className="fm-required">*</span></label>
          <span className="fm-odds-value">{describe(resolveMs)}</span>
        </div>
        <input
          id={`${idPrefix}-resolve-slider`} type="range" className="fm-odds-slider"
          min={1} max={resolveMaxHours} step={1}
          value={resolveHours} onChange={handleResolveSlide} disabled={disabled}
          aria-valuetext={describe(resolveMs)}
        />
        <span className="fm-hint">{resolveHint}</span>
      </div>

      {acceptValid && resolveValid && (
        <>
          <span className="fm-endtime-summary">
            {summary(
              formatTimelineSpan(new Date(nowMs), new Date(acceptMs)),
              formatTimelineSpan(new Date(acceptMs), new Date(resolveMs))
            )}
          </span>

          <div className="fm-timeline-track" style={trackStyle} aria-hidden="true">
            <span className="fm-timeline-node is-accept" style={{ left: `${acceptPct}%` }} />
            <span className="fm-timeline-node is-resolve" style={{ left: '100%' }} />
          </div>
        </>
      )}

      <div className="fm-stat-tiles oc-stat-tiles">
        <button
          type="button"
          className="fm-stat-tile is-accept oc-stat-tile-btn"
          onClick={() => toggleManual('accept')}
          disabled={disabled}
          aria-expanded={manualFor === 'accept'}
          aria-controls={manualFor === 'accept' ? `${idPrefix}-accept-by` : undefined}
        >
          <span className="fm-stat-head"><span className="fm-stat-dot" aria-hidden="true" />{acceptTileHead}</span>
          <span className="fm-stat-time">{acceptValid ? formatTileClock(new Date(acceptMs)) : '—'}</span>
          <span className="fm-stat-day">{acceptValid ? formatTileDay(new Date(acceptMs)) : ''}</span>
          <span className="oc-tile-edit">Tap to type a date</span>
        </button>
        <button
          type="button"
          className="fm-stat-tile is-resolve oc-stat-tile-btn"
          onClick={() => toggleManual('resolve')}
          disabled={disabled}
          aria-expanded={manualFor === 'resolve'}
          aria-controls={manualFor === 'resolve' ? `${idPrefix}-resolve-by` : undefined}
        >
          <span className="fm-stat-head"><span className="fm-stat-dot" aria-hidden="true" />{resolveTileHead}</span>
          <span className="fm-stat-time">{resolveValid ? formatTileClock(new Date(resolveMs)) : '—'}</span>
          <span className="fm-stat-day">{resolveValid ? formatTileDay(new Date(resolveMs)) : ''}</span>
          <span className="oc-tile-edit">Tap to type a date</span>
        </button>
      </div>

      {manualFor === 'accept' && (
        <div className="oc-manual-entry">
          <label htmlFor={`${idPrefix}-accept-by`}>Exact date &amp; time — {acceptLabel.toLowerCase()}</label>
          <input
            id={`${idPrefix}-accept-by`} type="datetime-local" className="oc-datetime fm-datetime-input"
            value={acceptBy} min={toDatetimeLocal(nowMs)}
            onChange={(e) => onAcceptChange(e.target.value)} disabled={disabled}
          />
        </div>
      )}
      {manualFor === 'resolve' && (
        <div className="oc-manual-entry">
          <label htmlFor={`${idPrefix}-resolve-by`}>Exact date &amp; time — {resolveLabel.toLowerCase()}</label>
          <input
            id={`${idPrefix}-resolve-by`} type="datetime-local" className="oc-datetime fm-datetime-input"
            value={resolveBy} min={acceptBy || toDatetimeLocal(nowMs)}
            onChange={(e) => onResolveChange(e.target.value)} disabled={disabled}
          />
        </div>
      )}
    </div>
  )
}
