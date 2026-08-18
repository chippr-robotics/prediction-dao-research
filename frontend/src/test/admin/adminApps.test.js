/**
 * Spec 093 — the admin app/view/role matrix is the SINGLE source of truth,
 * and it must cover the legacy console exactly.
 *
 * These tests replace test/adminNav.test.js (buildAdminNavGroups) and carry
 * its invariants forward: a view appears iff its own gate passes, an app
 * appears iff it has at least one entitled view (or is permissionless), and
 * the whole legacy tab set — minus `overview`, which dissolved into the
 * Control Room — lives in exactly one app.
 */
import { describe, it, expect } from 'vitest'
import {
  ADMIN_APPS,
  ADMIN_APP_IDS,
  DASHBOARD_VIEW_ID,
  adminAppById,
  adminAppForView,
  adminViewPath,
  buildAdminApps,
} from '../../components/admin/adminApps'

/** The monolithic AdminPanel's tab ids, as shipped before spec 093. */
const LEGACY_TAB_IDS = [
  'emergency', 'moderation',
  'deny-list', 'miniapp-review',
  'tiers', 'members', 'treasury', 'fees', 'perps-fees',
  'bridge', 'supply',
  'staking', 'protocol-config', 'oracle-adapters',
  'maintenance',
  'callsigns',
  'admin-roles',
  'services',
]

const NO_FLAGS = {}
const FLAG_NAMES = [
  'isAdmin', 'isGuardian', 'isAccountModerator', 'isRoleManager',
  'isSanctionsAdmin', 'isFeeAdmin', 'isStakingAdmin', 'isLiquidityAdmin', 'isAppCurator',
]
const only = (name) => ({ [name]: true })

const entitledViewIds = (flags) =>
  buildAdminApps(flags).flatMap((a) => a.views.map((v) => v.id))

describe('coverage — every legacy view has exactly one home (FR-001)', () => {
  it('the union of app views equals the legacy tab set minus overview', () => {
    const all = ADMIN_APPS.flatMap((a) => a.views.map((v) => v.id))
    expect([...all].sort()).toEqual([...LEGACY_TAB_IDS].sort())
  })

  it('no view id appears in two apps', () => {
    const all = ADMIN_APPS.flatMap((a) => a.views.map((v) => v.id))
    expect(new Set(all).size).toBe(all.length)
  })

  it('adminAppForView is total over the legacy set and null for overview', () => {
    for (const id of LEGACY_TAB_IDS) {
      const home = adminAppForView(id)
      expect(home, `no home for legacy view ${id}`).not.toBeNull()
      expect(ADMIN_APP_IDS).toContain(home.appId)
    }
    expect(adminAppForView('overview')).toBeNull()
    expect(adminAppForView('nonsense')).toBeNull()
  })

  it('the dashboard id is reserved and never a legacy view', () => {
    expect(LEGACY_TAB_IDS).not.toContain(DASHBOARD_VIEW_ID)
    expect(adminAppForView(DASHBOARD_VIEW_ID)).toBeNull()
  })

  it('adminViewPath builds the app-qualified address for a legacy view', () => {
    expect(adminViewPath('fees')).toBe('/admin/membership-revenue?view=fees')
    expect(adminViewPath('nope')).toBe('/admin')
  })
})

describe('gate matrix — verbatim from the retired buildAdminNavGroups', () => {
  const MATRIX = {
    emergency: ['isGuardian'],
    moderation: ['isAccountModerator'],
    'deny-list': ['isSanctionsAdmin', 'isAdmin'],
    'miniapp-review': ['isAppCurator', 'isAdmin'],
    tiers: ['isAdmin'],
    members: ['isRoleManager'],
    treasury: ['isAdmin'],
    fees: ['isAdmin', 'isFeeAdmin'],
    'perps-fees': ['isAdmin', 'isFeeAdmin'],
    bridge: ['isAdmin', 'isLiquidityAdmin', 'isGuardian'],
    supply: ['isAdmin', 'isLiquidityAdmin', 'isGuardian'],
    staking: ['isAdmin', 'isStakingAdmin', 'isGuardian'],
    'protocol-config': ['isAdmin'],
    'oracle-adapters': ['isAdmin'],
    callsigns: ['isAdmin'],
    'admin-roles': ['isAdmin'],
    services: ['isAdmin', 'isGuardian'],
  }

  for (const flagName of FLAG_NAMES) {
    it(`${flagName} alone unlocks exactly the views the matrix grants`, () => {
      const expected = Object.entries(MATRIX)
        .filter(([, flags]) => flags.includes(flagName))
        .map(([viewId]) => viewId)
      // maintenance is permissionless — present for every entrant.
      expected.push('maintenance')
      expect([...entitledViewIds(only(flagName))].sort()).toEqual([...expected].sort())
    })
  }

  it('perps-fees and fees share a gate exactly (spec 083 US5)', () => {
    for (const flagName of FLAG_NAMES) {
      const views = entitledViewIds(only(flagName))
      expect(views.includes('fees')).toBe(views.includes('perps-fees'))
    }
  })
})

describe('app visibility — at least one entitled view, or permissionless', () => {
  it('an app with zero entitled views is not returned', () => {
    const apps = buildAdminApps(only('isFeeAdmin')).map((a) => a.id)
    expect(apps).toContain('membership-revenue')
    expect(apps).toContain('maintenance')
    expect(apps).not.toContain('incident-response')
    expect(apps).not.toContain('identity')
    expect(apps).not.toContain('access-control')
    expect(apps).not.toContain('infrastructure')
  })

  it('a returned app carries only the entitled views', () => {
    const app = buildAdminApps(only('isFeeAdmin')).find((a) => a.id === 'membership-revenue')
    expect(app.views.map((v) => v.id).sort()).toEqual(['fees', 'perps-fees'])
  })

  it('maintenance is present with no flags at all (entry gate is the only gate)', () => {
    const apps = buildAdminApps(NO_FLAGS)
    expect(apps.map((a) => a.id)).toEqual(['maintenance'])
    expect(apps[0].permissionless).toBe(true)
  })

  it('an admin sees every app EXCEPT incident response — entry is not authority', () => {
    // Same as the legacy rail: the Incident Response group renders only for a
    // guardian or a moderator. ADMIN does not imply the killswitch.
    const expected = ADMIN_APP_IDS.filter((id) => id !== 'incident-response')
    expect(buildAdminApps(only('isAdmin')).map((a) => a.id).sort())
      .toEqual([...expected].sort())
  })

  it('a curator who holds nothing else still reaches the compliance app (spec 073)', () => {
    const apps = buildAdminApps(only('isAppCurator'))
    const compliance = apps.find((a) => a.id === 'compliance')
    expect(compliance).toBeTruthy()
    expect(compliance.views.map((v) => v.id)).toEqual(['miniapp-review'])
  })

  it('descriptors are not mutated by filtering', () => {
    buildAdminApps(only('isFeeAdmin'))
    expect(adminAppById('membership-revenue').views).toHaveLength(5)
  })
})
