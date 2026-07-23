# Feature Specification: Earn — Liquid & Delegated Staking

**Feature Branch**: `065-liquid-delegated-staking`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Several assets we support on platform now support liquid and
delegated staking. Research how we can implement this as part of the 'finance > earn > staking'
section. A user should be able to see a view similar to the lending view where each asset shows the
terms and underlying information. This should come as a new feature and must be properly wired into
all necessary systems such as notifications, event logs, and the portfolio bottom sheets."

## User Scenarios & Testing *(mandatory)*

FairWins members already lend idle stablecoins through the **Earn** section (Lending vaults). Several
assets the platform supports — notably the native network coins and their wrapped forms — now offer
**staking**: a way to put a proof-of-stake asset to work securing a network and earn a protocol
reward. This feature adds a **Staking** area to the existing Earn section, presented with the same
non-intimidating, card-per-option layout as Lending. Each staking option shows the asset, the reward
rate, who provides the staking, how much is already staked, and the terms that make staking different
from lending — a lock-up or unbonding wait before funds come back, and (for delegated staking) the
risk of validator penalties. Members can stake, track the resulting position, unstake, and — where a
provider distributes claimable rewards — claim them, all from their own wallet with FairWins never
taking custody.

Two staking models are covered, presented honestly for what they are:

- **Liquid staking** — the member stakes an asset (e.g. ETH) and receives a **liquid staking token**
  (an LST, e.g. a staked-ETH token) that represents the position and keeps growing in value. The LST
  can be held, and unstaking may route through the provider's withdrawal queue.
- **Delegated staking** — the member **delegates** an asset to a chosen validator/operator. There is
  no liquid token; the principal is locked and, when the member unstakes, it enters an **unbonding
  period** before it can be withdrawn. Rewards accrue and are claimable or auto-compounded per the
  provider's model, and the member is exposed to **slashing** risk if the validator misbehaves.

The Staking area replaces the currently-disabled "Stake" placeholder in the Earn hub and flips on the
disabled "Stake" action already stubbed in the portfolio asset detail sheet.

### User Story 1 - Discover Staking and stake a supported asset (Priority: P1)

A member opens **Earn** and, alongside **Lend**, now sees a **Stake** area (no longer a "coming later"
placeholder). Opening it shows a curated list of staking options for the active network family — laid
out just like the lending vault list. Each option card shows the asset it stakes, whether it is
**Liquid** or **Delegated** staking, the current estimated reward rate (APR), the total amount already
staked, who provides the staking (e.g. the staking protocol / validator identity), and the key terms:
any lock-up or unbonding wait, whether a liquid staking token is received (and which one), and any
minimum. Every unfamiliar term has an info bubble; nothing assumes prior staking knowledge, and a
plain risk disclosure explains slashing and smart-contract risk. The member picks an option, enters an
amount (with a Max shortcut bounded by their balance), reviews a clear summary of exactly what will
happen — including the wait to get funds back — confirms in their wallet, and sees their new staking
position reflected.

**Why this priority**: This is the core of the request — a member cannot stake anything until they can
discover the area and complete a stake. A member who can only stake (liquid) and see the position
already has a viable, valuable MVP that mirrors the lending experience.

**Independent Test**: With a connected account holding a supported stakeable asset on a supported
network, navigate to Earn → Stake, complete a stake, and confirm the position (staked amount + current
value, and the liquid staking token where applicable) appears in the Staking area. Delivers the full
stake-to-earn loop.

**Acceptance Scenarios**:

1. **Given** a connected member on a network where staking is supported, **When** they open Earn,
   **Then** a **Stake** area appears as a live, selectable area (not a disabled "coming later" tile).
2. **Given** a member opens Earn → Stake on a supported network, **When** the list loads, **Then** they
   see one card per staking option showing asset, staking model (Liquid/Delegated), estimated reward
   rate, total staked, provider/validator identity, and the lock-up/unbonding terms — each concept
   explained by an info bubble.
3. **Given** a member viewing a staking option with a balance of the required asset, **When** they enter
   an amount within their balance and confirm the stake (including any token-spending approval),
   **Then** the stake executes, a success state is shown, and their position appears with its current
   value (and the received liquid staking token, for liquid options).
4. **Given** a member on a network family with no staking support (e.g. an Ethereum Classic or Bitcoin
   network), **When** they open Earn → Stake, **Then** the area explains honestly that staking is not
   available on this network and names the networks where it is — no mock data, no dead buttons without
   explanation.
