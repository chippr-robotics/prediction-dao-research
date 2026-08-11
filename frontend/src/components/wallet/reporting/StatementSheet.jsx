/**
 * StatementSheet — the bottom sheet that generates a statement
 * (issue #1026 follow-up; spec 016 contracts/reports-ui.md).
 *
 * The reporting page used to lay every control out at once: five radio options
 * with paragraphs, seven checkboxes, five more radios, and a generate button at
 * the bottom. That is a settings form, not a way to get a statement. Here the
 * whole choice lives in one sheet, arrives with a usable default already
 * selected, and is expressed in icons and short labels — so the common case is
 * open, tap Generate, done.
 *
 * What the redesign does NOT do is hide a consequence. The type tiles change
 * what the totals COVER, so the sheet states the scope of whatever is selected
 * in plain words, and warns before generating when the choice narrows the
 * statement. Only the section toggles — which change what is printed, never a
 * figure — are folded away behind a disclosure.
 *
 * Reuses the app's shared `.asset-sheet-*` modal shell so it behaves like every
 * other sheet in the product: scrim, escape, focus restore, body scroll lock.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import NavIcon from '../../nav/NavIcon'
// The `.asset-sheet-*` shell this sheet reuses is defined in AssetDetailSheet's
// stylesheet, which is imported by that component alone. Relying on some other
// surface having mounted first would leave the sheet unstyled and unpositioned
// exactly when nothing else on the Reporting page renders it — which is always.
import '../AssetDetailSheet.css'
import {
  SECTION_DEFS,
  STATEMENT_CLASSES,
  STATEMENT_TYPES,
  defaultSections,
  statementTypeDef,
  statementTypeOptions,
} from '../../../data/reports/statement/reportTypes'
import { classLabel } from '../../../data/reports/activityClassification'
import { PERIOD_KINDS, resolvePreset, validateRange } from '../../../utils/reportPeriods'
import {
  CLASS_ICONS,
  PERIOD_CHIPS,
  SECTION_ICONS,
  TYPE_ICONS,
  TYPE_SHORT_LABELS,
} from './reportingIcons'

/** A date input's YYYY-MM-DD in UTC, so bounds are deterministic. */
function toMs(dateStr, endOfDay = false) {
  if (!dateStr) return NaN
  const base = Date.parse(`${dateStr}T00:00:00.000Z`)
  if (!Number.isFinite(base)) return NaN
  return endOfDay ? base + (24 * 3600 * 1000 - 1) : base
}

/**
 * The selection a member finds already made when the sheet opens: a complete
 * account statement for the period they are currently in. Module-local and
 * deliberately NOT exported — a component file that also exports a constant
 * breaks fast refresh (react-refresh/only-export-components), and nothing
 * outside this sheet needs the draft.
 */
const DEFAULT_DRAFT = Object.freeze({
  type: STATEMENT_TYPES.FULL,
  classes: null,
  sections: defaultSections(),
  periodKind: PERIOD_KINDS.CURRENT_MONTH,
})

