import { useState, useEffect, useCallback, useMemo } from 'react'
import { useOpenChallengeCreate, OPEN_RESOLUTION_TYPES } from '../../hooks/useOpenChallengeCreate'
import { useChainTokens } from '../../hooks/useChainTokens'
import { ResolutionType, isOracleModelExposed } from '../../constants/wagerDefaults'
import PolymarketBrowser from './PolymarketBrowser'
import ClaimCodeResultPanel from './ClaimCodeResultPanel'
import InfoTip from '../ui/InfoTip'
import {
  deriveOracleChallengeTimeline,
} from '../../lib/openChallenge/oracleTimeline'
import './FriendMarketsModal.css'
import './OpenChallengeModal.css'
import './OracleOpenChallengeModal.css'

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

/**
 * Oracle Open Challenge modal (spec 041) — post a code-gated open challenge settled
 * automatically by a linked Polymarket market. Picker-first flow: browse/search a market,
 * pick your side, set the equal stake — the EVENT defines the timeline (accept until the
 * market closes, settle after it resolves; both capped to the contract windows). Reuses
 * the feature-024 claim-code machinery unchanged (ClaimCodeResultPanel).
 */
function OracleOpenChallengeModal({ isOpen, onClose }) {
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
      aria-labelledby="oracle-open-challenge-title"
    >
      <div className="friend-markets-modal" onClick={(e) => e.stopPropagation()}>
        <header className="fm-header">
          <div className="fm-header-content">
            <div className="fm-brand">
              <span className="fm-brand-icon" aria-hidden="true">&#128302;</span>
              <h2 id="oracle-open-challenge-title">Oracle Open Challenge</h2>
            </div>
            <p className="fm-subtitle">
              Bet head-to-head with whoever takes your code — Polymarket only settles the result
              <InfoTip label="About oracle open challenges">
                This is a peer-to-peer wager: you&apos;re betting another person, not Polymarket.
                Whoever you share the four-word code with takes the other side, and the linked
                Polymarket market&apos;s public resolution just decides who was right — the stakes
                are escrowed between the two of you. Equal stakes. The event sets the timeline.
                Creating one requires a Silver membership or above.
              </InfoTip>
            </p>
          </div>
          <button className="fm-close-btn" onClick={onClose} aria-label="Close modal">
            <CloseIcon />
          </button>
        </header>

        <div className="fm-content">
          <div className="fm-panel">
            <OracleMakerPanel onClose={onClose} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Maker — pick market → pick side → stake → create (timeline derived, not edited)
// ---------------------------------------------------------------------------
function OracleMakerPanel({ onClose }) {
  const { createOpenChallenge, busy } = useOpenChallengeCreate()
  const { capabilities } = useChainTokens()
  const polymarketAvailable =
    Boolean(capabilities?.polymarketSidebets) && isOracleModelExposed(ResolutionType.Polymarket)

  const [market, setMarket] = useState(null)
  const [side, setSide] = useState('') // '' | '0' | '1' — outcome index; 0 = YES side
  const [stake, setStake] = useState('10.00')
  // Mount-time "now" anchors the derived timeline so it doesn't drift while the form is open.
  const [nowMs] = useState(() => Date.now())
  const [ineligible, setIneligible] = useState(null) // { question, reason } for a refused pick
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)

  const timeline = useMemo(
    () => (market ? deriveOracleChallengeTimeline(market.endDate, nowMs) : null),
    [market, nowMs]
  )

  const handleSelectMarket = useCallback((m) => {
    setError(null)
    const t = deriveOracleChallengeTimeline(m?.endDate, Date.now())
    if (!t.eligible) {
      // Refuse the pick, keep the picker open, and say why (FR-003).
      setIneligible({ question: m?.question || 'That market', reason: t.reason })
      return
    }
    setIneligible(null)
    setMarket(m)
    setSide('')
  }, [])

  const clearMarket = useCallback(() => {
    setMarket(null)
    setSide('')
    setError(null)
  }, [])

  const sideName = (idx) =>
    market?.outcomes?.[Number(idx)]?.name || (String(idx) === '0' ? 'YES' : 'NO')

  const composedDescription = market && side !== ''
    ? `${market.question} — creator takes ${sideName(side)} · settled automatically by Polymarket`
    : ''

  const canCreate = Boolean(
    market && timeline?.eligible && side !== '' && Number(stake) > 0 && !busy
  )

  const handleCreate = useCallback(async (e) => {
    e?.preventDefault?.()
    if (!market || !timeline?.eligible || side === '') return
    setError(null)
    try {
      const res = await createOpenChallenge(
        {
          description: composedDescription,
          stake,
          resolutionType: OPEN_RESOLUTION_TYPES.Polymarket,
          oracleConditionId: market.conditionId,
          creatorIsYes: side === '0',
          acceptDeadline: Math.floor(timeline.acceptDeadlineMs / 1000),
          resolveDeadline: Math.floor(timeline.resolveDeadlineMs / 1000),
          // Sealed (code-keyed) market metadata so a code-holder can read the bet
          // even when live market data is unreachable (D4/FR-014).
          oracleMeta: {
            source: 'polymarket',
            conditionId: market.conditionId,
            question: market.question,
            outcomes: [sideName(0), sideName(1)],
            creatorSide: Number(side),
            endDate: market.endDate,
            slug: market.slug || null,
          },
        },
        (p) => setProgress(p)
      )
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setProgress(null)
    }
  }, [createOpenChallenge, market, timeline, side, stake, composedDescription]) // eslint-disable-line react-hooks/exhaustive-deps

  if (result) {
    return (
      <ClaimCodeResultPanel
        result={result}
        backupMeta={{ description: composedDescription, stake }}
        onDone={onClose}
      />
    )
  }

  // Locked state: consistent with the existing oracle flow's gating (FR-004) —
  // the section explains itself instead of silently disappearing.
  if (!polymarketAvailable) {
    return (
      <div className="fm-form">
        <div className="oc-notice oc-notice--warn" role="alert">
          Polymarket settlement isn&apos;t available on this network. Switch to a
          Polymarket-enabled network to post an oracle open challenge, or use a
          regular open challenge instead.
        </div>
        <div className="fm-success-actions">
          <button type="button" className="fm-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <form className="fm-form" onSubmit={handleCreate}>
      <div className="fm-form-group fm-form-full">
        <span className="fm-label-row">
          <label htmlFor="ooc-market-picker">
            Linked Polymarket market <span className="fm-required">*</span>
          </label>
          <InfoTip label="About: Linked Polymarket market">
            Browse popular markets by category or search for an event. The challenge settles
            automatically from that market&apos;s public resolution — you just pick a side and
            share the code.
          </InfoTip>
        </span>

        {ineligible && (
          <div className="oc-notice oc-notice--warn ooc-ineligible" role="alert">
            <strong>{ineligible.question}</strong> can&apos;t back an open challenge: {ineligible.reason}
          </div>
        )}

        {market ? (
          <div className="fm-polymarket-selected">
            <div className="fm-polymarket-selected-body">
              <strong>{market.question}</strong>
              <div className="fm-polymarket-meta">
                {market.endDate && (
                  <span>Event ends {formatDate(market.endDate)}</span>
                )}
                {market.outcomes?.length > 0 && (
                  <span>
                    {market.outcomes
                      .map((o) => `${o.name}${o.price != null ? ` ${Math.round(o.price * 100)}¢` : ''}`)
                      .join(' · ')}
                  </span>
                )}
              </div>
              <code className="fm-polymarket-cid">{market.conditionId}</code>
              {market.slug && (
                <a
                  className="ooc-polymarket-link"
                  href={`https://polymarket.com/event/${market.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Polymarket &#8599;
                </a>
              )}
            </div>
            <button type="button" className="fm-link-btn" onClick={clearMarket} disabled={busy}>
              Change
            </button>
          </div>
        ) : (
          <div id="ooc-market-picker">
            <PolymarketBrowser
              variant="inline"
              showFilters
              limit={20}
              selectedConditionId={market?.conditionId}
              onSelectMarket={handleSelectMarket}
            />
          </div>
        )}
      </div>

      {market && (
        <>
          {/* Side picker — same convention as the 1v1 oracle flow: outcome index 0 is the
              YES side (creatorIsYes = true); the taker always holds the opposite. */}
          <div className="fm-form-group fm-form-full">
            <span className="fm-label-row">
              <label>Your side of the bet <span className="fm-required">*</span></label>
              <InfoTip label="About: Your side of the bet">
                Pick the outcome you&apos;re backing. Whoever takes your code gets the other side —
                the code is the only thing you need to share.
              </InfoTip>
            </span>
            <div className="fm-side-picker">
              {['0', '1'].map((idx) => {
                const name = sideName(idx)
                const active = side === idx
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`fm-side-btn ${active ? 'active' : ''}`}
                    onClick={() => setSide(idx)}
                    disabled={busy}
                    aria-pressed={active}
                  >
                    <span className="fm-side-btn-label">I&apos;m taking {name}</span>
                  </button>
                )
              })}
            </div>
            {side !== '' && (
              <span className="fm-hint">
                Whoever takes your code will be taking <strong>{sideName(side === '0' ? 1 : 0)}</strong>.
              </span>
            )}
          </div>

          <div className="fm-form-group fm-form-full">
            <span className="fm-label-row">
              <label htmlFor="ooc-stake">Stake — each side <span className="fm-required">*</span></label>
              <InfoTip label="About: Stake — each side">
                Enter the amount in USD. Open challenges are equal-stakes — check the market&apos;s
                current prices above to judge the bet; only USDC is supported on this network.
              </InfoTip>
            </span>
            <div className="fm-stake-input-wrapper fm-stake-row">
              <span className="fm-stake-prefix">$</span>
              <input
                id="ooc-stake" type="number" inputMode="decimal" min="0" step="0.01"
                placeholder="10.00" className="fm-stake-usd"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                onBlur={() => {
                  const n = Number(stake)
                  if (stake !== '' && Number.isFinite(n) && n > 0) setStake(n.toFixed(2))
                }}
                disabled={busy}
              />
              <select id="ooc-stake-token" aria-label="Stake Token" className="fm-token-select fm-stake-token-inline" disabled={busy} value="USDC" onChange={() => {}}>
                <option value="USDC">&#128181; USDC</option>
              </select>
            </div>
          </div>

          {/* Derived timeline — read-only by design (spec: "the event defines the timelines"). */}
          {timeline?.eligible && (
            <div className="fm-form-group fm-form-full">
              <span className="fm-label-row">
                <label>Timeline — set by the event</label>
                <InfoTip label="About: Timeline — set by the event">
                  You don&apos;t pick dates here: the challenge stays takeable until the market
                  closes (capped at 30 days), and it settles once Polymarket resolves the market.
                </InfoTip>
              </span>
              <span className="fm-hint ooc-timeline-provenance">
                {timeline.acceptCapped
                  ? 'This event ends more than 30 days out, so the challenge closes for takers after the 30-day maximum — settlement still follows the event.'
                  : 'From the linked event: takeable until the market closes, settled after Polymarket resolves it.'}
              </span>
            </div>
          )}
        </>
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

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' })
  } catch {
    return String(iso)
  }
}

export default OracleOpenChallengeModal
