import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import {
  buildAdminNavGroups,
  flattenNavGroups,
  ADMIN_TAB_ICONS,
} from '../components/admin/adminNav'
import { ROLES, ROLE_INFO, ADMIN_ROLES } from '../contexts/RoleContext'
import { getRoleHash } from '../utils/blockchainService'
import adminPanelSource from '../components/AdminPanel.jsx?raw'
import blockchainServiceSource from '../utils/blockchainService.js?raw'
import walletContextSource from '../contexts/WalletContext.jsx?raw'

const NO_ROLES = {
  isAdmin: false,
  isGuardian: false,
  isAccountModerator: false,
  isRoleManager: false,
  isSanctionsAdmin: false,
  isFeeAdmin: false,
  isStakingAdmin: false,
  isLiquidityAdmin: false,
}

const ids = (groups) => flattenNavGroups(groups).map((i) => i.id)
const labels = (groups) => groups.map((g) => g.label)

describe('buildAdminNavGroups', () => {
  it('full admin sees every group', () => {
    const groups = buildAdminNavGroups({
      isAdmin: true,
      isGuardian: true,
      isAccountModerator: true,
      isRoleManager: true,
      isSanctionsAdmin: true,
    })
    expect(labels(groups)).toEqual([
      'Control Room',
      'Incident Response',
      'Compliance',
      'Membership & Revenue',
      'Liquidity',
      'Protocol Config',
      'Identity',
      'Access Control',
      'Infrastructure',
    ])
    expect(ids(groups)).toContain('protocol-config')
    expect(ids(groups)).toContain('services')
    expect(ids(groups)).toContain('maintenance')
  })

  it('an operator with no roles still gets Overview and Maintenance (permissionless calls)', () => {
    const groups = buildAdminNavGroups(NO_ROLES)
    expect(ids(groups)).toEqual(['overview', 'maintenance'])
  })

  it('empty groups are dropped entirely', () => {
    const groups = buildAdminNavGroups({ ...NO_ROLES, isGuardian: true })
    expect(labels(groups)).not.toContain('Compliance')
    expect(labels(groups)).not.toContain('Membership & Revenue')
    expect(labels(groups)).not.toContain('Access Control')
  })

  it('guardian gets Incident Response and Infrastructure but not admin-only views', () => {
    const groups = buildAdminNavGroups({ ...NO_ROLES, isGuardian: true })
    const flat = ids(groups)
    expect(flat).toContain('emergency')
    expect(flat).toContain('services')
    expect(flat).not.toContain('tiers')
    expect(flat).not.toContain('admin-roles')
    expect(flat).not.toContain('protocol-config')
  })

  it('a compliance officer without full admin reaches the deny-list', () => {
    const groups = buildAdminNavGroups({ ...NO_ROLES, isSanctionsAdmin: true })
    expect(ids(groups)).toContain('deny-list')
  })

  it('a fee admin without full admin reaches the Fees view (spec 060)', () => {
    const groups = buildAdminNavGroups({ ...NO_ROLES, isFeeAdmin: true })
    const flat = ids(groups)
    expect(flat).toContain('fees')
    expect(flat).not.toContain('tiers')
    expect(flat).not.toContain('treasury')
  })

  it('full admin also sees the Fees view without the dedicated role', () => {
    const groups = buildAdminNavGroups({ ...NO_ROLES, isAdmin: true })
    expect(ids(groups)).toContain('fees')
  })

  it('role manager sees Members but not Tiers/Treasury (admin-only)', () => {
    const groups = buildAdminNavGroups({ ...NO_ROLES, isRoleManager: true })
    const flat = ids(groups)
    expect(flat).toContain('members')
    expect(flat).not.toContain('tiers')
    expect(flat).not.toContain('treasury')
  })

  // Spec 067 (FR-040 / FR-049): the Bridge + Supply control surfaces.
  describe('Liquidity group (spec 067)', () => {
    it('a liquidity admin reaches Bridge and Supply and nothing else privileged', () => {
      const groups = buildAdminNavGroups({ ...NO_ROLES, isLiquidityAdmin: true })
      const flat = ids(groups)
      expect(flat).toContain('bridge')
      expect(flat).toContain('supply')
      expect(labels(groups)).toContain('Liquidity')
      // Configuring routes and pools is not a licence to touch anything else.
      expect(flat).not.toContain('protocol-config')
      expect(flat).not.toContain('oracle-adapters')
      expect(flat).not.toContain('staking')
      expect(flat).not.toContain('fees')
      expect(flat).not.toContain('tiers')
      expect(flat).not.toContain('treasury')
      expect(flat).not.toContain('admin-roles')
      expect(flat).not.toContain('emergency')
    })

    it('a guardian reaches both tabs (the pause lives there)', () => {
      const flat = ids(buildAdminNavGroups({ ...NO_ROLES, isGuardian: true }))
      expect(flat).toContain('bridge')
      expect(flat).toContain('supply')
    })

    it('a full admin reaches both tabs without the dedicated role', () => {
      const flat = ids(buildAdminNavGroups({ ...NO_ROLES, isAdmin: true }))
      expect(flat).toContain('bridge')
      expect(flat).toContain('supply')
    })

    it('an operator with none of admin/liquidity-admin/guardian sees neither tab', () => {
      const withOtherRoles = buildAdminNavGroups({
        ...NO_ROLES,
        isAccountModerator: true,
        isRoleManager: true,
        isSanctionsAdmin: true,
        isFeeAdmin: true,
        isStakingAdmin: true,
      })
      const flat = ids(withOtherRoles)
      expect(flat).not.toContain('bridge')
      expect(flat).not.toContain('supply')
      expect(labels(withOtherRoles)).not.toContain('Liquidity')
    })

    it('sits outside Protocol Config — member-value surfaces, not protocol wiring', () => {
      const groups = buildAdminNavGroups({ ...NO_ROLES, isAdmin: true, isGuardian: true })
      const protocolConfig = groups.find((g) => g.label === 'Protocol Config')
      const liquidity = groups.find((g) => g.label === 'Liquidity')
      expect(protocolConfig.items.map((i) => i.id)).not.toContain('bridge')
      expect(protocolConfig.items.map((i) => i.id)).not.toContain('supply')
      expect(liquidity.items.map((i) => i.label)).toEqual(['Bridge', 'Supply'])
    })

    it('uses the transfer and sprout glyphs', () => {
      expect(ADMIN_TAB_ICONS.bridge).toBe('transfer')
      expect(ADMIN_TAB_ICONS.supply).toBe('sprout')
    })
  })

  it('every view carries a known NavIcon glyph for the mobile quick-nav', () => {
    const groups = buildAdminNavGroups({
      isAdmin: true,
      isGuardian: true,
      isAccountModerator: true,
      isRoleManager: true,
      isSanctionsAdmin: true,
    })
    for (const item of flattenNavGroups(groups)) {
      expect(item.icon, `icon for ${item.id}`).toBe(ADMIN_TAB_ICONS[item.id])
      expect(item.icon).toBeTruthy()
    }
  })
})

