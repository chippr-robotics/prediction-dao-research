# Feature Specification: My Account Stats Dashboard

**Feature Branch**: `020-account-stats-dashboard`

**Created**: 2026-06-18

**Status**: Draft

**Input**: User description: "My Account Dashboard — turn the My Account page (currently just wallet address + QR/Disconnect) into a real-time personal stats dashboard." Design source: `specs/020-account-stats-dashboard/design/FairWins_Account_Dashboard.html` (Claude Design export) and `specs/design-prompts/my-account-stats-dashboard.md` (design brief).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - At-a-glance performance summary (Priority: P1)

A connected member opens **My Account** and immediately sees a row of summary
tiles that quantify their FairWins activity — Net Profit/Loss (in USD), Win Rate,
Total Wagered, Active Wagers, and Wallet Balance — instead of the bare wallet
address and Disconnect button they see today. The numbers animate up on load and
refresh on a regular cadence so the page feels live.

**Why this priority**: This is the core value of the feature and the smallest
slice that turns a utilitarian wallet page into a personal dashboard. It is
viable on its own: even without charts or breakdowns, a member can understand how
they are doing.

**Independent Test**: Connect a wallet that has wager history, open My Account,
and confirm each tile shows a correct value derived from that wallet's wagers and
balances, with positive figures styled distinctly from negative ones.

**Acceptance Scenarios**:

1. **Given** a connected member with settled wagers, **When** they open the
   Account tab, **Then** they see summary tiles for Net P&L (USD), Win Rate,
   Total Wagered, Active Wagers, and Wallet Balance populated from their own
   activity.
2. **Given** the dashboard is open, **When** the underlying data refreshes on its
   polling cadence, **Then** changed tile values update in place (with a count-up
   transition) without a full page reload.
3. **Given** a member with a positive net result, **When** the Net P&L tile
   renders, **Then** it is visually distinguished (e.g. positive/win styling)
   from the negative/loss styling used when the net result is below zero.
4. **Given** a member views a tile representing money, **When** the value is
   shown, **Then** it is expressed in USD using compact notation and labelled
   with the correct token context where relevant.

---

### User Story 2 - Performance over time (Priority: P1)

A member wants to see a trend, not just a snapshot. The dashboard presents a
hero **time-series graph** of cumulative net P&L over time, with a range selector
(7D / 30D / 90D / All). The area above break-even reads as positive and below as
negative, and the user can switch the range to zoom the history.

**Why this priority**: The user explicitly asked for a real-time, visually
interesting time-series graph; it is the centrepiece of the design. It is
independently testable and demonstrable once the summary tiles exist.

**Independent Test**: With a wallet that has several deposits/payouts/refunds over
time, open the dashboard and confirm the chart plots cumulative net P&L and that
changing the range selector re-scopes the plotted period.

**Acceptance Scenarios**:

1. **Given** a member with money-movement history, **When** the dashboard loads,
   **Then** a time-series chart shows their cumulative net P&L over the default
   range.
2. **Given** the chart is shown, **When** the member selects a different range
   (7D / 30D / 90D / All), **Then** the chart re-scopes to that period.
3. **Given** the member hovers or taps a point on the chart, **When** the point is
   active, **Then** the date and the cumulative value at that point are shown.
4. **Given** the chart re-polls its data, **When** new transfers exist, **Then**
   the line extends/updates without a jarring full reload.

---

### User Story 3 - Honest empty and low-data states (Priority: P1)

A brand-new member (or one with no wager history on the active network) opens My
Account. Instead of a fabricated curve or fake numbers, they see an honest empty
state that explains there is no activity yet and points them toward creating or
accepting their first wager.

**Why this priority**: FairWins is a real-money product and the constitution
forbids implying state the chain has not reached. New users are the common first
experience, so a graceful zero-data path is mandatory, not optional.

**Independent Test**: Connect a fresh wallet with no wagers and confirm every
dashboard element (tiles, chart, breakdowns, activity feed) renders an honest
empty/zero state with no invented data, and offers a clear next step.

**Acceptance Scenarios**:

1. **Given** a connected member with zero wagers on the active network, **When**
   they open the Account tab, **Then** the chart shows an empty state (no
   fabricated line) and tiles show zeroed/neutral values clearly marked as "no
   activity yet."
