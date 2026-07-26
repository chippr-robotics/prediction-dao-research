/**
 * EarnPanel (spec 050, issue #861) — the Finance → Earn section hub.
 *
 * A member-friendly gateway to passive earning. Every area is now live: Lend
 * (Morpho vaults), Rewards (Merkl), Stake (spec 065), and Supply (spec 067 —
 * liquidity pools, which replaced the disabled "Bridges" tile per FR-003).
 * Plus protocol attribution + risk disclosure and a link to the user guide.
 * Every DeFi term carries an InfoTip (FR-011).
 *
 * NAMING (spec 067 FR-003/FR-039): the liquidity area is **Supply**. It is not
 * "Bridges" — bridging itself lives in Transfer → Bridge and is a payment, not
 * an earning activity — and it is emphatically not "Pool", a word that belongs
 * to Wager Pools. Supplying liquidity and joining a wager pool are unrelated,
 * and a member must never have to work out which "Pool" a screen means.
 *
 * Network selection is TRANSPARENT, like the portfolio: vaults, positions,
 * and rewards from every earn-enabled network render together with network
 * badges, regardless of the wallet's active network — and submitting a
 * transaction switches networks automatically when needed (useEarnSend).
 * There is no "switch network" banner and no per-network gating here.
 *
 * Deep links: /wallet?tab=earn[&view=lend|rewards|stake|supply][&token=<sym>] — `token`
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
import SupplyView from './SupplyView'
import { EARN_TIPS, EARN_DISCLOSURE } from '../../lib/earn/earnCopy'
import { STAKING_AREA_DESC } from '../../lib/staking/stakingCopy'
import { LIQUIDITY_AREA_DESC } from '../../lib/liquidity/liquidityCopy'
import './Earn.css'

const EARN_DOCS_URL = 'https://docs.FairWins.app/user-guide/earn/'
const VIEWS = ['home', 'lend', 'rewards', 'stake', 'supply']

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

          {/* Supply (spec 067) replaced the disabled "Bridges" tile — a live
              area, not a placeholder. Availability is per-POOL, not per active
              network, so this entry is never gated on the wallet's chain: the
              pool list spans every network and the wallet switches at signing
              (FR-059/FR-061). */}
          <button type="button" className="earn-area-card" onClick={() => openView('supply')}>
            <span className="earn-area-name">Supply</span>
            <span className="earn-area-desc">{LIQUIDITY_AREA_DESC}</span>
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
      {view === 'supply' && <SupplyView tokenFilter={tokenFilter} />}

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
