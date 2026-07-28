import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { useRoles } from '../hooks/useRoles'
import { useWeb3 } from '../hooks/useWeb3'
import { useNotification } from '../hooks/useUI'
import { useEnsResolution } from '../hooks/useEnsResolution'
import { useChainTokens } from '../hooks/useChainTokens'
import { ROLES, ADMIN_ROLES } from '../contexts/RoleContext'
import { isValidEthereumAddress } from '../utils/validation'
import { ACCOUNT_MODERATION_PATH } from '../constants/legalLinks'
import { NETWORK_CONFIG, DEPLOYED_CONTRACTS, getContractAddressForChain } from '../config/contracts'
import { getProvider } from '../utils/blockchainService'
import { MEMBERSHIP_MANAGER_ABI } from '../abis/MembershipManager'
import OracleAdaptersTab from './admin/OracleAdaptersTab'
import DenyListAdmin from './admin/DenyListAdmin'
import CallsignRegistryAdmin from './admin/CallsignRegistryAdmin'
import MembershipTreasuryOverview from './admin/MembershipTreasuryOverview'
import ProtocolConfigTab from './admin/ProtocolConfigTab'
import FeesTab from './admin/FeesTab'
import StakingTab from './admin/StakingTab'
import BridgeTab from './admin/BridgeTab'
import SupplyTab from './admin/SupplyTab'
import MaintenanceTab from './admin/MaintenanceTab'
import ServiceHealthCard from './admin/ServiceHealthCard'
import PaymasterOpsCard from './admin/PaymasterOpsCard'
import { buildAdminNavGroups, flattenNavGroups } from './admin/adminNav'
import { networkName } from '../lib/chains/estate'
import { isRead, isNotDeployed, formatUnitAmount } from '../lib/chains/chainReadResult'
import { useFeeEstate } from '../hooks/useFeeEstate'
import ChainStateTable from './admin/ChainStateTable'
import PortalNav from './ui/PortalNav'
import NavIcon from './nav/NavIcon'
import SectionIconNav from './nav/SectionIconNav'
import { useIsMobile } from '../hooks/useMediaQuery'
import './AdminPanel.css'

