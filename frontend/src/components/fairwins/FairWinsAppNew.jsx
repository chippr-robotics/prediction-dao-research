import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWeb3 } from '../../hooks/useWeb3'
import { useRoles } from '../../hooks/useRoles'
import { useDataFetcher } from '../../hooks/useDataFetcher'
import useFuseSearch from '../../hooks/useFuseSearch'
import { useWalletTransactions } from '../../hooks/useWalletManagement'
import { useNotification } from '../../hooks/useUI'
import { getViewPreference, setViewPreference, VIEW_MODES } from '../../utils/viewPreference'
import { getSubcategoriesForCategory } from '../../config/subcategories'
import { buyMarketShares, estimateBuyGas } from '../../utils/blockchainService'
import SidebarNav from './SidebarNav'
import HeaderBar from './HeaderBar'
import MarketHeroCard from './MarketHeroCard'
import CategoryRow from './CategoryRow'
import MarketGrid from './MarketGrid'
import CompactMarketView from './CompactMarketView'
import ViewToggle from './ViewToggle'
import SwapPanel from './SwapPanel'
import BalanceDisplay from './BalanceDisplay'
import BalanceChart from './BalanceChart'
import Dashboard from './Dashboard'
import MarketsTable from './MarketsTable'
import TokenMintTab from './TokenMintTab'
import ClearPathTab from './ClearPathTab'
import CorrelatedMarketsModal from './CorrelatedMarketsModal'
import MarketModal from './MarketModal'
import PerpetualFuturesModal from './PerpetualFuturesModal'
import WeatherMarketMap from './WeatherMarketMap'
import SearchBar from '../ui/SearchBar'
import SubcategoryFilter from './SubcategoryFilter'
import LoadingScreen from '../ui/LoadingScreen'
import './FairWinsAppNew.css'

