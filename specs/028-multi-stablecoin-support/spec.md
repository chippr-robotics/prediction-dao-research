# Feature Specification: Multi-Stablecoin Support

**Feature Branch**: `claude/multi-stablecoin-support-rq2baj`

**Created**: 2026-06-22

**Status**: Draft

**Input**: User description: "we need the ability to support other stablecoins on the platform. usdc will still be the default choice. Members will need the ability to select and deselect their default and visible stablecoins in the preferences tab of the 'my account' view. We need to allow all major stablecoins which are deployed on polygon mainnet on the platfom. we should include non us dollar backed stable coins as well. we will only include stable coins which would be allowed under genius act."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stake and settle wagers in a non-default stablecoin (Priority: P1)

A member wants to create a wager denominated in a stablecoin other than USDC (for example, a euro-backed stablecoin or USDT). When creating a wager, they pick the stablecoin from the set of platform-supported, member-visible stablecoins, set the stake amount in that stablecoin, and invite an opponent. The opponent accepts by staking the same stablecoin, and the eventual payout, refund, or draw settlement happens in that same stablecoin.

**Why this priority**: This is the core value of the feature — without the ability to actually escrow and settle a wager in another stablecoin, a token picker is cosmetic. It delivers a usable MVP on its own (USDC remains available as the default, plus at least one additional supported stablecoin).

