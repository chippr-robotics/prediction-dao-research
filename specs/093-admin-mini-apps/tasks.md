# Tasks: Admin Mini-Apps — Granular Operations Control

**Input**: Design documents from `/specs/093-admin-mini-apps/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/admin-app-config.md, quickstart.md

**Tests**: included — constitution principle II (test-first) is non-negotiable in this repo.
All paths are relative to the repository root. Local vitest runs must stay scoped (never a bare
`vitest run`).

## Phase 1: Setup

- [ ] T001 Verify baseline: `npx vitest run frontend/src/test/admin/ frontend/src/test/adminNav.test.js` is green on the branch before any change (record any pre-existing failures in the PR notes)

## Phase 2: Foundational (blocking prerequisites for all user stories)

- [ ] T002 [P] Create `frontend/src/components/admin/adminApps.js` implementing the contract in `specs/093-admin-mini-apps/contracts/admin-app-config.md`: `ADMIN_APPS` (nine descriptors, gate matrix verbatim from `adminNav.js`), `buildAdminApps(flags)`, `adminAppForView(viewId)`, `ADMIN_APP_IDS`, plus a reserved `dashboard` view id constant
- [ ] T003 [P] Create `frontend/src/test/admin/adminApps.test.js`: totality (view-id union = legacy tab set − `overview`, no duplicates, `adminAppForView` total), gate matrix per single-flag combination, permissionless maintenance behavior, app-hidden-when-no-view-entitled
- [ ] T004 [P] Extract `frontend/src/components/admin/useAdminAccess.js` from `AdminPanel.jsx`: role flags via `useRoles()`, async curator authority via `readCuratorAuthority`, `hasAdminAccess`, three-way `entryState` (`granted`/`denied`/`unverified`) + retry callback; unit test in `frontend/src/test/admin/useAdminAccess.test.jsx` covering the three-way distinction
- [ ] T005 [P] Extract `frontend/src/components/admin/useAdminTx.js` from `AdminPanel.jsx` (`runTx(fn, successMsg) → boolean` with the same notification semantics); unit test in `frontend/src/test/admin/useAdminTx.test.jsx`
- [ ] T006 Create `frontend/src/components/admin/AdminAppShell.jsx`: per-app chrome (header with icon/name, "Control Room" back link, PortalNav `variant='tabs'` rail over the app's entitled views + `dashboard`, mobile collapse behavior carried over from AdminPanel), entry-gate rendering via `useAdminAccess`, `?view=` resolution (unknown/unentitled → dashboard); styles in `frontend/src/components/AdminPanel.css` (reuse existing shell classes; add only tokens-based additions)
- [ ] T007 Wire routes in `frontend/src/App.jsx`: `/admin` → `ControlRoom`, `/admin/:appId` → lazy per-app screens (`React.lazy` + suspense fallback), unknown `appId` → `<Navigate to="/admin" replace>`; keep the route inside the authenticated group
- [ ] T008 Create `frontend/src/test/admin/adminRoutes.test.jsx`: route guard (denied account sees standard denied screens at every depth, no admin read hooks fire — spy), unknown app id redirect, `?view=` resolution incl. unknown view → dashboard

**Checkpoint**: config + shell + routes exist; no user story is complete yet but all can start.

## Phase 3: User Story 1 — Narrow-role operator sees only their app (P1) 🎯 MVP

**Goal**: Control Room lists exactly the entitled apps; launching works; denied/unverified
experiences preserved.

**Independent test**: quickstart.md §Manual validation steps 1–2.

- [ ] T009 [P] [US1] Create `frontend/src/components/admin/ControlRoom.jsx`: entry gate via `useAdminAccess` (granted → tile grid from `buildAdminApps`; denied → "Access Restricted"; unverified → "Could Not Verify Access" + Retry), tiles show name/blurb/NavIcon glyph + TileStatus slot (data-model.md), maintenance tile styled without elevated-status affordance; navigate to `/admin/<id>` on activation; keyboard/AT: tiles are links with accessible names
- [ ] T010 [P] [US1] Create `frontend/src/components/admin/ControlRoom.css` (tokens only; responsive grid; no hardcoded colors; compact estate strip area)
- [ ] T011 [US1] Implement TileStatus sources in `ControlRoom.jsx` (per data-model.md: pause states, pending review count, accrued fees snapshot, gateway status — all via existing hooks/reads, three-state, rendered only on `read`; `none` renders nothing)
- [ ] T012 [US1] Create `frontend/src/test/admin/ControlRoom.test.jsx`: per-flag tile visibility parity against `buildAdminApps` (render-gate ≡ config-gate — this is the least-privilege invariant, replacing `adminLeastPrivilege.test.jsx`'s raw-source diff), denied/unverified rendering, no admin fetches when denied, TileStatus three-state honesty (unreadable never renders a number)
- [ ] T013 [US1] Re-point `frontend/src/test/admin/adminEstateEntry.test.jsx` at the Control Room route keeping all three-way entry-gate assertions and retry behavior

**Checkpoint**: US1 fully functional — Control Room + gating + launchable (empty) app shells.

## Phase 4: User Story 2 — Every existing control survives (P1)

**Goal**: all 19 legacy views re-hosted across the nine apps with unchanged gates, scope, and
write semantics; monolith retired.

**Independent test**: quickstart.md §Manual validation step 3 + migrated admin suites green.

- [ ] T014 [P] [US2] Create `frontend/src/components/admin/apps/IncidentResponseApp.jsx`: extract the inline `emergency` and `moderation` views from `AdminPanel.jsx` (pause/unpause via scoped WagerRegistry with `useScopedChain`; freeze/unfreeze with ENS resolution + validation + legal links), using `useAdminTx`; per-view gates from `adminApps.js`
- [ ] T015 [P] [US2] Create `frontend/src/components/admin/apps/ComplianceApp.jsx`: re-host `DenyListAdmin` and `MiniAppReviewTab` unchanged as views; pass through curator-authority disclosure
- [ ] T016 [P] [US2] Create `frontend/src/components/admin/apps/MembershipRevenueApp.jsx`: extract inline `tiers`, `members`, `treasury` (MembershipManager writes pinned to `membershipChainId()`, no picker — preserve comment rationale); re-host `FeesTab` and `PerpsFeesPanel` as views
- [ ] T017 [P] [US2] Create `frontend/src/components/admin/apps/LiquidityApp.jsx`: re-host `BridgeTab` and `SupplyTab`; replace `onOpenFees` prop wiring with `navigate('/admin/membership-revenue?view=fees')`
- [ ] T018 [P] [US2] Create `frontend/src/components/admin/apps/ProtocolConfigApp.jsx`: re-host `StakingTab`, `ProtocolConfigTab`, `OracleAdaptersTab` as views
- [ ] T019 [P] [US2] Create `frontend/src/components/admin/apps/MaintenanceApp.jsx`: re-host `MaintenanceTab`; no elevated-status affordances
- [ ] T020 [P] [US2] Create `frontend/src/components/admin/apps/IdentityApp.jsx`: re-host `CallsignRegistryAdmin`
- [ ] T021 [P] [US2] Create `frontend/src/components/admin/apps/AccessControlApp.jsx`: extract the inline `admin-roles` view (11 role targets incl. per-router bridge/liquidity roles via `roleHomeContract()` and `readRouterAuthority`, scoped chain, ENS)
- [ ] T022 [P] [US2] Create `frontend/src/components/admin/apps/InfrastructureApp.jsx`: extract the inline `services` view; re-host `ServiceHealthCard` + `PaymasterOpsCard`
- [ ] T023 [US2] Reduce `frontend/src/components/AdminPanel.jsx` to the Control Room delegation (or delete it and mount `ControlRoom` directly from the route): remove all tab rendering, inline views, and `buildAdminNavGroups` usage; delete `frontend/src/components/admin/adminNav.js` and `frontend/src/test/adminNav.test.js` (superseded — coverage lives in `adminApps.test.js`)
- [ ] T024 [US2] Hygiene (research R8): delete `frontend/src/components/admin/NullifierTab.jsx`, `frontend/src/components/RoleManagementAdmin.css`, and the `liquidityAdminCards.jsx` re-export shim (update its two importers to `scopeControls`)
- [ ] T025 [US2] Migrate invariant suites: re-encode `frontend/src/test/admin/adminViewScope.test.jsx` (drop the two `AdminPanel.jsx?raw` source-text assertions in favor of rendered-scope assertions against app components), update `adminIncidentEstate.test.jsx` and `adminEstateGuard.test.js` source-lint targets to the new `admin/apps/*` file set, re-point `adminSidePanel.test.jsx` at `AdminAppShell` rail behavior (collapse, mobile backdrop, aria-expanded), delete `adminLeastPrivilege.test.jsx` (replaced by T012)
- [ ] T026 [US2] Update tab-level suites for new mounts where they render through the panel (`FeesTab`, `StakingTab.shell`, `MiniAppReviewTab`, `PerpsFeesPanel` nav test, `MembershipTreasuryOverview`) — mechanical import/mount fixes only; run `npx vitest run frontend/src/test/admin/ frontend/src/test/FeesTab.test.jsx frontend/src/test/staking-admin/ frontend/src/test/perps/PerpsFeesPanel.test.jsx frontend/src/test/miniapps/MiniAppReviewTab.test.jsx`
- [ ] T027 [US2] Parity audit: walk the inventory table in research.md R5/plan — for each of the 19 legacy views confirm every read/control exists in its app view (checklist committed as `specs/093-admin-mini-apps/parity-audit.md` with per-view ✔ and file pointer)

**Checkpoint**: full functional parity; monolith gone; all admin suites green.

## Phase 5: User Story 3 — Polished dashboards with charts (P2)

**Goal**: each app opens on a dashboard with honest, brand-aligned visualizations.

**Independent test**: quickstart.md §Manual validation step 4 + chart/axe suites.

- [ ] T028 [P] [US3] Create chart kit in `frontend/src/components/admin/charts/`: `AdminSparkline.jsx`, `AdminBarList.jsx`, `AdminStatTile.jsx`, `adminCharts.css` per data-model.md input contracts (three-state, explicit empty state "No recorded activity", partial annotation naming what is missing, values printed as text, `role="img"`+`aria-label`+`figure/figcaption`, `--chart-series-*` tokens only); extract sparkline/bars from `MembershipTreasuryOverview.jsx` and re-consume there
- [ ] T029 [P] [US3] Create `frontend/src/test/admin/adminCharts.test.jsx`: three-state honesty (unreadable never renders a number, empty renders the empty state, partial names missing chains), axe pass for each primitive
- [ ] T030 [US3] Dashboards (reserved `dashboard` view) per research R5 table: incident-response (pause tiles + `ChainStateTable`), compliance (deny-list activity sparkline + review queue), membership-revenue (`MembershipTreasuryOverview` + fee-rate bar list + `FeeBpsChanged` history sparkline), liquidity (route/pool tiles + supplied bar list), protocol-config (wiring `ChainStateTable` + staking tiles), maintenance (roster table + session outcomes), identity (registrations sparkline + status bars via `useCallsignRegistryMetrics`), access-control (role-target coverage table + address check tool), infrastructure (gateway tiles + paymaster deposit bar list) — one task per file under `frontend/src/components/admin/apps/`, all fed by existing hooks/reads, all states honest
- [ ] T031 [US3] Dashboard smoke tests per app in `frontend/src/test/admin/appDashboards.test.jsx`: renders with populated mock reads (chart present), with empty reads (explicit empty state), with unreadable reads (labelled, no zeros)
- [ ] T032 [US3] Style pass: Control Room + shells + dashboards against brand rules (tokens only, opaque status surfaces, `--warning-text` for amber text, links ≥ `--accent-color` contrast); run `npx vitest run frontend/src/test/brand/`
- [ ] T033 [US3] Screenshot validation via the `actor-critic-screens` skill: Control Room + at least three app dashboards, both themes, both viewports; iterate until the critic passes; attach summary to PR

## Phase 6: User Story 4 — Addressability (P2)

**Goal**: stable addresses for apps and views; legacy `/admin` lands on Control Room.

**Independent test**: quickstart.md §Manual validation step 5.

- [ ] T034 [US4] Verify/complete `?view=` deep links: entering `/admin/<appId>?view=<id>` as entitled lands on the view (URL is source of truth — rail selection updates searchParams, back/forward works); as non-entitled yields the standard denied experience with no admin fetches; covered by extending `frontend/src/test/admin/adminRoutes.test.jsx`
- [ ] T035 [US4] Update entry points and docs: confirm `FairWinsUserModal.jsx` / `UserManagementModal.jsx` `navigate('/admin')` still lands correctly; grep docs/runbooks for admin-tab references (`docs/runbooks/*.md`, `docs/developer-guide/*.md`) and update instructions that name the old tab navigation to the new addresses

## Phase 7: Polish & cross-cutting

- [ ] T036 [P] Write `docs/developer-guide/admin-mini-apps.md`: the adminApps.js contract, how to add an app/view, gating rules (UI is presentation; contracts enforce), chart-kit usage and three-state obligations, and why these are host-bundled rather than registry packages (link research R1)
- [ ] T037 [P] Add the CLAUDE.md guardrail bullet for spec 093 (admin apps are host-bundled, `adminApps.js` is the single source, never re-introduce a second app/role matrix, maintenance stays permissionless, dashboards never render failed reads as zeros)
- [ ] T038 Full verification per the `monorepo-verify` skill: `npm run lint` (frontend), scoped vitest for all touched suites, `npx vitest run frontend/src/test/miniapps/packageBoundary.test.js frontend/src/test/brand/`, and confirm no `frontend/miniapps/` or `contracts/` files changed (byte gates unaffected — state this in the PR)
- [ ] T039 Update `specs/093-admin-mini-apps/spec.md` status → Implemented; check off quickstart SC validation; commit, push `claude/admin-screens-mini-apps-9c67yi`, open PR against `staging`

## Dependencies

- Phase 2 blocks everything; T002 blocks T003/T006/T007; T004 blocks T006/T009; T006 blocks T014–T022.
- US1 (Phase 3) needs only Phase 2. US2 needs Phase 2 (independent of US1 except T023 which follows T009). US3 needs US2 views in place (T030 touches app files from T014–T022). US4 needs Phase 2 routes; T034 can run parallel to US3.
- Suggested MVP: Phases 1–3 (Control Room + gating over empty shells) — demonstrable granular access; Phases 4–5 deliver parity and polish; ship requires through Phase 7.

## Parallel execution examples

- After T006: T014–T022 are nine parallel extractions (different files).
- T028/T029 (chart kit + tests) parallel to late US2 tasks.
- T036/T037 parallel to T038.
