# Feature Specification: Sponsored Paymaster for Passkey Smart Accounts

**Feature Branch**: `050-sponsored-paymaster`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Self-hosted verifying paymaster for passkey smart-account (ERC-4337) transactions on Polygon — FairWins-sponsored gasless UserOps. Users of passkey smart accounts (spec 041) can send USDC and native MATIC transfers, controller changes, and other account-native UserOperations without holding any native MATIC, because FairWins sponsors the gas via a paymaster it operates. The user explicitly rejected third-party paymasters (Pimlico/Circle/etc.) — this must be a FairWins-operated, self-managed service that reuses the existing bundler and relay-gateway."

## Context & Motivation *(informative)*

Passkey smart-account transfers (spec 041) currently **fail at submission** with the
EntryPoint error `AA21 — Smart Account does not have sufficient funds`. No paymaster is
configured, so every UserOperation must self-fund gas from the account's own native
balance. That fails whenever the account holds no native token (the common case for a
stablecoin-only user) and is unreliable during network gas spikes, where the required
prefund for a first-use account deployment can approach or exceed the whole balance.

Meanwhile the product already presents these transfers as **"Gasless · sponsored — no
network fee."** That claim is currently untrue, which violates the honest-state principle.
This feature makes the claim true by having **FairWins sponsor the gas** through a paymaster
it owns and operates — reusing the two services that already exist (the self-hosted bundler
and the relay-gateway) rather than adopting any third-party paymaster.

