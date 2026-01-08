import { useState, useEffect, useCallback, useRef } from 'react'
import { useRoles } from '../hooks/useRoles'
import { useWeb3 } from '../hooks/useWeb3'
import { useNotification } from '../hooks/useUI'
import { useAdminContracts, CONTRACT_STATE_REFRESH_INTERVAL } from '../hooks/useAdminContracts'
import { ROLES, ROLE_INFO, ADMIN_ROLES } from '../contexts/RoleContext'
import { isValidEthereumAddress } from '../utils/validation'
import { NETWORK_CONFIG, DEPLOYED_CONTRACTS } from '../config/contracts'
import './AdminPanel.css'

// Minimum withdrawal amount to prevent gas waste on dust transactions
const MIN_WITHDRAWAL_AMOUNT = 0.000000000000000001

// Maximum tier duration in days to prevent overflow issues
const MAX_TIER_DURATION_DAYS = 3650 // ~10 years

/**
 * Consolidated Admin Panel
 *
 * Provides a unified interface for all administrative functions:
 * - System overview and contract status
 * - Emergency controls (pause/unpause)
 * - Tier configuration for membership pricing
 * - On-chain role management
 * - Treasury withdrawals
 *
 * Access is restricted to users with administrative roles.
 */
function AdminPanel() {
  const { hasRole, hasAnyRole } = useRoles()
  const { account } = useWeb3()
  const { showNotification } = useNotification()
  const {
    isLoading,
    error,
    contractState,
    emergencyPause,
    emergencyUnpause,
    configureTier,
    grantTier,
    withdraw,
    fetchContractState
  } = useAdminContracts()

  const [activeTab, setActiveTab] = useState('overview')
  const [confirmAction, setConfirmAction] = useState(null)
  const [pendingTx, setPendingTx] = useState(false)
  
  // Refs for focus management in confirmation dialogs
  const confirmDialogRef = useRef(null)
  const previousFocusRef = useRef(null)

  // Check admin access with proper null checks
  const isAdmin = ROLES?.ADMIN ? hasRole(ROLES.ADMIN) : false
  const isOperationsAdmin = ROLES?.OPERATIONS_ADMIN ? hasRole(ROLES.OPERATIONS_ADMIN) : false
  const isEmergencyGuardian = ROLES?.EMERGENCY_GUARDIAN ? hasRole(ROLES.EMERGENCY_GUARDIAN) : false
  const hasAdminAccess = hasAnyRole(ADMIN_ROLES)

  // Note: Pause vs. unpause is intentionally asymmetric:
  // - ADMIN, OPERATIONS_ADMIN and EMERGENCY_GUARDIAN can trigger an emergency pause.
  // - Only ADMIN is allowed to unpause and restore normal operation.
  const canPause = isAdmin || isOperationsAdmin || isEmergencyGuardian
  const canUnpause = isAdmin // Only full admin can unpause
  const canConfigureTiers = isAdmin
  const canGrantRoles = isAdmin || isOperationsAdmin
  const canWithdraw = isAdmin

  // Tier Configuration State
  const [tierConfig, setTierConfig] = useState({
    roleKey: 'MARKET_MAKER_ROLE',
    tier: 1,
    price: '0.1',
    isActive: true
  })

  // Role Grant State
  const [roleGrant, setRoleGrant] = useState({
    roleKey: 'MARKET_MAKER_ROLE',
    userAddress: '',
    tier: 1,
    durationDays: 30
  })

  // Withdrawal State
  const [withdrawalData, setWithdrawalData] = useState({
    toAddress: '',
    amount: ''
  })

  // Refresh contract state periodically and clean up properly
  useEffect(() => {
    // Initial fetch
    fetchContractState()
    
    // Set up periodic refresh
    const interval = setInterval(() => {
      // Only fetch if not currently fetching to avoid race conditions
      fetchContractState()
    }, CONTRACT_STATE_REFRESH_INTERVAL)
    
    return () => {
      clearInterval(interval)
    }
  }, []) // Empty dependency array - only set up once on mount
  
  // Manage focus for confirmation dialogs
  useEffect(() => {
    if (confirmAction && confirmDialogRef.current) {
      previousFocusRef.current = document.activeElement
      confirmDialogRef.current.focus()
    } else if (!confirmAction && previousFocusRef.current) {
      previousFocusRef.current.focus()
      previousFocusRef.current = null
    }
  }, [confirmAction])
  
  // Handle Escape key to close dialog
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && confirmAction) {
        setConfirmAction(null)
      }
    }
    
    if (confirmAction) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [confirmAction])

  const handleEmergencyPause = useCallback(async () => {
    setPendingTx(true)
    try {
      await emergencyPause()
      showNotification('Contract paused successfully', 'success')
      setConfirmAction(null)
    } catch (err) {
      showNotification(err.message, 'error')
    } finally {
      setPendingTx(false)
    }
  }, [emergencyPause, showNotification])

  const handleEmergencyUnpause = useCallback(async () => {
    setPendingTx(true)
    try {
      await emergencyUnpause()
      showNotification('Contract unpaused successfully', 'success')
      setConfirmAction(null)
    } catch (err) {
      showNotification(err.message, 'error')
    } finally {
      setPendingTx(false)
    }
  }, [emergencyUnpause, showNotification])

  const handleConfigureTier = useCallback(async () => {
    const roleHash = contractState.roleHashes[tierConfig.roleKey]
    if (!roleHash || roleHash === null) {
      showNotification('Invalid role hash. Role may not exist on this contract.', 'error')
      return
    }
    
    // Validate price for potential issues
    const priceNum = parseFloat(tierConfig.price)
    if (priceNum === 0) {
      // Confirm setting a free tier using the confirmation dialog
      setConfirmAction({
        title: 'Confirm Free Tier',
        message: 'Setting price to 0 will make this a free tier. Are you sure you want to continue?',
        warning: 'Users will be able to access this tier without payment.',
        confirmText: 'Yes, Set as Free',
        danger: false,
        onConfirm: async () => {
          setPendingTx(true)
          try {
            await configureTier(roleHash, tierConfig.tier, tierConfig.price, tierConfig.isActive)
            showNotification('Tier configured successfully', 'success')
            setConfirmAction(null)
          } catch (err) {
            showNotification(err.message, 'error')
          } finally {
            setPendingTx(false)
          }
        }
      })
      return
    }

    setPendingTx(true)
    try {
      await configureTier(roleHash, tierConfig.tier, tierConfig.price, tierConfig.isActive)
      showNotification('Tier configured successfully', 'success')
    } catch (err) {
      showNotification(err.message, 'error')
    } finally {
      setPendingTx(false)
    }
  }, [tierConfig, contractState.roleHashes, configureTier, showNotification])

  const handleGrantTier = useCallback(async () => {
    if (!isValidEthereumAddress(roleGrant.userAddress)) {
      showNotification('Invalid Ethereum address', 'error')
      return
    }

    const roleHash = contractState.roleHashes[roleGrant.roleKey]
    if (!roleHash || roleHash === null) {
      showNotification('Invalid role hash. Role may not exist on this contract.', 'error')
      return
    }
    
    // Validate duration (tiered membership deployments only)
    if (contractState.supportsTiers && roleGrant.durationDays > MAX_TIER_DURATION_DAYS) {
      showNotification(`Duration cannot exceed ${MAX_TIER_DURATION_DAYS} days`, 'error')
      return
    }

    setPendingTx(true)
    try {
      if (contractState.supportsTiers) {
        await grantTier(roleGrant.userAddress, roleHash, roleGrant.tier, roleGrant.durationDays)
        showNotification('Tier granted successfully', 'success')
      } else {
        await grantRoleOnChain(roleHash, roleGrant.userAddress)
        showNotification('Role granted successfully', 'success')
      }
      setRoleGrant(prev => ({ ...prev, userAddress: '' }))
    } catch (err) {
      showNotification(err.message, 'error')
    } finally {
      setPendingTx(false)
    }
  }, [roleGrant, contractState.roleHashes, contractState.supportsTiers, grantTier, grantRoleOnChain, showNotification])

  const handleWithdraw = useCallback(async () => {
    if (!isValidEthereumAddress(withdrawalData.toAddress)) {
      showNotification('Invalid recipient address', 'error')
      return
    }

    const rawAmount = (withdrawalData.amount ?? '').toString().trim()

    // Validate amount: non-empty, valid decimal string, finite, and above minimum
    if (!rawAmount) {
      showNotification('Invalid withdrawal amount', 'error')
      return
    }

    // Allow decimal representations like '0.5', '.5', '5.0', and '5'
    if (!/^\d+(\.\d*)?$|^\.\d+$/.test(rawAmount)) {
      showNotification('Invalid withdrawal amount format', 'error')
      return
    }

    const amountNum = Number(rawAmount)
    if (!Number.isFinite(amountNum) || amountNum < MIN_WITHDRAWAL_AMOUNT) {
      showNotification('Invalid withdrawal amount', 'error')
      return
    }
    
    // Check if amount exceeds contract balance
    const contractBalanceNum = parseFloat(contractState.contractBalance)
    if (amountNum > contractBalanceNum) {
      showNotification(`Withdrawal amount exceeds contract balance (${contractState.contractBalance} ETC)`, 'error')
      return
    }

    setPendingTx(true)
    try {
      await withdraw(withdrawalData.toAddress, rawAmount)
      showNotification('Withdrawal successful', 'success')
      setWithdrawalData({ toAddress: '', amount: '' })
      setConfirmAction(null)
    } catch (err) {
      showNotification(err.message, 'error')
    } finally {
      setPendingTx(false)
    }
  }, [withdrawalData, contractState.contractBalance, withdraw, showNotification])

  const shortenAddress = (address) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  // Available on-chain roles for dropdowns
  const onChainRoles = [
    { key: 'MARKET_MAKER_ROLE', name: 'Market Maker' },
    { key: 'CLEARPATH_USER_ROLE', name: 'ClearPath User' },
    { key: 'TOKENMINT_ROLE', name: 'Token Mint' },
    { key: 'FRIEND_MARKET_ROLE', name: 'Friend Markets' },
    { key: 'EMERGENCY_GUARDIAN_ROLE', name: 'Emergency Guardian' },
    { key: 'OPERATIONS_ADMIN_ROLE', name: 'Operations Admin' },
    { key: 'CORE_SYSTEM_ADMIN_ROLE', name: 'Core System Admin' },
    { key: 'OVERSIGHT_COMMITTEE_ROLE', name: 'Oversight Committee' }
  ]

  // Unauthorized view
  if (!hasAdminAccess) {
    return (
      <div className="admin-panel">
        <div className="admin-unauthorized">
          <div className="unauthorized-icon" aria-hidden="true">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2>Access Restricted</h2>
          <p>This admin panel is only accessible to users with administrative privileges.</p>
          <p className="unauthorized-hint">
            Administrative roles include: Administrator, Operations Admin, Emergency Guardian, and Oversight Committee.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-panel">
      {/* Header */}
      <header className="admin-panel-header">
        <div className="admin-panel-header-content">
          <div className="admin-panel-title-section">
            <h1>Admin Panel</h1>
            <span className="admin-badge">
              {isAdmin ? 'Full Admin' :
               isOperationsAdmin ? 'Operations' :
               isEmergencyGuardian ? 'Guardian' : 'Committee'}
            </span>
          </div>
          <p className="admin-panel-subtitle">
            Consolidated administrative controls for contract management
          </p>
        </div>
        <div className="admin-panel-status">
          <div className={`status-indicator ${contractState.isPaused ? 'paused' : 'active'}`}>
            <span className="status-dot"></span>
            <span className="status-text">
              {contractState.isPaused ? 'Paused' : 'Active'}
            </span>
          </div>
        </div>
      </header>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div 
          className="confirm-overlay" 
          role="dialog" 
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={(e) => {
            // Close on backdrop click
            if (e.target.classList.contains('confirm-overlay')) {
              setConfirmAction(null)
            }
          }}
        >
          <div 
            className="confirm-dialog"
            ref={confirmDialogRef}
            tabIndex={-1}
          >
            <h3 id="confirm-dialog-title">{confirmAction.title}</h3>
            <p>{confirmAction.message}</p>
            {confirmAction.warning && (
              <div className="confirm-warning">
                <span className="warning-icon">!</span>
                {confirmAction.warning}
              </div>
            )}
            <div className="confirm-actions">
              <button
                onClick={confirmAction.onConfirm}
                className={`confirm-btn ${confirmAction.danger ? 'danger' : 'primary'}`}
                disabled={pendingTx}
              >
                {pendingTx ? 'Processing...' : confirmAction.confirmText}
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="confirm-btn secondary"
                disabled={pendingTx}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <nav className="admin-panel-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'overview'}
          className={`admin-panel-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <span className="tab-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
          </span>
          Overview
        </button>

        {canPause && (
          <button
            role="tab"
            aria-selected={activeTab === 'emergency'}
            className={`admin-panel-tab ${activeTab === 'emergency' ? 'active' : ''}`}
            onClick={() => setActiveTab('emergency')}
          >
            <span className="tab-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </span>
            Emergency
          </button>
        )}

        {canConfigureTiers && (
          <button
            role="tab"
            aria-selected={activeTab === 'tiers'}
            className={`admin-panel-tab ${activeTab === 'tiers' ? 'active' : ''}`}
            onClick={() => setActiveTab('tiers')}
          >
            <span className="tab-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </span>
            Tiers
          </button>
        )}

        {canGrantRoles && (
          <button
            role="tab"
            aria-selected={activeTab === 'roles'}
            className={`admin-panel-tab ${activeTab === 'roles' ? 'active' : ''}`}
            onClick={() => setActiveTab('roles')}
          >
            <span className="tab-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </span>
            Roles
          </button>
        )}

        {canWithdraw && (
          <button
            role="tab"
            aria-selected={activeTab === 'treasury'}
            className={`admin-panel-tab ${activeTab === 'treasury' ? 'active' : ''}`}
            onClick={() => setActiveTab('treasury')}
          >
            <span className="tab-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </span>
            Treasury
          </button>
        )}
      </nav>

      {/* Tab Content */}
      <main className="admin-panel-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="overview-grid">
              {/* System Status Card */}
              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>System Status</h3>
                  <button
                    onClick={fetchContractState}
                    className="refresh-btn"
                    aria-label="Refresh status"
                    disabled={isLoading}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 4v6h-6"/>
                      <path d="M1 20v-6h6"/>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                  </button>
                </div>
                <div className="status-details">
                  <div className="status-row">
                    <span className="status-label">Contract State</span>
                    <span className={`status-value ${contractState.isPaused ? 'paused' : 'active'}`}>
                      {contractState.isPaused ? 'Paused' : 'Active'}
                    </span>
                  </div>
                  <div className="status-row">
                    <span className="status-label">Contract Balance</span>
                    <span className="status-value">{contractState.contractBalance} ETC</span>
                  </div>
                  <div className="status-row">
                    <span className="status-label">Network</span>
                    <span className="status-value">{NETWORK_CONFIG.name}</span>
                  </div>
                </div>
              </div>

              {/* Your Permissions Card */}
              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>Your Permissions</h3>
                </div>
                <div className="permissions-list">
                  <div className={`permission-item ${canPause ? 'enabled' : 'disabled'}`}>
                    <span className="permission-icon">{canPause ? '✓' : '×'}</span>
                    <span className="permission-name">Emergency Pause</span>
                  </div>
                  <div className={`permission-item ${canUnpause ? 'enabled' : 'disabled'}`}>
                    <span className="permission-icon">{canUnpause ? '✓' : '×'}</span>
                    <span className="permission-name">Emergency Unpause</span>
                  </div>
                  <div className={`permission-item ${canConfigureTiers ? 'enabled' : 'disabled'}`}>
                    <span className="permission-icon">{canConfigureTiers ? '✓' : '×'}</span>
                    <span className="permission-name">Configure Tiers</span>
                  </div>
                  <div className={`permission-item ${canGrantRoles ? 'enabled' : 'disabled'}`}>
                    <span className="permission-icon">{canGrantRoles ? '✓' : '×'}</span>
                    <span className="permission-name">Grant Roles</span>
                  </div>
                  <div className={`permission-item ${canWithdraw ? 'enabled' : 'disabled'}`}>
                    <span className="permission-icon">{canWithdraw ? '✓' : '×'}</span>
                    <span className="permission-name">Withdraw Funds</span>
                  </div>
                </div>
              </div>

              {/* Contract Addresses Card */}
              <div className="admin-card full-width">
                <div className="admin-card-header">
                  <h3>Contract Addresses</h3>
                </div>
                <div className="contract-addresses">
                  {Object.entries(DEPLOYED_CONTRACTS).map(([name, address]) => (
                    <div key={name} className="contract-row">
                      <span className="contract-name">{name}</span>
                      <code className="contract-address" title={address}>
                        {shortenAddress(address)}
                      </code>
                      <a
                        href={`${NETWORK_CONFIG.blockExplorer}/address/${address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="contract-link"
                        aria-label={`View ${name} on block explorer`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15,3 21,3 21,9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Emergency Tab */}
        {activeTab === 'emergency' && canPause && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="emergency-section">
              <div className="admin-card warning-card">
                <div className="admin-card-header">
                  <h3>Emergency Controls</h3>
                </div>
                <div className="emergency-info">
                  <p className="info-text">
                    Emergency controls allow authorized personnel to pause contract operations
                    when security issues are detected. Use with caution.
                  </p>
                  <div className="current-state">
                    <span className="state-label">Current State:</span>
                    <span className={`state-badge ${contractState.isPaused ? 'paused' : 'active'}`}>
                      {contractState.isPaused ? 'PAUSED' : 'ACTIVE'}
                    </span>
                  </div>
                </div>

                <div className="emergency-actions">
                  {!contractState.isPaused ? (
                    <div className="action-block">
                      <h4>Pause Contract</h4>
                      <p className="action-description">
                        Pausing will halt all user-facing operations including tier purchases
                        and membership renewals. Administrative functions will remain accessible.
                      </p>
                      <button
                        onClick={() => setConfirmAction({
                          title: 'Confirm Emergency Pause',
                          message: 'This will pause all user-facing contract operations. Users will not be able to purchase tiers or interact with the contract until it is unpaused.',
                          warning: 'This action should only be taken in response to a security incident or critical bug.',
                          confirmText: 'Pause Contract',
                          danger: true,
                          onConfirm: handleEmergencyPause
                        })}
                        className="emergency-btn pause"
                        disabled={pendingTx || isLoading}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="6" y="4" width="4" height="16"/>
                          <rect x="14" y="4" width="4" height="16"/>
                        </svg>
                        Emergency Pause
                      </button>
                    </div>
                  ) : (
                    <div className="action-block">
                      <h4>Unpause Contract</h4>
                      <p className="action-description">
                        Unpausing will restore normal contract operations. Ensure any security
                        issues have been fully resolved before unpausing.
                      </p>
                      {canUnpause ? (
                        <button
                          onClick={() => setConfirmAction({
                            title: 'Confirm Unpause',
                            message: 'This will restore normal contract operations. Make sure any security issues have been resolved.',
                            confirmText: 'Unpause Contract',
                            danger: false,
                            onConfirm: handleEmergencyUnpause
                          })}
                          className="emergency-btn unpause"
                          disabled={pendingTx || isLoading}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="5,3 19,12 5,21"/>
                          </svg>
                          Unpause Contract
                        </button>
                      ) : (
                        <div className="permission-notice">
                          <span className="notice-icon">!</span>
                          Only the Administrator role can unpause the contract.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tiers Tab */}
        {activeTab === 'tiers' && canConfigureTiers && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="tiers-grid">
              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>Configure Tier Pricing</h3>
                </div>
                <p className="card-info">
                  Set the price and availability for membership tiers. Each role can have
                  multiple tiers (Bronze, Silver, Gold, Platinum) with different pricing.
                </p>

                <div className="tier-form">
                  {!contractState.supportsTiers && (
                    <div className="permission-notice">
                      <span className="notice-icon">!</span>
                      Tier pricing is not available on this deployment. Deploy the modular tier extensions to enable tiers.
                    </div>
                  )}
                  <div className="form-group">
                    <label htmlFor="tier-role">Role</label>
                    <select
                      id="tier-role"
                      value={tierConfig.roleKey}
                      onChange={(e) => setTierConfig(prev => ({ ...prev, roleKey: e.target.value }))}
                      className="admin-select"
                    >
                      {onChainRoles.map(role => (
                        <option key={role.key} value={role.key}>{role.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="tier-level">Tier Level</label>
                    <select
                      id="tier-level"
                      value={tierConfig.tier}
                      onChange={(e) => setTierConfig(prev => ({ ...prev, tier: Number(e.target.value) }))}
                      className="admin-select"
                    >
                      <option value={1}>Bronze</option>
                      <option value={2}>Silver</option>
                      <option value={3}>Gold</option>
                      <option value={4}>Platinum</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="tier-price">Price (ETC)</label>
                    <input
                      id="tier-price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={tierConfig.price}
                      onChange={(e) => setTierConfig(prev => ({ ...prev, price: e.target.value }))}
                      className="admin-input"
                      placeholder="0.1"
                    />
                  </div>

                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={tierConfig.isActive}
                        onChange={(e) => setTierConfig(prev => ({ ...prev, isActive: e.target.checked }))}
                      />
                      <span className="checkbox-text">Tier is active (available for purchase)</span>
                    </label>
                  </div>

                  <button
                    onClick={handleConfigureTier}
                    className="admin-btn primary"
                    disabled={pendingTx || isLoading || !contractState.supportsTiers}
                  >
                    {pendingTx ? 'Configuring...' : 'Configure Tier'}
                  </button>
                </div>
              </div>

              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>Tier Information</h3>
                </div>
                <div className="tier-info-list">
                  <div className="tier-info-item bronze">
                    <span className="tier-name">Bronze</span>
                    <span className="tier-desc">Entry level access with basic features</span>
                  </div>
                  <div className="tier-info-item silver">
                    <span className="tier-name">Silver</span>
                    <span className="tier-desc">Enhanced access with additional capabilities</span>
                  </div>
                  <div className="tier-info-item gold">
                    <span className="tier-name">Gold</span>
                    <span className="tier-desc">Premium access with priority features</span>
                  </div>
                  <div className="tier-info-item platinum">
                    <span className="tier-name">Platinum</span>
                    <span className="tier-desc">Full access with all features unlocked</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Roles Tab */}
        {activeTab === 'roles' && canGrantRoles && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="roles-grid">
              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>{contractState.supportsTiers ? 'Grant Role & Tier' : 'Grant Role'}</h3>
                </div>
                <p className="card-info">
                  {contractState.supportsTiers
                    ? 'Grant a role with a specific tier to a user. This creates an on-chain record of their membership with an expiration date.'
                    : 'Grant a role to a user using on-chain AccessControl (no tiered membership extensions deployed).'}
                </p>

                <div className="role-form">
                  <div className="form-group">
                    <label htmlFor="grant-address">User Address</label>
                    <input
                      id="grant-address"
                      type="text"
                      value={roleGrant.userAddress}
                      onChange={(e) => setRoleGrant(prev => ({ ...prev, userAddress: e.target.value }))}
                      className="admin-input"
                      placeholder="0x..."
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="grant-role">Role</label>
                    <select
                      id="grant-role"
                      value={roleGrant.roleKey}
                      onChange={(e) => setRoleGrant(prev => ({ ...prev, roleKey: e.target.value }))}
                      className="admin-select"
                    >
                      {onChainRoles.map(role => (
                        <option key={role.key} value={role.key}>{role.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="grant-tier">Tier</label>
                      <select
                        id="grant-tier"
                        value={roleGrant.tier}
                        onChange={(e) => setRoleGrant(prev => ({ ...prev, tier: Number(e.target.value) }))}
                        className="admin-select"
                        disabled={!contractState.supportsTiers}
                      >
                        <option value={1}>Bronze</option>
                        <option value={2}>Silver</option>
                        <option value={3}>Gold</option>
                        <option value={4}>Platinum</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="grant-duration">Duration (days)</label>
                      <input
                        id="grant-duration"
                        type="number"
                        min="1"
                        max={MAX_TIER_DURATION_DAYS}
                        value={roleGrant.durationDays}
                        onChange={(e) => setRoleGrant(prev => ({ ...prev, durationDays: Number(e.target.value) }))}
                        className="admin-input"
                        placeholder="30"
                        disabled={!contractState.supportsTiers}
                      />
                      <small className="input-hint">Maximum: {MAX_TIER_DURATION_DAYS} days</small>
                    </div>
                  </div>

                  <button
                    onClick={handleGrantTier}
                    className="admin-btn primary"
                    disabled={pendingTx || isLoading || !roleGrant.userAddress}
                  >
                    {pendingTx ? 'Granting...' : (contractState.supportsTiers ? 'Grant Role & Tier' : 'Grant Role')}
                  </button>
                </div>
              </div>

              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>Role Hierarchy</h3>
                </div>
                <div className="role-hierarchy">
                  <div className="hierarchy-item level-0">
                    <span className="hierarchy-name">Default Admin</span>
                    <span className="hierarchy-desc">Contract owner, full control</span>
                  </div>
                  <div className="hierarchy-item level-1">
                    <span className="hierarchy-name">Core System Admin</span>
                    <span className="hierarchy-desc">Requires 3-sig, 7-day timelock</span>
                  </div>
                  <div className="hierarchy-item level-2">
                    <span className="hierarchy-name">Operations Admin</span>
                    <span className="hierarchy-desc">Day-to-day ops, 2-sig, 2-day timelock</span>
                  </div>
                  <div className="hierarchy-item level-3">
                    <span className="hierarchy-name">Emergency Guardian</span>
                    <span className="hierarchy-desc">Can pause contracts</span>
                  </div>
                  <div className="hierarchy-item level-3">
                    <span className="hierarchy-name">User Roles</span>
                    <span className="hierarchy-desc">Market Maker, ClearPath, etc.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Treasury Tab */}
        {activeTab === 'treasury' && canWithdraw && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="treasury-section">
              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>Treasury Balance</h3>
                </div>
                <div className="balance-display">
                  <span className="balance-value">{contractState.contractBalance}</span>
                  <span className="balance-unit">ETC</span>
                </div>
                <p className="card-info">
                  Funds collected from tier purchases are held in the contract.
                  Withdrawals require administrator privileges.
                </p>
              </div>

              <div className="admin-card">
                <div className="admin-card-header">
                  <h3>Withdraw Funds</h3>
                </div>
                <p className="card-info warning-text">
                  <span className="warning-icon">!</span>
                  Withdrawals are irreversible. Double-check the recipient address before confirming.
                </p>

                <div className="withdraw-form">
                  <div className="form-group">
                    <label htmlFor="withdraw-address">Recipient Address</label>
                    <input
                      id="withdraw-address"
                      type="text"
                      value={withdrawalData.toAddress}
                      onChange={(e) => setWithdrawalData(prev => ({ ...prev, toAddress: e.target.value }))}
                      className="admin-input"
                      placeholder="0x..."
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="withdraw-amount">Amount (ETC)</label>
                    <div className="input-with-action">
                      <input
                        id="withdraw-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        max={contractState.contractBalance}
                        value={withdrawalData.amount}
                        onChange={(e) => setWithdrawalData(prev => ({ ...prev, amount: e.target.value }))}
                        className="admin-input"
                        placeholder="0.0"
                      />
                      <button
                        type="button"
                        className="max-btn"
                        onClick={() => setWithdrawalData(prev => ({ ...prev, amount: contractState.contractBalance }))}
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => setConfirmAction({
                      title: 'Confirm Withdrawal',
                      message: `You are about to withdraw ${withdrawalData.amount} ETC to ${shortenAddress(withdrawalData.toAddress)}.`,
                      warning: 'This action cannot be undone. Please verify the recipient address is correct.',
                      confirmText: 'Confirm Withdrawal',
                      danger: true,
                      onConfirm: handleWithdraw
                    })}
                    className="admin-btn primary"
                    disabled={
                      pendingTx ||
                      isLoading ||
                      !withdrawalData.toAddress ||
                      !withdrawalData.amount ||
                      parseFloat(withdrawalData.amount) <= 0
                    }
                  >
                    {pendingTx ? 'Processing...' : 'Withdraw'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default AdminPanel
