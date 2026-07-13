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

// Wagers (spec 053) — the relocated create-types + actions grid. Like Home, it is an absolute
// top-level route (not a `/wallet?tab=` section); it lives in the drawer's Apps group
// (see AppNavDrawer's DRAWER_GROUPS).
export const WAGERS_ITEM = { id: 'wagers', label: 'Wagers', icon: 'ticket', to: '/wagers' }

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
      // Collectibles (spec 055) — read-only NFT display. Unlike Earn, this item HIDES
      // entirely on networks without the capability (FR-007); consumers filter via
      // visibleNavGroups with { collectibles: collectiblesAvailable(chainId) }.
      { id: 'collectibles', label: 'Collectibles', icon: 'gem' },
      { id: 'paytransfer', label: 'Pay & Transfer', icon: 'transfer' },
      // 'custody' tab id preserved; surfaced to users as "Protect".
      { id: 'custody', label: 'Protect', icon: 'shield' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { id: 'addressbook', label: 'Address Book', icon: 'addressbook' },
      // Backup + Security combined into one panel (tab id 'security'); the old
      // 'backup' tab id is kept as a deep-link alias (see WalletPage TAB_ALIASES).
      { id: 'security', label: 'Backup & Security', icon: 'lock' },
      { id: 'reports', label: 'Reporting', icon: 'reports' },
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

// Path a section item navigates to. Home and Wagers have their own absolute routes.
export function pathForNavItem(id) {
  if (id === HOME_ITEM.id) return HOME_ITEM.to
  if (id === WAGERS_ITEM.id) return WAGERS_ITEM.to
  return `/wallet?tab=${id}`
}

// The group a given tab id belongs to (used by SectionIconNav to show siblings).
// Returns null for tabs that are not part of the menu (account/membership/etc.).
export function groupForTab(tabId) {
  return NAV_GROUPS.find((group) => group.items.some((item) => item.id === tabId)) || null
}

// Chain-aware menu: drop items whose feature is absent on the active network
// (spec 055 FR-007 — a dead tab must not render anywhere, drawer or bottom bar).
// `visibility` maps item id -> boolean; ids not listed stay visible. Groups that
// end up empty disappear with their label.
export function visibleNavGroups(visibility = {}, groups = NAV_GROUPS) {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => visibility[item.id] !== false) }))
    .filter((group) => group.items.length > 0)
}