This is a **deliberate expansion of spec 041 FR-015** ("FairWins deploys no paymaster and
sponsors nothing"). **For the passkey UserOperation path, this spec supersedes that
decision.** All other spec 041 posture (user-owned accounts, screening keyed off the account
address, never-stranded fallback) is preserved.

## Clarifications

### Session 2026-07-10

- Q: Which accounts get their gas sponsored (eligibility scope)? → A: All FairWins passkey
  smart accounts that pass sanctions screening and are within rate limits — **identity-open, not
  membership-gated**. Spend is bounded by per-account + global rate limits, the bounded pool, and
  the killswitch rather than by narrowing who is eligible.
- Q: What abuse-control model should sponsorship enforce? → A: **Defense-in-depth** — per-account
  count/window limit **plus a per-operation sponsored-gas ceiling** plus a global rate cap plus a
  bounded pool. The per-op ceiling stops a single deliberately-expensive operation from burning a
  large slice of the pool. Exact numbers are tuned in the plan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Send funds with no native token, for free (Priority: P1)

A person with a passkey smart account that holds only USDC (zero MATIC) opens Pay & Transfer,
chooses to send USDC — or native MATIC — to a recipient, confirms once with their passkey, and
the transfer completes. They are never asked to hold or top up MATIC, and they pay no network
fee. On the very first action, the account is also deployed on-chain in the same step, still
at no cost to the user.

**Why this priority**: This is the entire point of the feature and the current blocker.
Without it, passkey transfers are broken for any user without native token. It is the minimum
viable, independently demonstrable slice.

**Independent Test**: Fund a fresh passkey account with only USDC on the validation network,
attempt a USDC transfer and a native transfer, and confirm both succeed with zero native
balance and no fee charged to the user.

**Acceptance Scenarios**:

1. **Given** a passkey account holding USDC and zero native token, **When** the user sends a
   USDC transfer, **Then** the transfer is included on-chain, the recipient receives the USDC,
   and the user's native balance is unchanged (they paid nothing).
2. **Given** a passkey account holding native token and zero prior activity (undeployed),
   **When** the user sends a native transfer, **Then** the account is deployed and the transfer
   is included in the same confirmation, sponsored.
3. **Given** a passkey user changing their account controllers (add/remove a controller),
   **When** they confirm, **Then** the controller change is included, sponsored, with no native
   token required.
4. **Given** an elevated network gas price, **When** the user submits any of the above,
   **Then** the action still succeeds without the user needing additional native token.

---

### User Story 2 - Honest fee disclosure and never-stranded fallback (Priority: P1)

Before confirming, the user sees an accurate statement of what the action costs them. When
sponsorship is available, it truthfully reads as free (sponsored by FairWins). When sponsorship
is **not** available — the service is unreachable, the account is ineligible, a limit is
reached, or sponsorship is paused — the user is told plainly that they will pay the network fee
themselves, and can still complete the action by self-submitting with their own native token.
The user is never left unable to act and is never shown a "free" claim that turns out false.

**Why this priority**: The honest-state principle is non-negotiable, and the never-stranded
rule is a standing platform guarantee. The current UI shows a "free" claim that is false; a
correct disclosure is required for this feature to ship at all.

**Independent Test**: Force each sponsorship-unavailable condition (service down, ineligible
account, limit exceeded, paused) and confirm the confirm screen switches to an honest
"you pay the network fee" disclosure and the self-submit path completes the action.

**Acceptance Scenarios**:

1. **Given** sponsorship is available for the account and action, **When** the confirm screen is
   shown, **Then** it states the action is free / sponsored, and the completed action matches
   that (the user pays nothing).
2. **Given** sponsorship is unavailable for any reason, **When** the confirm screen is shown,
   **Then** it states the user pays the network fee themselves and, if they lack native token,
   tells them what they need — never presenting a false "free."
3. **Given** sponsorship is unavailable and the user holds enough native token, **When** they
   proceed, **Then** the action completes via self-submission (they pay their own gas).
4. **Given** sponsorship is unavailable, **When** the disclosure is shown, **Then** at no point
   is the user blocked from an available path to complete the action.

---

### User Story 3 - Sponsorship budget is protected from abuse (Priority: P2)

The operator's pool of sponsorship funds cannot be drained or griefed. Only eligible accounts
receive sponsorship: an account that fails compliance screening, or that exceeds its allowed
rate of sponsored actions, or any account while sponsorship is paused, is refused sponsorship
(and falls back to self-submit per User Story 2). A single operator control can immediately halt
all sponsorship. The maximum funds at risk at any moment are bounded and known.

**Why this priority**: Sponsoring gas spends real operator money on every action, so abuse
resistance is required before exposing it beyond a controlled test — but the core value
(User Stories 1–2) can be demonstrated first in a bounded environment, so this is P2 rather
than P1.

**Independent Test**: From a sanctioned/ineligible account and from an account past its rate
limit, attempt sponsored actions and confirm sponsorship is refused (with working self-submit
fallback); trip the pause control and confirm all sponsorship stops instantly; verify the funds
held in the sponsorship pool are bounded to the configured amount.

**Acceptance Scenarios**:

1. **Given** an account that fails compliance screening, **When** it requests sponsorship,
   **Then** sponsorship is refused and no operator funds are spent on it.
2. **Given** an account that has exceeded its allowed rate of sponsored actions in the current
   window, **When** it requests another, **Then** sponsorship is refused until the window resets.
3. **Given** the operator activates the pause control, **When** any account requests sponsorship,
   **Then** all sponsorship is refused until the control is released.
4. **Given** the global sponsorship rate limit for the platform is reached, **When** further
   requests arrive, **Then** they are refused rather than draining the pool.
5. **Given** any refusal above, **When** the user still wants to act, **Then** the self-submit
   fallback (User Story 2) remains available.

---

### User Story 4 - Operators see sponsorship runway before it runs out (Priority: P3)

The operator can see how much sponsorship funding remains and how long it will last at the
current burn rate, alongside the existing bundler-executor and relayer gas-wallet monitoring, so
the pool can be topped up before it empties and starts silently failing sponsored actions.

**Why this priority**: Prevents a slow, invisible outage but is not required to demonstrate the
feature; it hardens operations after the core is proven.

**Independent Test**: Read the operator telemetry and confirm it reports the sponsorship pool's
remaining balance and an estimated time-to-empty, and that a low-runway condition is surfaced.

**Acceptance Scenarios**:

1. **Given** the sponsorship pool has a balance, **When** an operator checks telemetry, **Then**
   it reports the remaining balance and an estimated runway (time-to-empty) at current burn.
2. **Given** the runway falls below a warning threshold, **When** telemetry is checked, **Then**
   the low-runway condition is clearly surfaced for action.

---

### Edge Cases

- **First-use deployment during a gas spike**: the sponsored amount must cover account
  deployment plus the action; sponsorship accounts for the full first-use cost, not just the
  call.
- **Sponsorship approved but inclusion fails** (e.g., the action itself reverts on-chain): the
  user is shown an honest failed-action state; operator exposure is limited to the gas actually
  consumed, and a refused/expired sponsorship never lingers as a reusable free pass.
- **Sponsorship service reachable but declines** vs. **service unreachable**: both resolve to the
  same honest "you pay the network fee" fallback; the user experience does not depend on which.
- **Replay / reuse of a sponsorship approval**: an approval is bound to a single specific action
  and cannot be reused for a different one or after it expires.
- **Compliance status changes between screening and inclusion**: screening decision is bound to
  the specific action and a short validity window; stale approvals expire.
- **Account holds some but not enough native token when sponsorship is unavailable**: the honest
  disclosure states the exact shortfall so the user knows what to add.
- **Network without a deployed sponsorship pool** (e.g., ETC/Mordor in this increment): the
  passkey path behaves as it does today (self-submit / native fee), with honest disclosure — no
  broken "free" promise.

## Requirements *(mandatory)*

### Functional Requirements

**Sponsored execution (core)**

- **FR-001**: The system MUST allow a passkey smart-account holder to complete account-native
  UserOperations — at minimum: USDC transfer, native-token transfer, controller add/remove, and
  first-use account deployment — **without holding any native token**, with the gas paid by
  FairWins.
- **FR-002**: First-use account deployment MUST be sponsored together with the user's action in a
  single confirmation (no separate, unsponsored deploy step).
- **FR-003**: Sponsorship MUST remain effective under elevated network gas prices — the amount
  sponsored MUST cover the actual required cost at submission time, including deployment when
  applicable.
- **FR-004**: Sponsorship MUST reuse the existing submission bundler unchanged; no new
  always-on operator service may be introduced beyond extending the existing relay-gateway
  policy service.

**Honest disclosure & never-stranded (core)**

- **FR-005**: The confirmation UI MUST disclose the true cost to the user before they confirm:
  "free / sponsored" only when sponsorship is actually available for that account and action;
  otherwise an honest "you pay the network fee" disclosure.
- **FR-006**: The system MUST NOT present a sponsored/"free" claim that the completed action does
  not honor.
- **FR-007**: When sponsorship is unavailable for any reason, the user MUST retain a path to
  complete the action by self-submitting and paying their own network fee (never-stranded).
- **FR-008**: When the user lacks the native token needed to self-submit, the disclosure MUST
  state the shortfall so the user knows what is required.

**Policy gating & abuse resistance**

- **FR-009**: Sponsorship MUST be granted only to accounts that pass compliance/sanctions
  screening (keyed off the account address, consistent with existing platform screening).
  Eligibility is **identity-open**: any FairWins passkey smart account that passes screening and
  is within rate limits qualifies — sponsorship MUST NOT be gated on membership tier.
- **FR-010**: Sponsorship MUST enforce defense-in-depth spend controls: a **per-account
  count limit per time window**, a **per-operation sponsored-gas ceiling** (a single operation
  cannot be sponsored above a configured gas amount, sized to cover first-use deployment plus a
  normal action), and a **global rate cap** — such that neither a single account, nor a single
  expensive operation, nor aggregate load can drain the sponsorship pool. (Concrete thresholds are
  set in the plan.)
- **FR-011**: An operator MUST be able to immediately halt all sponsorship (pause control) and
  release it later; while paused, all requests are refused and fall back to self-submit.
- **FR-012**: A sponsorship approval MUST be bound to a single specific action and a short
  validity window, and MUST NOT be reusable for a different action or after expiry.
- **FR-013**: The total operator funds at risk in the sponsorship pool at any moment MUST be
  bounded to a configured amount (a drained pool fails safe to self-submit, never to loss beyond
  the deposit).
- **FR-014**: Refusing sponsorship MUST NOT spend operator funds on the refused request.

**Scope & networks**

- **FR-015**: Sponsorship MUST be scoped to app-originated passkey account-native actions; the
  system MUST NOT offer open-ended sponsorship of arbitrary externally-crafted operations.
- **FR-016**: The feature MUST target Polygon (137) for production, with the validation network
  (Amoy, 80002) used to prove it first; ETC/Mordor are explicitly deferred and MUST degrade to
  honest self-submit where no sponsorship pool exists.
- **FR-017**: On a network with no deployed sponsorship pool, the passkey path MUST continue to
  function via self-submit with honest disclosure (no regression, no false "free").

**Operations, custody & observability**

- **FR-018**: The signing authority that authorizes sponsorship MUST be held under the same
  managed-key custody standard as existing operator keys; no key material or secret may be
  committed to the repository.
- **FR-019**: The sponsorship pool's remaining balance and an estimated runway (time-to-empty at
  current burn) MUST be observable by operators alongside existing gas-wallet monitoring, with a
  low-runway condition surfaced before depletion.
