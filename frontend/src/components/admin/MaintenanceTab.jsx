import { useState } from 'react'
import { ethers } from 'ethers'
import { getContractAddressForChain } from '../../config/contracts'

/**
 * MaintenanceTab — permissionless housekeeping calls on the wager registry
 * (they live on the intents facet, reached through the proxy).
 *
 * Anyone on-chain may call these; surfacing them here gives operators a
 * one-click way to demonstrate active platform stewardship: sweeping expired
 * open wagers (refunds creators, frees membership slots) and nudging
 * oracle-resolvable wagers to settlement.
 */
const MAINTENANCE_ABI = [
  'function batchExpireOpen(uint256[] wagerIds)',
  'function autoResolveFromPolymarket(uint256 wagerId)',
  'function autoResolveFromOracle(uint256 wagerId)',
]

function parseIdList(text) {
  return text
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s))
}

function MaintenanceTab({ signer, chainId, runTx, pendingTx }) {
  const registryAddr = getContractAddressForChain('wagerRegistry', chainId)
  const [expireIds, setExpireIds] = useState('')
  const [resolveForm, setResolveForm] = useState({ id: '', source: 'polymarket' })
  const [parseError, setParseError] = useState('')

  const write = () => new ethers.Contract(registryAddr, MAINTENANCE_ABI, signer)

  const handleBatchExpire = () => {
    let ids
    try {
      ids = parseIdList(expireIds)
      setParseError('')
    } catch {
      setParseError('Wager IDs must be integers (comma or space separated)')
      return
    }
    if (ids.length === 0) return
    runTx(
      () => write().batchExpireOpen(ids),
      `Expired ${ids.length} open wager${ids.length === 1 ? '' : 's'} — creators refunded`
    )
  }

  const handleAutoResolve = () => {
    let id
    try {
      id = BigInt(resolveForm.id.trim())
      setParseError('')
    } catch {
      setParseError('Wager ID must be an integer')
      return
    }
    const fn = resolveForm.source === 'polymarket'
      ? () => write().autoResolveFromPolymarket(id)
      : () => write().autoResolveFromOracle(id)
    runTx(fn, `Auto-resolution triggered for wager #${resolveForm.id}`)
  }

  return (
    <div className="admin-tab-content" role="tabpanel">
      <div className="admin-card">
        <h3>Expire Open Wagers</h3>
        <p>
          Sweeps Open wagers whose accept deadline has passed: refunds the creator's stake and
          releases their concurrent-market slot. The call is permissionless and skips wagers
          that are not actually expired, so a stale ID is harmless.
        </p>
        <div className="admin-form">
          <label>
            Wager IDs (comma or space separated)
            <input type="text" placeholder="e.g. 12, 15, 33" value={expireIds}
              onChange={(e) => setExpireIds(e.target.value)} />
            {parseError && <span className="hint">{parseError}</span>}
          </label>
          <button className="confirm-btn primary" onClick={handleBatchExpire}
            disabled={pendingTx || !signer || !expireIds.trim() || !registryAddr}>
            {pendingTx ? 'Sweeping...' : 'Run Expiry Sweep'}
          </button>
        </div>
      </div>

      <div className="admin-card">
        <h3>Trigger Auto-Resolution</h3>
        <p>
          Nudges an oracle-resolvable wager to settlement (Polymarket or a configured oracle
          adapter). Permissionless — the oracle outcome, not the caller, decides the winner.
        </p>
        <div className="admin-form">
          <label>
            Wager ID
            <input type="text" placeholder="e.g. 42" value={resolveForm.id}
              onChange={(e) => setResolveForm({ ...resolveForm, id: e.target.value })} />
          </label>
          <label>
            Resolution source
            <select value={resolveForm.source}
              onChange={(e) => setResolveForm({ ...resolveForm, source: e.target.value })}>
              <option value="polymarket">Polymarket</option>
              <option value="oracle">Oracle adapter (Chainlink / UMA)</option>
            </select>
          </label>
          <button className="confirm-btn primary" onClick={handleAutoResolve}
            disabled={pendingTx || !signer || !resolveForm.id.trim() || !registryAddr}>
            {pendingTx ? 'Processing...' : 'Trigger Resolution'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MaintenanceTab
