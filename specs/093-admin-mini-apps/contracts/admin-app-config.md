# Contract: `adminApps.js` — the admin app/view/role matrix

**Module**: `frontend/src/components/admin/adminApps.js` (pure, no React, no side effects — unit
testable without rendering, like `adminNav.js` before it).

This is the single source of truth for which admin apps exist, which legacy views they contain,
and which role flags entitle an operator to see/launch them. The Control Room, the per-app
shell, the route guard, and the least-privilege tests all consume this module. Nothing else may
define an app → view → gate mapping.

## Exports

### `ADMIN_APPS: AdminApp[]`

Ordered list of the nine app descriptors (see data-model.md for field rules). Order is display
order in the Control Room.

```js
// Shape (illustrative):
{
  id: 'incident-response',
  name: 'Incident Response',
  blurb: 'Pause the registry and moderate accounts during an incident.',
  icon: 'alert',
  views: [
    { id: 'emergency',  label: 'Emergency',          icon: 'alert',     gate: (f) => f.isGuardian },
    { id: 'moderation', label: 'Account Moderation', icon: 'shieldOff', gate: (f) => f.isAccountModerator },
  ],
}
```

### `buildAdminApps(flags) -> EntitledApp[]`

Pure. Input: the RoleFlags object (identical shape to `buildAdminNavGroups`'s input today,
including the `isAppCurator` default-false caveat). Output: apps where `permissionless === true`
or at least one view gate passes, each carrying only its entitled views. An app with zero
entitled views and no `permissionless` flag MUST NOT be returned.

### `adminAppForView(viewId) -> { appId, viewId } | null`

Total lookup from legacy tab id to its home. Used by cross-view links (e.g. Bridge's "open
Fees") and by the coverage test. `overview` returns `null` (it dissolved into the Control Room).

### `ADMIN_APP_IDS: string[]`

Convenience list for the route guard (`/admin/:appId` validity check).

## Gate matrix (normative)

| App | View | Gate |
|---|---|---|
| incident-response | emergency | `isGuardian` |
| incident-response | moderation | `isAccountModerator` |
| compliance | deny-list | `isSanctionsAdmin \|\| isAdmin` |
| compliance | miniapp-review | `isAppCurator \|\| isAdmin` |
| membership-revenue | tiers | `isAdmin` |
| membership-revenue | members | `isRoleManager` |
| membership-revenue | treasury | `isAdmin` |
| membership-revenue | fees | `isAdmin \|\| isFeeAdmin` |
| membership-revenue | perps-fees | `isAdmin \|\| isFeeAdmin` |
| liquidity | bridge | `isAdmin \|\| isLiquidityAdmin \|\| isGuardian` |
| liquidity | supply | `isAdmin \|\| isLiquidityAdmin \|\| isGuardian` |
| protocol-config | staking | `isAdmin \|\| isStakingAdmin \|\| isGuardian` |
| protocol-config | protocol-config | `isAdmin` |
| protocol-config | oracle-adapters | `isAdmin` |
| maintenance | maintenance | permissionless (entry gate only) |
| identity | callsigns | `isAdmin` |
| access-control | admin-roles | `isAdmin` |
| infrastructure | services | `isAdmin \|\| isGuardian` |

Every gate above is copied verbatim from `buildAdminNavGroups` (adminNav.js @ staging). Any
change to this matrix is a role-model change and out of scope for 093.

## Route contract

| Address | Renders | Guard |
|---|---|---|
| `/admin` | Control Room | entry gate (`useAdminAccess`): granted → tiles; denied → "Access Restricted"; unverified → "Could Not Verify Access" + retry. No admin data fetched unless granted. |
| `/admin/:appId` | app screen, `dashboard` view | entry gate AND `buildAdminApps(flags)` contains `appId`; entitled-but-unknown `appId` → redirect `/admin`; entry-denied → same denied screens as `/admin` |
| `/admin/:appId?view=<id>` | app screen, that view | as above AND the view's own gate; unknown/unentitled view → app dashboard (no error leak) |

Dashboard is a reserved view id (`dashboard`) present on every app; it never appears in
`adminAppForView` (it is new, not a legacy tab).

## Test contract (what the suites assert against this module)

1. **Coverage/totality**: union of `views[].id` = legacy tab set − `overview`; no duplicates;
   `adminAppForView` is total over that set.
2. **Least privilege**: for each single-flag RoleFlags combination, `buildAdminApps` returns
   exactly the apps/views the matrix grants, and the rendered Control Room / app shell shows
   exactly those (config gate ≡ render gate).
3. **Permissionless honesty**: with zero flags but `hasAdminAccess` true (curator-only case) or
   any single admin flag, `maintenance` is present and carries no elevated-status styling class.
4. **Route guard**: unknown app id redirects; denied account sees the standard denied experience
   at any depth with no admin fetches (spies on read hooks).
