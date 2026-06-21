# Feature Specification: Gift & Resell Memberships via Redeemable Voucher NFTs

**Feature Branch**: `claude/transferable-memberships-ch3hlw`

**Created**: 2026-06-20

**Status**: Draft

**Input**: User description: "Gift and resell memberships via redeemable voucher NFTs. Members can acquire a wager-participant membership through one of two parallel rails, both ending in the same soulbound, time-bound membership the platform already issues today: (1) the existing direct USDC purchase (unchanged), or (2) by redeeming a transferable voucher NFT. A voucher is an ERC-721 token, minted for USDC at a chosen tier, that confers NO membership rights and carries no clock until redeemed — it exists purely to be held, gifted, or resold on the secondary market. When a holder redeems a voucher, it is burned and a soulbound membership of the voucher's tier is written to the redeemer's address, starting the membership clock at that moment."

## Overview

Today a wager-participant membership can only be acquired by the person who will use it: the buyer pays USDC directly and a **soulbound, time-bound** membership is written to their own address. There is no way to buy a membership as a gift, hold it for later, or resell one you no longer want.

This feature adds a **second acquisition rail** alongside the existing direct purchase — a **transferable voucher**. A voucher is a freely tradable token that represents *the right to claim* a membership of a specific tier. It is **not** a membership: it grants no access, carries no usage limits, and starts no clock. It exists to be **held, gifted, or resold** on the open secondary market. Only when a holder **redeems** it does the voucher burn and a normal soulbound membership of that tier appear at the redeemer's address, with the membership clock starting at the moment of redemption.

The two rails converge on the *same* membership the platform issues today, so everything downstream — how `WagerRegistry` reads membership, usage limits, tiers, expiry — is unchanged. The existing direct-USDC purchase path is untouched and remains available.

Two properties make this design deliberately conservative:

- **Compliance stays at the point of use.** Sanctions screening and Terms acceptance happen at **redemption**, on the **redeemer** — the same control point and obligations that govern direct purchase today. A voucher in someone's wallet confers no standing until it is redeemed and the redeemer passes screening.
- **Privacy is honest, not magical.** Because the membership is soulbound to whoever redeems, a holder may redeem to a **fresh wallet** that is not linked to the wallet that bought or traded the voucher. This breaks the on-chain link between trading activity and membership/wagering activity at the level of *pseudonymity* — not cryptographic unlinkability. Voucher mints, transfers, and burns are inherently public on-chain, and the product must say so plainly rather than imply privacy it does not deliver.

This feature is funds-adjacent (vouchers are minted for USDC) and access-control-adjacent (redemption grants membership standing), so it is governed by Constitution Principle I.

## Clarifications

### Session 2026-06-20

- Q: Does minting a voucher cost the same as buying the membership directly? → A: **Yes.** A voucher of a given tier is minted for that tier's configured USDC price, so neither rail is cheaper than the other and there is no mint-vs-purchase arbitrage. The mint fee accrues to the platform exactly like a direct purchase.
- Q: Do vouchers themselves expire if never redeemed? → A: **No.** A voucher is a clean bearer instrument with no expiry; only the *membership* is time-bound, and its clock starts at redemption. An unredeemed voucher can be held indefinitely.
- Q: What if the redeemer's address already holds an active membership for that role? → A: **Redemption is rejected** for an address that already has an active membership of that role, mirroring the existing direct-purchase behavior (which rejects a second active purchase). The holder can redeem to a different/fresh address (which also serves the privacy goal) or wait until the existing membership lapses. Stacking/extension via voucher is out of scope for v1.
- Q: Who is sanctions-screened on the voucher rail? → A: **The redeemer only**, at redemption, fail-closed. Voucher minters and buyers are deliberately **not** screened — an explicitly accepted tradeoff (a sanctioned party could profit from reselling a voucher without ever redeeming). Screening at the point membership standing is granted preserves the existing non-bypassable control.
- Q: What tier does a voucher grant if tier configuration changes between mint and redemption? → A: **The tier the voucher was minted for**, unconditionally. The voucher records its tier at mint and is a bearer claim on *that* tier, independent of later price/limit/active-state changes to tier configuration.
- Q: How is resale royalty handled? → A: **Best-effort EIP-2981 metadata hint only** — a flat, capped royalty advertised to marketplaces and routed to the treasury. No enforced-royalty, allowlisted-operator, or platform-run marketplace mechanism, so open-marketplace composability and trading privacy are preserved.
- Q: What flat resale royalty rate and hard ceiling? → A: **2.5% advertised rate, with a 5% hard ceiling** enforced by the contract — an admin may configure the rate up to but never above 5%. The conservative rate keeps the utility (not appreciating-asset) framing defensible.
- Q: Can a minter get a primary refund before redeeming? → A: **No primary refund.** A minted voucher's value is recovered only by reselling it on the secondary market or by redeeming it. This matches the existing direct-purchase rail (no refund) and avoids any refund/treasury-clawback accounting.

