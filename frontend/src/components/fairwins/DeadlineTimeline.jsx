import { useCallback, useRef, useState } from 'react'
import { formatTileClock, formatTileDay, clampToRange, stepByMinutes } from './wagerTimeline'
import SetTimeModal from './SetTimeModal'
import InfoTip from '../ui/InfoTip'
import './FriendMarketsModal.css'
import './OpenChallengeModal.css'
import './DeadlineTimeline.css'

const STEP_MINUTES = 15
const STEP_MINUTES_LARGE = 60

/**
 * DeadlineTimeline — the single canonical time control shared by every wager
 * create flow (spec 038 US1). Renders one milestone per deadline (accept,
 * end, resolve, …) on a shared track. Editable milestones are draggable dots
 * (Pointer Events + arrow-key stepping); tapping a milestone's tile opens
 * SetTimeModal for exact entry. Non-editable milestones (e.g. the 1v1 flow's
 * derived "Accept by"/"Resolve by") render as read-only dots/tiles.
 *
 * `milestones`: [{ key, label, tileHead, value, min, max, editable, hint,
 *   segmentColor, dotClass, tileClass }] — value/min/max are unix-ms.
 * `onChange(key, epochMs)` fires on drag, keyboard step, or a modal Set.
 */
export default function DeadlineTimeline({ milestones, onChange, disabled, idPrefix = 'oc', summary }) {
  const [modalFor, setModalFor] = useState(null)
  const trackRef = useRef(null)
  const dragKeyRef = useRef(null)

  const finite = milestones.filter((m) => Number.isFinite(m.value))
  const trackMin = milestones[0]?.min ?? 0
  const lastValue = milestones[milestones.length - 1]?.value
  const trackMax = Number.isFinite(lastValue) ? Math.max(trackMin + 60000, lastValue) : trackMin + 60000
  const span = Math.max(1, trackMax - trackMin)

  const pctFor = (ms) => clampToRange(((ms - trackMin) / span) * 100, 0, 100)

  const valueFromClientX = useCallback((clientX) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return trackMin
    const frac = clampToRange((clientX - rect.left) / rect.width, 0, 1)
    return trackMin + frac * span
  }, [trackMin, span])

  const commitDrag = useCallback((key, rawMs) => {
    const idx = milestones.findIndex((m) => m.key === key)
    const m = milestones[idx]
    if (!m || !onChange) return
    const rounded = Math.round(rawMs / 60000) * 60000
    const clamped = clampToRange(rounded, m.min, m.max)
    onChange(key, clamped)

    // Legacy "drag accept drags resolve" behavior: when the first of exactly
    // two editable milestones moves, shift the second by the same delta so
    // the gap between them stays constant (never crosses accept-after-resolve).
    if (idx === 0 && milestones.length === 2 && milestones[1].editable && Number.isFinite(m.value)) {
      const delta = clamped - m.value
      const next = milestones[1]
      const shifted = clampToRange(next.value + delta, next.min, next.max)
      onChange(next.key, shifted)
    }
  }, [milestones, onChange])

  const handlePointerDown = (m) => (e) => {
    if (disabled || !m.editable) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragKeyRef.current = m.key
    commitDrag(m.key, valueFromClientX(e.clientX))
  }
  const handlePointerMove = (e) => {
    if (!dragKeyRef.current) return
    commitDrag(dragKeyRef.current, valueFromClientX(e.clientX))
  }
  const handlePointerUp = (e) => {
    if (dragKeyRef.current) e.currentTarget.releasePointerCapture?.(e.pointerId)
    dragKeyRef.current = null
  }

  const handleKeyDown = (m) => (e) => {
    if (disabled || !m.editable) return
    const stepMin = e.shiftKey ? STEP_MINUTES_LARGE : STEP_MINUTES
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      commitDrag(m.key, stepByMinutes(m.value, stepMin))
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      commitDrag(m.key, stepByMinutes(m.value, -stepMin))
    } else if (e.key === 'Home') {
      e.preventDefault()
      commitDrag(m.key, m.min)
    } else if (e.key === 'End') {
      e.preventDefault()
      commitDrag(m.key, m.max)
    }
  }

  const describe = (ms) => Number.isFinite(ms)
    ? `${formatTileClock(new Date(ms))} · ${formatTileDay(new Date(ms))}`
    : '—'

  const sorted = [...finite].sort((a, b) => a.value - b.value)
  const gradientStops = []
  let prevPct = 0
  sorted.forEach((m, i) => {
    const pct = pctFor(m.value)
    const endPct = i === sorted.length - 1 ? 100 : pct
    gradientStops.push(`${m.segmentColor} ${prevPct}%`, `${m.segmentColor} ${endPct}%`)
    prevPct = endPct
  })
  const trackStyle = gradientStops.length
    ? { background: `linear-gradient(to right, ${gradientStops.join(', ')})` }
    : undefined

  return (
    <div className="fm-form-group fm-form-full fm-endtime oc-timeline" id={`${idPrefix}-timeline`}>
      {summary && <span className="fm-endtime-summary">{summary}</span>}

      {trackStyle && (
        <div className="fm-timeline-track dt-track" style={trackStyle} ref={trackRef}>
          {milestones.map((m) => Number.isFinite(m.value) && (
            <span
              key={m.key}
              id={`${idPrefix}-${m.key}-slider`}
              className={`fm-timeline-node ${m.dotClass} ${m.editable ? 'dt-node-draggable' : ''}`}
              style={{ left: `${pctFor(m.value)}%` }}
              role={m.editable ? 'slider' : undefined}
              tabIndex={m.editable && !disabled ? 0 : undefined}
              aria-hidden={m.editable ? undefined : 'true'}
              aria-label={m.editable ? m.label : undefined}
              aria-valuemin={m.editable ? m.min : undefined}
              aria-valuemax={m.editable ? m.max : undefined}
              aria-valuenow={m.editable ? m.value : undefined}
              aria-valuetext={m.editable ? describe(m.value) : undefined}
              aria-disabled={m.editable && disabled ? 'true' : undefined}
              onPointerDown={handlePointerDown(m)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={handleKeyDown(m)}
            />
          ))}
        </div>
      )}

      <div className={`fm-stat-tiles ${milestones.length === 2 ? 'oc-stat-tiles' : ''}`}>
        {milestones.map((m) => {
          const tileId = `${idPrefix}-${m.key}-tile`
          const tileClassName = `fm-stat-tile ${m.tileClass}${m.editable ? ' oc-stat-tile-btn' : ''}`
          const content = (
            <>
              <span className="fm-stat-head"><span className="fm-stat-dot" aria-hidden="true" />{m.tileHead}</span>
              <span className="fm-stat-time">{Number.isFinite(m.value) ? formatTileClock(new Date(m.value)) : '—'}</span>
              <span className="fm-stat-day">{Number.isFinite(m.value) ? formatTileDay(new Date(m.value)) : ''}</span>
              {m.editable && <span className="oc-tile-edit">Tap to set</span>}
            </>
          )
          // The hint moved from an inline paragraph to a corner InfoTip
          // (spec 039). It overlays the tile from a wrapper because the
          // editable tile is itself a button — nesting the two would be
          // invalid interactive content.
          const tile = m.editable ? (
            <button
              id={tileId}
              className={tileClassName}
              type="button"
              onClick={() => setModalFor(m.key)}
              disabled={disabled}
              aria-haspopup="dialog"
              aria-label={`${m.tileHead}: ${describe(m.value)}. Tap to set exact date and time.`}
            >
              {content}
            </button>
          ) : (
            <div id={tileId} className={tileClassName}>{content}</div>
          )
          return (
            <div key={m.key} className="dt-tile-wrap">
              {tile}
              {m.hint && (
                <InfoTip label={`About: ${m.tileHead}`} className="dt-tile-info">{m.hint}</InfoTip>
              )}
            </div>
          )
        })}
      </div>

      {milestones.map((m) => m.editable && modalFor === m.key && (
        <SetTimeModal
          key={`modal-${m.key}`}
          open
          title="Set date and time"
          label={m.label}
          value={m.value}
          min={m.min}
          max={m.max}
          onCancel={() => setModalFor(null)}
          onSet={(ms) => { commitDrag(m.key, ms); setModalFor(null) }}
        />
      ))}
    </div>
  )
}
