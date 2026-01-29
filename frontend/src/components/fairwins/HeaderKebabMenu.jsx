import { useState, useRef, useEffect } from 'react'
import { useIsExtraSmall } from '../../hooks/useMediaQuery'
import WalletButton from '../wallet/WalletButton'
import TokenMintButton from '../TokenMintButton'
import ClearPathButton from '../clearpath/ClearPathButton'
import './HeaderKebabMenu.css'

/**
 * HeaderKebabMenu Component
 *
 * Collapses header action buttons into a kebab menu on extra-small screens.
 * Below 480px viewport width, TokenMint and ClearPath buttons collapse
 * into a vertical ellipsis (kebab) menu while WalletButton remains visible.
 */
function HeaderKebabMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const isExtraSmall = useIsExtraSmall()
  const menuRef = useRef(null)
  const buttonRef = useRef(null)
  const tokenMintItemRef = useRef(null)
  const clearPathItemRef = useRef(null)

  // Handle clicking anywhere on the menu item to trigger the button
  const handleMenuItemClick = (itemRef) => (e) => {
    // Don't trigger if clicking directly on the button (it handles itself)
    if (e.target.closest('.tokenmint-button, .clearpath-button')) {
      return
    }
    // Find and click the button inside this menu item
    const button = itemRef.current?.querySelector('.tokenmint-button, .clearpath-button')
    if (button) {
      button.click()
    }
  }

  // Close menu when clicking outside
  // Note: We check for nested dropdowns to avoid closing when interacting with button dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is inside the kebab menu or kebab button
      const isInsideMenu = menuRef.current && menuRef.current.contains(event.target)
      const isInsideButton = buttonRef.current && buttonRef.current.contains(event.target)

      // Also check if clicking on any open dropdown (they may be positioned outside the menu)
      const isInsideDropdown = event.target.closest('.tokenmint-dropdown, .clearpath-dropdown')

      if (!isInsideMenu && !isInsideButton && !isInsideDropdown) {
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

  // Close menu when screen size changes to non-collapsed
  useEffect(() => {
    if (!isExtraSmall && isOpen) {
      setIsOpen(false)
    }
  }, [isExtraSmall, isOpen])

  const toggleMenu = () => setIsOpen(!isOpen)


  // If not extra-small, render all buttons normally inline
  if (!isExtraSmall) {
    return (
      <div className="header-actions-expanded">
        <WalletButton />
        <TokenMintButton />
        <ClearPathButton />
      </div>
    )
  }

  // Extra-small: render wallet button + kebab menu for other actions
  return (
    <div className="header-kebab-container">
      {/* Always show wallet button - most important action */}
      <WalletButton />

      {/* Kebab button for TokenMint and ClearPath */}
      <button
        ref={buttonRef}
        className={`kebab-button ${isOpen ? 'active' : ''}`}
        onClick={toggleMenu}
        aria-label="More options"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="kebab-dot"></span>
        <span className="kebab-dot"></span>
        <span className="kebab-dot"></span>
      </button>

      {/* Backdrop + Dropdown */}
      {isOpen && (
        <>
          <div
            className="kebab-backdrop"
            onClick={(e) => {
              // Only close if clicking directly on backdrop, not on children
              if (e.target === e.currentTarget) {
                setIsOpen(false)
              }
            }}
            aria-hidden="true"
          />
          <div
            ref={menuRef}
            className="kebab-dropdown"
            role="menu"
            aria-label="Additional options"
          >
            <div className="kebab-dropdown-header">
              <span>More Options</span>
              <button
                className="kebab-close-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Close menu"
              >
                &times;
              </button>
            </div>
            <div className="kebab-dropdown-content">
              <div
                ref={tokenMintItemRef}
                className="kebab-menu-item"
                onClick={handleMenuItemClick(tokenMintItemRef)}
                role="menuitem"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleMenuItemClick(tokenMintItemRef)(e)
                  }
                }}
              >
                <TokenMintButton />
                <span className="kebab-item-label">Token Mint</span>
              </div>
              <div
                ref={clearPathItemRef}
                className="kebab-menu-item"
                onClick={handleMenuItemClick(clearPathItemRef)}
                role="menuitem"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleMenuItemClick(clearPathItemRef)(e)
                  }
                }}
              >
                <ClearPathButton />
                <span className="kebab-item-label">ClearPath</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default HeaderKebabMenu
