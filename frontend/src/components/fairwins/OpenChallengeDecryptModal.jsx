import { useState, useEffect, useCallback } from 'react'
import { deriveFromCode } from '../../utils/claimCode/deriveFromCode.js'
import { isValidCode, CLAIM_CODE_WORD_COUNT } from '../../utils/claimCode/wordlist.js'
import { decryptEnvelopeCode, isCodeEnvelope } from '../../utils/crypto/envelopeEncryption.js'
import './FriendMarketsModal.css'
import './OpenChallengeModal.css'
import InfoTip from '../ui/InfoTip'

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

/**
 * Read an open-challenge's terms from the dashboard (feature 024).
 *
 * Open-challenge terms are sealed under a symmetric key derived from the four-word claim code, not under a
 * recipient's wallet key — so the normal "Decrypt Wager Details" path (which unwraps a per-recipient key)
 * can't read them. Both parties (the maker who created it and the taker who took it) re-read by entering the
 * same code here; we derive the key locally and open the code-keyed envelope. Nothing is sent anywhere.
 */
export default function OpenChallengeDecryptModal({ isOpen, onClose, envelope, onDecrypted }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isOpen) { setCode(''); setError(null) }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const handleSubmit = useCallback((e) => {
    e?.preventDefault?.()
    setError(null)
    try {
      if (!isCodeEnvelope(envelope)) {
        throw new Error('These terms are not code-protected.')
      }
      const { symKey } = deriveFromCode(code)
      const terms = decryptEnvelopeCode(envelope, symKey) // throws on a wrong code / tampered bytes
      onDecrypted?.(typeof terms === 'string' ? { description: terms } : terms)
      onClose()
    } catch {
      // Wrong code and tampered bytes both surface as a decryption failure; don't distinguish (no oracle).
      setError("That code didn't unlock these terms. Check the four words and try again.")
    }
  }, [code, envelope, onDecrypted, onClose])

  if (!isOpen) return null
  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose() }
  const codeValid = isValidCode(code)

  return (
    <div
      className="friend-markets-modal-backdrop"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="oc-decrypt-title"
    >
      <div className="friend-markets-modal oc-decrypt-modal" onClick={(e) => e.stopPropagation()}>
        <header className="fm-header">
          <div className="fm-header-content">
            <div className="fm-brand">
              <span className="fm-brand-icon">&#128273;</span>
              <h2 id="oc-decrypt-title">Read this open challenge</h2>
            </div>
            <p className="fm-subtitle">Enter your code to unlock the private terms</p>
          </div>
          <button className="fm-close-btn" onClick={onClose} aria-label="Close modal">
            <CloseIcon />
          </button>
        </header>

        <div className="fm-content">
          <div className="fm-panel">
            <form className="fm-form" onSubmit={handleSubmit}>
              <div className="fm-form-group fm-form-full">
                <span className="fm-label-row">
                  <label htmlFor="oc-decrypt-code">
                    Your {CLAIM_CODE_WORD_COUNT}-word code <span className="fm-required">*</span>
                  </label>
                  <InfoTip label="About reading this challenge">
                    This is an open challenge — its terms are locked to the four-word code, not your wallet.
                    Enter the code you saved when you created or took it to read the terms.
                  </InfoTip>
                </span>
                <input
                  id="oc-decrypt-code" type="text" autoComplete="off" spellCheck="false"
                  placeholder="e.g. river tiger kite zoo"
                  value={code} onChange={(e) => setCode(e.target.value)}
                />
              </div>
              {error && <div className="fm-error-banner" role="alert">{error}</div>}
              <div className="fm-success-actions">
                <button type="submit" className="fm-btn-primary" disabled={!codeValid}>Unlock terms</button>
                <button type="button" className="fm-btn-secondary" onClick={onClose}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
