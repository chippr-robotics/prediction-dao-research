import { useLayoutEffect, useRef } from 'react'
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
import EstateBreakdown from './EstateBreakdown'
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

  // The account selection (cards + view switcher) stays frozen at the top
  // while the view below scrolls. It pins under the site header — itself
  // sticky with a height that isn't a constant (dev banner, wrap points) —
  // so the offset is measured from the header's live box, not hardcoded.
  const stickyRef = useRef(null)
  useLayoutEffect(() => {
    const el = stickyRef.current
    if (!el) return undefined
    const measure = () => {
      const header = document.querySelector('.site-header')
      const bottom = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0
      el.style.setProperty('--my-account-sticky-top', `${bottom}px`)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Honest unsupported/empty states, per view. The old blanket state pitched
  // "Create a wager" at every account — for an imported/recovered account
  // holding a real estate that notice was useless (post-launch feedback). Copy
  // is account-aware: acting accounts (vault/recovered/hardware) get neutral
  // wording and no wager CTA; only the personal wallet is invited to wager.
  // Portfolio keeps its own states (it reads every supported network, so
  // "network not supported" does not apply to it).
  const activityHonestState = () => {
    if (!isSupportedNetwork) {
      return (
        <EmptyState
          title="Network not supported"
          message="Activity is recorded per network, and this one isn't supported yet. Balances across all networks are in Portfolio."
        />
      )
    }
    if (isEmpty) {
      return isActingAccount ? (
        <EmptyState
          title="No activity recorded yet"
          message="No wagers, transfers, or other FairWins activity has been recorded for this account yet. Its balances across all networks are in Portfolio."
        />
      ) : (
        <EmptyState
          title="No activity yet"
          message="Your wagers, transfers, earn, pool, and membership activity will appear here."
          ctaLabel="Create a wager"
          onCta={goCreate}
        />
      )
    }
    return null
  }

  // Stats never blanks wholesale: the estate overview (fed by the portfolio's
  // cross-network scan) renders regardless, and only the WAGER sections get an
  // honest compact note when there is nothing to compute them from.
  const wagerStatsHonestState = () => {
    if (!isSupportedNetwork) {
      return (
        <EmptyState
          compact
          title="Wager stats unavailable here"
          message="Wager data is scoped to the active network, and this one isn't supported yet."
        />
      )
    }
    if (isEmpty) {
      return isActingAccount ? (
        <EmptyState
          compact
          title="No wager activity for this account"
          message="Performance charts appear once this account has wager history."
        />
      ) : (
        <EmptyState
          compact
          title="No wager activity yet"
          message="Create or accept your first wager to start building your performance stats."
          ctaLabel="Create a wager"
          onCta={goCreate}
        />
      )
    }
    return null
  }

  const activityState = activityHonestState()
  const wagerStatsState = wagerStatsHonestState()

  return (
    <div className="my-account">
      <div className="my-account-sticky" ref={stickyRef}>
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
          {activityState || (
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
          {wagerStatsState ? (
            <>
              {/* Estate first when there are no wager stats: the account's
                  cross-network holdings ARE its stats (the screenshot case —
                  a recovered account holding real value saw only a wager
                  pitch). The wager note follows, compact. */}
              <EstateBreakdown portfolio={portfolio} />
              {wagerStatsState}
            </>
          ) : (
            <>
              <SummaryTiles summary={summary} isEmpty={isLoading && !summary} />
              <PnlChart series={series} onRangeChange={setRange} onCreateWager={goCreate} />
              {/* The by-status / by-token / by-resolution breakdowns are stats,
                  not a transaction log — they live here beside the tiles and
                  chart (post-launch feedback), keeping Activity a clean feed. */}
              <ActivityBreakdowns breakdowns={breakdowns} />
              {/* The whole estate, beyond the active network's wager data
                  (spec 044's scan, already loaded for the Portfolio view). */}
              <EstateBreakdown portfolio={portfolio} />
            </>
          )}
        </div>
      )}

      <WalletUtilitiesPanel onDisconnect={handleDisconnect} />
    </div>
  )
}

export default MyAccountView
