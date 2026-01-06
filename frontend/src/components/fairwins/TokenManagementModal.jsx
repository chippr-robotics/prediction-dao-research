import { useState, useEffect, useRef } from 'react'
import { useWallet, useWeb3 } from '../../hooks'
import './TokenManagementModal.css'

/**
 * TokenManagementModal Component
 *
 * A minimalist modern modal for managing deployed tokens, NFTs, and markets.
 * Features:
 * - Tabbed interface for Tokens, NFTs, and Markets
 * - Clean paginated table (10 items per page)
 * - Info button for viewing on-chain token details
 * - Token management controls (mint, burn, pause, etc.)
 */
function TokenManagementModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('tokens')
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [actionModal, setActionModal] = useState(null)
  const [actionData, setActionData] = useState({})
  const [actionLoading, setActionLoading] = useState(false)
  const [copySuccess, setCopySuccess] = useState(null) // Track which address was copied
  const modalRef = useRef(null)

  // Data states
  const [tokens, setTokens] = useState([])
  const [nfts, setNfts] = useState([])
  const [markets, setMarkets] = useState([])
  const [chainInfo, setChainInfo] = useState(null)

  const { address, isConnected } = useWallet()
  useWeb3() // Initialize Web3 context

  const ITEMS_PER_PAGE = 10

  // Helper function to format camelCase action names
  const formatActionName = (actionName) => {
    // Handle special cases
    const specialCases = {
      'setApprovalForAll': 'Set Approval for All',
      'transferOwnership': 'Transfer Ownership',
      'renounceOwnership': 'Renounce Ownership'
    }
    
    if (specialCases[actionName]) {
      return specialCases[actionName]
    }
    
    // Capitalize first letter
    return actionName.charAt(0).toUpperCase() + actionName.slice(1)
  }

  // Helper function to validate Ethereum address
  const isValidAddress = (address) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address)
  }

  // Helper function to validate action inputs
  const isActionValid = () => {
    if (!actionModal || !selectedItem) return false

    switch (actionModal) {
      case 'mint':
        if (selectedItem.type === 'ERC20') {
          return isValidAddress(actionData.address || '') && actionData.amount && Number(actionData.amount) > 0
        }
        return isValidAddress(actionData.address || '') && actionData.tokenURI && actionData.tokenURI.trim().length > 0
      
      case 'burn':
        return actionData.amount && Number(actionData.amount) > 0
      
      case 'transfer':
        return isValidAddress(actionData.address || '') && actionData.amount && Number(actionData.amount) > 0
      
      case 'approve':
        return isValidAddress(actionData.spender || '') && actionData.amount && Number(actionData.amount) > 0
      
      case 'setApprovalForAll':
        return isValidAddress(actionData.operator || '')
      
      case 'transferOwnership':
        return isValidAddress(actionData.newOwner || '')
      
      case 'renounceOwnership':
        return actionData.confirmed === true
      
      case 'pause':
      case 'unpause':
        return true
      
      default:
        return false
    }
  }

  // Mock data for demonstration - in production, these would be fetched from chain
  useEffect(() => {
    if (isOpen && isConnected) {
      const loadData = async () => {
        setLoading(true)
        try {
          // Simulate loading time
          await new Promise(resolve => setTimeout(resolve, 500))

          // Mock token data - in production, fetch from TokenMintFactory events
          setTokens([
            {
              id: 1,
              address: '0x1234567890abcdef1234567890abcdef12345678',
              name: 'Demo Token',
              symbol: 'DEMO',
              type: 'ERC20',
              totalSupply: '1000000',
              decimals: 18,
              isPausable: true,
              isBurnable: true,
              isPaused: false,
              owner: address,
              createdAt: Date.now() - 86400000 * 30
            },
            {
              id: 2,
              address: '0xabcdef1234567890abcdef1234567890abcdef12',
              name: 'Reward Points',
              symbol: 'RWD',
              type: 'ERC20',
              totalSupply: '5000000',
              decimals: 18,
              isPausable: true,
              isBurnable: false,
              isPaused: false,
              owner: address,
              createdAt: Date.now() - 86400000 * 15
            }
          ])

          setNfts([
            {
              id: 1,
              address: '0x9876543210fedcba9876543210fedcba98765432',
              name: 'Art Collection',
              symbol: 'ART',
              type: 'ERC721',
              totalSupply: '100',
              baseURI: 'ipfs://QmXyz...',
              isPausable: true,
              isBurnable: true,
              isPaused: false,
              owner: address,
              createdAt: Date.now() - 86400000 * 7
            }
          ])

          setMarkets([
            {
              id: 1,
              address: '0xfedcba9876543210fedcba9876543210fedcba98',
              question: 'Will ETH reach $5000 by March 2025?',
              type: 'Prediction',
              status: 'Active',
              totalLiquidity: '2.5',
              tradingEnds: Date.now() + 86400000 * 30,
              createdAt: Date.now() - 86400000 * 10
            }
          ])
        } catch (error) {
          console.error('Error loading data:', error)
          window.alert('An error occurred while loading token data. Please try again.')
        } finally {
          setLoading(false)
        }
      }
      
      loadData()
    }
  }, [isOpen, isConnected, address])

  const getCurrentData = () => {
    switch (activeTab) {
      case 'tokens': return tokens
      case 'nfts': return nfts
      case 'markets': return markets
      default: return []
    }
  }

  const data = getCurrentData()
  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE)
  const paginatedData = data.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Reset page when switching tabs
  useEffect(() => {
    setCurrentPage(1)
    setSelectedItem(null)
    setShowInfoPanel(false)
  }, [activeTab])

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        if (actionModal) {
          setActionModal(null)
        } else if (showInfoPanel) {
          setShowInfoPanel(false)
        } else {
          onClose()
        }
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, actionModal, showInfoPanel, onClose])

  // Focus trap implementation
  useEffect(() => {
    if (!isOpen || !modalRef.current) return

    const modal = modalRef.current
    const focusableElements = modal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    // Focus the first element when modal opens
    firstElement?.focus()

    const handleTabKey = (e) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    modal.addEventListener('keydown', handleTabKey)
    return () => modal.removeEventListener('keydown', handleTabKey)
  }, [isOpen, actionModal, showInfoPanel])

  const fetchChainInfo = async (item) => {
    setLoading(true)
    try {
      // In production, fetch real on-chain data
      await new Promise(resolve => setTimeout(resolve, 300))

      const info = {
        contractAddress: item.address,
        name: item.name,
        symbol: item.symbol,
        type: item.type,
        owner: item.owner || address,
        ...(item.type === 'ERC20' && {
          totalSupply: item.totalSupply,
          decimals: item.decimals || 18,
          balanceOfOwner: '500000'
        }),
        ...(item.type === 'ERC721' && {
          totalSupply: item.totalSupply,
          baseURI: item.baseURI
        }),
        isPaused: item.isPaused || false,
        isPausable: item.isPausable || false,
        isBurnable: item.isBurnable || false,
        blockNumber: 12345678,
        transactionHash: '0x' + 'a'.repeat(64)
      }

      setChainInfo(info)
      setShowInfoPanel(true)
    } catch (error) {
      console.error('Error fetching chain info:', error)
      window.alert('Unable to load on-chain token details. Please try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (action, item) => {
    setSelectedItem(item)
    setActionModal(action)
    setActionData({})
  }

  const executeAction = async () => {
    if (!selectedItem || !actionModal) return

    setActionLoading(true)
    try {
      // In production, these would call actual contract methods
      await new Promise(resolve => setTimeout(resolve, 1000))

      console.log(`Executing ${actionModal} on ${selectedItem.name}:`, actionData)

      // Update local state based on action
      if (actionModal === 'pause') {
        updateItemState(selectedItem.id, { isPaused: true })
      } else if (actionModal === 'unpause') {
        updateItemState(selectedItem.id, { isPaused: false })
      }

      setActionModal(null)
      setActionData({})
      setSelectedItem(null)
    } catch (error) {
      console.error(`Error executing ${actionModal}:`, error)
      window.alert(`Failed to execute ${actionModal}. Please try again.`)
    } finally {
      setActionLoading(false)
    }
  }

  const updateItemState = (id, updates) => {
    if (activeTab === 'tokens') {
      setTokens(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    } else if (activeTab === 'nfts') {
      setNfts(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n))
    }
  }

  const formatAddress = (addr) => {
    if (!addr) return '—'
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopySuccess(text)
      setTimeout(() => setCopySuccess(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      window.alert('Failed to copy to clipboard')
    }
  }

  if (!isOpen) return null

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal" onClick={e => e.stopPropagation()} ref={modalRef}>
        {/* Header */}
        <div className="tm-header">
          <div className="tm-header-content">
            <h2>Token Management</h2>
            <p>Manage your deployed tokens, NFTs, and markets</p>
          </div>
          <button className="tm-close-btn" onClick={onClose} aria-label="Close modal">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="tm-tabs" role="tablist">
          <button
            className={`tm-tab ${activeTab === 'tokens' ? 'active' : ''}`}
            onClick={() => setActiveTab('tokens')}
            role="tab"
            aria-selected={activeTab === 'tokens'}
            aria-controls="tokens-panel"
          >
            <span className="tm-tab-icon">⬡</span>
            Tokens
            <span className="tm-tab-count">{tokens.length}</span>
          </button>
          <button
            className={`tm-tab ${activeTab === 'nfts' ? 'active' : ''}`}
            onClick={() => setActiveTab('nfts')}
            role="tab"
            aria-selected={activeTab === 'nfts'}
            aria-controls="nfts-panel"
          >
            <span className="tm-tab-icon">◈</span>
            NFTs
            <span className="tm-tab-count">{nfts.length}</span>
          </button>
          <button
            className={`tm-tab ${activeTab === 'markets' ? 'active' : ''}`}
            onClick={() => setActiveTab('markets')}
            role="tab"
            aria-selected={activeTab === 'markets'}
            aria-controls="markets-panel"
          >
            <span className="tm-tab-icon">◐</span>
            Markets
            <span className="tm-tab-count">{markets.length}</span>
          </button>
        </div>

        {/* Content */}
        <div className="tm-content" role="tabpanel" id={`${activeTab}-panel`} aria-labelledby={`${activeTab}-tab`}>
          {loading && !paginatedData.length ? (
            <div className="tm-loading">
              <div className="tm-spinner" />
              <span>Loading...</span>
            </div>
          ) : paginatedData.length === 0 ? (
            <div className="tm-empty">
              <div className="tm-empty-icon">
                {activeTab === 'tokens' && '⬡'}
                {activeTab === 'nfts' && '◈'}
                {activeTab === 'markets' && '◐'}
              </div>
              <h3>No {activeTab} found</h3>
              <p>Create your first {activeTab.slice(0, -1)} to get started</p>
            </div>
          ) : (
            <>
              <div className="tm-table-container">
                <table className="tm-table">
                  <thead>
                    <tr>
                      {activeTab !== 'markets' && <th>Type</th>}
                      <th>{activeTab === 'markets' ? 'Question' : 'Name'}</th>
                      {activeTab !== 'markets' && <th>Symbol</th>}
                      <th>Address</th>
                      {activeTab === 'markets' && <th>Status</th>}
                      <th>Created</th>
                      <th className="th-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.map((item) => (
                      <tr key={item.id}>
                        {activeTab !== 'markets' && (
                          <td>
                            <span className={`tm-type-badge ${item.type.toLowerCase()}`}>
                              {item.type}
                            </span>
                          </td>
                        )}
                        <td className="td-name">
                          <span className="tm-name">{activeTab === 'markets' ? item.question : item.name}</span>
                          {item.isPaused && (
                            <span className="tm-status-badge paused">Paused</span>
                          )}
                        </td>
                        {activeTab !== 'markets' && (
                          <td className="td-symbol">{item.symbol}</td>
                        )}
                        <td className="td-address">
                          <code>{formatAddress(item.address)}</code>
                          <button
                            className={`tm-copy-btn ${copySuccess === item.address ? 'success' : ''}`}
                            onClick={() => copyToClipboard(item.address)}
                            aria-label="Copy address"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          </button>
                        </td>
                        {activeTab === 'markets' && (
                          <td>
                            <span className={`tm-status-badge ${item.status.toLowerCase()}`}>
                              {item.status}
                            </span>
                          </td>
                        )}
                        <td className="td-date">{formatDate(item.createdAt)}</td>
                        <td className="td-actions">
                          <div className="tm-action-group">
                            <button
                              className="tm-info-btn"
                              onClick={() => {
                                setSelectedItem(item)
                                fetchChainInfo(item)
                              }}
                              aria-label="View details"
                              title="View on-chain details"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 16v-4M12 8h.01" />
                              </svg>
                            </button>
                            {activeTab !== 'markets' && (
                              <div className="tm-action-dropdown">
                                <button className="tm-action-trigger">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="1" />
                                    <circle cx="19" cy="12" r="1" />
                                    <circle cx="5" cy="12" r="1" />
                                  </svg>
                                </button>
                                <div className="tm-dropdown-menu">
                                  <button onClick={() => handleAction('mint', item)}>
                                    <span className="action-icon">+</span> Mint
                                  </button>
                                  {item.isBurnable && (
                                    <button onClick={() => handleAction('burn', item)}>
                                      <span className="action-icon">🔥</span> Burn
                                    </button>
                                  )}
                                  {item.isPausable && !item.isPaused && (
                                    <button onClick={() => handleAction('pause', item)}>
                                      <span className="action-icon">⏸</span> Pause
                                    </button>
                                  )}
                                  {item.isPausable && item.isPaused && (
                                    <button onClick={() => handleAction('unpause', item)}>
                                      <span className="action-icon">▶</span> Unpause
                                    </button>
                                  )}
                                  <button onClick={() => handleAction('transfer', item)}>
                                    <span className="action-icon">↗</span> Transfer
                                  </button>
                                  {item.type === 'ERC20' && (
                                    <button onClick={() => handleAction('approve', item)}>
                                      <span className="action-icon">✓</span> Approve
                                    </button>
                                  )}
                                  {item.type === 'ERC721' && (
                                    <button onClick={() => handleAction('setApprovalForAll', item)}>
                                      <span className="action-icon">✓</span> Set Approval
                                    </button>
                                  )}
                                  <hr />
                                  <button onClick={() => handleAction('transferOwnership', item)}>
                                    <span className="action-icon">👤</span> Transfer Ownership
                                  </button>
                                  <button onClick={() => handleAction('renounceOwnership', item)} className="danger">
                                    <span className="action-icon">⚠</span> Renounce Ownership
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="tm-pagination">
                  <span className="tm-page-info">
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="tm-page-controls">
                    <button
                      className="tm-page-btn"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      aria-label="First page"
                    >
                      ««
                    </button>
                    <button
                      className="tm-page-btn"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      aria-label="Previous page"
                    >
                      ‹
                    </button>
                    <span className="tm-page-current">{currentPage}</span>
                    <button
                      className="tm-page-btn"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      aria-label="Next page"
                    >
                      ›
                    </button>
                    <button
                      className="tm-page-btn"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      aria-label="Last page"
                    >
                      »»
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Info Panel Slide-out */}
        {showInfoPanel && chainInfo && (
          <div className="tm-info-panel">
            <div className="tm-info-header">
              <h3>On-Chain Details</h3>
              <button
                className="tm-info-close"
                onClick={() => setShowInfoPanel(false)}
                aria-label="Close info panel"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="tm-info-content">
              <div className="tm-info-section">
                <h4>Contract Information</h4>
                <div className="tm-info-grid">
                  <div className="tm-info-item">
                    <label>Name</label>
                    <span>{chainInfo.name}</span>
                  </div>
                  <div className="tm-info-item">
                    <label>Symbol</label>
                    <span>{chainInfo.symbol}</span>
                  </div>
                  <div className="tm-info-item">
                    <label>Type</label>
                    <span className={`tm-type-badge ${chainInfo.type.toLowerCase()}`}>
                      {chainInfo.type}
                    </span>
                  </div>
                  <div className="tm-info-item full-width">
                    <label>Contract Address</label>
                    <div className="tm-address-row">
                      <code>{chainInfo.contractAddress}</code>
                      <button
                        className={`tm-copy-btn ${copySuccess === chainInfo.contractAddress ? 'success' : ''}`}
                        onClick={() => copyToClipboard(chainInfo.contractAddress)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="tm-info-item full-width">
                    <label>Owner</label>
                    <div className="tm-address-row">
                      <code>{chainInfo.owner}</code>
                      <button
                        className={`tm-copy-btn ${copySuccess === chainInfo.owner ? 'success' : ''}`}
                        onClick={() => copyToClipboard(chainInfo.owner)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="tm-info-section">
                <h4>Token Details</h4>
                <div className="tm-info-grid">
                  {chainInfo.totalSupply && (
                    <div className="tm-info-item">
                      <label>Total Supply</label>
                      <span>{Number(chainInfo.totalSupply).toLocaleString()}</span>
                    </div>
                  )}
                  {chainInfo.decimals && (
                    <div className="tm-info-item">
                      <label>Decimals</label>
                      <span>{chainInfo.decimals}</span>
                    </div>
                  )}
                  {chainInfo.balanceOfOwner && (
                    <div className="tm-info-item">
                      <label>Your Balance</label>
                      <span>{Number(chainInfo.balanceOfOwner).toLocaleString()}</span>
                    </div>
                  )}
                  {chainInfo.baseURI && (
                    <div className="tm-info-item full-width">
                      <label>Base URI</label>
                      <span className="tm-uri">{chainInfo.baseURI}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="tm-info-section">
                <h4>Features</h4>
                <div className="tm-features-list">
                  <div className={`tm-feature ${chainInfo.isPausable ? 'enabled' : 'disabled'}`}>
                    <span className="feature-icon">{chainInfo.isPausable ? '✓' : '✗'}</span>
                    Pausable
                  </div>
                  <div className={`tm-feature ${chainInfo.isBurnable ? 'enabled' : 'disabled'}`}>
                    <span className="feature-icon">{chainInfo.isBurnable ? '✓' : '✗'}</span>
                    Burnable
                  </div>
                  <div className={`tm-feature ${chainInfo.isPaused ? 'active' : ''}`}>
                    <span className="feature-icon">{chainInfo.isPaused ? '⏸' : '▶'}</span>
                    {chainInfo.isPaused ? 'Paused' : 'Active'}
                  </div>
                </div>
              </div>

              <div className="tm-info-section">
                <h4>Deployment</h4>
                <div className="tm-info-grid">
                  <div className="tm-info-item">
                    <label>Block Number</label>
                    <span>{chainInfo.blockNumber.toLocaleString()}</span>
                  </div>
                  <div className="tm-info-item full-width">
                    <label>Transaction Hash</label>
                    <div className="tm-address-row">
                      <code>
                        {typeof chainInfo.transactionHash === 'string' && chainInfo.transactionHash.length > 0
                          ? formatAddress(chainInfo.transactionHash)
                          : 'N/A'}
                      </code>
                      <button
                        className={`tm-copy-btn ${copySuccess === chainInfo.transactionHash ? 'success' : ''}`}
                        disabled={!(typeof chainInfo.transactionHash === 'string' && chainInfo.transactionHash.length > 0)}
                        onClick={() => {
                          if (typeof chainInfo.transactionHash === 'string' && chainInfo.transactionHash.length > 0) {
                            copyToClipboard(chainInfo.transactionHash)
                          }
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Modal */}
        {actionModal && selectedItem && (
          <div className="tm-action-modal-overlay" onClick={() => setActionModal(null)}>
            <div className="tm-action-modal" onClick={e => e.stopPropagation()}>
              <div className="tm-action-header">
                <h3>{formatActionName(actionModal)} {selectedItem.name}</h3>
                <button
                  className="tm-action-close"
                  onClick={() => setActionModal(null)}
                  aria-label="Close"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="tm-action-body">
                {actionModal === 'mint' && (
                  <>
                    <div className="tm-form-group">
                      <label htmlFor="mint-address">Recipient Address</label>
                      <input
                        id="mint-address"
                        type="text"
                        placeholder="0x..."
                        value={actionData.address || ''}
                        onChange={(e) => setActionData({...actionData, address: e.target.value})}
                      />
                    </div>
                    {selectedItem.type === 'ERC20' ? (
                      <div className="tm-form-group">
                        <label htmlFor="mint-amount">Amount</label>
                        <input
                          id="mint-amount"
                          type="number"
                          placeholder="1000"
                          value={actionData.amount || ''}
                          onChange={(e) => setActionData({...actionData, amount: e.target.value})}
                        />
                      </div>
                    ) : (
                      <div className="tm-form-group">
                        <label htmlFor="mint-uri">Token URI</label>
                        <input
                          id="mint-uri"
                          type="text"
                          placeholder="ipfs://..."
                          value={actionData.tokenURI || ''}
                          onChange={(e) => setActionData({...actionData, tokenURI: e.target.value})}
                        />
                      </div>
                    )}
                  </>
                )}

                {actionModal === 'burn' && (
                  <div className="tm-form-group">
                    <label htmlFor="burn-amount">
                      {selectedItem.type === 'ERC20' ? 'Amount to Burn' : 'Token ID to Burn'}
                    </label>
                    <input
                      id="burn-amount"
                      type="number"
                      placeholder={selectedItem.type === 'ERC20' ? '1000' : '1'}
                      value={actionData.amount || ''}
                      onChange={(e) => setActionData({...actionData, amount: e.target.value})}
                    />
                  </div>
                )}

                {actionModal === 'transfer' && (
                  <>
                    <div className="tm-form-group">
                      <label htmlFor="transfer-address">Recipient Address</label>
                      <input
                        id="transfer-address"
                        type="text"
                        placeholder="0x..."
                        value={actionData.address || ''}
                        onChange={(e) => setActionData({...actionData, address: e.target.value})}
                      />
                    </div>
                    <div className="tm-form-group">
                      <label htmlFor="transfer-amount">
                        {selectedItem.type === 'ERC20' ? 'Amount' : 'Token ID'}
                      </label>
                      <input
                        id="transfer-amount"
                        type="number"
                        placeholder={selectedItem.type === 'ERC20' ? '1000' : '1'}
                        value={actionData.amount || ''}
                        onChange={(e) => setActionData({...actionData, amount: e.target.value})}
                      />
                    </div>
                  </>
                )}

                {actionModal === 'approve' && (
                  <>
                    <div className="tm-form-group">
                      <label htmlFor="approve-spender">Spender Address</label>
                      <input
                        id="approve-spender"
                        type="text"
                        placeholder="0x..."
                        value={actionData.spender || ''}
                        onChange={(e) => setActionData({...actionData, spender: e.target.value})}
                      />
                    </div>
                    <div className="tm-form-group">
                      <label htmlFor="approve-amount">Amount</label>
                      <input
                        id="approve-amount"
                        type="number"
                        placeholder="Unlimited or specific amount"
                        value={actionData.amount || ''}
                        onChange={(e) => setActionData({...actionData, amount: e.target.value})}
                      />
                    </div>
                  </>
                )}

                {actionModal === 'setApprovalForAll' && (
                  <>
                    <div className="tm-form-group">
                      <label htmlFor="approval-operator">Operator Address</label>
                      <input
                        id="approval-operator"
                        type="text"
                        placeholder="0x..."
                        value={actionData.operator || ''}
                        onChange={(e) => setActionData({...actionData, operator: e.target.value})}
                      />
                    </div>
                    <div className="tm-form-group checkbox">
                      <input
                        id="approval-approved"
                        type="checkbox"
                        checked={actionData.approved || false}
                        onChange={(e) => setActionData({...actionData, approved: e.target.checked})}
                      />
                      <label htmlFor="approval-approved">Approve for all tokens</label>
                    </div>
                  </>
                )}

                {(actionModal === 'pause' || actionModal === 'unpause') && (
                  <div className="tm-action-confirm">
                    <p>
                      Are you sure you want to {actionModal} <strong>{selectedItem.name}</strong>?
                    </p>
                    {actionModal === 'pause' && (
                      <p className="tm-warning">
                        This will prevent all token transfers until unpaused.
                      </p>
                    )}
                  </div>
                )}

                {actionModal === 'transferOwnership' && (
                  <div className="tm-form-group">
                    <label htmlFor="new-owner">New Owner Address</label>
                    <input
                      id="new-owner"
                      type="text"
                      placeholder="0x..."
                      value={actionData.newOwner || ''}
                      onChange={(e) => setActionData({...actionData, newOwner: e.target.value})}
                    />
                    <span className="tm-field-hint">
                      This action cannot be undone. Make sure the address is correct.
                    </span>
                  </div>
                )}

                {actionModal === 'renounceOwnership' && (
                  <div className="tm-action-confirm danger">
                    <p className="tm-danger-icon">⚠️</p>
                    <p>
                      Are you sure you want to renounce ownership of <strong>{selectedItem.name}</strong>?
                    </p>
                    <p className="tm-warning">
                      This action is IRREVERSIBLE. No one will be able to manage this token after renouncing.
                    </p>
                    <div className="tm-form-group checkbox">
                      <input
                        id="confirm-renounce"
                        type="checkbox"
                        checked={actionData.confirmed || false}
                        onChange={(e) => setActionData({...actionData, confirmed: e.target.checked})}
                      />
                      <label htmlFor="confirm-renounce">I understand this cannot be undone</label>
                    </div>
                  </div>
                )}
              </div>
              <div className="tm-action-footer">
                <button
                  className="tm-btn-secondary"
                  onClick={() => setActionModal(null)}
                >
                  Cancel
                </button>
                <button
                  className={`tm-btn-primary ${actionModal === 'renounceOwnership' ? 'danger' : ''}`}
                  onClick={executeAction}
                  disabled={actionLoading || !isActionValid()}
                >
                  {actionLoading ? (
                    <>
                      <span className="tm-btn-spinner" />
                      Processing...
                    </>
                  ) : (
                    `Confirm ${formatActionName(actionModal)}`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TokenManagementModal
