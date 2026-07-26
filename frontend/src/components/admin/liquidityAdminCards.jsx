/**
 * The four cards both spec-067 control tabs render — the Bridge tab and the Supply tab (US4).
 *
 * Split from `liquidityAdminCommon.js` (the pure helpers) only because a module that exports
 * components must export nothing else for React Fast Refresh to work. The reason these live in
 * ONE place, rather than being written twice, is unchanged and is about honesty rather than
 * tidiness: each card encodes a rule the two tabs must never state differently.
 *
 *   - `NetworkScopeCard` — scope is a NETWORK, not the connected wallet. Control state is
 *     per-network (FR-050) and there are five of them; reads span every capable network from its
 *     own RPC, and only writes need the wallet there. An operator must never read "nothing is
 *     configured" out of being connected somewhere else.
 *   - `WriteScopeNotice` — when a control is inert, this says which network to switch to. A dead
 *     button with no explanation is the failure this replaces.
 *   - `FeeRateCard` — the fee is READ-ONLY on both tabs (spec 060: one source of truth, edited by
 *     FEE_ADMIN in the Fees tab). It distinguishes "no FeeRouter here" (honestly fee-free, member
 *     path works) from "could not be read" (the fee-bearing member path is BLOCKED) — opposite
 *     meanings that must never be collapsed into a 0 (FR-048/FR-051).
 *   - `HistoryCard` — decoded on-chain events, and an explicit note that some events carry no
 *     before-value rather than back-filling a number nobody emitted (FR-046).
 */
import { bpsToPercent } from '../../lib/fees/feeQuote'
import { networkName, shortAddr } from './liquidityAdminCommon'

/* ------------------------------------------------------------------------------------------
 * Presentational pieces
 * ---------------------------------------------------------------------------------------- */

/**
 * The network scope selector — the control that makes these tabs per-network rather than
 * per-wallet-connection.
 *
 * It lists every capable network and marks which of them actually carry a deployed router, so
 * "nothing configured here" and "nothing deployed here" are never confusable.
 */
export function NetworkScopeCard({
  title,
  description,
  networks,
  scopeChainId,
  onScopeChange,
  isDeployed,
  walletChainId,
  onRefresh,
  lastReadAt,
  children,
}) {
  const deployedCount = networks.filter((n) => isDeployed(n.chainId)).length
  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h3>{title}</h3>
        <button type="button" className="refresh-btn" onClick={onRefresh} aria-label={`Refresh ${title}`}>
          ↻
        </button>
      </div>
      <p className="card-info">{description}</p>
      <div className="admin-form">
        <label>
          Network
          <select
            value={String(scopeChainId)}
            onChange={(e) => onScopeChange(Number(e.target.value))}
          >
            {networks.map((net) => (
              <option key={net.chainId} value={String(net.chainId)}>
                {net.name}
                {isDeployed(net.chainId) ? '' : ' — no router deployed'}
                {Number(net.chainId) === Number(walletChainId) ? ' (wallet is here)' : ''}
              </option>
            ))}
          </select>
          <span className="hint">
            Control state is per network. Reading any network works from anywhere; changing one
            needs your wallet on it. Deployed on {deployedCount} of {networks.length} networks.
          </span>
        </label>
      </div>
      {lastReadAt && (
        <p className="card-info">
          Everything below is as of {lastReadAt.toLocaleTimeString()} — the last time this network was read.
        </p>
      )}
      {children}
    </div>
  )
}

/**
 * Says plainly why the write controls are inert, when they are.
 *
 * Reading another network is fine; signing for it is not — the wallet signs on the chain it is
 * connected to, and a transaction built for a different router would go to the wrong contract
 * (or nowhere). Naming the required network is the difference between a dead button and an
 * instruction.
 */
export function WriteScopeNotice({ scopeChainId, walletChainId, signer, canWrite }) {
  if (!canWrite) return null
  if (!signer) {
    return (
      <p className="card-info warning-text">
        Connect your wallet to make changes here. Everything below is readable without one.
      </p>
    )
  }
  if (Number(scopeChainId) !== Number(walletChainId)) {
    return (
      <p className="card-info warning-text">
        You are reading {networkName(scopeChainId)} while your wallet is on{' '}
        {networkName(walletChainId)}. Changes here are signed on {networkName(scopeChainId)}, so
        switch your wallet to it before making one. Reading is unaffected.
      </p>
    )
  }
  return null
}

/**
 * The read-only platform-fee card (FR-048/FR-051).
 *
 * Four states, each said differently because each means something different to members:
 *   - a live rate            → show it, its service cap, and the router's own hard ceiling
 *   - no FeeRouter deployed  → honestly fee-free; the member path works exactly as before
 *   - FeeRouter unreadable   → the fee-bearing member path is BLOCKED (never assume a lower
 *                              rate), and this tab's other controls still work
 *   - still loading          → "…", never 0
 */