### Session 2026-06-20 (round 2)

- Q: Does a voucher bind to a role, or just a tier? → A: **Each voucher binds an explicit `(role, tier)` pair** and redemption grants that role+tier. This mirrors the role-generic `MembershipManager` so future paid roles need no token redesign; the only paid role today is `WAGER_PARTICIPANT_ROLE`.
- Q: When are voucher mint proceeds recognized as treasury revenue? → A: **At mint.** Proceeds accrue and are withdrawable immediately, identical to a direct purchase; no escrow is held until redemption. Granting a membership at redemption has zero marginal on-chain cost, so no escrow/solvency reserve is required.
- Q: Where does voucher display metadata (`tokenURI`) come from? → A: **Generated fully on-chain** (self-contained JSON + SVG rendering the `(role, tier)`), with no off-chain/IPFS pinning dependency. Keeps a value-bearing token self-contained and censorship-resistant; IPFS in this repo is reserved for *encrypted* per-wager data, not public marketplace art.

### Session 2026-06-21 (batch & gift convenience)

- Q: How do "buy a quantity" and "gift directly to an address" work given the voucher mints exactly one token to the caller and is immutable? → A: Via a **separate, immutable, custody-free helper** (`VoucherBatchMinter`), not by changing the voucher. The helper pulls exactly `quantity × price` from the buyer, mints the batch, and forwards every voucher to the recipient in the same transaction (one approval, one confirmation). It holds no funds/NFTs at rest, resets its allowance, is atomic, has no admin/withdrawal/upgrade path, and caps a batch at **50**. (FR-001a–FR-001c.)
- Q: Is the helper required for the voucher rail to work? → A: **No — it is additive.** When the helper is not deployed on a network, single self-purchase still works via the direct voucher mint, and the quantity/gift UI degrades to an honest "not available on this network yet" notice. (FR-001d.)
- Q: How does the redeem UI find which vouchers a wallet holds? → A: The user **picks from a list** of held vouchers (no token-id typing), derived from a **bounded** `Transfer`-log scan from the voucher's recorded deploy block (never genesis, per #703/#704) with current-ownership confirmation, and an honest empty state. The voucher subgraph (spec 026 indexing) can supersede the scan once relied upon. (FR-011a.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Buy a membership voucher and gift or resell it (Priority: P1)

A person buys a voucher for a chosen tier by paying that tier's USDC price. The voucher lands in their wallet as a transferable token that grants no membership and starts no clock. They can keep it, send it to a friend as a gift, or list it for resale on any standard NFT marketplace. A flat royalty is advertised to marketplaces and, where honored, routed to the platform treasury.

**Why this priority**: This is the new capability's foundation — without a tradable voucher there is nothing to gift, resell, or redeem. It delivers standalone value (gifting and a liquid secondary market) and is the prerequisite for redemption.

**Independent Test**: On a test network, mint a voucher for each tier by paying the tier price; confirm the token appears in the buyer's wallet, confers no membership (`hasActiveRole` stays false), transfer it to a second wallet, resell it to a third, and confirm the EIP-2981 royalty hint is exposed and points to the treasury.

**Acceptance Scenarios**:

1. **Given** a buyer holding sufficient USDC, **When** they mint a voucher for a tier at that tier's configured price, **Then** a transferable voucher token of that tier is issued to them and the paid USDC accrues to the platform exactly as a direct purchase would.
2. **Given** a freshly minted voucher, **When** anyone inspects the holder's membership standing, **Then** the holder has **no** membership, no usage allowance, and no started clock attributable to the voucher.
3. **Given** a voucher holder, **When** they transfer or resell the voucher to another address, **Then** the new holder holds the voucher and the prior holder no longer does, with no membership created by the transfer.
4. **Given** a voucher listed on a standard marketplace, **When** the marketplace queries royalty information, **Then** a flat, capped royalty payable to the treasury is reported (best-effort; not enforced on-chain).

