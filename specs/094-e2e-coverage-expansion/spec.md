# Feature Specification: End-to-End Coverage Expansion — Matrix, Tiering Policy, and the Missing Flows

**Feature Branch**: `claude/issue-1228-e2e-testing-cqx3lj`

**Created**: 2026-08-18

**Status**: Draft

**Input**: Issue #1228 — "System-wide inventory of missing end-to-end flow tests, and a tiering policy to keep the pipeline fast", extended by the requester with: capture performance metrics with Lighthouse, test mobile and desktop layouts, and include accessibility (a11y) testing.

## Why this exists

Getting `cypress/e2e/full/**` into the merge gate (#1028, #1223) took the on-chain tier from roughly one working test to 77/96 and surfaced two real product defects (#1226, #1227). It also made a structural problem plain: the full tier validates **one** product surface — 1v1 wagers, membership, and a slice of admin — while roughly sixty shipped features that move money are covered by nothing at that level.

A second problem is subtler and worse. Thirty-three branches across four full-tier specs end in `expect(true).to.be.true` behind a precondition guard, and several "success" assertions accept `'error'` or `'failed'` among their accepted terms. **A test that passes when its precondition is absent is worse than a missing test, because it reports as coverage.** Counting specs therefore overstates what is validated, and no amount of new tests fixes that unless assertion depth is measured too.

Adding tests ad hoc from here produces a suite that is both slow and holed in the same places. This feature establishes the inventory, the rules, and the first tranche of flows.

## User Scenarios & Testing *(mandatory)*

The "users" of this feature are the people who depend on the pipeline telling the truth: the maintainer deciding whether a PR is safe to merge, the contributor writing the next flow test, and — indirectly but most importantly — the member whose funds move through a path nobody drove before release.

### User Story 1 - A maintainer can see exactly what is validated and what is not (Priority: P1)

A maintainer opening the repository can read one checked-in document that maps every shipped spec to its member-facing flows, and for each flow states which tier covers it, how deep the assertions go, and — when it is uncovered — how much member money is at risk. Where a flow is deliberately not tested, the document says so and why, so the same gap is not re-discovered every quarter.

**Why this priority**: Nothing else can be prioritised honestly until this exists. It is also the only deliverable that is complete and useful on its own — the tests it points to can then be written in any order.

**Independent Test**: A reader who has never seen the suite can pick any shipped spec with a member-facing flow, find it in the matrix, and correctly predict whether a break in that flow would be caught by CI.

**Acceptance Scenarios**:

1. **Given** the matrix is checked in, **When** a reader looks up a shipped spec that has a member-facing flow, **Then** they find at least one row for it, with a status of covered, partial, absent, or out-of-scope.
2. **Given** a row with status "partial", **When** the reader reads the row, **Then** it names specifically what is missing, not merely that something is.
3. **Given** a row with status "out-of-scope", **When** the reader reads the row, **Then** it carries a reason that survives review (for example: the surface is read-only by design and there is nothing to drive).
4. **Given** a flow whose assertions cannot fail (an unconditional truth, or a success check that also accepts failure wording), **When** it appears in the matrix, **Then** its assertion depth is recorded as smoke or weaker — never as validated — regardless of the fact that a test exists and passes.
5. **Given** a new shipped feature merges without a matrix row, **When** CI runs, **Then** the omission is reported rather than discovered later by a reader.

---

### User Story 2 - A contributor knows which tier a new flow belongs in, and cannot silently write a test that cannot fail (Priority: P1)

A contributor about to write a flow test reads a short, checked-in policy that answers two questions without a judgement call: which tier does this belong in, and what must the test assert to count. The policy is enforced where it can be — the anti-patterns that produced the current false coverage fail the build rather than surviving review.

**Why this priority**: Written at the same time as the matrix or the matrix decays immediately. Every new test written under the old habits adds to the number this feature exists to correct.

**Independent Test**: Introduce a test containing each codified anti-pattern in turn; each is rejected by an automated gate with a message naming the rule.

**Acceptance Scenarios**:

1. **Given** a flow that can be validated with no chain, **When** it is placed in the on-chain tier, **Then** review has a written rule to cite in rejecting it.
2. **Given** a flow in which a member signs something that costs them money, **When** it has no on-chain-tier coverage, **Then** the matrix marks it as a gap regardless of how thoroughly the fast tier renders it.
3. **Given** a test asserting an unconditional truth (`expect(true).to.be.true`) with no comment declaring the genuinely-either-way outcome it stands for, **When** the gate runs, **Then** the build fails and names the file and line.
4. **Given** a test whose success assertion also accepts failure wording (for example an accepted-terms list containing both "resolved" and "failed"), **When** the gate runs, **Then** it is reported.
5. **Given** a test that depends on state left behind by an earlier test, **When** it is run alone, **Then** it still passes — establishing its own preconditions — or it fails loudly, never passes vacuously.

---

### User Story 3 - The money paths that nothing drives today get driven (Priority: P1)

The flows where a member's funds are escrowed, bridged, supplied, swept, or sent are exercised end to end against a real chain, through the real interface, with the outcome judged by chain state rather than by dialog wording.

**Why this priority**: This is the risk the inventory exists to retire. It is P1 alongside the matrix because the matrix without tests is a description of the problem.

**Independent Test**: For each flow in this tranche, a deliberately introduced defect in the corresponding product path causes exactly that test to fail.

**Acceptance Scenarios**:

1. **Given** a member creates a group wager pool, joins it with other members, and the creator proposes a payout matrix, **When** approval reaches the threshold and a winner claims, **Then** the winner's balance increased and the pool's on-chain state reflects the settlement.
2. **Given** a member is shown a platform fee before signing, **When** they sign, **Then** the amount actually taken is no greater than the rate disclosed, and a fee of zero produces no fee line at all.
3. **Given** a member recovers a legacy account and sweeps it, **When** one asset in the sweep fails, **Then** the remaining assets still move and the failure is reported per asset rather than aborting the run.
4. **Given** any flow in this tranche is run as the only test in the suite, **When** it executes, **Then** it establishes its own on-chain preconditions and passes.
5. **Given** a flow whose surface is unavailable in the local environment, **When** the test runs, **Then** it is skipped with a stated reason recorded in the matrix — never passed silently.

---

### User Story 4 - The member-facing surfaces are proven usable on a phone and by keyboard and screen reader (Priority: P2)

Every member-facing surface this feature touches is exercised at a phone viewport as well as a desktop one, and is checked against automated accessibility rules at the level the project already commits to (WCAG 2.1 AA). Failures name the element and the rule.

**Why this priority**: The constitution already requires WCAG 2.1 AA of new UI, and the current e2e accessibility spec checks a handful of hand-written conditions on one surface rather than running a ruleset across the app. Mobile is where most members are, and no flow test currently runs at a phone width. It is P2 only because a broken money path is worse than an inaccessible one.

**Independent Test**: Run the accessibility and viewport checks against a surface with a deliberately removed button label or a control that overflows the viewport; the run fails and names the offender.

**Acceptance Scenarios**:

1. **Given** a member-facing surface in scope, **When** the suite runs at a phone viewport, **Then** the flow completes and no interactive control is unreachable or clipped off-screen.
2. **Given** a surface in scope, **When** the accessibility ruleset runs against it, **Then** serious and critical violations fail the build and are reported with the element and rule id.
3. **Given** a violation that is known and accepted, **When** it is suppressed, **Then** the suppression names the issue tracking it, so exceptions stay countable rather than accumulating.
4. **Given** a modal or drawer is open, **When** the accessibility check runs, **Then** it evaluates the modal's content, not the page behind it.

---

### User Story 5 - Performance regressions on member-facing surfaces are caught before release (Priority: P3)

Key member-facing routes carry a performance budget measured on both a desktop and an emulated mobile profile. A change that materially slows a surface is reported against that budget rather than noticed by a member.

**Why this priority**: Valuable and cheap to extend — a Lighthouse job already exists — but it measures one route on one profile with warn-level assertions, so today it cannot fail on a regression. This is the smallest-value item of the five and depends on nothing else.

**Independent Test**: Add a deliberate blocking cost to a budgeted route; the run reports a budget breach for that route naming the metric.

**Acceptance Scenarios**:

1. **Given** the budgeted routes, **When** the audit runs, **Then** each is measured on both a desktop and a mobile profile and both results are recorded.
2. **Given** a measured route regresses past its budget, **When** the audit runs, **Then** the result is reported against the budget with the metric named.
3. **Given** a route cannot be measured (the build failed, the server never came up), **When** the audit runs, **Then** it reports as unmeasured and fails — never as a passing score.

---

### Edge Cases

- **A flow whose backing infrastructure is not available locally.** Several surfaces (Polymarket order placement, Across bridging, hardware devices, the relayer) cannot be driven against a local chain without a stand-in. Each such flow must land as either a fast-tier test of everything that does not need the venue, or an explicit out-of-scope row with the reason — never a test that skips silently and reports green.
- **A test that passes because its precondition never arrived.** The condition that produced 33 vacuous branches. A test must establish its own preconditions and fail if it cannot.
- **A suppressed accessibility violation with no owner.** Suppressions without a tracking reference become permanent; they must be countable.
- **A route that cannot be measured for performance.** An unmeasured route reported as a pass is the same defect as a green gate over a crashed run.
- **A viewport at which a control exists but is unreachable.** Present in the DOM and visible to a query is not the same as reachable by a member's thumb; the phone-viewport checks must assert reachability, not existence.
- **The matrix going stale.** A shipped feature merging with no row silently re-creates the problem this feature solves.

## Requirements *(mandatory)*

### Functional Requirements

**The coverage matrix**

- **FR-001**: The repository MUST contain a checked-in coverage matrix mapping each shipped spec that has a member-facing flow to one or more rows of: flow, tier, assertion depth, status, money-at-risk, and — where uncovered — a proposed tier.
- **FR-002**: Status MUST be one of covered, partial, absent, or out-of-scope. "Partial" MUST name what is missing. "Out-of-scope" MUST carry a reason.
- **FR-003**: Assertion depth MUST be recorded as a distinct value from status, on a scale that separates a test that proves an outcome from one that proves a page rendered. A flow whose only test cannot fail MUST NOT be recorded above smoke.
- **FR-004**: Money-at-risk MUST be recorded per row on a stated scale, so the backlog can be ordered by consequence rather than by convenience.
- **FR-005**: An automated check MUST report shipped specs that have no matrix row, so the matrix cannot silently go stale.

**The tiering policy**

- **FR-006**: The repository MUST contain a written tiering policy defining each tier's purpose, its cost, and what belongs in it.
- **FR-007**: The policy MUST state that a flow validatable without a chain MUST NOT live in the on-chain tier.
- **FR-008**: The policy MUST state that a flow in which a member signs something that costs them money MUST have on-chain-tier coverage.
- **FR-009**: The policy MUST record a runtime budget per tier and state what happens when a tier exceeds it.
- **FR-010**: The policy MUST carry the anti-patterns that produced the current false coverage, each with the failure it caused, and the fixture and precondition conventions a new test is expected to follow.

**Enforcement**

- **FR-011**: An automated gate MUST fail the build on an unconditional-truth assertion in any end-to-end tier that is not accompanied by a comment declaring the genuinely-either-way outcome it stands for.
- **FR-012**: An automated gate MUST report success assertions that also accept failure wording.
- **FR-013**: Each test MUST establish its own preconditions and MUST fail, not pass, when a precondition cannot be established.
- **FR-014**: Where an outcome is settled on-chain, tests MUST judge it by chain state rather than by interface wording.

**The flows**

- **FR-015**: The uncovered flows MUST be prioritised by money-at-risk, and that prioritised backlog MUST be recorded as tracked work items rather than left inside this document.
- **FR-016**: The flows the matrix marks absent MUST each be carried by a tracked work item that names the flow, its tier, its money-at-risk and the matrix row it closes, so no gap exists only inside a document. The tests themselves land against those items (see Delivery phasing), each judged by resulting state.
- **FR-017**: Flows whose disclosure is the invariant — a fee shown before a signature, an additive venue fee shown as its own line, a sponsored-versus-member-pays distinction — MUST assert that what was disclosed matches what was charged, not merely that a disclosure was rendered.
- **FR-018**: A flow that cannot be driven in the available environment MUST be recorded as out-of-scope with its reason, or reduced to the portion that can be driven — never left as a test that skips silently.

**Viewports and accessibility**

- **FR-019**: Member-facing flows in scope MUST be exercised at both a phone and a desktop viewport, with the viewport set explicitly rather than inherited.
- **FR-020**: At the phone viewport, every control a flow requires MUST be reachable and operable; a control that is present but unreachable MUST fail.
- **FR-021**: An accessibility ruleset MUST run against the member-facing surfaces in scope, failing the build on serious and critical violations at WCAG 2.1 AA, reporting the element and rule.
- **FR-022**: Accessibility checks MUST evaluate the currently-presented surface, including the contents of an open modal or drawer rather than the page behind it.
- **FR-023**: Any suppressed accessibility violation MUST name the issue tracking it.

**Performance**

- **FR-024**: Key member-facing routes MUST carry a recorded performance budget and be measured on both a desktop and a mobile profile.
- **FR-025**: A measured regression past budget MUST be reported against the budget, naming the metric and route.
- **FR-026**: A route that could not be measured MUST be reported as unmeasured and MUST fail; it MUST NOT be reported as a passing score.

**Pipeline cost**

- **FR-027**: The feature MUST record the measured wall-clock cost of each tier before and after its changes.
- **FR-028**: A decision on parallelising the on-chain tier MUST be recorded with the measurement it rests on, including the case for not doing it.

### Key Entities

- **Flow**: One member-facing journey through a shipped feature, from entry point to settled outcome. The unit the matrix rows and the tests are both keyed on.
- **Tier**: A named execution context with a cost and an admission rule — no chain, on-chain, and account-native.
- **Assertion depth**: How much a test proves. Distinguishes a test that pins an outcome from one that pins a rendered page, and from one that cannot fail at all.
- **Money-at-risk**: What a member stands to lose if the flow breaks unnoticed. Orders the backlog.
- **Coverage row**: The join of a flow to its tier, assertion depth, status and risk — the matrix's record type.
- **Budget**: A recorded ceiling — wall clock for a tier, a performance metric for a route — against which a measurement is reported.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every shipped feature with a member-facing flow appears in the matrix; a reader can pick any one at random and find its row.
- **SC-002**: The count of end-to-end assertions that cannot fail is zero, or every remaining one carries a stated reason; the number is reported rather than estimated.
- **SC-003**: A maintainer can decide the tier for a new flow from the written policy alone, without asking.
- **SC-004**: Each newly covered flow fails when a defect is deliberately introduced into the product path it drives, and passes when run as the only test in the suite.
- **SC-005**: Every member-facing surface in scope is exercised at a phone viewport as well as a desktop one.
- **SC-006**: Serious and critical accessibility violations on surfaces in scope are zero, or suppressed with a named tracking issue; the count of suppressions is visible.
- **SC-007**: Every budgeted route reports a measurement on both profiles, or reports as unmeasured and fails.
- **SC-008**: The wall-clock cost of each tier is measured and recorded, and the on-chain tier's cost after this work is stated against the budget the policy sets.
- **SC-009**: A shipped feature merging without a matrix row is reported by CI rather than discovered by a reader.

## Assumptions

- The chain-isolation harness merged in #1222/#1223 — per-spec and per-test checkpointing, clock synchronisation between browser and chain, and custom-error decoding — is the foundation new tests build on. This feature does not re-invent it.
- The existing tier names and directory layout stay; this feature adds rules and rows to them rather than restructuring.
- The local environment is a single local chain plus the built frontend. External venues (Polymarket's order book, Across, OpenSea, perpetuals venues, hardware devices) are not available to drive, so flows depending on them are covered up to the venue boundary or recorded as out-of-scope.
- The accessibility standard is WCAG 2.1 AA, as the constitution already requires; this feature applies it to flows rather than raising the bar.
- The phone viewport is the smaller of the two profiles measured; a tablet profile is out of scope unless the matrix turns up a flow that only exists there.
- Rewriting the 33 existing vacuous branches is in scope for this feature's backlog, but is expected to land as its own reviewed change rather than inside the same commit as the matrix — they are money-path tests.
- **Delivery phasing (decided with the requester).** This feature ships the *foundation*: the matrix, the tiering policy, the enforcement gates, the shared viewport/accessibility/performance harness, the CI wiring, and the sharding of the on-chain tier. Every uncovered flow ships against its own tracked sub-issue of #1228, prioritised by money-at-risk. The requirements above define the whole feature; the phasing decides only what lands in which change. FR-016's tracked items are the mechanism that keeps the rest from being forgotten.
- **Gate strength (decided with the requester).** Accessibility blocks: serious and critical violations fail the build, as constitution V already requires of new UI. Performance reports: budgets are baselined from the current measured values and a breach is reported, because Lighthouse numbers on shared runners are noisy enough that a failing budget would mostly report the runner. A route that could not be measured still fails — an unmeasured route reported as a pass is a green gate over a crashed run.
- Performance budgets are set from the current measured values, so the first run establishes the baseline rather than failing the build on day one.
- The suite runs in the merge gate on the same runner class as today; a materially different runner would invalidate the recorded budgets.

## Out of Scope

- Rewriting the product to fix defects the new tests find. Defects get their own issues, as #1226 and #1227 did.
- Cross-browser coverage. The suite runs one browser engine; adding more is a separate cost decision.
- Load, soak, or adversarial testing. Contract-level fuzzing is already covered elsewhere.
- Visual regression snapshots. The actor-critic screenshot loop covers visual review and is not merged into this suite.
- Anything requiring a live mainnet or a funded testnet account.
