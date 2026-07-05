# Feature Specification: Oracle-Settled Open Challenges (Polymarket)

**Feature Branch**: `claude/oracle-settled-challenges-p3iwl9`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "Create a new 'Oracle-Settled Open Challenges' section: open challenges (creator defines the event and stake, then shares a claim code) are currently restricted to user-defined events only. Extend the open-challenge model to oracle-settled wagers using Polymarket as the oracle source. The creator picks a Polymarket event via an intuitive, fast event-discovery interface (like the existing 'oracle settles' section), sets the stake, and the chosen event's own timeline drives the wager deadlines (accept/resolve). The goal is an exciting, interactive way to quickly pick an oracle event and share the challenge code. The claimant who opens the code must see the bet details clearly and understandably, and it must be unmistakable that Polymarket is the oracle/settlement source."

## Overview

Open challenges (feature 024) let a creator post a code-gated wager with no named
opponent: whoever holds the four-word claim code can read the terms and take the
other side. Today the app restricts open challenges to **user-defined resolution**
only — "either side submits the outcome" or "a named arbitrator decides" — even
though the underlying wager system already permits oracle-settled open challenges.
That leaves out the most trustless combination the platform offers: *a challenge
anyone can take, settled automatically by a public prediction market*.

This feature adds a new **Oracle-Settled Open Challenges** section. The creator:

1. **Picks a real-world event** from Polymarket through the same fast, interactive
   discovery experience used by the existing "an oracle settles it" wager flow —
   trending markets, category chips (Politics, Sports, Crypto, …), and instant
   search, grouped by event.
2. **Picks their side** of the market's binary outcome (e.g. YES/NO) and **sets the
   stake** (equal stakes, as all open challenges require).
3. **Gets the timelines for free** — the chosen event's own schedule drives the
   wager deadlines: the challenge stays takeable until the event closes, and the
   settlement deadline follows the event's expected resolution. The creator does
   not hand-pick dates; the event defines the timeline.
4. **Shares the four-word claim code** exactly as with any open challenge (copy,
   QR, deep link).