---

### User Story 2 - Redeem a voucher into a soulbound membership (Priority: P1)

A voucher holder redeems it. The voucher is burned and a soulbound, time-bound membership of the voucher's tier is written to the redeemer's address, with the clock starting now. The redeemer is sanctions-screened and records Terms acceptance at this moment — the same obligations a direct purchaser meets. From then on the redeemer has a membership indistinguishable from one bought directly.

**Why this priority**: This is the headline — it is what makes a voucher worth anything and what converts the tradable instrument into actual access. It is the convergence point of the two acquisition rails.

**Independent Test**: Starting from a held voucher, redeem it from an eligible address; confirm the voucher is burned, a membership of the correct tier exists at the redeemer with a fresh expiry and reset usage counters, Terms acceptance is recorded for the redeemer, and the membership behaves identically to a directly purchased one for wager creation/acceptance.

**Acceptance Scenarios**:

1. **Given** an eligible holder of a tier-X voucher with no active membership for the role, **When** they redeem it, **Then** the voucher is burned and a soulbound tier-X membership is written to the redeemer with the clock starting at redemption and usage counters reset.
2. **Given** a redeemed membership, **When** the redeemer creates or accepts a wager, **Then** the membership gates and limits behave identically to a membership bought via the direct USDC rail.
3. **Given** tier configuration changed (price/limits/active state) after the voucher was minted, **When** the voucher is redeemed, **Then** it grants the tier it was minted for, unaffected by the later configuration change.
4. **Given** a successful redemption, **When** the resulting membership is inspected, **Then** the redeemer's Terms acceptance is recorded by the membership authority, equivalent to the direct-purchase obligation.

---

### User Story 3 - Redeem privately to a fresh, unlinked wallet (Priority: P2)

A holder who values privacy redeems the voucher into a **new wallet** that is not linked to the wallet that bought or traded it. The resulting membership — and the wagering it enables — is not on-chain-linked to the holder's trading history. The redemption path carries no back-reference to the voucher's purchase/transfer chain, and is designed so that a future optional relayer/sponsor can pay gas so even the gas-payer need not reveal the trading wallet. The product discloses honestly that this provides pseudonymity, not cryptographic unlinkability.

**Why this priority**: Privacy preservation is a stated requirement for this feature and a differentiator, but it layers on top of the core redemption (US2) rather than being required for a functional MVP.

**Independent Test**: Redeem a voucher from a fresh wallet that received it by transfer; confirm the resulting membership record contains no on-chain reference tying it back to the minting/selling wallet, and that the redemption succeeds without requiring the redeemer to be the original minter. Confirm the UI states the privacy level honestly.

**Acceptance Scenarios**:

1. **Given** a voucher transferred to a fresh wallet, **When** that wallet redeems it, **Then** redemption succeeds without requiring any relationship to the minting or selling wallet.
2. **Given** a completed redemption, **When** the resulting membership and its on-chain record are inspected, **Then** they contain no stored back-reference to the voucher's purchase or transfer history.
3. **Given** the redemption flow in the app, **When** a user views privacy guidance, **Then** the UI states plainly that mints/transfers/burns are public and that redeeming to a fresh wallet provides pseudonymity, not cryptographic unlinkability — never implying stronger privacy than is delivered.
4. **Given** the redemption capability, **When** it is designed, **Then** it admits an optional future relayer/sponsor paying gas on the redeemer's behalf without redesign (no requirement that the redeemer's wallet pays gas).

---

### User Story 4 - Compliance gating and failure resilience at redemption (Priority: P2)

The redemption gate fails closed for a sanctioned/blocked redeemer, and a blocked or otherwise failed redemption leaves the voucher intact and re-tradable so a legitimate buyer is never punished for a bad reseller.

**Why this priority**: This hardens the headline capability for the platform's compliance posture and protects honest secondary-market participants. It is secondary because it guards US2 rather than delivering the core flow.

