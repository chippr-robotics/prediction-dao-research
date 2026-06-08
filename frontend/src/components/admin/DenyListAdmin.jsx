import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'

/**
 * DenyListAdmin (Spec 007 — FR-020, SC-018)
 *
 * Admin UI for the SanctionsGuard discretionary deny-list: add/remove addresses with a
 * reason (calls setDenied, gated on-chain by SANCTIONS_ADMIN_ROLE), and render the
 * add/remove audit trail from the DenyListUpdated event (actor + reason + block).
 *
 * Tab contract matches the other admin tabs: { signer, account, contracts, runTx, pendingTx }.
 * The guard address comes from the synced contracts config (FR-055) — never hardcoded.
 */

// Minimal human-readable ABI (keeps the bundle small; full ABI lives in abis/SanctionsGuard.js)
const GUARD_ABI = [
  'function setDenied(address account, bool denied, string reason)',
  'function isDenied(address account) view returns (bool)',
  'function isAllowed(address account) view returns (bool)',
  'event DenyListUpdated(address indexed account, bool denied, address indexed actor, string reason)',
]

function isAddr(s) {
  try { return ethers.isAddress((s || '').trim()) } catch { return false }
}
function shortAddr(a) {
  return a && ethers.isAddress(a) ? a.slice(0, 6) + '…' + a.slice(-4) : (a || '—')
}

function DenyListAdmin({ signer, contracts, runTx, pendingTx }) {
  const guardAddress = contracts?.sanctionsGuard
  const [address, setAddress] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState(null) // { denied, allowed } | null
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState('')

  const writer = useCallback(() => {
    if (!isAddr(guardAddress) || !signer) return null
    return new ethers.Contract(guardAddress, GUARD_ABI, signer)
  }, [guardAddress, signer])

  const loadHistory = useCallback(async () => {
    if (!isAddr(guardAddress) || !signer?.provider) return
    setLoadingHistory(true)
    setError('')
    try {
      const provider = signer.provider
      const reader = new ethers.Contract(guardAddress, GUARD_ABI, provider)
      const filter = reader.filters.DenyListUpdated()
      const latest = await provider.getBlockNumber()
      // Page in bounded ranges: a single unbounded queryFilter scans the whole chain and
      // times out / hits provider log-range limits on Polygon mainnet. CHUNK keeps each
      // eth_getLogs call safe; MAX_SPAN bounds the total scan to recent history (older
      // entries are surfaced via the truncation note rather than silently dropped).
      const CHUNK = 45_000
      const MAX_SPAN = 3_000_000
      const floor = Math.max(0, latest - MAX_SPAN)
      const events = []
      let to = latest
      while (to >= floor) {
        const from = Math.max(floor, to - CHUNK + 1)
        const batch = await reader.queryFilter(filter, from, to)
        events.push(...batch)
        if (from === floor) break
        to = from - 1
      }
      const rows = events
        .map((e) => ({
          account: e.args.account,
          denied: e.args.denied,
          actor: e.args.actor,
          reason: e.args.reason,
          block: e.blockNumber,
        }))
        .sort((a, b) => b.block - a.block)
      setHistory(rows)
      setTruncated(floor > 0)
    } catch (err) {
      setError(`Could not load audit trail: ${err.message || err}`)
    } finally {
      setLoadingHistory(false)
    }
  }, [guardAddress, signer])

  useEffect(() => { loadHistory() }, [loadHistory])

  const submit = (denied) => {
    setError('')
    if (!isAddr(address)) { setError('Enter a valid address'); return }
    if (!reason.trim()) { setError('A reason is required (recorded on-chain for the audit trail)'); return }
    const c = writer()
    if (!c) { setError('SanctionsGuard is not configured on this network'); return }
    runTx(
      () => c.setDenied(address.trim(), denied, reason.trim()),
      `Deny-list ${denied ? 'add' : 'remove'}: ${shortAddr(address)}`,
    )
  }

  const checkStatus = async () => {
    setError('')
    setStatus(null)
    if (!isAddr(address)) { setError('Enter a valid address'); return }
    if (!isAddr(guardAddress) || !signer?.provider) { setError('SanctionsGuard not configured'); return }
    try {
      const reader = new ethers.Contract(guardAddress, GUARD_ABI, signer.provider)
      const [denied, allowed] = await Promise.all([
        reader.isDenied(address.trim()),
        reader.isAllowed(address.trim()),
      ])
      setStatus({ denied, allowed })
    } catch (err) {
      setError(`Status read failed: ${err.message || err}`)
    }
  }

  if (!isAddr(guardAddress)) {
    return (
      <section aria-labelledby="denylist-heading">
        <h3 id="denylist-heading">Sanctions deny-list</h3>
        <p role="status">SanctionsGuard is not deployed/configured on this network.</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="denylist-heading">
      <h3 id="denylist-heading">Sanctions deny-list</h3>
      <p>
        Manage the discretionary on-chain deny-list. Requires <code>SANCTIONS_ADMIN_ROLE</code>.
        Guard: <span title={guardAddress}>{shortAddr(guardAddress)}</span>
      </p>

      <div className="denylist-form">
        <label htmlFor="denylist-address">Wallet address</label>
        <input
          id="denylist-address"
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="0x…"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <label htmlFor="denylist-reason">Reason (recorded on-chain)</label>
        <input
          id="denylist-reason"
          type="text"
          placeholder="e.g. OFAC SDN match / illicit-finance association"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <div className="denylist-actions">
          <button type="button" className="confirm-btn danger" onClick={() => submit(true)} disabled={pendingTx}>
            {pendingTx ? 'Processing…' : 'Add to deny-list'}
          </button>
          <button type="button" className="confirm-btn" onClick={() => submit(false)} disabled={pendingTx}>
            {pendingTx ? 'Processing…' : 'Remove from deny-list'}
          </button>
          <button type="button" className="confirm-btn" onClick={checkStatus} disabled={pendingTx}>
            Check status
          </button>
        </div>
      </div>

      {error && <p role="alert" className="denylist-error">{error}</p>}

      {status && (
        <p role="status">
          {shortAddr(address)} — denied: <strong>{String(status.denied)}</strong>, allowed (guard verdict):{' '}
          <strong>{String(status.allowed)}</strong>
        </p>
      )}

      <h4 id="denylist-audit-heading">Audit trail</h4>
      <button type="button" className="confirm-btn" onClick={loadHistory} disabled={loadingHistory}>
        {loadingHistory ? 'Loading…' : 'Refresh'}
      </button>
      {truncated && (
        <p role="note" className="denylist-note">
          Showing the most recent history only (older entries beyond the scanned block window
          are not loaded). Query the chain/subgraph directly for the full audit trail.
        </p>
      )}
      {history.length === 0 && !loadingHistory ? (
        <p role="status">No deny-list changes recorded.</p>
      ) : (
        <table aria-labelledby="denylist-audit-heading">
          <caption className="sr-only">Deny-list change history (newest first)</caption>
          <thead>
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Action</th>
              <th scope="col">Actor</th>
              <th scope="col">Reason</th>
              <th scope="col">Block</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={`${h.account}-${h.block}-${i}`}>
                <td title={h.account}>{shortAddr(h.account)}</td>
                <td>{h.denied ? 'Added' : 'Removed'}</td>
                <td title={h.actor}>{shortAddr(h.actor)}</td>
                <td>{h.reason}</td>
                <td>{h.block}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default DenyListAdmin
