# Feature Specification: Mini-App Store UX Redesign

**Feature Branch**: `077-miniapp-store-redesign`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "Mini-app store UX redesign (issue #1024): a complete visual and
structural overhaul of the Apps catalog surface to a fun, modern, high-trust mini app store
aesthetic. Per-app illustrative icons, prominent on-chain-verified trust badge, distinct category
headers, stylized search/filter/refresh controls, vendor+version technical data in a contained box,
Launch call-to-action with rocket icon, bottom navigation (Market, My Apps, Search, Profile), and
restructured security explanation into prioritized readable blocks. Scope also includes resolving
the mini-app output byte gate items raised on the issue: absorbing the vite 7→8 build-preset bump
(from closed Dependabot PR #1061) with the required package version bumps, baseline re-record, and
re-publish/re-approve release steps."

## Context

The current Apps catalog (spec 073) is functionally honest but visually sterile: uniform
text-heavy cards, dense security prose, and minimal navigation. Issue #1024 reports low trust
(members can't quickly see that apps are verified), poor scannability (no visual identity per
app), information overload (the security explanation is one dense block), and limited
interaction (excessive scrolling, no quick section switching). Concept art supplied with the
issue shows the target aesthetic: a "fun modern mini app store" with a rainbow verified badge,
per-app illustrated icons, category banner headers, a clover-motif search bar, a boxed
vendor/version data strip, a rocket-icon Launch button, and a bottom navigation bar.

A scoping comment on the issue also defines when the mini-app **output byte gate** binds this
work: the store surface is host code and moves no committed package bytes, but the closed
Dependabot PR #1061 (vite 7→8, feeding the mini-app build preset) was deliberately deferred to
this effort so the byte change is absorbed in a release that knowingly re-records the baseline
and plans the re-publish/re-approve of the affected packages.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trustworthy, scannable app market (Priority: P1)

As a store member browsing the Apps section, I want each app presented as a visually distinct,
verified-looking card — unique illustrative icon, clear name, category grouping, contained
technical data (vendor, version), and an inviting Launch action — under a prominent
"on-chain verified" trust banner, so I can find and trust the right app at a glance instead of
reading dense text.

**Why this priority**: This is the core of issue #1024 — trust and scannability failures are
the reported pain points, and every other story builds on the redesigned card/market layout.

**Independent Test**: Load the Apps catalog against a reachable registry holding approved apps
and verify each card shows an app-specific illustration (or an honest generic fallback), the
verified-market banner is present, apps group under styled category headers, vendor/version sit
in a contained data box, and Launch carries the rocket icon.

**Acceptance Scenarios**:

1. **Given** a list of approved apps, **When** a member views an app listing, **Then** it
   displays a unique illustrative icon that visually represents its core function, and an app
   with no curated artwork shows a deliberate generic app illustration (never a broken image).
2. **Given** a verified catalog read, **When** a member views the store header, **Then** a
   prominent stylized "on-chain verified" badge/banner is visible with a one-line trust summary.
3. **Given** a set of apps, **When** a member views the store, **Then** apps are grouped under
   clear, visually distinct category headers (e.g. "Asset Servicing").
4. **Given** an app card, **When** a member reads it, **Then** vendor and version are visually
   separated in a contained, styled data box distinct from the description text.
5. **Given** an app card for a launchable app, **When** the member looks for the call to action,
   **Then** the Launch button includes a rocket icon and remains a clearly labelled action.
6. **Given** the security explanation, **When** a member reads the store intro, **Then** the
   verification story is split into short, prioritized blocks with supporting iconography rather
   than one dense paragraph.

---

### User Story 2 - Quick section navigation (Priority: P2)

As a store member, I want a persistent store navigation (Market, My Apps, Search) inside the
Apps section, so I can jump between browsing the catalog, my favorited/quick-access apps, and
searching without scrolling or leaving the section.

**Why this priority**: Navigation friction is a reported pain point but the store remains
usable without it; it layers on top of the P1 market view.

**Independent Test**: From the Apps catalog, switch to "My Apps" and see only favorited apps;
switch to "Search" and get a focused search experience; switch back to "Market" and see the
full grouped catalog. State (favorites, filters) survives switching.

**Acceptance Scenarios**:

1. **Given** the Apps section on a small viewport, **When** a member views the store, **Then**
   a persistent store navigation bar is available with Market, My Apps, and Search entries,
   without duplicating or breaking the host app's own global navigation.
2. **Given** favorited apps, **When** the member opens My Apps, **Then** only their favorited
   apps are listed, with the same card treatment and launch rules as the market view, and an
   honest empty state when nothing is favorited.
3. **Given** the Search entry, **When** selected, **Then** the member lands in a search-focused
   view of the catalog with the existing category filters available.
4. **Given** any store sub-view, **When** the registry is unreachable or absent, **Then** the
   existing honest-state disclosures (unverified snapshot, refusal to launch, deployment gap)
   are preserved unchanged in meaning.

---

### User Story 3 - Byte-gate resolution: absorb the vite build-preset bump (Priority: P2)

As a maintainer, I want the deferred vite 7→8 mini-app build toolchain bump absorbed by this
redesign release — with the mini-app output byte change acknowledged deliberately (package
version bumps, baseline re-record, and documented re-publish/re-approve steps) — so the byte
gate stops binding future unrelated work and the on-chain release record stays true.

**Why this priority**: This is the "byte code issue raised" on #1024. It is independent of the
visual redesign (host code moves no package bytes) but was explicitly scoped to this effort so
the byte change ships inside a knowing release rather than surprising a dependency sweep.

**Independent Test**: Build the mini-app packages with the bumped toolchain, run the byte-gate
compare, and verify (a) the gate detects the byte change against the old baseline, (b) the
re-recorded baseline matches the new builds reproducibly, (c) each changed package's version is
bumped in the same change, and (d) the release/runbook documents the required re-publish to
IPFS and on-chain re-approval before the new bytes are treated as live.

**Acceptance Scenarios**:

1. **Given** the mini-app build preset on vite 8, **When** packages are rebuilt, **Then** the
   byte-gate compare against the previous baseline reports the moved bytes (never a silent or
   false pass), and the new baseline is recorded in the same change.
2. **Given** moved package bytes, **When** the change lands, **Then** each affected package's
   independent version is bumped by hand in the same change (per the release-versioning rules),
   and the change documents that the on-chain records still commit to the previous bytes until
   re-publish and re-approve happen.
3. **Given** the host frontend build, **When** the toolchain bump lands, **Then** the frontend
   and mini-app builds and their test suites still pass.

---

### Edge Cases

- Registry unreachable with a stale snapshot: the redesigned cards must keep the "reference
  only, nothing launchable" treatment — no launch affordance, no verified badge on the stale list.
- Registry answered but empty, or not deployed on this build: the redesigned surface keeps the
  existing distinct honest states (empty ≠ unreachable ≠ not deployed).
- An app whose registered name yields no usable slug: card renders with icon and refusal note,
  never a dead Launch link; the fallback illustration applies.
- A future approved app the host has no curated artwork for: generic illustration, not a broken
  or missing image, and never a fabricated category illustration implying curation.
- Unknown category ordinal ahead of the build's label map: still gets a styled group header
  under its raw ordinal label.
- Theme: all new visuals must render correctly in both light and dark themes and for tenant
  theme classes (no hardcoded tenant identity in the store surface).
- Byte gate: a failed mini-app build must never let the compare report "bytes unchanged"
  (the `--since` stamp discipline is preserved).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each app card MUST display an illustrative icon unique to that app, resolved
  host-side by the app's identity (slug), with a deliberate generic illustration for apps
  without curated artwork. Artwork MUST NOT be sourced from or added to mini-app packages
  (no package byte moves for the redesign).
- **FR-002**: The store header MUST present a prominent, stylized "on-chain verified" trust
  badge and title, shown only when the listing is actually verified (never on a stale
  snapshot or unreachable state).
- **FR-003**: The security/verification explanation MUST be restructured into short,
  prioritized blocks with supporting iconography, preserving the existing factual claims
  (host re-reads the registry record, package checked against on-chain hash before code runs).
- **FR-004**: Apps MUST be grouped under visually distinct category headers, preserving the
  existing on-chain enum ordering and the unknown-ordinal fallback grouping.
- **FR-005**: Each app card MUST present vendor (shortened, full value preserved as
  tooltip/copy target) and version in a visually contained technical-data box, separate from
  the description.
- **FR-006**: The Launch call-to-action MUST carry a rocket icon while remaining an
  accessible, clearly labelled link; the existing launch-withholding rules (unverified
  listing, unusable slug) and their explanations are preserved.
- **FR-007**: The store MUST provide a persistent in-section navigation with at least Market
  (full catalog), My Apps (favorited apps), and Search entries; it MUST NOT replace, duplicate,
  or conflict with the host application's global navigation, and MUST respect small-viewport
  ergonomics (thumb-reachable on mobile).
- **FR-008**: The My Apps view MUST list the member's favorited apps with identical launch
  rules and card treatment, and an honest empty state.
- **FR-009**: Search, category filter, and refresh controls MUST be restyled to the new
  aesthetic while preserving existing behavior: keyboard operability, aria states, the polite
  result-count live region, filter-count disclosure, and non-focus-stealing refresh.
- **FR-010**: All existing honest-state renderings (loading, not-deployed, unreachable with
  and without stale snapshot, verified-empty, no-matches) MUST survive the redesign with
  their meanings and copy intent intact.
- **FR-011**: The redesign MUST meet WCAG 2.1 AA (contrast, focus visibility, screen-reader
  labels for all new iconography — decorative art marked decorative), and MUST render
  correctly in light/dark themes and under tenant theme classes without hardcoding tenant
  identity.
- **FR-012**: The redesigned surface MUST NOT change the registry client's trust semantics:
  `launchable` from the chain remains the serving decision; nothing re-derives status.
- **FR-013**: The mini-app build preset MUST be moved to vite 8 (absorbing the deferred
  Dependabot #1061 item for the mini-app build path), with the workspace's install-integrity
  rules followed for the dependency change.
- **FR-014**: The mini-app output byte baseline MUST be re-recorded in the same change that
  moves the bytes, using the stamped compare flow so a failed build cannot false-pass, and
  the change MUST show the gate detected the move (old baseline → diff → new baseline).
- **FR-015**: Each mini-app package whose output bytes move MUST have its independent version
  bumped by hand in the same change, and the release documentation MUST record that on-chain
  records commit to the previous bytes until the packages are re-published to IPFS and
  re-approved on-chain (content-committed approval), including the operational steps.
- **FR-016**: The host frontend build, mini-app package builds, and affected test suites MUST
  pass after the toolchain bump; any preset-hash-sensitive caching must reflect the new
  toolchain.

### Key Entities

- **App listing (AppView)**: On-chain registry record as normalized by the registry client —
  id, name, slug, description, category ordinal, vendor address, approved version,
  launchable flag. Redesign consumes it read-only.
- **Curated artwork map**: Host-side association from app slug to illustrative artwork and
  alt text, with a generic fallback entry. Never on-chain, never in packages.
- **Store sub-view**: Market | My Apps | Search — presentation state within the Apps section,
  bookmarkable without breaking existing routes/tabs.
- **Mini-app output baseline**: The recorded digest set for published package bytes
  (`baseline-miniapp-builds.json`), the byte gate's comparison anchor.
- **Package version + on-chain record**: Each mini-app's independent version and the
  registry's committed manifest hash/CID; they must agree or the release record is untrue.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can identify any app's purpose and verified standing within 5 seconds
  of the catalog rendering (icon + badge + category visible without reading body text).
- **SC-002**: A member can reach their favorited apps in one interaction from anywhere in the
  store (My Apps entry), versus scrolling the full list today.
- **SC-003**: 100% of existing honest-state scenarios (verified, stale, unreachable,
  not-deployed, empty, no-match) render with unchanged meaning — verified by the existing and
  extended test suites passing.
- **SC-004**: Accessibility checks (automated axe/CI audits) pass with no new violations on
  the redesigned surface.
- **SC-005**: The mini-app byte gate is green on the new baseline, every moved package has a
  bumped version, and the runbook contains an executable re-publish/re-approve procedure —
  and after this release, no deferred toolchain byte-move remains attributed to #1061.
- **SC-006**: All frontend and mini-app test suites pass in CI.

## Assumptions

- Per-app artwork is curated host-side (bundled with the host frontend), keyed by app slug,
  starting with the two live apps (Token Mint, ClearPath) plus one generic fallback; the
  concept art supplied on the issue guides style but exact assets may be original SVG
  illustrations drawn for this feature.
- The concept art's bottom navigation (Market, My Apps, Search, Profile) is adapted to the
  host: the Apps section lives inside the wallet app which already owns global navigation and
  profile. "Profile" is therefore satisfied by the existing account controls, and the store
  navigation ships as Market / My Apps / Search plus the existing "Submit an app" developer
  entry — not a second app-wide nav bar.
- "My Apps" is defined as the member's favorited (Quick Access) apps — the closest existing
  concept to "installed apps" in this platform; no new installation concept is introduced.
- The theme (day/night) toggle and profile iconography shown in the concept art's top bar
  belong to the host chrome, which already provides theme switching; restyling the host's
  global header is out of scope.
- Only the mini-app build path portion of closed Dependabot #1061 (vite and its preset
  dependencies) is in scope; the other dev-tooling bumps from that sweep are not.
- Re-publish to IPFS and on-chain re-approval are curator/release operations executed outside
  this change; this change delivers the moved bytes, versions, baseline, and the documented
  procedure — and is explicit that until those operations run, the chain still serves the
  previous approved packages.
- The registry ABI/host object are untouched: no new on-chain fields (e.g. icon URLs) are
  introduced.

## Iteration 2 — App-store experience (post-merge feedback, 2026-08-09)

Member feedback on the shipped surface: it reads as a demo, not a store. Reference supplied: a
Google Play "Top charts" screenshot — dense tappable rows, bold titles, chips, a fixed bottom
navigation, details behind a tap. This iteration supersedes parts of US1/US2 above:

### User Story 4 - Store rows and an app details sheet (Priority: P1)

As a store member, I want the catalog to read like a real app store — a compact list of
tappable rows (icon, bold title, metadata line, chips) — and tapping an app to open a bottom
sheet with its details and the actions (open it, add it to / remove it from My Apps), so
browsing and acting feel native instead of like a document.

**Acceptance Scenarios**:

1. **Given** a verified catalog, **When** the member views the market, **Then** apps render as
   list rows — leading icon, bold name, category/vendor metadata line, version chip, and an
   "in My Apps" indicator when favorited — with no always-visible explanation prose.
2. **Given** a row, **When** the member taps it, **Then** a bottom sheet opens with the app's
   artwork, name, description, vendor (full value available), version, category, and actions:
   **Open** (launch) and **Add to / Remove from My Apps**; the sheet is dismissible by close
   button, backdrop tap, and Escape, and focus returns to the row on close.
3. **Given** an unverified (stale) listing or an app with no usable slug, **When** its sheet is
   open, **Then** the launch-refusal explanation appears there and no Open action is offered —
   the honest-state rules are unchanged, only relocated.
4. **Given** the store header, **When** the member looks at it, **Then** the trust explanation
   paragraphs are gone (the verified badge remains, and deep detail lives in the docs), and
   Refresh is an icon-only control that keeps its accessible name and focus behavior.
5. **Given** a small viewport, **When** the member browses any store view, **Then** Market /
   My Apps / Search sit in a fixed, full-width bottom navigation (icon over label, active
   tint, safe-area padding) that never occludes the last row.

### Amended requirements

- **FR-003 (superseded)**: the restructured trust blocks are REMOVED from the store surface;
  the factual verification story lives in the developer docs. The verified badge (FR-002) and
  every honest-state disclosure (FR-010) are unchanged.
- **FR-006 (amended)**: the launch call-to-action moves into the app sheet as **Open** (rocket
  retained), accessible name "Open {app}"; rows themselves carry no launch link.
- **FR-007 (amended)**: the store navigation is a fixed bottom navigation bar, not a floating
  dock.
- **FR-017 (new)**: each catalog entry is a single tappable row control opening an app-details
  bottom sheet (`role="dialog"`, labelled by the app name, Escape/backdrop/close dismissal,
  focus restored to the invoking row). Favorite toggling moves from the row into the sheet;
  rows show a non-interactive favorited indicator.
- **FR-018 (new)**: the Refresh control is icon-only with an accessible name that continues to
  announce Refresh/Refreshing states without losing keyboard focus.