The claimant who enters the code sees the bet plainly and completely — the market
question, which side they are taking (the opposite of the creator's), the stake
and potential payout, the timeline, and the market's live state — with **Polymarket
unmistakably presented as the oracle/settlement source**: nobody judges the outcome;
the linked market's public resolution settles the wager automatically.

The existing user-defined open-challenge flow is untouched; this is a parallel,
additive entry point that reuses the same claim-code machinery, membership gates,
and escrow rules.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick a Polymarket event and post an oracle-settled open challenge (Priority: P1)

A Silver+ member opens the new Oracle-Settled Open Challenges section, browses
trending Polymarket markets (or filters by category / searches by keyword), taps a
market, picks the side they believe in, enters a stake, sees the timeline the event
implies, and creates the challenge. They receive the four-word claim code with the
familiar share tools (copy, QR, take-challenge link) and send it to a friend or a
group.

**Why this priority**: This is the headline capability — without the creation path
there is no feature. It delivers standalone value: a shareable, oracle-settled
challenge that needs no arbitrator and no trust between strangers.

**Independent Test**: As a Silver+ member on a Polymarket-capable network, create an
oracle open challenge end-to-end from the new section (browse → pick market → pick
side → stake → create) and confirm: the stake is escrowed, a four-word code is
issued, the challenge records the linked market and the creator's side, and the
accept/resolve deadlines are consistent with the event's schedule.

**Acceptance Scenarios**:

1. **Given** a Silver+ member in the new section, **When** they browse without
   typing anything, **Then** they see a list of currently popular, still-open
   Polymarket markets they can immediately pick from.
2. **Given** the member types a search term or taps a category chip, **When**
   results return, **Then** only markets that are active, unresolved, and ending in
   the future are offered for selection.
3. **Given** a selected market, **When** the member reviews the challenge before
   creating, **Then** they see the market question, the side they picked, the equal
   stake, and the derived accept/settle timeline — and the timeline is presented as
   coming from the event, not as a free-form choice.
4. **Given** the member confirms creation, **When** the challenge is created,
   **Then** their stake is escrowed, the market linkage and chosen side are bound to
   the wager, and the four-word claim code is displayed once with copy / QR /
   deep-link sharing and the existing device-local code backup.
5. **Given** a member below the Silver tier, **When** they attempt to create an
   oracle open challenge, **Then** they are refused and prompted to upgrade, exactly
   as with user-defined open challenges.

---

### User Story 2 - Claimant opens the code and clearly understands the bet before taking it (Priority: P1)

Someone receives the four-word code (message, QR, or link), enters it in the app's
code lookup, and lands on the challenge view. Before accepting, they can see at a
glance: the exact market question, which side **they** would take, how much they
stake and how much they'd win, when the challenge expires and when the bet settles,
and — prominently — that **Polymarket settles this bet automatically** (no person
decides the outcome). They accept, and from then on the wager behaves exactly like
any accepted oracle-resolved wager: it settles from the linked market's public
resolution and the winner claims the payout.

**Why this priority**: The claim experience is half the feature's promise. A code
recipient is often a first-time or casual user; if they cannot understand what they
are agreeing to — or don't realize an external oracle settles it — the feature fails
its trust and clarity goals. Ships together with Story 1.

**Independent Test**: With a code from Story 1, as a different member: enter the
code, verify every element of the bet summary is present and correct (question,
claimant's side, stakes, payout, deadlines, Polymarket-as-oracle indication), accept,
then drive the linked market to resolution (test double) and confirm automatic
settlement and payout claim work identically to an existing oracle-resolved wager.

**Acceptance Scenarios**:

1. **Given** a person holding the correct code, **When** they look it up, **Then**
   the challenge view shows the market question, the side the claimant takes (the
   opposite of the creator's), the stake amount, the total potential payout, and
   the accept/settle deadlines in plain language.
2. **Given** the challenge view, **When** the claimant reads how the bet resolves,
   **Then** Polymarket is explicitly and prominently identified as the settlement
   source, with a plain-language explanation that the outcome is decided by the
   public market's resolution, not by either participant.
3. **Given** the Polymarket market data is reachable, **When** the claimant views
   the challenge, **Then** they also see the market's live context (such as current
   odds/pricing and status) so they can judge the bet before taking it.
4. **Given** the market data is temporarily unreachable, **When** the claimant views
   the challenge, **Then** the bound bet terms (question, side, stake, deadlines,
   oracle source) still render from stored challenge data with a clear notice that
   live market info is unavailable — and acceptance is still possible.
5. **Given** the linked market has already closed or resolved by the time the code
   is used, **When** the claimant views the challenge, **Then** they are clearly
   warned (or blocked, if the outcome is already public) rather than being allowed
   to unknowingly take a decided bet.
6. **Given** an accepted oracle open challenge, **When** the linked market resolves,
   **Then** settlement, payout claim, draw/refund behavior are identical to an
   existing named-opponent oracle wager (no new resolution rules).

---

### User Story 3 - Fast, exciting discovery and effortless sharing (Priority: P2)

A creator wants to go from "I have a hot take" to "code sent to the group chat" in
under a minute. The section opens straight into an inviting, browsable feed of
popular markets; category chips and search respond quickly; picking a market takes
one tap; and after creation the share tools (copy, QR, deep link) are immediately at
hand.

**Why this priority**: The user goal explicitly calls for "an exciting interactive
way to quickly pick an oracle and share the code." Story 1 makes it *possible*;
this story makes it *fast and fun* — the speed and polish targets that make the
section feel like a feed you want to play with rather than a form you fill in.

**Independent Test**: Time a member (who knows what they want to bet on) going from
opening the section to holding a shareable code; verify the interaction targets in
the Success Criteria (search latency, steps to select, share affordances) are met.

**Acceptance Scenarios**:

1. **Given** the section is opened, **When** no filters are applied, **Then**
   popular pickable markets render without requiring any input first.
2. **Given** a category chip is tapped or a search term typed, **When** results
   update, **Then** stale results are never shown as fresh, and typical updates feel
   immediate (see SC-002).
3. **Given** a market whose event groups several related markets, **When** it is
   browsed, **Then** the group presents as one expandable entry so the list stays
   scannable.
4. **Given** a created challenge, **When** the code screen is shown, **Then** copy,
   QR, and take-challenge deep link are all available without further navigation,
   and the code is backed up per the existing open-challenge code backup behavior.

---

### Edge Cases

- **Linked market ends beyond the maximum acceptance window**: the challenge's
  accept deadline is capped at the platform's maximum acceptance window (30 days)
  even if the event ends later; the creator is shown the effective (capped) window
  before creating. The settle deadline still tracks the event's expected resolution
  (within the platform's maximum resolve window).
- **Linked market ends too soon**: markets ending inside the platform's minimum
  lead time are not offered for selection (a challenge nobody could realistically
  take is not creatable).
- **Market closes or resolves between selection and creation**: creation re-checks
  the market's state; a market that is no longer open for linkage is refused with a
  clear message and the creator is returned to the picker.
- **Market resolves early (event decided before its scheduled end)**: the claimant
  view surfaces live market status; a market already showing a public outcome
  blocks acceptance (US2 scenario 5) so no one unknowingly takes a decided bet. If
  it slips through (data lag), settlement still pays per the market's resolution —
  identical to existing oracle wagers.
- **Skewed odds, equal stakes**: open challenges are equal-stakes by rule, even when
  the market prices one side at 80¢. The claimant view shows live odds precisely so
  a code-holder can decline an unfavorable bet; sharing the code does not obligate
  anyone.
- **Network without Polymarket support**: the section is hidden or shown locked
  with an explanation on chains where Polymarket settlement is not available,
  mirroring how the existing oracle wager flow gates itself.
- **Polymarket discovery service unreachable at creation time**: the picker shows a
  clear error/retry state; creation is impossible without a verifiable live market
  (no free-text fallback in this section — that's what user-defined open challenges
  are for).
- **No one accepts before the accept deadline**: standard open-challenge expiry —
  the creator's stake becomes refundable, identical to feature 024.
- **Creator loses the code / wrong code entered / non-member taker / sanctions**:
  all inherited unchanged from feature 024 (code backup vault, code-not-found
  handling, membership prompt at accept, sanctions screening).
- **Settlement never arrives (market disputed/delayed past the settle deadline)**:
  the existing oracle-wager deadline/refund behavior applies unchanged; this
  feature adds no new settlement rules.

## Requirements *(mandatory)*

### Functional Requirements

#### Section & discovery

- **FR-001**: The app MUST offer a new, clearly named entry point for creating
  **oracle-settled open challenges**, separate from (and not replacing) the existing
  user-defined open-challenge flow.
- **FR-002**: The section MUST let the creator discover Polymarket markets through
  the same interaction model as the existing oracle wager flow: a no-input default
  feed of popular markets, category filter chips, and keyword search, with related
  markets grouped by event.
- **FR-003**: Only markets that are active, unresolved, and ending in the future
  MUST be selectable; markets ending inside the platform's minimum lead time MUST
  be excluded from selection.
- **FR-004**: The section MUST be available only on networks where Polymarket
  settlement is supported, and MUST present a clear locked/unavailable state
  elsewhere (consistent with the existing oracle flow's gating).

#### Creating the challenge

- **FR-005**: The creator MUST explicitly choose their side of the linked market's
  binary outcome, with both sides shown using the market's own outcome labels; the
  taker's side is always the opposite.
- **FR-006**: The creator MUST set a stake, and the challenge MUST be equal-stakes
  (both sides stake the same amount), inheriting the open-challenge rule.
- **FR-007**: The challenge's deadlines MUST be derived from the linked event, not
  hand-entered: the acceptance deadline follows the market's close (capped at the
  platform's maximum acceptance window), and the settlement deadline follows the
  market's expected resolution (within the platform's maximum resolve window). The
  derived timeline MUST be displayed to the creator before creation, presented as
  coming from the event.
- **FR-008**: At the moment of creation the system MUST re-validate that the linked
  market is still open for linkage and MUST refuse creation with a clear message if
  it is not.
- **FR-009**: Creation MUST bind the linked market's identity and the creator's
  chosen side to the wager such that settlement can only follow that market's
  public resolution.
- **FR-010**: Creation MUST reuse the existing open-challenge claim-code machinery
  unchanged: a four-word code shown once, code-derived readability of terms,
  active-uniqueness of the code, device-local encrypted code backup, and copy / QR /
  take-challenge deep-link sharing.
- **FR-011**: Oracle open-challenge creation MUST enforce the same creator gates as
  user-defined open challenges (Silver-and-above membership tier, sanctions
  screening, membership limits, allowed stake token).

#### Claimant experience

- **FR-012**: Entering the correct claim code MUST take the holder to a challenge
  view that presents, without further navigation: the market question, the side the
  claimant would take, the stake amount, the total potential payout, the acceptance
  deadline, and the expected settlement timeline — all in plain language.
- **FR-013**: The challenge view MUST unmistakably identify Polymarket as the
  oracle/settlement source, both visually (a distinct, consistent oracle indicator)
  and in plain words (the outcome is settled automatically from the public market's
  resolution; neither participant decides).
- **FR-014**: When live market data is reachable, the challenge view MUST show the
  linked market's current context (at minimum: current price/odds and open/closed
  status). When unreachable, the view MUST still render the bound bet terms from
  stored challenge data with a clear "live market info unavailable" notice, and
  acceptance MUST remain possible.
- **FR-015**: If the linked market is already closed or already shows a public
  outcome when the code is used, the claimant MUST be clearly warned before
  accepting; if the outcome is already public, acceptance MUST be prevented in the
  app.
- **FR-016**: Accepting MUST enforce all existing open-challenge accept-time
  protections unchanged (code proof, first-taker-wins, membership required for all
  takers, sanctions screening, creator cannot self-accept).

#### Settlement & compatibility

- **FR-017**: After acceptance, the wager MUST behave identically to an existing
  oracle-resolved wager: settlement follows the linked market's public resolution
  automatically, and payout, draw, refund, and claim flows are unchanged.
- **FR-018**: The existing user-defined open-challenge flow (either-side and
  third-party arbitrator resolution) MUST remain available and unchanged.
- **FR-019**: All existing wager flows (named-opponent, user-defined open
  challenges, group pools) MUST continue to pass their existing tests unchanged;
  this feature is additive.

### Key Entities

- **Oracle Open Challenge**: An open challenge (code-gated, no named counterparty,
  equal stakes) whose resolution is bound at creation to a specific Polymarket
  market and a chosen side. Becomes an ordinary accepted oracle-resolved wager once
  a code-holder takes it.
- **Linked Market**: The Polymarket market chosen by the creator — identified
  durably (so settlement is verifiable) and described richly (question, outcome
  labels, schedule, live pricing) for display. Its schedule is the source of the
  challenge's derived timeline; its public resolution is the sole settlement input.
- **Side Assignment**: The creator's chosen outcome of the linked market; the
  taker automatically holds the opposite outcome. Both are displayed using the
  market's own outcome labels.
- **Derived Timeline**: The accept-by and settle-by deadlines computed from the
  linked market's schedule (with platform caps), shown to the creator before
  creation and to every code-holder afterward.
- **Claim Code** *(existing, unchanged)*: The four-word secret from feature 024 —
  discovery, accept authorization, and terms readability, shared out-of-band.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member who knows what they want to bet on can go from opening the
  section to holding a shareable claim code in under 2 minutes, with market
  selection itself taking no more than 3 interactions from the default feed
  (filter/search → pick market → pick side).
- **SC-002**: Market discovery feels immediate: under typical conditions, the
  default feed and search/filter results render within 2 seconds of the action.
- **SC-003**: 100% of created oracle open challenges have timelines consistent with
  their linked event: the challenge cannot be accepted after the event's close (or
  the platform cap, whichever is earlier), and the settlement deadline allows for
  the event's expected resolution.
- **SC-004**: 100% of code-holders see the complete bet summary (market question,
  their side, stake, payout, deadlines, settlement source) on a single view with no
  additional navigation, in both live-data and degraded (market data unavailable)
  states.
- **SC-005**: In moderated usability checks, at least 90% of first-time code
  recipients can correctly answer "who decides who wins?" (answer: Polymarket's
  public market resolution — nobody in the app) after viewing the challenge, and
  100% of challenge views name Polymarket as the settlement source.
- **SC-006**: 100% of accepted oracle open challenges settle through the same
  automatic path as existing oracle wagers, with no manual intervention and no new
  settlement rules — verified by equivalence tests against the existing oracle
  wager flow.
- **SC-007**: Zero regressions: existing user-defined open-challenge, named-opponent,
  and oracle wager test suites pass unchanged.
- **SC-008**: 100% of attempts to create against a market that is closed, resolved,
  or ending too soon are refused with an actionable message (no silent failures, no
  challenges created against dead markets).

## Assumptions

- **Polymarket is the only oracle source for this section in v1.** The platform's
  oracle exposure already defaults to Polymarket only; Chainlink/UMA variants of
  oracle open challenges are out of scope here and can follow the same pattern
  later.
- **The underlying wager system already supports oracle-settled open challenges.**
  Feature 024 deliberately permitted oracle resolution for open challenges at the
  contract level and barred only single-party self-resolution; the current
  restriction to user-defined resolution is an app-level limitation. This feature
  is expected to require **no changes to the deployed wager contracts**.
- **Timelines are derived, not hand-edited.** "The event defines the timelines" is
  taken literally: the creator sees the derived accept/settle deadlines but does
  not pick dates in this flow. Platform bounds (maximum 30-day acceptance window,
  maximum resolve window, minimum lead time) cap the derivation, and the effective
  deadlines are always shown before creation.
- **Binary markets only.** Selectable markets are those with a two-outcome
  structure (YES/NO or equivalent two-sided outcomes); multi-outcome events are
  represented through their individual binary markets, as in the existing oracle
  flow's event grouping.
- **Equal stakes despite market odds is accepted and disclosed.** Open challenges
  are equal-stakes by rule; the live odds display exists so both parties can judge
  the bet, and an unfavorable code can simply go untaken until it expires.
- **Claim-code security model is inherited unchanged from feature 024**, including
  its documented v1 residual risks and the membership/sanctions gates at create and
  accept.
- **Networks**: applies where Polymarket settlement is configured (Polygon mainnet
  and the Amoy testnet today); other networks show the gated/unavailable state.
- **Claimant clarity relies on challenge-bound data first, live data second.** The
  bet's bound terms (question, side, stake, deadlines, oracle source) must never
  depend on the discovery service being up; live pricing/status is an enhancement
  layered on top.