**Independent Test**: Attempt redemption from a blocked address (must fail and leave the voucher unburned and still owned by the holder); confirm a subsequent legitimate buyer of that same voucher can redeem successfully; confirm no membership is created and no funds move on a failed redemption.

**Acceptance Scenarios**:

1. **Given** a redeemer address that is sanctioned/blocked, **When** they attempt to redeem a voucher, **Then** the redemption is rejected, no membership is granted, and the voucher is **not** burned or refunded — it remains owned and re-tradable.
2. **Given** a redeemer that already holds an active membership for the role, **When** they attempt to redeem, **Then** the redemption is rejected and the voucher remains intact.
3. **Given** a voucher that previously failed redemption, **When** it is sold to a different, eligible buyer who redeems it, **Then** redemption succeeds normally.
4. **Given** the platform's compliance record, **When** screening is applied, **Then** it is applied to the redeemer at redemption (fail-closed) and **not** to voucher minters or buyers — the residual that a sanctioned party may profit from reselling is an explicitly recorded, accepted tradeoff.

---

### Edge Cases

- **Redeeming with an active membership**: rejected; the holder redeems to another/fresh address or waits for the current membership to lapse (no stacking/extension in v1).
- **Blocked redeemer**: redemption reverts fail-closed; the voucher is preserved (not burned, not refunded) and remains tradable. The revert reveals the address was screened — accepted, consistent with the existing on-chain screening posture.
- **Tier deactivated or repriced after mint**: the voucher still grants the tier it was minted for; configuration changes do not retroactively alter outstanding vouchers.
- **Voucher held indefinitely**: vouchers do not expire; an old voucher redeems to a full-duration membership starting at redemption.
- **Double-redeem / redeem-after-burn**: a burned voucher cannot be redeemed again; redemption is single-use and atomic with the burn.
- **Royalty ignored by a marketplace**: acceptable and expected — the royalty is a best-effort hint; the platform earns reliably only on the primary mint.
- **Minter's remorse / no primary refund**: a minter who changes their mind has no refund path; they recover value by reselling the voucher or by redeeming it. A holder may voluntarily destroy (burn) their own voucher, forfeiting its value.
- **Direct-purchase rail unaffected**: existing direct USDC purchases, upgrades, extensions, grants, and revokes behave exactly as today; the voucher rail is additive.
- **Gifting to a wallet with no key registered / no Terms history**: the recipient completes screening and Terms acceptance at redemption, so a gift recipient with no prior platform history can still redeem.
- **Membership downstream behavior**: a redeemed membership participates in wager creation/acceptance, usage limits, expiry, and revocation identically to a directly purchased one; `WagerRegistry` requires no awareness of how the membership was acquired.

## Requirements *(mandatory)*

### Functional Requirements

#### Acquisition & minting (voucher rail)

- **FR-001**: The system MUST let anyone mint a voucher for any active `(role, tier)` by paying that tier's configured USDC price, issuing a transferable token that records the `(role, tier)` pair it was minted for. (The only paid role today is the wager-participant role; the design is role-generic.)
- **FR-002**: A voucher MUST confer **no** membership standing, usage allowance, or started clock while held — inspecting the holder's membership MUST show no membership attributable to the voucher.
- **FR-003**: A voucher MUST be freely transferable and resellable on standard secondary markets, with transfers creating no membership and requiring no platform involvement.
- **FR-004**: USDC paid to mint a voucher MUST accrue to the platform/treasury on the same basis as a direct membership purchase (no cheaper rail, no arbitrage between rails), recognized **at mint** (immediately withdrawable, no escrow held until redemption).
- **FR-005**: Vouchers MUST NOT expire; an unredeemed voucher remains valid indefinitely until redeemed or destroyed by its owner.
- **FR-005a**: The system MUST NOT offer a primary refund of mint proceeds; a holder recovers value only by reselling on the secondary market or by redeeming. No refund or treasury-clawback path is provided.
- **FR-005b**: Each voucher's display metadata (`tokenURI`) MUST be generated fully on-chain (self-contained JSON + SVG reflecting the voucher's `(role, tier)`), with no off-chain or IPFS pinning dependency.

#### Batch & gift acquisition (convenience helper)