- **FR-020**: Enabling or disabling sponsorship MUST be a configuration switch: with sponsorship
  unconfigured or disabled, behavior is identical to today (self-submit / native fee), and the
  UI discloses accordingly (fail-open to honest self-submit, never to a broken state).

**Governance**

- **FR-021**: This feature supersedes spec 041 FR-015 **for the passkey UserOperation path
  only**; all other spec 041 guarantees (user-owned accounts, address-keyed screening,
  never-stranded) remain in force and MUST be preserved.

### Key Entities *(include if feature involves data)*

- **Sponsorship request**: an eligibility question about a specific pending passkey action
  (which account, which action, on which network). Resolves to granted or refused.
- **Sponsorship approval**: a single-use, time-bounded authorization that permits the operator's
  pool to pay the gas for exactly one specific action. Not transferable or reusable.
- **Sponsorship policy**: the rules that decide grant vs. refuse — compliance screening result,
  per-account and global rate limits, and the pause control state.
- **Sponsorship pool**: the bounded operator-funded balance from which sponsored gas is paid; has
  a remaining balance and a burn rate.
- **Sponsorship signer**: the managed authority whose approval the pool honors; refusing to
  approve is the primary abuse control.
- **Fee disclosure**: the pre-confirmation statement of true cost to the user (sponsored/free vs.
  user-pays-network-fee, including any shortfall).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A passkey user holding **zero native token** can complete both a USDC transfer and
  a native-token transfer on the production network in a single confirmation each, at **no cost
  to the user**.
