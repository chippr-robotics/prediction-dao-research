import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useWeb3 } from '../../hooks/useWeb3'
import { useRoles } from '../../hooks/useRoles'
import useFuseSearch from '../../hooks/useFuseSearch'
import { getMockMarkets } from '../../utils/mockDataLoader'
import SidebarNav from './SidebarNav'
import HeaderBar from './HeaderBar'
import MarketHeroCard from './MarketHeroCard'
import CorrelatedMarketsModal from './CorrelatedMarketsModal'
import MarketModal from './MarketModal'
import CategoryRow from './CategoryRow'
import MarketGrid from './MarketGrid'
import SwapPanel from './SwapPanel'
import BalanceDisplay from './BalanceDisplay'
import BalanceChart from './BalanceChart'
import Dashboard from './Dashboard'
import MarketsTable from './MarketsTable'
import TokenMintTab from './TokenMintTab'
import TokenMintBuilderModal from './TokenMintBuilderModal'
import TokenMintHeroCard from './TokenMintHeroCard'
import ClearPathTab from './ClearPathTab'
import SearchBar from '../ui/SearchBar'
import './FairWinsAppNew.css'

function FairWinsAppNew({ onConnect, onDisconnect }) {
  const { account, isConnected } = useWeb3()
  const { roles, ROLES } = useRoles()
  const [selectedCategory, setSelectedCategory] = useState('dashboard')
  const [markets, setMarkets] = useState([])
  const [selectedMarket, setSelectedMarket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('endTime') // 'endTime', 'marketValue', 'category'
  const [showHero, setShowHero] = useState(false) // Control hero visibility
  const [searchQuery, setSearchQuery] = useState('') // Search query state
  const heroBackButtonRef = useRef(null)
  const lastFocusedElementRef = useRef(null)
  
  // TokenMint state
  const [tokens, setTokens] = useState([])
  const [selectedToken, setSelectedToken] = useState(null)
  const [showTokenBuilder, setShowTokenBuilder] = useState(false)
  const [tokenLoading, setTokenLoading] = useState(false)

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

  // Manage body scroll lock when hero opens/closes
  useEffect(() => {
    if (showHero) {
      // Prevent body scroll when hero is open
      document.body.style.overflow = 'hidden'
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
    // Clear search when changing category
    setSearchQuery('')
    // Close hero when changing category
    setShowHero(false)
    setSelectedMarket(null)
    // Scroll to top when changing category
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSearchChange = (query) => {
    setSearchQuery(query)
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

This is a transparent market - all trades are publicly visible on the blockchain.`)
  }

  const handleOpenIndividualMarket = (market) => {
    // Create a copy of the market without the correlation group to show individual modal
    const individualMarket = { ...market, correlationGroupId: null }
    setSelectedMarket(individualMarket)
    setShowHero(true)
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

  // TokenMint handlers
  const loadUserTokens = useCallback(async () => {
    if (!account || !isConnected) {
      setTokens([])
      return
    }
    
    try {
      setTokenLoading(true)
      // Simulate loading tokens from contract
      // In production, this would call TokenMintFactory.getOwnerTokens(account)
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Mock tokens for demo
      const mockTokens = [
        {
          tokenId: 1,
          tokenType: 0, // ERC20
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
          tokenType: 1, // ERC721
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

  const handleCreateToken = async (tokenData) => {
    console.log('Creating token:', tokenData)
    alert(`Token creation requires deployed contracts.

Token Details:
- Type: ${tokenData.tokenType}
- Name: ${tokenData.name}
- Symbol: ${tokenData.symbol}
${tokenData.tokenType === 'ERC20' ? `- Initial Supply: ${tokenData.initialSupply}` : ''}
- Metadata URI: ${tokenData.metadataURI || 'None'}
- Features: ${tokenData.isBurnable ? 'Burnable ' : ''}${tokenData.isPausable ? 'Pausable ' : ''}
- List on ETCSwap: ${tokenData.listOnETCSwap ? 'Yes' : 'No'}

This would call TokenMintFactory.create${tokenData.tokenType}() on the blockchain.`)
    
    // In production, this would interact with the TokenMintFactory contract
    // await tokenMintFactory.createERC20(...) or createERC721(...)
    
    // Reload tokens after creation
    await loadUserTokens()
  }

  const handleTokenClick = (token) => {
    setSelectedToken(token)
    setShowHero(true)
  }

  const handleTokenMint = async (tokenId, data) => {
    console.log('Minting tokens:', tokenId, data)
    alert('Mint functionality requires deployed contracts.')
  }

  const handleTokenBurn = async (tokenId, data) => {
    console.log('Burning tokens:', tokenId, data)
    alert('Burn functionality requires deployed contracts.')
  }

  const handleTokenTransfer = async (tokenId, data) => {
    console.log('Transferring tokens:', tokenId, data)
    alert('Transfer functionality requires deployed contracts.')
  }

  const handleUpdateTokenMetadata = async (tokenId, newURI) => {
    console.log('Updating metadata:', tokenId, newURI)
    alert('Metadata update requires deployed contracts.')
  }

  const handleListOnETCSwap = async (tokenId) => {
    console.log('Listing on ETCSwap:', tokenId)
    alert('ETCSwap listing requires deployed contracts.')
  }

  // Load user tokens when account changes
  useEffect(() => {
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

  const marketsByCategory = getMarketsByCategory()

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

  // Apply Fuse.js search to category-filtered markets
  const searchFilteredMarkets = useFuseSearch(categoryFilteredMarkets, searchQuery)

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
      const sortedGroup = [...grouped[groupId]].sort((a, b) => {
        switch (sortBy) {
          case 'endTime':
            return new Date(a.tradingEndTime) - new Date(b.tradingEndTime)
          case 'marketValue':
            return parseFloat(b.totalLiquidity) - parseFloat(a.totalLiquidity)
          case 'category':
            return a.category.localeCompare(b.category)
          default:
            return parseFloat(b.passTokenPrice) - parseFloat(a.passTokenPrice)
        }
      })
      groupedMarkets.push(...sortedGroup)
    })
    
    // Sort ungrouped markets based on selected sort option
    const sortedUngrouped = [...ungrouped].sort((a, b) => {
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
    
    // Return grouped markets first, then ungrouped markets
    return [...groupedMarkets, ...sortedUngrouped]
  }, [searchFilteredMarkets, sortBy])

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
                  </div>
                  <MarketGrid 
                    markets={trendingMarkets}
                    onMarketClick={handleMarketClick}
                    selectedMarketId={selectedMarket?.id}
                    loading={loading}
                  />
                </div>
              ) : (
                /* Full Grid View for specific category */
                <div className="grid-view-container">
                  <div className="grid-controls">
                    <div className="grid-header">
                      <h2>
                        {categories.find(c => c.id === selectedCategory)?.icon}{' '}
                        {categories.find(c => c.id === selectedCategory)?.name} Markets
                      </h2>
                      <span className="market-count">
                        ({searchFilteredMarkets.length} {searchQuery ? 'matching' : 'active'} markets)
                      </span>
                    </div>
                    <div className="search-and-sort-controls">
                      <SearchBar 
                        value={searchQuery}
                        onChange={handleSearchChange}
                        placeholder="Search markets..."
                        ariaLabel={`Search ${categories.find(c => c.id === selectedCategory)?.name} markets`}
                      />
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
                        </select>
                      </div>
                    </div>
                  </div>
                  <MarketGrid 
                    markets={getFilteredAndSortedMarkets()}
                    onMarketClick={handleMarketClick}
                    selectedMarketId={selectedMarket?.id}
                    loading={loading}
                  />
                </div>
              )}
            </>
          )}
          
          {/* TokenMint Builder Modal */}
          <TokenMintBuilderModal 
            isOpen={showTokenBuilder}
            onClose={() => setShowTokenBuilder(false)}
            onCreate={handleCreateToken}
          />
          
          {/* TokenMint Hero Card */}
          {selectedToken && showHero && selectedCategory === 'tokenmint' && (
            <TokenMintHeroCard 
              token={selectedToken}
              onClose={() => {
                setSelectedToken(null)
                setShowHero(false)
              }}
              onMint={handleTokenMint}
              onBurn={handleTokenBurn}
              onTransfer={handleTokenTransfer}
              onListOnETCSwap={handleListOnETCSwap}
            />
          )}
        </div>
      </main>
    </div>
  )
}

export default FairWinsAppNew
