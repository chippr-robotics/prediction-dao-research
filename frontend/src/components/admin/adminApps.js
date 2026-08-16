/**
 * Admin mini-app registry (spec 093) — the single source of truth for which
 * admin apps exist, which legacy views each contains, and which role flags
 * entitle an operator to see and launch them.
 *
 * Pure data + pure functions, no React — unit-testable without rendering,
 * exactly like adminNav.js (which this file supersedes). The Control Room,
 * the per-app shell, the /admin/:appId route guard, and the least-privilege
 * tests all consume THIS module; nothing else may define an app → view → gate
 * mapping, because two matrices is how a nav gate and a render gate drift
 * apart.
 *
 * Every per-view gate below is copied verbatim from the retired
 * buildAdminNavGroups. Changing one is a role-model change, not a nav tweak —
 * it belongs in its own spec, with the contract that enforces it.
 *
 * UI gating here is PRESENTATION ONLY. The on-chain role checks are the
 * security boundary; a hand-typed URL past this matrix reaches a view that
 * still refuses at the contract (and the shell refuses render anyway, so a
 * hidden view is also an unrendered one).
 */

/** Reserved view id for each app's landing dashboard — never a legacy tab id. */
export const DASHBOARD_VIEW_ID = 'dashboard'

const view = (id, label, icon, gate) => ({ id, label, icon, gate })

export const ADMIN_APPS = [
  {
    id: 'incident-response',
    name: 'Incident Response',
    blurb: 'Pause a WagerRegistry and freeze accounts during an incident.',
    icon: 'alert',
    views: [
      view('emergency', 'Emergency', 'alert', (f) => Boolean(f.isGuardian)),
      view('moderation', 'Account Moderation', 'shieldOff', (f) => Boolean(f.isAccountModerator)),
    ],
  },
  {
    id: 'compliance',
    name: 'Compliance',
    blurb: 'Sanctions deny-list and mini-app curation review.',
    icon: 'ban',
    views: [
      view('deny-list', 'Deny-list', 'ban', (f) => Boolean(f.isSanctionsAdmin || f.isAdmin)),
      // Spec 073 FR-022: `isAppCurator` is answered by the MiniAppRegistry itself
      // (readCuratorAuthority), never by the app-wide role flags, and an unread
      // registry gates like "not a curator" here while the view discloses which
      // of the two states it actually is.
      view('miniapp-review', 'Mini-App Review', 'grid', (f) => Boolean(f.isAppCurator || f.isAdmin)),
    ],
  },
  {
    id: 'membership-revenue',
    name: 'Membership & Revenue',
    blurb: 'Tiers, memberships, treasury, and platform fee rates.',
    icon: 'bank',
    views: [
      view('tiers', 'Tiers', 'layers', (f) => Boolean(f.isAdmin)),
      view('members', 'Members', 'users', (f) => Boolean(f.isRoleManager)),
      view('treasury', 'Treasury', 'bank', (f) => Boolean(f.isAdmin)),
      // Unified platform-fee management (spec 060): FEE_ADMIN edits rates; ADMIN also enters.
      view('fees', 'Fees', 'coin', (f) => Boolean(f.isAdmin || f.isFeeAdmin)),
      // Perps fee rails (spec 083 US5): same gate as Fees — it is fee administration —
      // but a separate view because the GMX rail is not a FeeRouter service at all.
      view('perps-fees', 'Perps Fees', 'percent', (f) => Boolean(f.isAdmin || f.isFeeAdmin)),
    ],
  },
  {
    id: 'liquidity',
    name: 'Liquidity',
    blurb: 'Bridge routes and supplied pools — curation, limits, killswitches.',
    icon: 'transfer',
    views: [
      view('bridge', 'Bridge', 'transfer', (f) => Boolean(f.isAdmin || f.isLiquidityAdmin || f.isGuardian)),
      view('supply', 'Supply', 'sprout', (f) => Boolean(f.isAdmin || f.isLiquidityAdmin || f.isGuardian)),
    ],
  },
  {
    id: 'protocol-config',
    name: 'Protocol Config',
    blurb: 'Staking, registry wiring, allowed tokens, and oracle adapters.',
    icon: 'settings',
    views: [
      view('staking', 'Staking', 'trending', (f) => Boolean(f.isAdmin || f.isStakingAdmin || f.isGuardian)),
      view('protocol-config', 'Wiring & Tokens', 'settings', (f) => Boolean(f.isAdmin)),
      view('oracle-adapters', 'Oracle Adapters', 'broadcast', (f) => Boolean(f.isAdmin)),
    ],
  },
  {
    // Maintenance is its own app, deliberately (research R2): it is the one
    // PERMISSIONLESS surface. Folded into Protocol Config it would either drag
    // that tile onto every operator's Control Room (implying elevated status,
    // FR-010) or vanish for operators without protocol roles (a parity
    // regression, FR-005). Its own always-visible, plainly-labelled app is the
    // only shape that satisfies both.
    id: 'maintenance',
    name: 'Maintenance',
    blurb: 'Permissionless upkeep calls — expire opens, run auto-resolution.',
    icon: 'sliders',
    permissionless: true,
    views: [view('maintenance', 'Maintenance', 'sliders', () => true)],
  },
  {
    id: 'identity',
    name: 'Identity',
    blurb: 'Callsign registry moderation and policy.',
    icon: 'ticket',
    views: [view('callsigns', 'Callsigns', 'ticket', (f) => Boolean(f.isAdmin))],
  },
  {
    id: 'access-control',
    name: 'Access Control',
    blurb: 'Grant and revoke operator roles, per contract, per network.',
    icon: 'key',
    views: [view('admin-roles', 'Admin Roles', 'key', (f) => Boolean(f.isAdmin))],
  },
  {
    id: 'infrastructure',
    name: 'Infrastructure',
    blurb: 'Relay gateway health and paymaster operations.',
    icon: 'power',
    views: [view('services', 'Services', 'power', (f) => Boolean(f.isAdmin || f.isGuardian))],
  },
]

export const ADMIN_APP_IDS = ADMIN_APPS.map((a) => a.id)

/** Descriptor lookup; null for an unknown id (route guard redirects on null). */
export function adminAppById(appId) {
  return ADMIN_APPS.find((a) => a.id === appId) ?? null
}

/**
 * The apps (and, inside each, the views) the given role flags entitle.
 *
 * A view renders iff its OWN gate passes; an app is listed iff it is
 * permissionless or at least one of its views is entitled — the exact
 * group-rendering rule the monolithic rail used. Returns new objects; the
 * descriptors above are never mutated.
 */
export function buildAdminApps(flags = {}) {
  return ADMIN_APPS.map((app) => {
    const views = app.views.filter((v) => v.gate(flags))
    if (views.length === 0 && !app.permissionless) return null
    return { ...app, views }
  }).filter(Boolean)
}

/**
 * Where a legacy tab id lives now. Total over the legacy tab set minus
 * `overview` (which dissolved into the Control Room); null for anything else.
 * Drives cross-view links (e.g. Bridge's "open Fees") and the coverage test.
 */
export function adminAppForView(viewId) {
  for (const app of ADMIN_APPS) {
    if (app.views.some((v) => v.id === viewId)) return { appId: app.id, viewId }
  }
  return null
}

/** Route helper so cross-view links never hand-assemble the URL shape. */
export function adminViewPath(viewId) {
  const home = adminAppForView(viewId)
  if (!home) return '/admin'
  return `/admin/${home.appId}?view=${home.viewId}`
}
