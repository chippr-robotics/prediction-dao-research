import { useState, useCallback, useContext } from 'react'
import { useOpenChallengeAccept } from '../../hooks/useOpenChallengeAccept'
import { usePolymarketMarket } from '../../hooks/usePolymarketMarket'
import { useChainTokens } from '../../hooks/useChainTokens'
import { ResolutionType } from '../../constants/wagerDefaults'
import { UIContext } from '../../contexts/UIContext'
import { WalletContext } from '../../contexts/WalletContext'
import InfoTip from '../ui/InfoTip'
import SensitiveValue from '../common/SensitiveValue'
import './FriendMarketsModal.css'
import './OpenChallengeModal.css'
import './TakeChallengePanel.css'

/**
 * Take-a-challenge presentation (spec 037, US1) — extracted verbatim from OpenChallengeModal's
 * TakerPanel "found"/"accepted" views so the unified phrase lookup can render it after resolving a
 * phrase to an open challenge. Discovery now happens upstream in the unified lookup, which passes the
 * already-resolved `match` ({ wagerId, wager, terms, termsUnavailable, needsMembership }) and the
 * `code` (the four-word phrase) needed to authorize the accept.
 */
export default function TakeChallengePanel({ code, match, onClose, onBuyMembership, onBack }) {
  const { accept, busy } = useOpenChallengeAccept()
  // Access the notification system directly (optional) so this panel still renders in tests without a
  // UIProvider, while routing the take-success event into the app's notification toasts (spec 037).
  const ui = useContext(UIContext)
  // Wallet connection surface (spec 045). Read directly (optional) so the panel still renders in
  // tests without a WalletProvider. A passkey/EOA session is "connected" once it has an address; if
  // there's no connected account we show a Connect affordance instead of dead-ending the accept with
  // "Connect your wallet to accept." — the exact error passkey takers hit opening a shared link.
  const wallet = useContext(WalletContext)
  const connectedAddress = wallet?.address || wallet?.account || null
  const isConnected = Boolean(connectedAddress)
  const openConnectModal = wallet?.openConnectModal
  const [phase, setPhase] = useState('found')
  const [progress, setProgress] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [error, setError] = useState(null)
  const found = match

  // Oracle-settled open challenges (spec 041): the on-chain fields are authoritative for
  // WHAT is bet (market linkage + side); live Gamma data is a disclosure layer on top.
  const wager = found?.wager
  const isPolymarket = Number(wager?.resolutionType ?? 0) === ResolutionType.Polymarket
  const conditionId = wager?.polymarketConditionId
  const live = usePolymarketMarket(conditionId, { enabled: isPolymarket })
  // Accept gate (D8/FR-015): block only on a positively-known public outcome; a merely
  // closed market warns but stays acceptable; unreachable live data never gates.
  const resolvedOutcomeName = isPolymarket ? publiclyResolvedOutcome(live.market) : null
  const blockedResolved = Boolean(resolvedOutcomeName)

  const handleAccept = useCallback(async () => {
    setError(null)
    try {
      const { txHash: hash } = await accept(code, found.wagerId, (p) => setProgress(p))
      setTxHash(hash)
      setPhase('accepted')
      ui?.showNotification?.('You’ve taken the challenge — your stake is escrowed.', 'success', 6000)
    } catch (err) {
      setError(err.message)
    } finally {
      setProgress(null)
    }
  }, [accept, code, found, ui])

  if (!found) return null

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

  return (
    <div className="fm-form">
      <div className="fm-form-group fm-form-full">
        <label>The challenge</label>
        {found.termsUnavailable ? (
          <div className="oc-notice oc-notice--warn" role="alert">
            Terms unavailable — the encrypted details couldn&apos;t be retrieved. You can still accept; the
            on-chain wager is unaffected. Keep your code to read the terms later.
          </div>
        ) : (
          <ChallengeText terms={found.terms} />
        )}
      </div>

      {/* What you'd be agreeing to — one view, no navigation (spec 041 FR-012). */}
      <ChallengeStake wager={found.wager} />
      {isPolymarket && (
        <OracleBetSummary
          wager={found.wager}
          terms={found.terms}
          live={live}
          resolvedOutcomeName={resolvedOutcomeName}
        />
      )}

      <ChallengeDeadlines wager={found.wager} />

      {found.needsMembership ? (
        <>
          <div className="oc-notice oc-notice--warn">
            An active membership is required to take a challenge. Any tier works — creating open challenges
            needs Silver, but taking one does not.
          </div>
          <div className="fm-success-actions">
            <button type="button" className="fm-btn-primary" onClick={() => onBuyMembership?.()}>Get a membership to take this</button>
            {onBack && <button type="button" className="fm-btn-secondary" onClick={onBack}>Back</button>}
          </div>
        </>
      ) : (
        <>
          <ol className="oc-steps">
            <li className={stepClass(progress?.step, 'approve')}>Approve the stake token (lets the wager contract escrow your stake)</li>
            <li className={stepClass(progress?.step, 'sign')}>Sign to authorize acceptance with your code</li>
            <li className={stepClass(progress?.step, 'accept')}>Confirm acceptance — your stake is escrowed</li>
          </ol>
          {progress && <p className="fm-hint" role="status">{progress.message}</p>}
          {error && <div className="fm-error-banner" role="alert">{error}</div>}
          {blockedResolved && (
            <div className="oc-notice oc-notice--warn" role="alert">
              This market has already resolved{resolvedOutcomeName ? <> (<strong>{resolvedOutcomeName}</strong>)</> : null} —
              the outcome is public, so this challenge can no longer be taken fairly. It will expire and the
              creator&apos;s stake will be refundable.
            </div>
          )}
          <div className="fm-success-actions">
            <span className="fm-label-row">
              {isConnected ? (
                <button type="button" className="fm-btn-primary" onClick={handleAccept} disabled={busy || blockedResolved}>{busy ? (progress ? `${stepLabel(progress.step)}…` : 'Locking in…') : 'Lock In!'}</button>
              ) : (
                <button type="button" className="fm-btn-primary" onClick={() => openConnectModal?.()} disabled={blockedResolved}>Connect wallet to Lock In</button>
              )}
              <InfoTip label="About accepting">
                Accepting binds you as the opponent and escrows your equal stake. Save your code to re-read the terms later.
              </InfoTip>
            </span>
            {onBack && <button type="button" className="fm-btn-secondary" onClick={onBack} disabled={busy}>Back</button>}
          </div>
        </>
      )}
    </div>
  )
}

