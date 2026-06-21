import { useState, useEffect } from 'react'

/**
 * MembershipAttestation (Spec 007 — US5, FR-035/FR-036/FR-037/FR-038)
 *
 * Discrete, individually-ticked, un-pre-ticked eligibility attestations shown at membership
 * purchase/upgrade. Calls onChange(allTicked) so the parent gates its purchase button; the
 * accepted T&C version is recorded on-chain by the purchase tx (purchaseTierWithTerms).
 * WCAG 2.1 AA: fieldset/legend, programmatically-associated checkbox labels.
 */

const ATTESTATIONS = [
  { id: 'age', label: 'I am at least 21 years of age.' },
  { id: 'jurisdiction', label: 'I am not located, resident, or established in any Restricted Jurisdiction defined in the Terms.' },
  { id: 'sanctions', label: 'I am not, and do not act on behalf of, any person subject to sanctions or named on any restricted-party list (including the OFAC SDN list).' },
  { id: 'norecourse', label: 'I understand FairWins is not a registered exchange, broker, or regulated gambling operator, that there is no regulator or authority to which I can appeal a dispute, and that wager outcomes are settled by smart contract and the published dispute-resolution mechanism.' },
  { id: 'risk', label: 'I understand I may lose the entire amount of any wager, that I bear sole responsibility for my own tax reporting, and that I have sole control of my wallet and private keys.' },
  { id: 'novpn', label: 'I have not used, and will not use, any VPN, proxy, or other means to circumvent eligibility or geographic restrictions.' },
  { id: 'terms', label: 'I have read and agree to the Terms & Conditions and the Risk Disclosure.' },
]

export default function MembershipAttestation({ onChange }) {
  const [ticks, setTicks] = useState(() => Object.fromEntries(ATTESTATIONS.map((a) => [a.id, false])))

  const allTicked = ATTESTATIONS.every((a) => ticks[a.id])

  useEffect(() => {
    onChange?.(allTicked)
  }, [allTicked, onChange])

  const toggle = (id) => setTicks((t) => ({ ...t, [id]: !t[id] }))

  return (
    <section className="membership-attestation" aria-labelledby="membership-attest-title">
      <h3 id="membership-attest-title">Membership confirmation</h3>
      <p>
        Your membership pass grants access to the FairWins platform. <strong>It is a fee for
        access only.</strong> It is not a wager, a stake, a deposit, an investment, a security,
        or a balance held on your behalf; it confers no ownership interest, no profit
        expectation, and no claim on any pool of funds. Membership fees are not pooled, staked,
        wagered, or returned as winnings, and are <strong>non-refundable</strong> — including if
        you are later restricted, suspended, or unable to access the platform.
      </p>
      <p className="membership-attestation-review">
        Before agreeing, please read the{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a> and{' '}
        <a href="/risk" target="_blank" rel="noopener noreferrer">Risk Disclosure</a>.
      </p>
      <fieldset>
        <legend>By purchasing or upgrading, I confirm and agree:</legend>
        {ATTESTATIONS.map((a) => (
          <div className="attestation-row" key={a.id}>
            <input
              type="checkbox"
              id={`attest-${a.id}`}
              checked={ticks[a.id]}
              onChange={() => toggle(a.id)}
            />
            <label htmlFor={`attest-${a.id}`}>{a.label}</label>
          </div>
        ))}
      </fieldset>
    </section>
  )
}

export { ATTESTATIONS }
