/**
 * ScreeningInfoButton (Spec 021 iteration 2) — an info (ⓘ) button that explains
 * how address screening works: it is an advisory pre-check, the on-chain guard
 * is the real enforcement, results fail closed, and they are network-scoped.
 * Links to the detailed user-guide doc.
 *
 * Spec 039 rebased it on the shared InfoTip toggletip; the rich content keeps
 * dialog semantics.
 */

import InfoTip from './InfoTip'
import './ScreeningInfo.css'

export default function ScreeningInfoButton({ className = '' }) {
  return (
    <InfoTip
      label="How address screening works"
      bubbleRole="dialog"
      className={`screening-info ${className}`.trim()}
    >
      <h4>How address screening works</h4>
      <ul>
        <li>
          <strong>Advisory only.</strong> The warning tags are a convenience pre-check. They
          do <em>not</em> block anything by themselves.
        </li>
        <li>
          <strong>On-chain guard enforces.</strong> The smart contracts independently screen
          every participant, so a restricted address is blocked on-chain even if the app shows
          no warning.
        </li>
        <li>
          <strong>Fails closed.</strong> If an address can&apos;t be screened (the guard isn&apos;t
          configured on the network, or the check fails), it shows as
          <em> Unscreened</em> — never as clear.
        </li>
        <li>
          <strong>Network-scoped.</strong> A result applies only to the network it was checked
          on; the same address may screen differently on another network.
        </li>
      </ul>
      <p className="ab-info-doc">
        See the{' '}
        <a
          href="https://chippr-robotics.github.io/prediction-dao-research/user-guide/address-book/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Address Book &amp; screening guide
        </a>{' '}
        for full details.
      </p>
    </InfoTip>
  )
}
