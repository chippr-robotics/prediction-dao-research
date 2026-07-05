import { useState, useEffect, useCallback, useRef } from 'react'
import { useOpenChallengeCodeVault } from '../../hooks/useOpenChallengeCodeVault'
import WagerQRCode from '../ui/WagerQRCode'
import InfoTip from '../ui/InfoTip'
import { buildTakeChallengeUrl } from '../../utils/claimCode/deepLink.js'

const CopyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
)

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * Post-create claim-code result (spec 041 extraction of the feature-024 UI, byte-for-byte
 * behavior): shows the four-word code ONCE with copy, QR / take-challenge deep link, the
 * save-it-now warning, and the encrypted device-local backup (auto-saved when possible,
 * manual fallback otherwise). Shared by the user-defined and oracle-settled open-challenge
 * create flows so the security-relevant UX cannot drift between them.
 *
 * `backupMeta` ({ description, stake }) labels the vault entry for later recovery.
 */
export default function ClaimCodeResultPanel({ result, backupMeta = {}, onDone }) {
  const [copied, setCopied] = useState(false)
  const { saveCode, canUse: canBackup } = useOpenChallengeCodeVault()
  const [backupState, setBackupState] = useState('idle') // idle | saving | saved | error
  const [backupError, setBackupError] = useState(null)
  const autoBackupStarted = useRef(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }, [result])

  const handleSaveBackup = useCallback(async () => {
    if (!result) return
    setBackupError(null)
    setBackupState('saving')
    try {
      await saveCode({
        code: result.code,
        wagerId: result.wagerId != null ? String(result.wagerId) : null,
        description: backupMeta.description || '',
        stake: backupMeta.stake,
      })
      setBackupState('saved')
    } catch (err) {
      setBackupState('error')
      setBackupError(err?.message || 'Could not save the backup.')
    }
  }, [result, saveCode, backupMeta.description, backupMeta.stake])

  // Save the share words locally without the user having to do anything (testing feedback):
  // as soon as the challenge exists, write the encrypted device backup automatically. If it
  // can't complete (no wallet, signature declined), the manual save button below is the fallback.
  useEffect(() => {
    if (!result || !canBackup || autoBackupStarted.current) return
    autoBackupStarted.current = true
    handleSaveBackup()
  }, [result, canBackup, handleSaveBackup])

  if (!result) return null

  return (
    <div className="fm-success">
      <div className="fm-success-icon" aria-hidden="true">&#127881;</div>
      <h3>Open challenge created</h3>
      <p className="fm-success-desc">Share this four-word code with whoever you want to take the other side.</p>

      <div className="oc-code-display">
        <code className="oc-code">{result.code}</code>
        <button
          type="button"
          className="oc-copy-btn"
          onClick={handleCopy}
          title={copied ? 'Copied' : 'Copy code'}
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>

      <div className="oc-qr">
        <WagerQRCode value={buildTakeChallengeUrl(result.code)} size={180} ariaLabel="QR code to take this challenge" />
        <span className="oc-qr-caption">Scan to take this challenge — opens the app with the code filled in</span>
      </div>

      <div className="oc-notice oc-notice--warn" role="alert">
        <strong>Save this code now.</strong> It's the only way to take, read, or re-read this challenge — we
        don't store it server-side. Anyone with the code can take the other side.
      </div>

      {/* Encrypted backup (recovery) — saved automatically, stored only on this device, readable only with this wallet. */}
      <div className="oc-backup">
        {backupState === 'saved' ? (
          <p className="oc-backup-ok" role="status">
            <span aria-hidden="true">&#128274;</span> Encrypted backup saved to this device. Recover it
            anytime from the <strong>Recover codes</strong> tab with this wallet.
          </p>
        ) : backupState === 'saving' ? (
          <p className="oc-backup-ok" role="status">
            <span aria-hidden="true">&#128274;</span> Saving an encrypted backup to this device…
          </p>
        ) : (
          <>
            <span className="fm-label-row">
              <button
                type="button"
                className="fm-btn-secondary"
                onClick={handleSaveBackup}
                disabled={!canBackup}
              >
                Save encrypted backup to this device
              </button>
              <InfoTip label="About: Encrypted backup">
                {canBackup
                  ? 'Stores an encrypted copy of the code on this device so you can recover it later if you forget it. Readable only with this wallet.'
                  : 'Connect your wallet to save a recoverable encrypted copy of this code.'}
              </InfoTip>
            </span>
            {backupState === 'error' && backupError && (
              <div className="fm-error-banner" role="alert">{backupError}</div>
            )}
          </>
        )}
      </div>
      <p className="fm-hint">
        The four words resist casual guessing, but a determined attacker with specialized hardware could
        brute-force them. Use it for friendly stakes and share it only with the people you intend to.
      </p>

      <div className="fm-success-actions">
        <button type="button" className="fm-btn-primary fm-success-done" onClick={onDone}>Done</button>
      </div>
    </div>
  )
}
