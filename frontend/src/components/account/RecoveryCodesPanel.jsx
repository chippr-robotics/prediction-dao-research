import { useState, useCallback } from 'react'
import { useOpenChallengeCodeVault } from '../../hooks/useOpenChallengeCodeVault'
import '../fairwins/FriendMarketsModal.css'
import '../fairwins/OpenChallengeModal.css'

/**
 * Recovery codes panel (spec 037, US3 / FR-020..023).
 *
 * The open-challenge recovery-codes feature, relocated from the Open Challenge modal to
 * My Account → Security. Backed by the unchanged device-local code vault
 * (useOpenChallengeCodeVault), so codes saved before the move remain accessible with no
 * migration and the existing unlock (one wallet signature) is preserved.
 */
export default function RecoveryCodesPanel() {
  const { canUse, recoverCodes, busy } = useOpenChallengeCodeVault()
  const [entries, setEntries] = useState(null) // null = not unlocked yet
  const [error, setError] = useState(null)
  const [copiedCode, setCopiedCode] = useState(null)

  const handleUnlock = useCallback(async () => {
    setError(null)
    try {
      const list = await recoverCodes()
      setEntries(list)
    } catch (err) {
      setError(err?.message || 'Could not unlock your saved codes.')
    }
  }, [recoverCodes])

  const handleCopy = useCallback(async (code) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 2000)
    } catch { /* clipboard unavailable */ }
  }, [])

  let body
  if (!canUse) {
    body = (
      <p className="fm-hint">Connect your wallet to recover the open-challenge codes you saved on this device.</p>
    )
  } else if (entries == null) {
    body = (
      <>
        <p className="fm-hint">
          Codes you chose to back up are stored encrypted on this device, readable only with this wallet.
          Unlock to recover a forgotten code. (Codes saved on other devices won&apos;t appear here.)
        </p>
        {error && <div className="fm-error-banner" role="alert">{error}</div>}
        <div className="fm-success-actions">
          <button type="button" className="fm-btn-primary" onClick={handleUnlock} disabled={busy}>
            {busy ? 'Unlocking…' : 'Unlock my saved codes'}
          </button>
        </div>
      </>
    )
  } else if (entries.length === 0) {
    body = (
      <p className="fm-hint">
        No saved codes on this device yet. When you create an open challenge, choose
        <strong> Save encrypted backup</strong> to make it recoverable here.
      </p>
    )
  } else {
    body = (
      <>
        <p className="fm-hint">Your saved codes — keep them private; anyone with a code can take that challenge.</p>
        <ul className="oc-recover-list">
          {entries.map((e) => (
            <li key={e.code} className="oc-recover-item">
              <div className="oc-recover-meta">
                <span className="oc-recover-title">{e.description || 'Open challenge'}</span>
                <span className="oc-recover-sub">
                  {e.wagerId != null ? `#${e.wagerId}` : 'Unsubmitted'}
                  {e.savedAt ? ` · saved ${new Date(e.savedAt).toLocaleDateString()}` : ''}
                </span>
              </div>
              <div className="oc-code-display oc-recover-code">
                <code className="oc-code">{e.code}</code>
                <button
                  type="button"
                  className="fm-btn-secondary"
                  onClick={() => handleCopy(e.code)}
                  aria-label={`Copy recovery code for ${e.description || 'open challenge'}`}
                >
                  {copiedCode === e.code ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <span className="sr-only" role="status" aria-live="polite">
          {copiedCode ? 'Code copied to clipboard' : ''}
        </span>
      </>
    )
  }

  return (
    <div className="section">
      <h3>Recovery codes</h3>
      <p className="section-description">
        Recover the four-word codes for open challenges you created and backed up on this device.
      </p>
      <div className="fm-form">{body}</div>
    </div>
  )
}