export function FeeRateCard({ serviceLabel, serviceId, quote, routerMaxFeeBps, onOpenFees, extraNote }) {
  const rateLine = () => {
    if (quote === undefined) return '…'
    if (quote?.failed) {
      return (
        <span className="status-value paused">
          could not be read — members cannot start a fee-bearing {serviceLabel} until it can be
        </span>
      )
    }
    if (!quote?.available) return 'no fee (no FeeRouter service registered on this network)'
    return `${quote.bps} bps (${bpsToPercent(quote.bps)}) — service cap ${quote.capBps} bps`
  }

  return (
    <div className="admin-card">
      <h3>Platform fee</h3>
      <div className="status-details">
        <div className="status-row">
          <span className="status-label">Live rate ({serviceId})</span>
          <span className="status-value">{rateLine()}</span>
        </div>
        {quote?.routerAddress && (
          <div className="status-row">
            <span className="status-label">Quoted from</span>
            <span className="status-value">
              {shortAddr(quote.routerAddress)} — the FeeRouter this router holds right now
            </span>
          </div>
        )}
        <div className="status-row">
          <span className="status-label">Router hard ceiling</span>
          <span className="status-value">
            {routerMaxFeeBps == null ? '…' : `${routerMaxFeeBps} bps — enforced by the router itself, whatever the FeeRouter reports`}
          </span>
        </div>
      </div>
      <p className="card-info">
        The rate is <strong>read-only here</strong>. Platform fees have one source of truth — the
        FeeRouter — and are edited by a Fee Administrator{' '}
        {onOpenFees ? (
          <button type="button" className="link-button" onClick={onOpenFees}>
            in the Fees tab
          </button>
        ) : (
          'in the Fees tab'
        )}
        . A rate of 0 means members see no fee line at all.
      </p>
      {/*
        The figure above is read from the FeeRouter the ROUTER holds. Member surfaces quote the one in
        the app CONFIG. Normally the same address; when they differ, members are being quoted by a
        contract that is not the one charging them, and the member path will refuse rather than
        overcharge (the router rejects a live rate above the ceiling the member signed). That is a
        deployment step left half-done, and it is invisible from every other screen — so it is stated
        here rather than left for someone to infer from two addresses in different cards.
      */}
      {quote?.configMismatch && (
        <p className="card-info error" role="alert">
          <strong>Members are being quoted a different FeeRouter than this router uses.</strong> This
          router charges through {shortAddr(quote.routerAddress)}; the app is built against{' '}
          {shortAddr(quote.configuredRouterAddress)}, so that is the rate members are shown and
          consent to. Until the two match, fee-bearing {serviceLabel}s can be refused on-chain even
          though this card and the member’s screen each look correct. Fix by updating{' '}
          <code>deployments/</code>, re-running <code>npm run sync:frontend-contracts</code> and
          redeploying the app — or by pointing this router back at the configured FeeRouter.
        </p>
      )}
      {extraNote && <p className="card-info">{extraNote}</p>}
    </div>
  )
}

/**
 * Decoded on-chain change history (FR-046).
 *
 * `before` is blank for the events whose contract signature does not carry the old value. The
 * footnote says so rather than letting a "—" read as "it was empty".
 */
export function HistoryCard({ title, history, explorerUrl, note }) {
  return (
    <div className="admin-card">
      <h3>{title}</h3>
      {history.entries == null ? (
        <p className="card-info">Loading history…</p>
      ) : history.entries.length === 0 ? (
        <p className="card-info">
          {history.error
            ? 'This RPC bounds event lookups, so the recent history could not be read here — view the full history on the block explorer.'
            : 'No control actions recorded in the recent lookback window.'}
        </p>
      ) : (
        <table className="admin-table" aria-label={title}>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Action</th>
              <th scope="col">Target</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
              <th scope="col">By</th>
            </tr>
          </thead>
          <tbody>
            {history.entries.map((h) => (
              <tr key={h.key}>
                <td>{h.at ? h.at.toLocaleString() : '—'}</td>
                <td>{h.action}</td>
                <td>{h.target}</td>
                <td>{h.before}</td>
                <td>{h.after}</td>
                <td>{h.actor ? <code title={h.actor}>{shortAddr(h.actor)}</code> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="card-info">
        Every control action is an on-chain event (what, who, when). Some events record only the
        new value — those show “—” before rather than a number nobody emitted. Fee-rate changes
        are in the Fees tab’s own history.{' '}
        {explorerUrl && (
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
            Full history on the block explorer ↗
          </a>
        )}
      </p>
      {note && <p className="card-info">{note}</p>}
    </div>
  )
}
