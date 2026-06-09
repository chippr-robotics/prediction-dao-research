import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentDocument } from '../../utils/legalDocs'
import './EntryGate.css'

/**
 * EntryGate (Spec 007 — US4, FR-031/FR-033/FR-034)
 *
 * Client-side first-touch eligibility NOTICE gate. There is no backend, so this is not a
 * binding consent record — its legal weight is carried by the downstream ON-CHAIN consents
 * (membership purchase, wager creation, key registration). It blocks the app until the
 * visitor affirms eligibility, links the current versioned legal docs (by hash), and warns
 * against circumvention. A returning visitor who has acknowledged once is NOT re-gated
 * (re-consent to a new material version is enforced on-chain at the next consequential act).
 *
 * WCAG 2.1 AA: role="dialog" + aria-modal, focus moved in and trapped, labelled controls.
 */

const ACK_KEY = 'fairwins.entryGate.ack.v1'

function readAck() {
  try {
    return JSON.parse(localStorage.getItem(ACK_KEY) || 'null')
  } catch {
    return null
  }
}

export default function EntryGate() {
  const navigate = useNavigate()
  const [ack, setAck] = useState(() => readAck())
  const dialogRef = useRef(null)
  const firstFocusRef = useRef(null)

  // Move focus into the dialog when it appears (WCAG: focus management).
  useEffect(() => {
    if (!ack && firstFocusRef.current) firstFocusRef.current.focus()
  }, [ack])

  // Basic focus trap: keep Tab focus within the dialog while it is open.
  const onKeyDown = useCallback((e) => {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const els = dialogRef.current.querySelectorAll(
      'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
    )
    if (els.length === 0) return
    const first = els[0]
    const last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus()
    }
  }, [])

  if (ack) return null // already acknowledged → app content flows

  const terms = getCurrentDocument('terms')
  const risk = getCurrentDocument('risk')

  const onEnter = () => {
    const record = { terms: terms?.hash || null, risk: risk?.hash || null, at: new Date().toISOString() }
    try { localStorage.setItem(ACK_KEY, JSON.stringify(record)) } catch { /* storage disabled */ }
    setAck(record)
  }
  const onLeave = () => navigate('/')

  return (
    <div className="entry-gate-overlay" role="presentation">
      <div
        className="entry-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-gate-title"
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <h2 id="entry-gate-title">Before you enter FairWins</h2>
        <p>
          FairWins is peer-to-peer software. You wager directly against other participants;
          FairWins is never your counterparty, sets no odds, and takes no share of any wager.
        </p>
        <p>By selecting <strong>Enter</strong>, you confirm that:</p>
        <ul>
          <li>You are at least 21 years old.</li>
          <li>You are not a U.S. person and are not accessing FairWins from the United States or any restricted jurisdiction listed in our Terms.</li>
          <li>You are not subject to sanctions and do not appear on any government restricted-party list.</li>
          <li>Accessing peer-to-peer wagering is lawful where you are located, and you accept full responsibility for compliance with your local laws.</li>
          <li>
            You have read and agree to the{' '}
            <a href="/terms">Terms &amp; Conditions</a> and{' '}
            <a href="/risk">Risk Disclosure</a>
            {terms?.hash ? <> (version <code>{terms.hash.slice(0, 12)}…</code>)</> : null}.
          </li>
        </ul>
        <p className="entry-gate-warning" role="note">
          Using a VPN, proxy, or any means to misrepresent your location or eligibility is a
          breach of our Terms and voids your access.
        </p>
        <div className="entry-gate-actions">
          <button type="button" ref={firstFocusRef} className="confirm-btn primary" onClick={onEnter}>
            Enter
          </button>
          <button type="button" className="confirm-btn" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}
