# Feature Specification: Distributed Mini-App Platform (Apps Section Redesign)

**Feature Branch**: `claude/miniapp-platform-redesign-3o6769` (feature id `073-miniapp-platform`)

**Created**: 2026-08-01

**Status**: Draft

**Input**: User description: "Redesign the 'Apps' section into a distributed miniapp platform: a curated, single-chain (permissioned/subnet) PWA host with dynamically imported mini-apps for financial operations. Users connect a custody wallet, browse an internally approved catalog, and launch mini-apps fetched from a private content-addressed gateway, mounted inside the host PWA. Existing in-app applications (wager, tokenmint, clearpath) are converted into mini-apps, governed by an on-chain registry with a compliance approval lifecycle."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse the Catalog and Launch an Approved Mini-App (Priority: P1)

An operations professional opens the platform's Apps section, sees a curated catalog containing only compliance-approved mini-apps, searches or filters by operational category, and launches one. The host verifies the app is still Approved, resolves its current package identifier and manifest hash from the on-chain registry, fetches the package from the private gateway, verifies its integrity against the on-chain hash, and mounts the mini-app inside the workspace. The mini-app receives only the controlled host context (wallet access, its own namespaced shared state, audit logging, notifications, navigation) and the professional performs on-chain operations through it.

**Why this priority**: This is the core value loop — curated discovery plus integrity-verified execution. Without it there is no platform; every other story feeds or governs this flow.

**Independent Test**: Seed the registry with one Approved app whose package is hosted on the gateway; browse, search, launch, and confirm the app mounts and can submit a transaction through the host-provided wallet. Tamper the package to confirm the hash-mismatch launch refusal.

**Acceptance Scenarios**:

1. **Given** a registry containing Approved, Pending, and Suspended apps, **When** an operations professional opens the catalog, **Then** only Approved apps are listed, each showing name, vendor, version, and operational category.
2. **Given** an Approved app in the catalog, **When** the user launches it, **Then** the host re-checks Approved status, fetches the package for the registry's current content identifier, verifies the manifest hash against the on-chain value, and mounts the app in the workspace.
3. **Given** a fetched package whose computed hash does not match the on-chain manifest hash, **When** launch is attempted, **Then** the host refuses to execute any of the package's code and shows a clear integrity-failure message.
4. **Given** an app whose status changed to Suspended after it appeared in a user's catalog view, **When** the user attempts to launch it, **Then** the launch is refused with a professional explanation and the catalog entry updates.
5. **Given** a mounted mini-app, **When** it requests a transaction, **Then** the request flows through the host-supplied wallet interface (never a direct key), and a timestamped audit entry is recorded automatically.
6. **Given** the catalog with more than one category of apps, **When** the user filters by an operational category or types a search term, **Then** the list narrows to matching Approved apps only.

---

### User Story 2 - First-Party Apps Become Mini-Apps (Priority: P1)

The applications that live in today's Apps section — Wagers, Token Mint, and ClearPath — are repackaged as mini-apps and delivered through the same registry → gateway → verify → mount pipeline as any third-party submission. The redesigned Apps section (catalog + workspace) replaces the current hardcoded Apps navigation group, and each converted app keeps its existing capabilities.

**Why this priority**: The redesign is only real if the platform eats its own products first. The converted apps are the launch content of the catalog, prove the runtime contract is sufficient for real workloads, and de-risk the migration story for users who rely on these surfaces today.

**Independent Test**: With the platform live, launch each converted app from the catalog and complete one representative existing workflow in each (e.g. view/create a wager, mint a token, review a governance proposal); confirm no capability regressions and that deep links to the old sections continue to resolve.

**Acceptance Scenarios**:

1. **Given** the redesigned Apps section, **When** a user who previously used ClearPath, Token Mint, or Wagers opens the catalog, **Then** each appears as an Approved mini-app and launches into a workspace with its existing functionality intact.
2. **Given** a saved deep link to a legacy app tab (e.g. the old ClearPath or Token Mint route), **When** it is opened, **Then** the user lands on the corresponding mini-app (or its catalog entry) rather than a dead page.
3. **Given** a converted mini-app, **When** it runs, **Then** it uses only the host-provided context (no privileged internal imports unavailable to third-party apps) for wallet access, shared state, and notifications.

