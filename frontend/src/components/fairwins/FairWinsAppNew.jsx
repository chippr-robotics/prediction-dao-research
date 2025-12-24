import { useState, useEffect, useCallback } from 'react'
import { useWeb3 } from '../../hooks/useWeb3'
import SidebarNav from './SidebarNav'
import HeaderBar from './HeaderBar'
import MarketGrid from './MarketGrid'
import MarketHeroCard from './MarketHeroCard'
import HorizontalMarketScroller from './HorizontalMarketScroller'
import './FairWinsAppNew.css'

// Mock market data - matches existing MarketTrading data structure
const getMockMarkets = () => [
  {
    id: 0,
    proposalTitle: 'NFL: Chiefs win Super Bowl 2025',
    description: 'Will the Kansas City Chiefs win the Super Bowl in the 2025 season?',
    category: 'sports',
    tags: ['nfl', 'football', 'championship'],
    passTokenPrice: '0.65',
    failTokenPrice: '0.35',
    totalLiquidity: '12500',
    tradingEndTime: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 1,
    proposalTitle: 'NBA: Lakers reach playoffs',
    description: 'Will the Los Angeles Lakers make it to the NBA playoffs this season?',
    category: 'sports',
    tags: ['nba', 'basketball', 'playoffs'],
    passTokenPrice: '0.72',
    failTokenPrice: '0.28',
    totalLiquidity: '8900',
    tradingEndTime: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 2,
    proposalTitle: 'Premier League: Arsenal wins title',
    description: 'Will Arsenal FC win the Premier League title this season?',
    category: 'sports',
    tags: ['soccer', 'premier-league', 'championship'],
    passTokenPrice: '0.48',
    failTokenPrice: '0.52',
    totalLiquidity: '15200',
    tradingEndTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 3,
    proposalTitle: 'World Cup: Brazil reaches final',
    description: 'Will Brazil reach the finals of the next World Cup?',
    category: 'sports',
    tags: ['soccer', 'world-cup', 'international'],
    passTokenPrice: '0.58',
    failTokenPrice: '0.42',
    totalLiquidity: '21000',
    tradingEndTime: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 4,
    proposalTitle: 'US: Democrats win House 2024',
    description: 'Will the Democratic Party control the House of Representatives after the 2024 election?',
    category: 'politics',
    tags: ['election', 'us-politics', 'congress'],
    passTokenPrice: '0.51',
    failTokenPrice: '0.49',
    totalLiquidity: '32000',
    tradingEndTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 5,
    proposalTitle: 'UK: Labour wins next election',
    description: 'Will the Labour Party win the next UK general election?',
    category: 'politics',
    tags: ['election', 'uk-politics', 'parliament'],
    passTokenPrice: '0.67',
    failTokenPrice: '0.33',
    totalLiquidity: '18500',
    tradingEndTime: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 6,
    proposalTitle: 'EU: New climate policy passes',
    description: 'Will the European Union pass comprehensive new climate legislation this year?',
    category: 'politics',
    tags: ['policy', 'climate', 'environment'],
    passTokenPrice: '0.73',
    failTokenPrice: '0.27',
    totalLiquidity: '9800',
    tradingEndTime: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 7,
    proposalTitle: 'Federal Reserve rate cut Q1 2025',
    description: 'Will the Federal Reserve cut interest rates in Q1 2025?',
    category: 'finance',
    tags: ['economy', 'monetary-policy', 'fed'],
    passTokenPrice: '0.44',
    failTokenPrice: '0.56',
    totalLiquidity: '27500',
    tradingEndTime: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 8,
    proposalTitle: 'ETH reaches $5000 by Q2 2025',
    description: 'Will Ethereum (ETH) reach $5000 USD by the end of Q2 2025?',
    category: 'crypto',
    tags: ['crypto', 'ethereum', 'price'],
    passTokenPrice: '0.42',
    failTokenPrice: '0.58',
    totalLiquidity: '19200',
    tradingEndTime: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 9,
    proposalTitle: 'AI model surpasses GPT-4 benchmark',
    description: 'Will a new AI model surpass GPT-4 on key benchmarks this year?',
    category: 'tech',
    tags: ['ai', 'technology', 'benchmark'],
    passTokenPrice: '0.68',
    failTokenPrice: '0.32',
    totalLiquidity: '14700',
    tradingEndTime: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 10,
    proposalTitle: 'Tesla delivers 2M vehicles in 2024',
    description: 'Will Tesla deliver 2 million vehicles in 2024?',
    category: 'finance',
    tags: ['automotive', 'tesla', 'production'],
    passTokenPrice: '0.55',
    failTokenPrice: '0.45',
    totalLiquidity: '11300',
    tradingEndTime: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 11,
    proposalTitle: 'Bitcoin reaches $100K in 2025',
    description: 'Will Bitcoin reach $100,000 USD in 2025?',
    category: 'crypto',
    tags: ['bitcoin', 'crypto', 'price'],
    passTokenPrice: '0.59',
    failTokenPrice: '0.41',
    totalLiquidity: '45600',
    tradingEndTime: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 12,
    proposalTitle: 'Apple Vision Pro sells 1M units',
    description: 'Will Apple sell 1 million Vision Pro units in its first year?',
    category: 'tech',
    tags: ['apple', 'vr', 'hardware'],
    passTokenPrice: '0.38',
    failTokenPrice: '0.62',
    totalLiquidity: '8700',
    tradingEndTime: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 13,
    proposalTitle: 'Taylor Swift Grammy Album of the Year',
    description: 'Will Taylor Swift win Album of the Year at the next Grammy Awards?',
    category: 'pop-culture',
    tags: ['music', 'awards', 'grammy'],
    passTokenPrice: '0.71',
    failTokenPrice: '0.29',
    totalLiquidity: '6200',
    tradingEndTime: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  },
  {
    id: 14,
    proposalTitle: 'New Marvel movie breaks $1B box office',
    description: 'Will the next Marvel Studios film surpass $1 billion at the box office?',
    category: 'pop-culture',
    tags: ['movies', 'box-office', 'marvel'],
    passTokenPrice: '0.64',
    failTokenPrice: '0.36',
    totalLiquidity: '9100',
    tradingEndTime: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'Active'
  }
]

