import { useState, useEffect, useCallback } from 'react'
import { isAddress } from 'ethers'
import { useOpenChallengeCreate, OPEN_RESOLUTION_TYPES } from '../../hooks/useOpenChallengeCreate'
import { useOpenChallengeAccept } from '../../hooks/useOpenChallengeAccept'
import { isValidCode, CLAIM_CODE_WORD_COUNT } from '../../utils/claimCode/wordlist.js'
import './FriendMarketsModal.css'
import './OpenChallengeModal.css'

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

/**
 * Open-challenge modal (feature 024) — one modal, two tabs:
 *   • Maker  — create a code-gated wager with no named opponent (Silver+).
 *   • Taker  — enter a four-word code to discover, read, and accept one.
 * Styled to match the create-a-wager modal (shared `fm-*` classes).
 */
function OpenChallengeModal({ isOpen, onClose, onBuyMembership, initialTab = 'maker' }) {
  const [tab, setTab] = useState(initialTab)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null
  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose() }

  return (
    <div
      className="friend-markets-modal-backdrop"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="open-challenge-title"
    >
      <div className="friend-markets-modal" onClick={(e) => e.stopPropagation()}>
        <header className="fm-header">
          <div className="fm-header-content">
            <div className="fm-brand">
              <span className="fm-brand-icon">&#127915;</span>
              <h2 id="open-challenge-title">Open Challenge</h2>
            </div>
            <p className="fm-subtitle">A code-gated wager — no opponent named up front</p>
          </div>
          <button className="fm-close-btn" onClick={onClose} aria-label="Close modal">
            <CloseIcon />
          </button>
        </header>

        <div className="fm-content">
          <div className="fm-panel">
            {/* Maker / Taker tabs (same tab styling as the create-wager resolution tabs) */}
            <div className="fm-resolution-tabs oc-mode-tabs" role="tablist" aria-label="Open challenge mode">
              <button
                type="button" role="tab" aria-selected={tab === 'maker'}
                className={`fm-resolution-tab ${tab === 'maker' ? 'active' : ''}`}
                onClick={() => setTab('maker')}
              >
                <span className="fm-resolution-tab-label">Create a challenge</span>
              </button>
              <button
                type="button" role="tab" aria-selected={tab === 'taker'}
                className={`fm-resolution-tab ${tab === 'taker' ? 'active' : ''}`}
                onClick={() => setTab('taker')}
              >
                <span className="fm-resolution-tab-label">Take a challenge</span>
              </button>
            </div>

            {tab === 'maker'
              ? <MakerPanel onClose={onClose} />
              : <TakerPanel onClose={onClose} onBuyMembership={onBuyMembership} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Maker — create an open challenge
// ---------------------------------------------------------------------------
function MakerPanel({ onClose }) {
  const { createOpenChallenge, busy } = useOpenChallengeCreate()
  const [description, setDescription] = useState('')
  const [stake, setStake] = useState('10')
  const [resolutionType, setResolutionType] = useState(String(OPEN_RESOLUTION_TYPES.Either))
  const [arbitrator, setArbitrator] = useState('')
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  const isThirdParty = Number(resolutionType) === OPEN_RESOLUTION_TYPES.ThirdParty
  const arbitratorValid = !isThirdParty || isAddress(arbitrator)
  const canCreate = description.trim().length > 0 && Number(stake) > 0 && arbitratorValid && !busy

  const handleCreate = useCallback(async (e) => {
    e?.preventDefault?.()
    setError(null)
    try {
      const res = await createOpenChallenge(
        { description: description.trim(), stake, resolutionType: Number(resolutionType), arbitrator: isThirdParty ? arbitrator : undefined },
        (p) => setProgress(p)
      )
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setProgress(null)
    }
  }, [createOpenChallenge, description, stake, resolutionType, isThirdParty, arbitrator])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }, [result])

  if (result) {
    return (
      <div className="fm-success">
        <div className="fm-success-icon" aria-hidden="true">&#127881;</div>
        <h3>Open challenge created{result.wagerId != null ? ` (#${result.wagerId})` : ''}</h3>
        <p className="fm-success-desc">Share this four-word code with whoever you want to take the other side.</p>

        <div className="oc-code-display">
          <code className="oc-code">{result.code}</code>
          <button type="button" className="fm-btn-secondary" onClick={handleCopy}>{copied ? 'Copied ✓' : 'Copy'}</button>
        </div>

        <div className="oc-notice oc-notice--warn" role="alert">
          <strong>Save this code now.</strong> It's the only way to take, read, or re-read this challenge — we
          don't store it and it can't be recovered. Anyone with the code can take the other side.
        </div>
        <p className="fm-hint">
          The four words resist casual guessing, but a determined attacker with specialized hardware could
          brute-force them. Use it for friendly stakes and share it only with the people you intend to.
        </p>

        <div className="fm-success-actions">
          <button type="button" className="fm-btn-primary fm-success-done" onClick={onClose}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <form className="fm-form" onSubmit={handleCreate}>
      <p className="fm-hint">
        An open challenge has no named opponent — anyone you share the code with can take the other side.
        Equal stakes. Creating one requires a Silver membership or above.
      </p>

      <div className="fm-form-group fm-form-full">
        <label htmlFor="oc-desc">What&apos;s the wager? <span className="fm-required">*</span></label>
        <input
          id="oc-desc" type="text" maxLength={200}
          placeholder="e.g. I'm betting NO that it rains in Denver tomorrow"
          value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy}
        />
        <span className="fm-hint">Phrase it so it&apos;s clear which side you&apos;re on; the taker takes the opposite.</span>
      </div>

      <div className="fm-form-group fm-form-full">
        <label htmlFor="oc-stake">Stake — each side (USDC) <span className="fm-required">*</span></label>
        <input id="oc-stake" type="number" min="0" step="0.01" value={stake} onChange={(e) => setStake(e.target.value)} disabled={busy} />
      </div>

      <div className="fm-form-group fm-form-full">
        <label htmlFor="oc-resolution">How is it resolved? <span className="fm-required">*</span></label>
        <select id="oc-resolution" className="fm-select" value={resolutionType} onChange={(e) => setResolutionType(e.target.value)} disabled={busy}>
          <option value={OPEN_RESOLUTION_TYPES.Either}>Either side submits the outcome</option>
          <option value={OPEN_RESOLUTION_TYPES.ThirdParty}>A named third-party arbitrator decides</option>
        </select>
        <span className="fm-hint">
          Single-party self-resolution isn&apos;t available for open challenges — the taker is unknown when you post it.
        </span>
      </div>

      {isThirdParty && (
        <div className="fm-form-group fm-form-full">
          <label htmlFor="oc-arb">Arbitrator address <span className="fm-required">*</span></label>
          <input id="oc-arb" type="text" placeholder="0x…" value={arbitrator} onChange={(e) => setArbitrator(e.target.value)} disabled={busy} />
          <span className="fm-hint">The arbitrator can read and resolve this challenge, and cannot also take it.</span>
        </div>
      )}

      {progress && <p className="fm-hint" role="status">{progress.message}</p>}
      {error && <div className="fm-error-banner" role="alert">{error}</div>}

      <div className="fm-success-actions">
        <button type="submit" className="fm-btn-primary" disabled={!canCreate}>
          {busy ? 'Creating…' : 'Create & generate code'}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Taker — accept an open challenge by code
// ---------------------------------------------------------------------------
function TakerPanel({ onClose, onBuyMembership }) {
  const { discover, accept, busy } = useOpenChallengeAccept()
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState('enter') // enter | found | accepted
  const [found, setFound] = useState(null)
  const [error, setError] = useState(null)
  const [txHash, setTxHash] = useState(null)

  const codeValid = isValidCode(code)

  const handleLookup = useCallback(async (e) => {
    e?.preventDefault?.()
    setError(null)
    try {
      const result = await discover(code)
      setFound(result)
      setPhase('found')
    } catch (err) {
      setError(err.message)
    }
  }, [discover, code])

  const handleAccept = useCallback(async () => {
    setError(null)
    try {
      const { txHash: hash } = await accept(code, found.wagerId)
      setTxHash(hash)
      setPhase('accepted')
    } catch (err) {
      setError(err.message)
    }
  }, [accept, code, found])

  if (phase === 'accepted') {
    return (
      <div className="fm-success">
        <div className="fm-success-icon" aria-hidden="true">&#10003;</div>
        <h3>You&apos;ve taken the challenge</h3>
        <p className="fm-success-desc">You&apos;re now the bound opponent. Keep your code to re-read the private terms in future.</p>
        {txHash && <p className="fm-success-details">Transaction: <code>{shorten(txHash)}</code></p>}
        <div className="fm-success-actions">
          <button type="button" className="fm-btn-primary fm-success-done" onClick={onClose}>Done</button>
        </div>
      </div>
    )
  }

  if (phase === 'found' && found) {
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

        {found.needsMembership ? (
          <>
            <div className="oc-notice oc-notice--warn">
              An active membership is required to take a challenge. Any tier works — creating open challenges
              needs Silver, but taking one does not.
            </div>
            <div className="fm-success-actions">
              <button type="button" className="fm-btn-primary" onClick={() => onBuyMembership?.()}>Get a membership to take this</button>
              <button type="button" className="fm-btn-secondary" onClick={() => { setPhase('enter'); setFound(null) }}>Back</button>
            </div>
          </>
        ) : (
          <>
            <p className="fm-hint">Accepting binds you as the opponent and escrows your equal stake. Save your code to re-read the terms later.</p>
            {error && <div className="fm-error-banner" role="alert">{error}</div>}
            <div className="fm-success-actions">
              <button type="button" className="fm-btn-primary" onClick={handleAccept} disabled={busy}>{busy ? 'Accepting…' : 'Accept challenge'}</button>
              <button type="button" className="fm-btn-secondary" onClick={() => { setPhase('enter'); setFound(null) }}>Back</button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <form className="fm-form" onSubmit={handleLookup}>
      <div className="fm-form-group fm-form-full">
        <label htmlFor="oc-code-input">Enter the {CLAIM_CODE_WORD_COUNT}-word code you were given <span className="fm-required">*</span></label>
        <input
          id="oc-code-input" type="text" autoComplete="off" spellCheck="false"
          placeholder="e.g. river tiger kite zoo"
          value={code} onChange={(e) => setCode(e.target.value)} disabled={busy}
        />
        <span className="fm-hint">The code is shared by the creator. Without it, an open challenge can&apos;t be found or read.</span>
      </div>
      {error && <div className="fm-error-banner" role="alert">{error}</div>}
      <div className="fm-success-actions">
        <button type="submit" className="fm-btn-primary" disabled={!codeValid || busy}>{busy ? 'Looking up…' : 'Find challenge'}</button>
      </div>
    </form>
  )
}

function formatTerms(terms) {
  if (terms == null) return ''
  if (typeof terms === 'string') return terms
  try { return JSON.stringify(terms, null, 2) } catch { return String(terms) }
}

function shorten(hash) {
  return hash && hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash
}

export default OpenChallengeModal