2. **Given** a member has too few data points to form a meaningful trend, **When**
   the chart renders, **Then** it degrades gracefully (e.g. points/flat baseline)
   rather than implying a misleading trend.
3. **Given** a member switches to a network where they have no history, **When**
   the dashboard reloads, **Then** it shows that network's empty state and does
   not leak figures from another network.

---

### User Story 4 - Activity breakdowns and recent feed (Priority: P2)

Beyond the headline numbers, a member can see how their activity decomposes: a
breakdown **by wager status** (active vs. settled, won/lost/draw), **by token**
(e.g. USDC vs. native), and **by oracle/resolution type** (Polymarket, Chainlink,
UMA), plus a **recent activity feed** listing their latest deposits, payouts, and
refunds with relative timestamps and a link to the transaction.

**Why this priority**: These add depth and answer "why" behind the headline
numbers, but the dashboard is already valuable without them. They build directly
on the same data feeds as P1.

**Independent Test**: With a wallet that has mixed activity, confirm the
breakdowns sum correctly to the headline totals and the recent feed lists the
latest value-moving events newest-first with working transaction links.

**Acceptance Scenarios**:

1. **Given** a member with wagers in multiple statuses, **When** they view the
   breakdown, **Then** counts by status reconcile with the Active Wagers and
   settled totals shown in the tiles.
2. **Given** a member has staked in more than one token, **When** they view the
   by-token breakdown, **Then** each token's contribution is shown with the
   correct symbol and decimals for the active network.
3. **Given** a member has recent deposits/payouts/refunds, **When** they view the
   recent activity feed, **Then** entries are listed newest-first with direction,
   amount, token, a relative timestamp ("Ns ago"), and a link to the transaction.

---

### User Story 5 - Real-time freshness cues (Priority: P2)

A member can trust that the dashboard is current. Each live section shows when it
was last updated ("updated Ns ago") and the page surfaces a subtle refreshing
affordance, plus a manual refresh (and pull-to-refresh on mobile) for balances.
Because updates are polling-based, the UI signals "live-ish" honestly rather than
implying instant streaming.

**Why this priority**: Reinforces the "real-time" requirement and user trust, but
the dashboard functions without explicit freshness cues, so it ranks below the
core data and chart.

**Independent Test**: Open the dashboard, observe the "updated Ns ago" indicators
advance, trigger a manual balance refresh, and confirm the indicator resets and
balances re-read.

**Acceptance Scenarios**:

1. **Given** the dashboard is open, **When** time passes between polls, **Then**
   each live section's "updated Ns ago" indicator reflects the elapsed time since
   its last successful refresh.
2. **Given** a member taps manual refresh (or pulls to refresh on mobile),
   **When** the refresh completes, **Then** balances re-read and the freshness
   indicator resets.
3. **Given** a data source fails to refresh, **When** the poll errors, **Then**
   the UI shows the last-known values with a stale/error indicator rather than
   blanking or showing fabricated data.

---

### User Story 6 - Preserved wallet utilities (Priority: P3)

The existing wallet utilities — full address with copy, Show QR Code, and
Disconnect Wallet — remain available but are de-emphasised beneath the stats so
they no longer dominate the page. The existing My Account sub-tabs (Membership,
Network, Security, Preferences, Reporting, Swap) continue to work unchanged.

**Why this priority**: Preserves existing functionality and avoids regressions,
but adds no new value; it is the lowest priority because it is about not breaking
what exists.

**Independent Test**: Open My Account, confirm address/QR/Disconnect still work
from a secondary panel, and that every existing sub-tab still opens its current
content.

**Acceptance Scenarios**:

1. **Given** the redesigned Account tab, **When** a member looks for wallet
   utilities, **Then** the full address, Show QR Code, and Disconnect Wallet
   actions are still present (in a de-emphasised panel) and function as before.
2. **Given** the existing sub-tabs, **When** a member opens Membership, Network,
   Security, Preferences, Reporting, or Swap, **Then** each shows its current
   content unchanged.

---

### Edge Cases

- **No wallet connected**: The dashboard prompts the member to connect (existing
  connect flow) and shows no personal data.
- **Wrong / unsupported network**: The dashboard surfaces the network mismatch and
  avoids showing figures that cannot be scoped to a supported network.
