# Feature Specification: Protect Multi-Chain Vaults & Advanced Policy Engine

**Feature Branch**: `067-protect-multi-chain-policies`

**Created**: 2026-07-25

**Status**: Draft

**Input**: User description: "Protect needs to allow for deployment on different supported base
chains and needs to carry this information so users are aware of which accounts are on which chain.
The owners entry needs to reuse our common address entry with QR and address book. The policy list
needs to allow for: policy priority ordering (rule 001 is enforced before 002 if both apply);
a + b / c approvals (Alice and Bob both must approve up to a limit, Charlie can always approve up
to the limit if needed); token-specific limits; a || b up to a limit, a + b for a higher limit;
approved contracts (ability to approve Uniswap, Morpho, and other on-chain services supported on
the platform); ability to reorder the policy list easily in the UX. These would cover team
management for a trading team or a family wanting control over their assets. Protect also needs to
be moved to the Tools section."

## Overview

**Protect** is FairWins' shared-custody portal: members create multisig vaults whose funds move
only with a threshold of owner approvals (spec 043), optionally constrained by an attached policy
(spec 049 — per-transaction limit, daily limit, recipient allowlist, cooldown).

This feature grows Protect along three axes so it can serve a trading team's treasury or a family
managing shared assets:

1. **Multi-chain vaults.** A vault can be deployed on any supported base chain where the custody
   stack is available, and every vault permanently carries its chain identity. Members always see
   which vault lives on which chain — in the vault list, on vault detail, and on every action —
   and are guided to switch networks when a vault lives elsewhere. Vaults on different chains are
   listed together so the member sees their whole custody estate at once.

2. **An ordered, expressive policy engine.** The flat rule set from spec 049 becomes an ordered
   list of numbered policy rules (001, 002, …) evaluated top-down. Rules can now express:
   - **Approver-set (quorum) rules** — "Alice AND Bob must both approve" or "Charlie alone may
     approve", each up to a configured limit (a + b / c).
   - **Tiered approval limits** — "Alice OR Bob alone up to a lower limit; Alice AND Bob together
     up to a higher limit" (a || b up to X, a + b up to Y).
   - **Token-specific limits** — spending limits scoped to a specific token, not just native
     value (e.g. 500 USDC per transaction, separate from the ETC limit).
   - **Approved-contract rules** — allow the vault to interact with named on-chain services the
     platform already supports (e.g. the network's swap venue, lending markets) and other
     explicitly approved contract addresses.
   - **Priority ordering** — when more than one rule could apply to a transaction, the
     lowest-numbered matching rule governs it; members can reorder rules easily (and safely) in
     the UX, with reordering itself a threshold-approved change.

3. **A more polished, consistent UX.** The owners entry in vault creation and management reuses
   the platform's common address entry (paste, QR scan, and address book pick — the same entry
   members already know from Pay & Transfer), and Protect moves from the Finance group to the
   Tools group in the navigation, alongside Address Book, Recovery, Reporting, and Network.

Existing vaults and their spec-049 policies keep working unchanged; the new rule engine is opt-in
per vault through the same collective-consent flow that governs all policy changes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deploy and manage vaults across supported chains (Priority: P1)

A member opens Protect and creates a vault, choosing (or confirming) which supported base chain it
deploys to. Afterward, every vault they belong to is listed with a clear chain identity — name and
badge — regardless of which network their wallet is currently on. Selecting a vault on a different
chain shows its details read-only with a one-tap prompt to switch networks before acting.

**Why this priority**: Chain identity is the foundation everything else sits on. A treasury team
holding vaults on two chains must never confuse them; sending an approval to the wrong network's
vault is the most expensive mistake this feature prevents.

**Independent Test**: Create one vault on chain A and load one on chain B; confirm both appear in
the vault list with correct chain labels while connected to either network, that actions on the
off-network vault are disabled with a switch prompt, and that switching networks enables them.

**Acceptance Scenarios**:

