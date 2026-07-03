import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../../hooks/useWalletManagement'
import { usePools } from '../../hooks/usePools'
import WagerQRCode from '../ui/WagerQRCode'
import { buildTakeChallengeUrl } from '../../utils/claimCode/deepLink.js'
import DeadlineTimeline from './DeadlineTimeline'
import { toDatetimeLocal, fromDatetimeLocal, formatTimelineSpan, HOUR_MS, DAY_MS } from './wagerTimeline'
import './FriendMarketsModal.css'
import './OpenChallengeModal.css'
import '../../pages/pools.css'

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
 * GroupPoolModal (spec 034 + create-flow tester punchlist) — the group-pool create entry flow, styled
 * to match the other wager bottom-sheets (FriendMarketsModal / OpenChallengeModal): same backdrop,
 * fm-header, and fm-content/fm-panel. Create-only, so no mode tabs/pills — the header alone says what
 * this modal does (same testing feedback as the open challenge). Joining lives in the unified phrase
 * lookup (spec 037); managing a created/joined pool lives at /pools/:address.
 */
export default function GroupPoolModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="friend-markets-modal-backdrop"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-pool-title"
    >
      <div className="friend-markets-modal" onClick={(e) => e.stopPropagation()}>
        <header className="fm-header">
          <div className="fm-header-content">
            <div className="fm-brand">
              <span className="fm-brand-icon" aria-hidden="true">&#128101;</span>
              <h2 id="group-pool-title">Group Pool</h2>
            </div>
            <p className="fm-subtitle">A larger pool — share four words so friends can join</p>
          </div>
          <button className="fm-close-btn" onClick={onClose} aria-label="Close modal">
            <CloseIcon />
          </button>
        </header>

        <div className="fm-content">
          <div className="fm-panel">
            {/* Joining a pool moved to the unified phrase lookup (spec 037): enter four words there. */}
            <CreatePanel onClose={onClose} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Approval-threshold choices (tester feedback): a raw percent input read as jargon — offer named
// levels of group agreement instead. Percent of members who joined; the contract stores bips.
const THRESHOLD_CHOICES = [
  { pct: 51, label: 'Majority', detail: 'More than half of the group must approve the payout.' },
  { pct: 67, label: 'Two-thirds', detail: 'Two of every three members must approve the payout.' },
  { pct: 100, label: 'Everyone', detail: 'Every member must approve the payout — one holdout blocks it.' },
]

// Same bounds the previous slider-based timeline used: joining can stay open
// up to 30 days, and the resolve window can run up to 90 days after joining
// closes.
const JOIN_MAX_MS = 30 * DAY_MS
const RESOLVE_MAX_GAP_MS = 90 * DAY_MS

