# Feature Specification: Perps Position Management

**Feature Branch**: `claude/perps-position-management-phase1`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "This feature has shipped as read-only for phase 0 of adding perps.
The goal is a fully functional perps management view where a user can manage their positions on
the platform. Make appropriate use of bottom sheets for interactions and smart default selection
to reduce the burden on users. 50 bps is the standard fee the platform uses across the other
services now; perps should be similar. Like the prediction markets, perps should pass through any
restrictions."

## Clarifications

### Session 2026-08-11

- Q: Should a FairWins contract sit in the position-opening path so it can charge a fee? → A:
  **No — it is forbidden, not merely deferred.** Verified against live venue code: Gains'
  `_openTrade` executes `_trade.user = _msgSender()`, *overwriting* the caller-supplied user
  field, and GMX's `ExchangeRouter.createOrder` assigns `address account = msg.sender`. Neither
  venue exposes an owner parameter. Any FairWins contract in that path becomes the **position
  owner**, and the member could never close their own position — precisely the failure
  `LiquidityRouter`'s header already forbids for Across bridge-LP deposits. GMX's `receiver`
  field looks like an owner parameter but only directs payouts. **This feature ships no Solidity.**
- Q: What fee rate, given the platform standard is 50 bps? → A: **5 bps of notional.** Perps fees
  are charged on notional (margin × leverage), not on capital committed, and both venues hard-cap
  a third-party fee at 10 bps. At 10× leverage, 5 bps of notional equals ~50 bps of the member's
  margin — the platform standard expressed in the unit perps actually uses. The registered cap
  stays at the venue ceiling so the rate can be raised later without a redeploy.
- Q: Which venues get full management in v1? → A: **Gains Network and GMX v2.** Hyperliquid is
  architecturally all-or-nothing — its L1 actions sign under a hardcoded `chainId 1337` that
  injected wallets reject, so it needs a browser-held agent key *even to close a position*, plus
  USDC already bridged to its own L1. It keeps the spec-082 read-only positions with an honest
  "manage on the venue" link until those are resolved.
- Q: May passkey (smart-account) members open positions? → A: **Yes, with disclosure.** On that
  rail `msg.sender` is the smart account, so the smart account owns the position. That is
  member-controlled, but FairWins is currently the only client that can drive it. The confirm
  step states this plainly rather than excluding those members.
- Q: How do restrictions pass through, given Predict's geoblock precedent? → A: **Fail-closed, and
  on entry paths only.** Predict's geoblock may fail *open* because Polymarket's CLOB enforces the
  block server-side as a backstop. Measured here: **no such backstop exists** — Hyperliquid's API
  and app.gmx.io both answer 200 from restricted regions, and the Gains/GMX contracts are
  permissionless. FairWins is therefore the enforcement point: sanctions screening and a
  jurisdiction attestation gate **opening** a position, and **never** gate closing, reducing,
  cancelling, or recovering collateral.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Close or reduce an open position (Priority: P1)

A member with an open perp position opens it from the Perps view. A bottom sheet presents the
position with its live value, and a single obvious action: close it. They can close all of it, or
drag/tap to reduce part of it. Before they sign, they see what they will receive, what the venue
charges, and the FairWins fee if one applies. After they sign, the sheet does **not** claim the
position is closed — it says the close order has been sent to the venue, and only reports
"closed" when the venue actually executes it. If the venue rejects or freezes the order, the
member is told why, in the venue's own words, with the recovery control offered by name.

**Why this priority**: Exit is the safety-critical path and the one the product promise rests on.
It is independently valuable to a member who opened a position anywhere — including on the venue's
own app — and it is the story that proves the async state machine is honest.

**Independent Test**: With a wallet holding a known open position on Gains (or GMX), open the
sheet, close 50%, and verify: the preview matches what the venue reports; the UI reports
"sent" not "closed" on inclusion; the position updates only after the venue's execution event;
and a forced rejection surfaces the venue's reason.

**Acceptance Scenarios**:

1. **Given** a member with an open position, **When** they open its bottom sheet, **Then** they see
   size, entry price, leverage, liquidation price, unrealized P&L, and one primary Close action —
   each value attributed to the venue and rendered "—" when the venue does not report it.
2. **Given** the member chooses to close, **When** the confirm step renders, **Then** it shows the
   estimated proceeds, the venue's own fees, and the FairWins fee (or no fee line at a zero rate),
   before any signature is requested.
3. **Given** the member signs, **When** the transaction is included, **Then** the UI states the
   order was **sent to the venue** and is pending execution — it MUST NOT claim the position is
   closed.
