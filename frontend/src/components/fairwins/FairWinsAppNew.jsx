import { useState, useEffect, useCallback, useRef } from 'react'
import { useWeb3 } from '../../hooks/useWeb3'
import SidebarNav from './SidebarNav'
import HeaderBar from './HeaderBar'
import MarketHeroCard from './MarketHeroCard'
import CategoryRow from './CategoryRow'
import MarketGrid from './MarketGrid'
import './FairWinsAppNew.css'

// Extended mock market data with more entries for scrolling demo
const getMockMarkets = () => {
  const baseMarkets = [
    // Sports Markets (8 items for good scrolling)
    {
      id: 0,
      proposalTitle: 'NFL: Chiefs win Super Bowl 2025',
      description: 'Will the Kansas City Chiefs win the Super Bowl in the 2025 season?',
      category: 'sports',
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
      passTokenPrice: '0.58',
      failTokenPrice: '0.42',
      totalLiquidity: '21000',
      tradingEndTime: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 15,
      proposalTitle: 'NHL: Maple Leafs win Stanley Cup',
      description: 'Will the Toronto Maple Leafs win the Stanley Cup this year?',
      category: 'sports',
      passTokenPrice: '0.35',
      failTokenPrice: '0.65',
      totalLiquidity: '7800',
      tradingEndTime: new Date(Date.now() + 85 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 16,
      proposalTitle: 'MLB: Yankees win World Series',
      description: 'Will the New York Yankees win the World Series this year?',
      category: 'sports',
      passTokenPrice: '0.52',
      failTokenPrice: '0.48',
      totalLiquidity: '11200',
      tradingEndTime: new Date(Date.now() + 110 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 17,
      proposalTitle: 'Formula 1: Hamilton wins championship',
      description: 'Will Lewis Hamilton win the F1 World Championship this season?',
      category: 'sports',
      passTokenPrice: '0.41',
      failTokenPrice: '0.59',
      totalLiquidity: '9600',
      tradingEndTime: new Date(Date.now() + 95 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 18,
      proposalTitle: 'Tennis: Djokovic wins Wimbledon',
      description: 'Will Novak Djokovic win Wimbledon this year?',
      category: 'sports',
      passTokenPrice: '0.68',
      failTokenPrice: '0.32',
      totalLiquidity: '6500',
      tradingEndTime: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    
    // Politics Markets (6 items)
    {
      id: 4,
      proposalTitle: 'US: Democrats win House 2024',
      description: 'Will the Democratic Party control the House of Representatives after the 2024 election?',
      category: 'politics',
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
      passTokenPrice: '0.73',
      failTokenPrice: '0.27',
      totalLiquidity: '9800',
      tradingEndTime: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 19,
      proposalTitle: 'Canada: Trudeau resigns in 2025',
      description: 'Will Justin Trudeau resign as Canadian Prime Minister in 2025?',
      category: 'politics',
      passTokenPrice: '0.38',
      failTokenPrice: '0.62',
      totalLiquidity: '5400',
      tradingEndTime: new Date(Date.now() + 145 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 20,
      proposalTitle: 'India: BJP wins majority',
      description: 'Will the BJP win a majority in the next Indian general election?',
      category: 'politics',
      passTokenPrice: '0.63',
      failTokenPrice: '0.37',
      totalLiquidity: '14200',
      tradingEndTime: new Date(Date.now() + 165 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 21,
      proposalTitle: 'Germany: Green coalition forms',
      description: 'Will Germany form a Green-led coalition government?',
      category: 'politics',
      passTokenPrice: '0.55',
      failTokenPrice: '0.45',
      totalLiquidity: '8900',
      tradingEndTime: new Date(Date.now() + 125 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },

    // Finance Markets (7 items)
    {
      id: 7,
      proposalTitle: 'Federal Reserve rate cut Q1 2025',
      description: 'Will the Federal Reserve cut interest rates in Q1 2025?',
      category: 'finance',
      passTokenPrice: '0.44',
      failTokenPrice: '0.56',
      totalLiquidity: '27500',
      tradingEndTime: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 10,
      proposalTitle: 'Tesla delivers 2M vehicles in 2024',
      description: 'Will Tesla deliver 2 million vehicles in 2024?',
      category: 'finance',
      passTokenPrice: '0.55',
      failTokenPrice: '0.45',
      totalLiquidity: '11300',
      tradingEndTime: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 22,
      proposalTitle: 'Apple stock reaches $250',
      description: 'Will Apple stock reach $250 per share by end of Q2 2025?',
      category: 'finance',
      passTokenPrice: '0.62',
      failTokenPrice: '0.38',
      totalLiquidity: '19800',
      tradingEndTime: new Date(Date.now() + 115 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 23,
      proposalTitle: 'Amazon splits stock 20-to-1',
      description: 'Will Amazon announce a 20-to-1 stock split in 2025?',
      category: 'finance',
      passTokenPrice: '0.47',
      failTokenPrice: '0.53',
      totalLiquidity: '8200',
      tradingEndTime: new Date(Date.now() + 135 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 24,
      proposalTitle: 'S&P 500 reaches 6000',
      description: 'Will the S&P 500 index reach 6000 by end of 2025?',
      category: 'finance',
      passTokenPrice: '0.59',
      failTokenPrice: '0.41',
      totalLiquidity: '24700',
      tradingEndTime: new Date(Date.now() + 185 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 25,
      proposalTitle: 'Oil prices below $60/barrel',
      description: 'Will crude oil prices fall below $60 per barrel in 2025?',
      category: 'finance',
      passTokenPrice: '0.36',
      failTokenPrice: '0.64',
      totalLiquidity: '13500',
      tradingEndTime: new Date(Date.now() + 155 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 26,
      proposalTitle: 'Gold reaches $2500/oz',
      description: 'Will gold prices reach $2500 per ounce by mid-2025?',
      category: 'finance',
      passTokenPrice: '0.71',
      failTokenPrice: '0.29',
      totalLiquidity: '16900',
      tradingEndTime: new Date(Date.now() + 105 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },

    // Tech Markets (6 items)
    {
      id: 9,
      proposalTitle: 'AI model surpasses GPT-4 benchmark',
      description: 'Will a new AI model surpass GPT-4 on key benchmarks this year?',
      category: 'tech',
      passTokenPrice: '0.68',
      failTokenPrice: '0.32',
      totalLiquidity: '14700',
      tradingEndTime: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 12,
      proposalTitle: 'Apple Vision Pro sells 1M units',
      description: 'Will Apple sell 1 million Vision Pro units in its first year?',
      category: 'tech',
      passTokenPrice: '0.38',
      failTokenPrice: '0.62',
      totalLiquidity: '8700',
      tradingEndTime: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 27,
      proposalTitle: 'Meta releases AGI prototype',
      description: 'Will Meta release an AGI prototype in 2025?',
      category: 'tech',
      passTokenPrice: '0.29',
      failTokenPrice: '0.71',
      totalLiquidity: '21400',
      tradingEndTime: new Date(Date.now() + 175 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 28,
      proposalTitle: 'SpaceX Mars mission launches',
      description: 'Will SpaceX launch a crewed mission to Mars in 2025?',
      category: 'tech',
      passTokenPrice: '0.22',
      failTokenPrice: '0.78',
      totalLiquidity: '18900',
      tradingEndTime: new Date(Date.now() + 195 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 29,
      proposalTitle: 'Google releases Gemini 2.0',
      description: 'Will Google release Gemini 2.0 AI model in 2025?',
      category: 'tech',
      passTokenPrice: '0.74',
      failTokenPrice: '0.26',
      totalLiquidity: '12300',
      tradingEndTime: new Date(Date.now() + 85 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 30,
      proposalTitle: 'Samsung foldable phone dominates',
      description: 'Will Samsung foldables outsell traditional flagships in 2025?',
      category: 'tech',
      passTokenPrice: '0.43',
      failTokenPrice: '0.57',
      totalLiquidity: '7600',
      tradingEndTime: new Date(Date.now() + 125 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },

    // Crypto Markets (7 items)
    {
      id: 8,
      proposalTitle: 'ETH reaches $5000 by Q2 2025',
      description: 'Will Ethereum (ETH) reach $5000 USD by the end of Q2 2025?',
      category: 'crypto',
      passTokenPrice: '0.42',
      failTokenPrice: '0.58',
      totalLiquidity: '19200',
      tradingEndTime: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 11,
      proposalTitle: 'Bitcoin reaches $100K in 2025',
      description: 'Will Bitcoin reach $100,000 USD in 2025?',
      category: 'crypto',
      passTokenPrice: '0.59',
      failTokenPrice: '0.41',
      totalLiquidity: '45600',
      tradingEndTime: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 31,
      proposalTitle: 'Solana surpasses ETH in TPS',
      description: 'Will Solana maintain higher transactions per second than Ethereum?',
      category: 'crypto',
      passTokenPrice: '0.81',
      failTokenPrice: '0.19',
      totalLiquidity: '14200',
      tradingEndTime: new Date(Date.now() + 70 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 32,
      proposalTitle: 'Coinbase launches Layer 2',
      description: 'Will Coinbase successfully launch its own Layer 2 network?',
      category: 'crypto',
      passTokenPrice: '0.66',
      failTokenPrice: '0.34',
      totalLiquidity: '11800',
      tradingEndTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 33,
      proposalTitle: 'Cardano smart contracts surge',
      description: 'Will Cardano smart contract usage increase 10x in 2025?',
      category: 'crypto',
      passTokenPrice: '0.48',
      failTokenPrice: '0.52',
      totalLiquidity: '9300',
      tradingEndTime: new Date(Date.now() + 140 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 34,
      proposalTitle: 'Polygon integrates zkEVM fully',
      description: 'Will Polygon fully integrate and scale zkEVM technology?',
      category: 'crypto',
      passTokenPrice: '0.72',
      failTokenPrice: '0.28',
      totalLiquidity: '16700',
      tradingEndTime: new Date(Date.now() + 110 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 35,
      proposalTitle: 'DeFi TVL exceeds $200B',
      description: 'Will total value locked in DeFi exceed $200 billion in 2025?',
      category: 'crypto',
      passTokenPrice: '0.57',
      failTokenPrice: '0.43',
      totalLiquidity: '22100',
      tradingEndTime: new Date(Date.now() + 160 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },

    // Pop Culture Markets (6 items)
    {
      id: 13,
      proposalTitle: 'Taylor Swift Grammy Album of the Year',
      description: 'Will Taylor Swift win Album of the Year at the next Grammy Awards?',
      category: 'pop-culture',
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
      passTokenPrice: '0.64',
      failTokenPrice: '0.36',
      totalLiquidity: '9100',
      tradingEndTime: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 36,
      proposalTitle: 'Beyoncé announces world tour',
      description: 'Will Beyoncé announce a new world tour in 2025?',
      category: 'pop-culture',
      passTokenPrice: '0.69',
      failTokenPrice: '0.31',
      totalLiquidity: '5800',
      tradingEndTime: new Date(Date.now() + 95 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 37,
      proposalTitle: 'Stranger Things final season',
      description: 'Will Stranger Things final season release in 2025?',
      category: 'pop-culture',
      passTokenPrice: '0.78',
      failTokenPrice: '0.22',
      totalLiquidity: '7400',
      tradingEndTime: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 38,
      proposalTitle: 'Next James Bond revealed',
      description: 'Will the next James Bond actor be officially announced in 2025?',
      category: 'pop-culture',
      passTokenPrice: '0.54',
      failTokenPrice: '0.46',
      totalLiquidity: '8900',
      tradingEndTime: new Date(Date.now() + 105 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    },
    {
      id: 39,
      proposalTitle: 'Barbie sequel greenlit',
      description: 'Will Warner Bros greenlight an official Barbie sequel?',
      category: 'pop-culture',
      passTokenPrice: '0.83',
      failTokenPrice: '0.17',
      totalLiquidity: '6700',
      tradingEndTime: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active'
    }
  ]

  return baseMarkets
}

function FairWinsAppNew({ onConnect, onDisconnect, onBack }) {
  const { account, isConnected } = useWeb3()
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [markets, setMarkets] = useState([])
  const [selectedMarket, setSelectedMarket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('endTime') // 'endTime', 'marketValue', 'category'
  const [showHero, setShowHero] = useState(false) // Control hero visibility
  const heroBackButtonRef = useRef(null)
  const lastFocusedElementRef = useRef(null)

  const loadMarkets = useCallback(async () => {
    try {
      setLoading(true)
      await new Promise(resolve => setTimeout(resolve, 500))
      const allMarkets = getMockMarkets()
      setMarkets(allMarkets)
      // Don't auto-select market anymore - grid is primary view
      setLoading(false)
    } catch (error) {
      console.error('Error loading markets:', error)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMarkets()
  }, [loadMarkets])

  const handleCloseHero = useCallback(() => {
    setShowHero(false)
    setSelectedMarket(null)
    // Return focus to the element that opened the hero
    if (lastFocusedElementRef.current) {
      lastFocusedElementRef.current.focus()
    }
  }, [])

  // Handle Escape key to close hero
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.key === 'Escape' || event.key === 'Esc') && showHero) {
        handleCloseHero()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showHero, handleCloseHero])

  // Manage body scroll lock and focus when hero opens/closes
  useEffect(() => {
    if (showHero) {
      // Prevent body scroll when hero is open
      document.body.style.overflow = 'hidden'
      
      // Move focus to the back button after a short delay to ensure it's rendered
      setTimeout(() => {
        if (heroBackButtonRef.current) {
          heroBackButtonRef.current.focus()
        }
      }, 100)
    } else {
      // Restore body scroll
      document.body.style.overflow = ''
    }

    // Cleanup function
    return () => {
      document.body.style.overflow = ''
    }
  }, [showHero])

  const categories = [
    { id: 'sports', name: 'Sports', icon: '⚽' },
    { id: 'politics', name: 'Politics', icon: '🏛️' },
    { id: 'finance', name: 'Finance', icon: '💰' },
    { id: 'tech', name: 'Tech', icon: '💻' },
    { id: 'crypto', name: 'Crypto', icon: '₿' },
    { id: 'pop-culture', name: 'Pop Culture', icon: '🎬' }
  ]

  const getMarketsByCategory = () => {
    const grouped = {}
    categories.forEach(cat => {
      grouped[cat.id] = markets.filter(m => m.category === cat.id)
    })
    return grouped
  }

  const handleCategoryChange = (categoryId) => {
    setSelectedCategory(categoryId)
    // Close hero when changing category
    setShowHero(false)
    setSelectedMarket(null)
    // Scroll to top when changing category
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleMarketClick = (market) => {
    // Store the currently focused element
    lastFocusedElementRef.current = document.activeElement
    setSelectedMarket(market)
    setShowHero(true) // Open hero view when clicking a market
    // Scroll to top to show hero
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

  const handleScanMarket = (marketId) => {
    // Find the market by ID
    const market = markets.find(m => m.id === parseInt(marketId))
    if (market) {
      handleMarketClick(market)
    } else {
      alert(`Market with ID ${marketId} not found`)
    }
  }

  const marketsByCategory = getMarketsByCategory()

  // Get markets for current category with sorting
  const getFilteredAndSortedMarkets = () => {
    let filteredMarkets = selectedCategory === 'all' 
      ? markets 
      : markets.filter(m => m.category === selectedCategory)
    
    // Sort markets based on selected sort option
    const sortedMarkets = [...filteredMarkets].sort((a, b) => {
      switch (sortBy) {
        case 'endTime':
          return new Date(a.tradingEndTime) - new Date(b.tradingEndTime)
        case 'marketValue':
          return parseFloat(b.totalLiquidity) - parseFloat(a.totalLiquidity)
        case 'category':
          return a.category.localeCompare(b.category)
        default:
          return 0
      }
    })
    
    return sortedMarkets
  }

  if (loading) {
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
          <div className="loading-screen">
            <div className="loading-spinner"></div>
            <p>Loading markets...</p>
          </div>
        </main>
      </div>
    )
  }

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
        onScanMarket={handleScanMarket}
      />

      <main className="main-canvas">
        <div className="unified-view">
          {/* Hero Card - Only shown when showHero is true, as overlay */}
          {showHero && selectedMarket && (
            <div 
              className="hero-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="hero-dialog-title"
            >
              <div className="hero-section">
                <button 
                  ref={heroBackButtonRef}
                  className="hero-back-btn"
                  onClick={handleCloseHero}
                  aria-label="Close hero and return to grid"
                >
                  ← Back to Grid
                </button>
                <h2 id="hero-dialog-title" className="visually-hidden">
                  Market details dialog
                </h2>
                <MarketHeroCard 
                  market={selectedMarket}
                  onTrade={handleTrade}
                />
              </div>
            </div>
          )}

          {/* Primary Grid View - Always visible unless hero is open */}
          {!showHero && (
            <>
              {selectedCategory === 'all' ? (
                /* Category Rows - Each category gets its own horizontally scrolling row */
                <div className="categories-rows-container">
                  {categories.map((category) => {
                    const categoryMarkets = marketsByCategory[category.id]
                    if (categoryMarkets && categoryMarkets.length > 0) {
                      return (
                        <CategoryRow
                          key={category.id}
                          title={category.name}
                          icon={category.icon}
                          markets={categoryMarkets}
                          onMarketClick={handleMarketClick}
                          selectedMarketId={selectedMarket?.id}
                        />
                      )
                    }
                    return null
                  })}
                </div>
              ) : (
                /* Full Grid View for specific category */
                (() => {
                  const selectedCategoryObj = categories.find(c => c.id === selectedCategory)
                  return (
                    <div className="grid-view-container">
                      <div className="grid-controls">
                        <div className="grid-header">
                          <h2>
                            {selectedCategoryObj?.icon}{' '}
                            {selectedCategoryObj?.name} Markets
                          </h2>
                          <span className="market-count">
                            ({getFilteredAndSortedMarkets().length} active markets)
                          </span>
                        </div>
                        <div className="sort-controls">
                          <label htmlFor="sort-select">Sort by:</label>
                          <select 
                            id="sort-select"
                            value={sortBy} 
                            onChange={(e) => setSortBy(e.target.value)}
                            className="sort-select"
                          >
                            <option value="endTime">Ending Time</option>
                            <option value="marketValue">Market Value</option>
                            {selectedCategory === 'all' && (
                              <option value="category">Category</option>
                            )}
                          </select>
                        </div>
                      </div>
                      <MarketGrid 
                        markets={getFilteredAndSortedMarkets()}
                        onMarketClick={handleMarketClick}
                        selectedMarketId={selectedMarket?.id}
                        loading={loading}
                      />
                    </div>
                  )
                })()
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default FairWinsAppNew