// Full step order the accept flow walks through (the visible list omits the quick "check" read).
const ACCEPT_STEP_ORDER = ['check', 'approve', 'sign', 'accept']
const STEP_LABELS = { check: 'Checking', approve: 'Approving', sign: 'Signing', accept: 'Confirming' }

/** Mark a list step done, active, or pending — for the take-flow checklist. */
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

/** Stake + payout line for every open challenge (spec 041 FR-012) — open challenges are
 *  equal-stakes in the chain stablecoin, so the on-chain opponentStake is the taker's stake. */
function ChallengeStake({ wager }) {
  const { stable, stableDecimals } = useChainTokens()
  const amount = formatStake(wager?.opponentStake, stableDecimals)
  const payout = formatStake(
    wager?.opponentStake != null && wager?.creatorStake != null
      ? BigInt(wager.opponentStake) + BigInt(wager.creatorStake)
      : null,
    stableDecimals
  )
  if (!amount) return null
  return (
    <div className="tc-stake" aria-label="Stake and payout">
      <span className="tc-stake-line">
        You stake <SensitiveValue as="strong">{amount} {stable}</SensitiveValue> — winner takes <SensitiveValue as="strong">{payout} {stable}</SensitiveValue>
      </span>
    </div>
  )
}

/**
 * Oracle bet summary (spec 041, US2): the market question, the side the TAKER gets,
 * an unmistakable "settled by Polymarket" badge, and live market context. On-chain
 * `creatorIsYes`/`polymarketConditionId` are authoritative; the sealed terms' oracle
 * block is display metadata and is cross-checked before being trusted (honest state).
 */
