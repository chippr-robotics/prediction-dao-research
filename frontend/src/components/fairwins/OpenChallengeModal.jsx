import { useState, useEffect, useCallback, useRef } from 'react'
import { isAddress } from 'ethers'
import { useOpenChallengeCreate, OPEN_RESOLUTION_TYPES } from '../../hooks/useOpenChallengeCreate'
import { useOpenChallengeCodeVault } from '../../hooks/useOpenChallengeCodeVault'
import { useWeb3 } from '../../hooks/useWeb3'
import WagerQRCode from '../ui/WagerQRCode'
import AddressInput from '../ui/AddressInput'
import AddressBookButton from '../ui/AddressBookButton'
import QRScanner from '../ui/QRScanner'
import { buildTakeChallengeUrl } from '../../utils/claimCode/deepLink.js'
import DeadlineTimeline from './DeadlineTimeline'
import { toDatetimeLocal, fromDatetimeLocal, formatTimelineSpan, HOUR_MS, DAY_MS } from './wagerTimeline'
import PillSelect from '../ui/PillSelect'
import InfoTip from '../ui/InfoTip'
import './FriendMarketsModal.css'
import './OpenChallengeModal.css'

// Deadline bounds (unchanged from the previous slider-based timeline):
// acceptance window caps at the open-challenge contract's MAX_ACCEPT_WINDOW
// (30 days); the resolve window caps comfortably under the 180-day contract
// resolve window.
const ACCEPT_MAX_MS = 30 * DAY_MS
const RESOLVE_MAX_GAP_MS = 90 * DAY_MS

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

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
 * Open-challenge modal (feature 024) — create a code-gated wager with no named opponent (Silver+).
 * Taking a challenge moved to the unified phrase lookup (spec 037, UnifiedLookupModal). Styled to match
 * the create-a-wager modal (shared `fm-*` classes). Create-only, so no mode tabs — the header alone
 * says what this modal does (testing feedback).
 */
