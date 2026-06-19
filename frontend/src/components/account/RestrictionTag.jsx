/**
 * RestrictionTag (Spec 021) — accessible sanctions/compliance status tag.
 *
 * Conveys status with an icon AND text (never colour alone) per WCAG 2.1 AA
 * (FR-023). Renders nothing for a clear/unknown status so clean addresses stay
 * visually quiet.
 */

import './RestrictionTag.css'

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function QuestionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export default function RestrictionTag({ status }) {
  if (status === 'restricted') {
    return (
      <span className="ab-tag ab-tag-restricted" role="status">
        <WarningIcon />
        <span>Restricted</span>
      </span>
    )
  }
  if (status === 'uncertain') {
    return (
      <span className="ab-tag ab-tag-uncertain" role="status">
        <QuestionIcon />
        <span>Unscreened</span>
      </span>
    )
  }
  if (status === 'loading') {
    return (
      <span className="ab-tag ab-tag-loading" aria-label="Screening address">
        <span aria-hidden="true">…</span>
      </span>
    )
  }
  return null
}
