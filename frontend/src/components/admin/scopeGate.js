/**
 * Scope + write-gate logic for operator views (spec 071 US4). Non-component exports live here so
 * `scopeControls.jsx` can export components only (react-refresh).
 *
 * The rules these encode were each a real defect before they were a rule — see scopeControls.jsx.
 */
import { useState, useCallback } from 'react'
import { networkName } from '../../lib/chains/estate'

/**
 * The chain an operator view is scoped to.
 *
 * Defaults to the wallet's chain when that chain is in the view's roster, otherwise the first
 * entry — the behaviour BridgeTab already had. Crucially it is seeded ONCE and never re-derived
 * from `walletChainId` afterwards, which is what FR-016 requires: a wallet network change must
 * change only whether writes are available, never what the operator is looking at.
 */
export function useScopedChain(networks, walletChainId) {
  const [scopeChainId, setScopeChainId] = useState(
    () =>
      (networks.some((n) => Number(n.chainId) === Number(walletChainId))
        ? Number(walletChainId)
        : networks[0]?.chainId) ?? null,
  )
  // Exposed as a stable callback so a view can offer "jump to my wallet's network" explicitly.
  const scopeToWallet = useCallback(() => setScopeChainId(Number(walletChainId)), [walletChainId])
  return { scopeChainId, setScopeChainId, scopeToWallet }
}

/**
 * Why a specific write control is unavailable, in words — or null when it is available.
 *
 * The four cases are deliberately distinct, because they call for four different actions:
 *
 *   not deployed  → nothing to act on here. Pick another network.
 *   wrong network → switch the wallet. The control WILL work.
 *   role not held → you cannot do this here, and switching will not help.
 *   unconfirmed   → we could not ask. The control stays OFFERED and says so, because the
 *                   contract is the real gate — withdrawing a killswitch because an RPC timed
 *                   out tells an operator who holds it that there isn't one (spec 067 FR-044).
 */
export function writeGateReason({ deployed, onWalletChain, held, readable, scopeChainId }) {
  if (deployed === false) return `Not deployed on ${networkName(scopeChainId)} — nothing to change here.`
  if (!onWalletChain) return `Switch your wallet to ${networkName(scopeChainId)} to make this change.`
  if (readable === false) return `Authority could not be confirmed on ${networkName(scopeChainId)} — the contract will still refuse anything you do not hold.`
  if (held === false) return `You do not hold this role on ${networkName(scopeChainId)}.`
  return null
}

/** Whether the control should be offered at all, given the same inputs. */
export function writeAllowed({ deployed, onWalletChain, held, readable }) {
  if (deployed === false) return false
  if (!onWalletChain) return false
  // Unconfirmed authority stays permissive; only a definite "no" withholds the control.
  if (readable === false) return true
  return held !== false
}

