# Implementation Plan: Admin Mini-Apps — Granular Operations Control

**Branch**: `claude/admin-screens-mini-apps-9c67yi` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/093-admin-mini-apps/spec.md`

## Summary

Decompose the monolithic `AdminPanel` (1,367-line shell + 19 tab views behind one `/admin` route
with transient tab state) into **nine host-bundled admin mini-apps** launched from a **Control
Room** at `/admin`, each app at `/admin/<appId>` with `?view=` addressing its interior views.
Apps are first-party code presented through mini-app-style chrome (tiles, per-app role gating,
headline status) — they do **not** touch the spec-073 registry, IPFS pipeline, or the `host`
object. A single declarative source (`adminApps.js`) defines the app → view → role matrix and is
consumed by the Control Room, each app shell, the route guard, and the least-privilege tests.
Each app opens on a dashboard with honest, three-state chart primitives (shared hand-rolled SVG
components on the existing `--chart-series-*` tokens) fed by data the tabs already read.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 19, Vite (rolldown), react-router

**Primary Dependencies**: existing only — no new packages. Charts are hand-rolled SVG (the
existing `MembershipTreasuryOverview` sparkline/bar pattern, promoted to shared primitives);
`recharts` stays lazy-loaded in the member PnL surface only.

**Storage**: none new. No new authorization store (FR-003/SC-006); role flags keep coming from
`hooks/useRoles` (estate-wide `hasRole`) and `lib/miniapps/registryAuthority` (curator).

**Testing**: Vitest (scoped runs locally; full suite in CI), jest-axe for a11y, brand gates in
`frontend/src/test/brand/`.

**Target Platform**: FairWins SPA (all tenants; admin surfaces are operator-only).

**Project Type**: Web frontend (React + Vite). Frontend-only feature — zero contract changes.

**Performance Goals**: Control Room initial render must not fan out heavier reads than today's
Overview tab; per-app code is lazily loaded (`React.lazy`) so member bundles do not grow.

**Constraints**: package-boundary rules are untouched (nothing moves into `frontend/miniapps/`);
estate reads keep the three-state `read | not-deployed | unreadable` model — a failed read never
renders as zero; write scoping keeps the spec-071 rules (one tx, one named chain, authority read
from the enforcing contract, `writeGateReason`/`writeAllowed` semantics preserved, including the
"unreadable stays permissive" killswitch rule).

**Scale/Scope**: 9 admin apps covering the 19 existing views; ~10 new components (Control Room,
app shell, chart kit, dashboards); AdminPanel.jsx shrinks to a redirect-compatible entry; ~12
existing admin test suites updated, plus new suites for the app config, Control Room, routes, and
charts.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Security-first contracts | **PASS (n/a)** — no change under `contracts/`. On-chain roles remain the sole enforcement layer; UI gating is presentation (spec FR-003). No new authority store. |
| II. Test-first, comprehensive | **PASS** — the least-privilege invariant (nav gate == render gate) is re-encoded against the new single-source config; every moved view keeps its existing suite (updated imports/shell); new suites cover app config totality, route guarding, Control Room gating, and chart three-state honesty. Full suite runs in CI. |
| III. Honest state | **PASS (load-bearing)** — dashboards consume existing estate reads and event scans; chart primitives take three-state inputs and render explicit empty/partial/unreadable states (never fabricated series, never `?? 0`). Cohort scoping unchanged. |
| IV. Fail loudly in CI | **PASS** — no CI changes; brand gates, axe suites, and the admin suites gate as today. |
| V. Accessible, consistent frontend | **PASS** — WCAG 2.1 AA; chart primitives ship `role="img"` + `aria-label` + `<figure>/<figcaption>` and table/text equivalents; brand tokens only (`theme.css`), no hardcoded colors, opaque status surfaces. |

**Post-design re-check (after Phase 1)**: unchanged — no violations, no Complexity Tracking
entries required.

## Project Structure

### Documentation (this feature)

```text
specs/093-admin-mini-apps/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── admin-app-config.md   # Phase 1 output — the adminApps.js contract
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── components/
│   ├── AdminPanel.jsx                 # becomes thin: entry gate + routes delegation (kept for /admin)
│   ├── AdminPanel.css                 # shell styles kept; new files below own new surfaces
│   └── admin/
│       ├── adminApps.js               # NEW — single source: app → views → role matrix (pure)
│       ├── adminNav.js                # retired in favor of adminApps.js (kept only if a re-export helps tests)
│       ├── AdminAppShell.jsx          # NEW — per-app chrome: header, back link, view rail, entry gate
│       ├── ControlRoom.jsx            # NEW — launcher: entitled tiles + headline status
│       ├── ControlRoom.css            # NEW
│       ├── useAdminAccess.js          # NEW — extracted role/curator/estate gate (from AdminPanel)
│       ├── useAdminTx.js              # NEW — extracted runTx plumbing (from AdminPanel)
│       ├── charts/
│       │   ├── AdminSparkline.jsx     # NEW — SVG sparkline (promoted from MembershipTreasuryOverview)
│       │   ├── AdminBarList.jsx       # NEW — horizontal distribution bars
│       │   ├── AdminStatTile.jsx      # NEW — stat tile with three-state value rendering
│       │   └── adminCharts.css        # NEW — tokens-only styling
│       ├── apps/
│       │   ├── IncidentResponseApp.jsx    # emergency + moderation (extracted from AdminPanel inline)
│       │   ├── ComplianceApp.jsx          # deny-list + miniapp-review
│       │   ├── MembershipRevenueApp.jsx   # tiers + members + treasury + fees + perps-fees
│       │   ├── LiquidityApp.jsx           # bridge + supply
│       │   ├── ProtocolConfigApp.jsx      # staking + wiring/tokens + oracle-adapters
│       │   ├── MaintenanceApp.jsx         # maintenance (own app: permissionless reachability, FR-010)
│       │   ├── IdentityApp.jsx            # callsigns
│       │   ├── AccessControlApp.jsx       # admin-roles (extracted from AdminPanel inline)
│       │   └── InfrastructureApp.jsx      # services (+ paymaster ops)
│       └── [existing tab components unchanged in place: FeesTab, StakingTab, BridgeTab, …]
├── App.jsx                            # /admin → ControlRoom, /admin/:appId → app screens (lazy)
└── test/
    ├── admin/                         # updated invariants + new suites (see tasks)
    └── adminNav.test.js               # superseded by adminApps tests
