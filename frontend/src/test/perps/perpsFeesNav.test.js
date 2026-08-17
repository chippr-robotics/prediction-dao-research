/**
 * Perps fee admin — navigation registration (spec 083 US5, T060), re-encoded
 * against the spec-093 admin app matrix.
 *
 * The view is only reachable if it is registered, and it is only SAFE if the
 * render is gated by the same predicate as the launcher entry. Since spec 093
 * both sides read ONE source (adminApps.js): the Control Room lists what
 * buildAdminApps returns, and AdminAppShell renders a view only when that
 * same view survives buildAdminApps for the operator's flags — so asserting
 * the matrix asserts the render gate. The placement decision also carries
 * over: Perps Fees sits beside Fees inside Membership & Revenue because it IS
 * fee administration, even though one of its two rails is not a FeeRouter
 * service.
 */
import { describe, it, expect } from 'vitest'
import { buildAdminApps, adminAppForView, adminAppById } from '../../components/admin/adminApps'

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

const viewIds = (flags) => buildAdminApps(flags).flatMap((a) => a.views.map((v) => v.id))

describe('Perps Fees admin app registration', () => {
  it('a fee admin reaches it without full admin', () => {
    expect(viewIds({ ...NO_ROLES, isFeeAdmin: true })).toContain('perps-fees')
  })

  it('a full admin reaches it without the dedicated role', () => {
    expect(viewIds({ ...NO_ROLES, isAdmin: true })).toContain('perps-fees')
  })

  it('an operator holding every other role does not', () => {
    const views = viewIds({
      ...NO_ROLES,
      isGuardian: true,
      isAccountModerator: true,
      isRoleManager: true,
      isSanctionsAdmin: true,
      isStakingAdmin: true,
      isLiquidityAdmin: true,
      isAppCurator: true,
    })
    expect(views).not.toContain('perps-fees')
  })

  it('sits beside Fees inside Membership & Revenue — it is fee administration', () => {
    expect(adminAppForView('perps-fees')).toEqual({ appId: 'membership-revenue', viewId: 'perps-fees' })
    expect(adminAppForView('fees')).toEqual({ appId: 'membership-revenue', viewId: 'fees' })
    const app = buildAdminApps({ ...NO_ROLES, isFeeAdmin: true }).find((a) => a.id === 'membership-revenue')
    expect(app.views.map((i) => i.id)).toEqual(['fees', 'perps-fees'])
    expect(app.views.map((i) => i.label)).toEqual(['Fees', 'Perps Fees'])
  })

  it('carries a known NavIcon glyph for the rail', () => {
    const view = adminAppById('membership-revenue').views.find((v) => v.id === 'perps-fees')
    expect(view.icon).toBeTruthy()
  })

  it('the view render is gated by the SAME matrix as the launcher (spec 093)', async () => {
    // AdminAppShell resolves the active view against buildAdminApps(flags) —
    // a hand-typed ?view= that the matrix does not grant renders the
    // dashboard, never the view. Assert the wiring at the source level.
    const shell = (await import('../../components/admin/AdminAppShell.jsx?raw')).default
    expect(shell).toMatch(/buildAdminApps\(flags\)/)
    expect(shell).toMatch(/entitledApp\?\.views\.some\(\(v\) => v\.id === requestedView\)/)
  })

  it('passes the panel a way back to the Fees view rather than a second rate control', async () => {
    const src = (await import('../../components/admin/apps/MembershipRevenueApp.jsx?raw')).default
    const render = src.slice(src.indexOf("viewId === 'perps-fees'"))
    expect(render.slice(0, 700)).toContain("adminViewPath('fees')")
  })
})