4. **Given** the venue executes the close, **When** the execution event arrives, **Then** the
   position is reported closed with the venue's actual fill, and the position list updates.
5. **Given** the venue rejects the order, **When** the rejection arrives, **Then** the member sees
   the venue's stated reason and the position remains open and manageable.
6. **Given** the member is sanctions-screened, region-restricted, or the feature is killswitched,
   **When** they open a position sheet, **Then** closing and reducing remain fully available —
   no restriction may ever stand between a member and exiting a position.

---

### User Story 2 - Protect a position with a stop-loss and take-profit (Priority: P1)

From the same bottom sheet, a member sets a stop-loss and/or take-profit on an open position. The
sheet suggests sensible defaults derived from the position itself, shows the loss or gain each
level implies in money terms, and warns when a chosen stop sits beyond the liquidation price.
Setting or changing these is a first-class action, not buried.

**Why this priority**: Shipping the ability to open a leveraged position without shipping the
ability to limit its downside would be irresponsible. If a venue ships opening, it ships
stop-loss.

**Independent Test**: On a position with no stop, set one at the suggested default and verify the
venue records it; move it past the liquidation price and verify the UI refuses with a plain
explanation; remove it and verify the venue clears it.

**Acceptance Scenarios**:

1. **Given** an open position without a stop-loss, **When** the member opens the protect control,
   **Then** a default stop is pre-filled from the position's own risk and the money impact of that
   level is shown.
2. **Given** the member enters a stop beyond the liquidation price, **When** they attempt to save,
   **Then** the app refuses before any wallet prompt and explains that the position would be
   liquidated first.
3. **Given** a valid stop-loss and/or take-profit, **When** the member saves, **Then** the venue
   records it and the sheet reflects the venue's stored values, not the requested ones.
4. **Given** a venue that expresses protection as separate trigger orders, **When** the position
   closes, **Then** those orders do not linger as stale exposure.

---

### User Story 3 - Open a position with smart defaults (Priority: P2)

From a pair in the Perps view, a member opens a bottom sheet already configured with sensible
choices: the venue with the best terms for that pair pre-selected, a conservative leverage, their
collateral pre-chosen from what they actually hold, and direction defaulted to long. They adjust
what they care about — usually amount and leverage — and everything else is already right. Before
signing they see the position they are about to hold: notional, liquidation price, fees, and the
plain risk that leverage can lose the entire stake.

**Why this priority**: Opening is the revenue and growth path, but it depends on the exit and
protection stories being trustworthy first.

**Independent Test**: From a pair row, open the sheet and verify every field is pre-filled and
valid with zero input; change only the amount; confirm the preview's liquidation price matches the
venue's own calculation; submit and follow the order to fill.

**Acceptance Scenarios**:

1. **Given** a member opens the trade sheet from a pair, **When** it renders, **Then** venue,
   direction, collateral asset, and leverage are pre-selected with a stated reason for the venue
   choice, and the member can change any of them.
2. **Given** the member enters an amount, **When** the preview updates, **Then** it shows notional,
   estimated entry, liquidation price, venue fees, the FairWins fee, and the total cost — live,
   never hardcoded.
3. **Given** the member has insufficient collateral or exceeds the venue's limits, **When** they
   attempt to submit, **Then** the app refuses before any wallet prompt with a plain reason.
4. **Given** the member submits, **When** the order is included on-chain, **Then** the UI reports
   the order as sent and pending, and reports the position only when the venue executes it.
5. **Given** the venue cancels the order, **When** the cancellation arrives, **Then** the member is
   told the venue's reason, told their collateral was returned, and told **no FairWins fee was
   charged** — because under this design the venue computes the fee at execution.
6. **Given** the member's order times out without execution, **When** the timeout passes, **Then**
   the UI offers the named recovery control that returns their collateral.

---

### User Story 4 - Recover a stuck order (Priority: P2)

A member whose order was neither filled nor cancelled — Gains' keeper never executed it, or GMX
froze a trigger order — sees it plainly in the Perps view with a control that resolves it and
returns their collateral. This is not an error state buried in a log; it is a first-class item.

**Why this priority**: This is exit safety. An order holding collateral in limbo with no visible
control is indistinguishable from lost money.

**Acceptance Scenarios**:

1. **Given** a Gains market order past its execution timeout, **When** the member views the Perps
   section, **Then** the pending order is listed with a named recovery control that returns the
   collateral.
