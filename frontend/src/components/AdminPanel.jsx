import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { useRoles } from '../hooks/useRoles'
import { useWeb3 } from '../hooks/useWeb3'
import { useNotification } from '../hooks/useUI'
import { useEnsResolution } from '../hooks/useEnsResolution'
import { useChainTokens } from '../hooks/useChainTokens'
import { ROLES, ADMIN_ROLES } from '../contexts/RoleContext'
import { isValidEthereumAddress } from '../utils/validation'
import { NETWORK_CONFIG, DEPLOYED_CONTRACTS, getContractAddressForChain } from '../config/contracts'
import { getProvider } from '../utils/blockchainService'
import { MEMBERSHIP_MANAGER_ABI } from '../abis/MembershipManager'
import OracleAdaptersTab from './admin/OracleAdaptersTab'
import DenyListAdmin from './admin/DenyListAdmin'
import './AdminPanel.css'

const TIER_NAMES = { 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Platinum' }
const USDC_DECIMALS = 6

const ROLE_HASHES = {
  WAGER_PARTICIPANT: ethers.keccak256(ethers.toUtf8Bytes('WAGER_PARTICIPANT_ROLE')),
  GUARDIAN: ethers.keccak256(ethers.toUtf8Bytes('GUARDIAN_ROLE')),
  ACCOUNT_MODERATOR: ethers.keccak256(ethers.toUtf8Bytes('ACCOUNT_MODERATOR_ROLE')),
  ROLE_MANAGER: ethers.keccak256(ethers.toUtf8Bytes('ROLE_MANAGER_ROLE')),
  DEFAULT_ADMIN: ethers.ZeroHash,
}

// Minimal ABI fragments — we read/write enough of WagerRegistry +
// MembershipManager that pulling the full artifacts would be overkill, and the
// JSON ABIs may not yet be regenerated after the rename.
const WAGER_REGISTRY_ADMIN_ABI = [
  'function paused() view returns (bool)',
  'function pause()',
  'function unpause()',
  'function isFrozen(address user) view returns (bool)',
  'function freezeAccount(address user, string reason)',
  'function unfreezeAccount(address user)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
]

const MEMBERSHIP_ADMIN_ABI = [
  'function setTier(bytes32 role, uint8 tier, uint128 priceUSDC, uint32 durationDays, (uint32 monthlyMarketCreation,uint32 maxConcurrentMarkets) limits, bool active)',
  'function grantMembership(address user, bytes32 role, uint8 tier, uint32 durationDays)',
  'function revokeMembership(address user, bytes32 role)',
  'function withdrawFees(uint128 amount, address to)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  'function accruedFees() view returns (uint128)',
  'function treasury() view returns (address)',
]

function shortAddr(address) {
  return address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : ''
}

/**
 * Admin Panel — gated per-tab by the on-chain role each action requires.
 *
 * Tabs:
 *   Overview          (any admin role)
 *   Emergency         (GUARDIAN_ROLE)
 *   Tiers             (DEFAULT_ADMIN_ROLE)
 *   Members           (ROLE_MANAGER_ROLE)
 *   Account Moderation (ACCOUNT_MODERATOR_ROLE)
 *   Admin Roles       (DEFAULT_ADMIN_ROLE)
 *   Treasury          (DEFAULT_ADMIN_ROLE)
 */
function AdminPanel() {
  const { hasRole, hasAnyRole } = useRoles()
  const { account, signer, provider, chainId } = useWeb3()
  const { showNotification } = useNotification()
  const { native: nativeSymbol } = useChainTokens()

  const isAdmin = hasRole(ROLES.ADMIN)
  const isGuardian = hasRole(ROLES.GUARDIAN)
  const isAccountModerator = hasRole(ROLES.ACCOUNT_MODERATOR)
  const isRoleManager = hasRole(ROLES.ROLE_MANAGER)
  const hasAdminAccess = hasAnyRole(ADMIN_ROLES)

  const [activeTab, setActiveTab] = useState('overview')
  const [pendingTx, setPendingTx] = useState(false)
  const [contractState, setContractState] = useState({
    isPaused: false,
    accruedFees: '0',
    treasury: '',
    isLoaded: false,
  })

  // Tier configuration form
  const [tierForm, setTierForm] = useState({
    tier: 1, price: '2', durationDays: 30, monthly: 15, concurrent: 5, active: true
  })

  // Membership grant form
  const [grantForm, setGrantForm] = useState({
    address: '', tier: 1, durationDays: 30
  })
  const grantEns = useEnsResolution(grantForm.address || '')

  // Revoke membership form
  const [revokeForm, setRevokeForm] = useState({ address: '' })
  const revokeEns = useEnsResolution(revokeForm.address || '')

  // Freeze form
  const [freezeForm, setFreezeForm] = useState({ address: '', reason: '' })
  const freezeEns = useEnsResolution(freezeForm.address || '')

  // Admin-role grant/revoke form
  const [adminRoleForm, setAdminRoleForm] = useState({ address: '', role: 'GUARDIAN' })
  const adminRoleEns = useEnsResolution(adminRoleForm.address || '')

  // Withdraw form
  const [withdrawForm, setWithdrawForm] = useState({ to: '', amount: '' })
  // Default the withdrawal recipient to the on-chain treasury (the configured
  // sales destination) until the admin types a different address.
  useEffect(() => {
    if (contractState.treasury) {
      setWithdrawForm((f) => (f.to ? f : { ...f, to: contractState.treasury }))
    }
  }, [contractState.treasury])
  const withdrawEns = useEnsResolution(withdrawForm.to || '')

  const wagerRegistryAddr = getContractAddressForChain('wagerRegistry', chainId)
  const membershipManagerAddr = getContractAddressForChain('membershipManager', chainId)

  const wagerRegistryRead = useMemo(() => {
    if (!wagerRegistryAddr) return null
    const p = provider || getProvider(chainId)
    return new ethers.Contract(wagerRegistryAddr, WAGER_REGISTRY_ADMIN_ABI, p)
  }, [provider, wagerRegistryAddr, chainId])

  const membershipManagerRead = useMemo(() => {
    if (!membershipManagerAddr) return null
    const p = provider || getProvider(chainId)
    return new ethers.Contract(membershipManagerAddr, MEMBERSHIP_ADMIN_ABI, p)
  }, [provider, membershipManagerAddr, chainId])

  const fetchContractState = useCallback(async () => {
    if (!wagerRegistryRead || !membershipManagerRead) return
    try {
      const [paused, fees, treasury] = await Promise.all([
        wagerRegistryRead.paused().catch(() => false),
        membershipManagerRead.accruedFees().catch(() => 0n),
        membershipManagerRead.treasury().catch(() => ''),
      ])
      setContractState({
        isPaused: paused,
        accruedFees: ethers.formatUnits(fees, USDC_DECIMALS),
        treasury: treasury || '',
        isLoaded: true,
      })
    } catch (err) {
      console.warn('[AdminPanel] state fetch failed:', err)
    }
  }, [wagerRegistryRead, membershipManagerRead])

  useEffect(() => {
    fetchContractState()
    const interval = setInterval(fetchContractState, 30000)
    return () => clearInterval(interval)
  }, [fetchContractState])

  const runTx = useCallback(async (fn, successMsg) => {
    if (!signer) return showNotification('Connect your wallet first', 'error')
    setPendingTx(true)
    try {
      const tx = await fn()
      await tx.wait()
      showNotification(successMsg, 'success')
      fetchContractState()
    } catch (err) {
      console.error(err)
      showNotification(err.shortMessage || err.message, 'error')
    } finally {
      setPendingTx(false)
    }
  }, [signer, showNotification, fetchContractState])

  const handlePause = () => runTx(
    () => new ethers.Contract(wagerRegistryAddr, WAGER_REGISTRY_ADMIN_ABI, signer).pause(),
    'WagerRegistry paused'
  )

  const handleUnpause = () => runTx(
    () => new ethers.Contract(wagerRegistryAddr, WAGER_REGISTRY_ADMIN_ABI, signer).unpause(),
    'WagerRegistry unpaused'
  )

  const handleConfigureTier = () => {
    const priceUSDC = ethers.parseUnits(String(tierForm.price), USDC_DECIMALS)
    return runTx(
      () => new ethers.Contract(membershipManagerAddr, MEMBERSHIP_ADMIN_ABI, signer).setTier(
        ROLE_HASHES.WAGER_PARTICIPANT,
        tierForm.tier,
        priceUSDC,
        tierForm.durationDays,
        { monthlyMarketCreation: tierForm.monthly, maxConcurrentMarkets: tierForm.concurrent },
        tierForm.active
      ),
      `Tier ${TIER_NAMES[tierForm.tier]} configured at $${tierForm.price} USDC`
    )
  }

  const handleGrantMembership = () => {
    const target = grantEns.resolvedAddress || grantForm.address
    if (!isValidEthereumAddress(target)) return showNotification('Invalid address', 'error')
    return runTx(
      () => new ethers.Contract(membershipManagerAddr, MEMBERSHIP_ADMIN_ABI, signer).grantMembership(
        target, ROLE_HASHES.WAGER_PARTICIPANT, grantForm.tier, grantForm.durationDays
      ),
      `Granted ${TIER_NAMES[grantForm.tier]} membership to ${shortAddr(target)}`
    )
  }

  const handleRevokeMembership = () => {
    const target = revokeEns.resolvedAddress || revokeForm.address
    if (!isValidEthereumAddress(target)) return showNotification('Invalid address', 'error')
    return runTx(
      () => new ethers.Contract(membershipManagerAddr, MEMBERSHIP_ADMIN_ABI, signer).revokeMembership(
        target, ROLE_HASHES.WAGER_PARTICIPANT
      ),
      `Revoked membership for ${shortAddr(target)}`
    )
  }

  const handleFreeze = () => {
    const target = freezeEns.resolvedAddress || freezeForm.address
    if (!isValidEthereumAddress(target)) return showNotification('Invalid address', 'error')
    if (!freezeForm.reason.trim()) return showNotification('Reason is required (recorded on-chain)', 'error')
    return runTx(
      () => new ethers.Contract(wagerRegistryAddr, WAGER_REGISTRY_ADMIN_ABI, signer).freezeAccount(
        target, freezeForm.reason.trim()
      ),
      `Account ${shortAddr(target)} frozen`
    )
  }

  const handleUnfreeze = () => {
    const target = freezeEns.resolvedAddress || freezeForm.address
    if (!isValidEthereumAddress(target)) return showNotification('Invalid address', 'error')
    return runTx(
      () => new ethers.Contract(wagerRegistryAddr, WAGER_REGISTRY_ADMIN_ABI, signer).unfreezeAccount(target),
      `Account ${shortAddr(target)} unfrozen`
    )
  }

  const handleGrantAdminRole = () => {
    const target = adminRoleEns.resolvedAddress || adminRoleForm.address
    if (!isValidEthereumAddress(target)) return showNotification('Invalid address', 'error')
    const roleHash = ROLE_HASHES[adminRoleForm.role]
    // ROLE_MANAGER lives on MembershipManager; everything else on WagerRegistry
    const addr = adminRoleForm.role === 'ROLE_MANAGER' ? membershipManagerAddr : wagerRegistryAddr
    return runTx(
      () => new ethers.Contract(addr, WAGER_REGISTRY_ADMIN_ABI, signer).grantRole(roleHash, target),
      `Granted ${adminRoleForm.role} to ${shortAddr(target)}`
    )
  }

  const handleRevokeAdminRole = () => {
    const target = adminRoleEns.resolvedAddress || adminRoleForm.address
    if (!isValidEthereumAddress(target)) return showNotification('Invalid address', 'error')
    const roleHash = ROLE_HASHES[adminRoleForm.role]
    const addr = adminRoleForm.role === 'ROLE_MANAGER' ? membershipManagerAddr : wagerRegistryAddr
    return runTx(
      () => new ethers.Contract(addr, WAGER_REGISTRY_ADMIN_ABI, signer).revokeRole(roleHash, target),
      `Revoked ${adminRoleForm.role} from ${shortAddr(target)}`
    )
  }

  const handleWithdraw = () => {
    const target = withdrawEns.resolvedAddress || withdrawForm.to
    if (!isValidEthereumAddress(target)) return showNotification('Invalid address', 'error')
    const amount = ethers.parseUnits(String(withdrawForm.amount || '0'), USDC_DECIMALS)
    if (amount === 0n) return showNotification('Amount must be greater than 0', 'error')
    return runTx(
      () => new ethers.Contract(membershipManagerAddr, MEMBERSHIP_ADMIN_ABI, signer).withdrawFees(amount, target),
      `Withdrew ${withdrawForm.amount} USDC to ${shortAddr(target)}`
    )
  }

  if (!hasAdminAccess) {
    return (
      <div className="admin-panel">
        <div className="admin-unauthorized">
          <div className="unauthorized-icon" aria-hidden="true">🔒</div>
          <h2>Access Restricted</h2>
          <p>This admin panel is only accessible to users with administrative privileges.</p>
          <p className="unauthorized-hint">
            Administrative roles include: Administrator, Emergency Guardian, Account Moderator, and Role Manager.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-panel">
      <header className="admin-panel-header">
        <div className="admin-panel-header-content">
          <div className="admin-panel-title-section">
            <h1>Admin Panel</h1>
            <span className="admin-badge">
              {isAdmin ? 'Administrator' :
                isGuardian ? 'Guardian' :
                  isAccountModerator ? 'Moderator' :
                    isRoleManager ? 'Role Manager' : 'Admin'}
            </span>
          </div>
          <p className="admin-panel-subtitle">
            On-chain controls for the P2P wager protocol. Each tab is gated by the role it requires.
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

      <nav className="admin-panel-tabs" role="tablist">
        <button role="tab" aria-selected={activeTab === 'overview'}
          className={`admin-panel-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}>Overview</button>

        {isGuardian && (
          <button role="tab" aria-selected={activeTab === 'emergency'}
            className={`admin-panel-tab ${activeTab === 'emergency' ? 'active' : ''}`}
            onClick={() => setActiveTab('emergency')}>Emergency</button>
        )}

        {isAdmin && (
          <button role="tab" aria-selected={activeTab === 'tiers'}
            className={`admin-panel-tab ${activeTab === 'tiers' ? 'active' : ''}`}
            onClick={() => setActiveTab('tiers')}>Tiers</button>
        )}

        {isRoleManager && (
          <button role="tab" aria-selected={activeTab === 'members'}
            className={`admin-panel-tab ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => setActiveTab('members')}>Members</button>
        )}

        {isAccountModerator && (
          <button role="tab" aria-selected={activeTab === 'moderation'}
            className={`admin-panel-tab ${activeTab === 'moderation' ? 'active' : ''}`}
            onClick={() => setActiveTab('moderation')}>Account Moderation</button>
        )}

        {isAdmin && (
          <button role="tab" aria-selected={activeTab === 'admin-roles'}
            className={`admin-panel-tab ${activeTab === 'admin-roles' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin-roles')}>Admin Roles</button>
        )}

        {isAdmin && (
          <button role="tab" aria-selected={activeTab === 'treasury'}
            className={`admin-panel-tab ${activeTab === 'treasury' ? 'active' : ''}`}
            onClick={() => setActiveTab('treasury')}>Treasury</button>
        )}

        {isAdmin && (
          <button role="tab" aria-selected={activeTab === 'oracle-adapters'}
            className={`admin-panel-tab ${activeTab === 'oracle-adapters' ? 'active' : ''}`}
            onClick={() => setActiveTab('oracle-adapters')}>Oracle Adapters</button>
        )}
        {isAdmin && (
          <button role="tab" aria-selected={activeTab === 'deny-list'}
            className={`admin-panel-tab ${activeTab === 'deny-list' ? 'active' : ''}`}
            onClick={() => setActiveTab('deny-list')}>Deny-list</button>
        )}
      </nav>

      <main className="admin-panel-content">
        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="overview-grid">
              <div className="admin-card">
                <div className="admin-card-header"><h3>System Status</h3></div>
                <div className="status-details">
                  <div className="status-row">
                    <span className="status-label">WagerRegistry</span>
                    <span className={`status-value ${contractState.isPaused ? 'paused' : 'active'}`}>
                      {contractState.isPaused ? 'Paused' : 'Active'}
                    </span>
                  </div>
                  <div className="status-row">
                    <span className="status-label">Accrued tier fees</span>
                    <span className="status-value">{contractState.accruedFees} USDC</span>
                  </div>
                  <div className="status-row">
                    <span className="status-label">Network</span>
                    <span className="status-value">{NETWORK_CONFIG.name}</span>
                  </div>
                  <div className="status-row">
                    <span className="status-label">Connected as</span>
                    <span className="status-value">{shortAddr(account)} ({nativeSymbol})</span>
                  </div>
                </div>
              </div>

              <div className="admin-card">
                <div className="admin-card-header"><h3>Your Permissions</h3></div>
                <div className="permissions-list">
                  <div className={`permission-item ${isAdmin ? 'enabled' : 'disabled'}`}>
                    <span className="permission-icon">{isAdmin ? '✓' : '×'}</span>
                    <span className="permission-name">Administrator (tier config, treasury, grant admin roles)</span>
                  </div>
                  <div className={`permission-item ${isGuardian ? 'enabled' : 'disabled'}`}>
                    <span className="permission-icon">{isGuardian ? '✓' : '×'}</span>
                    <span className="permission-name">Guardian (pause / unpause WagerRegistry)</span>
                  </div>
                  <div className={`permission-item ${isAccountModerator ? 'enabled' : 'disabled'}`}>
                    <span className="permission-icon">{isAccountModerator ? '✓' : '×'}</span>
                    <span className="permission-name">Account Moderator (freeze / unfreeze accounts)</span>
                  </div>
                  <div className={`permission-item ${isRoleManager ? 'enabled' : 'disabled'}`}>
                    <span className="permission-icon">{isRoleManager ? '✓' : '×'}</span>
                    <span className="permission-name">Role Manager (grant / revoke memberships)</span>
                  </div>
                </div>
              </div>

              <div className="admin-card full-width">
                <div className="admin-card-header"><h3>Contract Addresses</h3></div>
                <div className="contract-addresses">
                  {Object.entries(DEPLOYED_CONTRACTS).filter(([, v]) => v).map(([name, address]) => (
                    <div key={name} className="contract-row">
                      <span className="contract-name">{name}</span>
                      <code className="contract-address" title={address}>{shortAddr(address)}</code>
                      <a href={`${NETWORK_CONFIG.blockExplorer}/address/${address}`}
                        target="_blank" rel="noopener noreferrer" className="contract-link">↗</a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Emergency */}
        {activeTab === 'emergency' && isGuardian && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="admin-card">
              <h3>Emergency Pause</h3>
              <p>Pausing halts wager creation, acceptance, and settlement protocol-wide. Use only in response to a security incident. Unpausing restores normal operation.</p>
              <div className="emergency-actions">
                {!contractState.isPaused ? (
                  <button className="confirm-btn danger" onClick={handlePause} disabled={pendingTx}>
                    {pendingTx ? 'Processing...' : 'Pause Protocol'}
                  </button>
                ) : (
                  <button className="confirm-btn primary" onClick={handleUnpause} disabled={pendingTx}>
                    {pendingTx ? 'Processing...' : 'Unpause Protocol'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tiers */}
        {activeTab === 'tiers' && isAdmin && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="admin-card">
              <h3>Configure Tier: Wager Participant</h3>
              <p>Set price (USDC), duration, monthly cap, and concurrent cap for each tier. 0 = unlimited.</p>
              <div className="admin-form">
                <label>
                  Tier
                  <select value={tierForm.tier} onChange={(e) => setTierForm({ ...tierForm, tier: Number(e.target.value) })}>
                    {[1, 2, 3, 4].map(t => <option key={t} value={t}>{TIER_NAMES[t]}</option>)}
                  </select>
                </label>
                <label>
                  Price (USDC)
                  <input type="number" min="0" step="0.01" value={tierForm.price}
                    onChange={(e) => setTierForm({ ...tierForm, price: e.target.value })} />
                </label>
                <label>
                  Duration (days)
                  <input type="number" min="1" max="3650" value={tierForm.durationDays}
                    onChange={(e) => setTierForm({ ...tierForm, durationDays: Number(e.target.value) })} />
                </label>
                <label>
                  Monthly cap (0 = unlimited)
                  <input type="number" min="0" value={tierForm.monthly}
                    onChange={(e) => setTierForm({ ...tierForm, monthly: Number(e.target.value) })} />
                </label>
                <label>
                  Concurrent cap (0 = unlimited)
                  <input type="number" min="0" value={tierForm.concurrent}
                    onChange={(e) => setTierForm({ ...tierForm, concurrent: Number(e.target.value) })} />
                </label>
                <label className="admin-checkbox">
                  <input type="checkbox" checked={tierForm.active}
                    onChange={(e) => setTierForm({ ...tierForm, active: e.target.checked })} />
                  Active (available for purchase)
                </label>
                <button className="confirm-btn primary" onClick={handleConfigureTier} disabled={pendingTx}>
                  {pendingTx ? 'Saving...' : 'Save Tier Config'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Members */}
        {activeTab === 'members' && isRoleManager && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="admin-card">
              <h3>Grant Membership</h3>
              <p>Grant a Wager Participant membership directly, bypassing the purchase flow. Use for support, gifts, or dispute resolution.</p>
              <div className="admin-form">
                <label>
                  Recipient (address or ENS)
                  <input type="text" value={grantForm.address}
                    placeholder="0x… or name.eth"
                    onChange={(e) => setGrantForm({ ...grantForm, address: e.target.value })} />
                  {grantEns.isLoading && <span className="hint">Resolving…</span>}
                  {grantEns.resolvedAddress && grantEns.isEns && (
                    <span className="hint">→ {shortAddr(grantEns.resolvedAddress)}</span>
                  )}
                </label>
                <label>
                  Tier
                  <select value={grantForm.tier} onChange={(e) => setGrantForm({ ...grantForm, tier: Number(e.target.value) })}>
                    {[1, 2, 3, 4].map(t => <option key={t} value={t}>{TIER_NAMES[t]}</option>)}
                  </select>
                </label>
                <label>
                  Duration (days)
                  <input type="number" min="1" max="3650" value={grantForm.durationDays}
                    onChange={(e) => setGrantForm({ ...grantForm, durationDays: Number(e.target.value) })} />
                </label>
                <button className="confirm-btn primary" onClick={handleGrantMembership} disabled={pendingTx}>
                  {pendingTx ? 'Granting...' : 'Grant Membership'}
                </button>
              </div>
            </div>

            <div className="admin-card">
              <h3>Revoke Membership</h3>
              <p>Sets the user's Wager Participant tier back to <code>None</code>. Does not refund any USDC.</p>
              <div className="admin-form">
                <label>
                  Account
                  <input type="text" value={revokeForm.address}
                    placeholder="0x… or name.eth"
                    onChange={(e) => setRevokeForm({ ...revokeForm, address: e.target.value })} />
                  {revokeEns.resolvedAddress && revokeEns.isEns && (
                    <span className="hint">→ {shortAddr(revokeEns.resolvedAddress)}</span>
                  )}
                </label>
                <button className="confirm-btn danger" onClick={handleRevokeMembership} disabled={pendingTx}>
                  {pendingTx ? 'Revoking...' : 'Revoke Membership'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Account Moderation */}
        {activeTab === 'moderation' && isAccountModerator && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="admin-card">
              <h3>Freeze / Unfreeze Account</h3>
              <p>
                A frozen account cannot create wagers, accept wagers, cancel, declare a winner,
                claim payouts, or claim refunds on WagerRegistry. Polymarket auto-resolution is
                permissionless and continues to work — but the winner still cannot claim while
                frozen. See <a href="/docs/system-overview/account-moderation" target="_blank" rel="noreferrer">policy</a>.
              </p>
              <div className="admin-form">
                <label>
                  Account (address or ENS)
                  <input type="text" value={freezeForm.address}
                    placeholder="0x… or name.eth"
                    onChange={(e) => setFreezeForm({ ...freezeForm, address: e.target.value })} />
                  {freezeEns.resolvedAddress && freezeEns.isEns && (
                    <span className="hint">→ {shortAddr(freezeEns.resolvedAddress)}</span>
                  )}
                </label>
                <label>
                  Reason (recorded on-chain in the AccountFrozen event)
                  <input type="text" value={freezeForm.reason}
                    placeholder="e.g. fraud investigation, court order, TOS violation"
                    onChange={(e) => setFreezeForm({ ...freezeForm, reason: e.target.value })} />
                </label>
                <div className="emergency-actions">
                  <button className="confirm-btn danger" onClick={handleFreeze} disabled={pendingTx}>
                    {pendingTx ? 'Processing...' : 'Freeze Account'}
                  </button>
                  <button className="confirm-btn secondary" onClick={handleUnfreeze} disabled={pendingTx}>
                    {pendingTx ? 'Processing...' : 'Unfreeze Account'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Admin Roles */}
        {activeTab === 'admin-roles' && isAdmin && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="admin-card">
              <h3>Grant / Revoke Admin Roles</h3>
              <p>
                Only the holder of <code>DEFAULT_ADMIN_ROLE</code> can grant other admin roles.
                Grant sparingly: each role is a distinct privilege and a foothold.
              </p>
              <div className="admin-form">
                <label>
                  Account (address or ENS)
                  <input type="text" value={adminRoleForm.address}
                    placeholder="0x… or name.eth"
                    onChange={(e) => setAdminRoleForm({ ...adminRoleForm, address: e.target.value })} />
                  {adminRoleEns.resolvedAddress && adminRoleEns.isEns && (
                    <span className="hint">→ {shortAddr(adminRoleEns.resolvedAddress)}</span>
                  )}
                </label>
                <label>
                  Role
                  <select value={adminRoleForm.role}
                    onChange={(e) => setAdminRoleForm({ ...adminRoleForm, role: e.target.value })}>
                    <option value="GUARDIAN">Guardian — pause/unpause</option>
                    <option value="ACCOUNT_MODERATOR">Account Moderator — freeze/unfreeze</option>
                    <option value="ROLE_MANAGER">Role Manager — grant/revoke memberships</option>
                    <option value="DEFAULT_ADMIN">Default Admin — full control (rare)</option>
                  </select>
                </label>
                <div className="emergency-actions">
                  <button className="confirm-btn primary" onClick={handleGrantAdminRole} disabled={pendingTx}>
                    {pendingTx ? 'Processing...' : 'Grant Role'}
                  </button>
                  <button className="confirm-btn danger" onClick={handleRevokeAdminRole} disabled={pendingTx}>
                    {pendingTx ? 'Processing...' : 'Revoke Role'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Treasury */}
        {activeTab === 'treasury' && isAdmin && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="admin-card">
              <h3>Treasury Withdrawal</h3>
              <p>
                Withdraws accrued tier fees from MembershipManager in USDC. Current balance:{' '}
                <strong>{contractState.accruedFees} USDC</strong>.
              </p>
              <div className="admin-form">
                <label>
                  Recipient (address or ENS)
                  <input type="text" value={withdrawForm.to}
                    placeholder="0x… or name.eth"
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, to: e.target.value })} />
                  {withdrawEns.resolvedAddress && withdrawEns.isEns && (
                    <span className="hint">→ {shortAddr(withdrawEns.resolvedAddress)}</span>
                  )}
                  {contractState.treasury && withdrawForm.to &&
                    withdrawForm.to.toLowerCase() === contractState.treasury.toLowerCase() && (
                    <span className="hint">Configured treasury</span>
                  )}
                </label>
                <label>
                  Amount (USDC)
                  <input type="number" min="0" step="0.01" value={withdrawForm.amount}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} />
                  <button type="button" className="hint-btn"
                    onClick={() => setWithdrawForm({ ...withdrawForm, amount: contractState.accruedFees })}>
                    Max
                  </button>
                </label>
                <button className="confirm-btn primary" onClick={handleWithdraw} disabled={pendingTx}>
                  {pendingTx ? 'Withdrawing...' : 'Withdraw Fees'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'oracle-adapters' && isAdmin && (
          <OracleAdaptersTab
            signer={signer}
            account={account}
            contracts={DEPLOYED_CONTRACTS}
            runTx={runTx}
            pendingTx={pendingTx}
          />
        )}

        {activeTab === 'deny-list' && isAdmin && (
          <DenyListAdmin
            signer={signer}
            account={account}
            contracts={DEPLOYED_CONTRACTS}
            runTx={runTx}
            pendingTx={pendingTx}
          />
        )}
      </main>
    </div>
  )
}

export default AdminPanel
