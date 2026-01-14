import { useState, useRef, useEffect } from 'react'
import { useRoles } from '../hooks/useRoles'
import { useModal } from '../hooks/useUI'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useWallet, useWeb3 } from '../hooks'
import TokenCreationModal from './fairwins/TokenCreationModal'
import TokenManagementModal from './fairwins/TokenManagementModal'
import PremiumPurchaseModal from './ui/PremiumPurchaseModal'
import './TokenMintButton.css'

/**
 * TokenMintButton Component
 *
 * Displays a button with the TokenMint logo that opens a dropdown menu
 * with options based on user's roles and permissions.
 *
 * Features:
 * - Role-based menu options (Token Mint role)
 * - Integration with existing modals for token creation and management
 * - Membership purchase flow for users without active membership
 * - Wallet transaction handling
 *
 * Note: Market creation functionality has been moved to the WalletButton component.
 */
function TokenMintButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [showTokenBuilder, setShowTokenBuilder] = useState(false)
  const [showTokenManagement, setShowTokenManagement] = useState(false)
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

  const handleManageTokens = () => {
    setIsOpen(false)
    setShowTokenManagement(true)
  }

  const handlePurchaseMembership = () => {
    setIsOpen(false)
    showModal(<PremiumPurchaseModal onClose={() => showModal(null)} />, {
      title: '',
      size: 'large',
      closable: false
    })
  }

  /**
   * Handle successful token creation
   * Called by TokenCreationModal after token is deployed
   */
  const handleTokenCreated = (tokenData) => {
    console.log('Token created successfully:', tokenData)
    // Token was created - the modal handles the success state
    // We could refresh token lists here if needed
  }

  // Determine available options based on roles and membership
  const getMenuOptions = () => {
    const options = []
    
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

    // Token management option - requires TOKENMINT role
    options.push({
      id: 'manage-tokens',
      label: 'Manage Tokens',
      icon: '⚙️',
      description: hasTokenMintRole
        ? 'Manage deployed tokens, NFTs & markets'
        : 'Requires TokenMint role',
      action: handleManageTokens,
      disabled: !hasTokenMintRole
    })

    // Show purchase option if user lacks TokenMint role
    if (!hasTokenMintRole) {
      options.push({
        id: 'purchase-membership',
        label: 'Purchase Membership',
        icon: '🎫',
        description: 'Get access to token minting features',
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
          aria-label="TokenMint - Create and manage tokens"
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

      {/* Token Creation Modal - Full web3 integration */}
      <TokenCreationModal
        isOpen={showTokenBuilder}
        onClose={() => setShowTokenBuilder(false)}
        onSuccess={handleTokenCreated}
      />

      {/* Token Management Modal */}
      <TokenManagementModal
        isOpen={showTokenManagement}
        onClose={() => setShowTokenManagement(false)}
      />
    </>
  )
}

export default TokenMintButton