2. **Given** a GMX frozen order, **When** it is listed, **Then** it is presented as needing
   attention with the venue's reason and a cancel control that returns collateral to the member.
3. **Given** any recovery control, **When** the member uses it, **Then** it is never gated by
   screening, jurisdiction, killswitch, or feature flag.

---

### User Story 5 - Administer the perps fee (Priority: P3)

A fee administrator sees both perps fee rails with each rate read from the contract that actually
enforces it, and can change each one from the admin surface. Rates that FairWins does not control
are displayed as such rather than offered as a settable field that silently does nothing.

**Acceptance Scenarios**:

1. **Given** an admin on the fees surface, **When** the perps rails render, **Then** each shows its
   live rate, its venue-enforced ceiling, and which contract is the authority for it.
2. **Given** an admin sets a rate above the venue ceiling, **When** they submit, **Then** it is
   refused and the ceiling is stated.
3. **Given** a rate of zero, **When** a member trades, **Then** no fee line is shown anywhere and
   behaviour is identical to a fee-free integration.

---

### Edge Cases

- The venue is in close-only mode → opening is disabled with the venue named as the source, while
  closing and reducing stay available.
- A position's venue becomes unreachable → that venue's positions render as unreadable by name;
  other venues are unaffected; the member is pointed at the venue's own app.
- The member's requested size is partially filled by the venue → the UI reports the venue's actual
  filled size, never the requested size, and says so.
- Two different index spaces on Gains (pending-order index vs trade index) → a recovery control must
  never be handed a trade index, or it will act on the wrong thing.
- The member switches accounts mid-flow → the previous account's positions and any in-flight
  confirmation are cleared immediately.
- The member's wallet is on the wrong chain for the venue → the app switches, waits for the switch
  to settle, and only then requests the signature.
- A stop-loss would sit beyond the liquidation price → refused before the wallet prompt.
- The fee rate cannot be read → the member is told it could not be confirmed; opening is blocked
  rather than proceeding on a guessed rate; **closing is not blocked**.
- A passkey member opens a position → the smart account owns it; this is disclosed at confirm time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST NOT place any FairWins-controlled contract or address in a position's
  ownership path. Position ownership MUST resolve to the member's own account on every venue.
- **FR-002**: Members MUST be able to close and partially reduce open positions on Gains Network and
  GMX v2 from within the app.
- **FR-003**: Members MUST be able to set, change, and remove stop-loss and take-profit protection
  on open positions on every venue where opening is offered.
- **FR-004**: Members MUST be able to open new positions on Gains Network and GMX v2, with venue,
  direction, collateral, and leverage pre-selected to safe, sensible defaults that are all
  changeable.
- **FR-005**: Members MUST be able to recover collateral from orders that were neither filled nor
  cancelled, via a named control surfaced wherever the stuck order appears.
- **FR-006**: All position interactions MUST use the app's standard bottom-sheet pattern, meeting
  the same accessibility, focus-management, and dismissal behaviour as existing sheets.
- **FR-007**: The system MUST NOT report a position as opened, closed, or changed until the venue
  has executed it. Transaction inclusion, a successful API response, and a submitted operation are
  all reported as **pending**, distinctly from executed.
- **FR-008**: Venue rejections, cancellations, freezes, and timeouts MUST be surfaced with the
  venue's own stated reason where one exists, and MUST never be silently dropped.
- **FR-009**: Values that only exist after execution — fill price, actual size, liquidation price,
  realized P&L — MUST NOT be displayed as facts before execution. Pre-execution values are labelled
  as requested or estimated.
- **FR-010**: Platform fees MUST be charged only through each venue's own fee mechanism, under that
  venue's own enforced ceiling, and MUST be computed by the venue at execution so that a cancelled
  or unfilled order carries no FairWins fee.
- **FR-011**: The launch fee rate is **5 bps of notional**, configurable, never hardcoded in client
  or gateway code, and each rail's rate MUST be read from the contract that enforces it.
- **FR-012**: A zero fee rate MUST produce no fee line and behaviour identical to a fee-free
  integration.
- **FR-013**: Fee disclosure MUST appear before any signature, MUST state that perps fees are
  charged on notional rather than on the amount committed, and MUST show the money impact for the
  position being opened.
- **FR-014**: Sanctions screening MUST gate opening a position, fail closed on a positive result,
  and MUST NOT gate closing, reducing, cancelling, or recovering.
- **FR-015**: A jurisdiction and risk acknowledgement MUST gate opening a position, recording the
  member's attestation for the leveraged-derivatives product specifically, and MUST NOT gate any
  exit path.