- **FR-001a**: The system MUST let a buyer mint **a quantity** of vouchers of the same `(role, tier)` in a single transaction — one USDC approval and one wallet confirmation — charging exactly `quantity × price` and issuing all of them. A per-transaction quantity cap MAY bound gas (currently **50**).
- **FR-001b**: The system MUST let a buyer direct the freshly minted vouchers to **any recipient address** (a direct gift) within the same minting transaction, so gifting does not require a separate transfer step. The recipient MUST be non-zero.
- **FR-001c**: Because the voucher contract is immutable and mints exactly one token **to the caller**, the batch/gift capability MUST be provided by a **separate, immutable helper** rather than by changing the voucher. The helper MUST be **custody-free**: pull exactly `quantity × price` from the buyer, forward every minted voucher to the recipient within the same transaction, hold no USDC or NFTs at rest, reset any allowance it grants, and be **atomic** (any failed mint reverts the whole batch). It MUST have no admin, no withdrawal path, and no upgradeability — matching the voucher's own minimal-surface rationale.
- **FR-001d**: The batch/gift helper MUST be **optional and additive**: when it is not deployed on a network, single self-purchase MUST still work via the direct voucher mint, and the quantity/gift UI MUST degrade to an honest "not available on this network yet" state rather than erroring.

#### Redemption (membership grant)

- **FR-006**: A voucher holder MUST be able to redeem a voucher, which atomically **burns** the voucher and writes a **soulbound** membership of the voucher's `(role, tier)` to the redeemer's address.
- **FR-007**: On redemption the membership clock MUST start at the moment of redemption (full tier duration) and usage counters MUST be reset, identical to a fresh direct purchase.
- **FR-008**: A redeemed membership MUST be indistinguishable downstream from a directly purchased membership of the same tier — `WagerRegistry` and all membership reads (active status, tier, usage limits, expiry, revocation) MUST behave identically regardless of acquisition rail.
- **FR-009**: A voucher MUST grant the `(role, tier)` it was minted for, unaffected by any later change to that tier's price, limits, or active state.
- **FR-010**: Redemption MUST be single-use: a burned voucher MUST NOT be redeemable again, and no redemption may grant more than one membership.
- **FR-011**: Redemption MUST be rejected if the redeemer's address already holds an active membership for the role (no stacking/extension in v1), leaving the voucher intact.
- **FR-011a**: The redemption UI MUST let a holder **pick a voucher to redeem from their on-chain holdings** (no manual token-id entry) and MUST show an honest empty state when the wallet holds none. Until the voucher subgraph is relied upon, holdings discovery MUST use a **bounded** `Transfer`-log scan from the voucher's recorded deploy block (never a genesis scan), confirming current ownership before offering a voucher as redeemable.

#### Compliance

- **FR-012**: Redemption MUST sanctions-screen the **redeemer** at redemption and MUST **fail closed** — a blocked/sanctioned redeemer's redemption is rejected and grants no membership, consistent with the platform's existing non-bypassable screening control.
- **FR-013**: Redemption MUST capture and record the **redeemer's** Terms acceptance at redemption, recorded by the membership authority, equivalent to the obligation met on direct purchase.
- **FR-014**: Voucher minting and voucher transfers/resales MUST NOT be sanctions-screened; the system's screening control point for the voucher rail is redemption only. The residual risk (a sanctioned party profiting from voucher resale without redeeming) MUST be documented as an accepted tradeoff.

#### Failure handling

- **FR-015**: A failed or rejected redemption (e.g., blocked redeemer, already-active membership) MUST NOT burn or refund the voucher — the voucher MUST remain owned by its holder and remain re-tradable, so a later eligible buyer can redeem it.
- **FR-016**: A failed redemption MUST move no funds and create no membership (all-or-nothing).

#### Privacy

