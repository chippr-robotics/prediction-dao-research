# Feature Specification: Universal Asset Selector

**Feature Branch**: `claude/universal-asset-selector-ytlm7v`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "On the send, request, and wager views on the 'home' the asset dropdown currently only supports matic and usdc. We need to ensure the users are able of leveraging any asset supported by the platform for these activities. The nested asset logos from the earn page provide the best quick view for assets by chain and should be leveraged here. The trade view has the ability to list all assets, however it lacks the nested icon. Create a universal asset selector for these dropdowns ensuring proper wiring for non-EVM assets for functionality supported."

## Overview

The home surface (Pay, Request, Wager) and the trade view each present a way to
choose which asset an action uses. Today those choices are inconsistent and
narrow: the home Pay and Request views offer only the connected network's native
coin and its stablecoin; the home Wager view is hard-locked to USDC; and the
trade view can list many assets but shows only a plain symbol, with no visual cue
about which network each asset lives on. Meanwhile the platform already knows a
much larger set of holdings — a member's whole cross-network portfolio, including
non-EVM assets like Bitcoin — and the wallet Transfer form already lets a member
send any of them.

This feature introduces a **single, reusable universal asset selector** used by
Pay, Request, Wager, and the trade view. It lets a member pick **any
platform-supported asset the account actually holds**, across **every configured
network**, and presents each asset with the **nested asset logo** already used on
the Earn page — the asset's own glyph with a small network sub-badge — so it is
always obvious at a glance *what* the asset is and *which chain* it lives on. The
selector honestly reflects what each activity can support: assets an activity
cannot use (for example, a non-EVM asset in the EVM-only head-to-head Wager
escrow) are clearly excluded or disabled with an explanation, never silently
broken.

This is a frontend presentation and wiring feature. It reuses the existing send
engine, the existing portfolio data, and the existing asset-logo artwork. It
introduces no new on-chain behavior and no new contracts.

## Clarifications

### Session 2026-07-23

- Q: Should the selector list every asset the platform *knows about*, or only the
  assets the account *holds*? → A: Only assets the account **holds** (balance
  > 0), plus the connected network's native + stablecoin always present at zero so
  the forms stay usable before balances load — matching the wallet Transfer form's
  existing behavior. A held-only list keeps the picker honest and short.
- Q: When a chosen asset lives on a network other than the one the wallet is
  connected to, what happens? → A: The action is **gated behind a network
  switch** — the same pattern the Transfer form uses. The primary button becomes
  "Switch to {network}" until the wallet is on the asset's chain; no cross-chain
  magic is implied.
- Q: How are activity-incompatible assets presented (e.g. Bitcoin in Wager)? → A:
  **Excluded from that activity's list entirely** when the activity is
  categorically EVM-only (Wager, trade), rather than shown-but-disabled — an asset
  that can never work should not clutter the list. Assets that *could* work but
  aren't currently sendable (wrong chain) remain visible and switch-gated.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pay with any held asset (Priority: P1)

A member opens the home **Pay** view. The currency control under the amount is no
longer a two-item dropdown of native/stablecoin — it is the universal asset
selector. Opening it shows every asset the account holds across all configured
networks, each row displaying the nested asset logo (asset glyph + network
sub-badge), the asset symbol, its network name, and the held balance, with a
gasless marker where the asset's network supports it. The member picks, say, WBTC
on Polygon, keys an amount, chooses a recipient, and pays. The transfer runs
through the existing send engine exactly as a native/stablecoin send does today.

**Why this priority**: Pay is the default home mode and the most-used money
action. Extending it to the full portfolio is the core of the feature and is a
viable MVP on its own.

**Independent Test**: Load the home Pay view with an account holding several
assets on more than one network. Confirm the selector lists all held assets with
nested logos, pick a non-default asset on the connected chain, complete a
payment, and verify it settles through the same flow (confirmation, screening, fee
disclosure, gasless routing) as a stablecoin payment today.

**Acceptance Scenarios**:

1. **Given** a connected account holding native, stablecoin, and additional
   ERC-20 assets across networks, **When** the member opens the Pay currency
   selector, **Then** every held asset is listed, each with its nested asset logo
   (glyph + network sub-badge), symbol, network name, and balance.
2. **Given** the Pay selector is open, **When** the member selects an asset on the
   currently connected network, **Then** the amount hero, balance line, and
   gasless/fee disclosure update to that asset and the member can complete the
   payment through the existing send engine.
