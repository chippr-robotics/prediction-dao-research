/**
 * Shared app-navigation model for the redesigned nav shell.
 *
 * One source of truth consumed by three surfaces:
 *   - AppNavDrawer      — the global left drawer opened by the clover logo ("us")
 *   - SectionIconNav    — the mobile bottom icon bar for quick sub-section switching
 *   - WalletPage        — hosts the section panels, keyed by the same tab ids
 *
 * Every section item routes to `/wallet?tab=<id>` (the panels render there); the
 * Home entry is the dashboard. Account / Membership / Preferences intentionally
 * live on the account button (top right), NOT in this menu, so they are absent
 * from the groups below.
 */

// Quick-access entry pinned to the top of the drawer list. `icon` is a NavIcon
// name (see components/nav/NavIcon.jsx) — flat line glyphs, not emoji.
export const HOME_ITEM = { id: 'home', label: 'Home', icon: 'home', to: '/app' }

// Grouped section rail. `id` matches the WalletPage tab id; `icon` drives both
// the drawer and the mobile bottom nav.
export const NAV_GROUPS = [
  {
    label: 'Finance',
    items: [
      { id: 'portfolio', label: 'Portfolio', icon: 'trending' },
      // Earn — lending & rewards (spec 050). Always present; the panel
      // self-discloses per-network availability.
      { id: 'earn', label: 'Earn', icon: 'sprout' },
      { id: 'trade', label: 'Trade', icon: 'trade' },
      { id: 'paytransfer', label: 'Pay & Transfer', icon: 'transfer' },
      // 'custody' tab id preserved; surfaced to users as "Protect".
      { id: 'custody', label: 'Protect', icon: 'shield' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { id: 'addressbook', label: 'Address Book', icon: 'addressbook' },
      { id: 'backup', label: 'Backup', icon: 'backup' },
      { id: 'reports', label: 'Reporting', icon: 'reports' },
      // Security relocated here from the former Admin group.
      { id: 'security', label: 'Security', icon: 'lock' },
      { id: 'network', label: 'Network', icon: 'globe' },
    ],
  },
  {
    label: 'Apps',
    items: [
      { id: 'clearpath', label: 'ClearPath', icon: 'compass' },
      { id: 'tokens', label: 'Token Mint', icon: 'coin' },
    ],
  },
]

// Path a section item navigates to. Home has its own absolute route.
export function pathForNavItem(id) {
  if (id === HOME_ITEM.id) return HOME_ITEM.to
  return `/wallet?tab=${id}`
}

// The group a given tab id belongs to (used by SectionIconNav to show siblings).
// Returns null for tabs that are not part of the menu (account/membership/etc.).
export function groupForTab(tabId) {
  return NAV_GROUPS.find((group) => group.items.some((item) => item.id === tabId)) || null
}