- **SC-002**: For eligible accounts under normal conditions, **at least 99%** of sponsored action
  attempts that the user confirms are included on-chain without the user supplying native token.
- **SC-003**: In **100%** of cases where sponsorship is unavailable, the user is shown an honest
  "you pay the network fee" disclosure and retains a working path to complete the action
  (never-stranded).
- **SC-004**: The pre-confirmation cost disclosure matches the actual outcome in **100%** of
  completed actions (no action shown as "free" that charges the user, and vice versa).
- **SC-005**: In abuse testing, **zero** operator funds are spent sponsoring accounts that fail
  screening, exceed their rate limit, or arrive while sponsorship is paused.
- **SC-006**: Activating the pause control halts **100%** of new sponsorship within one request
  cycle, and the maximum operator funds at risk never exceed the configured pool bound.
- **SC-007**: Operators can see the sponsorship pool's remaining balance and estimated runway at
  any time, and a low-runway warning is surfaced **before** the pool can empty.
- **SC-008**: On a network with no sponsorship pool, the passkey transfer path continues to work
  via self-submit with no false "free" claim (no regression versus today).

## Assumptions

- Passkey smart accounts (spec 041) are already live on the target networks, and the existing
  self-hosted bundler and relay-gateway policy service are operational and reused here.
- The account/bundler stack remains on its current EntryPoint version; this feature does not
  migrate account addresses or the bundler.
- FairWins accepts the recurring cost of paying gas for eligible passkey actions; at expected
  early volume on the target network this cost is small and is managed via the bounded pool and
  rate limits.
- **Eligibility** (resolved in Clarifications): sponsorship is offered to **all** FairWins passkey
  smart accounts that pass compliance screening and are within rate limits — identity-open, not
  membership-gated. Spend is bounded by rate limits, the pool cap, and the killswitch.
- Managed-key custody equivalent to the existing operator/relayer key arrangement is available
  for the sponsorship signer.
- USDC transfer and native-token transfer are the primary sponsored actions; controller
  add/remove and first-use deployment are included. Sponsorship of other future account-native
  actions can extend the same mechanism.
- Compliance screening reuses the platform's existing address-keyed screening rather than a new
  screening system.
- This is an operator/infrastructure feature; the primary end-user-visible surface is the
  Pay & Transfer confirmation experience and the fact that transfers "just work" without native
  token.