- **FR-016**: The system MUST NOT circumvent any venue restriction. Where a venue restricts a
  member, the app states the venue as the source and offers the venue's own surface.
- **FR-017**: Venue operational state MUST be read live and honoured: a venue in close-only or
  paused mode disables opening on that venue with the reason shown, while leaving exits available.
- **FR-018**: Per-venue failure MUST stay isolated: an unreadable venue is named, its positions and
  pairs are omitted rather than shown stale, and other venues continue to work.
- **FR-019**: Where a venue cannot be supported for an account type, the app MUST show an honest
  per-account reason rather than a disabled or dead control.
- **FR-020**: Passkey (smart-account) members MAY open positions; the confirm step MUST disclose
  that the smart account owns the resulting position.
- **FR-021**: Hyperliquid remains read-only in this release, with an honest statement that
  management happens on the venue, and MUST NOT present any dead in-app management control.
- **FR-022**: Every fee-bearing or state-changing action MUST validate inputs and refuse with a
  plain reason **before** requesting a wallet signature.
- **FR-023**: Position and order activity MUST feed the platform's activity and reporting surfaces,
  disclosing honestly where a venue provides no chain-verifiable record.
- **FR-024**: Administrators MUST be able to change each perps fee rate from the admin surface, with
  the authority contract named, and MUST NOT be offered a control for a rate FairWins cannot
  enforce.
- **FR-025**: The product's terms and risk disclosures MUST name leveraged derivatives / perpetual
  futures before any execution path is enabled for members.
- **FR-026**: No perps functionality may be required by, or able to degrade, any existing value path
  in the product.

### Key Entities

- **Position**: A member's open exposure at a venue — venue, market, direction, size, collateral,
  entry price, leverage, liquidation price, unrealized P&L, and the venue-specific identifiers
  needed to act on it.
- **PendingOrder**: A submitted instruction the venue has not yet executed — venue, kind
  (open/close/reduce/protect), requested values, submitted-at, and its resolution state
  (pending / executed / rejected / frozen / timed-out) with the venue's reason.
- **ProtectionLevels**: Stop-loss and take-profit for a position, as stored by the venue, plus the
  money impact each implies.
- **VenueCapability**: What a venue currently permits — open, close-only, or paused — plus whether
  the app supports management there for this account type, with a reason when it does not.
- **PerpsFeeRail**: A venue's own fee mechanism — its authority contract, live rate, venue ceiling,
  and the unit it is expressed in.
- **TradeAttestation**: The member's recorded jurisdiction and leverage-risk acknowledgement, with
  its version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can close an open position in under 30 seconds from opening the Perps view,
  with no more than one wallet signature.
- **SC-002**: 100% of submissions distinguish "sent to venue" from "executed by venue" in the test
  suite; zero paths report success on inclusion alone.
- **SC-003**: 100% of venue rejections in the test suite surface a venue-provided reason.
- **SC-004**: Zero code paths gate a close, reduce, cancel, or recovery action on screening,
  jurisdiction, killswitch, or feature flag — verified by test.
- **SC-005**: Zero FairWins-controlled addresses appear in any position-ownership field of any
  venue call — verified by test against constructed calldata.
- **SC-006**: A member opening a position needs to change at most two fields from the defaults to
  submit a valid order.
- **SC-007**: Fee disclosure appears before signature in 100% of fee-bearing flows, and no fee line
  appears at a zero rate.
- **SC-008**: The management surfaces pass automated WCAG 2.1 AA checks with zero violations in
  light and dark themes.
- **SC-009**: A stuck or frozen order always presents a recovery control — no test scenario produces
  collateral in limbo with no visible action.
- **SC-010**: Existing suites stay green and the feature adds unit, integration, and end-to-end
  coverage for its own paths.

## Assumptions

- Members hold their own collateral and pay their own gas; FairWins never holds funds, never owns a
  position, and holds no approval on a member's behalf.
- Each venue's own fee mechanism remains available and capped as measured; a venue raising or
  removing its cap does not change FairWins' configured rate.
- Gains referral revenue requires the venue to whitelist FairWins and pays out of the venue's own
  fees; until that is confirmed on-chain, no revenue is claimed anywhere in the product.
- Hyperliquid management, its account-funding flow, and support for smart-account signatures there
  are follow-up work, not silently missing features.
- Venue market data continues to arrive through the existing read proxy, and its failure degrades
  reads only.
- The terms amendment naming leveraged derivatives is a prerequisite for enabling execution, not a
  parallel task.
