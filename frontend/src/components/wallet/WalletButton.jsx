import { useState, useEffect, useRef } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { useDex } from '../../hooks/useDex'
import { useNetworkMode } from '../../hooks/useNetworkMode'
import { useWalletRoles } from '../../hooks'
import { useWallet } from '../../hooks/useWalletManagement'
import { useRoleDetails } from '../../hooks/useRoleDetails'
import { useModal } from '../../hooks/useUI'
import { useClipboard } from '../../hooks/useClipboard'
import { ROLES, ROLE_INFO } from '../../contexts/RoleContext'
import { DEX_ADDRESSES, TOKENS } from '../../constants/dex'
import SensitiveValue from '../common/SensitiveValue'
import { WAGER_DEFAULTS } from '../../constants/wagerDefaults'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import NavIcon from '../nav/NavIcon'
import PremiumPurchaseModal from '../ui/PremiumPurchaseModal'
import AddressQRModal from '../ui/AddressQRModal'
import BuyCryptoModal from './BuyCryptoModal'
import { useActiveAccount } from '../../hooks/useActiveAccount'
import { onrampAvailable, fetchOnrampOptions } from '../../lib/onramp/onrampClient'
import { RoleDetailsSection } from './RoleDetailsCard'
import walletIcon from '../../assets/wallet_no_text.svg'
import './WalletButton.css'
import './RoleDetailsCard.css'

/**
 * WalletButton Component
 *
 * Header wallet control. Disconnected it is a single button that opens the
 * app's unified connect surface (spec 045 — ConnectModal via WalletContext,
 * the ONLY place connector choices render). Connected it shows the account
 * dropdown (roles, navigation, disconnect).
 */

// Pending-tx tracking lives in useFriendMarketCreation now.