/**
 * Spec 067 T122 — the LIQUIDITY_ADMIN_ROLE plumbing behind the nav flag.
 *
 * The flag is only meaningful if the role is declared as an admin role (so a
 * liquidity-admin-only operator can enter the panel at all), hashes to the
 * on-chain role id, and is resolved against BOTH routers — the role is defined
 * independently on the BridgeRouter and the LiquidityRouter.
 */
describe('LIQUIDITY_ADMIN_ROLE resolution (spec 067)', () => {
  it('is a first-class admin role with a described purpose', () => {
    expect(ROLES.LIQUIDITY_ADMIN).toBe('LIQUIDITY_ADMIN')
    expect(ADMIN_ROLES).toContain(ROLES.LIQUIDITY_ADMIN)
    expect(ROLE_INFO[ROLES.LIQUIDITY_ADMIN].isAdminRole).toBe(true)
    expect(ROLE_INFO[ROLES.LIQUIDITY_ADMIN].premium).toBe(false)
  })

  it('hashes to keccak256("LIQUIDITY_ADMIN_ROLE")', () => {
    expect(getRoleHash('LIQUIDITY_ADMIN')).toBe(
      ethers.keccak256(ethers.toUtf8Bytes('LIQUIDITY_ADMIN_ROLE'))
    )
  })

  it('is read from both routers, either of which may be undeployed', () => {
    // VITE_SKIP_BLOCKCHAIN_CALLS short-circuits hasRoleOnChain under vitest, so
    // the resolution branch is asserted at the source level: both routers are
    // candidates, and an address that resolves empty is simply not pushed.
    const branch = blockchainServiceSource.split("roleName === 'LIQUIDITY_ADMIN'")[1] || ''
    expect(branch).toContain("resolveAddress('bridgeRouter')")
    expect(branch).toContain("resolveAddress('liquidityRouter')")
    expect(branch).toMatch(/if \(bridge\) candidates\.push\(bridge\)/)
    expect(branch).toMatch(/if \(liquidity\) candidates\.push\(liquidity\)/)
  })

  it('is synced from chain on connect like the other admin roles', () => {
    expect(walletContextSource).toMatch(/const adminRoles = \[[^\]]*'LIQUIDITY_ADMIN'/)
  })

  it('the AdminPanel reads the flag and passes it to the nav builder', () => {
    expect(adminPanelSource).toContain('hasRole(ROLES.LIQUIDITY_ADMIN)')
    expect(adminPanelSource).toMatch(/isLiquidityAdmin,\s*\}\)/)
  })

  it('grants target one router at a time — the role lives on both', () => {
    // A single "LIQUIDITY_ADMIN" option would authorize half of what the
    // operator asked for, silently. The picker names the router instead.
    expect(adminPanelSource).toContain('LIQUIDITY_ADMIN_BRIDGE')
    expect(adminPanelSource).toContain('LIQUIDITY_ADMIN_LIQUIDITY')
    expect(adminPanelSource).toMatch(/role === 'LIQUIDITY_ADMIN_BRIDGE'[\s\S]{0,60}return bridgeRouterAddr/)
    expect(adminPanelSource).toMatch(/role === 'LIQUIDITY_ADMIN_LIQUIDITY'[\s\S]{0,60}return liquidityRouterAddr/)
  })

  it('GUARDIAN is grantable per router too — the killswitch has to be delegable', () => {
    // The plain GUARDIAN option grants on the WagerRegistry, so before these existed there was NO
    // in-app way to give an on-call operator the routers' pause: they grant it only to their
    // `initialize` admin. An emergency lever that cannot be delegated is a single point of failure.
    expect(adminPanelSource).toContain('GUARDIAN_BRIDGE')
    expect(adminPanelSource).toContain('GUARDIAN_LIQUIDITY')
    expect(adminPanelSource).toMatch(/role === 'GUARDIAN_BRIDGE'[\s\S]{0,60}return bridgeRouterAddr/)
    expect(adminPanelSource).toMatch(/role === 'GUARDIAN_LIQUIDITY'[\s\S]{0,60}return liquidityRouterAddr/)
  })

  it('every role that can open the panel appears in the permissions card', () => {
    // FEE_ADMIN, STAKING_ADMIN and LIQUIDITY_ADMIN were in ROLES, in ADMIN_ROLES and in the nav but
    // not in this card, so an operator holding one read a list of × and concluded their grant had not
    // landed. A permissions card that omits a role it let you in on is worse than no card.
    for (const flag of ['isFeeAdmin', 'isStakingAdmin', 'isLiquidityAdmin']) {
      expect(adminPanelSource).toMatch(new RegExp(`permission-item \\$\\{${flag} \\?`))
    }
  })

  it('both tab bodies are gated exactly like the nav items (no direct-id bypass)', () => {
    for (const tab of ['bridge', 'supply']) {
      expect(adminPanelSource).toContain(
        `activeTab === '${tab}' && (isAdmin || isLiquidityAdmin || isGuardian)`
      )
    }
  })
})
