# Feature Specification: Connected Account Portfolio

**Feature Branch**: `claude/connected-account-portfolio-h26qk3`

**Created**: 2026-07-10

**Status**: Implemented (v1.0 merged in PR #836, v1.1 merged in PR #838); v1.2 follow-up in progress

**Input**: User description: "Connected Account Portfolio in the Finance section. Add a new 'Portfolio' section under My Wallet → Finance that shows the connected account's assets grouped by SEC/CFTC regulatory taxonomy categories, matching the provided mobile mockup (total portfolio balance at top, collapsible category sections each with a category subtotal and per-asset rows showing balance and USD value). Categories: Digital Securities, Digital Commodities, Digital Collectibles, Digital Tools, Payment Stablecoins. Classification uses the official SEC commodity list as a hardcoded baseline plus curated open-source registry lists mapped to the regulatory definitions. Assets shown must be the real on-chain holdings of the connected account, scoped to the active network. Unclassified tokens must be handled honestly."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View my assets grouped by regulatory category (Priority: P1)

A member connects their wallet, opens **My Wallet → Finance → Portfolio**, and sees a
single portfolio view of their real holdings on the active network: a total portfolio
balance (in USD) at the top, followed by one collapsible section per regulatory
category — **Digital Commodities**, **Digital Securities**, **Payment Stablecoins**,
**Digital Tools**, and **Digital Collectibles** — each showing a category subtotal and
per-asset rows with the asset's name, symbol, on-chain balance, and USD value where a
price is available.

**Why this priority**: This is the feature. Everything else refines it. A member who
sees their live holdings organized by the app's regulatory taxonomy gets the full core
value even if nothing below ships.

**Independent Test**: Connect an account holding at least the network's native coin and
one registry-listed token; open the Portfolio tab; verify the total, category subtotals,
and per-asset rows reflect the account's actual on-chain balances for the active network.

**Acceptance Scenarios**:

1. **Given** a connected account on a supported network with a nonzero native-coin
   balance and a nonzero balance of a registry-listed stablecoin, **When** the member
   opens the Portfolio section, **Then** the native coin appears under Digital
   Commodities, the stablecoin under Payment Stablecoins, each category shows a
   subtotal, and the header total equals the sum of all listed assets' USD values.
2. **Given** the Portfolio section is displayed, **When** the member collapses a
   category, **Then** its asset rows hide while its header and subtotal remain visible,
   and expanding restores the rows.
3. **Given** an asset with a known balance but no available USD price, **When** it is
   displayed, **Then** its on-chain balance is shown and its USD value is shown as
   unavailable (never as $0.00), and it is excluded from USD totals with the totals
   labeled as partial.
4. **Given** a member who is not connected, **When** they open the Portfolio section,
   **Then** they see a connect prompt instead of portfolio data.

---

### User Story 2 - Understand what each category means and why an asset is there (Priority: P2)

A member wants to understand the taxonomy: each category exposes a plain-language
description aligned to the SEC/CFTC framing (e.g. Digital Commodities "derive value from
the programmatic operation of a functional decentralized system, not the managerial
efforts of a core team"), and each asset row can reveal its classification source —
the SEC commodity baseline, a curated registry mapping, or the app's own network
configuration (known issuer status).

**Why this priority**: The taxonomy is only trustworthy if members can see the
definitions and the provenance of each classification. It builds on P1's rendering.

**Independent Test**: Open the Portfolio tab and inspect any category header and any
asset row; verify the category description is visible/discoverable and the asset's
classification source is displayed.

**Acceptance Scenarios**:

1. **Given** the Portfolio section is displayed, **When** the member views a category,
   **Then** a plain-language description of that regulatory category is discoverable
   from the category header.
2. **Given** an asset classified from the SEC commodity baseline, **When** the member
   inspects the asset row, **Then** the classification source is identified as the SEC
   baseline list; likewise for curated-registry and app-configuration sources.
3. **Given** any portfolio view, **When** it renders, **Then** an informational
   disclaimer is visible stating that classifications are informational and not legal
   or investment advice.

---

### User Story 3 - Honest handling of unclassified and undiscoverable assets (Priority: P3)

The registry cannot know every token. Any asset the app knows the account holds but
cannot map to one of the five categories appears in an explicit **Unclassified** group
(never silently hidden), and the view discloses that asset discovery is limited to the
app's curated registry — tokens outside it are not shown.

**Why this priority**: Honesty guardrail. Matters for trust but only observable once
P1 renders holdings.

**Independent Test**: Configure an account holding an app-known token that has no
category mapping; verify it renders in an "Unclassified" group; verify the coverage
disclosure is visible.

**Acceptance Scenarios**:

1. **Given** the account holds an app-known token with no category mapping, **When**
   the portfolio renders, **Then** the token appears under "Unclassified" with its
   balance, and is included in totals when priced.
2. **Given** the portfolio view, **When** it renders, **Then** a disclosure states that
   only assets in the app's curated registry are scanned, so other holdings may exist
   on-chain that are not listed.

---

### User Story 4 - Portfolio stays scoped to the active network and stays fresh (Priority: P3)

When the member switches networks, the portfolio reloads and shows only assets and
balances for the new active network — holdings never leak across networks. The member
can manually refresh, and balances refresh automatically at a reasonable cadence.

**Why this priority**: Correctness-preserving behavior for multi-network members;
builds directly on P1.

**Independent Test**: Load the portfolio on one network, switch to another; verify all
rows, subtotals, and totals now reflect only the new network and its registry.

**Acceptance Scenarios**:

1. **Given** a loaded portfolio on network A, **When** the member switches to network
   B, **Then** the view reloads and shows only network B assets, with network B's
   native coin and registry.
2. **Given** a network the app does not support for portfolio scanning, **When** the
   member opens the Portfolio section, **Then** an explicit "unavailable on this
   network" state is shown rather than an empty or stale portfolio.
3. **Given** balance reads fail (e.g. network provider unreachable), **When** the
   portfolio renders, **Then** an explicit error state with a retry action is shown
   rather than zeros or stale data presented as current.

### Edge Cases

- Account holds none of the registry assets: all categories render with an explicit
  empty state and a $0.00 total — not a blank screen.
- An asset appears in more than one source list with conflicting categories: the
  highest-precedence source wins (SEC baseline > curated registry > app configuration),
  and the winning source is what the row reports.
- Collectibles (non-fungible assets) have no market price: rows show the item count
  held; USD subtotal shows as unavailable rather than $0.00.
- Prices become temporarily unavailable mid-session: previously shown USD values are
  not silently frozen; the view marks totals as partial/unavailable.
- Very small balances ("dust"): still listed with their true balance; no hiding
  threshold in v1.
- The registry lists a token whose on-chain contract does not respond as expected
  (e.g. reverts on balance queries): the asset is skipped with the failure surfaced in
  the error/partial state, not rendered as zero.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST add a "Portfolio" entry to the Finance group of the My
  Wallet navigation, opening the Connected Account Portfolio view, deep-linkable like
  existing Finance sections.
- **FR-002**: The portfolio MUST display only real on-chain holdings of the currently
  connected account, read live from the active network — no mock, cached-as-current, or
  placeholder balances.
- **FR-003**: The portfolio MUST be scoped to the active network; switching networks
  MUST reload the portfolio and never display assets or balances from another network.
- **FR-004**: The app MUST define exactly five regulatory taxonomy categories —
  Digital Securities, Digital Commodities, Digital Collectibles, Digital Tools, and
  Payment Stablecoins — each with a member-facing plain-language description aligned to
  the SEC/CFTC definitions provided in the feature description.
- **FR-005**: Asset classification MUST be driven by a layered registry: (a) a
  hardcoded baseline derived from the official SEC commodity list for Digital
  Commodities (covering at least the network's native coin and wrapped-native token),
  (b) curated open-source token-registry mappings for the remaining tiers, and (c) the
  app's own network configuration for tokens it already knows (e.g. the network's
  configured stablecoin maps to Payment Stablecoins).
- **FR-006**: Each classified asset MUST record and expose its classification source
  (SEC baseline, curated registry, or app configuration); when sources conflict, SEC
  baseline takes precedence over curated registry, which takes precedence over app
  configuration.
- **FR-007**: The registry MUST be maintained per network (asset identifiers are
  network-specific), and only the active network's registry entries are scanned.
- **FR-008**: The view MUST show a total portfolio balance in USD at the top,
  aggregating all displayed assets with available prices.
- **FR-009**: Each category MUST render as a collapsible section with a USD subtotal
  and per-asset rows showing asset name, symbol, on-chain balance, and USD value.
- **FR-010**: Assets with a balance but no available USD price MUST display their
  balance with USD marked unavailable (never $0.00), be excluded from USD totals, and
  cause affected totals to be labeled as partial.
- **FR-011**: Non-fungible (collectible) holdings, where present in the registry, MUST
  be represented by the count of items held per collection; they follow the same
  no-price rule as FR-010.
- **FR-012**: App-known assets that cannot be mapped to any of the five categories MUST
  appear in an explicit "Unclassified" group; no discovered holding may be silently
  hidden.
- **FR-013**: The view MUST disclose that (a) classifications are informational, not
  legal or investment advice, and (b) asset discovery is limited to the app's curated
  registry, so unlisted on-chain holdings will not appear.
- **FR-014**: The view MUST present explicit states for: wallet not connected, network
  not supported for portfolio scanning, balances loading, balance-read failure (with
  retry), and empty holdings.
- **FR-015**: The member MUST be able to manually refresh the portfolio, and balances
  MUST refresh automatically at a reasonable cadence consistent with the app's existing
  balance displays.
- **FR-016**: The portfolio view MUST meet the app's accessibility standard (WCAG 2.1
  AA), including keyboard operability of the collapsible sections and accessible
  labeling of totals and rows.

### Key Entities

- **Taxonomy Category**: One of the five regulatory groupings (plus the Unclassified
  fallback). Attributes: identifier, display name, plain-language regulatory
  description, display order.
- **Registry Asset**: A per-network asset entry eligible for scanning. Attributes:
  network identifier, asset identifier (contract address or native-coin marker), kind
  (native coin, fungible token, collectible collection), symbol, name, decimals (for
  fungibles), assigned category, classification source (SEC baseline / curated registry
  / app configuration).
- **Holding**: A registry asset joined with the connected account's live balance and,
  when available, its USD value. Attributes: balance, USD value (optional), price
  availability.
- **Portfolio Snapshot**: The set of holdings for one account on one network at one
  point in time, with per-category subtotals, the grand total, and partial/failed-read
  flags.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A connected member can see their categorized holdings within 5 seconds of
  opening the Portfolio section on a healthy network connection.
- **SC-002**: 100% of assets displayed correspond to real, current on-chain balances of
  the connected account on the active network (verifiable by independent balance
  lookup).
- **SC-003**: Every displayed asset shows a category (one of the five, or Unclassified)
  and a discoverable classification source; zero discovered holdings are hidden.
- **SC-004**: Switching networks never leaves a stale asset row from the previous
  network visible (0 cross-network leaks in testing).
- **SC-005**: With prices unavailable for some assets, totals are visibly marked
  partial and no asset displays a fabricated $0.00 value.
- **SC-006**: Accessibility audits of the new section report zero WCAG 2.1 AA
  violations.

## Assumptions

- The portfolio is **read-only** in v1: no buy/sell/transfer actions from this view
  (existing Trade and Pay & Transfer sections cover actions).
- **Registry-driven discovery** is acceptable for v1: the app scans a curated
  per-network asset registry rather than indexing all token transfers. This matches the
  stated implementation tip (SEC baseline + curated token lists) and the app's
  no-backend architecture; full-chain discovery via an indexer is out of scope.
- The curated registry ships **bundled with the app** and is updated through normal app
  releases; live ingestion of remote token lists at runtime is out of scope for v1.
- USD prices come from the app's existing pricing capability; assets without an
  available price are displayed per FR-010 rather than blocking the feature on a new
  price service.
- Stablecoins configured by the app's per-network settings are treated as Payment
  Stablecoins (known issuer status); the app does not independently verify GENIUS Act
  issuer approval.
- The five categories and their descriptions follow the definitions supplied in the
  feature description; regulatory reinterpretation is handled by registry updates, not
  by this feature.
- Networks currently supported by the app (e.g. Polygon and the app's testnets) are the
  target; a network without a registry shows the FR-014 "not supported" state.
- The mobile mockup is a visual reference for structure (header total, collapsible
  category sections, asset rows); exact visual styling follows the app's existing
  design system rather than the mockup's.

## Follow-up Amendments (v1.1, 2026-07-10)

Owner-requested refinements after v1.0 shipped ("the page is too information dense"):

- **FR-017**: Category regulatory descriptions move out of the inline layout into the
  app's shared info bubbles (spec 039 `InfoTip`) on each category header.
- **FR-018**: The Digital Commodities category lists ALL registry commodity assets in
  scope, including zero balances (a zero balance renders as a true 0 worth $0.00);
  other categories remain holdings-only.
- **FR-019**: Partial-balance labeling is removed. Unpriced assets still show their
  balance with USD as "—" and are excluded from USD sums; a single compact disclosure
  line states that totals include only priced assets. (Supersedes the FR-010 labeling
  requirement; the no-fabricated-USD rule stands.)
- **FR-020**: The portfolio is cross-chain: it scans every supported network
  (Ethereum, Ethereum Classic, Polygon, and — when enabled — Sepolia, Amoy, Mordor)
  over per-network read providers, independent of the wallet's active chain. Each row
  is labeled with its network. (Supersedes FR-003's single-active-network scoping;
  the never-mix-networks rule now applies per row.) Sepolia is added to the network
  config as a portfolio-scan-only testnet.
- **FR-021**: A "Portfolio" settings group in Preferences holds a "Show testnet
  tokens" switch (default off, persisted per wallet). When off, testnet networks are
  not scanned and a compact note in the portfolio says testnet tokens are hidden.

## Follow-up Amendments (v1.2, 2026-07-10)

Owner-requested next iteration (asset detail + verifiable pricing):

- **FR-022 (verifiable prices)**: USD prices come from verifiable on-chain sources
  where available — decentralized oracle price feeds (Chainlink aggregators) first,
  then DEX pool spot prices (Uniswap V3 `slot0` vs the network stablecoin) — read
  live over RPC. Stablecoins stay at par $1. Assets with no on-chain source remain
  honestly unpriced. (Replaces the CoinGecko rate for the portfolio; subgraph-backed
  pricing is a documented future performance option.)
- **FR-023 (zero-balance visibility)**: a Preferences → Portfolio setting shows/hides
  zero-balance assets, default **hide**. (Supersedes v1.1 FR-018 "always list all
  commodities": commodity instances are still always scanned, but zero-balance
  aggregate rows are hidden unless the setting is on.)
- **FR-024 (asset detail sheet)**: tapping an asset row opens a bottom sheet with
  the aggregate position (logo, combined balance, USD, unit price), the list of
  underlying instances, and actions — Trade, Transfer, and (when the app gains a
  staking surface) Stake; actions unavailable in the app render disabled/hidden,
  never as dead buttons.
- **FR-025 (wrapped-asset aggregation)**: for Digital Commodities, wrapped forms are
  combined with their underlying asset into one row (e.g. ETH = native ETH + WETH on
  every scanned chain, valued together); the bottom sheet lists each instance's
  balance separately.
- **FR-026 (logos + network badges)**: every asset renders a primary asset logo with
  a small network sub-badge. A native coin on its home network shows the logo only;
  a wrapped or bridged form shows the underlying asset's logo with the hosting
  network's badge (e.g. WETH on Polygon = ETH logo + Polygon badge). Logos are
  bundled with the app (no external image CDNs).
- **FR-027 (instance selection)**: within the bottom sheet the member selects a
  specific instance (chain + form) before invoking Trade/Transfer/other eligible
  operations; the action deep-links to the target surface for that instance's
  network and token.
