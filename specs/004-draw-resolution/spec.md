# Feature Specification: Draw Resolution (Both Stakes Returned)

**Feature Branch**: `004-draw-resolution`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "we need to provide the users the ability to resolve a bet as a draw. in the event the wager is resolved as a draw then both parties get their original stake back. this is to account for mis understandingings or events which get nullified or if a polymarket is resolved as a tie"

## Overview

Today a wager has exactly one resolved outcome: a single winner takes the entire pot (both parties' stakes). There is no honest way to settle a wager where **neither side should win** — for example when the two parties misunderstood the terms, the underlying real-world event is nullified/voided, or a Polymarket market resolves as a tie (a 50/50 or "invalid" market). The only way both parties currently recover their stakes is to let the wager sit unresolved until the resolve deadline passes and then claim a refund, which is slow, confusing, and indistinguishable from "nobody bothered to resolve it."

This feature adds an explicit **Draw** resolution: a wager can be settled such that **each party gets their original stake back** and no winner is declared. The draw is recorded as a deliberate, distinct outcome (not a timeout/abandonment), so participants and any indexer/history view can tell a true draw apart from an expiry refund.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Settle a misunderstood or nullified wager as a draw (Priority: P1)

Two participants have an active wager (both stakes escrowed). The real-world event the wager depended on is cancelled/nullified, or the participants realize they disagreed on what the wager actually meant, so there is no fair winner. They settle the wager as a **draw**: on a participant-resolved wager this takes the agreement of both participants (one proposes a draw, the other confirms), while on an arbitrator-resolved wager the arbitrator can settle a draw alone. Each participant recovers exactly the stake they put in, and the wager is permanently marked as drawn.

**Why this priority**: This is the core capability requested and the only path that delivers the feature's value. Without it, the feature does not exist. It is the smallest slice that is independently useful: it lets people gracefully unwind a wager that should not produce a winner.

**Independent Test**: Create and fully fund a wager between two parties, settle it as a draw (mutual agreement for a participant-resolved wager, or the arbitrator alone for a ThirdParty wager), and verify (a) each party's recoverable amount equals their original stake, (b) neither party receives the other's stake, and (c) the wager's recorded outcome is "draw," distinct from a winner-resolution or a deadline refund.

**Acceptance Scenarios**:

1. **Given** an active participant-resolved wager with both stakes escrowed, **When** one participant proposes a draw and the other participant confirms it, **Then** the wager is marked resolved-as-draw and each participant can recover their full original stake and nothing more.
2. **Given** an active participant-resolved wager where only one participant has proposed a draw, **When** the other participant has not confirmed, **Then** the wager is NOT yet drawn and either participant may still pursue the normal winner-resolution path.
3. **Given** an active wager whose resolution type is ThirdParty, **When** the designated arbitrator settles it as a draw, **Then** the wager is drawn without needing either participant's confirmation.
4. **Given** a wager just settled as a draw, **When** each participant claims/recovers their funds, **Then** the creator receives exactly the creator's original stake and the opponent receives exactly the opponent's original stake.
5. **Given** a wager that has already been settled as a draw, **When** anyone attempts to resolve it again (as a winner or as a draw), **Then** the action is rejected because the wager is already final.
6. **Given** a wager that has already declared a winner or already been refunded, **When** someone attempts to settle it as a draw, **Then** the action is rejected.

---

### User Story 2 - Polymarket tie settles automatically as a draw (Priority: P2)

A wager is configured to resolve from a Polymarket market. That market resolves as a tie (equal payout to both sides, e.g. a 50/50 split or an "invalid"/disputed market). Rather than leaving the wager stuck until its resolve deadline, the system recognizes the tie and settles the wager as a draw, returning both stakes.

**Why this priority**: Directly named in the request and removes a known dead-end where Polymarket-resolved wagers silently hang until the deadline. It builds on the draw capability from Story 1, so it is valuable but secondary to having the draw mechanism at all.

**Independent Test**: Point a wager at a Polymarket market that has resolved as a tie, trigger oracle resolution, and verify the wager ends in the draw state with both stakes recoverable — without anyone manually picking an outcome and without waiting for the deadline.

**Acceptance Scenarios**:

1. **Given** an active Polymarket-resolved wager whose market has resolved as a tie, **When** oracle resolution is triggered, **Then** the wager is settled as a draw and both stakes become recoverable.
2. **Given** a Polymarket market that has resolved decisively (a real YES/NO winner), **When** oracle resolution is triggered, **Then** the wager resolves to that winner as it does today (a decisive market never becomes a draw).
3. **Given** a Polymarket market that is not yet resolved, **When** oracle resolution is triggered, **Then** the wager is neither drawn nor won and remains awaiting resolution.

---

### User Story 3 - Understand a draw in the app and in history (Priority: P3)

A participant opens the app to resolve or review a wager. When settling, an authorized resolver can choose "Draw" alongside the existing winner options, with a plain-language explanation of what a draw does (both parties get their stake back). After a draw, the wager's status and history clearly show it was settled as a draw, distinct from "winner declared" or "refunded after timeout."

**Why this priority**: Makes the capability usable and trustworthy for non-technical users and keeps the trust surface honest, but the underlying settlement (Stories 1–2) can exist and be tested before the full UI polish lands.

**Independent Test**: In the app, open the resolution flow for an eligible wager, confirm a clearly labeled "Draw" option with an explanation is available to authorized resolvers (and hidden/disabled for users who cannot resolve), settle as a draw, and confirm the wager's status afterward reads as a draw in both the active view and history.

**Acceptance Scenarios**:

1. **Given** an authorized resolver viewing an eligible wager, **When** they open the resolution flow, **Then** a clearly labeled "Draw — both parties refunded" option is presented alongside the winner options with an explanation of its effect.
2. **Given** a user who is not authorized to resolve a given wager, **When** they view it, **Then** they are not offered the option to settle it as a draw.
3. **Given** a wager that was settled as a draw, **When** any participant views its status or history, **Then** it is labeled as a draw and distinguishable from a winner-resolution and from a timeout refund.

---

### Edge Cases

- **Draw before the wager is fully funded**: If the opponent has not yet accepted/funded the wager, there is no second stake to return. A draw is only meaningful once both stakes are escrowed; before that, the existing cancel/refund-of-creator path applies. The draw option MUST NOT be offered for an unaccepted wager.
- **Draw on an oracle-bound manual attempt**: For a wager whose resolution is delegated to an automated oracle, no human (participant, arbitrator, or admin) may force a draw; draw authority for oracle-bound wagers comes solely from the oracle's tie result. If such an oracle never resolves (e.g. permanently stuck or market delisted), the wager falls back to the existing deadline timeout-refund, which already returns both stakes — no new human override is introduced.
- **One-sided draw proposal then a real resolution**: On a participant-resolved wager, if one party proposes a draw but the other never confirms, the wager MUST remain normally resolvable (a winner can still be declared, or it can time out to refund). A pending, unconfirmed draw proposal MUST NOT lock the wager.
- **Double claim / re-resolution**: Once drawn, attempts to declare a winner, draw again, or refund-by-timeout MUST all be rejected; each participant can recover their stake exactly once.
- **Equal vs. unequal stakes**: Stakes may not be equal. A draw returns each party exactly their own original stake, regardless of whether the two stakes were equal.
- **Rounding / dust**: A draw must return the full escrowed amount with no value stranded or created; the sum returned equals the sum escrowed.
- **Abandoned draw eligibility**: A wager that reaches its resolve deadline without being drawn or won still follows the existing timeout-refund path; the draw feature does not remove that safety net.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an eligible wager to be settled as a **draw**, a terminal resolution outcome distinct from "winner declared," "cancelled," and "timeout-refunded."
- **FR-002**: When a wager is settled as a draw, the system MUST return to each participant exactly the stake that participant originally escrowed, and nothing more.
- **FR-003**: The system MUST NOT, on a draw, transfer any portion of one participant's stake to the other participant or to any third party.
- **FR-004**: The sum of funds returned on a draw MUST equal the sum of funds escrowed for that wager (no value created, lost, or stranded).
- **FR-005**: A draw MUST only be permitted for a wager that is active and fully funded (both stakes escrowed) and not already resolved, drawn, cancelled, or refunded. A **manual** draw (participant or arbitrator, per FR-008/FR-008a) MUST additionally be rejected once the wager's resolve deadline has passed — after that point the existing timeout-refund path already returns both stakes, so a manual draw is neither needed nor accepted. (The Polymarket auto-draw on a tie, FR-009, settles via the oracle-resolution path and follows that path's existing timing.)
- **FR-006**: The system MUST reject any attempt to settle a wager as a draw if the wager has already declared a winner, already been settled as a draw, been cancelled, or been refunded.
- **FR-007**: After a draw, the system MUST reject any subsequent attempt to declare a winner, settle as a draw again, or claim a timeout refund for that wager.
- **FR-008**: For participant-resolved wagers (resolution type Either, Creator-only, or Opponent-only), settling as a draw MUST require the explicit agreement of BOTH participants: one participant proposes a draw and the other must confirm it. A single participant MUST NOT be able to unilaterally settle a wager as a draw.
- **FR-008a**: For a wager whose resolution type is ThirdParty, the designated arbitrator MAY settle the wager as a draw on their own, without either participant's confirmation (consistent with the arbitrator's existing authority to declare a winner).
- **FR-008b**: A pending (proposed-but-unconfirmed) draw on a participant-resolved wager MUST NOT lock the wager: the normal winner-resolution and timeout-refund paths MUST remain available until the draw is confirmed. The proposing participant MUST be able to withdraw their own pending proposal; a counterparty "declines" simply by not confirming — because an unconfirmed proposal never locks the wager, no explicit decline action is required (and none is provided).
- **FR-008c**: For oracle-resolved wagers (Polymarket, ChainlinkDataFeed, ChainlinkFunctions, UMA), no human (participant, arbitrator, or admin) may force a draw; a draw on these wagers arises only from the oracle result (see FR-009). A permanently unresolved oracle relies on the existing deadline timeout-refund and introduces no new human override.
- **FR-009**: For a wager whose resolution is delegated to a Polymarket oracle, when the referenced market resolves as a tie (equal payout to both sides, including "invalid"/disputed markets), the system MUST immediately settle the wager as a draw (returning both stakes) when oracle resolution is triggered, rather than leaving it unresolved until the deadline.
- **FR-010**: For a Polymarket-resolved wager, a tie result MUST produce a draw, a decisive result MUST produce the corresponding winner (unchanged from today), and an unresolved market MUST leave the wager awaiting resolution.
- **FR-011**: The system MUST record a draw distinctly from a winner-resolution and from a timeout refund, so participants and any indexing/history surface can identify that a wager ended as a draw.
- **FR-012**: The resolution interface MUST present authorized resolvers a clearly labeled "Draw" option alongside the existing winner options, with a plain-language explanation that a draw returns each party's original stake.
- **FR-013**: The resolution interface MUST NOT offer the draw option to a user who is not authorized to resolve that wager, nor for a wager that is not eligible to be drawn (e.g. not yet fully funded, or already final).
- **FR-014**: The app's wager status and history views MUST display a draw outcome in plain language and visibly distinguish it from a declared winner and from a timeout refund.
- **FR-015**: The system MUST emit/record an auditable signal when a wager is settled as a draw, identifying the wager and the participants whose stakes were returned, sufficient for indexing and dispute review.
- **FR-016**: A draw MUST be final once settled; the feature does not introduce a contest/challenge window beyond what already exists for other resolutions.