---

### User Story 3 - Developer Submits an App or Version Update (Priority: P2)

An internal or vendor developer submits a mini-app for listing: name, description, operational category, package content identifier, manifest hash, version, and vendor address. The submission creates a Pending record on-chain and emits an event for compliance review. Any later update to the package identifier or metadata immediately resets the app to Pending until re-approved. The developer can view the current status of their submissions.

**Why this priority**: Submission is how catalog content grows and how versions ship, but the platform can launch with pre-seeded first-party apps before self-serve submission is polished.

**Independent Test**: Submit a new app from a developer account, confirm a Pending on-chain record and emitted event; submit a version update to an Approved app and confirm the status resets to Pending and the previously approved version remains the one served until re-approval.

**Acceptance Scenarios**:

1. **Given** a developer with a connected wallet, **When** they submit a complete app record, **Then** a Pending registry entry is created on-chain with their address as vendor and an event is emitted for reviewers.
2. **Given** an Approved app, **When** its developer submits a new version (new content identifier + manifest hash), **Then** the app's status becomes Pending and the catalog continues serving the last Approved version until the new one is approved.
3. **Given** an app record, **When** anyone other than its vendor (or an authorized platform role) attempts to modify it, **Then** the change is rejected.
4. **Given** a developer's submissions, **When** the developer views their status, **Then** each shows its lifecycle state (Pending, Approved, Suspended, Deprecated) and current version.

---

### User Story 4 - Compliance Review and Lifecycle Control (Priority: P2)

A compliance / IT security reviewer opens the review panel, sees the queue of Pending submissions with their metadata and package details, and approves, suspends, or deprecates apps. Lifecycle actions are on-chain transactions gated to the curator role (held by a multisig), so the registry — not any off-chain system — is the trust boundary for what operations staff may run.

**Why this priority**: Curation is the platform's core security promise, but the review surface can initially be exercised by platform operators via seeded approvals while the developer-facing flow (Story 3) matures.

**Independent Test**: With Pending submissions present, act as the curator role to approve one, suspend one, and deprecate one; verify catalog visibility and launchability change accordingly and that a non-curator cannot perform any lifecycle action.

**Acceptance Scenarios**:

1. **Given** Pending submissions exist, **When** a curator opens the review panel, **Then** they see each Pending app's metadata, vendor, version, package identifier, and manifest hash.
2. **Given** a Pending app, **When** the curator approves it, **Then** its status becomes Approved on-chain with an approval timestamp and it appears in the catalog.
3. **Given** an Approved app, **When** the curator suspends it, **Then** it disappears from the catalog and any launch attempt is refused; **When** the curator deprecates it, **Then** it is permanently retired from the catalog with an explanatory state for users who had used it.
4. **Given** an account without the curator role, **When** it attempts any approve/suspend/deprecate action, **Then** the transaction reverts and the panel never offered the control as available.

---

### User Story 5 - Namespaced Shared State and Automatic Audit Trail (Priority: P3)

Mini-apps read and write shared state only through a host store namespaced by app identifier, so no app can read or clobber another app's data. The host automatically records timestamped audit entries for every transaction request and significant state change, attributed to the app and account involved, available for compliance reporting.

**Why this priority**: Hardens the runtime for multi-app coexistence and compliance reporting; the P1 launch loop already embeds the basic wallet-mediation and logging hooks this story completes.

**Independent Test**: Run two mini-apps in the workspace, have each write to the same logical key, and confirm isolation; perform a transaction and a state change and confirm both produce attributable, timestamped audit entries retrievable from the reporting surface.

**Acceptance Scenarios**:

1. **Given** two mounted mini-apps writing to identically named keys, **When** each reads its value back, **Then** each sees only its own data (zero collisions).
2. **Given** a mini-app attempting to access another app's namespace or a host-internal store directly, **When** the access occurs, **Then** it is denied by the store interface.
3. **Given** any transaction request or significant shared-state change, **When** it occurs, **Then** an audit entry with timestamp, app identifier, account, and action summary is recorded without the mini-app having to opt in.
4. **Given** the audit trail, **When** a compliance user reviews activity, **Then** entries are filterable by app, account, and time range.

