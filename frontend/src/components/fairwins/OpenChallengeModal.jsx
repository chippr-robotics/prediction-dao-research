import { useState, useEffect, useCallback, useMemo } from 'react'
import { isAddress } from 'ethers'
import { useOpenChallengeCreate, OPEN_RESOLUTION_TYPES } from '../../hooks/useOpenChallengeCreate'
import { useWeb3 } from '../../hooks/useWeb3'
import { useChainTokens } from '../../hooks/useChainTokens'
import { ResolutionType, isOracleModelExposed } from '../../constants/wagerDefaults'
import AddressInput from '../ui/AddressInput'
import AddressBookButton from '../ui/AddressBookButton'
import QRScanner from '../ui/QRScanner'
import AmountKeypad from '../ui/AmountKeypad'
import PolymarketBrowser from './PolymarketBrowser'
import ClaimCodeResultPanel from './ClaimCodeResultPanel'
import DeadlineTimeline from './DeadlineTimeline'
import { toDatetimeLocal, fromDatetimeLocal, formatTimelineSpan, HOUR_MS, DAY_MS } from './wagerTimeline'
import { deriveOracleChallengeTimeline } from '../../lib/openChallenge/oracleTimeline'
import PillSelect from '../ui/PillSelect'
import InfoTip from '../ui/InfoTip'
import { EitherSideIcon, ThirdPartyIcon, OracleIcon } from './resolutionIcons'
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

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

/**
 * Open-challenge modal (feature 024) — create a code-gated wager with no named opponent (Silver+).
 * Oracle settlement (spec 041, Polymarket) is consolidated in here as a third resolution path
 * (spec 052 feedback): it appears as a network-gated pill and, when chosen, swaps the sheet to a
 * market-search step. Taking a challenge moved to the unified phrase lookup (spec 037).
 */
