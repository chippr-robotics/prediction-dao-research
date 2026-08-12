/**
 * Perps fee admin — navigation registration (spec 083 US5, T060).
 *
 * The panel is only reachable if it is registered, and it is only SAFE if the render is gated by
 * the same predicate as the menu entry: hiding a menu item while leaving `?tab=perps-fees` open is
 * a menu, not an access control. Both are asserted here, alongside the placement decision — Perps
 * Fees sits beside Fees under Membership & Revenue because it IS fee administration, even though
 * one of its two rails is not a FeeRouter service.
 */
import { describe, it, expect } from 'vitest'
import {
  buildAdminNavGroups,
  flattenNavGroups,
  ADMIN_TAB_ICONS,
} from '../../components/admin/adminNav'
import adminPanelSource from '../../components/AdminPanel.jsx?raw'

const NO_ROLES = {
  isAdmin: false,
  isGuardian: false,
  isAccountModerator: false,
  isRoleManager: false,
  isSanctionsAdmin: false,
  isFeeAdmin: false,
  isStakingAdmin: false,
  isLiquidityAdmin: false,
  isAppCurator: false,
}

const ids = (groups) => flattenNavGroups(groups).map((i) => i.id)

describe('Perps Fees navigation entry', () => {
  it('a fee admin reaches it without full admin', () => {
    expect(ids(buildAdminNavGroups({ ...NO_ROLES, isFeeAdmin: true }))).toContain('perps-fees')
  })

  it('a full admin reaches it without the dedicated role', () => {
    expect(ids(buildAdminNavGroups({ ...NO_ROLES, isAdmin: true }))).toContain('perps-fees')
  })

  it('an operator holding every other role does not', () => {
    const groups = buildAdminNavGroups({
      ...NO_ROLES,
      isGuardian: true,
      isAccountModerator: true,
      isRoleManager: true,
      isSanctionsAdmin: true,
      isStakingAdmin: true,
      isLiquidityAdmin: true,
      isAppCurator: true,
    })
    expect(ids(groups)).not.toContain('perps-fees')
  })

  it('sits beside Fees under Membership & Revenue — it is fee administration', () => {
    const groups = buildAdminNavGroups({ ...NO_ROLES, isFeeAdmin: true })
    const revenue = groups.find((g) => g.label === 'Membership & Revenue')
    expect(revenue.items.map((i) => i.id)).toEqual(['fees', 'perps-fees'])
    expect(revenue.items.map((i) => i.label)).toEqual(['Fees', 'Perps Fees'])
  })

  it('carries a known NavIcon glyph for the mobile quick-nav', () => {
    const item = flattenNavGroups(buildAdminNavGroups({ ...NO_ROLES, isFeeAdmin: true })).find(
      (i) => i.id === 'perps-fees',
    )
    expect(item.icon).toBe(ADMIN_TAB_ICONS['perps-fees'])
    expect(item.icon).toBeTruthy()
  })

  it('the AdminPanel gates the render on the same predicate as the nav', () => {
    // Guessing `?tab=perps-fees` must not be a way in for an operator the menu would not offer it
    // to — the render is gated, not just the menu.
    expect(adminPanelSource).toMatch(/activeTab === 'perps-fees' && \(isAdmin \|\| isFeeAdmin\)/)
  })

  it('passes the panel a way back to the Fees tab rather than a second rate control', () => {
    const render = adminPanelSource.slice(adminPanelSource.indexOf("activeTab === 'perps-fees'"))
    expect(render.slice(0, 600)).toContain("setActiveTab('fees')")
  })
})
