import { useState } from 'react'
import usePortfolio from '../../hooks/usePortfolio'
import InfoTip from '../ui/InfoTip'
import AssetLogo from './AssetLogo'
import AssetDetailSheet from './AssetDetailSheet'
import { formatAssetAmount } from '../../lib/portfolio/aggregate'
import SensitiveValue from '../common/SensitiveValue'
import './Portfolio.css'

// Full-precision USD for a compliance-flavored view — deliberately not the
// dashboard's compact "$1.2K" (a portfolio total wants exact figures).
function formatUsdFull(n) {
  return `$${Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatAggregateBalance(aggregate) {
  return formatAssetAmount(aggregate.balance, aggregate.underlying, aggregate.kind)
}

function AggregateRow({ aggregate, onOpen }) {
  const networks = new Set(aggregate.instances.map((h) => h.asset.chainId))
  const singleInstance = aggregate.instances.length === 1 ? aggregate.instances[0] : null
  return (
    <li className="portfolio-row">
      <button
        type="button"
        className="portfolio-row-button"
        onClick={() => onOpen(aggregate)}
        aria-haspopup="dialog"
      >
        <AssetLogo symbol={aggregate.underlying} size={32} />
        <span className="portfolio-row-asset">
          <span className="portfolio-row-name">{aggregate.name}</span>
          <span className="portfolio-row-meta">
            {aggregate.underlying}
            <span className="portfolio-row-network">
              {singleInstance
                ? singleInstance.network
                : `${aggregate.instances.length} instances · ${networks.size} network${networks.size === 1 ? '' : 's'}`}
            </span>
          </span>
        </span>
        <span className="portfolio-row-values">
          <SensitiveValue className="portfolio-row-balance">{formatAggregateBalance(aggregate)}</SensitiveValue>
          {aggregate.usd == null ? (
            <span className="portfolio-row-usd portfolio-row-usd-unavailable">
              <span aria-hidden="true">—</span>
              <span className="portfolio-visually-hidden">price unavailable</span>
            </span>
          ) : (
            <SensitiveValue className="portfolio-row-usd">{formatUsdFull(aggregate.usd)}</SensitiveValue>
          )}
        </span>
      </button>
    </li>
  )
}

function CategorySection({ group, collapsed, onToggle, onOpen }) {
  const { category, aggregates, subtotalUsd } = group
  const regionId = `portfolio-category-${category.id}`
  const expanded = !collapsed
  return (
    <section className="portfolio-category">
      <div className="portfolio-category-heading-row">
        <h3 className="portfolio-category-heading">
          <button
            type="button"
            className="portfolio-category-toggle"
            aria-expanded={expanded}
            aria-controls={regionId}
            onClick={() => onToggle(category.id)}
          >
            <span className="portfolio-category-chevron" aria-hidden="true">
              {expanded ? '▾' : '▸'}
            </span>
            <span className="portfolio-category-label">{category.label}</span>
            <SensitiveValue className="portfolio-category-subtotal">{formatUsdFull(subtotalUsd)}</SensitiveValue>
          </button>
        </h3>
        <InfoTip label={`About ${category.label}`} className="portfolio-category-info">
          {category.description}
        </InfoTip>
      </div>
      <div id={regionId} role="region" aria-label={category.label} hidden={!expanded}>
        {aggregates.length === 0 ? (
          <p className="portfolio-category-empty">No assets in this category.</p>
        ) : (
          <ul className="portfolio-rows">
            {aggregates.map((aggregate) => (
              <AggregateRow key={aggregate.id} aggregate={aggregate} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * Connected Account Portfolio (spec 044 v1.2) — the member's holdings across
 * every supported network, grouped by the SEC/CFTC asset taxonomy with
 * wrapped forms combined into their underlying asset. Tapping a row opens
 * the asset detail sheet (instances + actions). Category explainers live in
 * InfoTip bubbles; testnet and zero-balance visibility follow the
 * Preferences → Portfolio settings.
 */
export default function PortfolioPanel() {
  const portfolio = usePortfolio()
  const [collapsedIds, setCollapsedIds] = useState(() => new Set())
  const [openAggregateId, setOpenAggregateId] = useState(null)

  // Resolve from the live snapshot so a refresh keeps the sheet current.
  const openAggregate = portfolio.aggregates.find((a) => a.id === openAggregateId) || null

  const toggleCategory = (id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (portfolio.status === 'disconnected') {
    return (
      <div className="portfolio-root">
        <p className="portfolio-state">Connect a wallet to see your portfolio.</p>
      </div>
    )
  }

  if (portfolio.status === 'error') {
    return (
      <div className="portfolio-root">
        <p className="portfolio-state portfolio-state-error" role="alert">
          {portfolio.error}
        </p>
        <button type="button" className="portfolio-refresh" onClick={() => portfolio.refresh()}>
          Retry
        </button>
      </div>
    )
  }

  if (portfolio.status === 'loading') {
    return (
      <div className="portfolio-root">
        <p className="portfolio-state" role="status">
          Loading portfolio…
        </p>
      </div>
    )
  }

  return (
    <div className="portfolio-root">
      <header className="portfolio-header">
        <p className="portfolio-total-label" id="portfolio-total-label">
          Total portfolio balance
        </p>
        <p className="portfolio-total" aria-labelledby="portfolio-total-label">
          <SensitiveValue>{formatUsdFull(portfolio.totalUsd)}</SensitiveValue>
        </p>
        <button
          type="button"
          className="portfolio-refresh"
          onClick={() => portfolio.refresh()}
          disabled={portfolio.isLoading}
        >
          {portfolio.isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {portfolio.categories.map((group) => (
        <CategorySection
          key={group.category.id}
          group={group}
          collapsed={collapsedIds.has(group.category.id)}
          onToggle={toggleCategory}
          onOpen={(aggregate) => setOpenAggregateId(aggregate.id)}
        />
      ))}

      <footer className="portfolio-disclosures">
        {!portfolio.showTestnetAssets && (
          <p>Testnet tokens are hidden — enable them under Preferences → Portfolio.</p>
        )}
        {!portfolio.showZeroBalances && (
          <p>Zero-balance assets are hidden — enable them under Preferences → Portfolio.</p>
        )}
        <p>
          Classifications are informational, not legal or investment advice. Only assets in the
          app&apos;s curated registry are scanned; prices come from on-chain sources (oracle
          feeds, DEX pools) and USD totals include only priced assets.
        </p>
      </footer>

      {openAggregate && (
        <AssetDetailSheet aggregate={openAggregate} onClose={() => setOpenAggregateId(null)} />
      )}
    </div>
  )
}
