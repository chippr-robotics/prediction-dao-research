import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../../hooks/useWalletManagement'
import { usePools } from '../../hooks/usePools'
import { UIContext } from '../../contexts/UIContext'
import { recordJoinedPool } from '../../lib/lookup/myWagersSources'
import { poolStateDisplay } from '../../lib/pools/poolContracts'
import './FriendMarketsModal.css'
import '../../pages/pools.css'

/**
 * Join-a-pool presentation (spec 037, US1) — extracted verbatim from GroupPoolModal's JoinPanel
 * "found" block so the unified phrase lookup can render it after resolving a phrase to a pool.
 * The phrase→pool resolution now happens upstream in the unified lookup; this panel only shows the
 * resolved summary and performs the join.
 */
export default function JoinPoolPanel({ summary, onClose }) {
  const { isConnected, account } = useWallet()
  const { joinPool, status, error } = usePools()
  const navigate = useNavigate()
  // Optional notification access — routes the join-success event into the app's toasts without
  // requiring a UIProvider in tests (spec 037).
  const ui = useContext(UIContext)

  if (!summary) return null
  const joinable = summary.state === 0 && summary.slotsRemaining > 0

  const onJoin = async () => {
    try {
      await joinPool(summary.address)
      // Record the join device-locally so this pool can surface in My Wagers (FR-024): on-chain
      // membership is anonymous, so the joining wallet is only known on this device.
      recordJoinedPool(account, summary.address)
      ui?.showNotification?.('You’ve joined the pool.', 'success', 6000)
      onClose?.()
      navigate(`/pools/${summary.address}`)
    } catch {
      /* surfaced via hook error */
    }
  }

  return (
    <div className="pool-summary" data-testid="pool-summary">
      <dl>
        <dt>Buy-in</dt><dd>{summary.buyInFormatted} {summary.tokenSymbol}</dd>
        <dt>Members</dt><dd>{summary.memberCount} / {summary.maxMembers} ({summary.slotsRemaining} left)</dd>
        <dt>Status</dt><dd>{poolStateDisplay(summary.state)}</dd>
        <dt>Approval threshold</dt><dd>{summary.thresholdPct}% of members</dd>
      </dl>
      {joinable ? (
        <>
          {error && <p className="fm-error" role="alert">{error}</p>}
          <button
            type="button"
            className="fm-submit-btn"
            onClick={onJoin}
            disabled={!isConnected || status === 'joining'}
          >
            {!isConnected ? 'Connect wallet to join' : status === 'joining' ? 'Joining…' : `Join for ${summary.buyInFormatted} ${summary.tokenSymbol}`}
          </button>
        </>
      ) : (
        <p className="pool-closed-note">
          This pool isn’t accepting new members ({summary.state === 0 ? 'full' : poolStateDisplay(summary.state).toLowerCase()}).
        </p>
      )}
    </div>
  )
}
