/**
 * StatementOptions — choose the KIND of statement and what goes in it
 * (issue #1026; spec 016 contracts/reports-ui.md).
 *
 * Two independent choices, kept visibly separate because they mean different
 * things:
 *   - the statement TYPE narrows which activity is reported at all, so it
 *     changes the totals. The control says so, and the generated document
 *     repeats it on page one.
 *   - the SECTIONS choose how much of the same report is printed. They change
 *     what a reader can check, never a figure.
 *
 * The default is a complete account statement with every section — a member who
 * touches nothing gets the whole record.
 */

import { useMemo } from 'react'
import {
  SECTION_DEFS,
  STATEMENT_CLASSES,
  STATEMENT_TYPES,
  statementTypeDef,
  statementTypeOptions,
} from '../../data/reports/statement/reportTypes'
import { classLabel } from '../../data/reports/activityClassification'

export default function StatementOptions({ value, onChange, disabled = false }) {
  const { type, classes, sections } = value
  const isCustom = type === STATEMENT_TYPES.CUSTOM
  const typeDef = useMemo(() => statementTypeDef(type), [type])

  const setType = (nextType) => {
    // Leaving custom drops the hand-picked classes: the preset's own scope is
    // the whole point of choosing it.
    onChange({ ...value, type: nextType, classes: nextType === STATEMENT_TYPES.CUSTOM ? classes : null })
  }

  const toggleClass = (cls) => {
    const current = classes || []
    const next = current.includes(cls) ? current.filter((c) => c !== cls) : [...current, cls]
    onChange({ ...value, classes: next })
  }

  const toggleSection = (id) => {
    onChange({ ...value, sections: { ...sections, [id]: !sections[id] } })
  }

  const noneChosen = isCustom && !(classes || []).length

  return (
    <div className="statement-options">
      <fieldset className="statement-type">
        <legend>Statement type</legend>
        <div role="radiogroup" aria-label="Statement type">
          {statementTypeOptions().map((opt) => (
            <label key={opt.id} className="statement-option">
              <input
                type="radio"
                name="statement-type"
                value={opt.id}
                checked={type === opt.id}
                disabled={disabled}
                onChange={() => setType(opt.id)}
              />
              <span className="statement-option-label">{opt.title}</span>
              <span className="statement-option-blurb">{opt.blurb}</span>
            </label>
          ))}
        </div>

        {isCustom && (
          <div className="statement-classes">
            <p id="statement-classes-help" className="statement-hint">
              Choose the activity types to include.
            </p>
            <div role="group" aria-labelledby="statement-classes-help">
              {STATEMENT_CLASSES.map((cls) => (
                <label key={cls} className="statement-check">
                  <input
                    type="checkbox"
                    checked={(classes || []).includes(cls)}
                    disabled={disabled}
                    onChange={() => toggleClass(cls)}
                  />
                  {classLabel(cls)}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* A narrowed statement reports smaller totals than the account's real
            activity. Saying so before generation is the same promise the
            document itself makes on page one. */}
        {typeDef.classes && !noneChosen && (
          <p className="statement-scope-note" role="status">
            This statement will cover only the activity types above. Other activity in the period is left
            out of every figure, and the document says so on its first page.
          </p>
        )}
        {noneChosen && (
          <p className="statement-scope-note" role="status">
            No activity types selected — the statement will cover everything.
          </p>
        )}
      </fieldset>

      <fieldset className="statement-sections">
        <legend>Include in the statement</legend>
        <div role="group" aria-label="Statement sections">
          {SECTION_DEFS.map((section) => (
            <label key={section.id} className="statement-check" title={section.blurb}>
              <input
                type="checkbox"
                checked={Boolean(sections[section.id])}
                disabled={disabled}
                onChange={() => toggleSection(section.id)}
              />
              {section.label}
            </label>
          ))}
        </div>
        <p className="statement-hint">
          Leaving a section out never changes a total — the statement lists what was omitted so the
          figures stay checkable.
        </p>
      </fieldset>
    </div>
  )
}