```

**Structure Decision**: everything stays inside `frontend/src` (host-bundled — see research R1).
Existing large tab components (`FeesTab`, `BridgeTab`, `SupplyTab`, `StakingTab`,
`OracleAdaptersTab`, `DenyListAdmin`, `MiniAppReviewTab`, `CallsignRegistryAdmin`,
`MaintenanceTab`, `PerpsFeesPanel`, `ProtocolConfigTab`, `PaymasterOpsCard`,
`ServiceHealthCard`, `MembershipTreasuryOverview`, `ChainStateTable`) are **not rewritten** —
they are re-hosted as views inside app screens. Only the views living inline in `AdminPanel.jsx`
(emergency, moderation, tiers, members, treasury, admin-roles, services shell) are extracted into
their app components. `frontend/miniapps/` is untouched.

## Design Decisions (summary — full reasoning in research.md)

- **R1 Host-bundled, not registry packages**: the spec-073 registry has no visibility/role
  concept anywhere (contract, catalog client, launch path); the `host` object exposes no
  authority; packages cannot import `frontend/src` (where every admin lib lives); publishing
  would make admin UI bytes public and immutable. Conversion to true packages fails the repo's
  own package-candidate criterion ("shared UI is the disqualifier"). Confirmed with product
  owner.
- **R2 Nine apps** mapping 1:1 onto today's gating matrix, with two deliberate departures from
  the current rail grouping: Maintenance becomes its own app (it is the only permissionless
  surface; leaving it inside Protocol Config would either hide it from non-protocol operators —
  a parity regression — or force the Protocol tile onto everyone), and Overview dissolves into
  the Control Room.
- **R3 Routing**: `/admin` = Control Room; `/admin/:appId` = app; `?view=<viewId>` = interior
  view (defaulting to the app's dashboard). Route guard renders the same denied experience as
  today's entry gate; unknown appId → Control Room redirect. Per-app `React.lazy`.
- **R4 Single source of truth**: `adminApps.js` exports a pure `buildAdminApps(flags)` (same
  flag inputs as `buildAdminNavGroups` today). The Control Room, app shells, route guard, and
  the least-privilege test all consume it; the test asserts render gates equal config gates, so
  the invariant currently enforced by raw-source diffing survives the decomposition in stronger
  form.
- **R5 Charts**: promote the existing hand-rolled SVG sparkline + CSS bar patterns into three
  shared primitives (`AdminSparkline`, `AdminBarList`, `AdminStatTile`) that accept three-state
  inputs. No new dependency; `--chart-series-*` tokens; axe-clean. Dashboards feed them from
  reads that already exist (fee history, membership stats, callsign metrics, gateway status,
  paymaster deposits, deny-list events, liquidity totals, staking events).
- **R6 Writes**: `runTx`, `useScopedChain`, `WriteGate`, `writeGateReason` semantics are moved,
  not changed. MembershipManager writes stay pinned to `membershipChainId()`; scoped writes keep
  per-view scope state.
- **R7 Tests**: suites that render `<AdminPanel />` or read `AdminPanel.jsx?raw` are re-pointed
  at the new structure while preserving each invariant (entry gate distinction, least privilege,
  view scope, incident single-chain, estate guard).

## Complexity Tracking

No constitution violations. No entries.
