import { useId } from 'react'
import './PillSelect.css'

/**
 * PillSelect — the shared pill/segmented-button single-select control (spec
 * 038 FR-009/FR-010). Replaces every "who settles"/"how is it resolved"
 * dropdown in the app with the same radiogroup-of-pills pattern, including
 * the disabled/locked-option treatment the original oracle tab strip used.
 *
 * options: [{ value, label, icon?, disabled?, disabledReason? }]
 */
function PillSelect({ label, options, value, onChange, disabled = false, multiline = false }) {
  const labelId = useId()
  const enabledValues = options.filter((o) => !o.disabled).map((o) => o.value)
  // Roving tabindex: the selected pill is the tab stop when it's enabled;
  // otherwise the first enabled pill is, so the group is always reachable.
  const tabStopValue = enabledValues.includes(value) ? value : enabledValues[0]

  const focusOption = (val) => {
    const el = document.getElementById(`${labelId}-opt-${val}`)
    el?.focus()
  }

  const moveSelection = (fromValue, delta) => {
    if (enabledValues.length === 0) return
    const idx = enabledValues.indexOf(fromValue)
    const nextIdx = idx === -1
      ? 0
      : (idx + delta + enabledValues.length) % enabledValues.length
    const next = enabledValues[nextIdx]
    onChange(next)
    focusOption(next)
  }

  const handleKeyDown = (opt) => (e) => {
    if (disabled) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      moveSelection(opt.value, 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      moveSelection(opt.value, -1)
    }
  }

  return (
    <div className="pill-select-wrap">
      {label && <span id={labelId} className="fm-label">{label}</span>}
      <div
        className={`pill-select${multiline ? ' pill-select-multiline' : ''}`}
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
      >
        {options.map((opt) => {
          const active = opt.value === value
          const locked = !!opt.disabled
          const reasonId = `${labelId}-opt-${opt.value}-reason`
          return (
            // The reason span is a SIBLING of the button, not a child — a
            // descendant would be pulled into the button's accessible NAME
            // (breaking "name: Oracle" matching); aria-describedby associates
            // it as a DESCRIPTION instead, announced after the name.
            <span key={opt.value} className="pill-select-option-wrap">
              <button
                id={`${labelId}-opt-${opt.value}`}
                type="button"
                role="radio"
                aria-checked={active}
                aria-disabled={locked || undefined}
                aria-describedby={locked && opt.disabledReason ? reasonId : undefined}
                disabled={disabled || locked}
                title={locked ? opt.disabledReason : undefined}
                tabIndex={opt.value === tabStopValue ? 0 : -1}
                className={`pill-select-option ${active ? 'active' : ''} ${locked ? 'locked' : ''}`}
                onClick={() => !locked && onChange(opt.value)}
                onKeyDown={handleKeyDown(opt)}
              >
                {opt.icon && <span className="pill-select-option-icon" aria-hidden="true">{opt.icon}</span>}
                <span className="pill-select-option-label">{opt.label}</span>
                {locked && (
                  <svg className="pill-select-option-lock" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </button>
              {locked && opt.disabledReason && (
                <span id={reasonId} className="sr-only">{opt.disabledReason}</span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default PillSelect
