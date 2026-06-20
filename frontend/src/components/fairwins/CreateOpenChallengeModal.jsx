import { useState, useEffect, useCallback } from 'react'
import { useOpenChallengeCreate, OPEN_RESOLUTION_TYPES } from '../../hooks/useOpenChallengeCreate'
import { isAddress } from 'ethers'
import './TakeChallengeModal.css'
import './CreateOpenChallengeModal.css'

/**
 * Create-an-open-challenge modal (feature 024): a wager with NO named opponent, gated by a four-word claim
 * code that does triple duty (discovery, accept authorization, terms decryption). Equal stakes; resolution
 * restricted to Either-side or a third-party arbitrator (single-party self-resolution is barred on-chain).
 * Silver+ membership is required to create (enforced on-chain). The generated code is shown ONCE to save and
 * share out-of-band — with honest residual-risk and save-the-code notices.
 */
function CreateOpenChallengeModal({ isOpen, onClose, onCreated }) {
  const { createOpenChallenge, busy } = useOpenChallengeCreate()
  const [description, setDescription] = useState('')
  const [stake, setStake] = useState('10')
  const [resolutionType, setResolutionType] = useState(String(OPEN_RESOLUTION_TYPES.Either))
  const [arbitrator, setArbitrator] = useState('')
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null) // { code, wagerId }
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const isThirdParty = Number(resolutionType) === OPEN_RESOLUTION_TYPES.ThirdParty
  const arbitratorValid = !isThirdParty || isAddress(arbitrator)
  const canCreate = description.trim().length > 0 && Number(stake) > 0 && arbitratorValid && !busy

  const handleCreate = useCallback(async () => {
    setError(null)
    try {
      const res = await createOpenChallenge(
        {
          description: description.trim(),
          stake,
          resolutionType: Number(resolutionType),
          arbitrator: isThirdParty ? arbitrator : undefined,
        },
        (p) => setProgress(p)
      )
      setResult(res)
      onCreated?.(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setProgress(null)
    }
  }, [createOpenChallenge, description, stake, resolutionType, isThirdParty, arbitrator, onCreated])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }, [result])

  if (!isOpen) return null
  const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose() }

  return (
    <div className="take-challenge-backdrop" onClick={handleBackdrop} role="dialog" aria-modal="true" aria-labelledby="create-open-title">
      <div className="take-challenge-modal">
        <button className="take-challenge-close" onClick={onClose} aria-label="Close">×</button>
        <h2 id="create-open-title" className="take-challenge-title">Create an open challenge</h2>

        {!result ? (
          <div className="take-challenge-step">
            <p className="take-challenge-hint">
              An open challenge has no named opponent — anyone you share the four-word code with can take the
              other side. Equal stakes. Creating one requires a Silver membership or above.
            </p>

            <label htmlFor="oc-desc" className="take-challenge-label">What's the wager?</label>
            <textarea
              id="oc-desc"
              className="take-challenge-input oc-textarea"
              rows={3}
              placeholder="e.g. Will it rain in Denver tomorrow? Creator says no."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <label htmlFor="oc-stake" className="take-challenge-label">Stake (each side, USDC)</label>
            <input
              id="oc-stake" className="take-challenge-input" type="number" min="0" step="0.01"
              value={stake} onChange={(e) => setStake(e.target.value)}
            />

            <label htmlFor="oc-resolution" className="take-challenge-label">How is it resolved?</label>
            <select
              id="oc-resolution" className="take-challenge-input"
              value={resolutionType} onChange={(e) => setResolutionType(e.target.value)}
            >
              <option value={OPEN_RESOLUTION_TYPES.Either}>Either side submits the outcome (equal stakes)</option>
              <option value={OPEN_RESOLUTION_TYPES.ThirdParty}>A named third-party arbitrator decides</option>
            </select>
            <p className="take-challenge-hint">
              Single-party self-resolution (creator-decides / opponent-decides) isn't available for open
              challenges — the taker is unknown when you post it.
            </p>

            {isThirdParty && (
              <>
                <label htmlFor="oc-arb" className="take-challenge-label">Arbitrator address</label>
                <input
                  id="oc-arb" className="take-challenge-input" type="text" placeholder="0x…"
                  value={arbitrator} onChange={(e) => setArbitrator(e.target.value)}
                />
                <p className="take-challenge-hint">
                  The arbitrator can read and resolve this challenge, and cannot also take it.
                </p>
              </>
            )}

            {progress && <p className="take-challenge-hint" role="status">{progress.message}</p>}
            {error && <p className="take-challenge-error" role="alert">{error}</p>}
            <button className="take-challenge-primary" onClick={handleCreate} disabled={!canCreate}>
              {busy ? 'Creating…' : 'Create & generate code'}
            </button>
          </div>
        ) : (
          <div className="take-challenge-step">
            <p className="take-challenge-success">✓ Open challenge created{result.wagerId != null ? ` (#${result.wagerId})` : ''}.</p>

            <p className="take-challenge-label">Your claim code — share it with whoever you want to take this:</p>
            <div className="oc-code-display">
              <code className="oc-code">{result.code}</code>
              <button className="take-challenge-secondary" onClick={handleCopy}>{copied ? 'Copied ✓' : 'Copy'}</button>
            </div>

            <p className="take-challenge-warning" role="alert">
              <strong>Save this code now.</strong> It is the only way to take, read, or re-read this
              challenge — we don't store it and it can't be recovered. Anyone with the code can take the
              other side.
            </p>
            <p className="take-challenge-hint">
              Security note: the four-word code resists casual guessing, but a determined attacker with
              specialized hardware could brute-force it. Use it for friendly stakes; share it only with the
              people you intend to.
            </p>

            <button className="take-challenge-primary" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default CreateOpenChallengeModal