- **Slow or failing data feed**: Sections show last-known values with a stale
  indicator; the page never blanks or invents data.
- **Price feed unavailable**: USD-denominated values fall back gracefully and the
  UI indicates that conversion is approximate rather than showing a misleading
  precise figure.
- **Very large or very small numbers**: Values use compact notation and remain
  legible on a ~390px-wide mobile viewport.
- **Wager with no resolved outcome yet**: Counts toward Active, not toward
  win/loss, and is excluded from realized P&L.
- **Member active on multiple networks**: Only the active network's data is shown;
  switching networks reloads to that network's data with no cross-network leakage.
- **Encrypted wager metadata**: The dashboard shows the member's own aggregates
  and never surfaces counterparties' private details.
- **Dark/light theme toggle mid-session**: All elements, including the chart,
  re-theme correctly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The My Account (Account tab) view MUST present, for a connected
  member, a personal stats dashboard as its primary content, replacing the
  current address-only layout as the default focus.
- **FR-002**: The dashboard MUST show summary tiles for at least: Net Profit/Loss
  (USD), Win Rate, Total Wagered, Active Wagers, and Wallet Balance, each derived
  from the member's own activity and balances on the active network.
- **FR-003**: Money-denominated values MUST be displayed in USD using compact
  notation, with token symbol/decimals resolved from the active network (no
  hard-coded token names).
- **FR-004**: Positive/winning values MUST be visually distinguished from
  negative/losing values using the established win (green) and loss (red)
  semantic styling, with a non-color cue as well.
- **FR-005**: The dashboard MUST display a time-series chart of the member's
  cumulative net P&L over time as the hero visual.
- **FR-006**: The chart MUST provide a range selector with at least 7D, 30D, 90D,
  and All options that re-scope the plotted period.
- **FR-007**: The chart MUST allow inspecting an individual point to reveal its
  date and cumulative value (hover on pointer devices, tap on touch devices).
- **FR-008**: When the member has no activity (or too little to form a meaningful
  trend) on the active network, the dashboard MUST render an honest empty/low-data
  state and MUST NOT fabricate a trend line or invented figures.
- **FR-009**: The dashboard MUST provide activity breakdowns by wager status, by
  token, and by oracle/resolution type, and these breakdowns MUST reconcile with
  the headline tile totals.
- **FR-010**: The dashboard MUST provide a recent activity feed of the member's
  deposits, payouts, and refunds, newest-first, each showing direction, amount,
  token, a relative timestamp, and a link to the underlying transaction.
- **FR-011**: Live sections MUST refresh on a regular polling cadence and reflect
  changed values in place (with count-up animation for numeric changes) without
  requiring a full page reload.
- **FR-012**: Each live section MUST display a freshness indicator ("updated Ns
  ago") reflecting time since its last successful refresh, and MUST offer a manual
  refresh (including pull-to-refresh on mobile) for balances.
- **FR-013**: When a data source fails to refresh, the dashboard MUST show
  last-known values with a stale/error indicator rather than blanking or showing
  fabricated data.
- **FR-014**: All personal data MUST be scoped to the active network and MUST NOT
  leak figures across testnet/mainnet or between networks when the member
  switches networks.
- **FR-015**: The dashboard MUST honour the existing dark and light themes for all
  elements, including the chart, using the established brand and chart-series color
  tokens.
- **FR-016**: The dashboard MUST be mobile-first and remain legible and
  touch-friendly at approximately 390px viewport width, scaling up to desktop.
- **FR-017**: The existing wallet utilities (full address with copy, Show QR Code,
  Disconnect Wallet) MUST remain available within the Account view in a
  de-emphasised position, and all existing My Account sub-tabs (Membership,
  Network, Security, Preferences, Reporting, Swap) MUST continue to function
  unchanged.
- **FR-018**: The dashboard MUST meet WCAG 2.1 AA, including non-color cues for
  win/loss states, accessible names for chart controls, and keyboard operability
  of the range selector and refresh controls.
- **FR-019**: The dashboard MUST only present data derivable from existing data
  feeds (member wager history, money-movement transfers, wallet balances, native
  USD price conversion, platform stats, roles/membership); any metric requiring a
  feed not currently available MUST be deferred rather than fabricated.
- **FR-020**: The dashboard MUST NOT surface counterparties' private or encrypted
  wager details; it presents only the member's own aggregates and their own
  transactions.

### Key Entities *(include if feature involves data)*

- **Account Summary**: The member's aggregate position on the active network —
  net P&L (USD), win rate, total wagered, active-wager count, and wallet balance —
  derived from their wagers, money-movement transfers, balances, and the
  native→USD rate.
- **Wager (member-scoped)**: A bet the member created or accepted, with status
  (open, active, draw_proposed, resolved, drawn, refunded, cancelled, declined),
  stakes, token, timestamps, oracle/resolution type, and winner — the basis for
  win/loss, active counts, totals, and breakdowns.
- **Money Movement (transfer)**: A value-moving event (deposit, payout, refund)
  with amount, token, USD value, timestamp, and transaction reference — the basis
  for the cumulative net P&L time series and the recent activity feed.
- **Balance**: The member's current holdings on the active network (native token,
  wrapped native, and stablecoin/other tokens) with USD valuation.
