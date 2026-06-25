/**
 * WatchedTokensPanel (Spec 034) — the "My Tokens" assets view.
 *
 * Membership-gated (FR-023: any active paid tier). A connected non-member sees an
 * honest gated state with a purchase CTA; a member sees their network-scoped
 * watchlist with live balances and can add (registry/custom) or remove tokens.
 * Network scoping is handled by useTokenWatchlist (entries filtered to the active
 * chain) — switching networks instantly re-scopes the list (FR-008).
 */

import { useState } from 'react'
import { useRoleDetails } from '../../hooks/useRoleDetails'
import { useModal } from '../../hooks/useUI'
import { useWallet } from '../../hooks/useWalletManagement'
import { useTokenWatchlist } from '../../hooks/useTokenWatchlist'
import { useTokenBalances, balanceKey } from '../../hooks/useTokenBalances'
import PremiumPurchaseModal from '../ui/PremiumPurchaseModal'
import WatchedTokenRow from './WatchedTokenRow'
import AddTokenDialog from './AddTokenDialog'

export default function WatchedTokensPanel() {
  const { address } = useWallet()
  const { getRoleDetails, loading } = useRoleDetails()
  const { showModal, hideModal } = useModal()
  const { chainId, entries, addToken, removeToken, isWatched } = useTokenWatchlist()
  const { balances } = useTokenBalances(entries)
  const [adding, setAdding] = useState(false)

  if (!address) {
    return (
      <div className="tm-notice" role="status">
        Connect a wallet to view your token watchlist.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="tm-notice" role="status">
        Checking your membership…
      </div>
    )
  }

  const membership = getRoleDetails('WAGER_PARTICIPANT')
  const allowed = Boolean(membership) && membership.isActive && membership.tier > 0
  if (!allowed) {
    return (
      <div className="tm-feature-disabled" role="status">
        <p>
          An active membership is required to view and manage your token watchlist. Any tier
          works.
        </p>
        <button
          type="button"
          className="tm-btn-primary"
          onClick={() => showModal(<PremiumPurchaseModal onClose={hideModal} />, { dismissable: true })}
        >
          Get a membership
        </button>
      </div>
    )
  }

  // Show tokens with a positive balance first, then most-recently added.
  const sorted = [...entries].sort((a, b) => {
    const ba = balances[balanceKey(a.chainId, a.address)]
    const bb = balances[balanceKey(b.chainId, b.address)]
    const aPos = ba?.status === 'ok' && Number(ba.formatted) > 0
    const bPos = bb?.status === 'ok' && Number(bb.formatted) > 0
    if (aPos !== bPos) return aPos ? -1 : 1
    return (b.addedAt || 0) - (a.addedAt || 0)
  })

  return (
    <div className="tm-watchlist">
      <div className="tm-watch-header">
        <span className="tm-stat-label">Tokens you’re watching on this network</span>
        <button type="button" className="tm-btn-primary" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Close' : 'Add token'}
        </button>
      </div>

      {adding && (
        <AddTokenDialog
          chainId={chainId}
          isWatched={isWatched}
          onAdd={(entry) => addToken(entry)}
          onClose={() => setAdding(false)}
        />
      )}

      {entries.length === 0 ? (
        <p className="tm-empty">
          You aren’t watching any tokens on this network yet. Add one to see your balance.
        </p>
      ) : (
        <div className="tm-table tm-watch-table">
          {sorted.map((entry) => (
            <WatchedTokenRow
              key={`${entry.chainId}:${entry.address}`}
              entry={entry}
              balance={balances[balanceKey(entry.chainId, entry.address)]}
              onRemove={removeToken}
            />
          ))}
        </div>
      )}
    </div>
  )
}
