# Research: Admin Mini-Apps (093)

Phase 0 output. Sources: full read of `frontend/src/components/AdminPanel.jsx` and every
`frontend/src/components/admin/*` module; the spec-073/077 mini-app platform (contracts, loader,
host context, registry client, build preset, publish pipeline, package-boundary gates); the
admin test suites; charting usage across the frontend.

## R1 — Packaging: host-bundled apps, not registry packages

**Decision**: Admin mini-apps are first-party, host-bundled screens presented through
mini-app-style chrome (tiles, per-app routes, per-app gating). They are not built with the
mini-app preset, not published to IPFS, not registered on the `MiniAppRegistry`, and never
rendered through `MiniAppWorkspace`.

**Rationale** (each point verified in code):

1. **The platform has no private/role-gated app concept anywhere.** `AppRecord`
   (`contracts/apps/MiniAppRegistry.sol`) carries no visibility/audience/role/tier field;
   `getAppsPaged` returns every record to every caller; `fetchCatalog`
   (`frontend/src/lib/miniapps/registryClient.js`) filters on `launchable` only;
   `/apps/:slug` is launchable by anyone. Admin-only visibility would require a UUPS storage
   change or accepting publicly listed admin tooling.
2. **The `host` object exposes no authority** (ten keys, no roles/tier/isAdmin), so a converted
   app would re-implement `useRoles`/`registryAuthority` inside a frozen package — including the
   "Could Not Verify Access" vs "Access Restricted" distinction the platform treats as a
   correctness requirement.
3. **Package boundary**: packages cannot import `frontend/src`
   (`frontend/src/test/miniapps/packageBoundary.test.js`, both directions). The admin tabs are
   among the heaviest consumers of shared host code (`lib/chains/estate`, `config/contracts`,
   `hooks/*`, `admin/scopeControls|scopeGate`, `components/ui/*`). By the platform's own
   criterion (docs/developer-guide/miniapps.md: "shared UI is the disqualifier"), admin screens
   fail conversion the same way Wagers did.
4. **Host `submit` has no batch/DELEGATECALL and resolves at broadcast**; `manifest.contracts`
   caps at 16 names; `host.networks()` is cohort-only. Several admin flows (11 role targets,
   per-router authority, GMX DataStore on Arbitrum) do not fit.
5. **Publishing admin UI to IPFS makes its bytes public and immutable**, and every fix would
   need pin → `submitUpdate` → curator approval per cohort.

**Alternatives considered**: (a) true registry packages — rejected for the five reasons above;
(b) hybrid "shape the seams for later extraction" — rejected as speculative complexity (YAGNI);
nothing in this feature precludes a later extraction spec if the platform ever grows a private
catalog.

**Confirmed with product owner** (interactive question, 2026-08-16): host-bundled; monolithic
panel replaced in the same release.

## R2 — App partitioning: nine apps over the existing gating matrix

**Decision**: One app per current rail group, with two deliberate departures:

| App id | Name | Views (existing tab ids) | Qualifying flags (visibility) |
|---|---|---|---|
| `incident-response` | Incident Response | `emergency`, `moderation` | `isGuardian \|\| isAccountModerator` |
| `compliance` | Compliance | `deny-list`, `miniapp-review` | `isSanctionsAdmin \|\| isAppCurator \|\| isAdmin` |
| `membership-revenue` | Membership & Revenue | `tiers`, `members`, `treasury`, `fees`, `perps-fees` | `isAdmin \|\| isRoleManager \|\| isFeeAdmin` |
| `liquidity` | Liquidity | `bridge`, `supply` | `isAdmin \|\| isLiquidityAdmin \|\| isGuardian` |
| `protocol-config` | Protocol Config | `staking`, `protocol-config`, `oracle-adapters` | `isAdmin \|\| isStakingAdmin \|\| isGuardian` |
| `maintenance` | Maintenance | `maintenance` | any entrant (entry gate only) |
| `identity` | Identity | `callsigns` | `isAdmin` |
| `access-control` | Access Control | `admin-roles` | `isAdmin` |
| `infrastructure` | Infrastructure | `services` | `isAdmin \|\| isGuardian` |

Per-view gates inside an app are **unchanged** from `buildAdminNavGroups` (e.g. inside
`incident-response`, `emergency` still requires `isGuardian` specifically). App visibility is the
OR of its views' gates — an operator sees an app iff they can use at least one view inside it,
exactly the group-rendering rule today.

**Departures and why**:

