// Spec 068 (US2/US4) — the ordered rule list: numbered rows in enforcement order, plain-language
// descriptions, live window consumption, and (when editable) reordering.
//
// Reordering ships BOTH pointer drag and keyboard move controls (FR-016). The keyboard path is not
// a fallback — it is the primary, always-visible affordance, because a policy list you cannot
// reorder without a mouse is a policy you cannot safely manage. Pattern mirrors
// components/pools/PoolParticipants.jsx.

import { useState } from 'react'
import { ruleNumber } from '../../lib/custody/policyV2'

export default function RuleList({
  rules = [],
  descriptions = [],
  accounting = [],
  shadowed = [],
  broken = [],
  editable = false,
  legacy = false,
  onReorder,
  onEdit,
  onRemove,
}) {
  const [dragIndex, setDragIndex] = useState(null)

  if (rules.length === 0) {
    return (
      <p className="custody-hint" role="status">
        {legacy ? 'This vault has no rules.' : 'No rules yet — this policy allows nothing until a rule is added.'}
      </p>
    )
  }

  const shadowedBy = new Map(shadowed.map((s) => [s.index, s.shadowedBy]))
  const brokenBy = new Map(broken.map((b) => [b.index, b.missing]))

  const move = (from, to) => {
    if (!onReorder || to < 0 || to >= rules.length) return
    const next = [...rules]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onReorder(next)
  }

  return (
    <ol className={`custody-rule-list${legacy ? ' is-legacy' : ''}`} aria-label={legacy ? 'Legacy rules' : 'Policy rules'}>
      {rules.map((rule, i) => {
        const description = descriptions[i]?.text || ''
        const acc = accounting[i]
        const shadow = shadowedBy.get(i)
        const missingOwners = brokenBy.get(i)
        return (
          <li
            key={i}
            className={`custody-rule${dragIndex === i ? ' dragging' : ''}${missingOwners ? ' is-broken' : ''}`}
            draggable={editable && Boolean(onReorder)}
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex != null) move(dragIndex, i)
              setDragIndex(null)
            }}
          >
            <div className="custody-rule-head">
              {/* Legacy (spec 049) rules are unnumbered: they are a flat set with no ordering, and
                  showing them as "001, 002" would imply a precedence they do not have (FR-020). */}
              {!legacy && (
                <span className="custody-rule-number" aria-label={`Rule ${ruleNumber(i)}`}>
                  {ruleNumber(i)}
                </span>
              )}
              <p className="custody-rule-text">{description}</p>
            </div>

            {acc && acc.windowLimit !== 0n && acc.spentInWindow > 0n && (
              <p className="custody-rule-meta">
                24-hour window: {String(acc.spentInWindow)} used
                {acc.remaining != null && acc.remaining !== undefined ? `, ${String(acc.remaining)} left` : ''}
              </p>
            )}

            {missingOwners && (
              <p className="custody-error" role="alert">
                This rule names {missingOwners.join(', ')}, who {missingOwners.length === 1 ? 'is' : 'are'} no longer
                an owner — transactions it governs cannot execute until the policy is amended.
              </p>
            )}

            {shadow != null && (
              <p className="custody-warning" role="status">
                Rule {ruleNumber(shadow)} already covers everything this rule covers, so this rule can never apply.
              </p>
            )}

            {editable && (
              <div className="custody-rule-controls">
                {onReorder && (
                  <>
                    <button
                      type="button"
                      onClick={() => move(i, i - 1)}
                      disabled={i === 0}
                      aria-label={`Move rule ${ruleNumber(i)} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, i + 1)}
                      disabled={i === rules.length - 1}
                      aria-label={`Move rule ${ruleNumber(i)} down`}
                    >
                      ↓
                    </button>
                  </>
                )}
                {onEdit && (
                  <button type="button" onClick={() => onEdit(i)} aria-label={`Edit rule ${ruleNumber(i)}`}>
                    Edit
                  </button>
                )}
                {onRemove && (
                  <button type="button" onClick={() => onRemove(i)} aria-label={`Remove rule ${ruleNumber(i)}`}>
                    Remove
                  </button>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
