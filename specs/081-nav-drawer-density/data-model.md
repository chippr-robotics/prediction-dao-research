# Phase 1 Data Model: Nav Drawer Density

No on-chain state, no gateway state, no synced account data. Two device-scoped preference
entries inside the existing global preference blob (`fw_global_prefs` in `localStorage`,
written through `utils/userStorage#saveGlobalPreference`).

Both are **deliberately absent** from `frontend/src/lib/backup/syncedObjects.js` — how one
device's menu is folded, and how tightly it draws its rows, are per-device display choices, not
account data. Same treatment as `miniapp_favorites` and `network_endpoints`.

## `nav_sections` — section expanded/collapsed state

```jsonc
{
  "nav_sections": {
    "quick-access": true,
    "finance": true,
    "tools": false,
    "apps": false
  }
}
```

| Field | Type | Notes |
|---|---|---|
| key | string | Section key — the group label lowercased with non-alphanumerics collapsed to `-` (`"Quick Access"` → `"quick-access"`). Derived, so a renamed or tenant-hidden group needs no migration. |
| value | boolean | `true` = expanded. |

**Defaults** (`DEFAULT_EXPANDED_SECTIONS`): `quick-access: true`, `finance: true`; every other
section defaults to `false`. A key absent from storage takes its default. A key present in
storage for a section that no longer renders is inert and is neither read nor cleaned up.

**Validation on read**: a non-object value, or any entry whose value is not a boolean, is
dropped. A completely unreadable blob yields `{}` — i.e. all defaults. The store never throws.

**Derived, never stored**: the effective expansion map the drawer hands to `PortalNav`:

```
effective[key] = filterActive            ? true
               : key === activeGroupKey  ? true
               : stored[key] ?? DEFAULT_EXPANDED_SECTIONS[key] ?? false
```

Neither override is written back (spec FR-004, FR-016).

## `nav_density` — row density

```jsonc
{ "nav_density": "compact" }
```

| Value | Meaning |
|---|---|
| `"comfortable"` | Default. Today's spacing, unchanged. |
| `"compact"` | Tightened rows; adds `app-nav-drawer--compact` to the drawer root. |

**Validation on read**: any value that is not exactly one of the two literals resolves to
`"comfortable"`.

## Existing entities — unchanged

- **`miniapp_favorites`** (`lib/miniapps/favorites.js`): `{ id, slug, name }[]`. This feature
  changes only how the list is *presented*; the store, its API, and its persisted shape are
  untouched.
- **Nav groups** (`config/appNav.js`): `NAV_GROUPS`, tenant filtering, and chain-aware
  `visibleNavGroups` are untouched. Section keys are derived from group labels at render time.

## Store surface (`frontend/src/lib/nav/navPreferences.js`)

Mirrors `lib/miniapps/favorites.js` — lazily-loaded snapshot, revision counter, subscriber set,
plus a test reset seam.

```js
export const NAV_SECTIONS_PREF_KEY  // 'nav_sections'
export const NAV_DENSITY_PREF_KEY   // 'nav_density'
export const NAV_DENSITIES          // ['comfortable', 'compact']
export const DEFAULT_EXPANDED_SECTIONS

export function sectionKey(label)                  // 'Quick Access' -> 'quick-access'
export function loadSectionState()                 // {} | { [key]: boolean }
export function isSectionExpanded(key)             // stored ?? default ?? false
export function setSectionExpanded(key, expanded)
export function toggleSection(key)

export function loadNavDensity()                   // 'comfortable' | 'compact'
export function setNavDensity(value)               // ignores unknown values

export function subscribeNavPreferences(listener)  // () => unsubscribe
export function navPreferencesRevision()
export function __resetNavPreferencesForTests()
```