function OpenChallengeModal({ isOpen, onClose }) {
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
            <p className="fm-subtitle">
              A code-gated wager — no opponent named up front
              <InfoTip label="About open challenges">
                An open challenge has no named opponent — anyone you share the code with can take the other side.
                Equal stakes. Creating one requires a Silver membership or above.
              </InfoTip>
            </p>
          </div>
          <button className="fm-close-btn" onClick={onClose} aria-label="Close modal">
            <CloseIcon />
          </button>
        </header>

        <div className="fm-content">
          <div className="fm-panel">
            {/* Taking a challenge moved to the unified phrase lookup (spec 037). */}
            <MakerPanel onClose={onClose} />
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
  const [stake, setStake] = useState('10.00')
  const [resolutionType, setResolutionType] = useState(String(OPEN_RESOLUTION_TYPES.Either))
  const [arbitrator, setArbitrator] = useState('')
  const [arbitratorResolved, setArbitratorResolved] = useState('')
  // Deadlines (feature 024 feedback): the maker sets when the challenge can still be taken and when it must
  // be resolved by, so the time constraints aren't hidden defaults. Stored as <input type="datetime-local">
  // strings and converted to unix seconds on submit.
  const [acceptBy, setAcceptBy] = useState(() => toDatetimeLocal(Date.now() + 48 * HOUR_MS))
  const [resolveBy, setResolveBy] = useState(() => toDatetimeLocal(Date.now() + (48 + 24 * 7) * HOUR_MS))
  // Mount-time "now" anchors the timeline's track/bounds so positions don't drift while the form is open.
  const [nowMs] = useState(() => Date.now())
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)
  // Encrypted, device-local code backup (feature 024 follow-up) so a forgotten code can be recovered.
  const { saveCode, canUse: canBackup } = useOpenChallengeCodeVault()
  const [backupState, setBackupState] = useState('idle') // idle | saving | saved | error
  const [backupError, setBackupError] = useState(null)
  const autoBackupStarted = useRef(false)

  const isThirdParty = Number(resolutionType) === OPEN_RESOLUTION_TYPES.ThirdParty
  const arbitratorAddr = arbitratorResolved || arbitrator
  const arbitratorValid = !isThirdParty || isAddress(arbitratorAddr)
  const acceptMs = fromDatetimeLocal(acceptBy)
  const resolveMs = fromDatetimeLocal(resolveBy)
  const deadlinesValid =
    Number.isFinite(acceptMs) && Number.isFinite(resolveMs) &&
    acceptMs > Date.now() && resolveMs > acceptMs
  const canCreate = description.trim().length > 0 && Number(stake) > 0 && arbitratorValid && deadlinesValid && !busy

  // Milestones for the shared DeadlineTimeline control (spec 038 US1): both
  // deadlines are directly editable via drag or the tap-to-set modal.
  const timelineMilestones = [
    {
      key: 'accept',
      label: 'Open for acceptance until',
      tileHead: 'Open until',
      value: Number.isFinite(acceptMs) ? acceptMs : nowMs + 48 * HOUR_MS,
      min: nowMs + HOUR_MS,
      max: nowMs + ACCEPT_MAX_MS,
      editable: true,
      hint: 'After this, the challenge can no longer be taken and your stake is refundable.',
      segmentColor: 'var(--timeline-accept)',
      dotClass: 'is-accept',
      tileClass: 'is-accept',
    },
    {
      key: 'resolve',
      label: 'Must be resolved by',
      tileHead: 'Resolve by',
      value: Number.isFinite(resolveMs) ? resolveMs : (Number.isFinite(acceptMs) ? acceptMs : nowMs + 48 * HOUR_MS) + 7 * DAY_MS,
      min: (Number.isFinite(acceptMs) ? acceptMs : nowMs + 48 * HOUR_MS) + HOUR_MS,
      max: (Number.isFinite(acceptMs) ? acceptMs : nowMs + 48 * HOUR_MS) + RESOLVE_MAX_GAP_MS,
      editable: true,
      hint: 'The outcome must be submitted before this time.',
      segmentColor: 'var(--timeline-active)',
      dotClass: 'is-resolve',
      tileClass: 'is-resolve',
    },
  ]
  const handleTimelineChange = (key, ms) => {
    const str = toDatetimeLocal(ms)
    if (key === 'accept') setAcceptBy(str)
    else if (key === 'resolve') setResolveBy(str)
  }

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

  // Save the share words locally without the user having to do anything (testing feedback):
  // as soon as the challenge exists, write the encrypted device backup automatically. If it
  // can't complete (no wallet, signature declined), the manual save button below is the fallback.
  useEffect(() => {
    if (!result || !canBackup || autoBackupStarted.current) return
    autoBackupStarted.current = true
    handleSaveBackup()
  }, [result, canBackup, handleSaveBackup])

  if (result) {
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
              <span className="fm-label-row oc-backup-row">
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
          <button type="button" className="fm-btn-primary fm-success-done" onClick={onClose}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <form className="fm-form" onSubmit={handleCreate}>
      <div className="fm-form-group fm-form-full">
        <span className="fm-label-row">
          <label htmlFor="oc-desc">What&apos;s the wager? <span className="fm-required">*</span></label>
          <InfoTip label="About: What's the wager?">
            Phrase it so it&apos;s clear which side you&apos;re on; the taker takes the opposite.
          </InfoTip>
        </span>
        <input
          id="oc-desc" type="text" maxLength={200}
          placeholder="e.g. I'm betting NO that it rains in Denver tomorrow"
          value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy}
        />
      </div>

      <div className="fm-form-group fm-form-full">
        <span className="fm-label-row">
          <label htmlFor="oc-stake">Stake — each side <span className="fm-required">*</span></label>
          <InfoTip label="About: Stake — each side">
            Enter the amount in USD. Only USDC is supported for open challenges on this network.
          </InfoTip>
        </span>
        <div className="fm-stake-input-wrapper fm-stake-row">
          <span className="fm-stake-prefix">$</span>
          <input
            id="oc-stake" type="number" inputMode="decimal" min="0" step="0.01"
            placeholder="10.00" className="fm-stake-usd"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            onBlur={() => {
              const n = Number(stake)
              if (stake !== '' && Number.isFinite(n) && n > 0) setStake(n.toFixed(2))
            }}
            disabled={busy}
          />
          {/* Stake token control is always interactive (spec 038 FR-011), even
              though open challenges only support the chain stablecoin today. */}
          <select id="oc-stake-token" aria-label="Stake Token" className="fm-token-select fm-stake-token-inline" disabled={busy} value="USDC" onChange={() => {}}>
            <option value="USDC">💵 USDC</option>
          </select>
        </div>
      </div>

      <div className="fm-form-group fm-form-full">
        <PillSelect
          label={<>How is it resolved? <span className="fm-required">*</span></>}
          info={(
            <InfoTip label="About: How is it resolved?">
              Single-party self-resolution isn&apos;t available for open challenges — the taker is unknown when you post it.
            </InfoTip>
          )}
          options={[
            { value: String(OPEN_RESOLUTION_TYPES.Either), label: 'Either side submits the outcome' },
            { value: String(OPEN_RESOLUTION_TYPES.ThirdParty), label: 'A named third-party arbitrator decides' },
          ]}
          value={resolutionType}
          onChange={setResolutionType}
          disabled={busy}
        />
      </div>

      {isThirdParty && (
        <ArbitratorField
          value={arbitrator}
          onChange={setArbitrator}
          onResolvedChange={setArbitratorResolved}
          disabled={busy}
        />
      )}

      {/* Time constraints (testing feedback): the shared deadline timeline — drag a dot to
          pick each time, or tap a tile to open the exact date & time modal. */}
      <DeadlineTimeline
        milestones={timelineMilestones}
        onChange={handleTimelineChange}
        disabled={busy}
        idPrefix="oc"
        summary={deadlinesValid
          ? `Open ${formatTimelineSpan(new Date(nowMs), new Date(acceptMs))} for a taker · ` +
            `then up to ${formatTimelineSpan(new Date(acceptMs), new Date(resolveMs))} to settle`
          : null}
      />
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

// Deadline timeline moved to the shared DeadlineTimeline component (./DeadlineTimeline.jsx) so the
// group-pool create flow presents its windows the same way (pool-manager tester feedback). This
// modal renders it with its default open-challenge labels.

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
      <span className="fm-label-row">
        <label htmlFor="oc-arb">Arbitrator address <span className="fm-required">*</span></label>
        <InfoTip label="About: Arbitrator address">
          The arbitrator can read and resolve this challenge, and cannot also take it.
        </InfoTip>
      </span>
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
      <QRScanner isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScanSuccess={handleScan} />
    </div>
  )
}

// Recover codes moved to My Account → Security (spec 037, US3):
// see components/account/RecoveryCodesPanel.jsx.

/** Pull a 0x-address out of scanned QR text — a bare address or one embedded in a URL path/query. */
function extractAddress(decodedText) {
  if (!decodedText) return null
  const match = String(decodedText).match(/0x[a-fA-F0-9]{40}/)
  return match ? match[0] : null
}

export default OpenChallengeModal
