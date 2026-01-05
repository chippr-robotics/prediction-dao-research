import { useState, useRef, useEffect } from 'react'
import { useRoles } from '../hooks/useRoles'
import { useModal } from '../hooks/useUI'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useWallet, useWeb3 } from '../hooks'
import TokenMintBuilderModal from './fairwins/TokenMintBuilderModal'
import MarketCreationModal from './fairwins/MarketCreationModal'
import RolePurchaseModal from './ui/RolePurchaseModal'
import './TokenMintButton.css'

/**
 * TokenMintButton Component
 * 
 * Displays a button with the TokenMint logo that opens a dropdown menu
 * with options based on user's roles and permissions.
 * 
 * Features:
 * - Role-based menu options (Market Maker, Token Mint, ClearPath User)
 * - Integration with existing modals for token/market creation
 * - Membership purchase flow for users without active membership
 * - Wallet transaction handling
 */
function TokenMintButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [showTokenBuilder, setShowTokenBuilder] = useState(false)
  const [showMarketCreation, setShowMarketCreation] = useState(false)
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)

  const { hasRole, ROLES } = useRoles()
  const { showModal } = useModal()
  const { preferences } = useUserPreferences()
  const { isConnected } = useWallet()
  const { signer } = useWeb3()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const toggleDropdown = () => {
    setIsOpen(!isOpen)
  }

  const handleOpenTokenBuilder = () => {
    setIsOpen(false)
    setShowTokenBuilder(true)
  }

  const handleCreateMarket = () => {
    setIsOpen(false)
    setShowMarketCreation(true)
  }

  const handlePurchaseMembership = () => {
    setIsOpen(false)
    showModal(<RolePurchaseModal onClose={() => showModal(null)} />, {
      title: 'Purchase Premium Access',
      size: 'large',
      closable: true
    })
  }

  const handleCreateToken = async (tokenData) => {
    console.log('Creating token:', tokenData)

    // Show transaction dialog
    // Note: In production, this would call the TokenMintFactory contract methods
    // (tokenMintFactory.createERC20() or createERC721()) to initiate blockchain transaction
    showModal(
      <div className="transaction-modal">
        <h3>Token Creation Transaction</h3>
        <p>Token creation requires a blockchain transaction.</p>
        <div className="token-details">
          <div className="detail-row">
            <span className="detail-label">Type:</span>
            <span className="detail-value">{tokenData.tokenType}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Name:</span>
            <span className="detail-value">{tokenData.name}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Symbol:</span>
            <span className="detail-value">{tokenData.symbol}</span>
          </div>
          {tokenData.tokenType === 'ERC20' && (
            <div className="detail-row">
              <span className="detail-label">Initial Supply:</span>
              <span className="detail-value">{tokenData.initialSupply}</span>
            </div>
          )}
          <div className="detail-row">
            <span className="detail-label">Features:</span>
            <span className="detail-value">
              {tokenData.isBurnable ? 'Burnable ' : ''}
              {tokenData.isPausable ? 'Pausable ' : ''}
            </span>
          </div>
        </div>
        <p className="transaction-note">
          Please confirm the transaction in your wallet to proceed.
        </p>
      </div>,
      {
        title: 'Confirm Transaction',
        size: 'medium',
        closable: true
      }
    )
  }

  /**
   * Handle creation from the MarketCreationModal
   * Supports prediction markets, friend markets, and ERC tokens
   */
  const handleMarketCreation = async (submitData, modalSigner) => {
    console.log('Creating from modal:', submitData)

    const activeSigner = modalSigner || signer

    // Note: In production, these would call the appropriate smart contract methods
    // For now, show a confirmation dialog based on the type

    switch (submitData.type) {
      case 'prediction': {
        const { data } = submitData
        showModal(
          <div className="transaction-modal">
            <h3>Prediction Market Creation</h3>
            <p>Creating a new prediction market requires a blockchain transaction.</p>
            <div className="token-details">
              <div className="detail-row">
                <span className="detail-label">Question:</span>
                <span className="detail-value">{data.question}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Trading Ends:</span>
                <span className="detail-value">{new Date(data.tradingEndTime).toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Resolution Date:</span>
                <span className="detail-value">{new Date(data.resolutionDate).toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Initial Liquidity:</span>
                <span className="detail-value">{data.initialLiquidity} ETC</span>
              </div>
            </div>
            <p className="transaction-note">
              This will call ConditionalMarketFactory.deployMarketPair() to create PASS/FAIL token pairs.
            </p>
          </div>,
          {
            title: 'Confirm Prediction Market',
            size: 'medium',
            closable: true
          }
        )
        break
      }

      case 'friend': {
        const { marketType, data } = submitData
        const marketTypeLabels = {
          oneVsOne: '1v1 Direct Bet',
          smallGroup: 'Small Group Market',
          eventTracking: 'Event Tracking Market'
        }
        const contractMethods = {
          oneVsOne: 'createOneVsOneMarket()',
          smallGroup: 'createSmallGroupMarket()',
          eventTracking: 'createEventTrackingMarket()'
        }

        showModal(
          <div className="transaction-modal">
            <h3>Friend Market Creation</h3>
            <p>Creating a {marketTypeLabels[marketType]} requires a blockchain transaction.</p>
            <div className="token-details">
              <div className="detail-row">
                <span className="detail-label">Type:</span>
                <span className="detail-value">{marketTypeLabels[marketType]}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Description:</span>
                <span className="detail-value">{data.description}</span>
              </div>
              {marketType === 'oneVsOne' && (
                <div className="detail-row">
                  <span className="detail-label">Opponent:</span>
                  <span className="detail-value">{data.opponent.slice(0, 10)}...{data.opponent.slice(-8)}</span>
                </div>
              )}
              {(marketType === 'smallGroup' || marketType === 'eventTracking') && (
                <div className="detail-row">
                  <span className="detail-label">Members:</span>
                  <span className="detail-value">{data.members.split(',').length} participants</span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Trading Period:</span>
                <span className="detail-value">{data.tradingPeriod} days</span>
              </div>
              {data.arbitrator && (
                <div className="detail-row">
                  <span className="detail-label">Arbitrator:</span>
                  <span className="detail-value">{data.arbitrator.slice(0, 10)}...{data.arbitrator.slice(-8)}</span>
                </div>
              )}
            </div>
            <p className="transaction-note">
              This will call FriendGroupMarketFactory.{contractMethods[marketType]}
            </p>
          </div>,
          {
            title: 'Confirm Friend Market',
            size: 'medium',
            closable: true
          }
        )
        break
      }

      case 'token': {
        const { tokenType, data } = submitData
        showModal(
          <div className="transaction-modal">
            <h3>Token Creation Transaction</h3>
            <p>Token creation requires a blockchain transaction.</p>
            <div className="token-details">
              <div className="detail-row">
                <span className="detail-label">Type:</span>
                <span className="detail-value">{tokenType}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Name:</span>
                <span className="detail-value">{data.name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Symbol:</span>
                <span className="detail-value">{data.symbol}</span>
              </div>
              {tokenType === 'ERC20' && (
                <div className="detail-row">
                  <span className="detail-label">Initial Supply:</span>
                  <span className="detail-value">{data.initialSupply}</span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Features:</span>
                <span className="detail-value">
                  {data.isBurnable ? 'Burnable ' : ''}
                  {data.isPausable ? 'Pausable ' : ''}
                  {data.listOnETCSwap ? 'ETCSwap Listed' : ''}
                </span>
              </div>
            </div>
            <p className="transaction-note">
              This will call TokenMintFactory.create{tokenType}() to deploy your token.
            </p>
          </div>,
          {
            title: 'Confirm Token Creation',
            size: 'medium',
            closable: true
          }
        )
        break
      }

      default:
        console.error('Unknown creation type:', submitData.type)
    }
  }

  // Determine available options based on roles and membership
  const getMenuOptions = () => {
    const options = []
    
    // Check if user has active FairWins membership (ClearPath User role)
    const hasMembership = hasRole(ROLES.CLEARPATH_USER) && preferences.clearPathStatus?.active

    // Token creation options - requires TOKENMINT role
    const hasTokenMintRole = hasRole(ROLES.TOKENMINT)
    options.push({
      id: 'create-token',
      label: 'Create New Token',
      icon: '🪙',
      description: hasTokenMintRole 
        ? 'Mint ERC20 or ERC721 tokens' 
        : 'Requires TokenMint role',
      action: handleOpenTokenBuilder,
      disabled: !hasTokenMintRole
    })

    // Market creation options - requires MARKET_MAKER role
    const hasMarketMakerRole = hasRole(ROLES.MARKET_MAKER)
    options.push({
      id: 'create-market',
      label: 'Create New Market',
      icon: '📊',
      description: hasMarketMakerRole 
        ? 'Create a prediction market' 
        : 'Requires Market Maker role',
      action: handleCreateMarket,
      disabled: !hasMarketMakerRole
    })

    // If no membership, show purchase option
    if (!hasMembership) {
      options.push({
        id: 'purchase-membership',
        label: 'Purchase Membership',
        icon: '🎫',
        description: 'Get access to token minting and market creation',
        action: handlePurchaseMembership,
        highlight: true
      })
    }

    return options
  }

  const menuOptions = getMenuOptions()

  return (
    <>
      <div className="tokenmint-button-container">
        <button
          ref={buttonRef}
          className={`tokenmint-button ${!isConnected ? 'inactive' : ''}`}
          onClick={isConnected ? toggleDropdown : undefined}
          aria-label="TokenMint - Create tokens and markets"
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-disabled={!isConnected}
          title={isConnected ? "TokenMint" : "TokenMint (Connect wallet to use)"}
        >
          <img 
            src="/assets/tokenmint_no-text_logo.svg" 
            alt="TokenMint" 
            className="tokenmint-icon"
          />
        </button>

        {isOpen && isConnected && (
          <div 
            ref={dropdownRef}
            className="tokenmint-dropdown"
            role="menu"
            aria-label="TokenMint options"
          >
            <div className="dropdown-header">
              <span className="dropdown-title">TokenMint</span>
            </div>
            <div className="dropdown-options">
              {menuOptions.map((option) => (
                <button
                  key={option.id}
                  className={`dropdown-option ${option.highlight ? 'highlight' : ''} ${option.disabled ? 'disabled' : ''}`}
                  onClick={option.disabled ? undefined : option.action}
                  role="menuitem"
                  aria-disabled={option.disabled}
                  disabled={option.disabled}
                >
                  <span className="option-icon" aria-hidden="true">{option.icon}</span>
                  <div className="option-content">
                    <span className="option-label">{option.label}</span>
                    <span className="option-description">{option.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Token Builder Modal */}
      <TokenMintBuilderModal
        isOpen={showTokenBuilder}
        onClose={() => setShowTokenBuilder(false)}
        onCreate={handleCreateToken}
      />

      {/* Market Creation Modal - supports all creation types */}
      <MarketCreationModal
        isOpen={showMarketCreation}
        onClose={() => setShowMarketCreation(false)}
        onCreate={handleMarketCreation}
      />
    </>
  )
}

export default TokenMintButton
