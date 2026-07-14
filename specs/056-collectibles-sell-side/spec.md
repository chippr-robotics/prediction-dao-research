# Feature Specification: Collectibles Sell-Side Trading (Phase 2)

**Feature Branch**: `056-collectibles-sell-side`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Phase 2 sell-side NFT trading for the Collect section (builds on spec 055 read-only collectibles). Let a member with a connected wallet list an owned collectible for sale, cancel a listing they created, and accept the best offer on an owned collectible — all through OpenSea's orderbook, app never custodies the asset or funds, the user's own wallet signs each order, honest fee disclosure before signing, and FairWins configured as the beneficiary of OpenSea's own referral/affiliate reward without increasing what the user pays. Same guardrails as the MVP; passkey sellers supported or honestly disclosed unavailable. Out of scope: buying, offers/bids, auctions, bundles, any FairWins surcharge."

## Clarifications

### Session 2026-07-14

- Q: How should FairWins earn from sell-side trades — referral reward only, or add a FairWins surcharge? → A: Referral/affiliate reward only; **no FairWins surcharge** (confirms FR-013/FR-015 — the reward comes solely from OpenSea's own fee).
- Q: Are passkey smart-account sellers in scope for this phase? → A: **Yes, in scope now** — passkey members sell via contract-based (ERC-1271) order signatures; the honest-"unavailable" state is a per-account fallback only where the marketplace cannot validate a given account's signature, not a blanket passkey exclusion.
- Q: Who can use sell-side trading, and how does gating apply? → A: **Any connected wallet** (no membership-tier gate on selling); membership-tier gating applies only to **gasless/sponsored gas** for a sell-side step (if offered), matching how the app already gates gasless transactions — the user-pays-gas path stays open to all.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - List an owned collectible for sale (Priority: P1)

A member viewing a collectible they own in the Collect section chooses **Sell**, sets a price and currency and an expiry, and is shown — before approving anything — exactly what they will receive if it sells, after the marketplace fee and any creator royalty. They approve the listing with their own wallet (a free signature, no gas), and the item appears as "Listed" with its asking price. The item never leaves their wallet; the listing is an offer to sell that only executes when a buyer fulfills it.

**Why this priority**: Listing is the core of sell-side and the first thing a holder wants to do with an asset they can already see. It is independently valuable and testable on its own: a member can list an item and see it reflected as listed, even before cancel or accept-offer exist.

**Independent Test**: Connect a wallet owning a collectible on Ethereum or Polygon, open its detail view, choose Sell, set a price, confirm the net-proceeds figure matches the marketplace's own calculation, approve, and verify the item shows as Listed at that price.

**Acceptance Scenarios**:

1. **Given** a member owns a collectible on a supported network, **When** they open its detail and choose Sell, **Then** they can enter a price, pick an accepted currency, and choose an expiry.
2. **Given** a member has entered a price, **When** the sell confirmation is shown, **Then** it displays the marketplace fee, any creator royalty, and the resulting net amount the seller will receive — each labeled with its currency and fetched live, not hardcoded — before any approval is requested.
3. **Given** the member approves the listing in their wallet, **When** the approval succeeds, **Then** the listing is published to the marketplace, the item shows as "Listed" with its asking price, and no gas was charged for the listing itself.
4. **Given** the item requires a one-time collection approval before it can be listed, **When** the member lists it for the first time, **Then** the app discloses that a one-time on-chain approval (with gas) is needed and what it authorizes, before requesting it.
5. **Given** the member declines the wallet approval, **When** they cancel out, **Then** no listing is created and nothing is charged.

---

### User Story 2 - Accept the best offer on an owned collectible (Priority: P2)

A member viewing an owned collectible that has a standing offer sees the current **best offer** and, before accepting, exactly what they will receive after fees. They choose **Accept offer**, approve the on-chain fulfillment with their wallet (paying gas, disclosed up front), and the sale settles: the collectible transfers to the buyer and the proceeds arrive in the member's wallet.

**Why this priority**: Accepting an offer is the one sell-side action that completes a sale immediately, and it is where the app can legitimately earn OpenSea's referral reward (the member is the fulfiller). It depends on the read layer for surfacing the best offer but is otherwise independent of listing.

**Independent Test**: With a wallet owning an item that has a live best offer, open its detail, confirm the shown net-to-seller matches the marketplace calculation and that the gas cost is disclosed before approval, accept, and verify the item leaves the wallet and proceeds arrive.

**Acceptance Scenarios**:

1. **Given** an owned collectible has a standing best offer, **When** the member opens its detail, **Then** the best offer amount and currency and the net-to-seller-after-fees are shown honestly (or an explicit "no offers yet" when none exists).
2. **Given** the member chooses Accept offer, **When** the confirmation is shown, **Then** it discloses that accepting is an on-chain transaction that costs gas, and shows the net proceeds, before any approval.
3. **Given** the member approves the fulfillment, **When** it confirms on-chain, **Then** the collectible transfers to the buyer, proceeds arrive in the member's wallet, and the item no longer appears as owned.
4. **Given** the best offer changes or is withdrawn between viewing and accepting, **When** the member tries to accept a stale offer, **Then** the app detects the change and asks them to review the current offer rather than settling at an outdated amount.

---

### User Story 3 - Cancel a listing (Priority: P3)

A member who has listed a collectible can **Cancel** the listing from the item's detail. The app prefers the free (no-gas) cancellation; if only an on-chain cancellation is possible, it discloses the gas cost first. After cancellation the item returns to "Not listed" and is no longer for sale.

**Why this priority**: Cancellation is a necessary safety valve for Story 1 but is not itself a revenue or discovery moment; it can ship after listing and accept-offer.

**Independent Test**: List an item (Story 1), then cancel it; verify it returns to "Not listed" and that a free cancel was used when available, with gas disclosed only when an on-chain cancel is required.

**Acceptance Scenarios**:

1. **Given** a member has an active listing, **When** they open the item detail, **Then** a Cancel action is available.
2. **Given** the member cancels and a free cancellation is available, **When** they approve the cancellation signature, **Then** the listing is removed with no gas charged and the item shows "Not listed".
3. **Given** only an on-chain cancellation is possible, **When** the member cancels, **Then** the gas cost is disclosed and requested before the listing is removed.

---

### Traffic reward (cross-cutting behavior, applies to Stories 1–3)

FairWins is configured as the beneficiary of OpenSea's own referral / affiliate reward so it earns a share of the fee OpenSea already charges on sales that originate from, or are fulfilled through, the app. This reward is attributed automatically as part of publishing a listing and fulfilling an offer. It is surfaced honestly (a brief, plain-language disclosure that FairWins may earn a referral reward from the marketplace on this sale) and, critically, it **never** increases what the buyer pays or reduces what the seller receives beyond the marketplace's own stated fees. If attribution could only be achieved by charging the user, the app forgoes the reward instead.

**Acceptance Scenarios**:

1. **Given** a listing is published or an offer is accepted through the app on a supported network, **When** the order is created/fulfilled, **Then** FairWins is recorded as the marketplace's referral/affiliate beneficiary for that order wherever the marketplace program permits it at no cost to the user.
2. **Given** the net-proceeds figure is shown for a listing or offer, **When** the reward is attributable, **Then** the seller's displayed net proceeds are identical to what they would receive without the reward — the reward changes nothing the seller pays or nets.
3. **Given** attribution on a given order would require a charge to the user, **When** the order is created, **Then** the app publishes the order without the reward rather than passing a cost to the user.

---

### Edge Cases

- **Unsupported network active (e.g. Mordor/ETC)**: no Sell / Accept / Cancel affordances appear — consistent with the Collect tab being hidden there entirely.
- **Passkey smart-account seller**: passkey accounts CAN sell in this phase via contract-based order signatures. The honest-unavailable disclosure is a per-account fallback ONLY where the marketplace cannot validate a specific account's signature (e.g. an unverified account implementation), never a dead button that fails on tap.
- **Marketplace data source unavailable / rate-limited**: sell actions degrade gracefully — the user is told trading is temporarily unavailable and no partial or ambiguous order is created; existing listings still display from cache where possible.
- **Killswitch engaged**: order publication is paused with an honest message; the member can still reach the external marketplace to act directly (never stranded).
- **Fee data cannot be fetched**: the app does NOT let the user sign a listing/acceptance without a fee breakdown — it blocks with an explicit "couldn't confirm fees, try again" rather than guessing or showing a hardcoded number.
- **Price below the fee floor**: if a chosen price would net the seller zero or a negative amount after fees, the app warns before allowing the listing.
- **Stale offer on accept**: covered in Story 2 — a changed/withdrawn best offer is detected and re-confirmed rather than silently settling.
- **Item already listed elsewhere / by another route**: the app reflects the current on-marketplace listing state and does not present a misleading "not listed" when a live listing exists.
- **Currency the marketplace does not accept**: the currency picker only offers currencies the marketplace accepts for that item's network; unsupported currencies are not selectable.
- **Wallet on a different chain than the item**: the app prompts the member to switch to the item's network before signing, and never signs an order bound to the wrong network.

## Requirements *(mandatory)*

### Functional Requirements

**Listing (Story 1)**

- **FR-001**: A member with a connected wallet MUST be able to create a fixed-price listing for a collectible they own on a supported network (Ethereum mainnet or Polygon), specifying price, an accepted currency, and an expiry.
- **FR-002**: Before requesting any approval, the app MUST show the seller the marketplace fee, any creator royalty, and the resulting net proceeds — each with its currency — derived from live marketplace data, never hardcoded.
- **FR-003**: The listing MUST be authorized by the member's own wallet as a gas-free approval; the app MUST NOT custody the collectible or funds at any point.
- **FR-004**: When a one-time on-chain approval is required before an item can be listed, the app MUST disclose that it costs gas and what it authorizes before requesting it.

**Accept offer (Story 2)**

- **FR-005**: A member MUST be able to view the current best offer on an owned collectible (amount, currency, and net-to-seller-after-fees), or an explicit "no offers" state.
- **FR-006**: Accepting an offer MUST disclose, before approval, that it is an on-chain transaction that costs gas and MUST show the net proceeds; the member's own wallet performs the fulfillment.
- **FR-007**: The app MUST detect a best offer that has changed or been withdrawn since it was displayed and re-confirm with the member rather than settling at a stale amount.

**Cancel (Story 3)**

- **FR-008**: A member MUST be able to cancel a listing they created; the app MUST prefer a free (no-gas) cancellation and only use an on-chain cancellation when necessary, disclosing gas first.

**Fee & value honesty (all stories)**

- **FR-009**: The app MUST NOT allow a member to sign a listing or an acceptance when the required fee breakdown cannot be confirmed; it MUST block with an explicit retry instead of guessing.
- **FR-010**: Every displayed monetary value MUST carry its currency, and the net-proceeds figure the app shows MUST equal what the marketplace itself would compute for the same order (no discrepancy the user could be misled by).
- **FR-011**: The app MUST warn a member before listing at a price that would net them zero or a negative amount after fees.

**Traffic reward (cross-cutting)**

- **FR-012**: The app MUST record FairWins as the beneficiary of the marketplace's own referral/affiliate reward on listings created and offers fulfilled through the app, wherever the marketplace's program permits it at no cost to the user.
- **FR-013**: The reward MUST NOT increase what the buyer pays or reduce what the seller receives beyond the marketplace's own stated fees; if attribution would require charging the user, the app MUST forgo the reward and still complete the order.
- **FR-014**: The presence of the reward MUST be disclosed to the member in plain language before they approve an order (a brief "FairWins may earn a referral reward from the marketplace on this sale"), and the disclosure MUST make clear it costs them nothing.
- **FR-015**: The app MUST NOT add any FairWins surcharge or additional fee of its own to any order.

**Guardrails & availability (all stories)**

- **FR-016**: The credentials for the marketplace MUST remain server-side only; no marketplace API key may reach client devices. Order publication and fee/offer reads MUST flow through the FairWins-operated server-side proxy with request quotas and a killswitch.
- **FR-017**: When the killswitch is engaged or the marketplace is unavailable, order publication MUST pause with an honest message; the app MUST always leave the member a path to act directly on the external marketplace (never stranded).
- **FR-018**: On networks where the feature is unsupported, no Sell / Accept / Cancel affordances may appear.
- **FR-019**: Passkey smart-account members MUST be able to list, cancel, and accept offers in this phase using contract-based order signatures. Where the marketplace cannot validate a specific account's signature, the affected action MUST be shown as unavailable with an honest reason (never a dead button) — this fallback applies per-account, not as a blanket passkey exclusion.
- **FR-020**: No wager, pool, payment, or transfer flow may depend on this feature; its complete absence or outage MUST NOT affect any value-path functionality.
- **FR-021**: The app MUST NOT sign an order bound to a network other than the connected wallet's active network; it MUST prompt the member to switch networks first.
- **FR-022**: All new sell-side surfaces MUST meet WCAG 2.1 AA (keyboard-operable price entry and confirmations, accessible names, sufficient contrast, and clear disclosure text).
- **FR-023**: Sell, cancel, and accept-offer MUST be available to any connected wallet with no membership-tier gate. If the app offers to sponsor gas for any sell-side step (e.g. a one-time approval or an offer acceptance), that sponsorship MUST follow the app's existing membership-tier gating for gasless/sponsored transactions; the non-sponsored (user-pays-gas) path MUST remain open to all.

### Key Entities

- **Listing (sell order)**: an owner's offer to sell one owned collectible — item reference (network, collection, token), asking price + currency, expiry, and lifecycle state (active, cancelled, filled, expired). Represents intent; holds no funds and does not move the asset until fulfilled.
- **Best offer**: the highest standing bid on an owned collectible — amount + currency, expiry, and the net-to-seller after fees; may be absent.
- **Fee breakdown**: for a given order, the marketplace fee and any creator royalty, each with amount/rate, currency, and whether it is required — the basis for the net-proceeds figure. Sourced live, never hardcoded.
- **Net proceeds**: the amount the seller receives after all fees for a specific price/offer, in the order's currency — the single honest number shown before signing.
- **Reward attribution**: the record that FairWins is the marketplace's referral/affiliate beneficiary for an order — a reference to the FairWins beneficiary and the attribution source; carries no user cost and holds no funds.
- **Order approval**: the member's wallet authorization for an action (gas-free for listing/cancel, on-chain for accept-offer), including the pre-approval disclosure shown.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can go from viewing an owned collectible to a published listing in at most 4 interactions, and the net-proceeds figure is shown before approval in 100% of listing and accept-offer flows.
- **SC-002**: In 100% of cases, the net-proceeds figure the app shows equals the marketplace's own computed net for the same order (no user-visible discrepancy).
- **SC-003**: In 0% of orders does the FairWins traffic reward increase what the buyer pays or reduce what the seller receives beyond the marketplace's stated fees.
- **SC-004**: Across every entry point, there are 0 dead sell-side buttons — on unsupported networks, unsupported account types, killswitch, or outage, the affordance is either hidden or shown disabled with an honest reason, and a path to act on the external marketplace remains.
- **SC-005**: The feature never custodies a member's asset or funds — 100% of value transfer is wallet-to-marketplace-to-wallet, verifiable by the member's wallet being the only signer.
- **SC-006**: No marketplace credential appears in any client-delivered asset or repository file (verifiable by inspection), and a single member cannot exhaust shared marketplace capacity for others.
- **SC-007**: FairWins is recorded as the marketplace reward beneficiary on at least 95% of eligible orders created or fulfilled through the app on supported networks (the remainder being cases where attribution would have cost the user and was correctly forgone).
- **SC-008**: The app blocks signing in 100% of cases where the fee breakdown could not be confirmed, rather than showing a guessed or hardcoded fee.
- **SC-009**: A passkey smart-account member can complete a listing and an offer acceptance on a supported network; only where the marketplace cannot validate their account's signature do they instead see an honest unavailable state — never a failed action.

## Assumptions

- **Builds on spec 055**: reuses the Collect section, the server-side marketplace proxy, network-capability gating, honest-state and soft-fail conventions, and the item detail surface. This phase adds write actions (listing, cancel, accept-offer) and the reward configuration; it does not redesign the read layer.
- **Marketplace**: OpenSea is the sole marketplace, consistent with the MVP and `docs/research/opensea-sdk-nft-trading-analysis.md` (Phase 2). Orders are posted to OpenSea's orderbook; settlement is on OpenSea's shared on-chain protocol, so the app can censor (refuse to publish) but never steal or strand.
- **Networks**: Ethereum mainnet and Polygon mainnet only, matching the MVP's supported set.
- **Signing model**: listing and cancellation are gas-free wallet approvals (typed-data signatures); accepting an offer is an on-chain transaction the member pays gas for. This is the first Collect surface that requests a signature; the underlying signature standard and order protocol are OpenSea's (Seaport), treated here as the marketplace's mechanism rather than a FairWins design choice.
- **Reward mechanism**: OpenSea's own programs are the source of the reward — the referrer credit paid from OpenSea's fee on fulfillments (the member is the fulfiller when accepting an offer) and affiliate attribution on listings where OpenSea's affiliate program permits it. The reward comes out of OpenSea's fee share, not the user's proceeds. The exact affiliate-program terms and whether attaching FairWins as affiliate on API-created listings requires a formal OpenSea agreement are a dependency to confirm during planning; the requirement holds regardless: attribute at no cost to the user, or forgo it.
- **Reward beneficiary**: a single FairWins-controlled beneficiary reference (per network as needed) is configured server-side; the app holds no reward funds and makes no on-chain claim in this phase — attribution is what OpenSea's program records.
- **Currencies**: the currency picker is limited to currencies OpenSea accepts for the item's network (e.g. the network's native/wrapped token and USDC); the app does not invent currency support.
- **Passkey support (in scope this phase)**: passkey smart accounts sell via contract-based (ERC-1271) order signatures. Planning MUST verify OpenSea's orderbook validates our account implementation's signatures; the honest-unavailable fallback (FR-019) covers only account/network combinations where validation cannot be confirmed, so the feature never ships a dead button.
- **Access & gating**: selling is open to any connected wallet with no membership-tier gate, consistent with the read-only MVP. Membership-tier gating applies only to gasless/sponsored gas for a sell-side step (if the app offers to sponsor it), matching how the app already gates gasless transactions; the user-pays-gas path is always available to everyone.
- **No custody, no surcharge, read-only-plus**: the app never holds the asset or funds and never adds its own fee (FR-015). Its economic interest is solely the marketplace's referral/affiliate reward.
- **ToS**: publishing to OpenSea's orderbook and participating in its referral/affiliate program are governed by OpenSea's terms; a terms review of the reward configuration happens before launch.
- **Out of scope (deliberately excluded)**: buying/fulfilling arbitrary listings (Phase 3), creating offers/bids or collection offers, auctions, Dutch auctions, bundles, cross-listing to other marketplaces, any FairWins surcharge, and any on-chain FairWins contract changes — this phase is frontend + the existing server-side proxy only.
