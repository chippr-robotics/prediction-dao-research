import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAccountStats } from '../../hooks/useAccountStats'
import usePortfolio from '../../hooks/usePortfolio'
import { useWalletConnection } from '../../hooks/useWalletManagement'
import { useEffectiveAccount } from '../../hooks/useEffectiveAccount'
import { ACCOUNT_VIEWS, ACCOUNT_DEFAULT_VIEW, accountViewFromParam } from '../../config/appNav'
import AccountCardsCarousel from './AccountCardsCarousel'
import PortfolioPanel from '../wallet/PortfolioPanel'
import SummaryTiles from './SummaryTiles'
import PnlChart from './PnlChart'
import ActivityBreakdowns from './ActivityBreakdowns'
import RecentActivityFeed from './RecentActivityFeed'
import FreshnessIndicator from './FreshnessIndicator'
import WalletUtilitiesPanel from './WalletUtilitiesPanel'
import EmptyState from './EmptyState'
import './MyAccountView.css'

/**
 * MyAccountView — the unified Account tab body (spec 074, replacing the
 * spec-020 AccountDashboard's role). Top half: the account card carousel
 * (personal / multisig / recovered — selecting a card switches the app-wide
 * acting account; the active card carries the portfolio total). Bottom half:
 * ONE of three views of the selected account — Portfolio (the default),
 * Activity (the ledger feed), or Stats (tiles + P&L chart + breakdowns) —
 * driven by `?view=` so each is deep-linkable (the PayTransferPanel idiom).
 * The switcher is WalletPage's bottom icon bar on mobile and the tab strip
 * here on desktop; exactly one is visible at any width (the strip hides
 * ≤768px in CSS, SectionIconNav renders only ≤768px).
 *
 * Stats and Activity follow the ACTING account (spec 063 pattern): the acting
 * address is passed into useAccountStats, mirroring how PortfolioPanel already
 * resolves useEffectiveAccount internally.
 */
function MyAccountView() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = accountViewFromParam(searchParams.get('view'))

  const setView = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === ACCOUNT_DEFAULT_VIEW) params.delete('view')
    else params.set('view', next)
    setSearchParams(params, { replace: true })
  }

  const { disconnectWallet } = useWalletConnection()
  // Spec 074 (US3): the stats/activity data follows the account the member is
  // ACTING AS — the same seam the portfolio already reads. Personal mode passes
  // nothing → identical to the pre-074 behavior.
  const { address: actingAddress, isActingAccount } = useEffectiveAccount()
  const stats = useAccountStats(isActingAccount ? { accountAddress: actingAddress } : undefined)
  // ONE portfolio instance for the whole view (post-launch feedback): it backs
  // the Portfolio view AND the active card's quick-access total, and because
  // it lives here (not inside the view panel) the scan starts — and the
  // snapshot cache warms — the moment My Account opens, whichever view shows.
  const portfolio = usePortfolio(isActingAccount ? { accountAddress: actingAddress } : undefined)
  const activeTotalUsd = portfolio.status === 'ready' ? portfolio.totalUsd : null
  const {
    summary, series, setRange, breakdowns, activity, staleClasses, prunedBefore,
    isSupportedNetwork, chainId, isLoading, isEmpty, freshness, refresh,
  } = stats

  const handleDisconnect = () => {
    disconnectWallet()
    navigate('/app')
  }
  const goCreate = () => navigate('/app')

  // The Activity and Stats views share the honest unsupported/empty states the
  // dashboard always had; Portfolio keeps its own (it reads every supported
  // network, so "network not supported" does not apply to it).
  const renderHonestState = () => {
    if (!isSupportedNetwork) {
      return (
        <EmptyState
          title="Network not supported"
          message="Switch to a supported network to see your account stats. Wager data is scoped to the active network."
        />
      )
    }
    if (isEmpty) {
      return (
        <EmptyState
          title="No activity yet"
          message="Create or accept your first wager to start building your stats. Your performance, balances, and history will appear here."
          ctaLabel="Create a wager"
          onCta={goCreate}
        />
      )
    }
    return null
  }

  const honestState = renderHonestState()

  return (
    <div className="my-account">
      <AccountCardsCarousel activeTotalUsd={activeTotalUsd} />

      {/* Desktop view switcher (the pt-tabs idiom); hidden ≤768px where
          WalletPage's bottom icon bar carries the same three views. */}
      <div className="my-account-tabs" role="tablist" aria-label="Account views">
        {ACCOUNT_VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={`my-account-tab ${view === v.id ? 'active' : ''}`}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'portfolio' && (
        <div role="tabpanel" aria-label="Portfolio" className="my-account-panel">
          <PortfolioPanel portfolio={portfolio} />
        </div>
      )}

      {view === 'activity' && (
        <div role="tabpanel" aria-label="Activity" className="my-account-panel">
          <div className="my-account-freshness">
            <FreshnessIndicator state={freshness?.summary} onRefresh={refresh} />
          </div>
          {honestState || (
            <RecentActivityFeed
              entries={activity}
              chainId={chainId}
              staleClasses={staleClasses}
              prunedBefore={prunedBefore}
            />
          )}
        </div>
      )}

      {view === 'stats' && (
        <div role="tabpanel" aria-label="Stats" className="my-account-panel">
          <div className="my-account-freshness">
            <FreshnessIndicator state={freshness?.summary} onRefresh={refresh} />
          </div>
          {honestState || (
            <>
              <SummaryTiles summary={summary} isEmpty={isLoading && !summary} />
              <PnlChart series={series} onRangeChange={setRange} onCreateWager={goCreate} />
              {/* The by-status / by-token / by-resolution breakdowns are stats,
                  not a transaction log — they live here beside the tiles and
                  chart (post-launch feedback), keeping Activity a clean feed. */}
              <ActivityBreakdowns breakdowns={breakdowns} />
            </>
          )}
        </div>
      )}

      <WalletUtilitiesPanel onDisconnect={handleDisconnect} />
    </div>
  )
}

export default MyAccountView