### Key Entities *(include if feature involves data)*

- **Wager**: The escrowed agreement between two participants. Gains a new terminal resolution outcome ("draw") in addition to its existing winner-resolution, cancelled, and refunded states. A wager carries each participant's original stake, the resolution authority/type, and (after settlement) its final outcome.
- **Resolution Outcome**: The result recorded when a wager ends. Currently "a winner" (or, via timeout, "refunded"); this feature adds "draw." Distinct from **Resolution Type**, which is *who/how* a wager is resolved (the existing participant/third-party/oracle options) and is not changed by this feature.
- **Draw Proposal**: For participant-resolved wagers, the transient record that one participant has proposed a draw and is awaiting the other's confirmation. It is not a terminal state — it can be confirmed (→ draw), withdrawn by the proposer, declined by the counterparty simply not confirming, or superseded by a normal winner-resolution or timeout. Not applicable to arbitrator- or oracle-resolved wagers.
- **Stake**: The amount each participant escrows. On a draw, each participant's recoverable amount equals their own original stake.
- **Polymarket Market Result**: The external oracle result a Polymarket-bound wager depends on. May be decisive (a winner), a tie (drives a draw under this feature), or unresolved (no settlement yet).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of wagers settled as a draw, each participant can recover exactly their original stake, and the total returned equals the total escrowed (verified across equal and unequal stake amounts).
- **SC-002**: A draw can be settled and both parties' funds made recoverable as soon as the required authorization is given (mutual confirmation for a participant-resolved wager, or the arbitrator's action for a ThirdParty wager), without waiting for any deadline to pass.
- **SC-002a**: A draw on a participant-resolved wager is reached only after both participants agree; 100% of attempts by a single participant to draw such a wager without the other's confirmation leave the wager un-drawn and still normally resolvable.
- **SC-003**: 100% of Polymarket-bound wagers whose market resolves as a tie end in the draw state once oracle resolution is triggered, with no such wager left hanging until its resolve deadline.
- **SC-004**: 0% of draws result in any value being transferred between participants, stranded, or created (the returned total always equals the escrowed total).
- **SC-005**: 100% of attempts to settle as a draw by an unauthorized user, or to draw an ineligible wager (unfunded or already final), are rejected.
- **SC-006**: In the app, an authorized resolver can identify and choose the draw option without external documentation, and 100% of completed draws are labeled as draws (not as winner-resolutions or timeout refunds) in both the active and history views.
- **SC-007**: Existing winner-resolution, cancel, and timeout-refund behaviors are unchanged for all wagers that are not settled as a draw (no regression).

