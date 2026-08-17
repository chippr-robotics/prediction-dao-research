# Data Model: Admin Mini-Apps (093)

No persisted data, no on-chain entities, no new storage. All entities are in-memory view models
derived from existing sources at render time.

## AdminApp (static descriptor, `adminApps.js`)

| Field | Type | Rules |
|---|---|---|
| `id` | string | kebab-case, unique, stable (URL segment `/admin/<id>`) |
| `name` | string | display name for tile + app header |
| `blurb` | string | one-line tile description |
| `icon` | string | `NavIcon` glyph name (reuses `ADMIN_TAB_ICONS` vocabulary) |
| `views` | AdminView[] | ordered, non-empty; first entitled view after `dashboard` is the rail default |
| `permissionless` | boolean | `true` only for `maintenance` (visible to any entrant, implies no elevated status) |

Invariant (tested): the union of all `views[].id` across apps equals exactly the legacy tab id
set minus `overview`, with no duplicates (FR-001 coverage; `overview` dissolves into the Control
Room).

## AdminView

| Field | Type | Rules |
|---|---|---|
| `id` | string | legacy tab id, unchanged (`emergency`, `fees`, …) — stable for `?view=` addresses |
| `label` | string | rail label, unchanged from today's nav |
| `icon` | string | glyph name |
| `gate` | (flags) => boolean | pure predicate over the role-flag object; identical to today's per-item predicate in `buildAdminNavGroups` |

App visibility = OR over `views[].gate(flags)` (or `permissionless`). A view renders iff its own
gate passes — never merely because the app is visible.

## RoleFlags (input, existing shape)

`{ isAdmin, isGuardian, isAccountModerator, isRoleManager, isSanctionsAdmin, isFeeAdmin,
isStakingAdmin, isLiquidityAdmin, isAppCurator }` — produced by `useAdminAccess` from
`useRoles()` + `readCuratorAuthority`. `isAppCurator` defaults to `false` until the registry
answers `held` (existing semantics).

## AdminAccess (derived, `useAdminAccess`)

| Field | Type | Notes |
|---|---|---|
| `flags` | RoleFlags | estate-wide role answers |
| `hasAdminAccess` | boolean | `hasAnyRole(ADMIN_ROLES) \|\| isAppCurator` (unchanged) |
| `entryState` | `'granted' \| 'denied' \| 'unverified'` | maps to today's three screens: panel / "Access Restricted" / "Could Not Verify Access" (+ retry) |
| `curatorAuthority` | five-state | passthrough of `readCuratorAuthority` outcome for the Compliance app's own disclosure |

## TileStatus (Control Room headline status, per app)

Discriminated union — a status is rendered only in state `read`; otherwise the tile shows a
labelled non-value state. Never a number defaulted from a failed read.

```
{ state: 'read', summary: string, tone: 'ok' | 'warn' | 'alert' }
{ state: 'not-deployed' }
{ state: 'unreadable' }
{ state: 'none' }            // app has no headline source (renders nothing extra)
```

Sources per app (all existing reads): incident-response ← pause states; compliance ← pending
review count; membership-revenue ← accrued fees snapshot; liquidity ← pause states;
protocol-config ← staking pause; infrastructure ← gateway status; others `none`.

## ChartSeries / ChartDatum (chart kit inputs)

`AdminSparkline`: `{ points: number[], label: string, latestLabel: string }` — rendered only
when `points.length > 0`; empty ⇒ explicit "No recorded activity" state.

`AdminBarList`: `{ items: [{ label, value, display }], partial?: { missing: string[] } }` —
values always printed as text; `partial` renders a named "missing" annotation.

`AdminStatTile`: `{ label, result }` where `result` is the existing three-state
`chainReadResult` shape (`isRead(result)` gates value rendering).

## State transitions

None persisted. URL is the only navigation state: `/admin` ⇄ `/admin/:appId?view=<viewId>`.
In-app scope selection (`useScopedChain`) remains per-view component state, seeded once, exactly
as today.