---

### User Story 6 - Installable, Cache-Aware Host (Priority: P3)

The host is installable as a progressive web app on enterprise desktops. It precaches its own shell and the packages of previously launched approved apps so subsequent launches are near-instant, and it detects new host versions and prompts the user to refresh. Cached packages remain integrity-bound: a cached package is only served while its hash still matches the registry.

**Why this priority**: Performance and installability polish; valuable for daily operators but not required to prove the platform.

**Independent Test**: Install the host, launch an app, go offline (or degrade the gateway), relaunch the same app version and confirm a fast cache-served start; publish a new approved version and confirm the cache is bypassed for the new content identifier.

**Acceptance Scenarios**:

1. **Given** a supported desktop browser, **When** the user installs the host, **Then** it runs as an installed app and retains its session behavior.
2. **Given** an app launched previously on this device, **When** it is launched again with an unchanged registry record, **Then** it starts from cache near-instantly while status is still re-verified.
3. **Given** the registry now points at a new content identifier for an app, **When** the user launches it, **Then** the old cached package is not used for the new version.
4. **Given** a new host release, **When** the user has the old version open, **Then** they are prompted to refresh rather than silently mixing versions.

---

### Edge Cases

- Registry (chain) unreachable at catalog load: the catalog states it cannot verify listings and refuses launches rather than serving from stale data as if verified; previously cached, previously verified packages may be offered only with explicit "verification unavailable" disclosure — never silently.
- Primary gateway unreachable: host fails over to a configured fallback gateway; if all gateways fail, the user sees a clear network/availability message (relevant behind corporate firewalls/VPNs).
- Hash mismatch on fetch (supply-chain tampering or gateway corruption): package is discarded, nothing executes, the event is audit-logged, and the user sees an integrity error.
- App suspended or deprecated while a user has it mounted: current session handling must be defined — the host notifies the user and blocks new transaction requests from that app.
- Version update lands (status resets to Pending) while users are mid-session on the previously approved version: existing sessions continue on the still-Approved prior version.
- A mini-app throws during load or render: the failure is contained to its workspace slot with a professional error state; the host and other mounted apps are unaffected.
- A mini-app is unmounted/remounted (workspace navigation): the app restores from its namespaced state without data loss or duplicate side effects.
- Wallet connected to the wrong network: host blocks mini-app transaction paths and directs the user to the required network.
- A submission references an unfetchable content identifier: reviewers can see fetch/verification failure before approving; approval of an unverifiable package is prevented or explicitly warned.
- Duplicate submission of an existing name/identifier: the registry rejects duplicate app identifiers; display-name collisions are surfaced to reviewers.
- Storage quota exhaustion for cached packages: cache evicts least-recently-used packages without affecting correctness (registry remains the source of truth).

## Requirements *(mandatory)*

### Functional Requirements

**Registry & Lifecycle**

- **FR-001**: The system MUST maintain an on-chain registry as the single source of truth for each mini-app's identity, vendor address, name, description, operational category, current package content identifier, manifest hash, version, lifecycle status, and submission/approval timestamps.
- **FR-002**: The registry MUST support the lifecycle states Pending, Approved, Suspended, and Deprecated, with transitions restricted to: submission → Pending; curator approval → Approved; curator suspension → Suspended (reversible to Approved); curator deprecation → Deprecated (terminal).
- **FR-003**: Any change to an app's package content identifier, manifest hash, or reviewed metadata MUST immediately reset its status to Pending; the previously Approved version remains the served version until the new one is approved.
- **FR-004**: Lifecycle actions (approve, suspend, deprecate) MUST be restricted on-chain to a curator role held by a multisig or governance account; vendor-of-record is the only non-platform account able to update its own app's submission fields.
- **FR-005**: Every registry mutation MUST emit an event sufficient for off-chain indexing and reviewer notification.
- **FR-006**: The registry MUST reject duplicate app identifiers and record the submitting vendor address immutably per app.

