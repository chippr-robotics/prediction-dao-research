import { useState, useEffect, useCallback } from 'react'
import { isAddress } from 'ethers'
import { useOpenChallengeCreate, OPEN_RESOLUTION_TYPES } from '../../hooks/useOpenChallengeCreate'
import { useOpenChallengeAccept } from '../../hooks/useOpenChallengeAccept'
import { useOpenChallengeCodeVault } from '../../hooks/useOpenChallengeCodeVault'
import { useWeb3 } from '../../hooks/useWeb3'
import { isValidCode, CLAIM_CODE_WORD_COUNT } from '../../utils/claimCode/wordlist.js'
import WagerQRCode from '../ui/WagerQRCode'
import AddressInput from '../ui/AddressInput'
import AddressBookButton from '../ui/AddressBookButton'
import QRScanner from '../ui/QRScanner'
import { buildTakeChallengeUrl } from '../../utils/claimCode/deepLink.js'
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
function OpenChallengeModal({ isOpen, onClose, onBuyMembership, initialTab = 'maker', initialCode = '' }) {
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
              <button
                type="button" role="tab" aria-selected={tab === 'recover'}
                className={`fm-resolution-tab ${tab === 'recover' ? 'active' : ''}`}
                onClick={() => setTab('recover')}
              >
                <span className="fm-resolution-tab-label">Recover codes</span>
              </button>
            </div>

            {tab === 'maker' && <MakerPanel onClose={onClose} />}
            {tab === 'taker' && <TakerPanel onClose={onClose} onBuyMembership={onBuyMembership} initialCode={initialCode} />}
            {tab === 'recover' && <RecoverPanel />}
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
  const [arbitratorResolved, setArbitratorResolved] = useState('')
  // Deadlines (feature 024 feedback): the maker sets when the challenge can still be taken and when it must
  // be resolved by, so the time constraints aren't hidden defaults. Stored as <input type="datetime-local">
  // strings and converted to unix seconds on submit.
  const [acceptBy, setAcceptBy] = useState(() => toDatetimeLocal(Date.now() + 48 * 3600 * 1000))
  const [resolveBy, setResolveBy] = useState(() => toDatetimeLocal(Date.now() + (48 + 24 * 7) * 3600 * 1000))
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)
  // Encrypted, device-local code backup (feature 024 follow-up) so a forgotten code can be recovered.
  const { saveCode, canUse: canBackup } = useOpenChallengeCodeVault()
  const [backupState, setBackupState] = useState('idle') // idle | saving | saved | error
  const [backupError, setBackupError] = useState(null)

  const isThirdParty = Number(resolutionType) === OPEN_RESOLUTION_TYPES.ThirdParty
  const arbitratorAddr = arbitratorResolved || arbitrator
  const arbitratorValid = !isThirdParty || isAddress(arbitratorAddr)
  const acceptMs = acceptBy ? new Date(acceptBy).getTime() : NaN
  const resolveMs = resolveBy ? new Date(resolveBy).getTime() : NaN
  const deadlinesValid =
    Number.isFinite(acceptMs) && Number.isFinite(resolveMs) &&
    acceptMs > Date.now() && resolveMs > acceptMs
  const canCreate = description.trim().length > 0 && Number(stake) > 0 && arbitratorValid && deadlinesValid && !busy

  const handleCreate = useCallback(async (e) => {
    e?.preventDefault?.()
    setError(null)
    try {
      const res = await createOpenChallenge(
        {
          description: description.trim(),
          stake,
          resolutionType: Number(resolutionType),
          arbitrator: isThirdParty ? arbitratorAddr : undefined,
          acceptDeadline: Number.isFinite(acceptMs) ? Math.floor(acceptMs / 1000) : undefined,
          resolveDeadline: Number.isFinite(resolveMs) ? Math.floor(resolveMs / 1000) : undefined,
        },
        (p) => setProgress(p)
      )
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setProgress(null)
    }
  }, [createOpenChallenge, description, stake, resolutionType, isThirdParty, arbitratorAddr, acceptMs, resolveMs])

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
        description: description.trim(),
        stake,
      })
      setBackupState('saved')
    } catch (err) {
      setBackupState('error')
      setBackupError(err?.message || 'Could not save the backup.')
    }
  }, [result, saveCode, description, stake])

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

        <div className="oc-qr">
          <WagerQRCode value={buildTakeChallengeUrl(result.code)} size={180} ariaLabel="QR code to take this challenge" />
          <span className="oc-qr-caption">Scan to take this challenge — opens the app with the code filled in</span>
        </div>

        <div className="oc-notice oc-notice--warn" role="alert">
          <strong>Save this code now.</strong> It's the only way to take, read, or re-read this challenge — we
          don't store it server-side. Anyone with the code can take the other side.
        </div>

        {/* Encrypted backup (recovery) — stored only on this device, readable only with this wallet. */}
        <div className="oc-backup">
          {backupState === 'saved' ? (
            <p className="oc-backup-ok" role="status">
              <span aria-hidden="true">&#128274;</span> Encrypted backup saved to this device. Recover it
              anytime from the <strong>Recover codes</strong> tab with this wallet.
            </p>
          ) : (
            <>
              <button
                type="button"
                className="fm-btn-secondary"
                onClick={handleSaveBackup}
                disabled={!canBackup || backupState === 'saving'}
              >
                {backupState === 'saving' ? 'Saving…' : 'Save encrypted backup to this device'}
              </button>
              <span className="fm-hint">
                {canBackup
                  ? 'Stores an encrypted copy of the code on this device so you can recover it later if you forget it. Readable only with this wallet.'
                  : 'Connect your wallet to save a recoverable encrypted copy of this code.'}
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
        <ArbitratorField
          value={arbitrator}
          onChange={setArbitrator}
          onResolvedChange={setArbitratorResolved}
          disabled={busy}
        />
      )}

      {/* Time constraints (feature 024 feedback): make the deadlines explicit and editable. */}
      <div className="fm-form-group">
        <label htmlFor="oc-accept-by">Open for acceptance until <span className="fm-required">*</span></label>
        <input
          id="oc-accept-by" type="datetime-local" className="oc-datetime"
          value={acceptBy} min={toDatetimeLocal(Date.now())}
          onChange={(e) => setAcceptBy(e.target.value)} disabled={busy}
        />
        <span className="fm-hint">After this, the challenge can no longer be taken and your stake is refundable.</span>
      </div>
      <div className="fm-form-group">
        <label htmlFor="oc-resolve-by">Must be resolved by <span className="fm-required">*</span></label>
        <input
          id="oc-resolve-by" type="datetime-local" className="oc-datetime"
          value={resolveBy} min={acceptBy || toDatetimeLocal(Date.now())}
          onChange={(e) => setResolveBy(e.target.value)} disabled={busy}
        />
        <span className="fm-hint">The outcome must be submitted before this time.</span>
      </div>
      {!deadlinesValid && (acceptBy || resolveBy) && (
        <p className="fm-hint oc-deadline-warn" role="alert">
          Pick an acceptance time in the future and a resolve time after it.
        </p>
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
// Arbitrator entry — ENS-aware address input with address-book + QR-scan helpers
// (feature 024 feedback). Isolated in its own component so the wallet-scoped
// hooks (chainId, address book) only mount for the third-party path.
// ---------------------------------------------------------------------------
function ArbitratorField({ value, onChange, onResolvedChange, disabled }) {
  const { chainId } = useWeb3()
  const [scannerOpen, setScannerOpen] = useState(false)

  const handleScan = useCallback((decodedText) => {
    const addr = extractAddress(decodedText)
    if (addr) {
      onChange(addr)
      onResolvedChange(addr)
    }
    setScannerOpen(false)
  }, [onChange, onResolvedChange])

  return (
    <div className="fm-form-group fm-form-full">
      <label htmlFor="oc-arb">Arbitrator address <span className="fm-required">*</span></label>
      <div className="fm-input-with-action">
        <div className="fm-address-input-wrap">
          <AddressInput
            id="oc-arb"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onResolvedChange={(addr) => onResolvedChange(addr || '')}
            placeholder="0x… or ENS name — the neutral resolver"
            disabled={disabled}
          />
        </div>
        <AddressBookButton
          chainId={chainId}
          disabled={disabled}
          onSelect={(entry) => { onChange(entry.address); onResolvedChange(entry.address) }}
        />
        <button
          type="button"
          className="fm-scan-btn"
          onClick={() => setScannerOpen(true)}
          disabled={disabled}
          title="Scan QR code"
          aria-label="Scan QR code"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm0 4h2v2h-2v-2z"/>
          </svg>
        </button>
      </div>
      <span className="fm-hint">The arbitrator can read and resolve this challenge, and cannot also take it.</span>
      <QRScanner isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScanSuccess={handleScan} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Taker — accept an open challenge by code
// ---------------------------------------------------------------------------
function TakerPanel({ onClose, onBuyMembership, initialCode = '' }) {
  const { discover, accept, busy } = useOpenChallengeAccept()
  const [code, setCode] = useState(initialCode)
  const [phase, setPhase] = useState('enter') // enter | found | accepted
  const [found, setFound] = useState(null)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(null)
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
      const { txHash: hash } = await accept(code, found.wagerId, (p) => setProgress(p))
      setTxHash(hash)
      setPhase('accepted')
    } catch (err) {
      setError(err.message)
    } finally {
      setProgress(null)
    }
  }, [accept, code, found])

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

        {/* Time constraints (feature 024 feedback): state the deadlines so the taker knows the window. */}
        <ChallengeDeadlines wager={found.wager} />

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
              <button type="button" className="fm-btn-secondary" onClick={() => { setPhase('enter'); setFound(null); setProgress(null) }} disabled={busy}>Back</button>
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

// ---------------------------------------------------------------------------
// Recover codes — unlock the device-local encrypted backup of created codes
// (feature 024 follow-up). Lets a creator recover a forgotten four-word code.
// ---------------------------------------------------------------------------
function RecoverPanel() {
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

  if (!canUse) {
    return (
      <div className="fm-form">
        <p className="fm-hint">Connect your wallet to recover the codes you saved on this device.</p>
      </div>
    )
  }

  if (entries == null) {
    return (
      <div className="fm-form">
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
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="fm-form">
        <p className="fm-hint">
          No saved codes on this device yet. When you create an open challenge, choose
          <strong> Save encrypted backup</strong> to make it recoverable here.
        </p>
      </div>
    )
  }

  return (
    <div className="fm-form">
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
              <button type="button" className="fm-btn-secondary" onClick={() => handleCopy(e.code)}>
                {copiedCode === e.code ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Full step order the accept flow walks through (the visible list omits the quick "check" read).
const ACCEPT_STEP_ORDER = ['check', 'approve', 'sign', 'accept']
const STEP_LABELS = { check: 'Checking', approve: 'Approving', sign: 'Signing', accept: 'Confirming' }

/** Mark a list step done (a later step is active), active (current), or pending — for the take-flow checklist. */
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

/** Format a unix-ms instant as a value for <input type="datetime-local"> (local time, minute precision). */
function toDatetimeLocal(ms) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

/** Pull a 0x-address out of scanned QR text — a bare address or one embedded in a URL path/query. */
function extractAddress(decodedText) {
  if (!decodedText) return null
  const match = String(decodedText).match(/0x[a-fA-F0-9]{40}/)
  return match ? match[0] : null
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
