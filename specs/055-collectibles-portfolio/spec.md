# Feature Specification: Collectibles Portfolio (Read-Only NFT Display)

**Feature Branch**: `055-collectibles-portfolio`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Read-only NFT collectibles portfolio (OpenSea-backed) as a new tab in the Finance/Trade section. Users with a connected wallet can view the digital asset collectibles (NFTs) they own on Ethereum and Polygon: a grid of owned items (image, name, collection), an item detail view (image, traits, collection floor price, best offer), and a 'View on OpenSea' deep link for trading — no in-app buying, selling, or transfers in this MVP. Collectible value (e.g. collection floor price) is surfaced in the user's portfolio/holdings view alongside token balances. The feature soft-fails to hidden on unsupported chains (e.g. Mordor/ETC) and degrades gracefully (cached/empty state with deep link) when the upstream data source is unavailable. The OpenSea API key must never ship to the client — reads are proxied server-side (relay-gateway pattern) with caching and per-user quotas. Nothing on the wager/pool value path depends on this feature. Based on docs/research/opensea-sdk-nft-trading-analysis.md (Phase 1 recommendation)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See my collectibles in the Finance section (Priority: P1)

A user with a connected wallet on Ethereum or Polygon opens a new **Collectibles** tab in the Finance section and sees a grid of the digital collectibles (NFTs) they own on the active network: each card shows the item's image, its name, and the collection it belongs to. If they own nothing, they see a friendly empty state that explains what the tab is for and links out to the OpenSea marketplace to explore.

**Why this priority**: This is the core value of the feature — visibility of assets the user already owns but currently cannot see anywhere in the app. It is independently shippable: even with no detail view and no portfolio wiring, "see your stuff" is a complete, useful slice.

**Independent Test**: Connect a wallet that owns NFTs on Polygon, open Finance → Collectibles, and confirm the owned items render with image, name, and collection; connect an empty wallet and confirm the empty state renders.

**Acceptance Scenarios**:

1. **Given** a connected wallet that owns collectibles on the active network (Ethereum or Polygon), **When** the user opens the Collectibles tab, **Then** a grid of their owned items is shown with image, name, and collection name for each item.
2. **Given** a connected wallet that owns no collectibles on the active network, **When** the user opens the Collectibles tab, **Then** an empty state is shown explaining the tab and offering a link to explore the external marketplace.
3. **Given** a wallet owning more items than fit on one screen, **When** the user scrolls, **Then** additional items load progressively without blocking the initially visible items.
4. **Given** no wallet is connected, **When** the user opens the Collectibles tab, **Then** they see the standard connect-wallet prompt used elsewhere in the Finance section.
5. **Given** an item whose image cannot be loaded, **When** the grid renders, **Then** a placeholder is shown in place of the image and the item remains selectable.

---

### User Story 2 - Inspect an item and trade it on OpenSea (Priority: P2)

From the grid, the user taps an item to open a detail view showing a larger image, the item's traits/attributes, the collection's floor price, and the current best offer for the item (when one exists). A clearly labeled **"View on OpenSea"** action opens the item's page on the OpenSea marketplace in a new browser context, where the user can trade it. No buying, selling, listing, or transferring happens inside the app.

**Why this priority**: The detail view turns "see your stuff" into "understand what it's worth and act on it" — with the action deliberately delegated to the external marketplace so the app stays read-only.

**Independent Test**: Select an owned item from the grid; confirm traits, floor price, and best offer render (or show honest "unavailable" placeholders), and confirm the deep link opens the correct item page on OpenSea.

**Acceptance Scenarios**:

1. **Given** the user is viewing the grid, **When** they select an item, **Then** a detail view opens showing the item image, name, collection, traits, collection floor price, and best offer where available.
2. **Given** an item with no current offers or no established floor price, **When** the detail view opens, **Then** those fields display an explicit "none yet" / "unavailable" state rather than a misleading zero.
3. **Given** the detail view is open, **When** the user activates "View on OpenSea", **Then** the item's page on the OpenSea marketplace opens in a new browser context, addressing exactly the selected item on the correct network.
4. **Given** any collectible screen, **When** the user looks for buy/sell/list/transfer actions, **Then** none exist in-app — the only trading affordance is the external deep link.