const TIER_NAMES = { 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Platinum' }
const USDC_DECIMALS = 6

const ROLE_HASHES = {
  WAGER_PARTICIPANT: ethers.keccak256(ethers.toUtf8Bytes('WAGER_PARTICIPANT_ROLE')),
  GUARDIAN: ethers.keccak256(ethers.toUtf8Bytes('GUARDIAN_ROLE')),
  ACCOUNT_MODERATOR: ethers.keccak256(ethers.toUtf8Bytes('ACCOUNT_MODERATOR_ROLE')),
  ROLE_MANAGER: ethers.keccak256(ethers.toUtf8Bytes('ROLE_MANAGER_ROLE')),
  SANCTIONS_ADMIN: ethers.keccak256(ethers.toUtf8Bytes('SANCTIONS_ADMIN_ROLE')),
  TOKEN_ISSUER: ethers.keccak256(ethers.toUtf8Bytes('TOKEN_ISSUER_ROLE')),
  STAKING_ADMIN: ethers.keccak256(ethers.toUtf8Bytes('STAKING_ADMIN_ROLE')),
  // LIQUIDITY_ADMIN_ROLE (spec 067) is the same role id on two separate
  // AccessControl contracts — the BridgeRouter and the LiquidityRouter — so it
  // is granted/revoked once per router. The picker therefore offers the two
  // targets explicitly instead of one option that would quietly authorize only
  // half of what the operator asked for.
  LIQUIDITY_ADMIN_BRIDGE: ethers.keccak256(ethers.toUtf8Bytes('LIQUIDITY_ADMIN_ROLE')),
  LIQUIDITY_ADMIN_LIQUIDITY: ethers.keccak256(ethers.toUtf8Bytes('LIQUIDITY_ADMIN_ROLE')),
  // GUARDIAN_ROLE is per-contract for the same reason, and the spec-067 routers were unreachable:
  // the bare `GUARDIAN` option above grants on the WagerRegistry, so there was NO in-app way to give
  // anyone the routers' killswitch. The routers grant it only to their `initialize` admin, which
  // meant the emergency lever could not be delegated to an on-call operator at all.
  GUARDIAN_BRIDGE: ethers.keccak256(ethers.toUtf8Bytes('GUARDIAN_ROLE')),
  GUARDIAN_LIQUIDITY: ethers.keccak256(ethers.toUtf8Bytes('GUARDIAN_ROLE')),
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
 * Operations Control Plane — the grouped admin portal at /admin.
 *
 * Views are organized into operator groups (Control Room, Incident Response,
 * Compliance, Membership & Revenue, Protocol Config, Identity, Access
 * Control, Infrastructure); see components/admin/adminNav.js for the
 * grouping/gating model and docs/system-overview/control-surface-audit.md
 * for the audit that produced it. Every view remains gated by the on-chain
 * role its actions require.
 */
function AdminPanel() {
  const { hasRole, hasAnyRole, estateRead, chainsForRole, loadRoles } = useRoles()
  const { account, signer, provider, chainId } = useWeb3()
  const { showNotification } = useNotification()
  const { native: nativeSymbol } = useChainTokens()

  const isAdmin = hasRole(ROLES.ADMIN)
  const isGuardian = hasRole(ROLES.GUARDIAN)
  const isAccountModerator = hasRole(ROLES.ACCOUNT_MODERATOR)
  const isRoleManager = hasRole(ROLES.ROLE_MANAGER)
  const isSanctionsAdmin = hasRole(ROLES.SANCTIONS_ADMIN)
  const isFeeAdmin = hasRole(ROLES.FEE_ADMIN)
  const isStakingAdmin = hasRole(ROLES.STAKING_ADMIN)
  // LIQUIDITY_ADMIN_ROLE lives on BOTH spec-067 routers (BridgeRouter and
  // LiquidityRouter). It resolves to true when the operator holds it on at
  // least one router deployed on the connected network — an undeployed router
  // is skipped, never read as a denial (see hasRoleOnChain). Entry to the tab
  // is deliberately generous; each tab re-checks authority per router and per
  // network before offering a write, and the control state the tabs read is
  // per-network regardless of which network the wallet sits on (FR-050).
  const isLiquidityAdmin = hasRole(ROLES.LIQUIDITY_ADMIN)
  const hasAdminAccess = hasAnyRole(ADMIN_ROLES)
  // The Bridge/Supply fee cards link across to where a rate is actually editable — but only for
  // an operator who can open that tab. Offering the link to someone the Fees tab is closed to
  // would send them to a blank panel, so they get the same sentence without a dead control.
  const canOpenFees = isAdmin || isFeeAdmin

  // Fees across every cohort chain (US3), independent of where the wallet is connected.
  const feeEstate = useFeeEstate({ walletChainId: chainId, walletProvider: provider })

  // A withdrawal targets ONE chain. It defaults to the wallet's chain when that chain carries a
  // MembershipManager, otherwise to the first chain that does — the same rule the spec-067 tabs
  // use — and it does NOT follow the wallet afterwards (FR-016).
  const [withdrawChainId, setWithdrawChainId] = useState(null)
  const withdrawScope = feeEstate.accrued.find((r) => Number(r.chainId) === Number(withdrawChainId))
  useEffect(() => {
    if (withdrawChainId != null || feeEstate.accrued.length === 0) return
    const onWallet = feeEstate.accrued.find((r) => Number(r.chainId) === Number(chainId) && isRead(r))
    const anyRead = feeEstate.accrued.find(isRead)
    setWithdrawChainId((onWallet || anyRead || feeEstate.accrued[0]).chainId)
  }, [feeEstate.accrued, chainId, withdrawChainId])

  const [activeTab, setActiveTab] = useState('overview')
  // The section rail collapses to an icon-only strip rather than disappearing.
  // It starts collapsed on mobile, where expanded it covers the content it is
  // navigating; on desktop it opens alongside and starts expanded.
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile)
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
  const sanctionsGuardAddr = getContractAddressForChain('sanctionsGuard', chainId)
  const tokenFactoryAddr = getContractAddressForChain('tokenFactory', chainId)
  const stakingRouterAddr = getContractAddressForChain('stakingRouter', chainId)
  const bridgeRouterAddr = getContractAddressForChain('bridgeRouter', chainId)
  const liquidityRouterAddr = getContractAddressForChain('liquidityRouter', chainId)

  // Each grantable role lives on a specific contract; grants must be sent
  // to the contract that defines the role, not blanket-sent to the registry.
  const roleHomeContract = (role) => {
    if (role === 'ROLE_MANAGER') return membershipManagerAddr
    if (role === 'SANCTIONS_ADMIN') return sanctionsGuardAddr
    if (role === 'TOKEN_ISSUER') return tokenFactoryAddr
    if (role === 'STAKING_ADMIN') return stakingRouterAddr
    if (role === 'LIQUIDITY_ADMIN_BRIDGE' || role === 'GUARDIAN_BRIDGE') return bridgeRouterAddr
    if (role === 'LIQUIDITY_ADMIN_LIQUIDITY' || role === 'GUARDIAN_LIQUIDITY') return liquidityRouterAddr
    return wagerRegistryAddr
  }

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

  /**
   * Send one admin transaction, reporting the outcome to the operator.
   *
   * RESOLVES `true` on success and `false` on any failure — including a rejected wallet prompt —
   * rather than resolving `undefined` either way. Callers that send a SEQUENCE need that: the
   * spec-067 bulk route toggles promised "a failed or rejected signature stops the rest", and with a
   * signal-free result the loop could not observe a revert, so rejecting the first prompt still
   * queued the remaining four. Never rejects, so the existing `.then(refresh)` callers are unchanged.
   */
  const runTx = useCallback(async (fn, successMsg) => {
    if (!signer) {
      showNotification('Connect your wallet first', 'error')
      return false
    }
    setPendingTx(true)
    try {
      const tx = await fn()
      await tx.wait()
      showNotification(successMsg, 'success')
      fetchContractState()
      return true
    } catch (err) {
      console.error(err)
      showNotification(err.shortMessage || err.message, 'error')
      return false
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
    const addr = roleHomeContract(adminRoleForm.role)
    if (!addr) return showNotification('Role contract not deployed on this network', 'error')
    return runTx(
      () => new ethers.Contract(addr, WAGER_REGISTRY_ADMIN_ABI, signer).grantRole(roleHash, target),
      `Granted ${adminRoleForm.role} to ${shortAddr(target)}`
    )
  }

  const handleRevokeAdminRole = () => {
    const target = adminRoleEns.resolvedAddress || adminRoleForm.address
    if (!isValidEthereumAddress(target)) return showNotification('Invalid address', 'error')
    const roleHash = ROLE_HASHES[adminRoleForm.role]
    const addr = roleHomeContract(adminRoleForm.role)
    if (!addr) return showNotification('Role contract not deployed on this network', 'error')
    return runTx(
      () => new ethers.Contract(addr, WAGER_REGISTRY_ADMIN_ABI, signer).revokeRole(roleHash, target),
      `Revoked ${adminRoleForm.role} from ${shortAddr(target)}`
    )
  }

  const handleWithdraw = () => {
    const target = withdrawEns.resolvedAddress || withdrawForm.to
    if (!isValidEthereumAddress(target)) return showNotification('Invalid address', 'error')
    // FR-017/FR-018: one named chain, wallet required to be there. Checked here as well as in
    // the disabled button so a stale render can never send to the wrong network.
    if (Number(chainId) !== Number(withdrawChainId)) {
      return showNotification(
        `This withdrawal happens on ${networkName(withdrawChainId)}. Switch your wallet there first.`,
        'error',
      )
    }
    const addr = getContractAddressForChain('membershipManager', withdrawChainId)
    if (!addr) return showNotification(`No MembershipManager on ${networkName(withdrawChainId)}`, 'error')
    const decimals = withdrawScope?.unit?.decimals ?? USDC_DECIMALS
    const symbol = withdrawScope?.unit?.symbol ?? 'USDC'
    const amount = ethers.parseUnits(String(withdrawForm.amount || '0'), decimals)
    if (amount === 0n) return showNotification('Amount must be greater than 0', 'error')
    return runTx(
      () => new ethers.Contract(addr, MEMBERSHIP_ADMIN_ABI, signer).withdrawFees(amount, target),
      `Withdrew ${withdrawForm.amount} ${symbol} to ${shortAddr(target)} on ${networkName(withdrawChainId)}`
    ).then((ok) => { if (ok) feeEstate.refresh(); return ok })
  }

  // Every role that can open this panel gets a row, each naming where it was found. Built here
  // rather than inline so a role can never again be in ADMIN_ROLES and the nav but missing from
  // the card — an operator reading a list of × concludes their grant did not land.
  const ADMIN_ROLE_ROWS = [
    { role: ROLES.ADMIN, held: isAdmin, label: 'Administrator (tier config, treasury, grant admin roles)' },
    { role: ROLES.GUARDIAN, held: isGuardian, label: 'Guardian (pause / unpause WagerRegistry)' },
    { role: ROLES.ACCOUNT_MODERATOR, held: isAccountModerator, label: 'Account Moderator (freeze / unfreeze accounts)' },
    { role: ROLES.ROLE_MANAGER, held: isRoleManager, label: 'Role Manager (grant / revoke memberships)' },
    { role: ROLES.SANCTIONS_ADMIN, held: isSanctionsAdmin, label: 'Compliance Officer (deny-list on SanctionsGuard)' },
    { role: ROLES.FEE_ADMIN, held: isFeeAdmin, label: 'Fee Administrator (platform fee rates on the FeeRouter)' },
    { role: ROLES.STAKING_ADMIN, held: isStakingAdmin, label: 'Staking Administrator (provider addresses + validator allowlist)' },
    { role: ROLES.LIQUIDITY_ADMIN, held: isLiquidityAdmin, label: 'Liquidity Administrator (bridge routes + curated pools, per router)' },
  ]

  // Grouped, role-gated section rail (see admin/adminNav.js). Mirrors the
  // per-tab role checks below — a view only appears if the connected account
  // can use it, and a group only appears if it has at least one usable view.
  const navGroups = buildAdminNavGroups({
    isAdmin,
    isGuardian,
    isAccountModerator,
    isRoleManager,
    isSanctionsAdmin,
    isFeeAdmin,
    isStakingAdmin,
    isLiquidityAdmin,
  })
  const adminTabs = flattenNavGroups(navGroups)

  // On mobile the expanded rail sits ON TOP of the view it just switched to, so
  // picking a section collapses it back to icons. On desktop it stays open.
  const handleSelectTab = useCallback((id) => {
    setActiveTab(id)
    if (isMobile) setSidebarOpen(false)
  }, [isMobile])

  // Escape closes the overlay rail, matching the global nav drawer.
  useEffect(() => {
    if (!sidebarOpen || !isMobile) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen, isMobile])

  if (!hasAdminAccess) {
    // FR-012: "you hold no operator role" and "we could not ask" are different statements, and
    // the second must never be dressed as the first. An operator refused during a network outage
    // needs to know their grant is not in question — otherwise they go looking for a
    // permissions problem that does not exist.
    const noChainAnswered =
      !estateRead?.swept || (estateRead.read.length === 0 && estateRead.unreadable.length > 0)
    return (
      <div className="admin-panel">
        <div className="admin-unauthorized">
          <div className="unauthorized-icon" aria-hidden="true">🔒</div>
          <h2>{noChainAnswered ? 'Could Not Verify Access' : 'Access Restricted'}</h2>
          {noChainAnswered ? (
            <>
              <p>
                No network could be read, so your operator roles could not be checked. This is a
                connectivity problem, not a statement about what you hold.
              </p>
              <p className="unauthorized-hint">
                {estateRead?.unreadable?.length
                  ? `Unreachable: ${estateRead.unreadable.map(networkName).join(', ')}.`
                  : 'The role sweep did not complete.'}{' '}
                Check your network endpoints, then retry.
              </p>
              <button type="button" className="confirm-btn primary" onClick={() => loadRoles?.(account, chainId)}>
                Retry
              </button>
            </>
          ) : (
            <>
              <p>The operations control plane is only accessible to users with operator privileges.</p>
              <p className="unauthorized-hint">
                Operator roles include: Administrator, Emergency Guardian, Account Moderator, Role
                Manager, and Compliance Officer. Checked across{' '}
                {estateRead.read.length} network{estateRead.read.length === 1 ? '' : 's'}
                {estateRead.unreadable.length > 0 &&
                  ` (${estateRead.unreadable.map(networkName).join(', ')} could not be read)`}
                .
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="admin-panel">
      <header className="admin-panel-header">
        <div className="admin-panel-header-content">
          <div className="admin-panel-title-section">
            <h1>Operations</h1>
            {/*
              The fallback used to be the literal 'Admin', so an operator whose only authority was
              LIQUIDITY_ADMIN (or FEE_ADMIN, or STAKING_ADMIN) was badged as an administrator while
              the permissions card below showed × on every row — the screen asserting both that they
              were an Admin and that they held nothing. Every role that can open this panel now names
              itself, and the last resort says what it means: something got you in, not "Admin".
            */}
            <span className="admin-badge">
              {isAdmin ? 'Administrator' :
                isGuardian ? 'Guardian' :
                  isAccountModerator ? 'Moderator' :
                    isRoleManager ? 'Role Manager' :
                      isSanctionsAdmin ? 'Compliance Officer' :
                        isFeeAdmin ? 'Fee Administrator' :
                          isStakingAdmin ? 'Staking Administrator' :
                            isLiquidityAdmin ? 'Liquidity Administrator' : 'Operator'}
            </span>
          </div>
          <p className="admin-panel-subtitle">
            Control plane for the P2P wager protocol — protocol controls, metrics, and service
            health in one place. Each view is gated by the on-chain role it requires.
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

      <div className={`portal-shell admin-portal-shell ${sidebarOpen ? '' : 'portal-collapsed'}`}>
        {/* Only the mobile rail overlays anything, so only it has something to dismiss. */}
        {isMobile && sidebarOpen && (
          <button
            type="button"
            className="portal-sidebar-backdrop"
            aria-label="Close sections menu"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside className="portal-sidebar admin-portal-sidebar">
          <div className="portal-sidebar-header">
            <button
              type="button"
              className="portal-sidebar-toggle"
              aria-expanded={sidebarOpen}
              aria-controls="admin-portal-nav"
              aria-label={sidebarOpen ? 'Collapse sections menu' : 'Expand sections menu'}
              onClick={() => setSidebarOpen((o) => !o)}
            >
              <NavIcon name="menu" size={20} />
            </button>
            {sidebarOpen && <span className="portal-sidebar-title">Sections</span>}
          </div>

          <PortalNav
            id="admin-portal-nav"
            groups={navGroups}
            activeId={activeTab}
            onSelect={handleSelectTab}
            ariaLabel="Operations sections"
            collapsed={!sidebarOpen}
          />
        </aside>

        <div className="portal-main">
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
                  {/* The single-chain figure that used to sit here read one network's balance
                      and presented it without qualification — a number an operator would act on
                      as if it were the total. The estate breakdown is its own card below. */}
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
                {/*
                  One row per role, data-driven. Each names the NETWORK(S) the role was actually
                  found on (spec 071 FR-010) — a bare ✓ on a per-chain role tells an operator
                  they hold it without saying where, which is not enough to act on.
                */}
                <div className="permissions-list">
                  {ADMIN_ROLE_ROWS.map(({ role, label, held }) => {
                    const on = chainsForRole?.(role) ?? []
                    return (
                      <div key={role} className={`permission-item ${held ? 'enabled' : 'disabled'}`}>
                        <span className="permission-icon">{held ? '✓' : '×'}</span>
                        <span className="permission-name">
                          {label}
                          {held && on.length > 0 && (
                            <span className="permission-networks"> — {on.map(networkName).join(', ')}</span>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {/*
                  This card is a summary, not a verdict, and now says so on two counts: it names
                  where each role was found, and it names the networks it could not read at all —
                  because an unread network showing as × would be the platform asserting a denial
                  it never established (FR-011).
                */}
                <p className="card-info">
                  Read across {estateRead?.read?.length ?? 0} network
                  {(estateRead?.read?.length ?? 0) === 1 ? '' : 's'}.
                  {estateRead?.unreadable?.length > 0 && (
                    <> {estateRead.unreadable.map(networkName).join(', ')} could not be read, so
                    nothing above rules out a role held there.</>
                  )}{' '}
                  Roles are per-contract and per-network, so each view re-checks the specific
                  contract for the network you select — what it offers there is the authoritative
                  answer.
                </p>
              </div>

              <ServiceHealthCard />

              <MembershipTreasuryOverview
                provider={provider || getProvider(chainId)}
                chainId={chainId}
                address={membershipManagerAddr}
                accruedFees={contractState.accruedFees}
              />

              {/*
                Fees across the whole estate (US3). Two SEPARATE figures, deliberately:
                  • accrued (undrawn) — MembershipManager.accruedFees, the only accruing balance
                  • treasury (received) — already delivered; the FeeRouter forwards and holds nothing
                They are never added together — one is money the platform still owes itself, the
                other is money already paid out. And neither is summed across units, because the
                payment token differs per chain (research R6, FR-021…FR-023).
              */}
              <div className="admin-card full-width">
                <div className="admin-card-header"><h3>Fees across the estate</h3></div>
                <ChainStateTable
                  caption="Accrued (undrawn) — withdrawable from MembershipManager"
                  results={feeEstate.accrued}
                  totals={feeEstate.accruedTotals}
                  onRetry={feeEstate.refresh}
                />
                <ChainStateTable
                  caption="Treasury balance (received) — already delivered by the FeeRouter"
                  results={feeEstate.received}
                  totals={feeEstate.receivedTotals}
                  onRetry={feeEstate.refresh}
                />
                <p className="card-info">
                  These two are never combined: the first is undrawn and still withdrawable, the
                  second has already been paid to the treasury. Totals are shown per token because
                  networks hold different payment tokens, and any total computed while a network
                  was unreadable says so and names it.
                </p>
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
            {/* Incident commanders get the gasless-infra picture on the same
                screen: the on-chain pause and the gateway killswitch are the
                two halves of a full stop. */}
            <ServiceHealthCard />
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
                frozen. See <a href={ACCOUNT_MODERATION_PATH} target="_blank" rel="noopener noreferrer">policy</a>.
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
              <p>
                <strong>Liquidity Administrator is per-router.</strong> The bridge and
                liquidity routers each carry their own <code>LIQUIDITY_ADMIN_ROLE</code>;
                granting one does not grant the other. Grant both if the operator is meant
                to curate bridge routes <em>and</em> supplied pools.
              </p>
              <p>
                <strong>So is Guardian.</strong> The plain “Guardian” option above grants on the
                WagerRegistry and does <em>not</em> carry to the bridge or liquidity routers — those
                check their own role registry, so an on-call operator needs the router-specific
                Guardian grant to reach the Bridge or Supply killswitch. Note also that the routers
                keep protocol-wiring changes (SpokePool, position manager, FeeRouter, sanctions guard)
                at <code>DEFAULT_ADMIN_ROLE</code>: those addresses decide where member funds go, so
                curating routes and pools does not carry the power to redirect them.
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
                    <option value="GUARDIAN">Guardian — pause/unpause (WagerRegistry)</option>
                    <option value="ACCOUNT_MODERATOR">Account Moderator — freeze/unfreeze</option>
                    <option value="ROLE_MANAGER">Role Manager — grant/revoke memberships</option>
                    <option value="SANCTIONS_ADMIN">Compliance Officer — deny-list (SanctionsGuard)</option>
                    <option value="TOKEN_ISSUER">Token Issuer — token creation (TokenFactory)</option>
                    <option value="STAKING_ADMIN">Staking Administrator — provider addrs + validator allowlist (StakingRouter)</option>
                    <option value="LIQUIDITY_ADMIN_BRIDGE">Liquidity Administrator — bridge routes + limits (BridgeRouter only)</option>
                    <option value="LIQUIDITY_ADMIN_LIQUIDITY">Liquidity Administrator — curated pools + caps (LiquidityRouter only)</option>
                    <option value="GUARDIAN_BRIDGE">Guardian — pause new bridges (BridgeRouter only)</option>
                    <option value="GUARDIAN_LIQUIDITY">Guardian — pause new Uniswap supplies (LiquidityRouter only)</option>
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
              {/*
                A withdrawal is a WRITE, so it targets exactly one chain and says which
                (FR-017), and it is withheld unless the wallet is there rather than failing at
                signature time (FR-018). The balance shown is that chain's — never an estate
                total, which is not a thing any single `withdrawFees` call could move.
              */}
              <div className="admin-form">
                <label>
                  Network to withdraw on
                  <select
                    value={String(withdrawChainId)}
                    onChange={(e) => setWithdrawChainId(Number(e.target.value))}
                  >
                    {feeEstate.accrued.map((r) => (
                      <option key={r.chainId} value={String(r.chainId)}>
                        {networkName(r.chainId)}
                        {isRead(r) ? ` — ${formatUnitAmount(r, ethers.formatUnits)} available` : ''}
                        {isNotDeployed(r) ? ' — not deployed' : ''}
                        {!isRead(r) && !isNotDeployed(r) ? ' — could not be read' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="card-info">
                  {withdrawScope && isRead(withdrawScope) ? (
                    <>
                      Withdrawing <strong>{formatUnitAmount(withdrawScope, ethers.formatUnits)}</strong>{' '}
                      of accrued tier fees on <strong>{networkName(withdrawChainId)}</strong>.
                    </>
                  ) : withdrawScope && isNotDeployed(withdrawScope) ? (
                    <>No MembershipManager on {networkName(withdrawChainId)} — nothing to withdraw there.</>
                  ) : (
                    <>
                      The balance on {networkName(withdrawChainId)} could not be read, so the
                      available amount is unknown.
                    </>
                  )}
                  {Number(chainId) !== Number(withdrawChainId) && (
                    <> Your wallet is on {networkName(chainId)} — switch it to{' '}
                    {networkName(withdrawChainId)} to sign this withdrawal.</>
                  )}
                </p>
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
                  Amount ({withdrawScope?.unit?.symbol || 'tokens'})
                  <input type="number" min="0" step="0.01" value={withdrawForm.amount}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} />
                  {/* Max is the SCOPED chain's balance, and is offered only when that balance
                      was actually read — filling it from an unknown would be a guess. */}
                  <button type="button" className="hint-btn"
                    disabled={!withdrawScope || !isRead(withdrawScope)}
                    onClick={() => setWithdrawForm({
                      ...withdrawForm,
                      amount: ethers.formatUnits(withdrawScope.value, withdrawScope.unit?.decimals ?? 6),
                    })}>
                    Max
                  </button>
                </label>
                <button
                  className="confirm-btn primary"
                  onClick={handleWithdraw}
                  disabled={pendingTx || Number(chainId) !== Number(withdrawChainId)}
                >
                  {pendingTx
                    ? 'Withdrawing...'
                    : Number(chainId) !== Number(withdrawChainId)
                      ? `Switch to ${networkName(withdrawChainId)} to withdraw`
                      : `Withdraw on ${networkName(withdrawChainId)}`}
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

        {activeTab === 'deny-list' && (isSanctionsAdmin || isAdmin) && (
          <DenyListAdmin
            signer={signer}
            account={account}
            contracts={DEPLOYED_CONTRACTS}
            runTx={runTx}
            pendingTx={pendingTx}
          />
        )}

        {activeTab === 'callsigns' && isAdmin && (
          <CallsignRegistryAdmin
            signer={signer}
            account={account}
            contracts={DEPLOYED_CONTRACTS}
            chainId={chainId}
            runTx={runTx}
            pendingTx={pendingTx}
          />
        )}

        {activeTab === 'fees' && (isAdmin || isFeeAdmin) && (
          <FeesTab
            signer={signer}
            chainId={chainId}
            provider={provider || getProvider(chainId)}
            runTx={runTx}
            pendingTx={pendingTx}
            isAdmin={isAdmin}
            isFeeAdmin={isFeeAdmin}
          />
        )}

        {activeTab === 'staking' && (isAdmin || isStakingAdmin || isGuardian) && (
          <StakingTab
            signer={signer}
            chainId={chainId}
            provider={provider || getProvider(chainId)}
            runTx={runTx}
            pendingTx={pendingTx}
            isAdmin={isAdmin}
            isStakingAdmin={isStakingAdmin}
            isGuardian={isGuardian}
          />
        )}

        {/*
          Bridge + Supply (spec 067). Same gate as the nav group, so a tab id
          typed by hand renders nothing for an operator who holds none of
          admin / liquidity-admin / guardian (FR-040 / FR-049). Neither tab is
          gated on the wallet's active chain: control state is per-network and
          each tab reads all five networks (FR-050).
        */}
        {activeTab === 'bridge' && (isAdmin || isLiquidityAdmin || isGuardian) && (
          <BridgeTab
            signer={signer}
            account={account}
            chainId={chainId}
            provider={provider || getProvider(chainId)}
            runTx={runTx}
            pendingTx={pendingTx}
            onOpenFees={canOpenFees ? () => setActiveTab('fees') : null}
          />
        )}

        {activeTab === 'supply' && (isAdmin || isLiquidityAdmin || isGuardian) && (
          <SupplyTab
            signer={signer}
            account={account}
            chainId={chainId}
            provider={provider || getProvider(chainId)}
            runTx={runTx}
            pendingTx={pendingTx}
            onOpenFees={canOpenFees ? () => setActiveTab('fees') : null}
          />
        )}

        {activeTab === 'protocol-config' && isAdmin && (
          <ProtocolConfigTab
            signer={signer}
            chainId={chainId}
            provider={provider || getProvider(chainId)}
            runTx={runTx}
            pendingTx={pendingTx}
          />
        )}

        {activeTab === 'maintenance' && (
          <MaintenanceTab
            signer={signer}
            chainId={chainId}
            runTx={runTx}
            pendingTx={pendingTx}
          />
        )}

        {activeTab === 'services' && (isAdmin || isGuardian) && (
          <div className="admin-tab-content" role="tabpanel">
            <div className="overview-grid">
              <ServiceHealthCard />
              <PaymasterOpsCard
                signer={signer}
                account={account}
                provider={provider || getProvider(chainId)}
                chainId={chainId}
                nativeSymbol={nativeSymbol}
                runTx={runTx}
                pendingTx={pendingTx}
              />
            </div>
            <div className="admin-card">
              <h3>Off-chain Controls (runbook-operated)</h3>
              <p>
                The relay gateway deliberately has no web admin API — it can censor, never steal,
                and its worst failure mode is refusing gas. These controls are operated via
                deploy config and signals, documented in the runbooks:
              </p>
              <ul>
                <li><strong>Gateway killswitch</strong> — <code>KILL_SWITCH</code> env or <code>SIGUSR2</code>; halts relaying, sponsorship, and the OpenSea/Polymarket proxies (docs/runbooks/relayer-operations.md).</li>
                <li><strong>Relayer per-chain pause / gas caps / receiver allowlist</strong> — <code>services/oz-relayer/config/config.json</code>.</li>
                <li><strong>Quotas, spend caps, paymaster ceilings</strong> — gateway env (<code>SIGNER_QUOTA_PER_MIN</code>, <code>GAS_SPEND_CAP_WEI_*</code>, <code>PM_*</code>).</li>
                <li><strong>Polymarket builder fee</strong> — gateway env, hard-capped at boot; changes rate-limited by Polymarket (docs/developer-guide/predict-polymarket.md).</li>
              </ul>
            </div>
          </div>
        )}
          </main>

          {/* Mobile-only bottom quick-nav between admin sections. */}
          <SectionIconNav
            items={adminTabs}
            activeId={activeTab}
            onSelect={setActiveTab}
            ariaLabel="Operations sections"
          />
        </div>
      </div>
    </div>
  )
}

export default AdminPanel