1. **Given** a member connected to a supported network, **When** they create a vault, **Then** the
   creation flow states plainly which chain the vault will deploy to, and the deployed vault
   records that chain permanently.
2. **Given** a member with vaults on more than one chain, **When** they open Protect, **Then**
   every saved vault is listed with its chain name/badge, including vaults on chains other than
   the currently connected one.
3. **Given** a vault on a chain other than the connected one, **When** the member opens it,
   **Then** its stored details are visible, all state-changing actions are disabled, and a clearly
   labeled control offers to switch the wallet to the vault's chain.
4. **Given** a network where the custody stack is not deployed, **When** the member views Protect
   on that network, **Then** vault creation is honestly unavailable for that chain while vaults on
   other chains remain listed.

---

### User Story 2 - Configure ordered approver and limit rules (Priority: P1)

A trading team's lead configures a vault policy as an ordered list of numbered rules. They add an
approver-set rule ("Alice and Bob together may approve up to 10,000 USDC"), a solo-approver rule
("Charlie alone may approve up to 10,000 USDC"), a tiered rule ("Alice or Bob alone up to 1,000
USDC; Alice and Bob together up to 25,000 USDC"), and a token-specific limit ("at most 2 ETC per
transaction"). Each rule shows its priority number, and the policy summary explains in plain
language which rule governs a given transaction.

**Why this priority**: The expressive rule engine is the core of the request — it is what turns
Protect from "N of M signatures" into real treasury management for teams and families.

**Independent Test**: Attach a two-rule policy (rule 001: A+B up to a limit; rule 002: C alone up
to the same limit) to a vault; confirm a transaction approved by A and B within the limit
executes, a transaction approved by C alone within the limit executes, a transaction approved by
A alone does not, and a transaction above the limit does not execute regardless of approvals.

**Acceptance Scenarios**:

1. **Given** a vault owner composing a policy, **When** they add rules, **Then** each rule gets a
   sequential priority number (001, 002, …) and the list is displayed in enforcement order.
2. **Given** a rule of type approver-set, **When** it is configured, **Then** it names one or more
   required approvers (all must approve) chosen from the vault's owners, an optional amount limit,
   and an optional token scope.
3. **Given** two rules that could both apply to the same transaction, **When** the transaction is
   evaluated, **Then** the lowest-numbered matching rule governs it, and the policy summary states
   this ordering rule in plain language.
4. **Given** a tiered configuration (rule 001: A or B alone up to X; rule 002: A and B together up
   to Y > X), **When** a transaction between X and Y is proposed, **Then** it can only execute
   once both A and B approve, and a transaction at or below X executes with either A's or B's
   approval.
5. **Given** a token-specific limit rule for token T, **When** a transaction moves token T,
   **Then** the rule's limit applies to that token's amount; transactions in other tokens are not
   constrained by that rule.
6. **Given** a fully approved transaction that no rule permits, **When** execution is attempted,
   **Then** it does not execute and the member is told which rule blocked it (or that no rule
   allows it).

---

### User Story 3 - Approve platform-supported contracts/services (Priority: P2)

A family managing shared savings wants their vault to use the platform's supported on-chain
services — swap on the network's venue, deposit into a supported lending market — without opening
the vault to arbitrary contract calls. An owner adds an approved-contracts rule picking services
from the platform's per-network catalog (e.g. Uniswap, Morpho) and, if needed, adds a specific
contract address manually. Calls to approved contracts can proceed under the vault's approval
rules; calls to any other contract are blocked.

**Why this priority**: Service interactions are what make a treasury productive, but they are also
the widest attack surface; a curated allowlist is the control that makes DeFi usage safe enough
for shared funds.

**Independent Test**: Add an approved-contracts rule allowing only the network's swap venue;
confirm a fully approved vault transaction calling the venue executes and an identical transaction
calling an unlisted contract does not, with the blocking rule named.

**Acceptance Scenarios**:

1. **Given** an owner composing an approved-contracts rule, **When** they open the service picker,
   **Then** they see the on-chain services the platform supports on the vault's chain, each with a
   recognizable name, and may also enter a contract address manually with a clear warning that
   manually added contracts are not platform-vetted.
2. **Given** a vault with an approved-contracts rule, **When** a fully approved transaction calls
   a listed contract, **Then** it may execute (subject to the other rules).
3. **Given** the same vault, **When** a fully approved transaction calls a contract not on the
   list, **Then** it does not execute and the member is told the contract is not approved.
4. **Given** a vault with no approved-contracts rule, **Then** contract interactions behave as
   they do today (no contract allowlist restriction).

---

### User Story 4 - Reorder the policy list easily (Priority: P2)

An owner realizes rule 003 should take precedence over rule 002. In the policy editor they move
the rule up — by dragging or with explicit move up/down controls — see the list renumber, and see
a plain-language preview of what changes ("Rule 'Charlie solo up to 10k' will now be checked
before 'A+B up to 25k'"). Because ordering changes enforcement, the reorder is proposed and
becomes live only after the vault's approval threshold is met, like any policy change.

**Why this priority**: Priority ordering only works if members can actually manage it; a policy
list you cannot reorder safely hardens into a mistake.

**Independent Test**: With a two-rule policy, swap the rules' order, confirm the pending change
shows old and new order side by side, approve to threshold, and confirm subsequent transactions
are governed by the new order.

**Acceptance Scenarios**:

1. **Given** the policy editor, **When** an owner reorders rules by dragging or with move up/down
   controls, **Then** the list renumbers immediately in the editor and the change is staged, not
   yet live.
2. **Given** a staged reorder, **When** the owner reviews it, **Then** the previous and proposed
   order are both shown with a plain-language note on what the reorder changes.
3. **Given** a staged reorder, **When** the vault's approval threshold approves it, **Then** the
   new order is enforced on-chain for subsequent transactions; until then, the old order stays in
   force.
4. **Given** reorder controls, **Then** they are operable by keyboard and screen reader, not by
   pointer drag alone.

---

### User Story 5 - Owners entry with QR and address book (Priority: P2)

While creating a vault (or proposing an owner change), a member adds owners using the same address
entry used across the platform: paste an address, scan a QR code, or pick from their address book.
Book entries show their saved names; scanned and pasted addresses validate immediately.

**Why this priority**: Owner addresses are the highest-stakes addresses a member ever enters — a
typo'd owner can lock funds. Reusing the proven shared entry removes hand-typing from the risk
path, but it builds on flows that already work.

**Independent Test**: In vault creation, add one owner by address-book pick, one by QR scan, and
one by paste; confirm all three validate, display consistently (book names shown where known), and
land in the deployed vault's owner set.

**Acceptance Scenarios**:

1. **Given** the owners step of vault creation, **When** the member activates an owner field,
   **Then** they can paste an address, scan a QR code, or pick an address-book entry — the same
   capabilities as the platform's other address entries.
2. **Given** an owner address that exists in the member's address book, **When** it is entered by
   any method, **Then** the saved name is displayed alongside the address.
3. **Given** an invalid or malformed address, **When** it is entered, **Then** the field flags it
   before the member can proceed.

---

### User Story 6 - Protect lives in the Tools section (Priority: P3)

A member opening the navigation finds Protect grouped under **Tools** (with Address Book,
Recovery, Reporting, Network) rather than under Finance. Existing links and bookmarks keep
working.

**Why this priority**: A one-line organizational change that better reflects what Protect is — an
account-security tool, not a spending surface — but it carries no functional risk and can ship
any time.

**Independent Test**: Open the navigation drawer and the mobile section bar; confirm Protect
appears in the Tools group in both, no longer appears under Finance, and its existing deep link
still opens the Protect panel.

**Acceptance Scenarios**:

1. **Given** the navigation drawer, **When** it renders, **Then** Protect is listed in the Tools
   group and absent from Finance.
2. **Given** the mobile bottom section bar while in Protect, **When** it renders, **Then** it
   shows Protect's Tools-group siblings.
3. **Given** an existing deep link to the Protect panel, **When** it is opened, **Then** it lands
   on Protect exactly as before.

---

### Edge Cases

- **Two rules match one transaction**: the lowest-numbered matching rule governs; the evaluation
  never "falls through" to a later rule to find a more permissive outcome (see FR-011). The UX
  must make this visible before it surprises anyone: the rule composer warns when a new or
  reordered rule is fully shadowed by an earlier one.
- **No rule matches a transaction** (policy exists but is silent for this token/amount/
  destination): the transaction cannot execute; members are told no rule permits it. A policy, once
  attached, is a whitelist of allowed movements — silence is denial. The vault's base threshold
  alone is only sufficient when the vault has no policy.
- **Approver named in a rule is later removed as an owner**: rules referencing a non-owner are
  flagged as broken in the policy view; a transaction whose governing rule requires a removed
  owner cannot execute until the policy is amended (protecting the "all named approvers must
  approve" guarantee rather than silently weakening it).
- **Vault chain vs. connected chain mismatch mid-flow**: if the wallet switches networks while a
  Protect action is in progress, the action halts with an honest error naming both chains — it
  must never submit to the wrong chain.
- **Token-limit rule for a token the vault does not hold**: allowed (rules may pre-date deposits);
  the rule simply never matches until that token moves.
- **Approved contract also receives value**: a call that both invokes an approved contract and
  transfers value must satisfy the applicable amount-limit rules as well — contract approval never
  exempts a transaction from spending limits.
- **Reorder proposed while another policy change is pending**: only one policy change may be
  pending per vault at a time; a second proposal is rejected with an explanation until the first
  is approved, rejected, or withdrawn.
- **Legacy spec-049 policies**: keep enforcing exactly as shipped; the vault detail shows them in
  the same policy list UI (as unnumbered legacy rules) with an owner-consented upgrade path to the
  ordered engine.
- **Custody stack deployed on some chains only**: creation is offered only where deployed;
  elsewhere Protect states the limitation honestly per chain while still listing the member's
  vaults on other chains.
- **QR scan denied camera permission**: the owners entry degrades exactly as the platform's shared
  address entry does elsewhere (paste and book pick remain available).

## Requirements *(mandatory)*

### Functional Requirements

**Multi-chain vaults & chain identity**

- **FR-001**: Members MUST be able to create a vault on any supported base chain where the custody
  stack is deployed, and the creation flow MUST state plainly, before deployment, which chain the
  vault will live on.
- **FR-002**: Every vault record MUST permanently carry its chain identity, and every surface that
  shows a vault (list, detail, proposals, approvals, policy views) MUST display that chain by name
  and badge.
- **FR-003**: The vault list MUST show all of the member's saved vaults across all chains,
  regardless of the currently connected network, each labeled with its chain.
- **FR-004**: When the connected network differs from a vault's chain, the vault MUST be viewable
  read-only, all state-changing actions MUST be disabled, and the member MUST be offered a
  clearly labeled network-switch action; no Protect action may ever be submitted to a chain other
  than the vault's own.
- **FR-005**: On networks without the custody stack, vault creation MUST be presented as honestly
  unavailable for that chain (consistent with existing behavior), without hiding the member's
  vaults on other chains.

**Owners entry**

- **FR-006**: Every owner-address input in Protect (vault creation and owner-change flows) MUST
  use the platform's common address entry, offering paste, QR scan, and address-book selection
  with the same validation and display behavior as the platform's other address entries.
- **FR-007**: Owner addresses that match address-book entries MUST display their saved names
  wherever owners are shown in Protect.

**Ordered policy rule engine**

- **FR-008**: A vault policy MUST be an ordered list of rules, each with a visible sequential
  priority number (001, 002, …) reflecting enforcement order; renumbering follows automatically
  from reordering.
- **FR-009**: Members MUST be able to compose rules of the following kinds, in any combination:
  - (a) **Approver-set rules**: a named set of one or more vault owners who must ALL approve,
    with an optional amount limit and optional token scope. Multiple rules express alternatives —
    e.g. rule "A and B up to L" plus rule "C up to L" realizes "a + b / c".
  - (b) **Tiered limits**: expressible as ordered approver-set rules with different limits — e.g.
    "A or B alone up to X" (two single-approver rules or one any-of set) followed by "A and B
    together up to Y > X".
  - (c) **Token-specific limits**: per-transaction and/or daily amount limits scoped to a named
    token, independent of limits on the native asset or other tokens.
  - (d) **Approved-contract rules**: a set of contract addresses the vault may interact with,
    selectable from the platform's per-network catalog of supported services and/or entered
    manually.
- **FR-010**: Approver-set rules MUST only reference current vault owners at composition time; if
  a referenced approver later stops being an owner, the policy view MUST flag the rule as broken
  and transactions governed by it MUST NOT execute until the policy is amended.
- **FR-011**: When a transaction is evaluated, the lowest-numbered rule whose scope matches
  (token, amount, destination/contract as applicable) MUST govern it; later rules MUST NOT be
  consulted for a governed transaction. If no rule matches, the transaction MUST NOT execute.
- **FR-012**: A transaction MUST execute only when (a) a governing rule exists, (b) the rule's
  required approvers have all approved, (c) the amount is within the rule's limit(s), and (d) the
  destination/contract is permitted; on any violation the member MUST be told which rule blocked
  it or that no rule allows it.
- **FR-013**: Approved-contract rules MUST NOT exempt a transaction from amount-limit rules: a
  call that transfers value must satisfy both.
- **FR-014**: Rule enforcement MUST happen on-chain (the same enforcement standard as spec 049);
  the UX summary is explanatory, never the enforcement mechanism.
- **FR-015**: The policy composer MUST present each rule and the whole policy in plain language,
  and MUST warn when a rule can never apply because an earlier rule fully shadows it.

**Policy lifecycle & ordering UX**

- **FR-016**: Members MUST be able to reorder rules with drag interactions AND with keyboard-
  operable move up/down controls; the staged order MUST renumber immediately in the editor.
- **FR-017**: Every policy change — adding, editing, removing, or reordering rules — MUST take
  effect only after the vault's own approval threshold approves it, per the spec-049 consent
  model; until approval the previous policy stays in force.
- **FR-018**: A staged policy change MUST present a before/after comparison (including order
  changes) in plain language prior to proposal and during approval.
- **FR-019**: Only one policy change proposal may be pending per vault at a time; further
  proposals MUST be rejected with an explanation until the pending one resolves.
- **FR-020**: Existing spec-049 policies MUST continue to enforce unchanged; vaults may adopt the
  ordered engine only through the threshold-approved change flow, and the policy view MUST render
  legacy rules alongside (but visually distinct from) ordered rules.
- **FR-021**: Policy management itself MUST never be blocked by fund-movement rules (no-lockout
  guarantee carried forward from spec 049).

**Approved-services catalog**

- **FR-022**: The platform MUST provide a per-chain catalog of supported on-chain services (e.g.
  the network's swap venue, supported lending markets) for the approved-contracts picker, each
  with a recognizable name; the catalog MUST only list services on the vault's own chain.
- **FR-023**: Manually entered contract addresses MUST be accepted in approved-contract rules with
  a clear warning that they are not platform-vetted.

**Navigation**

- **FR-024**: The Protect entry MUST move from the Finance group to the Tools group in the app
  navigation (drawer and mobile section bar alike), and existing deep links to the Protect panel
  MUST keep working unchanged.

### Key Entities

- **Vault**: a shared multisig account; now permanently annotated with the chain it lives on.
  Attributes: address, chain identity, owners, base threshold, attached policy (legacy or
  ordered).
- **Policy**: the ordered list of rules attached to a vault; exists in exactly one form per vault
  (none, legacy spec-049, or ordered) and changes only by threshold-approved proposals.
- **Policy Rule**: one numbered entry in a policy. Kind (approver-set, token limit, approved
  contracts), priority number, scope (token, amount bounds, destinations/contracts), and effect
  (required approver set, limit values, allowlist).
- **Approver Set**: a named subset of vault owners referenced by a rule; "all listed must
  approve" semantics, with alternatives expressed as separate rules.
- **Service Catalog Entry**: a platform-recognized on-chain service (name + contract address +
  chain) offered in the approved-contracts picker.
- **Policy Change Proposal**: a staged add/edit/remove/reorder with before/after state, subject
  to vault-threshold approval; at most one pending per vault.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a session with vaults on two different chains, members can state which vault is
  on which chain without leaving the vault list (chain is visible on 100% of vault surfaces), and
  zero Protect actions can be submitted to the wrong chain.
- **SC-002**: A member can compose and stage the full example policy from the feature request —
  "A+B up to a limit / C alone up to the limit", a tiered "A or B up to X, A+B up to Y", one
  token-specific limit, and one approved-contracts rule — in under 10 minutes on the first
  attempt, guided only by on-screen language.
- **SC-003**: For every blocked transaction in testing, the member-facing message names the
  specific blocking rule (or states that no rule permits the transaction) — no generic failures.
- **SC-004**: 100% of policy mutations (add/edit/remove/reorder) observed on-chain trace back to a
  threshold-approved proposal; zero unilateral policy changes are possible in testing.
- **SC-005**: Reordering a two-rule policy — including approval and on-chain effect — completes in
  under 3 minutes of member effort, and the new order demonstrably changes which rule governs a
  boundary transaction.
- **SC-006**: Owner entry via each of the three methods (paste, QR, address book) succeeds on
  first attempt in usability testing, and address-book names appear for 100% of known addresses
  shown in Protect.
- **SC-007**: After the navigation move, existing Protect deep links resolve identically to
  before (zero broken links), and Protect appears under Tools on both navigation surfaces.

## Assumptions

- **First-match semantics**: "rule 001 is enforced before 002 if both apply" is interpreted as
  first-match-governs: the lowest-numbered rule whose scope matches a transaction decides its
  fate, and later rules are not consulted for that transaction. This is the simplest model that
  makes ordering meaningful and matches the requester's example.
- **Policy silence is denial**: once a vault has an ordered policy, a transaction no rule matches
  cannot execute. This is the safe default for shared funds (families/teams add rules to open
  paths, not to close an otherwise-open field). Owners who want a fallback can add a final
  catch-all rule (e.g. "all owners together, any amount").
- **Approvers are owners**: rule approver sets are chosen from the vault's owners; the feature
  does not introduce non-owner approvers.
- **Supported chains** are the platform's existing supported base chains where the custody stack
  (vault deployment + policy enforcement) is deployed; this feature adds no new chains by itself,
  it removes the single-chain assumption from Protect's UX and records.
- **Service catalog is per-chain platform config**, seeded from integrations the platform already
  knows (e.g. each network's swap venue, supported lending markets such as Uniswap and Morpho
  where available); expanding the catalog is a configuration change, not a code change.
- **Daily-limit accounting** for token-specific limits reuses the spec-049 24-hour window
  semantics (window opens at first counted spend, resets 24 hours later).
- **Legacy vaults**: vaults with spec-049 policies (or none) behave exactly as today until their
  owners adopt the ordered engine via a threshold-approved change.
- **Bitcoin and other non-EVM networks are out of scope**: Protect vaults remain a base-chain
  (EVM) capability; non-EVM networks (e.g. spec 061 Bitcoin) are not custody targets in this
  feature.
- **Off-chain sub-section** of Protect remains reserved/disabled as it is today; this feature
  changes only the on-chain side and navigation placement.
