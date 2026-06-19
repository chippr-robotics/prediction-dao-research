import { useNavigate } from 'react-router-dom'
import { useAccountStats } from '../../hooks/useAccountStats'
import { useWalletConnection } from '../../hooks/useWalletManagement'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import SummaryTiles from './SummaryTiles'
import PnlChart from './PnlChart'
import ActivityBreakdowns from './ActivityBreakdowns'
import RecentActivityFeed from './RecentActivityFeed'
import FreshnessIndicator from './FreshnessIndicator'
import WalletUtilitiesPanel from './WalletUtilitiesPanel'
import EmptyState from './EmptyState'
import './AccountDashboard.css'

function shorten(address) {
  if (!address) return ''
  return `${address.substring(0, 6)}…${address.substring(address.length - 4)}`
}

/**
 * AccountDashboard — the Account tab body (spec 020). Real-time personal stats:
 * identity strip, summary tiles, hero P&L chart, breakdowns, recent activity,
 * and a de-emphasised wallet-utilities panel. Honest empty states throughout.
 */
function AccountDashboard({ address }) {
  const navigate = useNavigate()
  const { disconnectWallet } = useWalletConnection()
  const stats = useAccountStats()
  const {
    summary, series, setRange, breakdowns, activity,
    isSupportedNetwork, chainId, isLoading, isEmpty, freshness, refresh,
  } = stats

  const handleDisconnect = () => {
    disconnectWallet()
    navigate('/app')
  }
  const goCreate = () => navigate('/app')

  return (
    <div className="account-dashboard">
      <div className="account-identity">
        <div className="account-identity-main">
          <BlockiesAvatar address={address} size={36} />
          <span className="account-identity-address">{shorten(address)}</span>
          <span className="status-dot connected" aria-hidden="true" />
        </div>
        <FreshnessIndicator state={freshness?.summary} onRefresh={refresh} />
      </div>

      {!isSupportedNetwork ? (
        <EmptyState
          title="Network not supported"
          message="Switch to a supported network to see your account stats. Wager data is scoped to the active network."
        />
      ) : isEmpty ? (
        <EmptyState
          title="No activity yet"
          message="Create or accept your first wager to start building your stats. Your performance, balances, and history will appear here."
          ctaLabel="Create a wager"
          onCta={goCreate}
        />
      ) : (
        <>
          <SummaryTiles summary={summary} isEmpty={isLoading && !summary} />
          <PnlChart series={series} onRangeChange={setRange} onCreateWager={goCreate} />
          <ActivityBreakdowns breakdowns={breakdowns} />
          <RecentActivityFeed activity={activity} chainId={chainId} />
        </>
      )}

      <WalletUtilitiesPanel address={address} onDisconnect={handleDisconnect} />
    </div>
  )
}

export default AccountDashboard
