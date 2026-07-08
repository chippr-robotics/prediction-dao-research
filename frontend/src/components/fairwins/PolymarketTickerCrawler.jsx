import { useChainTokens } from '../../hooks/useChainTokens'
import { usePolymarketTopMarkets } from '../../hooks/usePolymarketSearch'
import './PolymarketTickerCrawler.css'

function PolymarketTickerCrawler({ onSelectMarket, limit = 12 }) {
  const { capabilities } = useChainTokens()
  const polymarketSidebetsEnabled = Boolean(capabilities?.polymarketSidebets)
  const { results } = usePolymarketTopMarkets({ limit })

  if (!polymarketSidebetsEnabled || !results?.length) return null

  const items = results
    .map((event) => {
      const market = event?.markets?.[0]
      const title = event?.title || market?.question || market?.label
      if (!market || !title) return null
      return { market, title }
    })
    .filter(Boolean)

  if (!items.length) return null

  const renderGroup = (clone) => (
    <ul className="pm-ticker-group" aria-hidden={clone || undefined}>
      <li className="pm-ticker-label">Polymarket</li>
      {items.map((item, index) => (
        <li key={`${clone ? 'clone' : 'item'}-${index}-${item.market.conditionId}`}>
          <button
            type="button"
            className="pm-ticker-item"
            tabIndex={clone ? -1 : undefined}
            onClick={() => onSelectMarket?.(item.market)}
          >
            {item.title}
          </button>
        </li>
      ))}
    </ul>
  )

  return (
    <section className="pm-ticker" aria-label="Polymarket ticker crawler">
      <div className="pm-ticker-track">
        {renderGroup(false)}
        {renderGroup(true)}
      </div>
    </section>
  )
}

export default PolymarketTickerCrawler