3. **Given** the member selects a held asset that lives on a *different* network
   than the wallet is connected to, **When** they attempt to pay, **Then** the
   primary action becomes "Switch to {network}" and only after switching does the
   payment proceed — no send is ever signed against the wrong chain.
4. **Given** an asset whose network is configured for gasless sends, **When** it is
   shown in the list and selected, **Then** a gasless marker is shown for that row
   and the fee disclosure says gasless; assets without that rail show "network fee
   applies" — matching the engine's per-asset quote.
5. **Given** the account holds a non-EVM asset (Bitcoin), **When** the member
   opens the Pay selector, **Then** Bitcoin appears with its nested logo and, when
   selected, Pay routes through the existing Bitcoin send path; the fee disclosure
   honestly states Bitcoin is never gasless.

---

### User Story 2 - Request any supported asset (Priority: P2)

A member opens the home **Request** view. The currency control is the same
universal asset selector, but because receiving does not require holding, Request
offers the **full catalog of platform-supported assets** across every configured
network — not just what the member currently holds — so they can ask to receive
anything. The member picks an asset (including one on a network other than the
connected one, or a non-EVM asset like Bitcoin), enters an amount and a note, and
generates a payment request. The request encodes the correct recipient, amount,
asset, and network so any compatible wallet can pay it. The default selection
remains USDC.

> **Follow-up refinement (post-merge):** Request lists the full supported-asset
> catalog (via `useSelectableAssets({ catalog: true })`), whereas the other
> surfaces (Pay/Wager/Transfer, which spend) stay held-only. Unheld catalog assets
> show a zero balance; held balances are preserved. The USDC default is unchanged.

**Why this priority**: Request is the second home money action and shares the same
selector; extending it makes the home surface consistent. It depends on the
selector from US1 but delivers independent value (asking for any asset, not just
native/stablecoin).

**Independent Test**: Open the Request view, select a non-stablecoin held asset,
generate the request, and confirm the resulting payment request/QR encodes that
asset and its network correctly and is scannable.

**Acceptance Scenarios**:

1. **Given** the Request view, **When** the member opens the asset selector,
   **Then** it shows the receivable assets with nested logos, symbol, and network,
   consistent with the Pay selector's presentation.
2. **Given** a selected asset, **When** the member enters an amount and presses
   Request, **Then** the generated payment request encodes that asset's identity
   (recipient, amount, asset/token, network) so a compatible wallet reads the
   correct asset and chain.
3. **Given** a non-EVM asset that the request format supports (Bitcoin), **When**
   the member generates a request for it, **Then** the request is produced in the
   appropriate form for that asset and the view discloses which account/network it
   will be paid to.
4. **Given** the member changes the selected asset or the acting account after a
   request is displayed, **When** the change occurs, **Then** the previously shown
   request is invalidated so a stale request can never point at the wrong
   asset/account.

---

### User Story 3 - Wager with any EVM-supported asset (Priority: P2)

A member opens the home **Wager** (create challenge) view. Instead of a hard-coded
USDC stake, the stake asset is chosen with the universal asset selector — scoped
to the assets that the head-to-head wager escrow can actually hold. Non-EVM
assets (Bitcoin) do not appear in the Wager selector because the escrow is
EVM-only; the view makes clear that wagers settle in supported on-chain assets.
The member picks a supported asset, sets the stake, and creates the challenge; the
stake, escrow, and payout all denominate in the chosen asset.

**Why this priority**: Wager is the third home mode and the feature's namesake
request ("send, request, and wager"). It shares the selector but carries the most
constraints (escrow compatibility), so it is scoped after the simpler Pay/Request
money actions.

**Independent Test**: Open the Wager create view, confirm the selector offers only
escrow-eligible assets (no Bitcoin), pick a non-USDC eligible asset, and verify
the created challenge denominates its stake and payout in that asset.

**Acceptance Scenarios**:

1. **Given** the Wager create view, **When** the member opens the stake asset
   selector, **Then** only assets the head-to-head escrow supports are listed —
   each with its nested logo — and categorically unsupported assets (non-EVM, e.g.
   Bitcoin) are excluded.
2. **Given** an escrow-eligible asset is selected, **When** the member sets a
   stake and creates the challenge, **Then** the stake, escrow, and payout are
   denominated in the selected asset rather than a hard-coded USDC.
3. **Given** an escrow-eligible asset on a network other than the connected one,
   **When** the member tries to create the challenge, **Then** the action is
   network-switch gated exactly as Pay is, so the challenge is never created on the
   wrong chain.