- **FR-017**: Redemption MUST succeed for any eligible holder regardless of whether they are the original minter, so a holder can redeem from a fresh wallet unlinked to the buying/trading wallet.
- **FR-018**: The membership record produced by redemption MUST NOT store any on-chain back-reference to the voucher's purchase or transfer history (no link from the membership back to the minting/selling wallet).
- **FR-019**: The redemption capability MUST be designed to permit an **optional** future relayer/sponsored-gas flow (the redeemer's own wallet need not be the gas payer) without requiring redesign of the redemption interface.
- **FR-020**: The user-facing redemption flow MUST disclose honestly that voucher mints, transfers, and burns are public on-chain and that fresh-wallet redemption provides pseudonymity, not cryptographic unlinkability — never implying stronger privacy than delivered.

#### Economics & royalty

- **FR-021**: The voucher MUST advertise a flat resale royalty (best-effort, via standard marketplace royalty metadata) payable to the treasury, defaulting to **2.5%**; the system MUST NOT rely on enforced royalties, allowlisted operators, or a platform-run marketplace.
- **FR-021a**: The royalty rate MUST be admin-configurable but the contract MUST enforce a **hard ceiling of 5%** — any attempt to set a rate above 5% MUST be rejected.
- **FR-022**: Voucher pricing/marketing MUST present the voucher as access utility (a claim on membership), not as an investment or appreciating asset.

#### Integration & non-regression

- **FR-023**: The existing direct-USDC purchase/upgrade/extend/grant/revoke paths MUST remain unchanged and fully functional; the voucher rail is strictly additive.
- **FR-024**: Adding the redemption capability to the membership authority MUST be an **additive, append-only** change to its persistent state and external interface (no reordering/removal of existing state or breaking of existing function/event/error signatures).
- **FR-025**: Granting membership via redemption MUST NOT require handing any contract broad membership-granting authority beyond what is necessary to write a redeemed membership (least privilege).

#### Observability & operations

- **FR-026**: Voucher minting, redemption (burn + grant), and royalty configuration MUST be observable on-chain (events) and surfaced to the frontend/subgraph via the project's generated sync artifacts (never hand-copied addresses/ABIs).
- **FR-027**: The feature MUST be validated on the testnet (Amoy) and pass the full existing membership and wager test suites with no regression before any mainnet (Polygon) rollout.

### Key Entities *(include if feature involves data)*

- **Membership Voucher**: A transferable, non-expiring token representing the right to claim a membership of a specific `(role, tier)`. Records its `(role, tier)` pair at mint; confers no membership while held; single-use (burned on redemption). Freely giftable and resellable.
- **Voucher Batch Minter (helper)**: An immutable, custody-free helper contract that mints a quantity of vouchers of one `(role, tier)` and forwards them all to a recipient address in a single transaction. Pulls exactly `quantity × price` from the buyer, holds no funds or NFTs at rest, resets its own allowance, is atomic, and bounds each batch by a per-transaction quantity cap. No admin, no withdrawal path, no upgradeability. Strictly additive — single self-mint works without it.
- **Redemption**: The act of burning a voucher to write a soulbound membership of the voucher's tier to the redeemer, gated by sanctions screening and Terms acceptance, with the clock starting at redemption.
- **Membership** (existing): The soulbound, time-bound, address-keyed access record the platform already issues (tier, expiry, usage counters). Unchanged; produced identically by both acquisition rails.
- **Tier** (existing): The configured membership level (Bronze/Silver/Gold/Platinum) with its USDC price, duration, and usage limits. A voucher binds to a tier at mint.
- **Royalty Configuration**: The flat, best-effort resale royalty rate (default 2.5%, admin-configurable up to a 5% hard ceiling) and the treasury recipient advertised to marketplaces.
- **Redeemer / Holder**: The address that owns a voucher (holder) and the address that claims the membership (redeemer) — which may deliberately differ for privacy.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person can buy a voucher and gift it such that a *different* person ends up with a working membership — completing the buy → transfer → redeem journey end-to-end on a test network.
- **SC-002**: A held voucher confers **zero** membership standing: in 100% of checks before redemption, the holder shows no active membership, no usage allowance, and no started clock from the voucher.
- **SC-003**: A redeemed membership is functionally identical to a directly purchased one: 100% of existing membership and wager-gating behaviors produce the same outcomes regardless of acquisition rail (verified by running the existing suites against both rails).
- **SC-004**: 100% of redemptions by a sanctioned/blocked redeemer are rejected (fail-closed) with no membership granted and the voucher preserved.
- **SC-005**: 100% of redemptions record the redeemer's Terms acceptance at redemption.
- **SC-006**: A voucher that fails redemption remains owned and re-tradable, and a subsequent eligible buyer can redeem it successfully — demonstrated end-to-end.
- **SC-007**: A voucher redeemed from a fresh wallet yields a membership whose on-chain record contains no stored link back to the minting/selling wallet (verified by inspecting the record).
- **SC-008**: The existing direct-purchase rail and the full existing test suite pass with **zero regression** after the feature is added.
- **SC-009**: The resale royalty is exposed to marketplaces via standard royalty metadata pointing at the treasury, at a flat 2.5% rate, in 100% of voucher tokens; any configuration attempt above the 5% hard ceiling is rejected 100% of the time.
- **SC-010**: Every voucher mint and redemption is observable on-chain and reflected in the frontend/subgraph via generated sync artifacts (no hand-copied addresses/ABIs).
- **SC-011**: A buyer can mint a quantity (up to the cap) of one tier and gift them all to a recipient in a **single** transaction; after it, the buyer paid exactly `quantity × price`, the recipient holds exactly that many vouchers, and the helper holds **zero** USDC, NFTs, and residual allowance (verified on a test network).
- **SC-012**: With the helper undeployed on a network, single self-purchase still succeeds and the quantity/gift UI shows an honest "not available yet" state — no error and no broken flow.
- **SC-013**: The redeem flow lists a wallet's held vouchers for selection (no token-id entry) and shows an honest empty state when there are none.

## Assumptions

- **Membership semantics unchanged**: the redeemed membership reuses the existing soulbound, time-bound, address-keyed model (tiers None/Bronze/Silver/Gold/Platinum, USDC pricing, rolling-window usage limits). This feature adds an acquisition rail, not a new membership type.
- **Voucher pricing equals tier price**: minting a voucher costs the tier's configured USDC price, so neither rail is cheaper; mint proceeds accrue like a direct purchase.
- **No voucher expiry; membership clock starts at redemption**: vouchers are bearer instruments with no expiry.
- **Redeemer-only screening**: sanctions screening and Terms acceptance occur at redemption on the redeemer, fail-closed; minters/buyers are not screened (accepted tradeoff).
- **Best-effort royalty only**: a flat EIP-2981-style royalty hint to the treasury (default 2.5%, admin-configurable up to a 5% hard ceiling), with no enforced-royalty/allowlist/platform-marketplace mechanism, preserving open-market composability and privacy.
- **Pragmatic privacy, no zero-knowledge**: privacy is achieved by fresh-wallet redemption (pseudonymity) with an optional future relayer; cryptographic/zero-knowledge unlinkability is explicitly out of scope.
- **Networks**: the voucher rail (voucher + redemption + the batch/gift helper) is deployed feature-complete on the testnets **Amoy (80002)** and **Mordor/ETC (63)**; Polygon mainnet (137) follows once its UUPS migration lands. (Mordor is no longer legacy read-only — it runs the full upgradeable v2 set.)

## Dependencies

- **Feature 025 / PR #724 (Upgradeable WagerRegistry → generic UUPS primitives)**: this feature relies on the generic upgradeability machinery that 025's plan is to produce — append-only storage-layout compatibility check, floppy-keystore-gated upgrade authorization, one-time initializer, and proxy+implementation deploy/sync tooling. 025 (WagerRegistry) remains the first adopter and proof of that pattern.
- **Sibling: "Upgradeable MembershipManager" migration**: a separate spec that brings the membership authority under the same UUPS proxy pattern (behavior-neutral cutover; coexistence/settle-only legacy, which drains quickly because memberships are 30-day time-bound). This feature's redemption capability is intended to ship as the **first in-place, additive (append-only) upgrade** of the membership proxy — no membership redeploy, no state migration, no broad membership-granting role grant.
- **New voucher token contract**: the transferable voucher is a new token contract; the existing direct-USDC purchase path is unchanged and remains a parallel rail.

## Out of Scope

- Zero-knowledge / cryptographic unlinkability of redemption.
- Enforced royalties, allowlisted operators, or a platform-operated secondary marketplace.
- Trading or transferring **live** (already-redeemed) memberships — the membership remains soulbound; only vouchers trade.
- Screening of voucher minters or buyers (screening is redeemer-only at redemption).
- Stacking or extending an existing active membership via voucher redemption.
- The upgradeable-proxy migration of the membership authority itself (separate sibling spec) and the generic UUPS proxy primitives (feature 025 / PR #724).