function OpenChallengeModal({ isOpen, onClose, initialResolutionType }) {
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
              <InfoTip label="About open challenges">
                An open challenge has no named opponent — anyone you share the code with can take the other side.
                Equal stakes. Creating one requires a Silver membership or above.
              </InfoTip>
            </div>
          </div>
          <button className="fm-close-btn" onClick={onClose} aria-label="Close modal">
            <CloseIcon />
          </button>
        </header>

        <div className="fm-content">
          <div className="fm-panel">
            {/* Taking a challenge moved to the unified phrase lookup (spec 037). */}
            <MakerPanel onClose={onClose} initialResolutionType={initialResolutionType} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Maker — create an open challenge (self / arbitrator / oracle-settled)
// ---------------------------------------------------------------------------
function MakerPanel({ onClose, initialResolutionType }) {
  const { createOpenChallenge, busy } = useOpenChallengeCreate()
  const { capabilities } = useChainTokens()
  // Oracle settlement is only offered where the Polymarket CTF is reachable and
  // the model is exposed; otherwise the pill shows locked (spec 052 consolidation).
  const polymarketAvailable =
    Boolean(capabilities?.polymarketSidebets) && isOracleModelExposed(ResolutionType.Polymarket)

  const [description, setDescription] = useState('')
  // Payments-style entry (spec 052): start from the zero state ($0) so the
  // number pad drives entry. Submission stays gated until a positive amount.
  const [stake, setStake] = useState('')
  const [resolutionType, setResolutionType] = useState(() => {
    const wantOracle = Number(initialResolutionType) === OPEN_RESOLUTION_TYPES.Polymarket
    if (initialResolutionType != null && (!wantOracle || polymarketAvailable)) return String(initialResolutionType)
    return String(OPEN_RESOLUTION_TYPES.Either)
  })
  const [arbitrator, setArbitrator] = useState('')
  const [arbitratorResolved, setArbitratorResolved] = useState('')
  // Oracle path (consolidated from the former Open Oracle Challenge modal).
  const [market, setMarket] = useState(null)
  const [side, setSide] = useState('') // '' | '0' | '1' — outcome index; 0 = YES side
  const [ineligible, setIneligible] = useState(null)
  // 'form' = the amount/details view; 'market' = the Polymarket search sub-view.
  const [step, setStep] = useState(() =>
    Number(initialResolutionType) === OPEN_RESOLUTION_TYPES.Polymarket && polymarketAvailable ? 'market' : 'form'
  )
  // Deadlines (feature 024): the maker sets the accept/resolve windows for the
  // self/arbitrator paths. Stored as datetime-local strings, unix seconds on submit.
  const [acceptBy, setAcceptBy] = useState(() => toDatetimeLocal(Date.now() + 48 * HOUR_MS))
  const [resolveBy, setResolveBy] = useState(() => toDatetimeLocal(Date.now() + (48 + 24 * 7) * HOUR_MS))
  const [nowMs] = useState(() => Date.now())
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)

  const isThirdParty = Number(resolutionType) === OPEN_RESOLUTION_TYPES.ThirdParty
  const isOracle = Number(resolutionType) === OPEN_RESOLUTION_TYPES.Polymarket
  const arbitratorAddr = arbitratorResolved || arbitrator
  const arbitratorValid = !isThirdParty || isAddress(arbitratorAddr)
  const acceptMs = fromDatetimeLocal(acceptBy)
  const resolveMs = fromDatetimeLocal(resolveBy)
  const deadlinesValid =
    Number.isFinite(acceptMs) && Number.isFinite(resolveMs) &&
    acceptMs > Date.now() && resolveMs > acceptMs

  // Oracle-derived timeline + auto-composed description (the event defines both).
  const oracleTimeline = useMemo(
    () => (market ? deriveOracleChallengeTimeline(market.endDate, nowMs) : null),
    [market, nowMs]
  )
  const sideName = (idx) => market?.outcomes?.[Number(idx)]?.name || (String(idx) === '0' ? 'YES' : 'NO')
  const composedDescription = market && side !== ''
    ? `${market.question} — creator takes ${sideName(side)} · settled automatically by Polymarket`
    : ''

  const canCreate = Number(stake) > 0 && !busy && (
    isOracle
      ? Boolean(market && oracleTimeline?.eligible && side !== '')
      : (description.trim().length > 0 && arbitratorValid && deadlinesValid)
  )

  // Milestones for the shared DeadlineTimeline control (self/arbitrator paths only).
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

  const handleResolutionChange = (value) => {
    setResolutionType(value)
    // Choosing oracle settlement opens the market-search step (unless already picked).
    if (Number(value) === OPEN_RESOLUTION_TYPES.Polymarket && !market) setStep('market')
  }

  const handleSelectMarket = useCallback((m) => {
    setError(null)
    const t = deriveOracleChallengeTimeline(m?.endDate, Date.now())
    if (!t.eligible) {
      setIneligible({ question: m?.question || 'That market', reason: t.reason })
      return
    }
    setIneligible(null)
    setMarket(m)
    setSide('')
    setStep('form')
  }, [])

  const backFromSearch = useCallback(() => {
    setStep('form')
    // Backing out of the initial oracle pick (no market chosen) reverts to self-resolution.
    if (!market) setResolutionType(String(OPEN_RESOLUTION_TYPES.Either))
  }, [market])

  const handleCreate = useCallback(async (e) => {
    e?.preventDefault?.()
    setError(null)
    // Normalize the pad string (e.g. "10." → "10", "10.50" → "10.5").
    const cleanStake = Number(stake) > 0 ? String(Number(stake)) : stake
    try {
      const payload = isOracle
        ? {
            description: composedDescription,
            stake: cleanStake,
            resolutionType: OPEN_RESOLUTION_TYPES.Polymarket,
            oracleConditionId: market.conditionId,
            creatorIsYes: side === '0',
            acceptDeadline: Math.floor(oracleTimeline.acceptDeadlineMs / 1000),
            resolveDeadline: Math.floor(oracleTimeline.resolveDeadlineMs / 1000),
            // Sealed market metadata so a code-holder can read the bet even when
            // live market data is unreachable (D4/FR-014).
            oracleMeta: {
              source: 'polymarket',
              conditionId: market.conditionId,
              question: market.question,
              outcomes: [sideName(0), sideName(1)],
              creatorSide: Number(side),
              endDate: market.endDate,
              slug: market.slug || null,
            },
          }
        : {
            description: description.trim(),
            stake: cleanStake,
            resolutionType: Number(resolutionType),
            arbitrator: isThirdParty ? arbitratorAddr : undefined,
            acceptDeadline: Number.isFinite(acceptMs) ? Math.floor(acceptMs / 1000) : undefined,
            resolveDeadline: Number.isFinite(resolveMs) ? Math.floor(resolveMs / 1000) : undefined,
          }
      const res = await createOpenChallenge(payload, (p) => setProgress(p))
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setProgress(null)
    }
  }, [isOracle, composedDescription, stake, market, side, oracleTimeline, description, resolutionType, isThirdParty, arbitratorAddr, acceptMs, resolveMs, createOpenChallenge]) // eslint-disable-line react-hooks/exhaustive-deps

  if (result) {
    return (
      <ClaimCodeResultPanel
        result={result}
        backupMeta={{ description: isOracle ? composedDescription : description.trim(), stake }}
        onDone={onClose}
      />
    )
  }

  // ── Market-search sub-view (stepped) ─────────────────────────────────────
  if (step === 'market') {
    return (
      <div className="fm-form">
        <button type="button" className="fm-link-btn oc-market-back" onClick={backFromSearch} disabled={busy}>
          <BackIcon /> Back
        </button>
        <div className="fm-form-group fm-form-full">
          <span className="fm-label-row">
            <label htmlFor="oc-market-picker">Pick a market <span className="fm-required">*</span></label>
            <InfoTip label="About: Linked Polymarket market">
              The challenge settles automatically from this market&apos;s public resolution — you just
              pick a side and share the code.
            </InfoTip>
          </span>
          {ineligible && (
            <div className="oc-notice oc-notice--warn ooc-ineligible" role="alert">
              <strong>{ineligible.question}</strong> can&apos;t back an open challenge: {ineligible.reason}
            </div>
          )}
          <div id="ooc-market-picker">
            <PolymarketBrowser
              variant="inline"
              showFilters
              limit={20}
              selectedConditionId={market?.conditionId}
              onSelectMarket={handleSelectMarket}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <form className="fm-form fm-pay-form" onSubmit={handleCreate}>
      {/* Payments-style hero (spec 052): the stake amount is the centerpiece,
          entered with the on-screen number pad. Token is USDC-locked here. */}
      <div className="fm-pay-hero">
        <AmountKeypad
          value={stake}
          onChange={setStake}
          prefix="$"
          token="USDC"
          disabled={busy}
          ariaLabel="Stake amount, each side"
          id="oc-stake"
        />
      </div>

      {isOracle ? (
        // Oracle path: the picked market + your side stand in for the free memo
        // (the description is auto-composed from them).
        <>
          {market ? (
            <div className="fm-form-group fm-form-full">
              <div className="fm-polymarket-selected">
                <div className="fm-polymarket-selected-body">
                  <strong>{market.question}</strong>
                  <div className="fm-polymarket-meta">
                    {market.endDate && <span>Ends {formatDate(market.endDate)}</span>}
                    {market.outcomes?.length > 0 && (
                      <span>
                        {market.outcomes
                          .map((o) => `${o.name}${o.price != null ? ` ${Math.round(o.price * 100)}¢` : ''}`)
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                </div>
                <button type="button" className="fm-link-btn" onClick={() => setStep('market')} disabled={busy}>
                  Change
                </button>
              </div>
            </div>
          ) : (
            <div className="fm-form-group fm-form-full">
              <button type="button" className="fm-btn-secondary" onClick={() => setStep('market')} disabled={busy}>
                Choose a market
              </button>
            </div>
          )}

          {market && (
            <div className="fm-form-group fm-form-full">
              <span className="fm-label-row">
                <label>Your side of the bet <span className="fm-required">*</span></label>
                <InfoTip label="About: Your side of the bet">
                  Pick the outcome you&apos;re backing. Whoever takes your code gets the other side.
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
          )}
        </>
      ) : (
        // Wager description demoted to a Venmo/Cash-App-style memo below the amount.
        <div className="fm-form-group fm-form-full fm-pay-memo">
          <span className="fm-label-row">
            <label htmlFor="oc-desc">What&apos;s the wager? <span className="fm-required">*</span></label>
            <InfoTip label="About: What's the wager?">
              Phrase it so it&apos;s clear which side you&apos;re on; the taker takes the opposite.
            </InfoTip>
          </span>
          <input
            id="oc-desc" type="text" maxLength={200} className="fm-pay-memo-input"
            placeholder="Add a note — e.g. I'm betting NO that it rains in Denver tomorrow"
            value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy}
          />
        </div>
      )}

      {/* Remaining controls grouped as compact "details" below the hero. */}
      <div className="fm-pay-details">
        <div className="fm-form-group fm-form-full">
          <PillSelect
            label={<>How is it resolved? <span className="fm-required">*</span></>}
            info={(
              <InfoTip label="About: How is it resolved?">
                Single-party self-resolution isn&apos;t available for open challenges — the taker is unknown when you post it.
              </InfoTip>
            )}
            options={[
              { value: String(OPEN_RESOLUTION_TYPES.Either), label: 'Either side submits the outcome', icon: <EitherSideIcon /> },
              { value: String(OPEN_RESOLUTION_TYPES.ThirdParty), label: 'A named third-party arbitrator decides', icon: <ThirdPartyIcon /> },
              {
                value: String(OPEN_RESOLUTION_TYPES.Polymarket),
                label: 'An oracle settles it (Polymarket)',
                icon: <OracleIcon />,
                disabled: !polymarketAvailable,
                disabledReason: 'Requires a Polymarket-enabled network. Switch networks to settle from a market.',
              },
            ]}
            value={resolutionType}
            onChange={handleResolutionChange}
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

        {isOracle ? (
          market && oracleTimeline?.eligible && (
            <p className="fm-hint">
              Takeable until the market closes (up to 30 days) · settles when Polymarket resolves it.
            </p>
          )
        ) : (
          <>
            {/* Time constraints: the shared deadline timeline — drag a dot to pick each
                time, or tap a tile to open the exact date & time modal. */}
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
          </>
        )}
      </div>

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
// (feature 024 feedback). Isolated so the wallet-scoped hooks (chainId, address
// book) only mount for the third-party path.
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

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' })
  } catch {
    return String(iso)
  }
}

export default OpenChallengeModal