function OracleBetSummary({ wager, terms, live, resolvedOutcomeName }) {
  const conditionId = wager?.polymarketConditionId
  const creatorIsYes = Boolean(wager?.creatorIsYes)
  const { market, isLoading, error } = live
  // Mount-anchored clock: render must stay pure, and "has the event passed" doesn't
  // need to tick while the panel is open.
  const [nowMs] = useState(() => Date.now())

  const sealed = terms && typeof terms === 'object' ? terms.oracle : null
  const integrity = !sealed
    ? 'unverifiable'
    : hexEquals(sealed.conditionId, conditionId) ? 'ok' : 'mismatch'
  const trusted = integrity === 'ok' ? sealed : null

  // Best-available display data: verified sealed metadata first (works offline), then live.
  const question = trusted?.question || market?.question || null
  const labels = normalizeOutcomeLabels(trusted?.outcomes) || normalizeOutcomeLabels(market?.outcomes?.map((o) => o.name)) || ['YES', 'NO']
  const takerLabel = labels[creatorIsYes ? 1 : 0]
  const creatorLabel = labels[creatorIsYes ? 0 : 1]
  const slug = trusted?.slug || market?.slug || null
  const marketClosed = Boolean(market && (market.closed || (market.endDate && Date.parse(market.endDate) < nowMs)))

  return (
    <div className="tc-oracle" aria-label="How this bet settles">
      {/* Settlement source — always shown, live or degraded (FR-013/SC-005). */}
      <div className="tc-oracle-badge">
        <span className="tc-oracle-badge-icon" aria-hidden="true">&#128302;</span>
        <span className="tc-oracle-badge-text">Settled automatically by <strong>Polymarket</strong></span>
      </div>
      <p className="tc-oracle-explain">
        The winner is decided by the linked public Polymarket market&apos;s resolution — neither you,
        the creator, nor anyone else in the app judges the outcome.
      </p>

      <div className="tc-oracle-question">
        {question ? (
          <strong>{question}</strong>
        ) : (
          <span className="tc-oracle-question-fallback">
            Market details unavailable — linked market <code>{shortenHex(conditionId)}</code>
          </span>
        )}
        {slug && (
          <a
            className="tc-oracle-link"
            href={`https://polymarket.com/market/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Polymarket
          </a>
        )}
      </div>

      <div className="tc-oracle-sides">
        <span>You take: <strong>{takerLabel}</strong></span>
        <span className="tc-oracle-sides-sep" aria-hidden="true">·</span>
        <span>Creator holds: {creatorLabel}</span>
      </div>

      {integrity === 'mismatch' && (
        <div className="oc-notice oc-notice--warn" role="alert">
          The stored description doesn&apos;t match the market this challenge is actually linked to
          on-chain. Trust the on-chain linkage shown here — not the description text.
        </div>
      )}

      {/* Live market context (FR-014): odds/status when reachable, disclosed degradation when not. */}
      <div className="tc-oracle-live" role="status">
        {isLoading ? (
          <span className="tc-oracle-live-loading">Checking the live market…</span>
        ) : error ? (
          <span className="tc-oracle-live-degraded">
            Live market info unavailable right now — the bet terms above are binding.
          </span>
        ) : market ? (
          <>
            <span className="tc-oracle-live-prices">
              Now: {market.outcomes
                .map((o) => `${o.name}${o.price != null ? ` ${Math.round(o.price * 100)}¢` : ''}`)
                .join(' · ')}
            </span>
            <span className={`tc-oracle-live-status ${marketClosed ? 'is-closed' : 'is-open'}`}>
              {marketClosed ? 'Market closed' : 'Market open'}
            </span>
          </>
        ) : null}
      </div>

      {marketClosed && !resolvedOutcomeName && (
        <div className="oc-notice oc-notice--warn" role="alert">
          This market has already closed. The outcome may be decided soon — make sure you still
          want to take this bet.
        </div>
      )}
    </div>
  )
}

/** A live market whose outcome is already public: closed with a near-certain price.
 *  Returns that outcome's name, or null. Deliberately conservative — only a positively
 *  known result blocks acceptance (D8); stale/ambiguous data merely warns. */
function publiclyResolvedOutcome(market) {
  if (!market || market.closed !== true) return null
  const winner = (market.outcomes || []).find((o) => o.price != null && o.price >= 0.999)
  return winner ? winner.name : null
}

function normalizeOutcomeLabels(list) {
  if (!Array.isArray(list) || list.length < 2) return null
  const a = String(list[0] ?? '').trim()
  const b = String(list[1] ?? '').trim()
  return a && b ? [a, b] : null
}

function hexEquals(a, b) {
  if (!a || !b) return false
  return String(a).toLowerCase() === String(b).toLowerCase()
}

function shortenHex(h) {
  const s = String(h || '')
  return s.length > 14 ? `${s.slice(0, 10)}…${s.slice(-4)}` : s
}

function formatStake(value, decimals = 6) {
  if (value == null) return ''
  let n
  try {
    n = Number(BigInt(value)) / 10 ** decimals
  } catch {
    return ''
  }
  if (!Number.isFinite(n) || n <= 0) return ''
  return n.toLocaleString([], { maximumFractionDigits: 2 })
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

/**
 * Render the challenge as readable prose, never raw JSON. The sealed terms are a small object
 * ({ description, createdAt, oracle? }); the taker only cares about the human description. Anything
 * that isn't a plain description (legacy shapes, missing text) degrades to a neutral note rather than
 * dumping the object — the on-chain bet summary below already carries the authoritative details.
 */
function ChallengeText({ terms }) {
  const text = challengeText(terms)
  if (!text) {
    return <p className="tc-terms-text tc-terms-text--empty">No description was included with this challenge.</p>
  }
  return <p className="tc-terms-text">{text}</p>
}

function challengeText(terms) {
  if (terms == null) return ''
  if (typeof terms === 'string') return terms.trim()
  if (typeof terms === 'object') {
    const desc = terms.description ?? terms.text ?? terms.title
    if (typeof desc === 'string') return desc.trim()
  }
  return ''
}

function shorten(hash) {
  return hash && hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash
}
