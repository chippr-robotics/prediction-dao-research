/**
 * StakeView (spec 065, US1) — the curated staking option list, laid out like
 * the Earn lending vault list so the two read as one experience. One card per
 * option shows asset, model (Liquid/Delegated), estimated APR, total staked,
 * provider/validator identity, and the lock-up/unbonding terms — every concept
 * carrying an InfoTip. Honest states: loading, "temporarily unavailable"
 * (staking disabled — never stale numbers), and an honest no-network state.
 * `tokenFilter` (from portfolio deep links) narrows to options staking that
 * asset (ETH → liquid; POL → liquid + delegated).
 */
import { useMemo, useState } from 'react'
import { formatUnits } from 'ethers'
import { useStakingOptions } from '../../hooks/useStakingOptions'
import { useStakingPositions } from '../../hooks/useStakingPositions'
import { NETWORKS, getStakingNetworks } from '../../config/networks'
import InfoTip from '../ui/InfoTip'
import AssetLogo from '../wallet/AssetLogo'
import StakeSheet from './StakeSheet'
import StakingPositionsList from './StakingPositionsList'
import { STAKING_TIPS, STAKING_DISCLOSURE } from '../../lib/staking/stakingCopy'
import { formatApy } from '../../lib/earn/format'

function formatStaked(raw, decimals, symbol) {
  if (raw == null) return '—'
  const value = Number(formatUnits(BigInt(raw), decimals))
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M ${symbol}`
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K ${symbol}`
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${symbol}`
}

export default function StakeView({ tokenFilter: initialTokenFilter = null }) {
  const { options, status, refresh } = useStakingOptions()
  const positionsApi = useStakingPositions(options)
  const [tokenFilter, setTokenFilter] = useState(initialTokenFilter)
  const [selected, setSelected] = useState(null)

  const shownOptions = useMemo(() => {
    if (!tokenFilter) return options
    const wanted = tokenFilter.toUpperCase()
    return options.filter((o) => o.asset.symbol.toUpperCase() === wanted)
  }, [options, tokenFilter])

  const stakingNetworkNames = getStakingNetworks().map((n) => n.name).join(' and ')

  return (
    <div className="earn-lend">
      <StakingPositionsList
        positions={positionsApi.positions}
        status={positionsApi.status}
        onSelect={(position) => setSelected(position.option)}
      />

      <div className="earn-lend-header">
        <h3>
          Staking options
          <InfoTip label="About staking" className="earn-info">
            {STAKING_TIPS.staking}
          </InfoTip>
        </h3>
        {tokenFilter && (
          <button type="button" className="earn-filter-chip" onClick={() => setTokenFilter(null)}>
            {tokenFilter} only · clear ✕
          </button>
        )}
      </div>

      {status === 'loading' && <p className="earn-state">Loading staking options…</p>}

      {status === 'unavailable' && (
        <div className="earn-unavailable" role="alert">
          <p>
            Staking information is temporarily unavailable, so new staking is paused. Your existing
            positions are not affected.
          </p>
          <button type="button" className="earn-btn secondary" onClick={refresh}>
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && shownOptions.length === 0 && (
        <p className="earn-state">
          {tokenFilter
            ? `No staking options for ${tokenFilter} right now. Staking is available on ${stakingNetworkNames}.`
            : 'No staking options are available right now.'}
        </p>
      )}

      {status === 'ready' && shownOptions.length > 0 && (
        <ul className="earn-vault-list">
          {shownOptions.map((option) => {
            const label = option.model === 'delegated' ? option.validatorName : option.provider.name
            return (
              <li key={option.id}>
                <button type="button" className="earn-vault-row" onClick={() => setSelected(option)}>
                  <AssetLogo symbol={option.asset.symbol} chainId={option.chainId} showBadge size={32} />
                  <span className="earn-vault-main">
                    <span className="earn-vault-name">
                      {label}{' '}
                      <span className={`staking-badge ${option.model}`}>
                        {option.model === 'delegated' ? 'Delegated' : 'Liquid'}
                      </span>
                    </span>
                    <span className="earn-vault-asset">
                      Stakes {option.asset.symbol} · on {NETWORKS[option.chainId]?.name || 'unknown network'}
                      {option.lstSymbol ? ` · you get ${option.lstSymbol}` : ''}
                    </span>
                    <span className="earn-vault-curator">
                      {option.unbondingLabel
                        ? `Unbonding ${option.unbondingLabel}`
                        : option.instantExit
                          ? 'Cash out any time'
                          : 'Withdrawal queue on exit'}
                      {option.commissionPct != null ? ` · ${option.commissionPct}% commission` : ''}
                    </span>
                  </span>
                  <span className="earn-vault-numbers">
                    <span className="earn-vault-apy">{formatApy(option.rewardRateApr)}</span>
                    <span className="earn-vault-tvl">
                      {formatStaked(option.totalStaked?.raw, option.asset.decimals, option.asset.symbol)} staked
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {status === 'ready' && shownOptions.length > 0 && (
        <p className="earn-legend">
          <InfoTip label="What is APR?" className="earn-info">
            {STAKING_TIPS.apr}
          </InfoTip>{' '}
          Estimated yearly rate ·{' '}
          <InfoTip label="Liquid vs delegated" className="earn-info">
            {STAKING_TIPS.liquidToken} {STAKING_TIPS.delegation}
          </InfoTip>{' '}
          Liquid / Delegated ·{' '}
          <InfoTip label="About unbonding" className="earn-info">
            {STAKING_TIPS.unbonding}
          </InfoTip>{' '}
          Unbonding
        </p>
      )}

      <p className="earn-disclosure" role="note">
        {STAKING_DISCLOSURE}
      </p>

      {selected && (
        <StakeSheet
          option={selected}
          userState={positionsApi.states?.get(selected.id) || null}
          position={positionsApi.positions.find((p) => p.option.id === selected.id) || null}
          onClose={() => setSelected(null)}
          onActionComplete={() => positionsApi.refresh()}
        />
      )}
    </div>
  )
}