---

### User Story 3 - Collectible value appears in my portfolio (Priority: P3)

The user's existing Portfolio holdings view gains a collectibles line: an estimated total value of their collectibles on the active network (based on collection floor prices), presented alongside token balances and clearly labeled as an estimate. Selecting it navigates to the Collectibles tab.

**Why this priority**: Wires the new asset class into the single place users check their net position. It depends on Story 1's data and is valuable but not essential to a first release.

**Independent Test**: With a wallet owning collectibles that have floor prices, open Portfolio and confirm a labeled, estimated collectibles value appears and navigates to the Collectibles tab; with an empty wallet confirm no collectibles line (or an explicit zero state) appears.

**Acceptance Scenarios**:

1. **Given** a connected wallet owning collectibles with available floor prices, **When** the user opens Portfolio, **Then** an estimated collectibles value appears alongside token balances, explicitly labeled as a floor-price estimate.
2. **Given** some owned items have no floor price, **When** the estimate is computed, **Then** those items are excluded from the total and the label makes clear the estimate covers only priced items.
3. **Given** the collectibles data source is unavailable, **When** the user opens Portfolio, **Then** token balances render normally and the collectibles line shows a stale-or-unavailable state without blocking the page.
4. **Given** the user selects the collectibles line in Portfolio, **When** navigation completes, **Then** they land on the Collectibles tab.

---

### Edge Cases

- **Unsupported network active (e.g. Mordor/ETC)**: the Collectibles tab and the Portfolio collectibles line are hidden entirely — no dead tab, no error. Switching to Ethereum/Polygon reveals them.
- **Upstream marketplace data source unavailable or rate-limited**: previously fetched data is shown with a visible staleness indicator; with no cache, an explicit "temporarily unavailable" state renders with the external marketplace link still offered. The rest of the app is unaffected.
- **Network switch while the tab is open**: displayed items are replaced by the new network's items; data from one network is never shown while another is active.
- **Very large holdings (hundreds of items)**: progressive loading keeps the UI responsive; the portfolio estimate may cover a bounded number of collections and must say so when truncated.
- **Items flagged as spam/suspicious by the data provider**: hidden from the main grid by default behind a "hidden items" toggle so the grid isn't polluted, but still reachable.
- **Both fungible-token-style (multiple copies) and unique items**: items with quantity > 1 display their owned quantity.
- **Provider returns an item with missing metadata (no name/image)**: render with placeholder name (e.g. token identifier) and placeholder image; never crash the grid.
- **Deep link target unavailable** (item not indexed by the marketplace): the link still opens the marketplace's canonical URL for the item; the app makes no promise the marketplace displays it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Finance section MUST offer a new **Collectibles** tab, available when the active network is Ethereum mainnet or Polygon, for any connected wallet (no membership-tier gating).
- **FR-002**: The Collectibles tab MUST display the connected wallet's owned collectibles on the active network as a grid of cards showing item image, item name, and collection name, with progressive loading for large holdings.
- **FR-003**: Selecting an item MUST open a read-only detail view showing the item image, name, collection, traits/attributes, collection floor price, and current best offer, with explicit "unavailable"/"none yet" states when data is missing.
- **FR-004**: Every item detail view MUST provide a "View on OpenSea" action that opens the exact item's page on the OpenSea marketplace for the correct network in a new browser context.
- **FR-005**: The feature MUST be strictly read-only: no in-app buying, selling, listing, offering, or transferring of collectibles, and no signature or transaction prompts anywhere in these views.
- **FR-006**: The Portfolio holdings view MUST include an estimated collectibles value for the active network, derived from collection floor prices, clearly labeled as an estimate, excluding unpriced items, and navigating to the Collectibles tab when selected.
- **FR-007**: On networks where the feature is unsupported (anything other than Ethereum mainnet and Polygon, e.g. Mordor/ETC), the Collectibles tab and the Portfolio collectibles line MUST be hidden entirely (soft-fail, mirroring the callsign-registry pattern).
- **FR-008**: When the upstream data source is unavailable, rate-limited, or slow, the feature MUST degrade gracefully: show cached data with a visible staleness indicator when available, otherwise an explicit unavailable/empty state with the external marketplace link; the rest of the app MUST remain fully functional.
- **FR-009**: Credentials for the external marketplace data provider MUST never be delivered to client devices or committed to the repository; all collectible data reads MUST flow through a FairWins-operated server-side proxy that applies response caching and per-user request quotas.
- **FR-010**: All collectible data MUST be scoped to the active network and the connected wallet; data from one network or wallet MUST never appear while another is active.
- **FR-011**: No wager, pool, payment, or transfer flow may depend on this feature; its complete absence or outage MUST NOT affect any value-path functionality.
- **FR-012**: Items flagged as spam/suspicious by the data provider MUST be hidden from the default grid view but remain accessible via an explicit toggle.
- **FR-013**: Displayed valuations MUST be honest: floor prices and offers carry the currency they are denominated in, estimates are labeled as estimates, and stale data is visibly marked as stale.
- **FR-014**: All new collectible views MUST meet WCAG 2.1 AA (keyboard navigable grid and detail view, alt text or accessible names for item images, sufficient contrast for labels and staleness indicators).

