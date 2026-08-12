# Feature Specification: Perps — Cross-Protocol Perpetual-Futures Markets in Trade

**Feature Branch**: `claude/perpetual-futures-integration-texoyy`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Research, spec, and implement perpetual futures into our
platform. Gains Network, GMX and potentially Hyperliquid need to be integrated similar
to our integrations with lending in the Earn section. All pairs should be shown on a
'Perps' tab in the 'Trade' section. The system needs to appropriately allow
administrators to set fees using the protocol or fee wrappers. The view should provide
users with adequate insights in a visual style consistent with the app's style kit.
This system must connect to the core systems and reporting."

## Clarifications

### Session 2026-08-11

- Q: What does "a 'Perps' tab in the 'Trade' section" mean in this app's navigation
  model? → A: A **view inside the Trade section** (`?view=perps` within the `trade`
  tab), following the established section/view idiom (Wagers under Transfer, Lend/
  Stake/Supply under Earn). Trade remains one nav item; Perps is a sub-view with its
  own deep link. The Trade panel's existing perps seam (`PERPS_ORDER_TYPES`,
  `getPerpsVenue`) anticipated this.
- Q: Does this release include opening/closing leveraged positions in-app? → A: **No —
  deliberately deferred.** All three protocols execute orders asynchronously via
  keepers or their own off-chain book, and a fee-charging wrapper contract is a
  value-bearing contract requiring its own security lifecycle (constitution I). Two
  custody questions (does each open call take an owner parameter; can a pause ever
  block an exit) must be answered per-protocol in a dedicated execution spec. This
  release ships **markets, insights, the member's own open positions (read-only), fee
  administration, and referral-attributed link-outs** — the same "read + honest
  link-out first" shape Predict shipped before trading was wired.
- Q: How does FairWins earn, and what can administrators actually configure? → A: Three
  different revenue rails, only one of which is platform-priced:
  - **Gains Network**: an on-chain referrer address earns a **fixed protocol share**
    (~1.5–2 bps of referred opening volume, paid in GNS). Not configurable by us; costs
    the trader nothing extra.
  - **GMX v2**: a registered referral code earns a **tiered share of GMX's own fee**
    (5–15%) *and gives the referred trader a 5–10% fee discount*. Not configurable by
    us; benefits the trader.
  - **Hyperliquid**: a **builder fee** the platform sets per-order (capped by
    Hyperliquid at 10 bps on perps), approved once by the user — a real, additive
    trader cost. **This is the administrator-configurable fee**, stored as a spec-060
    FeeRouter `ConfigOnly` service so the Fees tab governs it with an on-chain cap and
    audit history, exactly like the Polymarket builder fee.
- Q: Which chains/networks? → A: Market data is **network-transparent** (like Earn):
  the Perps view lists pairs from all three protocols at once with protocol and chain
  badges — Gains Network (Arbitrum, Base, Polygon), GMX v2 (Arbitrum), Hyperliquid
  (its own L1, no EVM chain id — displayed as a venue, never given a numeric chain id,
  per the spec-061 precedent for non-EVM networks). The view never renders another
  cohort's data (constitution III); on a testnet build the view discloses that perps
  market data is mainnet-only rather than showing mainnet pairs as if local.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse all perp pairs with live market insight (Priority: P1)

A member opens **Trade ▸ Perps** and sees one combined, searchable list of perpetual-
futures pairs across Gains Network, GMX, and Hyperliquid. Each pair shows the venue,
the chain it trades on, the live mid/oracle price, the current funding rate (with its
interval made explicit), open interest, and maximum leverage. The member can search by
pair name and filter by venue, and sort by the key columns. Every DeFi term (funding,
open interest, leverage, liquidation) carries plain-language help. If one venue's data
source is down, that venue is marked degraded while the others keep rendering — an
unreachable venue never renders as zeros.

**Why this priority**: The pairs view is the core deliverable — it is the surface every
other story hangs off, independently valuable as market insight even before positions
or fees exist.

**Independent Test**: Open Trade ▸ Perps with no wallet connected; verify pairs from
all three venues render with price, funding, OI, and leverage populated from live
sources; search narrows the list; killing one venue's upstream marks only that venue
degraded.

**Acceptance Scenarios**:

1. **Given** the Perps view loads normally, **When** all three venues respond, **Then**
   the member sees a single merged pair list with venue + chain badges, price, funding
   rate (interval labeled), open interest, and max leverage per pair.