**Independent Test**: Create, accept, and resolve a wager denominated in a supported non-USDC stablecoin; confirm stakes are escrowed and the winner is paid out in that same stablecoin with the correct amounts (accounting for that token's decimals).

**Acceptance Scenarios**:

1. **Given** a member viewing the wager-creation flow, **When** they open the stablecoin selector, **Then** they see USDC plus every other platform-supported stablecoin they have marked visible, with USDC pre-selected as the default.
2. **Given** a member has selected a supported euro-backed stablecoin and entered a stake, **When** they create the wager, **Then** the wager is denominated in that stablecoin and the stake amount is escrowed in that token.
3. **Given** an opponent accepts a wager denominated in a non-USDC stablecoin, **When** they confirm, **Then** they stake the same stablecoin and the same amount, and the wager becomes active.
4. **Given** a resolved non-USDC wager, **When** the winner claims, **Then** they receive the pooled stake in the wager's stablecoin, displayed with the correct symbol and decimal precision.
5. **Given** a member attempts to use a stablecoin that is not on the platform's supported list, **When** they try to create or accept a wager with it, **Then** the action is rejected and the member is told only supported stablecoins are allowed.

---

### User Story 2 - Manage default and visible stablecoins in Preferences (Priority: P1)

A member opens the Preferences tab in the "My Account" view. They see the list of all platform-supported stablecoins, each with a toggle for "visible" and a way to mark one as their personal default. They turn off stablecoins they never use (hiding them from selectors and amount displays) and pick which stablecoin is pre-selected when they start a new wager. Their choices persist across sessions and are remembered per wallet.

**Why this priority**: The user explicitly requested this control. It is the primary interaction surface the feature adds for members and keeps the interface uncluttered for people who only ever use one or two stablecoins.

**Independent Test**: In Preferences, mark a stablecoin as default and hide another; reload the app and reconnect the same wallet; confirm the wager creator pre-selects the chosen default and the hidden stablecoin no longer appears in selectors.

**Acceptance Scenarios**:

1. **Given** a member on the Preferences tab, **When** the tab loads, **Then** they see every platform-supported stablecoin with its symbol and name, a visibility toggle, and an indicator of which one is their default.
2. **Given** a member toggles a stablecoin's visibility off, **When** they next open a stablecoin selector anywhere in the app, **Then** that stablecoin is not offered.
3. **Given** a member sets a non-USDC stablecoin as their default, **When** they start a new wager, **Then** that stablecoin is pre-selected.
4. **Given** a member has changed their preferences, **When** they return in a later session with the same wallet, **Then** their default and visibility choices are still applied.
5. **Given** a member tries to deselect (hide) their current default stablecoin, **When** they do so, **Then** the system prevents leaving zero defaults — either USDC is restored as default or the member is required to choose another default first.
6. **Given** a member has never set any preferences, **When** they use the app, **Then** USDC is the default and all platform-supported stablecoins are visible.

---

### User Story 3 - Discover and transact across the supported stablecoin set (Priority: P2)

A member browses wagers and account views where amounts are shown in a mix of stablecoins. Each amount is clearly labeled with its stablecoin so values in different currencies are never silently added together or confused. When a member is invited to a wager denominated in a stablecoin they had hidden, the app still lets them act on that specific wager (the hidden preference filters their own choices, not wagers others created for them).

**Why this priority**: Multiple stablecoins (including non-USD ones) mean amounts are no longer fungible at face value; the platform must present them unambiguously so members trust what they're staking and receiving. Important, but builds on P1.

**Independent Test**: Display a list containing wagers and balances in two different stablecoins; confirm every amount is labeled with its stablecoin and that per-currency totals are not merged into a single misleading sum.

**Acceptance Scenarios**:

1. **Given** views that list wagers or balances in more than one stablecoin, **When** they render, **Then** every monetary amount shows its stablecoin symbol and correct decimal precision.
2. **Given** aggregate figures (e.g., account stats, totals), **When** values span multiple stablecoins, **Then** they are grouped or labeled per stablecoin rather than summed across different currencies.
3. **Given** a member was invited to (or is a counterparty on) a wager denominated in a stablecoin they have hidden in Preferences, **When** they view that wager, **Then** they can still accept, claim, or refund it in that stablecoin.

---

### Edge Cases

- **Mismatched preferences between counterparties**: The wager creator chooses the denomination; the acceptor must stake that same stablecoin even if it is not their personal default or is hidden in their preferences.
- **Hiding the default**: A member cannot end up with no default; the system enforces at least USDC (or a chosen replacement) as default.
- **Stablecoin not available on the active network**: Supported stablecoins are network-scoped; a stablecoin not deployed on the connected network must not be offered there, and the selector must reflect the active network's available set only.
- **Insufficient balance or allowance in the chosen stablecoin**: Creation/acceptance must fail clearly when the member lacks balance or approval for the selected stablecoin, naming the stablecoin involved.
- **Differing decimals across stablecoins**: Amount entry, display, and settlement must respect each stablecoin's own decimal precision rather than assuming six decimals.
- **A previously supported stablecoin is removed from the platform list**: Existing open/active wagers in that stablecoin must still be claimable/refundable; the stablecoin is simply no longer offered for new wagers and is removed from selectors.
- **Non-USD value confusion**: A euro-pegged stablecoin amount must never be presented as if it were a US-dollar amount.
- **Stale preferences referencing a removed stablecoin**: If a member's stored default points at a stablecoin the platform no longer supports, the app falls back to USDC as default.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST support multiple stablecoins for wager staking and settlement, with USDC remaining the platform-wide default for any member who has not chosen otherwise.
- **FR-002**: The set of stablecoins offered MUST be a curated allow-list limited to (a) major stablecoins deployed on the platform's supported networks (Polygon mainnet being the primary mainnet), and (b) stablecoins that would be permissible under the GENIUS Act, including non-US-dollar-backed stablecoins that meet that bar.
- **FR-002a**: The first release MUST support at minimum USDC (default), USDT, and one euro-backed stablecoin (e.g., EURC) on Polygon mainnet; the curated set MUST remain extensible by curation without code changes to add further GENIUS-Act-permissible coins later.
- **FR-002b**: The curated set MUST be limited to standard ERC-20 stablecoins that do not rebase and do not charge transfer fees, so the amount escrowed for a wager always equals the amount staked; rebasing or fee-on-transfer tokens MUST NOT be admitted.
- **FR-003**: The supported-stablecoin list MUST be governed/curated by the platform (not arbitrarily extensible by ordinary members); only curated stablecoins may be used to create or accept wagers.
- **FR-004**: A wager MUST be denominated in exactly one stablecoin, chosen at creation by the creator from the supported, member-visible set; the counterparty MUST stake the same stablecoin.
- **FR-005**: Stake escrow, payouts, refunds, draws, and any settlement MUST occur in the wager's denominating stablecoin, with amounts honoring that stablecoin's decimal precision.
- **FR-006**: Members MUST be able to view, in the Preferences tab of the "My Account" view, the full list of platform-supported stablecoins (symbol and name) for the active network.
- **FR-007**: Members MUST be able to mark each supported stablecoin as visible or hidden; hidden stablecoins MUST NOT appear in the member's own stablecoin selectors or default choices.
- **FR-008**: Members MUST be able to designate one supported stablecoin as their personal default; that default MUST be pre-selected when they start a new wager.
- **FR-009**: The system MUST guarantee a member always has exactly one valid default stablecoin, defaulting to USDC when none is chosen and preventing the member from removing their only default without selecting a replacement.
- **FR-010**: Member stablecoin preferences (default and visibility) MUST persist across sessions and be scoped per wallet, so different wallets can have different preferences.
- **FR-011**: A member's "hidden" preference MUST filter only the member's own selection surfaces; it MUST NOT prevent the member from accepting, claiming, or refunding a wager that a counterparty denominated in a hidden stablecoin.
- **FR-012**: All monetary amounts shown anywhere in the app MUST be labeled with their stablecoin and rendered at that stablecoin's correct decimal precision.
- **FR-013**: Aggregate or summary figures spanning multiple stablecoins MUST be presented per-stablecoin (grouped/labeled) and MUST NOT sum amounts across different stablecoins as if interchangeable.
- **FR-013a**: Tax reports and P&L/account-stats views MUST report amounts strictly per-stablecoin and MUST NOT convert non-USD stablecoin amounts to USD or any common reference currency; no FX/price data source is introduced by this feature.
- **FR-014**: The supported-stablecoin set MUST be network-scoped; only stablecoins available on the connected network are offered, and preferences degrade gracefully when a stored choice is unavailable on the active network.
- **FR-015**: Attempting to create or accept a wager in a stablecoin outside the curated supported set MUST be rejected with a clear, member-facing explanation.
- **FR-016**: Removing a stablecoin from the supported set MUST NOT block settlement of pre-existing wagers already denominated in it; such wagers remain claimable/refundable while the stablecoin is withdrawn from new-wager selectors.
- **FR-017**: The platform MUST record/maintain the rationale (GENIUS-Act eligibility and Polygon-mainnet availability) for each stablecoin admitted to the supported set, so the curated list is auditable.

### Key Entities *(include if feature involves data)*

- **Supported Stablecoin**: A curated, platform-approved stablecoin available for wagers. Attributes: symbol, display name, network(s) where available, decimal precision, peg currency (e.g., USD, EUR), and eligibility rationale (GENIUS-Act basis + availability). USDC is always a member of this set and is the platform default.
- **Member Stablecoin Preferences**: Per-wallet settings capturing the member's chosen default stablecoin and the visibility (shown/hidden) state of each supported stablecoin. Defaults to "USDC as default, all visible" when unset.
- **Wager (denomination aspect)**: An existing entity gaining/relying on a single denominating stablecoin attribute that fixes the token for staking, escrow, and settlement of that wager.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can create, have accepted, and settle a wager in a supported non-USDC stablecoin end-to-end, with correct amounts in that stablecoin, with no use of USDC at any step.
- **SC-002**: 100% of monetary amounts displayed in the app are labeled with their stablecoin, and no view sums amounts across different stablecoins into a single combined total.
- **SC-003**: A member can set a default stablecoin and hide unwanted stablecoins in under one minute, and those choices are correctly applied on the next session for the same wallet.
- **SC-004**: For a member who never changes preferences, USDC is the default and the experience is unchanged from today (no added steps, no regressions for USDC-only usage).
- **SC-005**: Every stablecoin offered for new wagers is justifiably on the curated list (GENIUS-Act-permissible and available on the active network), with zero stablecoins offered that fail either criterion.
- **SC-006**: 100% of wagers denominated in a stablecoin that is later removed from the supported set remain claimable/refundable by their participants.
- **SC-007**: Stablecoins with decimal precision other than six are entered, displayed, and settled at their correct precision in 100% of tested cases.
- **SC-008**: The first release offers USDC, USDT, and a euro-backed stablecoin on Polygon mainnet, and a full create→accept→settle cycle succeeds in each of the three.
- **SC-009**: For every supported stablecoin, the amount escrowed equals the amount staked (no fee-on-transfer/rebasing discrepancy) in 100% of tested cases.

## Assumptions

- **Membership fees remain USDC-only for this feature.** The membership purchase flow today is tied to a single global payment token; extending membership pricing to multiple stablecoins is a separate, larger change and is treated as out of scope here. This feature targets wager staking/settlement and member display preferences. (Confirmed with stakeholder — see Clarifications.)
- **The curated supported-stablecoin list is maintained by platform governance/admins**, surfaced to members as a read-only set; members curate only their personal visibility/default, not the platform list itself. The on-chain token allow-list already supports admin-controlled add/remove of stake tokens, and this feature builds on that mechanism.
- **The wager creator selects the denomination** and the acceptor must match it; the platform does not attempt cross-stablecoin conversion or mixed-denomination wagers.
- **Polygon mainnet is the primary target** for the expanded stablecoin set; testnets and other networks continue to use their network-appropriate stablecoin configuration, and the supported set is always network-scoped.
- **"Major stablecoins deployed on Polygon mainnet"** is interpreted as the well-established, liquid stablecoins on Polygon, filtered by GENIUS-Act permissibility. The confirmed first-release set is USDC (default) + USDT + one euro-backed stablecoin (e.g., EURC) — see Clarifications Q2 — with the curated list extensible thereafter without code changes. The exact euro-coin choice and any further additions are curation decisions finalized during planning, subject to compliance sign-off.
- **GENIUS-Act permissibility** is the gating compliance criterion: only payment stablecoins from permitted/registered issuers (including non-USD stablecoins from comparable, recognized regimes) are admitted; algorithmic or non-compliant stablecoins are excluded. Final eligibility determinations require legal/compliance sign-off during planning.
- **Member preferences persist locally per wallet** consistent with how existing member preferences are stored today; no new server-side account system is introduced by this feature.
- **Existing USDC behavior is preserved** as the zero-configuration default so current members see no change unless they opt in.

## Out of Scope

- Membership-tier pricing or membership purchases in non-USDC stablecoins.
- Automatic conversion/swapping between stablecoins, or wagers with two different denominations.
- Adding brand-new networks; this feature operates within the platform's already-supported networks.
- A member-facing mechanism to add arbitrary tokens to the platform's supported list (curation stays with platform governance).
- USD-equivalent valuation, FX conversion, or any cross-currency totals in reports/stats (amounts stay strictly per-stablecoin).
- Cross-device/synced preferences (preferences stay client-side per wallet); rebasing or fee-on-transfer stablecoins.

## Clarifications

### Session 2026-06-22

- **Q1 (Scope — membership payments)**: Should multi-stablecoin support extend to membership purchases (paying membership fees in a non-USDC stablecoin), or is it limited to wager staking/settlement plus member display preferences? → **A: Wagers + preferences only.** Membership fees stay USDC-only; `MembershipManager` keeps its single global payment token and is not changed by this feature.
- **Q2 (Initial supported set)**: What stablecoins should the first release support beyond USDC? → **A: USDC (default) + USDT + one euro-backed stablecoin** (e.g., EURC) on Polygon mainnet. This proves both the USD-majors and the non-USD path in the first release; the set remains extensible via curation thereafter.
- **Q3 (Non-USD reporting/valuation)**: How should non-USD stablecoin amounts appear in tax reports and P&L/account stats that currently assume USD? → **A: Strictly per-currency, no FX conversion.** Amounts are grouped/totaled per stablecoin and never converted to or summed as USD. No price/FX data-source dependency is introduced.
- **Q4 (Token safety constraint)**: What constraint applies to which ERC-20 stablecoins may be curated? → **A: Standard ERC-20 only.** The curated set is limited to standard, non-rebasing, non-fee-on-transfer stablecoins so the amount escrowed always equals the amount staked.
- **Q5 (Preference persistence)**: Where do a member's default/visible-stablecoin preferences live? → **A: Client-side, per wallet** (consistent with existing preference storage). Preferences are per-device and not synced across browsers/devices; no contract or backend storage change is introduced.
