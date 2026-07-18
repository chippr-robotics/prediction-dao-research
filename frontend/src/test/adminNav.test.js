import { describe, it, expect } from 'vitest'
import {
  buildAdminNavGroups,
  flattenNavGroups,
  ADMIN_TAB_ICONS,
} from '../components/admin/adminNav'

const NO_ROLES = {
  isAdmin: false,
  isGuardian: false,
  isAccountModerator: false,
  isRoleManager: false,
  isSanctionsAdmin: false,
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

  it('role manager sees Members but not Tiers/Treasury (admin-only)', () => {
    const groups = buildAdminNavGroups({ ...NO_ROLES, isRoleManager: true })
    const flat = ids(groups)
    expect(flat).toContain('members')
    expect(flat).not.toContain('tiers')
    expect(flat).not.toContain('treasury')
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