**Catalog & Discovery**

- **FR-007**: The catalog MUST list only Approved apps, showing at minimum name, vendor, version, and operational category on each entry.
- **FR-008**: The catalog MUST support text search and filtering by the operational categories: Trade Settlement, Reconciliation, Treasury & Liquidity, Identity & Compliance, Asset Servicing, and Reporting & Audit.
- **FR-009**: The redesigned Apps section (catalog + workspace) MUST replace the current hardcoded Apps navigation group; existing deep links to the replaced app tabs MUST continue to resolve to the corresponding mini-app or its catalog entry.

**Launch Integrity & Runtime**

- **FR-010**: On every launch request the host MUST re-verify Approved status from the registry (or a registry-derived index whose staleness is bounded and disclosed) before any package code executes.
- **FR-011**: The host MUST fetch packages only by the registry's current content identifier from configured private gateway(s), and MUST verify the package's manifest hash against the on-chain value before executing any of its code; on mismatch, nothing from the package executes and the failure is logged and shown to the user.
- **FR-012**: The host MUST provide gateway failover: if the primary gateway is unreachable, configured fallbacks are tried before surfacing an availability error.
- **FR-013**: Mounted mini-apps MUST receive only a controlled host context — wallet/transaction interface, their own namespaced shared store, audit logging, notification (toast) surface, and workspace navigation — and MUST NOT receive raw key material, unscoped storage access, or host-internal privileged interfaces.
- **FR-014**: Mini-app styling MUST be scoped such that it cannot alter host or sibling-app presentation.
- **FR-015**: A mini-app failure (load, render, or runtime error) MUST be contained to that app's workspace surface without breaking the host or other mounted apps.
- **FR-016**: Mini-apps MUST tolerate unmount/remount within a session, restoring from their namespaced state.
- **FR-017**: Each mini-app package MUST include a manifest declaring identity, entry point, version, declared permissions, and shared-state keys; the host MUST honor the manifest as the app's runtime contract.

**Shared State & Audit**

- **FR-018**: The host MUST namespace all mini-app shared state by app identifier; cross-namespace reads/writes MUST be impossible through the provided interface.
- **FR-019**: The host MUST automatically record timestamped, attributable audit entries for every mini-app transaction request and significant shared-state change, without requiring mini-app cooperation, and MUST also expose an audit API for app-specific contextual entries.
- **FR-020**: Audit entries MUST be reviewable by compliance users, filterable by app, account, and time range, and MUST never contain secrets or key material.

**Submission & Review**

- **FR-021**: Developers MUST be able to submit new apps and version updates (name, description, category, content identifier, manifest hash, version, vendor address) from the platform, producing Pending on-chain records.
- **FR-022**: Reviewers MUST have a panel showing the Pending queue with full submission detail, including a package fetch/hash verification result, and MUST be able to execute approve/suspend/deprecate as on-chain transactions; controls are offered only to accounts holding the curator role.
- **FR-023**: Developers MUST be able to view the lifecycle status and current version of their own submissions.

**Wallet, Network & Session**

- **FR-024**: Users MUST connect through the platform's supported wallet/custody options; mini-app transaction paths MUST be blocked with clear direction when the wallet is absent or on the wrong network.
- **FR-025**: The platform MUST operate the registry and mini-app catalog against a single designated chain per environment cohort; the host MUST enforce that mini-app registry reads and lifecycle writes target that chain.
- **FR-026**: Wallet sessions MUST persist across reloads of the installed or browser-based host per the platform's existing session behavior.

**PWA & Caching**

- **FR-027**: The host MUST be installable as a progressive web app and MUST precache its shell.
- **FR-028**: Previously launched approved packages MUST be cached content-addressed, served on relaunch only while the registry still references the same content identifier and hash, with least-recently-used eviction under storage pressure.
- **FR-029**: The host MUST detect a newer host release and prompt the user to refresh.

**Migration**