export default function StatementSheet({ onClose, onGenerate, busy = false, error = null, nowMs, networkName, account }) {
  const sheetRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const [now] = useState(() => nowMs ?? Date.now())

  const [type, setType] = useState(DEFAULT_DRAFT.type)
  const [classes, setClasses] = useState(null)
  const [sections, setSections] = useState(() => defaultSections())
  const [periodKind, setPeriodKind] = useState(DEFAULT_DRAFT.periodKind)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [showSections, setShowSections] = useState(false)

  // Modal behaviour, matching the other sheets in the product.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement
    sheetRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus?.()
    }
  }, [onClose])

  const isCustomPeriod = periodKind === PERIOD_KINDS.CUSTOM
  const isCustomType = type === STATEMENT_TYPES.CUSTOM
  const typeDef = statementTypeDef(type)

  const customRange = useMemo(() => ({ from: toMs(fromDate), to: toMs(toDate, true) }), [fromDate, toDate])
  const periodCheck = useMemo(() => {
    if (!isCustomPeriod) return { valid: true, error: null }
    if (!fromDate || !toDate) return { valid: false, error: 'Choose a start and end date.' }
    return validateRange(customRange, now)
  }, [isCustomPeriod, fromDate, toDate, customRange, now])

  // The resolved period, shown on the button so a member sees exactly what they
  // are about to get rather than the name of a preset.
  const periodLabel = useMemo(() => {
    if (isCustomPeriod) return periodCheck.valid ? `${fromDate} to ${toDate}` : 'a custom range'
    try {
      return resolvePreset(periodKind, now).label
    } catch {
      return ''
    }
  }, [isCustomPeriod, periodCheck.valid, fromDate, toDate, periodKind, now])

  const activeClasses = isCustomType ? classes || [] : typeDef.classes
  const narrowed = Boolean(activeClasses && activeClasses.length)
  const sectionsOff = SECTION_DEFS.filter((s) => !sections[s.id])

  const toggleClass = (cls) => {
    const current = classes || []
    setClasses(current.includes(cls) ? current.filter((c) => c !== cls) : [...current, cls])
  }

  const chooseType = (next) => {
    setType(next)
    // Leaving Custom drops the hand-picked list: the preset's own scope is the
    // reason for choosing it.
    if (next !== STATEMENT_TYPES.CUSTOM) setClasses(null)
  }

  const submit = (format) => {
    if (!periodCheck.valid || busy) return
    onGenerate({
      format,
      period: isCustomPeriod
        ? { kind: PERIOD_KINDS.CUSTOM, from: customRange.from, to: customRange.to }
        : { kind: periodKind },
      statement: { type, classes: isCustomType ? classes : null, sections },
    })
  }

  return (
    <div className="asset-sheet-backdrop statement-sheet-backdrop">
      <button type="button" className="asset-sheet-scrim" aria-label="Close statement options" onClick={onClose} />
      <div
        className="asset-sheet statement-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="statement-sheet-title"
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="asset-sheet-grabber" aria-hidden="true" />

        <header className="statement-sheet-header">
          <div>
            <h3 id="statement-sheet-title">New statement</h3>
            <p className="statement-sheet-context">
              {[networkName, account ? `${account.slice(0, 6)}…${account.slice(-4)}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button type="button" className="asset-sheet-close" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="statement-sheet-block">
          <h4 className="statement-sheet-label" id="statement-type-label">
            Statement
          </h4>
          <div className="statement-type-grid" role="radiogroup" aria-labelledby="statement-type-label">
            {statementTypeOptions().map((option) => {
              const selected = type === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`statement-type-tile${selected ? ' is-selected' : ''}`}
                  onClick={() => chooseType(option.id)}
                >
                  <span className="statement-type-icon" aria-hidden="true">
                    <NavIcon name={TYPE_ICONS[option.id]} size={22} />
                  </span>
                  {/* The icon is decoration; this text is the accessible name. */}
                  <span className="statement-type-name">{TYPE_SHORT_LABELS[option.id]}</span>
                </button>
              )
            })}
          </div>
          {/* What the SELECTED tile covers — the blurb that used to sit under
              all five at once, shown only where it is now relevant. */}
          <p className="statement-sheet-caption" aria-live="polite">
            {isCustomType && !narrowed ? 'Nothing selected yet — this will cover everything.' : typeDef.blurb}
          </p>

          {isCustomType && (
            <div className="statement-class-picker" role="group" aria-label="Activity types to include">
              {STATEMENT_CLASSES.map((cls) => {
                const on = (classes || []).includes(cls)
                return (
                  <button
                    key={cls}
                    type="button"
                    aria-pressed={on}
                    className={`statement-pill${on ? ' is-on' : ''}`}
                    onClick={() => toggleClass(cls)}
                  >
                    <NavIcon name={CLASS_ICONS[cls] || 'grid'} size={14} />
                    {classLabel(cls)}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section className="statement-sheet-block">
          <h4 className="statement-sheet-label" id="statement-period-label">
            Period
          </h4>
          <div className="statement-chip-row" role="radiogroup" aria-labelledby="statement-period-label">
            {PERIOD_CHIPS.map((chip) => {
              const selected = periodKind === chip.kind
              return (
                <button
                  key={chip.kind}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`statement-chip${selected ? ' is-selected' : ''}`}
                  onClick={() => setPeriodKind(chip.kind)}
                >
                  {chip.kind === PERIOD_KINDS.CUSTOM && <NavIcon name="calendar" size={14} />}
                  {chip.label}
                </button>
              )
            })}
          </div>

          {isCustomPeriod && (
            <div className="statement-date-range">
              <label>
                <span>From</span>
                <input
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(e) => setFromDate(e.target.value)}
                  aria-label="Custom start date"
                />
              </label>
              <label>
                <span>To</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  aria-label="Custom end date"
                />
              </label>
            </div>
          )}
          {!periodCheck.valid && (
            <p className="statement-sheet-error" role="alert">
              {periodCheck.error}
            </p>
          )}
        </section>

        {/* Sections are folded away because they change what is PRINTED, never
            a figure. The scope control above is never folded away for exactly
            the opposite reason. */}
        <section className="statement-sheet-block">
          <button
            type="button"
            className="statement-disclosure"
            aria-expanded={showSections}
            onClick={() => setShowSections((v) => !v)}
          >
            <NavIcon name="sliders" size={16} />
            <span className="statement-disclosure-label">Sections</span>
            <span className="statement-disclosure-value">
              {sectionsOff.length === 0 ? 'All included' : `${SECTION_DEFS.length - sectionsOff.length} of ${SECTION_DEFS.length}`}
            </span>
            <span className={`statement-disclosure-chevron${showSections ? ' is-open' : ''}`} aria-hidden="true">
              <NavIcon name="chevronDown" size={16} />
            </span>
          </button>

          {showSections && (
            <div className="statement-section-picker" role="group" aria-label="Sections to include">
              {SECTION_DEFS.map((section) => {
                const on = Boolean(sections[section.id])
                return (
                  <button
                    key={section.id}
                    type="button"
                    aria-pressed={on}
                    title={section.blurb}
                    className={`statement-pill${on ? ' is-on' : ''}`}
                    onClick={() => setSections((s) => ({ ...s, [section.id]: !s[section.id] }))}
                  >
                    <NavIcon name={SECTION_ICONS[section.id]} size={14} />
                    {section.label}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {narrowed && (
          <p className="statement-sheet-notice" role="status">
            <NavIcon name="alert" size={15} />
            <span>
              Covers {activeClasses.map((c) => classLabel(c)).join(', ')} only. Other activity in the period is
              left out of every figure, and the statement says so on its first page.
            </span>
          </p>
        )}

        {/* Generation failures surface HERE, not on the page behind: the sheet
            stays open so a member can retry, and an error rendered under the
            scrim is an error nobody reads. */}
        {error && (
          <p className="statement-sheet-notice is-error" role="alert">
            <NavIcon name="alert" size={15} />
            <span>{error}</span>
          </p>
        )}

        <footer className="statement-sheet-actions">
          <button
            type="button"
            className="statement-primary-btn"
            onClick={() => submit('pdf')}
            disabled={busy || !periodCheck.valid}
          >
            <NavIcon name="download" size={17} />
            {busy ? 'Generating…' : 'Generate statement'}
          </button>
          <button
            type="button"
            className="statement-secondary-btn"
            onClick={() => submit('csv')}
            disabled={busy || !periodCheck.valid}
            title="The full machine-readable record — never narrowed by the choices above"
          >
            <NavIcon name="table" size={16} />
            CSV
          </button>
        </footer>
        <p className="statement-sheet-foot">
          {periodLabel ? `Covers ${periodLabel.charAt(0).toLowerCase()}${periodLabel.slice(1)}. ` : ''}
          Not tax advice.
        </p>
      </div>
    </div>
  )
}