- **Time Series Point**: A (timestamp, cumulative net P&L) pair within a selected
  range, used to plot the hero chart.
- **Freshness State**: Per-section metadata of last successful refresh time and
  current status (fresh, refreshing, stale/error) used for the "updated Ns ago"
  cues.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A connected member with existing activity can understand their net
  result, win rate, and amount at stake within 5 seconds of opening My Account,
  without scrolling on desktop.
- **SC-002**: 100% of money-related figures shown reconcile with the member's
  underlying on-chain activity (no fabricated or placeholder values), verified
  against their wager and transfer history.
- **SC-003**: A brand-new member with no activity sees an honest empty state for
  every dashboard element and a clear call to action, with zero invented data
  points, in 100% of cases.
- **SC-004**: Changing the chart range (7D/30D/90D/All) re-scopes the displayed
  history in under 1 second as perceived by the user.
- **SC-005**: Live sections reflect new activity within one polling interval of it
  occurring, and each section's freshness indicator is never more than one
  interval behind reality.
- **SC-006**: The dashboard is fully usable on a 390px-wide mobile viewport with
  no horizontal scrolling and touch targets meeting accessibility guidance.
- **SC-007**: Accessibility audits (axe/Lighthouse) pass at WCAG 2.1 AA with no
  new violations introduced by the dashboard.
- **SC-008**: Switching networks never displays another network's figures; 100% of
  shown data is scoped to the active network.
- **SC-009**: All existing My Account utilities and sub-tabs remain functional
  after the redesign, with no regressions in their current behavior.

## Assumptions

- The required data is available from existing frontend feeds: member wager
  history (`useMyWagers`), the money-movement/transfer stream used by reporting
  (`useTaxReport` / WagerTransfer data), wallet balances (`useWalletManagement`),
  native→USD price conversion (`usePriceConversion`), platform stats
  (`useSiteStats`), and roles/membership — so no new backend or subgraph entity is
  required for the initial scope. (If a desired metric needs a feed not listed,
  it is deferred per FR-019.)
- Updates are polling-based (no websockets); the established cadences are activity
  ~30s, platform stats ~60s, and native price ~5min, with balances refreshed on
  demand. The "real-time" experience is delivered through these intervals plus
  freshness cues and animation.
- Net P&L is realized P&L derived from settled money movements (deposits vs.
  payouts/refunds); unresolved/active wagers contribute to "at stake"/Active, not
  to realized P&L. Stablecoins are valued at par and the native token via the USD
  rate feed.
- The redesign targets the **Account** sub-tab of the existing My Account page and
  keeps the existing sub-tab structure; it is a frontend-only change that consumes
  existing contract/subgraph data and introduces no contract changes.
- A lightweight charting capability will be needed (none is currently bundled);
  selection of the specific library is an implementation/plan concern, constrained
  to honor the existing theme and `--chart-series-*` palette.
- The design reference is the committed Claude Design export
  (`design/FairWins_Account_Dashboard.html`) and the design brief
  (`specs/design-prompts/my-account-stats-dashboard.md`); where the export and the
  brief differ in detail, the export is the visual source of truth and the brief
  is the data/behavior source of truth.