- **FR-030**: Wagers, Token Mint, and ClearPath MUST be delivered as mini-apps through the standard registry/gateway/verification pipeline, using only the documented host context, with no loss of existing user-facing capability.

### Key Entities

- **Mini-App Record**: The on-chain unit of governance — identity, vendor address, name, description, operational category, current content identifier, manifest hash, version, lifecycle status, submission/approval timestamps.
- **Mini-App Package**: The content-addressed deliverable — manifest plus entry module and scoped assets; immutable per content identifier.
- **Manifest**: The package's self-description and runtime contract — identity, entry point, version, declared permissions, shared-state keys; its hash is the on-chain integrity anchor.
- **Catalog Entry**: The user-facing projection of an Approved record — display fields, category, launch affordance.
- **Workspace Session**: A user's set of mounted mini-apps and their navigation state.
- **Namespaced Store**: Per-app-identifier shared-state partition provided by the host.
- **Audit Entry**: Timestamped, attributable record of a transaction request, state change, integrity failure, or lifecycle event.
- **Roles**: Operations Professional (browse/launch/use), Developer/Vendor (submit, update, view status), Curator (approve/suspend/deprecate via multisig), Platform Administrator (registry upgrade and infrastructure configuration).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The catalog renders its Approved listings within 2 seconds on a standard enterprise connection.
- **SC-002**: Launching a previously cached, unchanged app version reaches interactive in under 1 second; a first launch completes within 5 seconds on a standard connection.
- **SC-003**: Zero instances of package code executing without a current Approved status and a matching on-chain hash — including under tampered-package, suspended-app, and stale-cache test conditions.
- **SC-004**: Zero cross-app shared-state collisions in concurrent multi-app testing.
- **SC-005**: 100% of mini-app transaction requests produce a timestamped, attributable audit entry.
- **SC-006**: All three first-party apps (Wagers, Token Mint, ClearPath) complete their representative existing workflows as mini-apps with no capability regressions, and legacy deep links resolve.
- **SC-007**: A developer can complete a submission in under 5 minutes, and a curator can complete a review action in under 2 minutes from opening the queue; median submission-to-decision time is measurable from on-chain timestamps.
- **SC-008**: With the primary gateway down and a fallback configured, app launches succeed; with all gateways down, 100% of failures present a clear availability message rather than a blank or broken surface.

## Assumptions

- **Host = existing platform frontend.** The mini-app platform is a redesign of the current Apps section inside the existing (tenant-aware) frontend — not a separate application. Tenant feature gating continues to apply to whether the Apps section is present.
- **Single-chain means one designated registry chain per environment cohort** (mirroring how membership resolves to one reference chain per cohort), not a new bespoke network requirement. The permissioned/subnet deployment target is a deployment-time configuration, and the platform must also function on the project's existing test networks for development.
- **"Custody wallet" connection reuses the platform's existing wallet options** (including passkey accounts and Safe-based custody); no new custody-provider integrations (e.g. proprietary custodian APIs) are in scope for v1.
- **Compliance review gating is on-chain role-based**: the curator multisig is the enforcement boundary. Enterprise SSO in front of the review panel is treated as deployment-level access infrastructure (an assumption to validate), not a v1 application feature; the panel itself never offers lifecycle controls to accounts without the on-chain role.
- **The private content-addressed gateway is provided infrastructure** (an allowlisted, firewall-friendly endpoint plus optional fallback); provisioning it is operations work, and the application degrades honestly when it is not configured or unreachable.
- **An off-chain indexer is an optimization, not a dependency**: the catalog may use an index for speed but launch-time verification always derives from the registry, and the platform must function (more slowly) with direct registry reads only.
- **First-party app conversion preserves current behavior** but may re-scope each app's surface to what fits the mini-app runtime contract; any intentional capability change would be its own spec.
- **Iframe/zero-trust sandboxing, permissionless listing, retail wallet support, multi-chain catalogs, and cross-app messaging are explicitly out of scope for v1** (curation is the trust boundary).
- **Audit entries are recorded client-side into the platform's existing reporting/ledger seam**; a centralized enterprise audit warehouse is out of scope for v1.
