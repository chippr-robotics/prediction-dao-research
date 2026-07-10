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

// Quick-access entry pinned to the top of the drawer list.
export const HOME_ITEM = { id: 'home', label: 'Home', icon: '🏠', to: '/app' }

// Grouped section rail. `id` matches the WalletPage tab id; `icon` drives both
// the drawer and the mobile bottom nav.
export const NAV_GROUPS = [
  {
    label: 'Finance',
    items: [
      { id: 'trade', label: 'Trade', icon: '🔄' },
      { id: 'paytransfer', label: 'Pay & Transfer', icon: '💸' },
      // 'custody' tab id preserved; surfaced to users as "Protect".
      { id: 'custody', label: 'Protect', icon: '🛡️' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { id: 'addressbook', label: 'Address Book', icon: '📇' },
      { id: 'backup', label: 'Backup', icon: '💾' },
      { id: 'reports', label: 'Reporting', icon: '📊' },
      // Security relocated here from the former Admin group.
      { id: 'security', label: 'Security', icon: '🔐' },
      { id: 'network', label: 'Network', icon: '🌐' },
    ],
  },
  {
    label: 'Apps',
    items: [
      { id: 'clearpath', label: 'ClearPath', icon: '🧭' },
      { id: 'tokens', label: 'Token Mint', icon: '🪙' },
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