5. **Given** a staking option that returns a liquid staking token, **When** the member completes a
   stake, **Then** the summary and success state disclose which token they received and that its value
   is expected to grow relative to the underlying asset.

---

### User Story 2 - Unstake and withdraw with honest lock-up, unbonding, and rewards (Priority: P2)

A member with a staking position wants their asset — and any rewards — back. The feature makes the
staking-specific waiting honest and legible. For a **liquid** position, the member initiates an unstake
that routes through the provider's withdrawal path (which may be a queue with an estimated wait), or is
told plainly if the position is exited by trading/unwrapping the liquid token instead. For a
**delegated** position, the member requests an unstake, sees the **unbonding period** clearly before
confirming, and later returns to **withdraw** the now-unbonded funds. Where the provider distributes
separately-claimable rewards, the member can see the claimable amount and claim it in one action. At no
point does the UI imply funds are instantly available when they are not.

**Why this priority**: Getting funds back is the other half of a trustworthy staking experience, and the
lock-up/unbonding behavior is precisely what makes staking riskier and less liquid than lending — it
must be surfaced truthfully. It builds on Story 1 but is separately testable against any existing
position.

**Independent Test**: With an existing staking position, initiate an unstake, verify the UI discloses
the withdrawal-queue or unbonding wait before confirmation, confirm it, and (after the wait, simulated
in tests) withdraw the funds and verify the position shrinks or closes and the balance returns.

**Acceptance Scenarios**:

1. **Given** a member with a delegated position, **When** they choose Unstake, **Then** the UI shows the
   unbonding period and that funds are not immediately available, and requires acknowledgement before the
   wallet prompt.
2. **Given** a member has an unstake that has finished unbonding, **When** they open Staking, **Then** a
   clear "ready to withdraw" state is shown and a single action returns the funds to their account.
3. **Given** a member with a liquid position, **When** they choose to exit, **Then** the UI explains the
   available exit paths honestly (provider withdrawal request with its estimated wait, and/or holding the
   liquid token) — never presenting an instant cash-out that the provider does not offer.
4. **Given** a member with claimable staking rewards from a provider that distributes them separately,
   **When** they open the position and confirm Claim, **Then** the rewards are transferred to their
   account and the claimable amount updates.
5. **Given** staking data (rate, total staked, position value, unbonding status) cannot be fetched,
   **When** the member opens Staking, **Then** the UI shows an explicit "temporarily unavailable" state
   and disables new stakes rather than showing wrong or stale numbers as current truth.

---

### User Story 3 - Portfolio, notifications, and audit wiring (Priority: P2)

Staking is woven into the member's existing journeys exactly as lending is. From the **portfolio asset
detail sheet**, the previously-disabled **Stake** action becomes live for stakeable assets on supported
networks, deep-linking straight to the Staking area with the asset preselected (and stays disabled with
a plain reason when staking is not possible for that asset/network). The member's staking positions
surface in their portfolio view. Every staking action — stake, unstake request, withdraw, reward claim
— is recorded in the platform **activity ledger** (the durable financial audit trail) and produces a
**notification** feed entry; time-sensitive milestones (an unbonding period that has completed and is
ready to withdraw) generate an actionable notification that reaches the member even under a focused
notification profile.

**Why this priority**: This connects staking to portfolio-first discovery, the audit/tax record, and the
notification system the request explicitly calls out. It builds on Stories 1–2 and completes the wiring
requirements.

**Independent Test**: From the portfolio detail of a supported stakeable asset, tap Stake and land in the
Staking area scoped to that asset; perform a stake and confirm both an activity-ledger entry and a
notification feed entry are recorded; simulate a completed unbonding and confirm an actionable
"ready to withdraw" notification is delivered.

**Acceptance Scenarios**:

1. **Given** a member views a portfolio asset that can be staked on its network, **When** they open the
   asset detail sheet, **Then** the **Stake** action is enabled and deep-links to the Staking area scoped
   to that asset and network.
2. **Given** a member views a portfolio asset that cannot be staked, **When** they look at the Stake
   action, **Then** it is disabled with a plain-language reason (never a dead or missing control).
3. **Given** a member completes a stake, unstake, withdraw, or reward claim, **When** they open the
   platform activity feed and the financial activity ledger, **Then** each shows an entry describing the
   action (asset, amount, provider/validator, staking model, time) with a link to the transaction.