4. **Given** the platform's existing default (USDC) is available on the connected
   network, **When** the Wager view first renders, **Then** it defaults to that
   asset so the common case is unchanged.

---

### User Story 4 - Consistent nested logos in the trade view (Priority: P3)

A member opens the **trade** view, which already lists many assets. The list now
uses the same universal asset selector presentation, so every asset shows the
nested asset logo (glyph + network sub-badge) instead of a bare symbol. Behavior
of the trade view is otherwise unchanged; only the asset presentation becomes
consistent with the rest of the app.

**Why this priority**: The trade view already lists all assets and works; adding
the nested icon is a polish/consistency improvement, valuable but lower risk and
lower urgency than the home money actions.

**Independent Test**: Open the trade view and confirm each listed asset now
renders with the nested asset logo matching the Earn page and the home selector,
with no change to which assets are listed or how a trade is executed.

**Acceptance Scenarios**:

1. **Given** the trade view's asset list, **When** it renders, **Then** each asset
   shows the nested asset logo (asset glyph + network sub-badge) consistent with
   the Earn page and the home selector.
2. **Given** the trade view previously listed a set of assets, **When** the
   selector is adopted, **Then** the same assets remain available and the trade
   execution flow is unchanged.

---

### Edge Cases

- **Empty portfolio**: The account holds nothing beyond the connected network's
  native/stablecoin (still shown at zero). The selector renders those defaults and
  discloses balances are loading or zero; no crash, no empty menu.
- **Balances still loading**: Before balances resolve, the selector shows the
  connected network's native + stablecoin so the form is usable, with a loading
  indicator on balances rather than a blank list.
- **Asset on an unreachable/unsupported network**: An asset whose network config
  is missing is not offered; the selector never lists an asset it cannot act on.
- **Non-EVM asset in an EVM-only activity**: Excluded from Wager and trade lists;
  present in Pay/Request. The exclusion is by activity capability, applied
  consistently, never a silent failure at submit time.
- **Selected asset becomes unavailable**: If the acting account, connected chain,
  or holdings change so the selected asset is no longer valid, the selector falls
  back to a sensible default (connected stablecoin → native → first available) and
  clears any dependent in-progress output (e.g. a generated request).
- **Acting as a vault or recovered account**: The selector's asset list reflects
  the account the member is *acting as* (its own holdings on its own chain), not
  always the connected wallet, consistent with the existing Transfer/Request
  behavior.
- **Very long asset lists**: The list remains scannable and scrollable; the nested
  logos and network labels keep same-symbol assets on different networks
  distinguishable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a single reusable asset selector used by the
  home Pay, home Request, home Wager, and trade views, replacing each view's
  current asset control.
- **FR-002**: The selector MUST let a member choose from any platform-supported
  asset the acting account holds across every configured network, matching the set
  the wallet Transfer form already surfaces (held balance > 0), while always
  including the connected network's native coin and stablecoin so the forms are
  usable before balances load or at zero balance.
- **FR-003**: Each asset row and the selected-asset display MUST render the nested
  asset logo used on the Earn page — the asset's primary glyph with its network
  sub-badge — so the asset's identity and hosting network are clear at a glance.
- **FR-004**: Each asset row MUST show the asset symbol, its network name, and the
  held balance; balances that are still loading MUST be shown as pending, not as
  zero or blank.
- **FR-005**: The selector MUST indicate, per asset, whether a send of that asset
  is gasless on its network, using the existing per-asset gasless quote — it MUST
  NOT re-derive routing itself.
- **FR-006**: Selecting an asset MUST update the dependent view state (amount
  denomination, balance line, fee/gasless disclosure, and any generated output) to
  that asset.
- **FR-007**: When a selected asset lives on a network other than the one the
  wallet is connected to, the activity's primary action MUST become a
  network-switch affordance ("Switch to {network}") and the underlying action MUST
  NOT be signed until the wallet is on the asset's network.
- **FR-008**: The system MUST scope each activity's asset list to what that
  activity can support: Pay and Request MUST include non-EVM assets (Bitcoin) that
  those flows support; the head-to-head Wager escrow and the trade view MUST
  exclude categorically unsupported assets (non-EVM), and MUST never present an
  asset that would fail at submit time as if it were usable.
- **FR-009**: Pay MUST route a selected asset through the existing send engine
  using its full asset descriptor (native, network stablecoin, arbitrary ERC-20,
  or Bitcoin), inheriting the engine's screening, gasless routing, honest
  lifecycle, and never-stranded fallbacks — no routing logic is reimplemented in
  the view.
