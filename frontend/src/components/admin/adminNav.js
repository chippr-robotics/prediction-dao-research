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
  tiers: 'layers',
  members: 'users',
  treasury: 'bank',
  fees: 'coin',
  staking: 'trending',
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
