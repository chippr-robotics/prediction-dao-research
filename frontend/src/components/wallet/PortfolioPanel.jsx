import { useState } from 'react'
import { formatUnits } from 'ethers'
import usePortfolio from '../../hooks/usePortfolio'
import './Portfolio.css'

// Full-precision USD for a compliance-flavored view — deliberately not the
// dashboard's compact "$1.2K" (a portfolio total wants exact figures).
function formatUsdFull(n) {
  return `$${Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// Max fraction digits shown for a fungible balance.
const FRACTION_DIGITS = 6

function formatBalance(holding) {
  const { asset, balance, balanceRaw } = holding
  if (asset.kind === 'nft') {
    return `${balance} ${balance === 1 ? 'item' : 'items'}`
  }
  // Format from the raw units string so a nonzero dust holding can never
  // round to a misleading "0" (honest state). Falls back to the numeric
  // balance only when raw units aren't available.
  if (typeof balanceRaw === 'bigint' && Number.isInteger(asset.decimals)) {
    const [int, frac = ''] = formatUnits(balanceRaw, asset.decimals).split('.')
    const intFmt = BigInt(int).toLocaleString('en-US')
    const fracShown = frac.slice(0, FRACTION_DIGITS).replace(/0+$/, '')
    if (int === '0' && fracShown === '' && balanceRaw > 0n) {
      return `< 0.${'0'.repeat(FRACTION_DIGITS - 1)}1 ${asset.symbol}`
    }
    return `${intFmt}${fracShown ? `.${fracShown}` : ''} ${asset.symbol}`
  }
  const digits = balance !== 0 && Math.abs(balance) < 1 ? 6 : 4
  return `${Number(balance).toLocaleString('en-US', { maximumFractionDigits: digits })} ${asset.symbol}`
}

// Member-facing names for the classification provenance (FR-006).
const SOURCE_LABELS = {
  'sec-baseline': 'SEC baseline',
  'curated-registry': 'Curated registry',
  'app-config': 'App configuration',
}

function AssetRow({ holding }) {
  const { asset, usd } = holding
  return (
    <li className="portfolio-row">
      <div className="portfolio-row-asset">
        <span className="portfolio-row-name">{asset.name}</span>
        <span className="portfolio-row-meta">
          {asset.symbol}
          <span className="portfolio-row-source">{SOURCE_LABELS[asset.source] || asset.source}</span>
        </span>
      </div>
      <div className="portfolio-row-values">
        <span className="portfolio-row-balance">{formatBalance(holding)}</span>
        {usd == null ? (
          <span className="portfolio-row-usd portfolio-row-usd-unavailable">
            <span aria-hidden="true">—</span>
            <span className="portfolio-visually-hidden">price unavailable</span>
          </span>
        ) : (
          <span className="portfolio-row-usd">{formatUsdFull(usd)}</span>
        )}
      </div>
    </li>
  )
}

function CategorySection({ group, collapsed, onToggle }) {
  const { category, holdings, subtotalUsd, isPartial } = group
  const regionId = `portfolio-category-${category.id}`
  const expanded = !collapsed
  return (
    <section className="portfolio-category">
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
          <span className="portfolio-category-subtotal">
            {formatUsdFull(subtotalUsd)}
            {isPartial && (
              <span className="portfolio-partial-flag" title="Some assets in this category have no available price">
                {' '}
                (partial)
              </span>
            )}
          </span>
        </button>
      </h3>
      <div id={regionId} role="region" aria-label={category.label} hidden={!expanded}>
        <p className="portfolio-category-description">{category.description}</p>
        {holdings.length === 0 ? (
          <p className="portfolio-category-empty">No assets in this category.</p>
        ) : (
          <ul className="portfolio-rows">
            {holdings.map((h) => (
              <AssetRow key={h.asset.id} holding={h} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * Connected Account Portfolio (spec 044) — the member's live holdings on the
 * active network, grouped by the SEC/CFTC asset taxonomy. Read-only; honest
 * states for disconnected / unsupported network / loading / error / partial
 * pricing (FR-010/012/013/014).
 */
export default function PortfolioPanel() {
  const portfolio = usePortfolio()
  const [collapsedIds, setCollapsedIds] = useState(() => new Set())

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

  if (!portfolio.isSupportedNetwork) {
    return (
      <div className="portfolio-root">
        <p className="portfolio-state">Portfolio isn&apos;t available on this network.</p>
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
          {formatUsdFull(portfolio.totalUsd)}
          {portfolio.isPartial && (
            <span className="portfolio-partial-flag portfolio-partial-total"> (partial)</span>
          )}
        </p>
        {portfolio.isPartial && (
          <p className="portfolio-partial-note">
            Some assets have no available price or could not be read
            {portfolio.failedAssets.length > 0 && <> (unreadable: {portfolio.failedAssets.join(', ')})</>}
            ; they are excluded from USD totals.
          </p>
        )}
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
        />
      ))}

      <footer className="portfolio-disclosures">
        <p>
          Classifications follow the app&apos;s SEC/CFTC-aligned taxonomy and are informational
          only — not legal or investment advice.
        </p>
        <p>
          Only assets in the app&apos;s curated registry are scanned, so other holdings may exist
          on-chain that are not listed here.
        </p>
      </footer>
    </div>
  )
}