- **FR-010**: Request MUST encode the selected asset's identity (recipient,
  amount, asset/token, network) in the generated payment request so a compatible
  wallet reads the correct asset and chain, and MUST invalidate a displayed
  request when the selected asset or acting account changes.
- **FR-011**: Wager MUST denominate the stake, escrow, and payout in the selected
  escrow-eligible asset instead of a hard-coded USDC, defaulting to the connected
  network's stablecoin (USDC where available) so the common case is unchanged.
- **FR-012**: The trade view MUST adopt the selector's nested-logo presentation
  without changing which assets it lists or how a trade is executed.
- **FR-013**: When the selected asset becomes invalid (acting account, connected
  chain, or holdings change), the selector MUST fall back to a sensible default
  (connected stablecoin → native → first available) and clear dependent in-progress
  output.
- **FR-014**: The selector's asset list MUST reflect the account the member is
  acting as (personal wallet, custody vault, or recovered legacy account),
  consistent with existing Transfer/Request behavior, and MUST NOT leak one
  account's holdings into another's list.
- **FR-015**: The selector MUST be accessible: keyboard-operable, screen-reader
  labeled, and the decorative nested logos MUST NOT be the sole carrier of meaning
  (symbol + network text always accompany them).
- **FR-016**: The system MUST NOT introduce new on-chain behavior, contracts, or
  network config; it reuses existing portfolio data, the existing send engine, and
  the existing asset-logo artwork.

### Key Entities *(include if feature involves data)*

- **Selectable Asset**: One choosable option in the selector. Represents a held
  (or default) asset for the acting account, carrying its identity (symbol, name,
  underlying), its hosting network (for the nested logo's sub-badge and the
  network label), its kind (native, ERC-20, or non-EVM/Bitcoin), its held balance,
  and its per-asset gasless capability. Derived from the existing portfolio
  holdings and network config — not a new persisted record.
- **Activity Capability Profile**: The rules that scope which selectable assets an
  activity may offer (Pay/Request: all supported including Bitcoin; Wager/trade:
  EVM escrow-eligible only). Used to filter the asset list per activity so
  unsupported assets never appear where they cannot work.
- **Nested Asset Logo**: The existing visual — a primary asset glyph plus an
  optional network sub-badge — reused unchanged to depict each asset's identity
  and hosting network.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the home Pay and Request views, a member can select and act on
  100% of the assets their account holds across all configured networks — not just
  the connected network's native coin and stablecoin.
- **SC-002**: Every asset shown in the Pay, Request, Wager, and trade selectors
  displays the nested asset logo (glyph + network sub-badge), so a member can
  distinguish two same-symbol assets on different networks without reading beyond
  the row.
- **SC-003**: 100% of network-mismatched selections are gated by a visible "switch
  network" step; no action is ever submitted against the wrong chain, and no
  selection results in a silent failure.
- **SC-004**: Non-EVM assets (Bitcoin) appear and function in Pay and Request, and
  are absent from Wager and trade — with zero submit-time failures caused by an
  unsupported asset being offered.
- **SC-005**: The Wager stake can be denominated in any escrow-eligible asset the
  account holds, while the default first-render behavior (USDC on the connected
  network) is unchanged for existing users.
- **SC-006**: The selector, Pay/Request/Wager wiring, and trade presentation ship
  with passing frontend tests and no accessibility regressions in CI.

## Assumptions

- The wallet Transfer form's existing cross-network portfolio asset list
  (including its Bitcoin support and per-asset gasless quoting) is the reference
  behavior; the universal selector generalizes that same data and presentation,
  adding the nested logo, and reuses it across the four surfaces.
- The existing send engine already accepts a full asset descriptor and already
  routes native, network-stablecoin, arbitrary ERC-20, and Bitcoin sends; this
  feature wires the selector to it and does not modify routing.
- The Earn page's nested asset logo artwork is the canonical visual for depicting
  an asset with its network and is reused as-is.
- "Trade view" refers to the app's existing surface that already lists all assets;
  its asset set and execution flow stay as they are — only the asset presentation
  gains the nested logo.
- Head-to-head Wager escrow and the trade view are EVM-only for the purposes of
  asset eligibility; non-EVM assets are scoped out of those activities by design,
  not by omission.
- Amounts always start at zero; this feature changes only which asset can be
  chosen and how it is presented, not the amount-entry or preference behavior
  established by the home surface feature.
- The acting-account model (personal / vault / recovered legacy) established by
  prior features governs whose holdings the selector lists.