- **Maintenance is its own app.** It is the one permissionless view (`adminNav.js` renders it for
  every entrant). Folding it into Protocol Config would either show the Protocol tile to every
  operator (implying elevated status, violating spec FR-010) or hide maintenance from operators
  without protocol roles (a parity regression against FR-005). A dedicated always-visible app is
  the only shape satisfying both.
- **Overview dissolves into the Control Room** (spec assumption): the launcher carries the
  headline status the Overview tab carried (pause state, treasury/fees snapshot, gateway health),
  as per-tile status and a compact estate strip.

**Entry gate unchanged**: `hasAdminAccess = hasAnyRole(ADMIN_ROLES) || isAppCurator`, with the
existing three-way outcome (granted / "Access Restricted" definite-no / "Could Not Verify
Access" with retry when no chain answered). Curator authority stays async via
`readCuratorAuthority` and gates like "not held" until a definite yes (nav) while the Compliance
app itself discloses which of the two states it is in (existing `MiniAppReviewTab` behavior).

## R3 — Routing and addressability

**Decision**: `react-router` routes inside the authenticated group in `App.jsx`:

- `/admin` → `ControlRoom` (replaces the monolithic panel at its existing address)
- `/admin/:appId` → the app screen, lazy-loaded; unknown `appId` → `<Navigate to="/admin">`
- `?view=<viewId>` selects an interior view; absent/unknown → the app's dashboard. View state
  moves from `useState` into the URL (searchParams) so views are shareable (spec FR-008).

Non-entitled accounts get the same denied experience at every depth — the guard lives in the
shared shell (`useAdminAccess`), and app screens fetch nothing until access resolves (existing
AdminPanel behavior, preserved).

Cross-view links that exist today (`onOpenFees` from Bridge/Supply/PerpsFees) become
`navigate('/admin/membership-revenue?view=fees')`.

**Why `?view=` and not a path segment**: mirrors the platform's established pattern
(`/wallet?tab=…`, Apps `?view=` in `storeViews.js`), keeps one route entry per app, and lets
unknown views degrade to the dashboard without a 404-ish redirect.

## R4 — Single source of truth for the app/role matrix

**Decision**: `frontend/src/components/admin/adminApps.js` exports:

- `ADMIN_APPS` — ordered app descriptors (id, name, blurb, icon, views with per-view gate keys)
- `buildAdminApps(flags)` — pure; returns entitled apps with entitled views (same flag object
  shape `buildAdminNavGroups` takes today, including the `isAppCurator` caveat)
- `adminAppForView(viewId)` — total map from legacy tab id → `{appId, viewId}` (drives cross-view
  links and guarantees FR-001 coverage)

Consumed by: Control Room (tiles), `AdminAppShell` (interior rail + render gates), route guard,
and tests. The current least-privilege test diffs raw `AdminPanel.jsx` source against
`adminNav.js`; the replacement asserts, per app and view, that the rendered gate equals the
config gate by rendering with each single-flag combination — a stronger, non-source-text
invariant. `adminNav.js` is retired (its test suite is superseded by `adminApps` tests).

## R5 — Charts: promote the existing hand-rolled SVG pattern into a shared kit

**Decision**: three primitives under `frontend/src/components/admin/charts/`, extracted from the
proven `MembershipTreasuryOverview` implementations:

- `AdminSparkline` — SVG line+area sparkline (`role="img"`, `aria-label` naming latest value,
  `<figure>/<figcaption>`), min/max normalized, end-dot.
- `AdminBarList` — labelled horizontal distribution bars (CSS width %), values always printed as
  text next to the bar (never color-only).
- `AdminStatTile` — headline stat with an explicit three-state contract: renders value only for
  `read`, "not deployed" and "unreadable" as labelled states, and optional "partial — missing X"
  annotation.

**Rationale**: `recharts` exists in `package.json` but is used by exactly one lazy member surface
(`PnlChartCanvas`); pulling it into nine admin dashboards would grow the admin chunk for no
capability we need (sparklines, bars, tiles). The hand-rolled pattern already passes the brand
gates and axe, uses `--chart-series-a…d` from `theme.css` for both themes, and keeps all color in
tokens. Dataviz rules applied: real observed data only, explicit empty state ("No recorded
activity"), partial totals labelled and named, values printed as text, no fabricated series.

**Dashboard data sources (all pre-existing reads)**:

| App | Dashboard content | Source |
|---|---|---|
| incident-response | pause state per chain (stat tiles + `ChainStateTable`), frozen-check tool | existing WagerRegistry `paused()` estate read |
| compliance | deny-list actions over time (sparkline) + current denials (stat), review queue count | `DenyListUpdated` scan (exists in `DenyListAdmin`), registry catalog counts (`registryClient`) |
| membership-revenue | `MembershipTreasuryOverview` (sparkline + revenue bars) + fee rates by service (bar list) + `FeeBpsChanged` history | `useMembershipTreasuryStats`, `useFeeEstate`, FeesTab reads |
| liquidity | routes/pools enabled counts (tiles), supplied totals per chain (bar list), pause states | BridgeTab/SupplyTab reads |
| protocol-config | wiring status per chain (`ChainStateTable`), staking pause + validator count (tiles), adapter/feed counts | ProtocolConfig/Staking/OracleAdapters reads |
| maintenance | network roster with deployment status (table) + last action outcomes (in-session) | scoped roster (exists) |
| identity | registrations over time (sparkline), status distribution (bar list) | `useCallsignRegistryMetrics` (exists) |
| access-control | role targets × scoped chain coverage table; per-address check tool | existing `hasRole` reads |
| infrastructure | gateway status (tiles), paymaster deposit per chain (bar list) | `useGatewayStatus`, PaymasterOpsCard reads |

Where history is unavailable but live state is readable, the dashboard renders live state and
marks history unavailable (spec edge case). No new indexing.

## R6 — Write plumbing and scope semantics move unchanged

**Decision**: extract `runTx` into `useAdminTx` (same `(fn, successMsg) → boolean` contract, same
notification wiring) and keep `useScopedChain`/`WriteGate`/`writeGateReason`/`writeAllowed`
(`admin/scopeGate.js`, `admin/scopeControls.jsx`) exactly as they are. Invariants explicitly
preserved:

- scope seeds once from the wallet chain and never re-derives (FR-016 of spec 071 lineage);
- `readable === false` stays permissive — an RPC timeout never withdraws a killswitch;
- MembershipManager writes (tiers/members/treasury withdraw) stay pinned to
  `membershipChainId()` with deliberately no picker;
- role-target writes keep `roleHomeContract()` mapping and per-router authority
  (`readRouterAuthority`) for bridge/liquidity roles;
- incident controls act on exactly one chain; no fan-out control exists anywhere
  (`adminIncidentEstate.test.jsx` invariant).

## R7 — Test migration map

| Existing suite | Fate |
|---|---|
| `test/admin/adminLeastPrivilege.test.jsx` (raw-source diff) | replaced by `adminApps` config-vs-render parity suite (stronger: renders per-flag) |
| `test/admin/adminEstateEntry.test.jsx` (renders `<AdminPanel/>`) | re-pointed at Control Room route; same three-way entry-gate assertions |
| `test/admin/adminSidePanel.test.jsx` | re-pointed at `AdminAppShell` rail behavior (collapse/mobile/aria) |
| `test/admin/adminViewScope.test.jsx` (2 raw-source asserts) | re-encoded against app components (rendered scope wiring, no raw-source dependency) |
| `test/admin/adminIncidentEstate.test.jsx`, `adminEstateGuard.test.js` | source-lint targets updated to the new file set, invariants unchanged |
| `test/adminNav.test.js` | superseded by `test/admin/adminApps.test.js` |
| Tab-level suites (FeesTab, StakingTab, Bridge/Supply, OracleAdapters, Callsign, MiniAppReview, PerpsFees, MembershipTreasuryOverview, PortalNav) | unchanged or mechanical import/mount updates only |

New suites: `adminApps.test.js` (totality: every legacy tab id maps to exactly one app/view;
gate matrix), `ControlRoom.test.jsx` (per-flag tile visibility, denied experience, no admin
fetches when denied), `adminRoutes.test.jsx` (`/admin/:appId` guard + `?view=` resolution +
unknown-id redirect), `adminCharts.test.jsx` (three-state honesty + axe), per-app dashboard
smoke tests.

## R8 — Orphans and cleanups encountered (in scope as hygiene, not behavior)

- `frontend/src/components/admin/NullifierTab.jsx` (485 LOC) is imported nowhere — delete.
- `frontend/src/components/RoleManagementAdmin.css` has no component — delete.
- `frontend/src/components/admin/liquidityAdminCards.jsx` is a back-compat re-export shim —
  collapse imports to `scopeControls` and remove the shim.