2. **Given** one venue's data source is unreachable, **When** the view renders,
   **Then** that venue shows an explicit degraded notice and its pairs are absent —
   never shown as zero/stale — while the other venues' pairs render normally.
3. **Given** the member types in the search box or selects a venue filter, **When** the
   list updates, **Then** only matching pairs remain and the result count is announced
   accessibly.
4. **Given** a metric is unavailable for a specific pair (e.g. a venue does not expose
   open interest for it), **When** the row renders, **Then** the cell shows "—", never
   a fabricated zero.
5. **Given** the market-data service is not configured at all, **When** the member
   opens Trade, **Then** the Perps entry is absent or shows one honest "not available"
   state — never an empty table or dead controls.

---

### User Story 2 - See my open perp positions across venues (Priority: P2)

A member who already trades perps connects their wallet and sees, inside the Perps
view, their own open positions across Gains Network and GMX (by wallet address) and
Hyperliquid (by the same address on its L1) — pair, direction, size, entry price,
leverage, and unrealized PnL where the venue exposes it. Positions are read-only;
closing links out to the venue. A venue that cannot be read shows "unreadable" for
that venue only, and an account with no positions sees a quiet empty state, not an
error.

**Why this priority**: Positions make the view personal and are the bridge to
portfolio/reporting integration; they are read-only and independently shippable after
US1.

**Independent Test**: With a wallet address that holds a known open position on one
venue, connect and verify the position renders with pair/direction/size/entry; with a
fresh address, verify the quiet empty state; with one venue's reads failing, verify
per-venue isolation.

**Acceptance Scenarios**:

1. **Given** a connected wallet with open positions on a venue, **When** the Perps view
   loads, **Then** those positions render with pair, direction (long/short), size,
   entry price, leverage, and PnL where available — each value attributed to its venue.
2. **Given** a venue's position read fails, **When** the section renders, **Then** that
   venue is marked unreadable and other venues' positions still render (no cross-venue
   blanking, no zeros).
3. **Given** the member disconnects or switches accounts, **When** the view updates,
   **Then** the previous account's positions are cleared immediately and never shown to
   the new account.
4. **Given** a member taps a position, **When** the venue link opens, **Then** it
   carries FairWins' referral/builder attribution for that venue and the member is told
   they are leaving the app to manage the position on the venue.

---

### User Story 3 - Administrators govern perps fees and attribution (Priority: P2)

