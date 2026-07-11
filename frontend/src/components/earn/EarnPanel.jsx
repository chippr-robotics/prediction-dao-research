/**
 * EarnPanel (spec 050, issue #861) — the Finance → Earn section hub.
 *
 * A member-friendly gateway to passive earning: live area (Lend via Morpho
 * vaults) plus honest "not yet available" areas (Staking, Bridges), the
 * member's rewards, protocol attribution + risk disclosure, and a link to the
 * user guide. Every DeFi term carries an InfoTip (FR-011). On networks
 * without earn support the panel explains where earning IS available instead
 * of dead-ending (FR-008).
 *
 * Deep links: /wallet?tab=earn[&view=lend|rewards][&chain=<id>][&token=<sym>]
 * — `chain` is a hint (prompts a switch when it differs from the active
 * network), `token` prefilters the vault list (used by the portfolio's Earn
 * action).
 */
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWallet } from '../../hooks/useWalletManagement'
import { getNetwork, isEarnAvailable, getEarnConfig, getEarnNetworks, NETWORKS } from '../../config/networks'
import InfoTip from '../ui/InfoTip'
import EarnLendView from './EarnLendView'
import EarnRewardsView from './EarnRewardsView'
import { EARN_TIPS, EARN_DISCLOSURE, EARN_AREAS_FUTURE, earnUnavailableCopy } from '../../lib/earn/earnCopy'
import './Earn.css'

const EARN_DOCS_URL = 'https://docs.FairWins.app/user-guide/earn/'
const VIEWS = ['home', 'lend', 'rewards']

export default function EarnPanel() {
  const { chainId, switchNetwork } = useWallet() || {}
  const [searchParams, setSearchParams] = useSearchParams()

  const supported = isEarnAvailable(chainId)
  const network = getNetwork(chainId)
  const earnConfig = getEarnConfig(chainId)
  const earnNetworkNames = useMemo(() => getEarnNetworks().map((n) => n.name), [])

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

  // ?chain= hint from deep links: when it names a different earn-enabled
  // network, offer the switch honestly instead of silently ignoring it.
  const chainHint = Number(searchParams.get('chain')) || null
  const hintNetwork = chainHint && chainHint !== chainId ? NETWORKS[chainHint] : null
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

      {hintNetwork && (
        <div className="earn-switch-note" role="note">
          <p>
            You followed a link for {hintNetwork.name}, but your wallet is on{' '}
            {network?.name || 'another network'}.
          </p>
          {typeof switchNetwork === 'function' && (
            <button
              type="button"
              className="earn-btn secondary"
              onClick={() => switchNetwork(chainHint)}
            >
              Switch to {hintNetwork.name}
            </button>
          )}
        </div>
      )}

      {!supported && (
        <div className="earn-unavailable" role="note">
          <p>{earnUnavailableCopy(network?.name, earnNetworkNames)}</p>
        </div>
      )}

      {view === 'home' && (
        <div className="earn-areas" aria-label="Earning opportunities">
          <button
            type="button"
            className="earn-area-card"
            disabled={!supported}
            title={supported ? undefined : earnUnavailableCopy(network?.name, earnNetworkNames)}
            onClick={() => openView('lend')}
          >
            <span className="earn-area-name">Lend</span>
            <span className="earn-area-desc">
              Deposit into a managed lending vault and earn interest. Withdraw any time.
            </span>
            {!supported && <span className="earn-area-flag">Not on this network</span>}
          </button>

          <button
            type="button"
            className="earn-area-card"
            disabled={!supported}
            title={supported ? undefined : earnUnavailableCopy(network?.name, earnNetworkNames)}
            onClick={() => openView('rewards')}
          >
            <span className="earn-area-name">Rewards</span>
            <span className="earn-area-desc">
              See bonus tokens your deposits have earned and claim them to your wallet.
            </span>
            {!supported && <span className="earn-area-flag">Not on this network</span>}
          </button>

          {/* Future areas render honestly disabled — same pattern as the
              portfolio's Stake action (constitution III: no dead buttons
              without a reason, no pretend features). */}
          <button
            type="button"
            className="earn-area-card"
            disabled
            title={EARN_AREAS_FUTURE.staking}
          >
            <span className="earn-area-name">Stake</span>
            <span className="earn-area-desc">{EARN_AREAS_FUTURE.staking}</span>
            <span className="earn-area-flag">Coming later</span>
          </button>
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

      {/* The not-supported explanation renders once above (FR-008), so the
          sub-views simply stay absent on non-earn networks. */}
      {view === 'lend' && supported && <EarnLendView tokenFilter={tokenFilter} />}
      {view === 'rewards' && supported && <EarnRewardsView />}

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
