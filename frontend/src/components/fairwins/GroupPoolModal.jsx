import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../../hooks/useWalletManagement'
import { usePools } from '../../hooks/usePools'
import './FriendMarketsModal.css'
import '../../pages/pools.css'

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

/**
 * GroupPoolModal (spec 034) — the group-pool create/join entry flow, styled to match the other wager
 * bottom-sheets (FriendMarketsModal / OpenChallengeModal): same backdrop, fm-header, fm-content/fm-panel,
 * and fm-resolution-tabs. Replaces the standalone /pools/create and /pools/join routes so group pools
 * conform to the rest of the wager UX. Managing a created/joined pool still lives at /pools/:address.
 */
export default function GroupPoolModal({ isOpen, onClose, initialTab = 'create' }) {
  // Dashboard remounts this modal via `key` on each open, so useState(initialTab) is fresh per open.
  const [tab, setTab] = useState(initialTab)
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
            <div className="fm-resolution-tabs" role="tablist" aria-label="Group pool mode">
              <button
                type="button" role="tab" aria-selected={tab === 'create'}
                className={`fm-resolution-tab ${tab === 'create' ? 'active' : ''}`}
                onClick={() => setTab('create')}
              >
                <span className="fm-resolution-tab-label">Create a pool</span>
              </button>
            </div>

            {/* Joining a pool moved to the unified phrase lookup (spec 037): enter four words there. */}
            <CreatePanel onClose={onClose} />
          </div>
        </div>
      </div>
    </div>
  )
}

function CreatePanel({ onClose }) {
  const { isConnected } = useWallet()
  const { createPool, status, error } = usePools()
  const navigate = useNavigate()
  const [form, setForm] = useState({ buyIn: '10', maxMembers: '10', thresholdPct: '60', joinDays: '7', resolutionDays: '3' })
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const onSubmit = async (e) => {
    e.preventDefault()
    try {
      setResult(await createPool(form))
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

  if (result) {
    return (
      <div className="fm-form" data-testid="pool-created">
        <p>Share these four words so friends can find and join — no address needed:</p>
        <p className="pool-phrase" data-testid="pool-phrase">{result.phrase}</p>
        <div className="fm-actions">
          <button type="button" className="fm-submit-btn" data-testid="copy-phrase" onClick={copyPhrase}>
            {copied ? 'Copied' : 'Copy words'}
          </button>
          <button type="button" className="fm-secondary-btn" onClick={() => { onClose(); navigate(`/pools/${result.pool}`) }}>
            Open pool
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="fm-form" onSubmit={onSubmit}>
      <div className="fm-form-grid">
        <div className="fm-form-group">
          <label htmlFor="gp-buyin">Buy-in (USDC) <span className="fm-required">*</span></label>
          <input id="gp-buyin" type="number" min="0" step="0.01" value={form.buyIn} onChange={set('buyIn')} required />
        </div>
        <div className="fm-form-group">
          <label htmlFor="gp-max">Maximum members <span className="fm-required">*</span></label>
          <input id="gp-max" type="number" min="2" max="1000" value={form.maxMembers} onChange={set('maxMembers')} required />
        </div>
        <div className="fm-form-group">
          <label htmlFor="gp-threshold">Approval threshold (% of members)</label>
          <input id="gp-threshold" type="number" min="1" max="100" value={form.thresholdPct} onChange={set('thresholdPct')} required />
        </div>
        <div className="fm-form-group">
          <label htmlFor="gp-joindays">Join window (days)</label>
          <input id="gp-joindays" type="number" min="1" value={form.joinDays} onChange={set('joinDays')} required />
        </div>
        <div className="fm-form-group">
          <label htmlFor="gp-resdays">Resolution window (days)</label>
          <input id="gp-resdays" type="number" min="1" value={form.resolutionDays} onChange={set('resolutionDays')} required />
        </div>
      </div>
      {error && <p className="fm-error" role="alert">{error}</p>}
      <button type="submit" className="fm-submit-btn" disabled={!isConnected || status === 'creating'}>
        {!isConnected ? 'Connect wallet to create' : status === 'creating' ? 'Creating…' : 'Create pool'}
      </button>
    </form>
  )
}

// Joining a pool moved to the unified phrase lookup (spec 037, US1):
// see components/fairwins/JoinPoolPanel.jsx and UnifiedLookupModal.jsx.
