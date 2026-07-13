/**
 * ReportCallsignButton (spec 054, FR-025) — lets any user report a callsign for abuse or
 * impersonation. FairWins runs no app backend (no-backend footprint), and the registry
 * contract has no on-chain report path, so this routes to the operator moderation process
 * via the platform's existing contact address — the same one the landing page uses.
 *
 * Rendered as a plain `mailto:` anchor: accessible, needs no JS click handler, and never
 * triggers a browser dialog. The callsign, resolved address, and chain are pre-filled so the
 * operator has enough to investigate (FR-023 auditability feeds the same review).
 */
import { formatCallsign } from '../../lib/callsigns/normalizeCallsign'

// Operator moderation inbox (matches the landing-page contact). If this ever moves behind
// an env var, read it here — the affordance itself stays the same.
const OPERATOR_ABUSE_CONTACT = 'Howdy@FairWins.App'

/**
 * @param {object} props
 * @param {string} props.callsign canonical callsign (no `%`)
 * @param {string} [props.address] resolved owner address, included for the operator
 * @param {number} [props.chainId] network the callsign was resolved on
 * @param {string} [props.className]
 */
export default function ReportCallsignButton({ callsign, address, chainId, className = '' }) {
  if (!callsign) return null
  const display = formatCallsign(callsign)
  const subject = `Report callsign ${display} for abuse or impersonation`
  const body = [
    `I want to report the callsign ${display} for abuse or impersonation.`,
    '',
    `Callsign: ${display}`,
    address ? `Resolves to: ${address}` : null,
    chainId != null ? `Network (chainId): ${chainId}` : null,
    '',
    'Reason (please describe):',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n')
  const href = `mailto:${OPERATOR_ABUSE_CONTACT}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`

  return (
    <a
      className={className}
      href={href}
      title={`Report ${display} for abuse or impersonation`}
    >
      Report
    </a>
  )
}
