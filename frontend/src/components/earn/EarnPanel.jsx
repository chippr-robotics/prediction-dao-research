/**
 * EarnPanel (spec 050, issue #861) — the Finance → Earn section hub.
 *
 * A member-friendly gateway to passive earning: live areas (Lend via Morpho
 * vaults, Rewards via Merkl) plus honest "not yet available" areas (Staking,
 * Bridges), protocol attribution + risk disclosure, and a link to the user
 * guide. Every DeFi term carries an InfoTip (FR-011).
 *
 * Network selection is TRANSPARENT, like the portfolio: vaults, positions,
 * and rewards from every earn-enabled network render together with network
 * badges, regardless of the wallet's active network — and submitting a
 * transaction switches networks automatically when needed (useEarnSend).
 * There is no "switch network" banner and no per-network gating here.
 *
 * Deep links: /wallet?tab=earn[&view=lend|rewards][&token=<sym>] — `token`
 * prefilters the vault list (used by the portfolio's Earn action). A legacy
 * `chain` param is accepted and ignored: the list already spans all earn
 * networks.
 */
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getEarnNetworks } from '../../config/networks'
import InfoTip from '../ui/InfoTip'
import EarnLendView from './EarnLendView'
import EarnRewardsView from './EarnRewardsView'
import StakeView from './StakeView'
import { EARN_TIPS, EARN_DISCLOSURE, EARN_AREAS_FUTURE } from '../../lib/earn/earnCopy'
import { STAKING_AREA_DESC } from '../../lib/staking/stakingCopy'
import './Earn.css'

const EARN_DOCS_URL = 'https://docs.FairWins.app/user-guide/earn/'
const VIEWS = ['home', 'lend', 'rewards', 'stake']

export default function EarnPanel() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Provider identity + legacy link are the same on every earn network —
  // resolve from the canonical earn config, independent of the active chain.
  const earnConfig = useMemo(() => getEarnNetworks()[0]?.earn ?? null, [])

  // View selection is derived from ?view= so nav/portfolio deep links land
  // directly and back/forward keep working — no duplicated state.
  const requestedView = searchParams.get('view')
  const view = VIEWS.includes(requestedView) ? requestedView : 'home'

  const openView = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'home') params.delete('view')
    else params.set('view', next)
    setSearchParams(params, { replace: true })
  }

  const tokenFilter = searchParams.get('token') || null

  return (
    <div className="earn-panel section">
      <div className="earn-header">
        <h2 className="earn-title">
          Earn
          <InfoTip label="About Earn" className="earn-info">
            {EARN_TIPS.earn}
          </InfoTip>
        </h2>
        <p className="earn-subtitle">
          Put money you are not using to work and earn a return — you stay in control the whole
          time.
        </p>
      </div>

      {view === 'home' && (
        <div className="earn-areas" aria-label="Earning opportunities">
          <button type="button" className="earn-area-card" onClick={() => openView('lend')}>
            <span className="earn-area-name">Lend</span>
            <span className="earn-area-desc">
              Deposit into a managed lending vault and earn interest. Withdraw any time.
            </span>
          </button>

          <button type="button" className="earn-area-card" onClick={() => openView('rewards')}>
            <span className="earn-area-name">Rewards</span>
            <span className="earn-area-desc">
              See bonus tokens your deposits have earned and claim them to your wallet.
            </span>
          </button>

          {/* Staking (spec 065) is now live. */}
          <button type="button" className="earn-area-card" onClick={() => openView('stake')}>
            <span className="earn-area-name">Stake</span>
            <span className="earn-area-desc">{STAKING_AREA_DESC}</span>
          </button>

          {/* Bridges remains an honest "not yet available" area (constitution
              III: no dead buttons without a reason, no pretend features). */}
          <button
            type="button"
            className="earn-area-card"
            disabled
            title={EARN_AREAS_FUTURE.bridges}
          >
            <span className="earn-area-name">Bridges</span>
            <span className="earn-area-desc">{EARN_AREAS_FUTURE.bridges}</span>
            <span className="earn-area-flag">Coming later</span>
          </button>
        </div>
      )}

      {view !== 'home' && (
        <button type="button" className="earn-back" onClick={() => openView('home')}>
          ← All earning options
        </button>
      )}

      {view === 'lend' && <EarnLendView tokenFilter={tokenFilter} />}
      {view === 'rewards' && <EarnRewardsView />}
      {view === 'stake' && <StakeView tokenFilter={tokenFilter} />}

      <footer className="earn-footer">
        {earnConfig?.provider && (
          <a
            className="earn-attribution"
            href={earnConfig.provider.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {EARN_DISCLOSURE.attribution}
          </a>
        )}
        <p className="earn-risk">{EARN_DISCLOSURE.risk}</p>
        <a className="earn-docs-link" href={EARN_DOCS_URL} target="_blank" rel="noopener noreferrer">
          Learn more in the Earn guide ↗
        </a>
      </footer>
    </div>
  )
}
