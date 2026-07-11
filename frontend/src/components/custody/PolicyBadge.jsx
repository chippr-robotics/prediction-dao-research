// Spec 049 (US2, FR-006) — vault-list badge: distinguishes policy-governed vaults with a shield
// mark + one-line rule summary, and flags foreign guards ("unrecognized policy"). Vaults with no
// policy (or on unsupported networks) render nothing so the list stays uncluttered. No emoji —
// line-glyph SVG per the NavIcon convention.

import './Policy.css'

function ShieldGlyph() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

export default function PolicyBadge({ status, summary }) {
  if (status === 'managed') {
    return (
      <span className="custody-policy-badge custody-policy-badge--managed">
        <ShieldGlyph />
        <span className="sr-only">Policy-governed vault.</span>
        <span className="custody-policy-badge-summary">{summary || 'Policy active'}</span>
      </span>
    )
  }
  if (status === 'foreign') {
    return <span className="custody-policy-badge custody-policy-badge--foreign">Unrecognized policy</span>
  }
  // 'none', 'unsupported', or unknown/unfetched: no badge (FR-010/FR-013).
  return null
}
