/**
 * EarnLendView (spec 050, US1) — the curated lending vault list across every
 * earn-enabled network plus the member's open positions. Network selection is
 * transparent, exactly like the portfolio: every row carries the hosting
 * network's badge (the shared AssetLogo artwork) and name, and submitting a
 * transaction handles any needed network switch automatically. Selecting a
 * vault opens VaultSheet for deposit/withdraw. Honest states: loading,
 * explicit "temporarily unavailable" (deposits disabled — never stale
 * numbers), and a plain empty state. `tokenFilter` (from portfolio deep
 * links) narrows the list to vaults accepting that asset, with a one-tap
 * clear.
 */
import { useMemo, useState } from 'react'
import { useEarnVaults } from '../../hooks/useEarnVaults'
import { useEarnPositions, positionKey } from '../../hooks/useEarnPositions'
import { NETWORKS } from '../../config/networks'
import InfoTip from '../ui/InfoTip'
import AssetLogo from '../wallet/AssetLogo'
import VaultSheet from './VaultSheet'
import EarnPositionsList from './EarnPositionsList'
import { EARN_TIPS } from '../../lib/earn/earnCopy'
import { formatApy, formatTvl } from '../../lib/earn/format'

export default function EarnLendView({ tokenFilter: initialTokenFilter = null }) {
  const { vaults, status, refresh } = useEarnVaults()
  const positionsApi = useEarnPositions(vaults)
  const [tokenFilter, setTokenFilter] = useState(initialTokenFilter)
  const [selectedVault, setSelectedVault] = useState(null)

  const shownVaults = useMemo(() => {
    if (!tokenFilter) return vaults
    const wanted = tokenFilter.toUpperCase()
    return vaults.filter((v) => v.asset.symbol.toUpperCase() === wanted)
  }, [vaults, tokenFilter])

  const selectedState = selectedVault
    ? positionsApi.userStates?.get(positionKey(selectedVault.chainId, selectedVault.address)) || null
    : null

  return (
    <div className="earn-lend">
      <EarnPositionsList
        positions={positionsApi.positions}
        status={positionsApi.status}
        onSelect={(position) => setSelectedVault(position.vault)}
      />

      <div className="earn-lend-header">
        <h3>
          Lending vaults
          <InfoTip label="About vaults" className="earn-info">
            {EARN_TIPS.vault}
          </InfoTip>
        </h3>
        {tokenFilter && (
          <button type="button" className="earn-filter-chip" onClick={() => setTokenFilter(null)}>
            {tokenFilter} only · clear ✕
          </button>
        )}
      </div>

      {status === 'loading' && <p className="earn-state">Loading vaults…</p>}

      {status === 'unavailable' && (
        <div className="earn-unavailable" role="alert">
          <p>
            Vault information is temporarily unavailable, so deposits are paused. Your money and
            existing positions are not affected.
          </p>
          <button type="button" className="earn-btn secondary" onClick={refresh}>
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && shownVaults.length === 0 && (
        <p className="earn-state">
          {tokenFilter
            ? `No vaults accept ${tokenFilter} right now.`
            : 'No vaults are available right now.'}
        </p>
      )}

      {status === 'ready' && shownVaults.length > 0 && (
        <ul className="earn-vault-list">
          {shownVaults.map((vault) => (
            <li key={`${vault.chainId}:${vault.address}`}>
              <button
                type="button"
                className="earn-vault-row"
                onClick={() => setSelectedVault(vault)}
              >
                {/* Shared portfolio artwork: asset glyph + hosting-network
                    badge, so where a vault lives is always visible. */}
                <AssetLogo symbol={vault.asset.symbol} chainId={vault.chainId} showBadge size={32} />
                <span className="earn-vault-main">
                  <span className="earn-vault-name">{vault.name}</span>
                  <span className="earn-vault-asset">
                    Deposits {vault.asset.symbol} · on {NETWORKS[vault.chainId]?.name || 'unknown network'}
                  </span>
                  {vault.curator && (
                    <span className="earn-vault-curator">Managed by {vault.curator}</span>
                  )}
                </span>
                <span className="earn-vault-numbers">
                  <span className="earn-vault-apy">{formatApy(vault.netApy)}</span>
                  <span className="earn-vault-tvl">{formatTvl(vault.totalAssetsUsd)} deposited</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === 'ready' && shownVaults.length > 0 && (
        <p className="earn-legend">
          <InfoTip label="What is APY?" className="earn-info">
            {EARN_TIPS.apy}
          </InfoTip>{' '}
          Yearly rate (APY) ·{' '}
          <InfoTip label="What does total deposited mean?" className="earn-info">
            {EARN_TIPS.totalDeposits}
          </InfoTip>{' '}
          Total deposited ·{' '}
          <InfoTip label="Who manages a vault?" className="earn-info">
            {EARN_TIPS.curator}
          </InfoTip>{' '}
          Vault managers
        </p>
      )}

      {selectedVault && (
        <VaultSheet
          vault={selectedVault}
          userState={selectedState}
          onClose={() => setSelectedVault(null)}
          onActionComplete={() => {
            positionsApi.refresh()
          }}
        />
      )}
    </div>
  )
}
