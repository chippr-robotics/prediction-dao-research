import { useState, useRef, useEffect } from 'react'
import { useRoles } from '../../hooks/useRoles'
import { useModal } from '../../hooks/useUI'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useWallet } from '../../hooks'
import PremiumPurchaseModal from '../ui/PremiumPurchaseModal'
import ClearPathModal from './ClearPathModal'
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

  const handleOpenGovernance = () => {
    setIsOpen(false)
    showModal(<ClearPathModal />, {
      title: 'ClearPath Governance',
      size: 'large',
      closable: true
    })
  }

  const handleViewDAOs = () => {
    setIsOpen(false)
    showModal(<ClearPathModal defaultTab="daos" />, {
      title: 'My DAOs',
      size: 'large',
      closable: true
    })
  }

  const handleViewProposals = () => {
    setIsOpen(false)
    showModal(<ClearPathModal defaultTab="proposals" />, {
      title: 'Proposals',
      size: 'large',
      closable: true
    })
  }

  const handlePurchaseMembership = () => {
    setIsOpen(false)
    showModal(<PremiumPurchaseModal onClose={() => showModal(null)} />, {
      title: '',
      size: 'large',
      closable: false
    })
  }

  // Determine available options based on roles and membership
  const getMenuOptions = () => {
    const options = []
    
    // Check if user has active ClearPath membership (ClearPath User role)
    const hasMembership = hasRole(ROLES.CLEARPATH_USER) && preferences.clearPathStatus?.active

    // ClearPath governance options - requires CLEARPATH_USER role
    if (hasMembership) {
      options.push({
        id: 'governance',
        label: 'Governance Dashboard',
        icon: '🏛️',
        description: 'Access DAO governance and decision-making',
        action: handleOpenGovernance
      })
      options.push({
        id: 'view-daos',
        label: 'My DAOs',
        icon: '📋',
        description: 'View and manage your DAOs',
        action: handleViewDAOs
      })
      options.push({
        id: 'view-proposals',
        label: 'Proposals',
        icon: '📝',
        description: 'View and vote on proposals',
        action: handleViewProposals
      })
    }

    // If no membership, show purchase option
    if (!hasMembership) {
      options.push({
        id: 'purchase-membership',
        label: 'Purchase ClearPath Membership',
        icon: '🎫',
        description: 'Get access to institutional-grade DAO governance',
        action: handlePurchaseMembership,
        highlight: true
      })
    }

    return options
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
  )
}

export default ClearPathButton