4. **Given** a member has a delegated position whose unbonding period completes, **When** the app next
   detects the change, **Then** an actionable "ready to withdraw" notification is generated and is
   delivered even when a notification profile would otherwise silence the staking category.
5. **Given** a member configures notification delivery preferences, **When** they open the notification
   category list, **Then** **Staking** appears as its own configurable category alongside the existing
   categories.

---

### Edge Cases

- **Unsupported network active**: Earn and the Stake area stay visible; the area explains staking
  availability honestly per network and offers the network switcher — no cross-network data leak.
- **Rate / total-staked / position data source unreachable**: the list shows an honest "temporarily
  unavailable" state; new stakes are disabled while data is stale rather than shown with wrong numbers.
- **Amount edge cases**: zero, dust, more than balance, below a provider minimum, or above a provider cap
  — all rejected before any wallet prompt, with a reason.
- **Two-step stakes**: when a token-spending approval is required first (staking a wrapped/ERC-20 form),
  the flow explains the two prompts up front so the second wallet prompt is expected, not alarming.
- **Gas-reserve on native staking**: staking a native coin (e.g. ETH) reserves enough of the coin to pay
  network fees; Max never leaves the member unable to transact.
- **Unbonding in progress**: a position mid-unbonding shows the remaining wait honestly and does not
  offer a withdraw until it completes; the member is not misled into thinking funds are available.
- **Withdrawal-queue liquidity**: when a liquid-staking provider's withdrawal request is queued, the UI
  surfaces the estimated wait honestly instead of implying instant redemption.
- **Slashing / value loss**: for delegated staking, the risk disclosure states that validator penalties
  (slashing) can reduce the staked amount; the UI never presents rewards as guaranteed.
- **Rewards cadence**: reward figures update on the provider's schedule (rewards accrue continuously but
  reported values refresh periodically); the UI communicates "as of" freshness rather than implying
  real-time, to-the-second accrual.
- **Reward/withdraw replay safety**: repeating a claim or a withdraw after it has completed never
  double-pays and never errors confusingly (follows the provider's cumulative/idempotent accounting).
- **Testnet/mainnet boundary**: positions, staking option lists, and rewards are scoped to the active
  network and never mix across the boundary.
- **Fee honesty**: if a platform fee applies to a staking action, it is disclosed as its own line in the
  flow before confirmation; while no fee applies, no fee is implied and behavior is identical to fee-free.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Earn section MUST present **Staking** as a live earning area alongside Lending,
  replacing the current disabled "Stake" placeholder, reachable on all networks and self-disclosing its
  availability per network.
- **FR-002**: On supported networks, the Stake area MUST list curated staking options with, at minimum:
  the staked asset, the staking model (**Liquid** or **Delegated**), the estimated reward rate (APR),
  the total amount already staked, the provider/validator identity, and the terms that differentiate
  staking from lending — lock-up or unbonding period, whether a liquid staking token is received (and
  which), and any minimum/cap. The list layout MUST mirror the existing Lending vault list so the two
  read as one consistent Earn experience.
- **FR-003**: Staking option and position data MUST come from live provider/on-chain data, never
  hardcoded sample numbers; when that data is unavailable the system MUST present an explicit
  unavailable state and MUST NOT present zeros or stale numbers as current truth.
- **FR-004**: Members MUST be able to stake a chosen amount of a supported asset (bounded by balance,
  a native-coin gas reserve, and any provider minimum/cap) with pre-transaction validation of amounts
  and a clear plain-language summary — including the wait to get funds back — before each wallet prompt.
- **FR-005**: For **liquid** staking, the system MUST disclose that a liquid staking token is received,
  name that token, and reflect the resulting position (staked value + the token received). For
  **delegated** staking, the system MUST disclose that the principal is locked, show the unbonding
  period, and reflect the delegated position.
- **FR-006**: Members MUST be able to initiate an unstake and, after any required unbonding/withdrawal
  wait, withdraw their funds; the UI MUST surface the wait honestly before confirmation and provide a
  clear "ready to withdraw" state when the wait has elapsed. The system MUST NOT imply funds are
  instantly available when the provider imposes a queue or unbonding period.
- **FR-007**: Where a staking provider distributes separately-claimable rewards, members MUST be able to
  see the claimable amount and claim it in a single action, with claim accounting that makes repeat
  claims safe.
- **FR-008**: Staking availability MUST be a per-network, per-asset capability configured (not hardcoded
  in components); unsupported networks/assets MUST present an honest explanation naming where staking is
  available. Delegated-staking validator/operator targets MUST be fixed configuration, never free-form
  user input.
- **FR-009**: The portfolio asset detail sheet MUST make its existing **Stake** action live for
  stakeable assets on supported networks — deep-linking to the Stake area scoped to that asset and
  network — and MUST keep it disabled with a plain-language reason when staking is not possible.
- **FR-010**: The member's active staking positions MUST surface in the portfolio experience (staked
  amount, current value, staking model, and unbonding/ready status), scoped to the active network.
