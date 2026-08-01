/**
 * Shared app-navigation model for the redesigned nav shell.
 *
 * One source of truth consumed by three surfaces:
 *   - AppNavDrawer      — the global left drawer opened by the clover logo ("us")
 *   - SectionIconNav    — the mobile bottom icon bar for quick sub-section switching
 *   - WalletPage        — hosts the section panels, keyed by the same tab ids
 *
 * Every section item routes to `/wallet?tab=<id>` (the panels render there); the
 * Home entry is the dashboard. Account / Membership / Network / Preferences
 * intentionally live on the account button (top right), NOT in this menu, so they
 * are absent from the groups below.
 */

// Quick-access entry pinned to the top of the drawer list. `icon` is a NavIcon
// name (see components/nav/NavIcon.jsx) — flat line glyphs, not emoji.
export const HOME_ITEM = { id: 'home', label: 'Home', icon: 'home', to: '/app' }

// Portfolio — pinned into Quick Access alongside Home (not a Finance section
// item), so it keeps its 'portfolio' tab id / `/wallet?tab=portfolio` route but
// is absent from the Finance group's bottom icon nav (see groupForTab).
export const PORTFOLIO_ITEM = { id: 'portfolio', label: 'Portfolio', icon: 'trending' }

// Wagers (spec 053) — the relocated create-types + actions grid. Like Home, it is an absolute
// top-level route (not a `/wallet?tab=` section); it lives in the drawer's Apps group
// (see AppNavDrawer's DRAWER_GROUPS).
export const WAGERS_ITEM = { id: 'wagers', label: 'Wagers', icon: 'ticket', to: '/wagers' }

import { isFeatureEnabled } from './tenant'

// Tenant feature gating (spec 072 T019/FR-002): nav item id -> manifest feature id.
// Items not listed are core platform surfaces every tenant gets (transfer,
// address book, reporting). A feature the tenant does not enable is ABSENT from
// nav and groups — never present-but-broken. The default tenant enables every
// feature, so its nav is unchanged.
const NAV_FEATURE_IDS = {
  wagers: 'wagers',
  earn: 'earn',
  trade: 'swap',
  collectibles: 'collect',
  predict: 'predict',
  custody: 'protect',
  security: 'recovery',
  clearpath: 'clearpath',
  tokens: 'token-mint',
}

export function isNavItemEnabledForTenant(id) {
  const featureId = NAV_FEATURE_IDS[id]
  return featureId ? isFeatureEnabled(featureId) : true
}

// Grouped section rail. `id` matches the WalletPage tab id; `icon` drives both
// the drawer and the mobile bottom nav. Defined raw, then filtered to the
// active tenant's feature set below.
const RAW_NAV_GROUPS = [
  {
    label: 'Finance',
    items: [
      // Earn — lending & rewards (spec 050). Always present; the panel
      // self-discloses per-network availability.
      { id: 'earn', label: 'Earn', icon: 'sprout' },
      { id: 'trade', label: 'Trade', icon: 'trade' },
      // Collectibles (spec 055) — read-only NFT display. Unlike Earn, this item HIDES
      // entirely on networks without the capability (FR-007); consumers filter via
      // visibleNavGroups with { collectibles: collectiblesAvailable(chainId) }.
      { id: 'collectibles', label: 'Collect', icon: 'gem' },
      // Predict (spec 057) — Polymarket prediction-market trading. Like Collect, it HIDES entirely on
      // networks without the capability (Polygon-only, FR-018); consumers filter via visibleNavGroups
      // with { predict: capabilities.predict && predictGatewayUrl() !== '' }.
      { id: 'predict', label: 'Predict', icon: 'predict' },
      // 'paytransfer' tab id preserved (deep links / saved routes keep resolving,
      // spec 067 FR-002); surfaced to users as "Transfer".
      { id: 'paytransfer', label: 'Transfer', icon: 'transfer' },
    ],
  },
  {
    label: 'Tools',
    items: [
      // 'custody' tab id preserved; surfaced to users as "Protect". Lives in
      // Tools (not Finance) — it is an account-security tool, not a spending
      // surface (spec 068 FR-024).
      { id: 'custody', label: 'Protect', icon: 'shield' },
      { id: 'addressbook', label: 'Address Book', icon: 'addressbook' },
      // Recovery — data backup, account controllers, legacy key/word-list
      // recovery, and encryption keys, combined into one panel (tab id
      // 'security', kept stable). The old 'backup' tab id is a deep-link alias
      // (see WalletPage TAB_ALIASES).
      { id: 'security', label: 'Recovery', icon: 'lock' },
      { id: 'reports', label: 'Reporting', icon: 'reports' },
      // 'network' deliberately absent (spec 069): network settings moved to the account
      // button beside Preferences. The app reads every supported network at once, so the
      // active chain is a per-transaction detail rather than a tool you go to — and the
      // panel is now mostly endpoint configuration, which belongs with preferences. The
      // tab id stays 'network' so saved links keep resolving (WalletPage hosts it).
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

// The tenant-scoped nav model every consumer reads. Chain-based visibility
// still applies at render time via visibleNavGroups(visibility).
export const NAV_GROUPS = RAW_NAV_GROUPS
  .map((group) => ({ ...group, items: group.items.filter((item) => isNavItemEnabledForTenant(item.id)) }))
  .filter((group) => group.items.length > 0)

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
