# Feature Specification: Admin Mini-Apps — Granular Operations Control

**Feature Branch**: `claude/admin-screens-mini-apps-9c67yi` (spec directory `093-admin-mini-apps`)

**Created**: 2026-08-16

**Status**: Implemented

**Input**: User description: "The user admin screens are currently a monolithic view with grouped
sections. We need to transition these groups to mini apps so we can provide more granular access
control. Each group of admin controls should be presented as a mini app. The mini apps should all
have clean, functional interfaces, appropriate graphs and charts, and sections should have a
polished appearance in line with the app style guides."

## Overview

Today the operations control plane is one monolithic Admin Panel: a single screen whose left rail
groups every administrative view (incident response, compliance, membership & revenue, liquidity,
protocol configuration, identity, access control, infrastructure). Every operator who can enter the
panel is presented with the whole console, filtered only by which rail items their roles unlock.

This feature transitions each **group** of admin controls into its own **admin mini-app**: a
separately launchable, self-contained operations app with its own tile, its own entry route, and
its own role-derived access gate. Operators land on a **Control Room** launcher that shows exactly
the apps their on-chain roles entitle them to — an operator holding only the fee-administration
role sees only the Revenue app, not a console with seventeen locked doors. Each admin app opens
with a clean dashboard view — appropriate charts and summary figures for its domain — with the
full controls beneath, styled to the platform brand guidelines.

Admin mini-apps are **host-bundled first-party apps** presented through the platform's mini-app
chrome (tiles, launch routes, per-app gating). They are **not** published to IPFS or curated on
the public mini-app registry: they remain part of the shipped application, retaining direct access
to the platform's administrative libraries and privileged read paths. The member-facing Apps
catalog is unchanged — admin apps appear only inside the operations area, only to entitled
operators. On-chain contracts remain the actual security boundary; app visibility is presentation,
never authorization.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Narrow-role operator sees only their app (Priority: P1)

An operator whose only elevated authority is fee administration opens the operations area. Instead
of the monolithic console, they see a Control Room with exactly the admin apps their roles unlock —
for them, the Revenue app. They launch it, adjust a platform fee rate, and are never shown groups
of controls they cannot use.