function FairWinsAppNew({ onConnect, onDisconnect, onBack }) {
  const { account, isConnected } = useWeb3()
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [markets, setMarkets] = useState([])
  const [selectedMarket, setSelectedMarket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('grid') // 'grid' or 'focus'

  const loadMarkets = useCallback(async () => {
    try {
      setLoading(true)
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500))
      setMarkets(getMockMarkets())
      setLoading(false)
    } catch (error) {
      console.error('Error loading markets:', error)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMarkets()
  }, [loadMarkets])

  const filterMarketsByCategory = (categoryId) => {
    if (categoryId === 'all') {
      return markets
    }
    if (categoryId === 'trending') {
      // Return top markets by liquidity
      return [...markets].sort((a, b) => 
        parseFloat(b.totalLiquidity) - parseFloat(a.totalLiquidity)
      ).slice(0, 8)
    }
    return markets.filter(m => m.category === categoryId)
  }

  const getRelatedMarkets = (market) => {
    if (!market) return []
    return markets
      .filter(m => m.category === market.category && m.id !== market.id)
      .slice(0, 6)
  }

  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId)
    setSelectedMarket(null)
    setViewMode('grid')
  }

  const handleMarketClick = (market) => {
    setSelectedMarket(market)
    setViewMode('focus')
    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleTrade = (tradeData) => {
    alert(`Trading functionality requires deployed contracts.

Trade Details:
- Market: ${tradeData.market.proposalTitle}
- Type: ${tradeData.type}
- Amount: ${tradeData.amount} ETC

This would submit an encrypted position through the PrivacyCoordinator contract.`)
  }

  const filteredMarkets = filterMarketsByCategory(selectedCategory)
  const relatedMarkets = getRelatedMarkets(selectedMarket)

  return (
    <div className="fairwins-app-new">
      <SidebarNav 
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
      />
      
      <HeaderBar 
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onBack={onBack}
        isConnected={isConnected}
        account={account}
      />

      <main className="main-canvas">
        {viewMode === 'grid' ? (
          <div className="grid-view">
            <div className="view-header">
              <h2>
                {selectedCategory === 'all' && 'All Markets'}
                {selectedCategory === 'trending' && 'Trending Markets'}
                {selectedCategory === 'politics' && 'Politics Markets'}
                {selectedCategory === 'sports' && 'Sports Markets'}
                {selectedCategory === 'finance' && 'Finance Markets'}
                {selectedCategory === 'tech' && 'Tech Markets'}
                {selectedCategory === 'pop-culture' && 'Pop Culture Markets'}
                {selectedCategory === 'crypto' && 'Crypto Markets'}
                {selectedCategory === 'other' && 'Other Markets'}
              </h2>
              <p className="view-description">
                Browse and discover prediction markets across various categories
              </p>
            </div>

            <MarketGrid 
              markets={filteredMarkets}
              onMarketClick={handleMarketClick}
              selectedMarketId={selectedMarket?.id}
              loading={loading}
            />
          </div>
        ) : (
          <div className="focus-view">
            <button 
              className="back-to-grid-btn"
              onClick={() => setViewMode('grid')}
              aria-label="Back to market grid"
            >
              ← Back to Markets
            </button>

            <MarketHeroCard 
              market={selectedMarket}
              onTrade={handleTrade}
            />

            {relatedMarkets.length > 0 && (
              <HorizontalMarketScroller 
                title={`More in ${selectedMarket?.category.replace('-', ' ').toUpperCase()}`}
                markets={relatedMarkets}
                onMarketClick={handleMarketClick}
                selectedMarketId={selectedMarket?.id}
              />
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default FairWinsAppNew