function CreatePanel({ onClose }) {
  const { isConnected } = useWallet()
  const { createPool, status, error } = usePools()
  const navigate = useNavigate()
  const [buyIn, setBuyIn] = useState('10.00')
  const [maxMembers, setMaxMembers] = useState('10')
  const [thresholdPct, setThresholdPct] = useState(THRESHOLD_CHOICES[0].pct)
  // Windows as concrete instants (tester feedback): the same slider + tap-to-type timeline as the
  // open challenge, instead of bare day counts. joinBy → the on-chain joinDeadline; resolveBy − joinBy
  // → the resolutionWindow that starts when joining actually closes. Mount-time "now" anchors the
  // future check (same anchor the timeline's sliders use); the contract re-checks at create time.
  const [mountedAtMs] = useState(() => Date.now())
  const [joinBy, setJoinBy] = useState(() => toDatetimeLocal(mountedAtMs + 7 * DAY_MS))
  const [resolveBy, setResolveBy] = useState(() => toDatetimeLocal(mountedAtMs + 10 * DAY_MS))
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  const joinMs = fromDatetimeLocal(joinBy)
  const resolveMs = fromDatetimeLocal(resolveBy)
  const deadlinesValid =
    Number.isFinite(joinMs) && Number.isFinite(resolveMs) &&
    joinMs > mountedAtMs && resolveMs > joinMs
  const membersValid = Number(maxMembers) >= 2 && Number(maxMembers) <= 1000
  const canCreate = Number(buyIn) > 0 && membersValid && deadlinesValid && isConnected && status !== 'creating'
  const chosen = THRESHOLD_CHOICES.find((c) => c.pct === thresholdPct) || THRESHOLD_CHOICES[0]

  // Milestones for the shared DeadlineTimeline control (spec 038 US1).
  const timelineMilestones = [
    {
      key: 'accept',
      label: 'Joining open until',
      tileHead: 'Join by',
      value: Number.isFinite(joinMs) ? joinMs : mountedAtMs + 7 * DAY_MS,
      min: mountedAtMs + HOUR_MS,
      max: mountedAtMs + JOIN_MAX_MS,
      editable: true,
      hint: 'Friends can join with the four words until this time. You can also close joining early once everyone is in.',
      segmentColor: 'var(--timeline-accept)',
      dotClass: 'is-accept',
      tileClass: 'is-accept',
    },
    {
      key: 'resolve',
      label: 'Must be resolved by',
      tileHead: 'Resolve by',
      value: Number.isFinite(resolveMs) ? resolveMs : (Number.isFinite(joinMs) ? joinMs : mountedAtMs + 7 * DAY_MS) + 3 * DAY_MS,
      min: (Number.isFinite(joinMs) ? joinMs : mountedAtMs + 7 * DAY_MS) + HOUR_MS,
      max: (Number.isFinite(joinMs) ? joinMs : mountedAtMs + 7 * DAY_MS) + RESOLVE_MAX_GAP_MS,
      editable: true,
      hint: 'After joining closes, the group has until about this time to approve the payout — otherwise buy-ins become refundable.',
      segmentColor: 'var(--timeline-active)',
      dotClass: 'is-resolve',
      tileClass: 'is-resolve',
    },
  ]
  const handleTimelineChange = (key, ms) => {
    const str = toDatetimeLocal(ms)
    if (key === 'accept') setJoinBy(str)
    else if (key === 'resolve') setResolveBy(str)
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    try {
      setResult(await createPool({
        buyIn,
        maxMembers,
        thresholdPct,
        joinDeadline: Math.floor(joinMs / 1000),
        resolutionWindow: Math.max(1, Math.floor((resolveMs - joinMs) / 1000)),
      }))
    } catch {
      /* surfaced via hook error */
    }
  }
  const copyPhrase = async () => {
    try {
      await navigator.clipboard?.writeText(result.phrase)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* no-op */
    }
  }

  // Share view (tester feedback): the same shape as the open-challenge share view — the four words in
  // a code display with an icon copy button, plus a QR deep link into the unified phrase lookup.
  if (result) {
    return (
      <div className="fm-success" data-testid="pool-created">
        <div className="fm-success-icon" aria-hidden="true">&#127881;</div>
        <h3>Group pool created</h3>
        <p className="fm-success-desc">
          Share these four words — friends type them into the app to find and join your pool. No address needed.
        </p>

        <div className="oc-code-display">
          <code className="oc-code" data-testid="pool-phrase">{result.phrase}</code>
          <button
            type="button"
            className="oc-copy-btn"
            data-testid="copy-phrase"
            onClick={copyPhrase}
            title={copied ? 'Copied' : 'Copy words'}
            aria-label={copied ? 'Copied' : 'Copy words'}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>

        <div className="oc-qr">
          <WagerQRCode value={buildTakeChallengeUrl(result.phrase)} size={180} ariaLabel="QR code to join this pool" />
          <span className="oc-qr-caption">Scan to join — opens the app with the words filled in</span>
        </div>

        <p className="fm-hint">
          Anyone you give the words to can join (after paying the buy-in), so share them with the group you mean.
        </p>

        <div className="fm-success-actions">
          <button
            type="button"
            className="fm-btn-primary fm-success-done"
            onClick={() => { onClose(); navigate(`/pools/${result.pool}`) }}
          >
            Open my pool
          </button>
          <button type="button" className="fm-btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <form className="fm-form" onSubmit={onSubmit}>
      <p className="fm-hint">
        Everyone pays the same buy-in into one pot. When it&apos;s decided, you propose the payout and the
        group approves it anonymously.
      </p>

      <div className="fm-form-group fm-form-full">
        <label htmlFor="gp-buyin">Buy-in — each member <span className="fm-required">*</span></label>
        <div className="fm-stake-input-wrapper">
          <span className="fm-stake-prefix">$</span>
          <input
            id="gp-buyin" type="number" inputMode="decimal" min="0" step="0.01"
            placeholder="10.00" className="fm-stake-usd"
            value={buyIn}
            onChange={(e) => setBuyIn(e.target.value)}
            onBlur={() => {
              const n = Number(buyIn)
              if (buyIn !== '' && Number.isFinite(n) && n > 0) setBuyIn(n.toFixed(2))
            }}
            required
          />
          <span className="fm-stake-suffix">USDC</span>
        </div>
        <span className="fm-hint">Enter the amount in USD — every member pays this much in USDC to join.</span>
      </div>

      <div className="fm-form-group fm-form-full">
        <label htmlFor="gp-max">Maximum members <span className="fm-required">*</span></label>
        <input
          id="gp-max" type="number" min="2" max="1000"
          value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} required
        />
        <span className="fm-hint">Joining closes automatically once the pool fills.</span>
      </div>

      <div className="fm-form-group fm-form-full">
        <span className="fm-label" id="gp-threshold-label">Who must approve the payout? <span className="fm-required">*</span></span>
        <div className="fm-resolution-tabs" role="radiogroup" aria-labelledby="gp-threshold-label">
          {THRESHOLD_CHOICES.map((c) => (
            <button
              key={c.pct}
              type="button"
              role="radio"
              aria-checked={thresholdPct === c.pct}
              className={`fm-resolution-tab ${thresholdPct === c.pct ? 'active' : ''}`}
              onClick={() => setThresholdPct(c.pct)}
            >
              <span className="fm-resolution-tab-label">{c.label}</span>
            </button>
          ))}
        </div>
        <span className="fm-hint">
          {chosen.detail} If the group never agrees, everyone can take their buy-in back after the resolve time.
        </span>
      </div>

      {/* Windows (tester feedback): the shared deadline timeline — drag a dot to pick each
          time, or tap a tile to open the exact date & time modal. */}
      <DeadlineTimeline
        milestones={timelineMilestones}
        onChange={handleTimelineChange}
        disabled={status === 'creating'}
        idPrefix="gp"
        summary={deadlinesValid
          ? `Open ${formatTimelineSpan(new Date(mountedAtMs), new Date(joinMs))} for friends to join · ` +
            `then up to ${formatTimelineSpan(new Date(joinMs), new Date(resolveMs))} to settle`
          : null}
      />
      {!deadlinesValid && (joinBy || resolveBy) && (
        <p className="fm-hint oc-deadline-warn" role="alert">
          Pick a join time in the future and a resolve time after it.
        </p>
      )}

      {error && <div className="fm-error-banner" role="alert">{error}</div>}

      <div className="fm-success-actions">
        <button type="submit" className="fm-btn-primary" disabled={!canCreate}>
          {!isConnected ? 'Connect wallet to create' : status === 'creating' ? 'Creating…' : 'Create pool'}
        </button>
      </div>
    </form>
  )
}

// Joining a pool moved to the unified phrase lookup (spec 037, US1):
// see components/fairwins/JoinPoolPanel.jsx and UnifiedLookupModal.jsx.
