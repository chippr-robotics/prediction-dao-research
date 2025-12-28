import { useState, useRef, useEffect } from 'react'
import { useRoles } from '../hooks/useRoles'
import { useModal } from '../hooks/useUI'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useWallet } from '../hooks'
import TokenMintBuilderModal from './fairwins/TokenMintBuilderModal'
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
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)
  
  const { hasRole, ROLES } = useRoles()
  const { showModal } = useModal()
  const { preferences } = useUserPreferences()
  const { isConnected } = useWallet()

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
    // Navigate to market creation or open market creation modal
    // For now, show a notification about market creation
    showModal(
      <div className="info-modal">
        <h3>Create New Market</h3>
        <p>Market creation functionality is available in the FairWins platform.</p>
        <p>Navigate to the FairWins platform from the Platforms menu to create prediction markets.</p>
      </div>,
      {
        title: 'Market Creation',
        size: 'medium',
        closable: true
      }
    )
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

  // Determine available options based on roles and membership
  const getMenuOptions = () => {
    const options = []
    
    // Check if user has active FairWins membership (ClearPath User role)
    const hasMembership = hasRole(ROLES.CLEARPATH_USER) && preferences.clearPathStatus?.active

    // Token creation options - requires TOKENMINT role
    if (hasRole(ROLES.TOKENMINT)) {
      options.push({
        id: 'create-token',
        label: 'Create New Token',
        icon: '🪙',
        description: 'Mint ERC20 or ERC721 tokens',
        action: handleOpenTokenBuilder
      })
    }

    // Market creation options - requires MARKET_MAKER role
    if (hasRole(ROLES.MARKET_MAKER)) {
      options.push({
        id: 'create-market',
        label: 'Create New Market',
        icon: '📊',
        description: 'Create a prediction market',
        action: handleCreateMarket
      })
    }

    // If no membership, show purchase option
    if (!hasMembership) {
      options.push({
        id: 'purchase-membership',
        label: 'Purchase Membership',
        icon: '🎫',
        description: options.length === 0 
          ? 'Get access to token minting and market creation'
          : 'Get access to premium features',
        action: handlePurchaseMembership,
        highlight: true
      })
    }

    return options
  }

  const menuOptions = getMenuOptions()

  // Don't show button if not connected
  if (!isConnected) {
    return null
  }

  return (
    <>
      <div className="tokenmint-button-container">
        <button
          ref={buttonRef}
          className="tokenmint-button"
          onClick={toggleDropdown}
          aria-label="TokenMint - Create tokens and markets"
          aria-expanded={isOpen}
          aria-haspopup="true"
          title="TokenMint"
        >
          <img 
            src="/assets/tokenmint_no-text_logo.svg" 
            alt="TokenMint" 
            className="tokenmint-icon"
          />
        </button>

        {isOpen && (
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
                  className={`dropdown-option ${option.highlight ? 'highlight' : ''}`}
                  onClick={option.action}
                  role="menuitem"
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
    </>
  )
}

export default TokenMintButton
