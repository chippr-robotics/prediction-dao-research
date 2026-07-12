import { useSyncExternalStore, useEffect, useState, useRef } from 'react'
import {
  subscribe,
  getSnapshot,
  dismissTx,
  PHASE,
  STEPS,
  PHASE_STEP,
  isTerminalPhase,
} from '../../lib/passkey/txProgressBus'
import { getTransactionUrl } from '../../config/blockExplorer'
import './TxProgressOverlay.css'

// Honest, user-facing copy for each phase (spec 041 FR-017 / Constitution III:
// never claim confirmed before inclusion; never freeze silently).
const COPY = {
  [PHASE.PREPARING]: { title: 'Preparing…', sub: 'Building your transaction.' },
  [PHASE.SIGNING]: {
    title: 'Confirm with your passkey',
    sub: 'Approve the prompt on your device to authorize this action.',
  },
  [PHASE.SUBMITTING]: { title: 'Submitting…', sub: 'Handing your transaction to the network.' },
  [PHASE.CONFIRMING]: {
    title: 'Confirming on-chain…',
    sub: 'Submitted. Waiting for it to be included in a block — usually a few seconds.',
  },
  [PHASE.CONFIRMED]: { title: 'Confirmed', sub: 'Your transaction is on-chain.' },
  [PHASE.STALLED]: {
    title: 'Taking longer than usual',
    sub: "The network is congested. Your transaction is still being tracked — it's safe to wait, or check Activity later.",
  },
  [PHASE.FAILED]: { title: 'Transaction failed', sub: 'Nothing was sent. You can try again.' },
}

const AUTO_DISMISS_MS = 7000

function shortHash(h) {
  if (!h || typeof h !== 'string') return ''
  return h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h
}

/**
 * TxProgressOverlay — one global, session-wide surface that renders the passkey
 * batch lifecycle published by WalletContext.sendCalls (via txProgressBus). It
 * replaces the frozen "Sending…" button state with a signature → submission →
 * confirmation walk-through and an honest terminal state.
 *
 * Mounted once at the app root; renders nothing when no batch is in flight, so
 * classic-wallet flows (which surface their own extension UI) are unaffected.
 */
export default function TxProgressOverlay() {
  const progress = useSyncExternalStore(subscribe, getSnapshot, () => null)

  const phase = progress?.phase
  const seq = progress?.seq
  const terminal = phase ? isTerminalPhase(phase) : false

  // Live elapsed-seconds clock. Kept in state and advanced by an interval so the
  // tick stays out of the app tree; Date.now() runs only inside the callback
  // (never during render). Reset to 0 the instant a new batch starts via the
  // "adjust state when an input changes" pattern (react.dev) so a stale count
  // never flashes across batches.
  const startedAt = progress?.startedAt
  const [elapsed, setElapsed] = useState(0)
  const [lastSeq, setLastSeq] = useState(seq)
  const dismissTimer = useRef(null)
  if (seq !== lastSeq) {
    setLastSeq(seq)
    setElapsed(0)
  }

  useEffect(() => {
    if (!progress?.active || terminal || startedAt == null) return undefined
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => clearInterval(id)
    // Re-arm per batch (startedAt changes with seq); a terminal phase freezes the clock.
  }, [progress?.active, terminal, startedAt])

  // Auto-dismiss only the happy terminal; failures/stalls stay until dismissed
  // so the user can read the guidance and copy the reference.
  useEffect(() => {
    clearTimeout(dismissTimer.current)
    if (phase === PHASE.CONFIRMED) {
      dismissTimer.current = setTimeout(() => dismissTx(), AUTO_DISMISS_MS)
    }
    return () => clearTimeout(dismissTimer.current)
  }, [phase, seq])

  if (!progress?.active) return null

  const copy = COPY[phase] || COPY[PHASE.PREPARING]
  const activeStep = PHASE_STEP[phase] ?? 0
  const failed = phase === PHASE.FAILED
  const stalled = phase === PHASE.STALLED
  const confirmed = phase === PHASE.CONFIRMED
  const explorerUrl =
    confirmed && progress.txHash && progress.chainId
      ? getTransactionUrl(progress.chainId, progress.txHash)
      : ''

  const statusClass = failed ? 'is-failed' : stalled ? 'is-stalled' : confirmed ? 'is-confirmed' : 'is-active'

  return (
    <div className="txp-overlay" role="status" aria-live="polite">
      <div className={`txp-card ${statusClass}`}>
        <button className="txp-close" onClick={() => dismissTx()} aria-label="Dismiss">
          ×
        </button>

        <div className="txp-head">
          <span className="txp-icon" aria-hidden="true">
            {confirmed ? '✓' : failed ? '✕' : stalled ? '⏳' : <span className="txp-spinner" />}
          </span>
          <div className="txp-titles">
            <div className="txp-title">{copy.title}</div>
            <div className="txp-sub">{failed && progress.reason ? progress.reason : copy.sub}</div>
          </div>
          {!terminal && <span className="txp-elapsed">{elapsed}s</span>}
        </div>

        {/* Step rail — Prepare · Sign · Submit · Confirm */}
        <ol className="txp-steps" aria-hidden="true">
          {STEPS.map((label, i) => {
            const state =
              failed && i === Math.max(activeStep, 0)
                ? 'error'
                : i < activeStep
                  ? 'done'
                  : i === activeStep
                    ? 'current'
                    : 'todo'
            return (
              <li key={label} className={`txp-step txp-step--${state}`}>
                <span className="txp-dot" />
                <span className="txp-step-label">{label}</span>
              </li>
            )
          })}
        </ol>

        {/* Route / sponsorship truth + references */}
        <div className="txp-meta">
          {progress.sponsored === true && <span className="txp-badge txp-badge--gasless">Gas sponsored</span>}
          {progress.sponsored === false && <span className="txp-badge txp-badge--self">You pay gas</span>}
          {confirmed && explorerUrl && (
            <a className="txp-link" href={explorerUrl} target="_blank" rel="noopener noreferrer">
              View on explorer ↗
            </a>
          )}
          {(stalled || (!confirmed && progress.userOpHash)) && progress.userOpHash && (
            <span className="txp-ref" title={progress.userOpHash}>
              Ref {shortHash(progress.userOpHash)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