- **FR-011**: Every staking action (stake, unstake request, withdraw, reward claim) MUST be recorded
  both in the platform **activity/notification feed** and in the durable **financial activity ledger**,
  each carrying asset, amount, provider/validator, staking model, timestamp, and a transaction link, and
  MUST travel in the member's encrypted backup like other ledger records.
- **FR-012**: **Staking** MUST be a first-class notification domain and a user-configurable notification
  **category** (selectable in delivery preferences and notification profiles), and a completed-unbonding
  "ready to withdraw" event MUST be an **actionable** notification that breaks through an otherwise-
  silencing notification profile.
- **FR-013**: Every screen in the Stake area MUST explain unfamiliar concepts (staking, APR, liquid
  staking token, delegation, validator, unbonding, lock-up, slashing, approvals) via the app's
  info-bubble pattern in plain language suitable for non-technical members; no jargon may appear without
  an adjacent explanation.
- **FR-014**: The Stake area MUST display the staking provider's identity ("Powered by …" / validator
  identity) and a risk disclosure covering third-party smart-contract risk, slashing/penalty risk for
  delegated staking, variable and non-guaranteed rewards, and the lock-up/unbonding illiquidity — none
  of which are guaranteed by FairWins.
- **FR-015**: Any platform fee on staking actions MUST be sourced exclusively from the single platform
  fee configuration (FeeRouter service, e.g. `earn.stake`), disclosed as its own line before signature,
  and never charged above the quoted rate; a zero fee MUST produce no fee line and behavior identical to
  the pre-fee path. FairWins MUST NEVER take custody of staked assets, liquid staking tokens, or rewards.
- **FR-016**: User documentation for staking (what it is, liquid vs delegated, how to stake, how
  unstaking/unbonding works, how rewards work, risks including slashing, and fees) MUST be published on
  the FairWins documentation site and linked from the Stake area.
- **FR-017**: All Stake views MUST meet the app's accessibility standard (WCAG 2.1 AA), including the
  info bubbles, forms, and stake/unstake/withdraw/claim controls.

### Key Entities *(include if feature involves data)*

- **Staking Option**: a curated way to stake one supported asset on one network. Attributes: network,
  asset, staking model (liquid/delegated), provider/validator identity, estimated reward rate (APR),
  total staked, liquid-staking-token (symbol/identity, for liquid options), lock-up/unbonding period,
  minimum/cap, listing/curation status.
- **Staking Position**: a member's stake in one option. Attributes: member account, option, staked
  amount, current value, staking model, liquid-token balance (liquid), unbonding entries with
  ready-at times (delegated), rewards earned to date, data freshness.
- **Unstake Request**: a pending exit from a delegated (or queued liquid) position. Attributes: option,
  amount, initiated time, unbonding/queue completion time, ready-to-withdraw state.
- **Staking Reward Balance**: provider-distributed claimable rewards attributable to a member (where the
  provider distributes them separately). Attributes: network, reward asset, claimable amount, cumulative
  claimed, data freshness.
- **Staking Activity Entry**: audit/notification record of a stake, unstake request, withdraw, or claim.
  Attributes: type, asset/token, amount, provider/validator, staking model, timestamp, transaction
  reference, and (for notifications) whether it is actionable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member holding a supported stakeable asset can go from opening the Stake area to a
  confirmed stake in under 3 minutes without external help.
- **SC-002**: 100% of staking-specific terms visible in the Stake area (APR, liquid staking token,
  delegation, validator, unbonding, lock-up, slashing, approval) have an adjacent plain-language info
  bubble, and every option surfaces its lock-up/unbonding terms before the member confirms.
- **SC-003**: 0 flows imply instant availability of funds that are subject to a withdrawal queue or
  unbonding period; every such wait is disclosed before the member confirms the unstake.
