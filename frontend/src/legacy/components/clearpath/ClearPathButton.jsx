import { useState, useRef, useEffect } from 'react'
import { useRoles } from '../../hooks/useRoles'
import { useModal } from '../../hooks/useUI'
import { useWallet } from '../../hooks'
import PremiumPurchaseModal from '../ui/PremiumPurchaseModal'
import ClearPathUserModal from './ClearPathUserModal'
import ClearPathProModal from './ClearPathProModal'
import './ClearPathButton.css'

/**
 * ClearPathButton Component
 *
 * Displays a button with the ClearPath logo that opens a dropdown menu
 * with governance options based on user's roles and permissions.
 *
 * Features:
 * - Role-based menu options (ClearPath User)
 * - Integration with ClearPath governance modals
 * - Membership purchase flow for users without active ClearPath role
 */
function ClearPathButton() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)

  const { hasRole, ROLES } = useRoles()
  const { showModal } = useModal()
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

  // Handler for ClearPath User (free) - Browse, Proposals, View DAOs
  const handleOpenUserModal = () => {
    setIsOpen(false)
    showModal(<ClearPathUserModal onClose={() => showModal(null)} />, {
      title: 'ClearPath',
      size: 'large',
      closable: true
    })
  }

  // Handler for ClearPath Pro - Full features including DAO creation/management
  const handleOpenProModal = () => {
    setIsOpen(false)
    const hasMembership = hasRole(ROLES.CLEARPATH_USER)

    if (hasMembership) {
      showModal(<ClearPathProModal onClose={() => showModal(null)} />, {
        title: 'ClearPath Pro',
        size: 'large',
        closable: true
      })
    } else {
      // Show purchase modal if user doesn't have membership
      showModal(<PremiumPurchaseModal onClose={() => showModal(null)} />, {
        title: '',
        size: 'large',
        closable: false
      })
    }
  }

  // Determine available options - always show both options
  const getMenuOptions = () => {
    const hasMembership = hasRole(ROLES.CLEARPATH_USER)

    return [
      {
        id: 'clearpath-user',
        label: 'ClearPath',
        icon: '🏛️',
        description: 'Browse DAOs, view proposals, and explore governance',
        action: handleOpenUserModal
      },
      {
        id: 'clearpath-pro',
        label: hasMembership ? 'ClearPath Pro' : 'Upgrade to Pro',
        icon: hasMembership ? '🚀' : '⭐',
        description: hasMembership
          ? 'Launch DAOs, advanced metrics, and full management'
          : 'Create DAOs and access advanced governance features',
        action: handleOpenProModal,
        premium: hasMembership,
        highlight: !hasMembership
      }
    ]
  }

  const menuOptions = getMenuOptions()

  return (
    <div className="clearpath-button-container">
      <button
        ref={buttonRef}
        className={`clearpath-button ${!isConnected ? 'inactive' : ''}`}
        onClick={isConnected ? toggleDropdown : undefined}
        aria-label="ClearPath - DAO Governance"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-disabled={!isConnected}
        title={isConnected ? "ClearPath" : "ClearPath (Connect wallet to use)"}
      >
        <img 
          src="/assets/clearpath_no-text_logo.svg" 
          alt="ClearPath" 
          className="clearpath-icon"
        />
      </button>

      {isOpen && isConnected && (
        <div 
          ref={dropdownRef}
          className="clearpath-dropdown"
          role="menu"
          aria-label="ClearPath options"
        >
          <div className="dropdown-header">
            <span className="dropdown-title">ClearPath</span>
          </div>
          <div className="dropdown-options">
            {menuOptions.map((option) => (
              <button
                key={option.id}
                className={`dropdown-option ${option.highlight ? 'highlight' : ''} ${option.premium ? 'premium' : ''}`}
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
  )
}

export default ClearPathButton
