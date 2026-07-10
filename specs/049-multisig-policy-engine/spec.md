# Feature Specification: Multisig Policy Engine

**Feature Branch**: `049-multisig-policy-engine`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Multisig policy engine (GitHub issue #852). Members need a way to set
policy on their account and on multisig accounts. As a member I want the capability to set policies
for multisig accounts created using the Protect on-chain multisigs. The 'Protect' view needs to be a
professional policy management portal where an account can deploy multisig accounts with configurable
rules that control the funds based on a policy engine. I want to be able to see account policies for
multisigs I am associated with and manage rules for deployed contracts in a clean modern UX."

## Overview

FairWins members can already create and operate shared multisig vaults from the **Protect** view
(spec 043): several owners jointly control funds, and any movement of money out of the vault needs a
threshold of owner approvals. Approvals are the only control, though — once enough owners sign,
*any* transaction goes through, for any amount, to any destination, at any time.

This feature adds a **policy engine**: a set of configurable, on-chain-enforced rules attached to a
vault that constrain what the vault's funds can do *even after the owners have approved a
transaction*. A policy is chosen when the vault is created (or attached later with the owners'
consent), is visible to every member associated with the vault, and can only be changed with the
same collective consent that moving money requires. The Protect view grows into a professional
policy management portal: members deploy vaults with rules, see at a glance which rules govern each
vault they belong to, and manage those rules over the vault's life in a clean, modern UX.

The rules in scope for v1 are the classic treasury controls:

- **Per-transaction spending limit** — no single outgoing transaction may exceed a set amount.
- **Daily spending limit** — total outgoing value within a 24-hour accounting window may not
  exceed a set amount (the window opens with the first counted spend and resets 24 hours later).
- **Recipient allowlist** — outgoing transfers may only go to a defined set of addresses.
- **Transaction delay (cooldown)** — a minimum time must pass between consecutive outgoing
  transactions.

Each rule is individually optional; a vault may have none, one, or several. Rules constrain only
movements of funds **out of** the vault — receiving funds is never restricted (consistent with the
custody feature's "only outbound movements need approval" principle).

## Clarifications

### Session 2026-07-10

- Q: The issue says members set policy "on their account and on multisig accounts" — does v1 cover
  personal (single-signer) accounts? → A: **Multisig vaults only.** Both acceptance scenarios in the
  issue concern multisigs, and rules on a personal account cannot be enforced on-chain the way vault
  rules can (a single signer can always bypass a self-imposed client-side rule). Personal-account
  policies are recorded as a future extension (see Out of Scope).
- Q: Can a policy be edited after the vault is deployed, and by whom? → A: **Yes, with collective
  consent.** A rule change is proposed by any owner and takes effect only after the vault's own
  approval threshold is met — the same bar as moving money. No single owner (including the creator)
  can weaken or remove rules unilaterally.
- Q: What happens if a policy would block the owners from ever moving funds (lockout)? → A:
  **Policy management itself is never blocked by fund rules.** Rules constrain fund movements only;
  proposing and approving a rule change is always possible, so owners can always loosen a policy
  that turned out to be too strict. A vault can therefore never be permanently locked by its own
  policy.
- Q: Do policies apply to vaults created before this feature ships? → A: **Yes, opt-in.** An
  existing vault has no policy by default; its owners may attach one through the same
  threshold-approved change flow.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attach a policy while creating a vault (Priority: P1)

A member opens **Protect** and creates a new shared vault. As part of the creation flow, they reach
a **Policy** step where they can enable and configure rules — a per-transaction limit, a daily
limit, a recipient allowlist, and/or a transaction delay — or skip the step for an unrestricted
vault. When the vault is created, the chosen rules are live on-chain from the vault's first
transaction onward.

**Why this priority**: This is acceptance scenario 1 of the issue and the core of the feature —
policy at creation is the moment of highest leverage, because the rules are in force before any
funds arrive.

**Independent Test**: Create a vault with a per-transaction limit of 100 units and a two-address
allowlist; confirm the vault deploys, the policy is shown on the vault's detail view, and an
approved transaction that violates either rule does not execute while a compliant one does.

**Acceptance Scenarios**:

1. **Given** a connected member creating a vault in Protect, **When** they reach the Policy step,
   **Then** they can enable any combination of the four rule types, configure each enabled rule's
   parameters, and see a plain-language summary of the policy before deploying.
2. **Given** a member who configures a policy and deploys the vault, **When** the vault is created
   on-chain, **Then** the policy is active immediately and appears on the vault's detail view with
   the exact configured parameters.
3. **Given** a member who skips the Policy step, **When** the vault is created, **Then** the vault
   behaves exactly as today (threshold approvals only, no rules) and its detail view shows "no
   policy".
4. **Given** a policy-enabled vault with a fully approved outgoing transaction that violates a rule
   (e.g. exceeds the per-transaction limit), **When** execution is attempted, **Then** the
   transaction does not execute and the member is told which rule blocked it.

---

### User Story 2 - See the rules that govern my vaults (Priority: P1)

A member opens Protect and sees, for every vault they are associated with, whether it has a policy
and what that policy is. Opening a vault shows a clear, plain-language view of each active rule and
its parameters (e.g. "Max 500 USDC per transaction", "Recipients limited to 3 approved addresses"),
plus live rule state where relevant (e.g. how much of today's daily limit is already spent, when
the next transaction is allowed).

**Why this priority**: This is acceptance scenario 2 of the issue. Rules that members cannot see
are not a policy — visibility is what makes the constraint trustworthy for co-owners.

**Independent Test**: Load a policy-enabled vault as a co-owner; confirm the policy summary appears
in the vault list and every rule with its parameters and current state renders on the detail view,
matching on-chain values.

**Acceptance Scenarios**:

1. **Given** a member with two vaults (one with a policy, one without), **When** they open Protect,
   **Then** the vault list distinguishes the policy-governed vault and summarizes its rules.
2. **Given** a co-owner viewing a policy-enabled vault, **When** they open its policy view, **Then**
   every active rule is shown with its parameters, in plain language, matching the on-chain state.
3. **Given** a vault with a daily limit partially consumed, **When** a member views the policy,
   **Then** they see how much of the limit is used and remaining for the current window.
4. **Given** a member who loads by address an existing vault that another interface gave a policy,
   **When** the vault is loaded, **Then** its rules are read from the chain and displayed the same
   as rules created in-app.

---

### User Story 3 - Manage rules on a deployed vault (Priority: P2)

An owner of a deployed vault proposes a policy change — adding a rule, adjusting a parameter,
removing a rule, or attaching a first policy to a vault that has none. Co-owners see the proposed
change side-by-side with the current policy and approve or ignore it. Once the vault's approval
threshold is met, the change executes and the new rules are in force.

**Why this priority**: Policies must evolve with the group (new payees, changed budgets), but this
builds on US1/US2 — a vault whose policy can be seen and set at creation is already valuable.

**Independent Test**: On a 2-of-3 vault with a 100-unit per-transaction limit, propose raising the
limit to 200; confirm the change is inert after one approval, live after two, and that the policy
view reflects the new limit.

**Acceptance Scenarios**:

1. **Given** an owner of a policy-enabled vault, **When** they propose a rule change, **Then**
   co-owners can see the current and proposed policy side by side before approving.
2. **Given** a proposed policy change with fewer approvals than the vault's threshold, **When** a
   member checks the vault, **Then** the current policy remains in force unchanged.
3. **Given** a proposed policy change that reaches the vault's threshold, **When** it executes,
   **Then** the new rules govern the very next outgoing transaction and the policy view updates.
4. **Given** a vault with no policy, **When** its owners complete the same change flow to attach
   one, **Then** the vault becomes policy-governed without redeployment or moving funds.
5. **Given** a vault whose policy is so strict no funds can move, **When** owners propose and
   approve a loosening change, **Then** the change executes despite the rules (policy management is
   never blocked by fund rules).

---

### User Story 4 - Pre-flight policy feedback when proposing transactions (Priority: P3)

When a member proposes an outgoing transaction from a policy-enabled vault, the app checks the
transaction against the vault's rules *before* it is proposed and warns which rule it would violate
(e.g. "exceeds today's remaining daily limit by 40 USDC"). The member can adjust the transaction or
proceed knowing it will be blocked at execution.

**Why this priority**: Quality-of-life on top of enforcement. The chain blocks violations with or
without this story; pre-flight feedback saves co-owners from approving doomed transactions.

**Independent Test**: On a vault with a recipient allowlist, draft a transfer to a non-allowlisted
address; confirm the violation warning appears before proposal, names the rule, and disappears when
the recipient is changed to an allowlisted address.

**Acceptance Scenarios**:

1. **Given** a policy-enabled vault, **When** a member drafts a transaction that violates a rule,
   **Then** the specific violated rule and the violating value are shown before the proposal is
   submitted.
2. **Given** a drafted transaction that complies with all rules, **When** the member reviews it,
   **Then** no policy warning is shown.

---

### Edge Cases

- A policy blocks an approved transaction at execution time even though it passed pre-flight when
  proposed (e.g. the daily window filled up in between): the member is told which rule blocks it
  now and that the proposal remains valid to retry later (e.g. next window).
- An empty recipient allowlist is not silently deny-all: enabling the allowlist rule requires at
  least one recipient, so owners cannot accidentally freeze the vault.
- Rule parameters at extremes (zero per-transaction limit, delay of years) are rejected or clearly
  warned about at configuration time; policy management remains available regardless (lockout-proof
  by design).
- A vault created outside the app, or a policy attached by another interface, renders correctly
  from on-chain state; unknown or unrecognized rule types are surfaced as "unrecognized rule —
  manage with the interface that created it" rather than hidden.
- Two policy-change proposals in flight at once: approvals are bound to the exact proposed content,
  so a stale approval cannot execute a different change than the one the owner saw.
- Networks where the policy engine is not deployed: vault creation still works with the Policy step
  shown as unavailable for that network, and existing vaults there show "policy unsupported on this
  network" instead of erroring.
- Native-coin and token amounts are limited by the same daily/per-transaction accounting rules the
  policy defines; the policy view states clearly which assets a limit covers.
- A member who is not an owner of a vault (mere observer via address) can see its policy but is
  offered no management actions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Members MUST be able to attach a policy to a new multisig vault during the creation
  flow in Protect, before the vault is deployed.
- **FR-002**: The policy engine MUST support four rule types in v1: per-transaction spending limit,
  24-hour-window spending limit, recipient allowlist, and minimum delay between outgoing
  transactions. Each rule is independently optional and configurable. The exact window semantics
  (when it opens and resets) MUST be disclosed in the policy view.
- **FR-003**: Rules MUST be enforced on-chain: an outgoing vault transaction that violates any
  active rule MUST NOT execute, even when it has collected the vault's full approval threshold.
- **FR-004**: Enforcement MUST apply only to movements of funds out of the vault; receiving funds
  into the vault MUST never be restricted by policy.
- **FR-005**: Every member associated with a vault MUST be able to see whether it has a policy, and
  view each active rule with its parameters in plain language, sourced from on-chain state.
- **FR-006**: The vault list in Protect MUST distinguish policy-governed vaults and summarize their
  rules; the vault detail view MUST show full rule details and live rule state (e.g. daily-limit
  consumption, next-allowed transaction time).
- **FR-007**: Changing a vault's policy (adding, modifying, or removing rules, or attaching a first
  policy to an existing vault) MUST require the vault's own approval threshold — the same consent
  bar as moving funds. No single owner may change policy unilaterally.
- **FR-008**: Policy management actions MUST NOT be subject to fund-movement rules, so that owners
  can always loosen or remove a policy that is too strict (a vault can never be permanently locked
  by its own policy).
- **FR-009**: Policy-change proposals MUST bind approvals to the exact proposed rule content, so an
  approval cannot be replayed for a different change.
- **FR-010**: Vaults with no policy MUST behave exactly as they do today; the policy engine is
  opt-in per vault and existing vaults are unaffected until their owners attach a policy.
- **FR-011**: When a transaction is blocked by policy, the member MUST be told which rule blocked it
  and, where meaningful, by how much (e.g. amount over limit, time remaining).
- **FR-012**: The app SHOULD check drafted vault transactions against the policy before proposal and
  surface any violation with the specific rule and value (pre-flight feedback).
- **FR-013**: Policy availability MUST be network-aware: on networks without the policy engine, the
  Policy step is shown as unavailable and existing vaults show that policy is unsupported there,
  without breaking any custody functionality.
- **FR-014**: Policies and rule states MUST be readable from on-chain state alone, so vaults and
  policies created or modified by other interfaces render correctly, and no platform-operated
  backend is required (consistent with the custody feature's on-chain-only discovery principle).
- **FR-015**: Rule configuration MUST validate parameters at entry (e.g. allowlist requires at
  least one address, limits must be positive) and warn about configurations that would block all
  transactions.
- **FR-016**: All policy events relevant to a member's vaults (policy attached, rule change
  proposed, rule change executed, transaction blocked by policy) MUST flow into the existing
  notification/activity system with per-source controls.

### Key Entities

- **Policy**: The set of rules attached to one vault. Exists on-chain; readable by anyone; mutable
  only through the vault's own approval threshold. A vault has zero or one policy.
- **Rule**: One constraint within a policy. Has a type (per-transaction limit, daily limit,
  recipient allowlist, transaction delay), parameters (amount, addresses, duration), and live state
  (consumed daily amount, last-transaction time).
- **Policy-change proposal**: A pending request to alter a vault's policy — the exact new rule
  content plus collected owner approvals. Executes when the vault's threshold is reached; inert
  before that.
- **Vault** *(existing, spec 043)*: The multisig account the policy governs. Gains an optional
  reference to its policy; otherwise unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can configure and deploy a vault with a policy in a single creation flow,
  adding no more than 2 minutes over policy-less vault creation.
- **SC-002**: 100% of outgoing transactions that violate an active rule are prevented from
  executing, in every combination of the four rule types.
- **SC-003**: 0 vault-lockout states are reachable: for every expressible policy, a threshold of
  owners can still execute a policy change.
- **SC-004**: A co-owner opening a policy-enabled vault sees the complete, accurate rule set
  (matching on-chain state) within 5 seconds on a typical connection.
- **SC-005**: 100% of policy changes require the vault's approval threshold; none can be performed
  by a single owner on a multi-owner vault.
- **SC-006**: Members drafting a rule-violating transaction see the specific violated rule before
  proposing in at least 95% of cases (pre-flight check coverage).
- **SC-007**: Existing vaults and all custody flows continue to work unchanged when no policy is
  attached (zero regressions in the spec 043 acceptance suite).

## Assumptions

- **Scope**: v1 covers policies on multisig vaults only. "Policy on my personal account" from the
  issue is out of scope because single-signer accounts cannot have rules enforced against their own
  signer on-chain; it is listed under Out of Scope as a future extension.
- The four v1 rule types (per-transaction limit, daily limit, recipient allowlist, transaction
  delay) are the accepted interpretation of "configurable rules that control the funds"; further
  rule types (e.g. per-asset budgets, role-based limits) can be added later without changing the
  model members see.
- Spending-limit rules account value in the vault's primary treasury denominations (native coin and
  the platform's supported stable token); exotic tokens a limit cannot value pass through limit
  rules unvalued but remain subject to allowlist and delay rules. The policy view discloses this.
- The existing vault creation, loading, proposal, and approval flows from spec 043 are reused; this
  feature layers policy on top rather than replacing custody flows.
- Policy support follows custody support per network: it is offered only on networks where both the
  custody contracts and the policy engine are deployed (Mordor first, then Polygon, consistent with
  the platform's launch sequencing).
- Vault references and labels remain covered by the app-wide encrypted backup (spec 043); policy
  state itself lives on-chain and needs no backup.
- Two policy views exist for non-owners only in read form; policy management surfaces require the
  connected account to be a vault owner.

## Out of Scope

- Policies on personal (single-signer) accounts — future extension; requires a different
  enforcement model (e.g. smart-account-based).
- Off-chain custody policies (the "Off chain" Protect section remains disabled).
- New rule types beyond the four listed (per-asset budgets, weekly/monthly windows, role-tiered
  limits, oracle-conditioned rules).
- Changing anything about vault ownership/threshold mechanics themselves — owners and thresholds
  are managed exactly as in spec 043.
- Platform-operated policy services or backends; everything is on-chain plus client.
