import { useNavigate } from 'react-router-dom'
import { useAccountStats } from '../../hooks/useAccountStats'
import { useWalletConnection } from '../../hooks/useWalletManagement'
import SummaryTiles from './SummaryTiles'
import PnlChart from './PnlChart'
import ActivityBreakdowns from './ActivityBreakdowns'
import RecentActivityFeed from './RecentActivityFeed'
import FreshnessIndicator from './FreshnessIndicator'
import WalletUtilitiesPanel from './WalletUtilitiesPanel'
import PreferencesPanel from './PreferencesPanel'
import EmptyState from './EmptyState'
import './AccountDashboard.css'

/**
 * AccountDashboard — the Account tab body (spec 020). Real-time personal stats:
 * identity strip, summary tiles, hero P&L chart, breakdowns, recent activity,
 * a de-emphasised wallet-utilities panel, and a Preferences section (spec 038
 * US5 — no tab navigation exists in My Account, so Preferences lives here as
 * a section rather than a separate tab). Honest empty states throughout.
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
      {/* Identity (avatar + address) lives in the My Account sidebar; here we
          only surface the data-freshness indicator to avoid a duplicate
          address on the page. */}
      <div className="account-identity">
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
      <PreferencesPanel />
    </div>
  )
}

export default AccountDashboard
