/**
 * The scope controls every operator view shares (spec 071 US4, contracts/view-scope.md).
 *
 * Promoted out of `liquidityAdminCards.jsx`, where spec 067 built them for two tabs. Spec 071
 * generalizes the same behaviour to the whole control plane, so they live here and that module
 * re-exports them — Bridge and Supply are untouched, exactly as in T014.
 *
 * The only generalization: the "not deployed" wording was hardcoded to "no router deployed",
 * which is wrong for a view driving a MembershipManager or a SanctionsGuard. It is now a prop
 * with a contract-neutral default.
 *
 * Three rules these encode, each of which was a real defect before it was a rule:
 *
 *   1. **Scope is a NETWORK the operator picks, not the wallet's network.** Reading any network
 *      works from anywhere; only WRITING needs the wallet there.
 *   2. **The scope does not follow the wallet** (FR-016). An operator mid-audit must not have
 *      their reading silently re-targeted when a wallet switches networks — see `useScopedChain`.
 *   3. **A wrong-network write is refused in WORDS, before signing** (FR-018), naming the chain
 *      to switch to. A dead button with no explanation is indistinguishable from a bug.
 */
import { networkName } from '../../lib/chains/estate'
import { writeGateReason, writeAllowed } from './scopeGate'

/**
 * The network picker plus the sentence explaining what scope means.
 *
 * `isDeployed` answers per chain; a chain with no contract is still LISTED, because hiding the
 * networks still awaiting a deployment hides the ones an operator most needs to see.
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
  notDeployedLabel = 'not deployed here',
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
                {isDeployed(net.chainId) ? '' : ` — ${notDeployedLabel}`}
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
 * connected to, and a transaction built for a different contract would go to the wrong address
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

/** The gate plus its explanation, ready to spread onto a button and a note. */
export function WriteGate({ deployed, onWalletChain, held, readable, scopeChainId, children }) {
  const reason = writeGateReason({ deployed, onWalletChain, held, readable, scopeChainId })
  const allowed = writeAllowed({ deployed, onWalletChain, held, readable })
  return (
    <>
      {children({ allowed, reason })}
      {reason && (
        <p className="card-info warning-text" role="status">
          {reason}
        </p>
      )}
    </>
  )
}
