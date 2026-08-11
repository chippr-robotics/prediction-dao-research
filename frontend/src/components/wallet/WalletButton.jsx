import { useState, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
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
import LegacyUnlockDialog from '../account/LegacyUnlockDialog'
import { useEffectiveAccount } from '../../hooks/useEffectiveAccount'
import { useAccountSwitcher, ACCOUNT_KIND_TAG, shortAccountAddr } from '../../hooks/useAccountSwitcher'
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
  // Buy crypto (spec 081) two-layer gate: static capability + gateway (onrampAvailable), then the
  // live catalog must CONFIRM the chain before the button renders — never a dead button (FR-006).
  // Stored as {chainId, ok} so a stale confirmation for another chain never leaks through the
  // derived flag below. Config-off leaves the sheet exactly as it is today.
  const [onrampCatalog, setOnrampCatalog] = useState(null)
  const { address, isConnected } = useAccount()
  // Spec 063 (US1): the whole wallet identity — biticon, address, copy, balance, QR — reflects the
  // account the member is ACTING AS (personal / multisig / recovered), not always the connected
  // passkey, so it's obvious at a glance which account they're using. Falls back to the connected
  // wallet when no acting account is selected.
  const { address: actingAddress, label: actingLabel, type: actingType, isActingAccount } = useEffectiveAccount()
  const displayAddress = actingAddress || address
  const acctTypeLabel = actingType === 'vault' ? 'Multisig' : actingType === 'legacy' ? 'Recovered' : actingType === 'derived' ? 'Recovered' : null
  // Acting-account switcher, surfaced as a caret dropdown ON the wallet biticon (spec 063 follow-up):
  // picking an account switches the active identity so the biticon, address, balance, copy, and QR all
  // follow it — no separate "Acting as" row.
  const { accounts, currentId, choose, unlockEntry, setUnlockEntry, onUnlocked, hasChoices } = useAccountSwitcher()
  const [acctMenuOpen, setAcctMenuOpen] = useState(false)
  const { openConnectModal, disconnectWallet } = useWallet()
  const navigate = useNavigate()
  const { showModal } = useModal()
  const { copied: addressCopied, copy: copyAddress } = useClipboard()
  const { balances, loading: balanceLoading } = useDex()
  // Both from the same source (issue #1030) — the chip used to pair `useChainId()`'s
  // config-resolved id with `useNetworkMode()`'s network, so on an unconfigured chain the
  // `Chain ${chainId}` fallback would have named the wrong chain too.
  const { network, chainId } = useNetworkMode()
  const { hasRole, rolesLoading, refreshRoles } = useWalletRoles()
  const {
    roleDetails,
    loading: roleDetailsLoading,
    refresh: refreshRoleDetails
  } = useRoleDetails()
  const dropdownRef = useRef(null)
  const buttonRef = useRef(null)
  // Purchases are delivered to the ACTIVE acting identity: the vault when operating as one,
  // else the connected wallet — funds land where the member is currently acting (spec 081).
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

  // Collapse the acting-account menu whenever the wallet dropdown itself closes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset when the dropdown closes
    if (!isOpen) setAcctMenuOpen(false)
  }, [isOpen])

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
            <BlockiesAvatar address={displayAddress} size={24} />
          </button>

          {isOpen && (
            <div 
              ref={dropdownRef}
              className="wallet-dropdown wallet-dropdown-extended"
              role="menu"
            >
              <div className="dropdown-header">
                <div className="account-info">
                  {/* The biticon IS the acting-account switcher: a caret expands the
                      "act as" options (personal / multisig / recovered). Picking one
                      switches the active identity so the biticon, address, balance,
                      copy, and QR below all follow it. With only the personal wallet
                      there's nothing to switch, so it's a plain avatar (no caret). */}
                  {hasChoices ? (
                    <button
                      type="button"
                      className="account-identity-trigger"
                      onClick={() => setAcctMenuOpen((o) => !o)}
                      aria-haspopup="listbox"
                      aria-expanded={acctMenuOpen}
                      aria-label="Change acting account"
                    >
                      <BlockiesAvatar address={displayAddress} size={40} />
                      <span className="account-caret" aria-hidden="true">▾</span>
                    </button>
                  ) : (
                    <BlockiesAvatar address={displayAddress} size={40} />
                  )}
                  <div className="account-details">
                    <button
                      type="button"
                      className="account-address-full account-address-copy"
                      onClick={() => copyAddress(displayAddress)}
                      title={displayAddress}
                      aria-label={addressCopied ? 'Address copied' : 'Copy account address'}
                    >
                      <span className="account-address-value">
                        {addressCopied ? 'Copied!' : shortenAddress(displayAddress)}
                      </span>
                      <NavIcon
                        name={addressCopied ? 'check' : 'copy'}
                        size={13}
                        className="account-address-copy-icon"
                      />
                    </button>
                    {isActingAccount && (
                      <span className="account-acting-tag">{actingLabel || acctTypeLabel}</span>
                    )}
                    <span className="usdc-balance">
                      {balanceLoading
                        ? 'Loading...'
                        : <><SensitiveValue>{parseFloat(balances?.stable || 0).toFixed(2)}</SensitiveValue> USDC</>}
                    </span>
                    <span className="network-info">{network?.name || `Chain ${chainId}`}</span>
                  </div>
                  {/* Buy crypto (spec 081): renders ONLY once the live catalog confirms the
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

                  {acctMenuOpen && hasChoices && (
                    <ul className="account-switch-menu" role="listbox" aria-label="Act as account">
                      {accounts.map((acc) => (
                        <li key={acc.id} role="option" aria-selected={acc.id === currentId}>
                          <button
                            type="button"
                            className="account-switch-opt"
                            onClick={() => { choose(acc); setAcctMenuOpen(false) }}
                          >
                            <BlockiesAvatar address={acc.address} size={20} />
                            <span className="account-switch-label">
                              {acc.label || shortAccountAddr(acc.address)}
                              {ACCOUNT_KIND_TAG[acc.kind] && (
                                <span className="account-switch-tag">{ACCOUNT_KIND_TAG[acc.kind]}</span>
                              )}
                            </span>
                            <span className="account-switch-addr">{shortAccountAddr(acc.address)}</span>
                            {acc.id === currentId && <span className="account-switch-check" aria-hidden="true">✓</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <LegacyUnlockDialog
                  open={Boolean(unlockEntry)}
                  entry={unlockEntry}
                  onClose={() => setUnlockEntry(null)}
                  onUnlocked={onUnlocked}
                />
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
                  the section menu): Account, Membership, Network, Preferences, plus
                  the membership purchase flow and Disconnect. */}
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
                {/* Network settings sit beside Preferences (spec 069) — RPC endpoints,
                    failover and API keys are member configuration, not a Tools section. */}
                <button
                  onClick={() => { setIsOpen(false); navigate('/wallet?tab=network') }}
                  className="action-button"
                  role="menuitem"
                >
                  <span className="action-icon" aria-hidden="true"><NavIcon name="globe" size={16} /></span>
                  <span>Network</span>
                </button>
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
          address={displayAddress}
          variant="quick"
        />
      )}

      {/* Buy crypto pre-handoff disclosure (spec 081). chainId/destination stay live props so a
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