**Why this priority**: Granular access presentation is the core ask. It reduces operator error
surface, makes delegation legible ("you have the Revenue app" instead of "you can use 2 of 19
tabs"), and is the foundation every other story builds on.

**Independent Test**: Sign in with an account holding exactly one admin-adjacent role (e.g. fee
admin). Verify the Control Room lists only the apps that role unlocks, that launching one lands on
a working app, and that apps for unheld roles are neither listed nor reachable by direct URL
without an honest "not entitled" state.

**Acceptance Scenarios**:

1. **Given** an account holding only the fee-administration role, **When** it opens the operations
   area, **Then** the Control Room shows the Revenue app (and any permissionless apps) and no
   others.
2. **Given** an account holding the platform-admin role, **When** it opens the operations area,
   **Then** every admin app is listed and launchable.
3. **Given** an account with no admin-adjacent roles, **When** it navigates to the operations area
   by URL, **Then** it sees the same access-denied experience the Admin Panel shows today (no app
   tiles, no admin data fetched).
4. **Given** an operator viewing an admin app they are entitled to enter in read-only capacity
   (e.g. platform admin viewing mini-app curation without curator authority), **When** the app
   loads, **Then** controls they cannot execute are presented in the same read-only manner the
   monolithic panel presents them today.

---

### User Story 2 - Every existing control survives the transition (Priority: P1)

An operator who used any view of the monolithic panel (emergency pause, deny-list management,
tier configuration, member roles, treasury, fees, perps fees, staking, bridge, supply, wiring &
tokens, oracle adapters, maintenance, callsigns, admin roles, services, mini-app review) finds the
same capability inside the corresponding admin app, with the same role gating and the same honest
on-chain state semantics.

**Why this priority**: This is a re-presentation, not a rewrite. Losing an emergency control or a
compliance control during a UI transition is an operational incident. Functional parity is
non-negotiable for shipping at all.

**Independent Test**: For each view of the current panel, enumerate its controls and reads;
verify each is reachable and functional inside its admin app, gated by the same role.

**Acceptance Scenarios**:

1. **Given** any control present in the monolithic panel today, **When** the transition ships,
   **Then** that control exists in exactly one admin app, behind the same role gate, operating on
   the same chain scope.
2. **Given** an operator mid-incident, **When** they need the emergency pause, **Then** the
   Incident Response app is reachable in no more clicks than the current emergency tab.
3. **Given** an on-chain read that fails (chain unreachable), **When** an admin app renders that
   figure, **Then** it shows the failure state honestly — never a zero or stale value presented as
   live (consistent with the platform's estate-read rules).

---

### User Story 3 - Each app opens on a polished dashboard with charts (Priority: P2)

An operator launching an admin app lands on a dashboard view for that domain: summary stat tiles
and appropriate charts (e.g. fee-rate history and revenue by service for Revenue; membership tier
distribution and purchases over time for Membership; pool/route status for Liquidity; service
health for Infrastructure), followed by the operational controls. Visuals follow the platform
brand guidelines and data-visualization standards.

**Why this priority**: "Clean, functional, polished, with appropriate graphs and charts" is an
explicit ask, but it is valuable only after access granularity (US1) and parity (US2) are safe.

**Independent Test**: Launch each admin app with a populated test estate; verify the dashboard
renders charts from real observed data, renders honest empty/partial states when data is missing,
and passes the brand/accessibility gates.

**Acceptance Scenarios**:

1. **Given** an admin app with historical on-chain activity, **When** its dashboard loads,
   **Then** at least one chart or summary visualization of that domain's real data is shown.
2. **Given** a domain with no recorded activity yet, **When** the dashboard loads, **Then** charts
   show an explicit empty state — never fabricated or placeholder series.
3. **Given** any admin app screen, **When** audited against the platform style guide and
   accessibility gates, **Then** it passes (brand tokens only, WCAG 2.1 AA, opaque status
   surfaces, correct text-contrast tokens).
4. **Given** a chart whose underlying read is partial (one chain of several unreachable),
   **When** it renders, **Then** the visualization is labelled partial and names what is missing.

---

### User Story 4 - Admin destinations become addressable (Priority: P2)

Today the operations area is one address with no way to link to a specific view (the active tab is
transient screen state), so runbooks say "open Admin, then find the Fees tab". With this feature,
each admin app — and each view inside it — has its own address. An operator following a runbook
link lands directly in the right app view; the old operations address keeps working and lands on
the Control Room.

**Why this priority**: Direct addressability is what makes granular delegation practical (runbooks
and incident docs can point at the exact control), but it only matters once the apps exist.

**Independent Test**: Follow the legacy operations address and verify it lands on the Control
Room; follow each admin app's address and view addresses as an entitled operator and verify each
lands on the right screen; follow one as a non-entitled account and verify the standard denied
experience.

**Acceptance Scenarios**:

1. **Given** the legacy operations address, **When** an entitled operator follows it, **Then**
   they land on the Control Room.
2. **Given** an admin app view's address, **When** an entitled operator follows it, **Then** they
   land on that view directly; **When** a non-entitled account follows it, **Then** they get the
   standard denied experience with no admin data fetched.

---

### Edge Cases

- Operator's role is revoked while an admin app is open: the app continues to render, but writes
  fail at the contract as they do today; on next entry to the Control Room the app tile is gone.
- Authority reads that cannot be confirmed (registry or contract unreachable): gate the way the
  panel gates today — an unconfirmed authority read must not hide an emergency control that the
  contract would accept, and must not present a control as usable when the definite answer is "not
  held" (existing per-surface conventions are preserved, not redesigned).
- An account whose only "authority" is the permissionless maintenance surface: the Control Room
  must not read as an admin console — maintenance keeps its current any-operator reachability
  without implying elevated status.
- Two operators with different role sets share a device/browser profile: visibility is derived per
  connected account at render time, never cached across accounts.
- A chart's history source is unavailable while live state is readable: dashboard renders live
  state and marks history as unavailable, rather than dropping the whole dashboard.
- Legacy deep link followed by a non-entitled account: same denied experience as navigating to the
  operations area directly — the redirect must not leak the existence or contents of the view.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each group of admin controls in the current monolithic panel MUST be presented as a
  separately launchable admin mini-app with its own name, tile artwork, entry route, and
  role-derived access gate. The grouping MUST cover every existing view; no view may be dropped or
  left only in the monolithic panel.
- **FR-002**: The operations area MUST present a Control Room launcher listing exactly the admin
  apps the connected account's roles unlock, with each app's headline status visible at a glance
  (e.g. paused/live, pending review count). An account with none of the relevant roles gets the
  current access-denied experience.
- **FR-003**: App visibility and launchability MUST derive from the same authority sources the
  panel uses today (on-chain roles, per-contract authority reads); this feature MUST NOT introduce
  a new authorization store, and UI gating MUST NOT be treated as a security boundary — contracts
  remain the enforcement layer.
- **FR-004** *(amended by the store-surfacing follow-up, 2026-08-17)*: Admin mini-apps are
  host-bundled, first-party surfaces. They MUST NOT be published to the public mini-app registry
  or IPFS, and MUST NOT be discoverable by accounts without a qualifying role. They MAY appear in
  the member-facing Apps catalog **only** for entitled operators, as a clearly separated
  first-party section that never claims registry provenance (never under the on-chain-verified
  badge). The original blanket "not in the catalog" wording protected against public exposure and
  provenance confusion; the amendment preserves both protections while making the tools
  discoverable where operators already look for apps.
- **FR-013** *(follow-up)*: Entitled operators MUST be able to find their admin apps in the Apps
  store (listed, searchable) with the same role derivation the launcher uses — the store never
  offers a tool the Control Room would not — and the section's availability MUST NOT depend on
  the on-chain registry being reachable.
- **FR-014** *(follow-up)*: Operators MUST be able to pin admin apps to the same Quick Access
  shortcuts members pin registry apps to, within the existing bounded-height rules (one capped
  strip). A pin is a device-scoped shortcut; if the underlying role is later revoked the
  destination's access gate remains the authority (the shortcut may remain, the tool refuses
  honestly).
- **FR-005**: Every control, read, and disclosure present in the monolithic panel MUST exist in
  exactly one admin app with unchanged role gating, chain scoping, and write semantics (one
  transaction, one named chain, authority read from the enforcing contract).
- **FR-006**: Each admin app MUST open on a dashboard view with summary figures and at least one
  domain-appropriate chart or visualization sourced from real observed data. Charts MUST render
  explicit empty, partial, and unreadable states (a failed read is never a zero; a partial total
  is labelled and names what is missing).
- **FR-007**: All admin app screens MUST follow the platform brand guidelines and style system
  (design tokens only, brand typography, opaque status surfaces, correct contrast tokens) and MUST
  meet WCAG 2.1 AA, passing the existing automated brand and accessibility gates.
- **FR-008**: Each admin app and each view inside it MUST have a stable, shareable address; the
  legacy operations address MUST continue to resolve (landing on the Control Room). Following an
  admin address without a qualifying role MUST yield the standard denied experience with no admin
  data fetched.
- **FR-009**: Member-facing navigation (drawer, drawer search, Apps catalog) MUST be unchanged
  for accounts without qualifying roles; the operations entry point for entitled operators remains
  where it is today.
- **FR-010**: The permissionless maintenance surface MUST remain reachable by any operator without
  implying elevated status.
- **FR-011**: The Control Room MUST replace the monolithic panel as the operations entry point in
  the same release; the transition MUST NOT ship two parallel long-lived admin consoles.
- **FR-012**: Role/authority states that cannot be confirmed MUST gate exactly as the current
  panel gates them (per-surface conventions preserved: an unconfirmed guardian read leaves the
  pause control offered; an unread curator registry gates as "not a curator" for navigation while
  the app itself discloses which it is).

### Key Entities

- **Admin mini-app**: A launchable operations app corresponding to one group of admin controls.
  Attributes: identity (name, slug, tile artwork), entry route, the set of qualifying roles, the
  set of contained views, headline status source.
- **Control Room**: The launcher surface; derives its tile list per connected account from
  qualifying-role checks; shows per-app headline status.
- **Admin view**: An individual control surface (today a tab) contained by exactly one admin app;
  retains its role gate and chain scope.
- **Qualifying role**: An on-chain role or per-contract authority that unlocks an admin app;
  unchanged by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator holding a single admin-adjacent role sees only the admin app(s) that
  role unlocks — verified for every role in the current gating matrix.
- **SC-002**: 100% of controls enumerated from the current panel are reachable and functional in
  the new apps (parity audit checklist, per view), with zero role-gate regressions.
- **SC-003**: Every admin app dashboard renders at least one real-data visualization, and all
  admin screens pass the automated brand-token and accessibility gates on first CI run after
  merge.
- **SC-004**: 100% of documented legacy admin deep links resolve to the correct new view.
- **SC-005**: An operator can reach any entitled control in no more interactions than the current
  panel requires (launcher → app → control ≤ current group → tab → control).
- **SC-006**: No new authorization data store exists after the change; authority derivation points
  at the same sources as before (audited in review).

## Assumptions

- **Host-bundled packaging** (confirmed with product owner): admin apps ride the mini-app
  presentation chrome but stay compiled into the shipped application; the public registry, IPFS
  pipeline, and curation lifecycle are not involved. The registry's own curation surface
  (mini-app review) remains one of the admin views being re-presented.
- **Replace, not parallel** (confirmed with product owner): the monolithic panel becomes the
  Control Room launcher in this release; no long-lived legacy console remains.
- **Grouping follows the current rail groups** (Incident Response; Compliance; Membership &
  Revenue; Liquidity; Protocol Config; Identity; Access Control; Infrastructure), with the
  Control Room overview absorbing the current Overview tab. Final naming may be adjusted during
  design, but the covering constraint (FR-001) holds regardless.
- **No contract changes**: all authority, roles, and write paths are unchanged on-chain; this is a
  frontend re-presentation with charts sourced from existing reads/events and existing gateway
  surfaces.
- **Charts use existing data**: visualizations draw from already-available sources (on-chain
  events, estate reads, gateway endpoints). No new indexing infrastructure is in scope.
- **Member-facing surfaces unchanged**: the Apps catalog, nav drawer resting height, and member
  navigation are unchanged except for admin-entitled operators' search results and admin entry
  point.
