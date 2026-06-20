import { useState, useEffect, useCallback } from 'react'
import { useOpenChallengeAccept } from '../../hooks/useOpenChallengeAccept'
import { isValidCode, CLAIM_CODE_WORD_COUNT } from '../../utils/claimCode/wordlist.js'
import './TakeChallengeModal.css'

/**
 * Take-a-challenge modal (feature 024). A taker enters the four-word claim code; the code discovers the open
 * challenge, decrypts its terms, and (on accept) authorizes binding in as the opponent via an EIP-712
 * signature from the code-derived key. Membership is required to accept — a non-member is prompted to buy.
 */
function TakeChallengeModal({ isOpen, onClose, onAccepted, onBuyMembership }) {
  const { discover, accept, busy } = useOpenChallengeAccept()
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState('enter') // enter | found | accepted
  const [found, setFound] = useState(null) // { wagerId, wager, terms, termsUnavailable, needsMembership }
  const [error, setError] = useState(null)
  const [txHash, setTxHash] = useState(null)

  // Fresh state per open is handled by a `key` on the parent's render (remount), so no reset effect here.

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const codeValid = isValidCode(code)

  const handleLookup = useCallback(async () => {
    setError(null)
    try {
      const result = await discover(code)
      setFound(result)
      setPhase('found')
    } catch (e) {
      setError(e.message)
    }
  }, [discover, code])

  const handleAccept = useCallback(async () => {
    setError(null)
    try {
      const { txHash: hash } = await accept(code, found.wagerId)
      setTxHash(hash)
      setPhase('accepted')
      onAccepted?.({ wagerId: found.wagerId, txHash: hash })
    } catch (e) {
      setError(e.message)
    }
  }, [accept, code, found, onAccepted])

  if (!isOpen) return null

  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose() }

  return (
    <div className="take-challenge-backdrop" onClick={handleBackdrop} role="dialog" aria-modal="true" aria-labelledby="take-challenge-title">
      <div className="take-challenge-modal">
        <button className="take-challenge-close" onClick={onClose} aria-label="Close">×</button>
        <h2 id="take-challenge-title" className="take-challenge-title">Take a challenge</h2>

        {phase === 'enter' && (
          <div className="take-challenge-step">
            <label htmlFor="claim-code-input" className="take-challenge-label">
              Enter the {CLAIM_CODE_WORD_COUNT}-word code you were given
            </label>
            <input
              id="claim-code-input"
              className="take-challenge-input"
              type="text"
              autoComplete="off"
              spellCheck="false"
              placeholder="e.g. river tiger kite zoo"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && codeValid && !busy) handleLookup() }}
              aria-describedby="claim-code-hint"
            />
            <p id="claim-code-hint" className="take-challenge-hint">
              The code is shared by the challenge creator. Without it, an open challenge can't be found or read.
            </p>
            {error && <p className="take-challenge-error" role="alert">{error}</p>}
            <button className="take-challenge-primary" onClick={handleLookup} disabled={!codeValid || busy}>
              {busy ? 'Looking up…' : 'Find challenge'}
            </button>
          </div>
        )}

        {phase === 'found' && found && (
          <div className="take-challenge-step">
            <div className="take-challenge-terms">
              {found.termsUnavailable ? (
                <p className="take-challenge-warning" role="alert">
                  Terms unavailable — the encrypted details could not be retrieved. You can still accept; the
                  on-chain wager is unaffected. Keep your code to read the terms later.
                </p>
              ) : (
                <pre className="take-challenge-terms-body">{formatTerms(found.terms)}</pre>
              )}
            </div>

            {found.needsMembership ? (
              <>
                <p className="take-challenge-warning">
                  An active membership is required to take a challenge. Any tier works — creating open
                  challenges needs Silver, but taking one does not.
                </p>
                <button className="take-challenge-primary" onClick={() => onBuyMembership?.()}>
                  Get a membership to take this
                </button>
              </>
            ) : (
              <>
                <p className="take-challenge-hint">
                  Accepting binds you as the opponent and escrows your equal stake. Save your code to re-read
                  the terms later.
                </p>
                {error && <p className="take-challenge-error" role="alert">{error}</p>}
                <button className="take-challenge-primary" onClick={handleAccept} disabled={busy}>
                  {busy ? 'Accepting…' : 'Accept challenge'}
                </button>
              </>
            )}
            <button className="take-challenge-secondary" onClick={() => { setPhase('enter'); setFound(null) }}>
              Back
            </button>
          </div>
        )}

        {phase === 'accepted' && (
          <div className="take-challenge-step">
            <p className="take-challenge-success">✓ You've taken the challenge — you're now the opponent.</p>
            {txHash && <p className="take-challenge-hint">Transaction: <code>{shorten(txHash)}</code></p>}
            <p className="take-challenge-hint">Keep your code to re-read the private terms in future.</p>
            <button className="take-challenge-primary" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
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

export default TakeChallengeModal