### Key Entities

- **Collectible Item**: a unique or semi-fungible digital asset owned by the wallet — identity (contract + token identifier + network), name, image, traits, owned quantity, spam flag.
- **Collection**: the family an item belongs to — name, image, floor price (and its currency), marketplace link.
- **Item Market Snapshot**: point-in-time market data for an item — best offer (amount + currency), fetched-at time, staleness.
- **Collectibles Valuation**: per-wallet, per-network aggregate — estimated total (floor-price basis), count of priced vs. unpriced items, truncation indicator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with a connected wallet can reach their collectibles grid from anywhere in the Finance section in at most 2 interactions, and the first screen of items renders within 3 seconds on a typical broadband connection.
- **SC-002**: A user can go from opening the Collectibles tab to viewing a specific owned item on the OpenSea marketplace in at most 3 interactions.
- **SC-003**: On unsupported networks, 0 collectibles UI surfaces are visible (tab, portfolio line, or dead links) across all entry points.
- **SC-004**: During a complete upstream outage, 100% of collectible screens show an explicit degraded/unavailable state, and all non-collectible functionality (wagers, pools, payments, portfolio token balances) remains fully usable.
- **SC-005**: No credential for the external data provider is present in any client-delivered asset or repository file (verifiable by inspection/scan), and a single user cannot exhaust shared read capacity for other users.
- **SC-006**: For wallets holding priced collectibles, the Portfolio view shows a collectibles estimate labeled as an estimate in 100% of cases; unpriced items are never silently valued.
- **SC-007**: Wallets holding 200+ items can scroll the full grid without the interface freezing or crashing.

## Assumptions

- **Data provider**: OpenSea is the sole marketplace data source for the MVP, per the Phase 1 recommendation in `docs/research/opensea-sdk-nft-trading-analysis.md`; multi-provider aggregation is out of scope.
- **Networks**: Ethereum mainnet and Polygon mainnet only. Testnets are out of scope for user-facing display; automated tests may simulate the provider.
- **Access**: available to every connected wallet — no membership-tier gate (read-only, no value path exposure). This mirrors the "open" default rather than the Gold-gated callsign model.
- **Valuation basis**: collection floor price is the only valuation input; per-item appraisals, last-sale pricing, and historical charts are out of scope.
- **Asset standards**: both unique and multi-copy collectible standards common on the supported networks are displayed; quantity is shown for multi-copy holdings.
- **No fees**: FairWins charges nothing on this feature; it is pure utility, so no marketplace fee ToS exposure beyond data display and linking (a ToS review of embedding marketplace data happens before launch).
- **Out of scope (deliberately excluded, per research doc)**: in-app trading of any kind, auctions, bundles, drops/minting, real-time push updates, analytics dashboards, collectible send/transfer, and any smart-contract changes — the feature is entirely frontend + server-side proxy.
- **Existing infrastructure reuse**: the FairWins-operated proxy reuses the existing gateway service's operational controls (screening, quotas, killswitch); the Portfolio and Finance-tab navigation patterns already exist and are extended, not redesigned.
- **Spam handling**: provider-supplied spam/suspicious flags are trusted as the default filter; FairWins maintains no independent denylist for the MVP.
