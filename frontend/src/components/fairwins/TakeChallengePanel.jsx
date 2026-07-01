import { useState, useCallback } from 'react'
import { useOpenChallengeAccept } from '../../hooks/useOpenChallengeAccept'
import './FriendMarketsModal.css'
import './OpenChallengeModal.css'

/**
 * Take-a-challenge presentation (spec 037, US1) — extracted verbatim from OpenChallengeModal's
 * TakerPanel "found"/"accepted" views so the unified phrase lookup can render it after resolving a
 * phrase to an open challenge. Discovery now happens upstream in the unified lookup, which passes the
 * already-resolved `match` ({ wagerId, wager, terms, termsUnavailable, needsMembership }) and the
 * `code` (the four-word phrase) needed to authorize the accept.
 */
export default function TakeChallengePanel({ code, match, onClose, onBuyMembership, onBack }) {
  const { accept, busy } = useOpenChallengeAccept()
  const [phase, setPhase] = useState('found')
  const [progress, setProgress] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [error, setError] = useState(null)
  const found = match

  const handleAccept = useCallback(async () => {
    setError(null)
    try {
      const { txHash: hash } = await accept(code, found.wagerId, (p) => setProgress(p))
      setTxHash(hash)
      setPhase('accepted')
    } catch (err) {
      setError(err.message)
    } finally {
      setProgress(null)
    }
  }, [accept, code, found])

  if (!found) return null

  if (phase === 'accepted') {
    return (
      <div className="fm-success">
        <div className="fm-success-icon" aria-hidden="true">&#10003;</div>
        <h3>You&apos;ve taken the challenge</h3>
        <p className="fm-success-desc">You&apos;re now the bound opponent. Keep your code to re-read the private terms in future.</p>
        <div className="fm-success-actions">
          <button type="button" className="fm-btn-primary fm-success-done" onClick={onClose}>Done</button>
        </div>
        {txHash && (
          <p className="oc-tx-note">
            Confirmed on-chain · <code className="oc-tx-hash">{shorten(txHash)}</code>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="fm-form">
      <div className="fm-form-group fm-form-full">
        <label>Challenge terms</label>
        {found.termsUnavailable ? (
          <div className="oc-notice oc-notice--warn" role="alert">
            Terms unavailable — the encrypted details couldn&apos;t be retrieved. You can still accept; the
            on-chain wager is unaffected. Keep your code to read the terms later.
          </div>
        ) : (
          <pre className="oc-terms-body">{formatTerms(found.terms)}</pre>
        )}
      </div>

      <ChallengeDeadlines wager={found.wager} />

      {found.needsMembership ? (
        <>
          <div className="oc-notice oc-notice--warn">
            An active membership is required to take a challenge. Any tier works — creating open challenges
            needs Silver, but taking one does not.
          </div>
          <div className="fm-success-actions">
            <button type="button" className="fm-btn-primary" onClick={() => onBuyMembership?.()}>Get a membership to take this</button>
            {onBack && <button type="button" className="fm-btn-secondary" onClick={onBack}>Back</button>}
          </div>
        </>
      ) : (
        <>
          <p className="fm-hint">Accepting binds you as the opponent and escrows your equal stake. This takes a few steps:</p>
          <ol className="oc-steps">
            <li className={stepClass(progress?.step, 'approve')}>Approve the stake token (lets the wager contract escrow your stake)</li>
            <li className={stepClass(progress?.step, 'sign')}>Sign to authorize acceptance with your code</li>
            <li className={stepClass(progress?.step, 'accept')}>Confirm acceptance — your stake is escrowed</li>
          </ol>
          {progress && <p className="fm-hint" role="status">{progress.message}</p>}
          {error && <div className="fm-error-banner" role="alert">{error}</div>}
          <p className="fm-hint">Save your code to re-read the terms later.</p>
          <div className="fm-success-actions">
            <button type="button" className="fm-btn-primary" onClick={handleAccept} disabled={busy}>{busy ? (progress ? `${stepLabel(progress.step)}…` : 'Accepting…') : 'Accept challenge'}</button>
            {onBack && <button type="button" className="fm-btn-secondary" onClick={onBack} disabled={busy}>Back</button>}
          </div>
        </>
      )}
    </div>
  )
}

// Full step order the accept flow walks through (the visible list omits the quick "check" read).
const ACCEPT_STEP_ORDER = ['check', 'approve', 'sign', 'accept']
const STEP_LABELS = { check: 'Checking', approve: 'Approving', sign: 'Signing', accept: 'Confirming' }

/** Mark a list step done, active, or pending — for the take-flow checklist. */
function stepClass(current, step) {
  if (!current) return 'oc-step'
  const ci = ACCEPT_STEP_ORDER.indexOf(current)
  const si = ACCEPT_STEP_ORDER.indexOf(step)
  if (ci > si) return 'oc-step oc-step--done'
  if (ci === si) return 'oc-step oc-step--active'
  return 'oc-step'
}

function stepLabel(step) {
  return STEP_LABELS[step] || 'Accepting'
}

/** Show an open challenge's accept/resolve deadlines (feature 024). Reads the on-chain wager struct. */
function ChallengeDeadlines({ wager }) {
  const accept = formatDeadline(wager?.acceptDeadline)
  const resolve = formatDeadline(wager?.resolveDeadline)
  if (!accept && !resolve) return null
  return (
    <div className="oc-deadlines" aria-label="Challenge time constraints">
      {accept && (
        <div className="oc-deadline">
          <span className="oc-deadline-label">Take by</span>
          <span className="oc-deadline-value">{accept}</span>
        </div>
      )}
      {resolve && (
        <div className="oc-deadline">
          <span className="oc-deadline-label">Resolve by</span>
          <span className="oc-deadline-value">{resolve}</span>
        </div>
      )}
    </div>
  )
}

/** Format an on-chain unix-seconds deadline (bigint/number) as a local date-time, or '' if unset. */
function formatDeadline(value) {
  if (value == null) return ''
  const secs = typeof value === 'bigint' ? Number(value) : Number(value)
  if (!Number.isFinite(secs) || secs <= 0) return ''
  try {
    return new Date(secs * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}

function formatTerms(terms) {
  if (terms == null) return ''
  if (typeof terms === 'string') return terms
  try { return JSON.stringify(terms, null, 2) } catch { return String(terms) }
}

function shorten(hash) {
  return hash && hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash
}
