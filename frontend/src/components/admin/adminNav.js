/**
 * Operations control plane navigation model.
 *
 * Pure function so the grouping/gating logic is unit-testable without
 * rendering the panel. Each view is gated by the on-chain role it requires;
 * a group renders only when the operator can use at least one view inside it.
 *
 * Icons are NavIcon glyph names (used by both PortalNav and the mobile
 * SectionIconNav quick-nav).
 */

export const ADMIN_TAB_ICONS = {
  overview: 'grid',
  emergency: 'alert',
  moderation: 'shieldOff',
  'deny-list': 'ban',
  'miniapp-review': 'grid',
  tiers: 'layers',
  members: 'users',
  treasury: 'bank',
  fees: 'coin',
  'perps-fees': 'percent',
  staking: 'trending',
  bridge: 'transfer',
  supply: 'sprout',
  'protocol-config': 'settings',
  'oracle-adapters': 'broadcast',
  maintenance: 'sliders',
  callsigns: 'ticket',
  'admin-roles': 'key',
  services: 'power',
}

export function buildAdminNavGroups({
  isAdmin,
  isGuardian,
  isAccountModerator,
  isRoleManager,
  isSanctionsAdmin,
  isFeeAdmin,
  isStakingAdmin,
  isLiquidityAdmin,
  // Spec 073: NOT one of the app-wide role flags above. `APP_CURATOR_ROLE` administers itself
  // on the MiniAppRegistry, so no other role implies it and it cannot be synced into the role
  // storage the rest of this file reads. The AdminPanel resolves it by asking the registry
  // (`lib/miniapps/registryAuthority.js`) and passes the definite answer through here, which is
  // why it defaults to false: an unread registry must gate like "not a curator" in the NAV,
  // while the tab itself says which of the two it actually is.
  isAppCurator,
}) {
  const item = (id, label) => ({ id, label, icon: ADMIN_TAB_ICONS[id] })

  const groups = [
    {
      label: 'Control Room',
      items: [item('overview', 'Overview')],
    },
    {
      label: 'Incident Response',
      items: [
        isGuardian && item('emergency', 'Emergency'),
        isAccountModerator && item('moderation', 'Account Moderation'),
      ].filter(Boolean),
    },
    {
      label: 'Compliance',
      items: [
        (isSanctionsAdmin || isAdmin) && item('deny-list', 'Deny-list'),
        // Mini-app curation (spec 073 FR-022). Compliance rather than Protocol Config: the
        // decision being made is "may members run this vendor's code", which is a review
        // judgement, not protocol wiring. ADMIN enters read-only for transparency — the tab
        // offers lifecycle controls only to accounts the REGISTRY reports as curators, which is
        // a different question from being a platform administrator (the role administers itself
        // precisely so an admin cannot grant it).
        (isAppCurator || isAdmin) && item('miniapp-review', 'Mini-App Review'),
      ].filter(Boolean),
    },
    {
      label: 'Membership & Revenue',
      items: [
        isAdmin && item('tiers', 'Tiers'),
        isRoleManager && item('members', 'Members'),
        isAdmin && item('treasury', 'Treasury'),
        // Unified platform-fee management (spec 060): FEE_ADMIN edits rates; ADMIN also enters.
        (isAdmin || isFeeAdmin) && item('fees', 'Fees'),
        // Perps fee rails (spec 083 US5). A SEPARATE view rather than a section of Fees, because
        // one of the two rails is not a FeeRouter service at all: the GMX UI fee lives in GMX's
        // own DataStore on Arbitrum and is set by a `msg.sender`-keyed venue call. Same gate as
        // Fees — it is fee administration — but it is not the same contract, and pretending
        // otherwise is what a second config store would look like.
        (isAdmin || isFeeAdmin) && item('perps-fees', 'Perps Fees'),
      ].filter(Boolean),
    },
    {
      // Cross-chain bridging + Uniswap supplying (spec 067). These are
      // member-value surfaces with their own killswitches — routes, curated
      // pools, limits and pauses that move member money — not protocol
      // wiring, so they get their own group rather than living under Protocol
      // Config. LIQUIDITY_ADMIN configures, GUARDIAN pauses, ADMIN enters
      // (FR-040 / FR-049).
      label: 'Liquidity',
      items: [
        (isAdmin || isLiquidityAdmin || isGuardian) && item('bridge', 'Bridge'),
        (isAdmin || isLiquidityAdmin || isGuardian) && item('supply', 'Supply'),
      ].filter(Boolean),
    },
    {
      label: 'Protocol Config',
      items: [
        // Staking control surface (spec 066): STAKING_ADMIN manages provider addrs +
        // validator allowlist; GUARDIAN pauses; both enter, as does ADMIN.
        (isAdmin || isStakingAdmin || isGuardian) && item('staking', 'Staking'),
        isAdmin && item('protocol-config', 'Wiring & Tokens'),
        isAdmin && item('oracle-adapters', 'Oracle Adapters'),
        // Maintenance calls are permissionless on-chain; any operator may run them.
        item('maintenance', 'Maintenance'),
      ].filter(Boolean),
    },
    {
      label: 'Identity',
      items: [isAdmin && item('callsigns', 'Callsigns')].filter(Boolean),
    },
    {
      label: 'Access Control',
      items: [isAdmin && item('admin-roles', 'Admin Roles')].filter(Boolean),
    },
    {
      label: 'Infrastructure',
      items: [
        (isAdmin || isGuardian) && item('services', 'Services'),
      ].filter(Boolean),
    },
  ]

  return groups.filter((g) => g.items.length > 0)
}

/** Flat item list (for the mobile SectionIconNav and default-tab checks). */
export function flattenNavGroups(groups) {
  return groups.flatMap((g) => g.items)
}