- **SC-004**: 100% of staking stakes, unstakes, withdraws, and claims performed in the app produce both
  an activity-feed entry and a financial-ledger entry with a working transaction link.
- **SC-005**: 100% of delegated positions whose unbonding completes generate an actionable "ready to
  withdraw" notification that is delivered even under an active focused notification profile.
- **SC-006**: On unsupported networks/assets, 0 staking actions are offered as if available; every
  unavailable state names at least one network where staking is available.
- **SC-007**: The portfolio Stake action routes to the correct pre-scoped Stake view for 100% of
  stakeable assets and is never rendered as an unexplained dead control for non-stakeable ones.
- **SC-008**: Accessibility audits of the new Stake views pass with zero critical violations.
- **SC-009**: The documentation site gains a staking user guide covering liquid vs delegated, staking,
  unstaking/unbonding, rewards, slashing risk, and fees, reachable from the site navigation and from the
  Stake area itself.

## Assumptions

- **Staking area within Earn**: staking ships as a new **area inside the existing Earn section**
  (Finance → Earn → Stake), reusing the Earn hub, list layout, and bottom-sheet patterns established by
  Lending (spec 050) — not a separate top-level section. This directly satisfies "a view similar to the
  lending view."
- **Two staking models**: both **liquid** and **delegated** staking are in scope, presented distinctly.
  Which model applies to a given asset is a property of the configured staking option, not a member
  choice beyond picking the option.
- **Supported networks/assets (initial)**: the intersection of FairWins-configured networks and
  available staking providers — Ethereum mainnet and Polygon PoS, where the native/wrapped proof-of-stake
  assets have established liquid-staking providers (and, where offered, delegated validator targets).
  Ethereum Classic, Bitcoin, Solana, and other configured networks present the honest unavailable state.
  New networks/assets are added by configuration later without component restructuring.
- **New stakeable assets & liquid staking tokens**: the liquid staking tokens produced by staking are
  not in the portfolio asset registry today; the feature adds the needed asset/display metadata so the
  received tokens and positions render correctly.
- **Delegated targets are curated config**: validator/operator delegation targets are fixed, curated
  configuration (the one deliberate divergence from Lending's API-discovered vaults) — never free-form
  user-entered addresses — so members cannot delegate to an unvetted target from within the app.
- **Custody model**: staking is executed directly from the member's connected account to the staking
  provider's audited contracts; FairWins never takes custody of staked assets, liquid staking tokens, or
  rewards.
- **Platform fee / attribution**: any staking platform fee is expressed only through the single platform
  fee configuration (FeeRouter `earn.stake` service, capped like other wrapped services), disclosed
  before signature; the initial release MAY ship fee-free (fee rate 0) with identical behavior, and the
  rate is later adjustable by fee administration without code changes.
- **Rewards model varies by provider**: liquid staking typically accrues value into the liquid token
  (no separate claim), while some delegated staking distributes separately-claimable rewards; the UI
  adapts per option and only shows a Claim action where the provider distributes claimable rewards.
- **Testnets**: provider data services generally do not cover testnets, so testnet behavior is the
  honest unavailable state; automated tests exercise flows with simulated data at the test layer only
  (never shipped).
- **No new backend, no new FairWins custody contract**: the feature is frontend-only, consuming
  providers' public data and audited on-chain contracts from the member's own wallet, consistent with
  the app's no-backend, non-custodial footprint (the only FairWins contract in the path is the optional
  shared FeeRouter, used only when a fee is configured).

## Dependencies

- The existing **Earn section** (spec 050): hub, curated-list layout, position list, and bottom-sheet
  patterns that the Stake area mirrors and extends.
- Existing per-network **capability configuration** (single source of truth for networks) and the
  portfolio asset **registry/taxonomy**, extended with a staking capability and the new stakeable
  assets / liquid staking tokens.
- The portfolio **asset detail sheet** (specs 044/055) and its already-stubbed disabled "Stake" action.
- The **activity/notification** system (specs 031 + 059): domain registry, notification categories,
  notification profiles with actionable/deadline break-through, and the polling activity sources.
- The **financial activity ledger** (spec 051): ledger classes, client-capture helpers, repository
  wiring, and the encrypted backup (spec 032).
- The **platform fee configuration** (spec 060 FeeRouter) for any staking fee (`earn.stake` service).
- Third-party staking providers: their staking/withdrawal contracts and any public data services for
  rates, totals, positions, and unbonding status.
- The FairWins documentation site (MkDocs) for the staking user guide.