## Assumptions

- **No protocol fee on settlement today**: The current system pays the full pot to the winner with no protocol fee/rake, so a draw cleanly returns each full stake. If a fee mechanism is later introduced, draw behavior re: fees must be revisited; for this feature, no fee is taken on a draw.
- **Both-stakes-back is an established pattern**: The system already returns both stakes via the timeout-refund path, so a draw reuses a proven settlement shape rather than inventing new fund mechanics; the new part is making it a deliberate, immediately-available, distinctly-recorded outcome.
- **Resolution Type is unchanged**: This feature adds a new *outcome* (draw); it does not add a new *resolution type* and does not change the existing set of resolution authorities (the 8 resolution types remain as-is).
- **Manual draw model (decided)**: A human-driven draw applies only to participant- or arbitrator-resolved wagers. Participant-resolved wagers (Either/Creator/Opponent) require BOTH participants to agree (propose + confirm); a ThirdParty arbitrator can draw alone. Oracle-bound wagers derive a draw solely from the oracle's tie result — no human (including admin) can force a draw on them, and a stuck oracle falls back to the existing timeout refund.
- **Draw requires a fully funded wager**: A draw only applies once both stakes are escrowed (status active); an unaccepted/unfunded wager uses the existing cancel/creator-refund path instead.
- **Polymarket tie definition**: A Polymarket "tie" means equal payout to both sides — including 50/50 splits and "invalid"/disputed market resolutions — consistent with how the system already detects an indecisive Polymarket result.
- **No new dispute window**: A draw is final at settlement, matching the finality of the existing winner-resolution; this feature does not add a challenge/contest period.
- **Networks**: Applies to the live deployments (Polygon mainnet, Amoy testnet); legacy read-only networks are out of scope.