function WalletButton({ className = '' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [showAddressQR, setShowAddressQR] = useState(false)
  const [showBuyCrypto, setShowBuyCrypto] = useState(false)
  // Buy crypto (spec 060) two-layer gate: static capability + gateway (onrampAvailable), then the
  // live catalog must CONFIRM the chain before the button renders — never a dead button (FR-006).
  // Stored as {chainId, ok} so a stale confirmation for another chain never leaks through the
  // derived flag below. Config-off leaves the sheet exactly as it is today.
  const [onrampCatalog, setOnrampCatalog] = useState(null)
  const { address, isConnected } = useAccount()
  const { openConnectModal, disconnectWallet } = useWallet()
  const chainId = useChainId()
  const navigate = useNavigate()
  const { showModal } = useModal()
  const { copied: addressCopied, copy: copyAddress } = useClipboard()
  const { balances, loading: balanceLoading } = useDex()
  const { network } = useNetworkMode()
  const { hasRole, rolesLoading, refreshRoles } = useWalletRoles()
  const {
    roleDetails,
    loading: roleDetailsLoading,
    refresh: refreshRoleDetails
  } = useRoleDetails()
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)
  // Purchases are delivered to the ACTIVE acting identity: the vault when operating as one,
  // else the connected wallet — funds land where the member is currently acting (spec 060).
  const { identity, isVault } = useActiveAccount()
  const buyDestination = isVault ? identity.vaultAddress : address

  // Confirm the live onramp catalog when the sheet opens (lazily — no gateway traffic until the
  // member actually opens their wallet sheet). Re-evaluated per chain; any failure keeps the
  // button hidden rather than dead.
  useEffect(() => {
    if (!isOpen || !isConnected || !onrampAvailable(chainId)) return undefined
    let cancelled = false
    fetchOnrampOptions(chainId).then(
      (opts) => {
        if (!cancelled) setOnrampCatalog({ chainId, ok: Boolean(opts?.available && (opts.assets ?? []).length > 0) })
      },
      () => {
        if (!cancelled) setOnrampCatalog({ chainId, ok: false })
      }
    )
    return () => {
      cancelled = true
    }
  }, [isOpen, isConnected, chainId])
  const onrampConfirmed = onrampAvailable(chainId) && onrampCatalog?.chainId === chainId && onrampCatalog.ok

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

  const handleDisconnect = () => {
    // Context disconnect: clears wagmi/WalletConnect persistence AND the
    // passkey session atomically — the raw wagmi disconnect() skipped that.
    disconnectWallet()
    setIsOpen(false)
  }

  const handleOpenPurchaseModal = (preselectedRole = null, action = 'purchase') => {
    setIsOpen(false)
    showModal(
      <PremiumPurchaseModal
        onClose={() => showModal(null)}
        preselectedRole={preselectedRole}
        action={action}
      />,
      {
        title: '',
        size: 'large',
        closable: false
      }
    )
  }

  const handleUpgradeRole = (roleName) => {
    handleOpenPurchaseModal(roleName, 'upgrade')
  }

  const handleExtendRole = (roleName) => {
    handleOpenPurchaseModal(roleName, 'extend')
  }

  const handleRefreshRoles = async () => {
    await Promise.all([refreshRoles(), refreshRoleDetails()])
  }

  const handleOpenAddressQR = () => {
    setIsOpen(false)
    setShowAddressQR(true)
  }

  const handleOpenBuyCrypto = () => {
    setIsOpen(false)
    setShowBuyCrypto(true)
  }

  const handleNavigateToAdmin = () => {
    setIsOpen(false)
    navigate('/admin')
  }

  const shortenAddress = (addr) => {
    if (!addr) return ''
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
  }

  return (
    <div className={`wallet-button-container ${className}`}>
      {!isConnected ? (
        <button
          ref={buttonRef}
          onClick={openConnectModal}
          className="wallet-connect-button"
          aria-label="Connect Wallet"
        >
          <img
            src={walletIcon}
            alt="Wallet"
            className="wallet-icon"
            width="24"
            height="24"
          />
          <span className="connect-text">Connect Wallet</span>
        </button>
      ) : (
        <>
          <button
            ref={buttonRef}
            onClick={toggleDropdown}
            className="wallet-account-button"
            aria-label="Wallet Account"
            aria-expanded={isOpen}
            aria-haspopup="true"
          >
            <BlockiesAvatar address={address} size={24} />
          </button>

          {isOpen && (
            <div 
              ref={dropdownRef}
              className="wallet-dropdown wallet-dropdown-extended"
              role="menu"
            >
              <div className="dropdown-header">
                <div className="account-info">
                  <BlockiesAvatar address={address} size={40} />
                  <div className="account-details">
                    <button
                      type="button"
                      className="account-address-full account-address-copy"
                      onClick={() => copyAddress(address)}
                      title={address}
                      aria-label={addressCopied ? 'Address copied' : 'Copy wallet address'}
                    >
                      <span className="account-address-value">
                        {addressCopied ? 'Copied!' : shortenAddress(address)}
                      </span>
                      <NavIcon
                        name={addressCopied ? 'check' : 'copy'}
                        size={13}
                        className="account-address-copy-icon"
                      />
                    </button>
                    <span className="usdc-balance">
                      {balanceLoading
                        ? 'Loading...'
                        : <><SensitiveValue>{parseFloat(balances?.stable || 0).toFixed(2)}</SensitiveValue> USDC</>}
                    </span>
                    <span className="network-info">{network?.name || `Chain ${chainId}`}</span>
                  </div>
                  {/* Buy crypto (spec 060): renders ONLY once the live catalog confirms the
                      active network — config-off / testnet / unsupported leaves the sheet
                      byte-identical to today. Beside the balance it tops up. */}
                  {onrampConfirmed && (
                    <button
                      type="button"
                      className="account-buy-btn"
                      onClick={handleOpenBuyCrypto}
                      aria-label="Buy crypto with Coinbase"
                      title="Buy crypto — delivered to this wallet"
                    >
                      Buy
                    </button>
                  )}
                  <button
                    type="button"
                    className="account-qr-btn"
                    onClick={handleOpenAddressQR}
                    aria-label="Show wallet address QR code"
                    title="Share address via QR code"
                  >
                    <NavIcon name="qrcode" size={18} />
                  </button>
                </div>
              </div>

              {/* Roles Section - Enhanced with details */}
              <div className="dropdown-section">
                <RoleDetailsSection
                  roleDetails={roleDetails}
                  loading={roleDetailsLoading || rolesLoading}
                  onUpgrade={handleUpgradeRole}
                  onExtend={handleExtendRole}
                  onPurchase={() => handleOpenPurchaseModal()}
                  onRefresh={handleRefreshRoles}
                />
              </div>

              {/* Wager creation & management now live on the Dashboard, so the
                  dropdown no longer carries "Create Wager" / "My Wagers". The
                  membership upsell stays for non-members. */}
              {!hasRole(ROLES.WAGER_PARTICIPANT) && (
                <div className="dropdown-section">
                  <span className="wallet-section-title">Wagers</span>
                  <div className="friend-market-promo">
                    <p className="promo-text">Create private wagers with friends!</p>
                    <button
                      onClick={() => handleOpenPurchaseModal()}
                      className="action-button purchase-access-btn"
                      role="menuitem"
                    >
                      <span className="action-icon" aria-hidden="true"><NavIcon name="key" size={16} /></span>
                      <span>Get Access - from $2 USDC / month</span>
                    </button>
                    <button
                      onClick={() => { setIsOpen(false); navigate('/vouchers#vch-redeem-h') }}
                      className="promo-voucher-link"
                      role="menuitem"
                    >
                      Have a voucher? Redeem it
                    </button>
                  </div>
                </div>
              )}

              {/* Account Actions \u2014 personal account entries live here (moved off
                  the section menu): Account, Membership, Preferences, plus the
                  membership purchase flow and Disconnect. */}
              <div className="dropdown-actions">
                <button
                  onClick={() => { setIsOpen(false); navigate('/wallet?tab=account') }}
                  className="action-button"
                  role="menuitem"
                >
                  <span className="action-icon" aria-hidden="true"><NavIcon name="user" size={16} /></span>
                  <span>Account</span>
                </button>
                {/* Membership entry is mutually exclusive with the purchase
                    upsell: members manage their membership, non-members buy in.
                    Never show both at once. */}
                {hasRole(ROLES.WAGER_PARTICIPANT) ? (
                  <button
                    onClick={() => { setIsOpen(false); navigate('/wallet?tab=membership') }}
                    className="action-button"
                    role="menuitem"
                  >
                    <span className="action-icon" aria-hidden="true"><NavIcon name="ticket" size={16} /></span>
                    <span>Membership</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleOpenPurchaseModal()}
                    className="action-button"
                    role="menuitem"
                  >
                    <span className="action-icon" aria-hidden="true"><NavIcon name="star" size={16} /></span>
                    <span>Purchase Membership</span>
                  </button>
                )}
                <button
                  onClick={() => { setIsOpen(false); navigate('/wallet?tab=preferences') }}
                  className="action-button"
                  role="menuitem"
                >
                  <span className="action-icon" aria-hidden="true"><NavIcon name="sliders" size={16} /></span>
                  <span>Preferences</span>
                </button>
                {hasRole(ROLES.ADMIN) && (
                  <button
                    onClick={handleNavigateToAdmin}
                    className="action-button"
                    role="menuitem"
                  >
                    <span className="action-icon" aria-hidden="true"><NavIcon name="key" size={16} /></span>
                    <span>Role Management</span>
                  </button>
                )}
                <button
                  onClick={handleDisconnect}
                  className="action-button disconnect-button"
                  role="menuitem"
                  aria-label="Disconnect wallet"
                >
                  <span className="action-icon" aria-hidden="true"><NavIcon name="power" size={16} /></span>
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Address QR Modal (spec 011) — quick variant: clean QR using the
          persisted Account-page color, no color options, no visible address.
          Mounted per open so the preference is re-read each time. */}
      {showAddressQR && (
        <AddressQRModal
          isOpen
          onClose={() => setShowAddressQR(false)}
          address={address}
          variant="quick"
        />
      )}

      {/* Buy crypto pre-handoff disclosure (spec 060). chainId/destination stay live props so a
          network switched after opening is re-validated before any handoff to Coinbase. */}
      {showBuyCrypto && (
        <BuyCryptoModal
          isOpen
          onClose={() => setShowBuyCrypto(false)}
          address={buyDestination}
          chainId={chainId}
        />
      )}
    </div>
  )
}

export default WalletButton