A fee administrator opens the Admin Panel's Fees tab and sees the perps fee services
alongside the existing ones: the **Hyperliquid builder fee** (the one platform-priced
perps fee, capped at Hyperliquid's own 10 bps perps limit) with its live rate, cap,
and change history. The admin can set the rate within the cap; every change is
recorded on-chain and visible in the history. Gains and GMX referral economics are
displayed as fixed venue-paid shares (informational — nothing to set). The member-facing
view always discloses, before any link-out, what the trader pays: the Hyperliquid
builder fee as a real added cost when configured above zero; the GMX referral as a
trader *discount*; Gains as no added cost.

**Why this priority**: Fee governance is a launch requirement ("administrators set fees
using the protocol or fee wrappers") and must exist before any revenue rail is turned
on, but it depends on the venue integration landing first.

**Acceptance Scenarios**:

1. **Given** a fee admin on the Fees tab, **When** the perps services render, **Then**
   the Hyperliquid builder-fee service shows live rate, hard cap (≤10 bps), and its
   change history, and the admin can set a new rate within the cap.
2. **Given** an admin attempts a rate above the cap, **When** they submit, **Then** the
   change is rejected and the cap is stated — the system can never store a rate above
   the venue's own limit.
3. **Given** the builder fee is set to zero, **When** a member views Hyperliquid pairs,
   **Then** no fee line is shown (zero ⇒ silence, matching platform-fee rules); when it
   is above zero, the rate is disclosed before any Hyperliquid link-out.
4. **Given** the live rate cannot be read, **When** a member opens a Hyperliquid
   link-out surface, **Then** the disclosure states the fee could not be confirmed
   rather than showing a possibly-stale number as current.

---

### User Story 4 - Trade on the venue with FairWins attribution (Priority: P3)

From any pair or position, the member can open that market on the venue's own app via
an explicit outbound link that carries FairWins' referral/builder attribution — the
Gains referral, the GMX referral code (which also *discounts* the member's trading
fees), or the Hyperliquid referral/builder path. The member is always told they are
leaving FairWins and that the venue is a third-party leveraged-trading platform with
liquidation risk.

**Why this priority**: The link-out is the revenue-activation moment for this release
and the honest bridge until in-app execution ships; it is small and depends only on US1.

**Acceptance Scenarios**:

1. **Given** a member taps "Trade on <venue>", **When** the outbound link opens,
   **Then** it targets that pair's market on the venue and carries the venue-specific
   FairWins attribution (referral code / referrer / builder path).
2. **Given** attribution is not configured for a venue, **When** the member links out,
   **Then** the plain venue link is used — the action is never blocked by missing
   attribution (never-stranded).
3. **Given** any outbound link, **When** it is shown, **Then** it is visibly marked as
   external and accompanied by a leverage/liquidation risk disclosure in plain
   language.

---

### Edge Cases

- A venue lists a pair with no funding data during a migration window → the funding
  cell shows "—" with help text, never 0.00%.
- Funding intervals differ per venue (hourly vs 8-hour) → rates are always labeled
  with their interval and never cross-normalized silently; where a normalized
  comparison is offered it is explicitly labeled (e.g. "annualized").
- Very large or very small numbers (OI in hundreds of millions; funding at fractions
  of a bp) → compact, locale-stable formatting with full value on hover/help.
- The member's wallet is on a chain none of the venues run on → the view still renders
  (market data is network-transparent); link-outs state the venue's chain.
- Hyperliquid has no EVM chain id → it must never be passed through EVM-only seams
  (numeric chain lookups, wagmi, contract-address resolution); it renders as a venue
  with its own badge.
- Testnet build → perps market data is a mainnet surface; the view discloses this
  honestly instead of mixing cohorts.
- Rate limits on venue APIs → the platform proxies and caches reads so many members
  don't multiply upstream load; a rate-limited upstream degrades that venue honestly.
- An account with positions on all three venues where one read is slow → fast venues
  render first; the slow one resolves or degrades independently.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Trade section MUST offer a "Perps" view with its own stable deep
  link, presented as a tab-like switcher inside Trade, without adding a new top-level
  nav item.
- **FR-002**: The Perps view MUST list perpetual-futures pairs from Gains Network,
  GMX, and Hyperliquid in one merged list, each row carrying venue and chain
  identification, live price, funding rate with explicit interval, open interest, and
  maximum leverage.
- **FR-003**: Market data MUST be fetched through a platform-operated read proxy with
  caching and quotas (protecting venue rate limits and member privacy), never
  requiring member authentication for browse.
- **FR-004**: Venue failures MUST be isolated: each venue independently resolves to
  read / degraded, and a degraded venue is disclosed — its pairs are omitted, never
  rendered as zeros or stale values presented as live.
- **FR-005**: Every numeric insight MUST be honest: missing values render as "—";
  formatters are total functions (null-safe); nothing fabricates a number the venue
  did not report.
- **FR-006**: The view MUST support search by pair symbol/name and filtering by venue,
  with accessible result announcements, and sorting by price, funding, and open
  interest.
- **FR-007**: A connected member MUST see their own open positions per venue
  (read-only): pair, direction, size, entry price, leverage, and unrealized PnL where
  the venue exposes it, with per-venue failure isolation and immediate clearing on
  account change.
- **FR-008**: All perps fee/attribution configuration MUST live in the platform's
  single fee source of truth (the spec-060 fee registry) as services with hard caps;
  the Hyperliquid builder fee MUST be capped at or below Hyperliquid's own 10 bps
  perps limit; no fee rate may be hardcoded in client or gateway code.
- **FR-009**: Fee administrators MUST manage perps fee rates from the existing Fees
  admin surface with live rate, cap, and on-chain change history; rates above cap MUST
  be rejected.
- **FR-010**: Member surfaces MUST disclose trading economics honestly before any
  outbound action: a configured Hyperliquid builder fee as a real additive cost
  (zero ⇒ no fee line); the GMX referral as a trader discount; Gains referral as
  costing the trader nothing. An unreadable live rate MUST be disclosed as
  unconfirmed, never silently substituted.
- **FR-011**: Outbound "Trade on <venue>" links MUST carry FairWins' venue-specific
  attribution when configured and MUST fall back to the plain venue link when not
  (attribution never blocks the action); all outbound links are marked external and
  accompanied by a plain-language leverage/liquidation risk disclosure.
- **FR-012**: Hyperliquid MUST be modeled as a non-EVM venue: never assigned a numeric
  chain id, never passed to EVM-only resolution seams; its identity is a string venue
  id (spec-061 precedent).
- **FR-013**: The Perps surface MUST degrade honestly end-to-end: when the read proxy
  is not configured or killswitched, the view hides or shows one clear unavailable
  state; no dead buttons, no empty tables presented as "no pairs exist".
- **FR-014**: Perps activity MUST connect to reporting: detected position changes for
  a connected account feed the activity/notification system, and the operational
  status of the perps data service is visible in the platform's service status
  reporting; fee changes are reportable from their on-chain history.
- **FR-015**: The view MUST meet the app's accessibility and style standards: WCAG 2.1
  AA, existing design tokens and component kit, venue/chain badging consistent with
  the asset-badging conventions, and every specialist term explained via the standard
  help affordance.
- **FR-016**: Nothing on the wager/pool value path may depend on any part of this
  feature; a total perps outage leaves every existing surface intact.
- **FR-017**: Cohort integrity: a testnet build MUST NOT present mainnet perps data as
  if it were local; the surface discloses mainnet-only availability instead.
- **FR-018**: In-app order placement, position modification, or any custody of member
  funds is OUT OF SCOPE for this release; no control may imply otherwise (no dead
  "open position" buttons).

### Key Entities

- **Venue**: A perpetual-futures protocol integrated for market data — identity,
  display name, chains (or non-EVM venue id), data-source health, attribution
  configuration, economics kind (venue-paid share vs platform-priced builder fee).
- **PerpPair**: One tradable perpetual market on a venue — symbol (e.g. BTC/USD),
  venue, chain, price, funding rate + interval, open interest, max leverage,
  link-out URL.
- **PerpPosition**: A member's open position read from a venue — venue, pair,
  direction, size, collateral, entry price, leverage, unrealized PnL (optional),
  read state.
- **FeeService (perps)**: A spec-060 registry entry governing a perps rate — id,
  cap, live rate, change history. Initially: the Hyperliquid builder fee.
- **AttributionConfig**: Public, per-venue attribution identifiers (referral code /
  referrer address / builder address) used to construct outbound links and, later,
  orders.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can find a specific perp pair (e.g. "ETH") and read its price,
  funding, OI, and leverage across venues in under 15 seconds from opening Trade.
- **SC-002**: 100% of venue outages render as explicit degraded states — zero
  occurrences of an unreachable venue rendering zeros or stale-as-live data in the
  test suite.
- **SC-003**: With all venues healthy, the merged pairs list shows ≥ 90% of each
  venue's listed perp markets (venue-side delistings excepted).
- **SC-004**: A fee administrator can change the Hyperliquid builder fee and see it
  reflected on member surfaces within one minute, and can never store a rate above
  the cap (enforced and tested at both admin input and storage).
- **SC-005**: 100% of Hyperliquid link-out surfaces show the configured builder fee
  when non-zero, and none show a fee line at zero — verified by tests for both states.
- **SC-006**: Every outbound trade link carries attribution when configured (verified
  per venue), and link-outs still function with attribution unset.
- **SC-007**: The Perps view passes automated WCAG 2.1 AA checks (axe) with zero
  violations, in light and dark themes.
- **SC-008**: A member with open positions on two venues sees both within 5 seconds of
  connecting, with per-venue isolation verified by fault-injection tests.
- **SC-009**: Existing test suites (contracts, frontend, gateway) remain green; the
  feature adds unit, integration, and end-to-end coverage for its own paths.

## Assumptions

- The three venues' public, unauthenticated market-data endpoints (documented for
  integrators) remain available and sufficient for browse + positions; the platform
  proxy caches to stay well inside published/implied rate limits.
- Revenue rails are per-venue programs (Gains referral, GMX referral code,
  Hyperliquid builder fee) — there is no FairWins wrapper contract in this release,
  hence no new value-bearing contract surface (constitution I applies to config only).
- The Hyperliquid builder fee, when enabled, requires a one-time user approval on
  Hyperliquid's side; this release only discloses and links out — approval/order flows
  belong to the execution follow-up.
- Registering the perps fee service on-chain follows the existing operational flow
  (deploy-time launch table + post-deploy registration script) on the fee registry's
  home network.
- Venue attribution identifiers (GMX code, Gains referrer address, Hyperliquid
  builder address) are public configuration, not secrets; any venue API secrets, if
  ever needed, are gateway-only.
- In-app execution (including any PerpsRouter wrapper contract, keeper-async order
  UX, and Hyperliquid signed actions) will be a separate spec with its own security
  lifecycle; this spec deliberately contains none of it.
