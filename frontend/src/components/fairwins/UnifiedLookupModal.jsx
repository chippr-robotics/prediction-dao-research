import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnifiedLookup } from '../../hooks/useUnifiedLookup'
import { normalizePhrase } from '../../lib/lookup/resolvePhraseLookup.js'
import TakeChallengePanel from './TakeChallengePanel'
import JoinPoolPanel from './JoinPoolPanel'
import './FriendMarketsModal.css'
import './OpenChallengeModal.css'

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

/**
 * Unified phrase lookup modal (spec 037, US1 / FR-001..013/025).
 *
 * One "enter a phrase" surface that resolves a four-word phrase to EITHER an open challenge or a group
 * pool and shows the matching take/join interface — the user never picks the type. Replaces the separate
 * "Take a challenge" and "Join a pool" entry points. Read-only preview requires no wallet signature
 * (FR-010); only the terminal take/join action signs.
 */
export default function UnifiedLookupModal({ isOpen, onClose, onBuyMembership, initialPhrase = '', autoResolve = false }) {
  const { status, result, submit, reset } = useUnifiedLookup()
  const navigate = useNavigate()
  const [phrase, setPhrase] = useState(initialPhrase)
  const [choice, setChoice] = useState(null) // collision disambiguation: 'challenge' | 'pool'

  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // Deep-link prefill + auto-resolve (FR-013): a shared ?oc=take&code= link opens here pre-resolved.
  useEffect(() => {
    if (isOpen && autoResolve && initialPhrase) {
      setPhrase(initialPhrase)
      submit(initialPhrase)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, autoResolve, initialPhrase])

  const onSubmit = useCallback((e) => {
    e.preventDefault()
    setChoice(null)
    submit(phrase)
  }, [submit, phrase])

  const searchAgain = useCallback(() => { setChoice(null); reset() }, [reset])

  if (!isOpen) return null
  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose() }

  const code = normalizePhrase(phrase)
  const kind = status === 'result' ? result?.kind : null
  const showingPanel = kind === 'challenge' || kind === 'pool' || kind === 'collision' || kind === 'not-actionable' || kind === 'self'
  const showForm = !showingPanel

  const openPoolManagement = (address) => { onClose(); navigate(`/pools/${address}`) }

  const renderResult = () => {
    if (status !== 'result' || !result) return null
    switch (result.kind) {
      case 'challenge':
        return <TakeChallengePanel code={code} match={result.match} onClose={onClose} onBuyMembership={onBuyMembership} onBack={searchAgain} />
      case 'pool':
        return (
          <>
            <JoinPoolPanel summary={result.match} onClose={onClose} />
            <div className="fm-success-actions"><button type="button" className="fm-btn-secondary" onClick={searchAgain}>Back</button></div>
          </>
        )
      case 'collision':
        if (!choice) {
          return (
            <div className="fm-form">
              <p className="fm-hint">Those four words match both a challenge and a pool. Which do you want to open?</p>
              <div className="fm-success-actions">
                <button type="button" className="fm-btn-primary" onClick={() => setChoice('challenge')}>Open the challenge</button>
                <button type="button" className="fm-btn-primary" onClick={() => setChoice('pool')}>Open the pool</button>
                <button type="button" className="fm-btn-secondary" onClick={searchAgain}>Back</button>
              </div>
            </div>
          )
        }
        return choice === 'challenge'
          ? <TakeChallengePanel code={code} match={result.challenge} onClose={onClose} onBuyMembership={onBuyMembership} onBack={() => setChoice(null)} />
          : (<>
              <JoinPoolPanel summary={result.pool} onClose={onClose} />
              <div className="fm-success-actions"><button type="button" className="fm-btn-secondary" onClick={() => setChoice(null)}>Back</button></div>
            </>)
      case 'self':
        return (
          <div className="fm-form">
            <p className="fm-hint">
              {result.type === 'pool'
                ? 'You’re already in this pool. Open it to manage your membership.'
                : 'This is your own challenge. Manage it from My Wagers.'}
            </p>
            <div className="fm-success-actions">
              {result.type === 'pool'
                ? <button type="button" className="fm-btn-primary" onClick={() => openPoolManagement(result.match.address)}>Open pool</button>
                : <button type="button" className="fm-btn-primary" onClick={onClose}>Close</button>}
              <button type="button" className="fm-btn-secondary" onClick={searchAgain}>Back</button>
            </div>
          </div>
        )
      case 'not-actionable':
        return (
          <div className="fm-form">
            <div className="oc-notice oc-notice--warn" role="alert">
              {result.type === 'pool'
                ? `This pool can’t be joined right now (${result.reason}).`
                : 'This challenge can no longer be taken.'}
            </div>
            <div className="fm-success-actions"><button type="button" className="fm-btn-secondary" onClick={searchAgain}>Back</button></div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div
      className="friend-markets-modal-backdrop"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unified-lookup-title"
    >
      <div className="friend-markets-modal" onClick={(e) => e.stopPropagation()}>
        <header className="fm-header">
          <div className="fm-header-content">
            <div className="fm-brand">
              <span className="fm-brand-icon" aria-hidden="true">&#128269;</span>
              <h2 id="unified-lookup-title">Enter a phrase</h2>
            </div>
            <p className="fm-subtitle">Open a challenge or a pool with the four words a friend shared</p>
          </div>
          <button className="fm-close-btn" onClick={onClose} aria-label="Close modal">
            <CloseIcon />
          </button>
        </header>

        <div className="fm-content">
          <div className="fm-panel">
            {showForm && (
              <form className="fm-form" onSubmit={onSubmit}>
                <div className="fm-form-group fm-form-full">
                  <label htmlFor="unified-phrase-input">Four-word phrase <span className="fm-required">*</span></label>
                  <input
                    id="unified-phrase-input" type="text" autoComplete="off" spellCheck="false"
                    placeholder="e.g. crystal orbit harbor violet"
                    value={phrase} onChange={(e) => setPhrase(e.target.value)}
                    disabled={status === 'resolving'}
                  />
                  <span className="fm-hint">We’ll find whatever the words point to — a challenge or a pool.</span>
                </div>

                {status === 'result' && result?.kind === 'format-error' && (
                  <div className="fm-error-banner" role="alert">
                    {result.message} Enter exactly four words, e.g. “crystal orbit harbor violet”.
                  </div>
                )}
                {status === 'result' && result?.kind === 'none' && (
                  <div className="oc-notice" role="status">
                    No pool or challenge matches those four words. Check the words and try again.
                  </div>
                )}
                {status === 'result' && result?.kind === 'lookup-failed' && (
                  <div className="fm-error-banner" role="alert">
                    Couldn’t check right now — a network issue got in the way. Please try again.
                  </div>
                )}

                <div className="fm-success-actions">
                  <button type="submit" className="fm-btn-primary" disabled={status === 'resolving' || phrase.trim() === ''}>
                    {status === 'resolving' ? 'Looking up…' : 'Find'}
                  </button>
                </div>
                <span className="sr-only" role="status" aria-live="polite">
                  {status === 'resolving' ? 'Looking up your phrase' : ''}
                </span>
              </form>
            )}

            {renderResult()}
          </div>
        </div>
      </div>
    </div>
  )
}
