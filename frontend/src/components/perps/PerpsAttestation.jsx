/**
 * PerpsAttestation (spec 083, T051, FR-015) — the jurisdiction and leverage-risk acknowledgement
 * that stands in front of OPENING a position, and in front of nothing else.
 *
 * FIVE RULES, each of which is a specific harm when broken:
 *
 * 1. **IT GATES OPENS ONLY.** This component is on the ENTRY path. No close, reduce, cancel or
 *    recovery surface may import it, and `test/perps/safetyInvariants.test.js` fails the build if
 *    one does — SC-004 requires zero code paths that gate an exit on jurisdiction. A member who
 *    declines every item below can still close every position they hold.
 *
 * 2. **NOTHING ARRIVES PRE-TICKED.** The initial state comes from
 *    `attestation.js#initialAttestationState()`, which is every item false, and the items are
 *    DISCRETE — four separate statements a member ticks individually, not one "I agree to
 *    everything" box. A pre-ticked acknowledgement is not an acknowledgement, and one lumped box is
 *    not four statements.
 *
 * 3. **IT IS VERSIONED AGAINST THE TEXT.** The store refuses to credit a record made against older
 *    wording, and this component says so plainly when that has happened: a member who acknowledged
 *    v1 is asked again for v2 rather than being told nothing and quietly re-recorded.
 *
 * 4. **NO STATE IS DERIVED HERE.** Completeness is `isAttestationComplete`, the stored verdict is
 *    `attestationState`, and the record is written by `recordAttestation` — which refuses a partial
 *    tick-set itself. This component holds the checkbox state and nothing else, so "what counts as
 *    attested" has exactly one definition.
 *
 * 5. **IT NEVER CLAIMS MORE THAN IT DID.** A browser that refuses storage keeps the record for the
 *    session only, and the component says the acknowledgement may be asked for again rather than
 *    promising it was saved.
 *
 * TESTABILITY: the store is injectable through `deps`, so the version/superseded/refusal paths are
 * exercised without touching `localStorage`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PERPS_ATTESTATION_VERSION } from '../../config/perps'
import {
  PERPS_ATTESTATION_ITEMS,
  attestationState,
  initialAttestationState,
  isAttestationComplete,
  missingAttestationItems,
  recordAttestation,
  subscribeAttestation,
} from '../../lib/perps/attestation'
import { PERPS_RISK_DISCLOSURE } from '../../lib/perps/perpsCopy'
import './PerpsAttestation.css'

/**
 * @param version   the wording version being acknowledged; defaults to this build's
 * @param venueLabel the venue the member is about to trade on, named in the venue-terms item
 * @param onAcknowledged called with the stored record once every item is ticked and saved
 * @param deps      `{ state, record, subscribe }` — the attestation store, injectable for tests
 */
export default function PerpsAttestation({
  version = PERPS_ATTESTATION_VERSION,
  venueLabel = null,
  onAcknowledged,
  deps,
}) {
  const readState = deps?.state ?? attestationState
  const write = deps?.record ?? recordAttestation
  const subscribe = deps?.subscribe ?? subscribeAttestation

  /* Every item false. The DEFAULT is the requirement — see rule 2 — and it lives in the store so
   * that "nothing is pre-ticked" is a property of the feature rather than of this component. */
  const [ticked, setTicked] = useState(initialAttestationState)
  const [verdict, setVerdict] = useState(() => safeState(readState, version))
  const [refusal, setRefusal] = useState(null)

  /* The record can change in another surface in the same visit (the store broadcasts it), and this
   * panel must reflect that rather than keep asking for something already given. */
  useEffect(() => {
    const unsubscribe = subscribe(() => setVerdict(safeState(readState, version)))
    return typeof unsubscribe === 'function' ? unsubscribe : undefined
    // `readState`/`subscribe` are caller-owned and stable in every real caller; re-subscribing on a
    // new VERSION is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const missing = useMemo(() => missingAttestationItems(ticked), [ticked])
  const complete = missing.length === 0

  const toggle = useCallback((id) => {
    setRefusal(null)
    setTicked((current) => ({ ...current, [id]: !current[id] }))
  }, [])

  const confirm = useCallback(() => {
    if (!isAttestationComplete(ticked)) {
      // Reached by keyboard on a disabled-looking control, or by a fast double-tap. Silence here
      // would read as a dead button.
      setRefusal('Please tick every statement above — each one is a separate confirmation.')
      return
    }
    const record = write(ticked, version)
    if (!record) {
      setRefusal('This could not be recorded just now. Please try again.')
      return
    }
    setRefusal(null)
    setVerdict(safeState(readState, version))
    onAcknowledged?.(record)
  }, [ticked, write, version, readState, onAcknowledged])

  if (verdict.attested) return null

  const headingId = 'perps-attestation-heading'
  return (
    <section className="perps-attest" aria-labelledby={headingId}>
      <h4 id={headingId} className="perps-attest-title">
        Before you open a position
      </h4>

      {/* A SUPERSEDED record is its own message. "Please confirm these again" is not the same as
          "please confirm these", and a member who already agreed deserves to know why they are
          being asked twice. */}
      {verdict.superseded && (
        <p className="perps-attest-superseded" role="note">
          {verdict.reason ?? 'Please confirm these again — the terms have been updated.'}
        </p>
      )}

      <p className="perps-attest-risk">{PERPS_RISK_DISCLOSURE}</p>

      <fieldset className="perps-attest-items">
        <legend>Confirm each of these</legend>
        {PERPS_ATTESTATION_ITEMS.map((item) => {
          const id = `perps-attest-${item.id}`
          return (
            <div className="perps-attest-item" key={item.id}>
              <input
                id={id}
                type="checkbox"
                checked={ticked[item.id] === true}
                onChange={() => toggle(item.id)}
              />
              <label htmlFor={id}>{item.label}</label>
            </div>
          )
        })}
      </fieldset>

      {venueLabel && (
        <p className="perps-attest-note">
          You are about to trade on {venueLabel}, under {venueLabel}’s own terms. FairWins does not
          hold your position and is not your counterparty.
        </p>
      )}

      {refusal && (
        <p className="perps-attest-error" role="alert">
          {refusal}
        </p>
      )}

      <button type="button" className="perps-attest-confirm" onClick={confirm} disabled={!complete}>
        I confirm all of the above
      </button>
      {!complete && (
        <p className="perps-attest-note">
          {missing.length === PERPS_ATTESTATION_ITEMS.length
            ? 'None of these are ticked for you — each one is yours to confirm.'
            : `${missing.length} still to confirm.`}
        </p>
      )}
      <p className="perps-attest-note">
        This is kept on this device only. If your browser is not storing it, you will be asked
        again next time.
      </p>
    </section>
  )
}

/** The store is total, but a caller may inject anything; an unreadable verdict is "not attested". */
function safeState(read, version) {
  try {
    const result = read(version)
    if (result && typeof result === 'object') return result
  } catch {
    /* fall through to the honest default */
  }
  return { attested: false, record: null, version: Number(version), superseded: false, reason: null }
}