function FairWinsAppNew({ onConnect, onDisconnect }) {
  const { account, isConnected } = useWeb3()
  const { roles, ROLES } = useRoles()
  const { getMarkets } = useDataFetcher()
  const { signer } = useWalletTransactions()
  const { showNotification } = useNotification()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedCategory, setSelectedCategory] = useState('dashboard')
  const [markets, setMarkets] = useState([])
  const [selectedMarket, setSelectedMarket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('endTime') // 'endTime', 'marketValue', 'volume24h', 'activity', 'popularity', 'probability', 'category'
  const [searchQuery, setSearchQuery] = useState('') // Search query state
  const [viewMode, setViewMode] = useState(() => getViewPreference()) // View mode: grid or compact
  const [selectedSubcategories, setSelectedSubcategories] = useState([]) // Subcategory filter state
  const [showHero, setShowHero] = useState(false) // Hero view state
  const [showTokenBuilder, setShowTokenBuilder] = useState(false) // Token builder state
  const [showFilters, setShowFilters] = useState(false) // Collapsible filters state
  const [showPerpetualsModal, setShowPerpetualsModal] = useState(false) // Perpetual futures modal state
  const heroBackButtonRef = useRef(null)
  const lastFocusedElementRef = useRef(null)
  
  // TokenMint state - kept for TokenMintTab display
  const [tokens, setTokens] = useState([])
  const [tokenLoading, setTokenLoading] = useState(false)

  // Handle URL query parameters for category
  useEffect(() => {
    const categoryParam = searchParams.get('category')
    if (categoryParam && categoryParam !== selectedCategory) {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      setSelectedCategory(categoryParam)
    }
  }, [searchParams, selectedCategory])

  const loadMarkets = useCallback(async () => {
    try {
      setLoading(true)
      await new Promise(resolve => setTimeout(resolve, 500))
      const allMarkets = await getMarkets()
      setMarkets(allMarkets)
      setLoading(false)
    } catch (error) {
      console.error('Error loading markets:', error)
      setLoading(false)
    }
  }, [getMarkets])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadMarkets()
  }, [loadMarkets])

  const categories = [
    { id: 'sports', name: 'Sports', icon: '⚽' },
    { id: 'politics', name: 'Politics', icon: '🏛️' },
    { id: 'finance', name: 'Finance', icon: '💰' },
    { id: 'tech', name: 'Tech', icon: '💻' },
    { id: 'crypto', name: 'Crypto', icon: '₿' },
    { id: 'pop-culture', name: 'Pop Culture', icon: '🎬' },
    { id: 'weather', name: 'Weather', icon: '🌤️' }
  ]

  const getMarketsByCategory = () => {
    const grouped = {}
    categories.forEach(cat => {
      grouped[cat.id] = markets.filter(m => m.category === cat.id)
    })
    return grouped
  }

  const handleCategoryChange = (categoryId) => {
    // Handle special navigation categories
    if (categoryId === 'tokenmint') {
      navigate('/tokenmint')
      return
    }
    if (categoryId === 'clearpath') {
      navigate('/clearpath')
      return
    }
    if (categoryId === 'perpetuals') {
      setShowPerpetualsModal(true)
      return
    }

    setSelectedCategory(categoryId)
    // Clear search when changing category
    setSearchQuery('')
    // Clear subcategory filters when changing category
    setSelectedSubcategories([])
    // Close hero when changing category
    setShowHero(false)
    setSelectedMarket(null)
    // Scroll to top when changing category
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSearchChange = (query) => {
    setSearchQuery(query)
  }

  const handleViewChange = (newViewMode) => {
    setViewMode(newViewMode)
    setViewPreference(newViewMode)
  }

  const handleMarketClick = (market) => {
    // Store the currently focused element
    lastFocusedElementRef.current = document.activeElement
    setSelectedMarket(market)
    setShowHero(true) // Open hero view when clicking a market
    // Scroll to top to show hero
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleTrade = async (tradeData) => {
    // Check wallet connection
    if (!isConnected || !signer) {
      showNotification('Please connect your wallet to trade', 'error', 5000)
      return
    }

    // Validate trade data
    if (!tradeData.market?.id) {
      showNotification('Invalid market data', 'error', 5000)
      return
    }

    if (!tradeData.amount || tradeData.amount <= 0) {
      showNotification('Invalid trade amount', 'error', 5000)
      return
    }

    try {
      const marketId = tradeData.market.id
      const outcome = tradeData.type === 'PASS' // true for YES/PASS, false for NO/FAIL
      const amount = tradeData.amount.toString()

      // Show notification that transaction is being prepared
      showNotification('Preparing transaction...', 'info', 3000)

      // Estimate gas (optional, for better UX)
      try {
        const gasEstimate = await estimateBuyGas(signer, marketId, outcome, amount)
        console.log('Estimated gas cost:', gasEstimate, 'ETC')
      } catch (gasError) {
        console.warn('Could not estimate gas:', gasError)
      }

      // Execute the transaction
      showNotification('Please confirm the transaction in your wallet', 'info', 5000)

      const receipt = await buyMarketShares(signer, marketId, outcome, amount)

      // Show success notification with transaction hash
      showNotification(
        `Trade successful! ${tradeData.amount} ETC for ${tradeData.type} shares`,
        'success',
        7000
      )

      console.log('Transaction receipt:', receipt)

      // Optionally refresh market data
      await loadMarkets()

    } catch (error) {
      console.error('Trade error:', error)

      // Show user-friendly error message
      const errorMessage = error.message || 'Transaction failed'
      showNotification(errorMessage, 'error', 7000)
    }
  }

  const handleCloseHero = () => {
    setShowHero(false)
    setSelectedMarket(null)
    // Return focus to the last focused element
    if (lastFocusedElementRef.current) {
      lastFocusedElementRef.current.focus()
    }
  }

  const handleOpenIndividualMarket = (market) => {
    // When opening an individual market from a correlated group,
    // we want to show the MarketModal instead of CorrelatedMarketsModal
    // To do this, we create a copy of the market without the correlationGroupId
    const individualMarket = { ...market, correlationGroupId: null }
    setShowHero(false) // Close current modal
    // Use setTimeout to ensure state updates before reopening
    setTimeout(() => {
      setSelectedMarket(individualMarket)
      setShowHero(true)
    }, 0)
  }

  const handleTokenClick = (token) => {
    // Handle token click - could open a detail modal or navigate
    console.log('Token clicked:', token)
  }

  // Handle subcategory toggle - currently unused but kept for future feature
  // const handleSubcategoryToggle = useCallback((subcategoryId) => {
  //   setSelectedSubcategories(prev => {
  //     if (prev.includes(subcategoryId)) {
  //       // Remove subcategory
  //       return prev.filter(id => id !== subcategoryId)
  //     } else {
  //       // Add subcategory
  //       return [...prev, subcategoryId]
  //     }
  //   })
  // }, [])

  const handleScanMarket = (marketId) => {
    // Navigate directly to market page
    const market = markets.find(m => m.id === parseInt(marketId))
    if (market) {
      navigate(`/market/${marketId}`)
    } else {
      alert(`Market with ID ${marketId} not found`)
    }
  }

  // TokenMint handlers
  const loadUserTokens = useCallback(async () => {
    if (!account || !isConnected) {
      setTokens([])
      return
    }
    
    try {
      setTokenLoading(true)
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const mockTokens = [
        {
          tokenId: 1,
          tokenType: 0,
          tokenAddress: '0x1234567890123456789012345678901234567890',
          owner: account,
          name: 'Demo Token',
          symbol: 'DEMO',
          metadataURI: 'ipfs://QmDemo123',
          createdAt: Math.floor(Date.now() / 1000) - 86400 * 7,
          listedOnETCSwap: true,
          isBurnable: true,
          isPausable: false
        },
        {
          tokenId: 2,
          tokenType: 1,
          tokenAddress: '0x0987654321098765432109876543210987654321',
          owner: account,
          name: 'Demo NFT Collection',
          symbol: 'DNFT',
          metadataURI: 'ipfs://QmNFTBase/',
          createdAt: Math.floor(Date.now() / 1000) - 86400 * 3,
          listedOnETCSwap: false,
          isBurnable: false,
          isPausable: false
        }
      ]
      
      setTokens(mockTokens)
      setTokenLoading(false)
    } catch (error) {
      console.error('Error loading tokens:', error)
      setTokenLoading(false)
    }
  }, [account, isConnected])

  // Load user tokens when account changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadUserTokens()
  }, [loadUserTokens])

  // Convert roles array to role names for sidebar compatibility
  const userRoleNames = useMemo(() => {
    return roles.map(role => {
      // Map ROLES.CLEARPATH_USER to 'CLEARPATH_USER' string, etc.
      if (role === ROLES.CLEARPATH_USER) return 'CLEARPATH_USER'
      if (role === ROLES.TOKENMINT) return 'TOKENMINT_ROLE'
      if (role === ROLES.MARKET_MAKER) return 'MARKET_MAKER'
      if (role === ROLES.ADMIN) return 'ADMIN'
      return role
    })
  }, [roles, ROLES])

  // Markets by category - currently unused but available for future features
  // const marketsByCategory = getMarketsByCategory()

  // Memoize trending markets to avoid recalculation on every render
  const trendingMarkets = useMemo(() => {
    const getSafeLiquidity = (value) => {
      const parsed = parseFloat(value)
      return Number.isNaN(parsed) ? 0 : parsed
    }
    return [...markets].sort((a, b) => {
      return getSafeLiquidity(b.totalLiquidity) - getSafeLiquidity(a.totalLiquidity)
    })
  }, [markets])

  // Memoize category-filtered markets
  const categoryFilteredMarkets = useMemo(() => {
    return markets.filter(m => m.category === selectedCategory)
  }, [markets, selectedCategory])

  // Apply subcategory filtering
  const subcategoryFilteredMarkets = useMemo(() => {
    // If no subcategories selected, return all category markets
    if (selectedSubcategories.length === 0) {
      return categoryFilteredMarkets
    }
    // Filter by selected subcategories
    return categoryFilteredMarkets.filter(m => 
      selectedSubcategories.includes(m.subcategory)
    )
  }, [categoryFilteredMarkets, selectedSubcategories])

  // Apply Fuse.js search to subcategory-filtered markets
  const searchFilteredMarkets = useFuseSearch(subcategoryFilteredMarkets, searchQuery)

  // Comparison function for sorting markets
  const compareMarkets = useCallback((a, b, useDefaultSort = false) => {
    switch (sortBy) {
      case 'endTime':
        return new Date(a.tradingEndTime) - new Date(b.tradingEndTime)
      case 'marketValue':
        return parseFloat(b.totalLiquidity) - parseFloat(a.totalLiquidity)
      case 'volume24h':
        return parseFloat(b.volume24h || 0) - parseFloat(a.volume24h || 0)
      case 'activity':
        return (b.tradesCount ?? 0) - (a.tradesCount ?? 0)
      case 'popularity':
        return (b.uniqueTraders ?? 0) - (a.uniqueTraders ?? 0)
      case 'probability':
        return parseFloat(b.passTokenPrice || 0) - parseFloat(a.passTokenPrice || 0)
      case 'category':
        return a.category.localeCompare(b.category)
      default:
        // For grouped markets, default to sorting by probability to show most likely outcomes first
        return useDefaultSort ? parseFloat(b.passTokenPrice || 0) - parseFloat(a.passTokenPrice || 0) : 0
    }
  }, [sortBy])

  // Get markets for current category with sorting and grouping
  const getFilteredAndSortedMarkets = useCallback(() => {
    // Use searchFilteredMarkets for specific categories
    const filteredMarkets = searchFilteredMarkets
    
    // Group markets by correlation
    const grouped = {}
    const ungrouped = []
    
    filteredMarkets.forEach(market => {
      if (market.correlationGroupId) {
        if (!grouped[market.correlationGroupId]) {
          grouped[market.correlationGroupId] = []
        }
        grouped[market.correlationGroupId].push(market)
      } else {
        ungrouped.push(market)
      }
    })
    
    // Flatten grouped markets
    const groupedMarkets = []
    Object.keys(grouped).forEach(groupId => {
      // Sort grouped markets based on the selected sort option.
      // If no specific sort is selected, fall back to sorting by pass token price
      // (descending) to show the most likely outcomes first. Grouped markets represent
      // mutually exclusive outcomes, so displaying them by probability by default
      // helps users understand the market sentiment while still respecting explicit
      // sort choices.
      const sortedGroup = [...grouped[groupId]].sort((a, b) => compareMarkets(a, b, true))
      groupedMarkets.push(...sortedGroup)
    })
    
    // Sort ungrouped markets based on selected sort option
    const sortedUngrouped = [...ungrouped].sort((a, b) => compareMarkets(a, b, false))
    
    // Return grouped markets first, then ungrouped markets
    return [...groupedMarkets, ...sortedUngrouped]
  }, [searchFilteredMarkets, compareMarkets])

  if (loading) {
    return (
      <div className="fairwins-app-new">
        <SidebarNav 
          selectedCategory={selectedCategory}
          onCategoryChange={handleCategoryChange}
          userRoles={userRoleNames}
        />
        <HeaderBar 
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          isConnected={isConnected}
          account={account}
        />
        <main className="main-canvas">
          <LoadingScreen 
            visible={true} 
            text="Loading markets"
            inline
            size="large"
          />
        </main>
      </div>
    )
  }

  return (
    <div className="fairwins-app-new">
      <SidebarNav 
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
        userRoles={userRoleNames}
      />
      
      <HeaderBar 
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        isConnected={isConnected}
        account={account}
        onScanMarket={handleScanMarket}
      />

      <main className="main-canvas">
        <div className="unified-view">
          {/* Correlated Markets Modal - For correlation groups */}
          <CorrelatedMarketsModal
            isOpen={showHero && selectedMarket && selectedMarket.correlationGroupId}
            onClose={handleCloseHero}
            market={selectedMarket}
            correlatedMarkets={selectedMarket?.correlationGroupId ? markets.filter(m => m.correlationGroupId === selectedMarket.correlationGroupId) : []}
            onTrade={handleTrade}
            onOpenMarket={handleOpenIndividualMarket}
          />

          {/* Market Modal - For individual markets (non-correlated) */}
          <MarketModal
            isOpen={showHero && selectedMarket && !selectedMarket.correlationGroupId}
            onClose={handleCloseHero}
            market={selectedMarket}
            onTrade={handleTrade}
          />

          {/* Perpetual Futures Modal */}
          <PerpetualFuturesModal
            isOpen={showPerpetualsModal}
            onClose={() => setShowPerpetualsModal(false)}
          />

          {/* Primary Grid View - Always visible unless hero is open */}
          {!showHero && (
            <>
              {selectedCategory === 'dashboard' ? (
                /* Dashboard View - Landing Page */
                <Dashboard />
              ) : selectedCategory === 'clearpath' ? (
                /* ClearPath View - DAO Governance */
                <ClearPathTab />
              ) : selectedCategory === 'tokenmint' ? (
                /* TokenMint View - Token Management */
                <TokenMintTab 
                  tokens={tokens}
                  loading={tokenLoading}
                  onTokenClick={handleTokenClick}
                  onCreateToken={() => setShowTokenBuilder(true)}
                />
              ) : selectedCategory === 'all-table' ? (
                /* All Markets Table View - Power User Screen */
                <MarketsTable 
                  markets={markets}
                  onMarketClick={handleMarketClick}
                />
              ) : selectedCategory === 'swap' ? (
                /* Swap Panel View */
                <div className="swap-view-container">
                  <BalanceDisplay />
                  <SwapPanel />
                  <BalanceChart />
                </div>
              ) : selectedCategory === 'trending' ? (
                /* Trending View - Show all markets sorted by activity */
                <div className="grid-view-container">
                  <div className="grid-controls">
                    <div className="grid-header">
                      <h2>🔥 Trending Markets</h2>
                      <span className="market-count">
                        ({trendingMarkets.length} markets)
                      </span>
                    </div>
                    <ViewToggle 
                      currentView={viewMode}
                      onViewChange={handleViewChange}
                    />
                  </div>
                  {viewMode === VIEW_MODES.GRID ? (
                    <MarketGrid 
                      markets={trendingMarkets}
                      onMarketClick={handleMarketClick}
                      selectedMarketId={selectedMarket?.id}
                      loading={loading}
                    />
                  ) : (
                    <CompactMarketView 
                      markets={trendingMarkets}
                      onMarketClick={handleMarketClick}
                      loading={loading}
                      selectedCategory={selectedCategory}
                    />
                  )}
                </div>
              ) : selectedCategory === 'weather' ? (
                /* Weather View - Show markets on H3 map */
                <div className="grid-view-container">
                  <div className="grid-controls">
                    <div className="grid-header">
                      <h2>🌤️ Weather Markets</h2>
                      <span className="market-count">
                        ({searchFilteredMarkets.length} markets)
                      </span>
                    </div>
                    <ViewToggle
                      currentView={viewMode}
                      onViewChange={handleViewChange}
                    />
                  </div>

                  {/* Weather Market Map */}
                  <WeatherMarketMap
                    markets={searchFilteredMarkets}
                    onMarketClick={handleMarketClick}
                    selectedMarket={selectedMarket}
                    loading={loading}
                    height="450px"
                  />

                  {/* Also show grid/compact view below the map */}
                  <div className="weather-markets-list">
                    <h3>All Weather Markets</h3>
                    {viewMode === VIEW_MODES.GRID ? (
                      <MarketGrid
                        markets={getFilteredAndSortedMarkets()}
                        onMarketClick={handleMarketClick}
                        selectedMarketId={selectedMarket?.id}
                        loading={loading}
                      />
                    ) : (
                      <CompactMarketView
                        markets={getFilteredAndSortedMarkets()}
                        onMarketClick={handleMarketClick}
                        loading={loading}
                        selectedCategory={selectedCategory}
                      />
                    )}
                  </div>
                </div>
              ) : (
                /* Full Grid View for specific category */
            <div className="grid-view-container">
              <div className="grid-controls">
                {/* Main header row - always visible */}
                <div className="grid-header-main">
                  <div className="grid-header-left">
                    <h2>
                      {categories.find(c => c.id === selectedCategory)?.icon}{' '}
                      {categories.find(c => c.id === selectedCategory)?.name}
                    </h2>
                    <span className="market-count">
                      ({searchFilteredMarkets.length})
                    </span>
                  </div>
                  <div className="grid-header-center">
                    <SearchBar 
                      value={searchQuery}
                      onChange={handleSearchChange}
                      placeholder="Search markets..."
                      ariaLabel={`Search ${categories.find(c => c.id === selectedCategory)?.name} markets`}
                    />
                  </div>
                  <div className="grid-header-right">
                    <button 
                      className="filter-toggle-btn"
                      onClick={() => setShowFilters(!showFilters)}
                      aria-label={showFilters ? 'Hide filters' : 'Show filters'}
                      aria-expanded={showFilters}
                    >
                      {showFilters ? '▲' : '▼'} Filters
                    </button>
                    <ViewToggle 
                      currentView={viewMode}
                      onViewChange={handleViewChange}
                    />
                  </div>
                </div>
                {/* Collapsible filters row */}
                {showFilters && (
                  <div className="grid-filters-collapsible">
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
                        <option value="volume24h">Volume (24h)</option>
                        <option value="activity">Activity (Trades)</option>
                        <option value="popularity">Popularity (Traders)</option>
                        <option value="probability">Probability (YES%)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
                  {viewMode === VIEW_MODES.GRID ? (
                    <MarketGrid 
                      markets={getFilteredAndSortedMarkets()}
                      onMarketClick={handleMarketClick}
                      selectedMarketId={selectedMarket?.id}
                      loading={loading}
                    />
                  ) : (
                    <CompactMarketView 
                      markets={getFilteredAndSortedMarkets()}
                      onMarketClick={handleMarketClick}
                      loading={loading}
                      selectedCategory={selectedCategory}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default FairWinsAppNew
