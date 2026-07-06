# Feature Specification: Safe Multisig Custody

**Feature Branch**: `043-safe-multisig-custody`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Several years back Ethereum Classic Cooperative deployed Safe multisigs on ETC and we should support this pattern within the FairWins app. The goal is to replicate as much of the functionality of creating and managing vault transactions. This feature should appear in the 'My Wallet' view in the 'Finance' section and be labeled 'Custody'. The Custody section will have two sections, 'On chain' and 'Off chain' (disabled for now). The On chain section will be where the multisig functionality will live. Backup of the Safe wallet should use the app-wide encrypted backup and recovery. The app should give the option to 'operate as' the multisig so a user can create a wager transaction with the multisig and have others approve, or send from the multisig in the 'Transfer & Pay' section. All appropriate wallet events should be wired into the 'Notification' system and have appropriate controls. All control surfaces should be integrated into appropriate surfaces across the app. Reference https://github.com/etclabscore/web-core"

## Overview

FairWins members today act on-chain as a single wallet: one address, one signer, one point of
failure. Many real communities — the Ethereum Classic Cooperative among them — instead hold and
move funds through a **shared multisignature vault (a "Safe")**, where several owners must jointly
approve any movement of money. This feature brings that pattern into FairWins so a group can create,
fund, and govern a shared vault, and then **use that vault throughout the app** — placing wagers as
the vault, sending payments as the vault — with every fund movement requiring a configurable number
of co-owner approvals.

Custody lives in the member's **My Wallet** view under the **Finance** section, labeled **Custody**.
Custody presents two sub-sections: **On chain** (the multisig functionality) and **Off chain**
(reserved and shown disabled for now). References to the members' vaults are protected by the
platform's existing **encrypted backup and recovery** so a member never loses track of the vaults
they belong to. Vault activity flows into the platform's **notification and activity system** with
per-source controls, and Custody controls surface in the places a member already works — wager
creation and Pay & Transfer — through an **"operate as" the vault** switch.

## Clarifications

### Session 2026-07-06

- Q: How do co-owners discover a pending vault transaction and contribute their approvals, given the
  platform's "no app backend" principle? → A: **On-chain only.** Each owner submits an on-chain approval
  transaction (and pays gas) so the chain itself is the shared source of truth for a transaction's proposals
  and collected approvals. No platform-operated or off-chain shared store is required; the vault's on-chain
  state is read to discover pending transactions and their approval progress.
- Q: Which networks should Custody support at launch? → A: **Ethereum Classic plus the platform's existing
  deployment targets** (e.g. Mordor testnet, Polygon), each gated by the availability of the Safe multisig
  contracts on that network. Custody is only offered on networks where those contracts are deployed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create or load an on-chain vault (Priority: P1)

A member opens **My Wallet → Finance → Custody → On chain** and either creates a new shared vault by
choosing its co-owners and how many of them must approve a transaction (the "threshold"), or loads a
vault that already exists on-chain by entering its address. Once created or loaded, the vault is shown
with its address, network, current balance(s), the list of owners, and the approval threshold.

**Why this priority**: Without the ability to establish and see a vault, nothing else in the feature is
reachable. This is the minimum viable slice — it lets a group stand up the shared vault the Ethereum
Classic Cooperative pattern is built around and confirm it is theirs.

**Independent Test**: Create a vault with 3 owners and a 2-of-3 threshold on a supported network, confirm
it appears in Custody with the correct owners, threshold, address, and balance; separately, load a
pre-existing vault by address and confirm the same details render from on-chain state.

**Acceptance Scenarios**:

1. **Given** a connected member on a supported network, **When** they create a vault with a chosen set of
   owner addresses and a threshold, **Then** the vault is deployed on-chain and displayed in Custody with
   those exact owners, threshold, address, and current balance.
2. **Given** a member who knows an existing vault address they co-own, **When** they load it by address,
   **Then** Custody shows the vault's live owners, threshold, and balances read from the chain.
3. **Given** a threshold greater than the number of owners, **When** the member tries to create the vault,
   **Then** creation is blocked with a clear explanation.
4. **Given** a member belonging to more than one vault, **When** they open Custody, **Then** they can see
   and switch between all of their vaults.

---

### User Story 2 - Propose, approve, and execute a vault transaction (Priority: P1)

A vault owner proposes a transaction from the vault (for example, sending funds to an address). Other
owners see the pending transaction, review its details, and approve it. Once the number of approvals meets
the threshold, any owner can execute it and the funds move on-chain. Executed and rejected transactions are
retained in a per-vault history.

**Why this priority**: This is the core of "creating and managing vault transactions." A vault that cannot
move money under multi-party approval is not a multisig. Together with Story 1 it is the complete MVP.

**Independent Test**: With a 2-of-3 vault, have owner A propose a transfer, owner B approve it, confirm it
becomes executable at 2 approvals, execute it, and verify the balance change and the history entry.

**Acceptance Scenarios**:

1. **Given** an owner of a 2-of-3 vault, **When** they propose a transfer, **Then** the transaction appears
   in the vault's pending queue with its details and a 1-of-2-remaining approval status.
2. **Given** a pending transaction below threshold, **When** a second owner approves it, **Then** its status
   updates to "ready to execute."
3. **Given** a transaction that has met threshold, **When** any owner executes it, **Then** the funds move
   on-chain and the transaction moves from the queue to history as executed.
4. **Given** a pending transaction, **When** an owner rejects it or the vault owners approve a replacement,
   **Then** the queue reflects the rejection/replacement and the superseded transaction cannot be executed.
5. **Given** a member who is not an owner of the vault, **When** they view it, **Then** they can see state
   but cannot propose, approve, or execute.

---

### User Story 3 - Operate as the vault across the app (Priority: P2)

While using the app as a normal member, a member can switch to **operate as** one of their vaults. In that
mode, actions that move or commit money are prepared as vault transactions requiring co-owner approval rather
than as single-signer actions. Specifically, the member can **create a wager as the vault** (co-owners
approve the stake before it is committed) and **send a payment as the vault** from the **Pay & Transfer**
section. A persistent, clearly visible indicator shows which identity (personal wallet vs. a named vault) is
currently active, and the member can switch back at any time.

**Why this priority**: This is what makes custody useful inside FairWins rather than a standalone tool. It is
P2 because Stories 1–2 already deliver a governable vault; "operate as" extends that value into the product's
primary flows.

**Independent Test**: Switch to operate as a vault, create a wager whose stake is drawn from the vault,
confirm co-owners must approve before the wager is active, and separately initiate a payment from Pay &
Transfer as the vault and confirm it becomes a pending vault transaction.

**Acceptance Scenarios**:

1. **Given** a member who owns a vault, **When** they choose "operate as" that vault, **Then** a persistent
   indicator shows the vault as the active identity across the app.
2. **Given** operate-as-vault is active, **When** the member creates a wager, **Then** the wager's stake is
   sourced from the vault and requires co-owner approval before the wager becomes active.
3. **Given** operate-as-vault is active, **When** the member sends a payment in Pay & Transfer, **Then** the
   payment is created as a pending vault transaction subject to the vault's threshold rather than sent
   immediately.
4. **Given** operate-as-vault is active, **When** the member switches back to their personal wallet, **Then**
   subsequent actions are single-signer again and the indicator updates.

---

### User Story 4 - Manage vault ownership and threshold (Priority: P2)

An owner changes the vault's governance: adding an owner, removing an owner, or changing the approval
threshold. Because these changes affect who controls the money, each is itself a vault transaction that must
be proposed and approved to threshold before it takes effect.

**Why this priority**: Real vaults evolve — people join and leave the group. This is required for long-lived
use but not for a first demonstration of value, so it sits at P2.

**Independent Test**: Propose adding a fourth owner to a 2-of-3 vault, approve it to threshold, execute it,
and confirm the owner set and any threshold change are reflected in Custody and enforced on the next
transaction.

**Acceptance Scenarios**:

1. **Given** an owner, **When** they propose adding or removing an owner or changing the threshold, **Then**
   the change enters the pending queue as a governance transaction requiring threshold approval.
2. **Given** an approved governance change, **When** it is executed, **Then** the vault's owners/threshold
   update on-chain and Custody reflects the new configuration.
3. **Given** a proposed threshold that would exceed the resulting number of owners, **When** an owner tries
   to propose it, **Then** it is blocked with a clear explanation.

---

### User Story 5 - Backup and recovery of vault references (Priority: P2)

A member's list of vaults (and the local labels/metadata they've given them) is included in the platform's
existing encrypted backup, and is restored when the member restores their data on a new device or browser —
without exposing that data publicly and without requiring anything beyond control of their wallet.

**Why this priority**: Losing track of which vaults a member belongs to is a serious continuity problem, but
vaults themselves live on-chain and can be re-loaded by address, so this augments rather than gates the core
value.

**Independent Test**: Add two vaults with custom labels, run the app-wide backup, restore on a fresh
browser/profile, and confirm both vaults and their labels reappear in Custody.

**Acceptance Scenarios**:

1. **Given** a member with one or more vaults, **When** they perform the app-wide encrypted backup, **Then**
   their vault references and labels are included in that encrypted backup.
2. **Given** a member on a new device who restores their backup, **When** they open Custody, **Then** their
   previously known vaults and labels reappear.
3. **Given** the encrypted backup is stored in a publicly readable location, **When** anyone other than the
   member inspects it, **Then** the vault references are not readable.

---

### User Story 6 - Vault event notifications and controls (Priority: P3)

Vault events the member cares about — a new transaction proposed on a vault they own, an approval added, a
transaction ready to execute, a transaction executed, a governance change, incoming/outgoing funds — appear
in the platform's notification and activity feed. The member can control these notifications through the same
preference surface used for other notification sources, including turning the Custody source on or off.

**Why this priority**: Notifications make multi-party coordination practical (owners need to know when their
approval is needed), but the feature is usable without them at first, so P3.

**Independent Test**: With notifications enabled, have a co-owner propose a transaction and confirm a "needs
your approval" entry appears in the member's activity feed; then disable the Custody notification source and
confirm no new vault notifications arrive.

**Acceptance Scenarios**:

1. **Given** a member who owns a vault with notifications enabled, **When** a co-owner proposes a transaction
   needing that member's approval, **Then** a "needs your action" entry appears in the activity feed.
2. **Given** a vault transaction is executed, **When** the member next sees the feed, **Then** an executed
   entry is present.
3. **Given** the member disables the Custody notification source, **When** subsequent vault events occur,
   **Then** no new Custody notifications are surfaced while other sources continue to work.

---

### Edge Cases

- **Threshold not yet met at execution**: attempting to execute a transaction that has fewer approvals than
  the threshold is blocked with a clear reason.
- **Duplicate approval**: the same owner approving the same transaction twice does not double-count toward
  threshold.
- **Owner removed mid-flight**: a pending transaction whose approvals were partly gathered before an owner
  was removed reflects the current owner set and threshold when evaluated for execution.
- **Insufficient vault balance**: proposing or executing a transfer that exceeds the vault's balance is
  surfaced honestly and cannot silently succeed.
- **Network mismatch**: acting on a vault while connected to a different network than the vault is deployed on
  is prevented or clearly prompts a network switch.
- **Sanctions / membership gates**: vault-originated wagers and payments are subject to the same eligibility
  checks (sanctions screening, membership roles) the platform applies to personal-wallet actions.
- **Operate-as with no owned vault**: a member who owns no vault sees Custody in an empty/onboarding state and
  the "operate as" control is unavailable or clearly guides them to create a vault.
- **Off chain sub-section**: the Off chain sub-section is visible but disabled, and communicates that it is
  coming later rather than appearing broken.
- **Loading an address that is not a vault / not one the member owns**: the app distinguishes "not a vault at
  this address," "a vault you can view but not sign for," and "a vault you own."
- **Concurrent execution**: two owners executing the same ready transaction at nearly the same moment results
  in one on-chain execution, not two, with honest feedback to the second.

## Requirements *(mandatory)*

### Functional Requirements

**Placement & navigation**

- **FR-001**: The app MUST present a **Custody** entry within the **Finance** section of the **My Wallet**
  view.
- **FR-002**: Custody MUST contain exactly two sub-sections labeled **On chain** and **Off chain**, with
  **Off chain** shown in a disabled state that communicates it is reserved for later.
- **FR-003**: All multisig functionality MUST live under the **On chain** sub-section.

**Vault lifecycle**

- **FR-004**: Members MUST be able to create a new multisignature vault by specifying its set of owner
  addresses and its approval threshold on a supported network.
- **FR-005**: The system MUST prevent creating or configuring a vault with a threshold greater than its
  number of owners, or a threshold of zero.
- **FR-006**: Members MUST be able to load an existing vault by its address and view its live on-chain state
  (owners, threshold, balances, address, network).
- **FR-007**: The system MUST display all vaults a member is associated with and allow switching between
  them.
- **FR-008**: Vault state shown to the member MUST reflect real on-chain state and MUST NOT imply a
  configuration or balance the chain has not confirmed.

**Transactions & approvals**

- **FR-009**: A vault owner MUST be able to propose a transaction from the vault (at minimum, transferring the
  network's native asset and supported tokens to a chosen recipient).
- **FR-010**: Owners MUST be able to review a pending transaction's details (recipient, amount, asset,
  purpose) and approve it.
- **FR-011**: The system MUST track approvals per transaction and indicate how many approvals remain before
  the threshold is met.
- **FR-012**: A transaction MUST become executable only once its approvals meet or exceed the vault's
  threshold, and any owner MUST be able to execute an executable transaction.
- **FR-013**: The system MUST prevent execution of a transaction that has not met threshold, prevent a single
  owner's approval from counting more than once, and prevent double execution of the same transaction.
- **FR-014**: Owners MUST be able to reject or replace a pending transaction, and the queue MUST reflect the
  resulting state.
- **FR-015**: Each vault MUST retain a history of executed and rejected/replaced transactions viewable by its
  members.
- **FR-016**: Only owners of a vault MUST be able to propose, approve, execute, reject, or replace its
  transactions; non-owners MAY view state only.
- **FR-017**: Co-owners MUST discover pending transactions and their approval progress by reading the vault's
  on-chain state, and MUST contribute their approvals by submitting an on-chain approval transaction. The
  feature MUST NOT depend on a platform-operated or off-chain shared store to coordinate proposals or
  approvals (on-chain only, honoring the "no app backend" and "never-stranded" principles).

**Governance**

- **FR-018**: Members MUST be able to propose adding an owner, removing an owner, and changing the threshold,
  each processed as a vault transaction requiring threshold approval before it takes effect.
- **FR-019**: After a governance change executes, the vault's displayed owners/threshold MUST reflect the new
  configuration and the new configuration MUST govern subsequent transactions.

**Operate-as-vault integration**

- **FR-020**: Members who own a vault MUST be able to switch to **operate as** that vault, and a persistent,
  clearly visible indicator MUST show which identity (personal wallet vs. a named vault) is currently active
  across the app.
- **FR-021**: While operating as a vault, creating a **wager** MUST source the stake from the vault and
  require co-owner approval to threshold before the wager becomes active.
- **FR-022**: While operating as a vault, sending a payment in the **Pay & Transfer** section MUST create a
  pending vault transaction subject to the vault's threshold rather than an immediate single-signer send.
- **FR-023**: Members MUST be able to switch back to their personal wallet at any time, after which actions
  are single-signer again.
- **FR-024**: Vault-originated wagers and payments MUST be subject to the same eligibility and compliance
  checks (e.g. sanctions screening, membership roles) applied to personal-wallet actions.

**Backup & recovery**

- **FR-025**: A member's vault references and member-authored labels/metadata MUST be included in the
  platform's existing app-wide **encrypted backup and recovery**, restorable with only control of the
  member's wallet.
- **FR-026**: Backed-up vault data MUST NOT be readable by anyone other than the member, even when stored in a
  publicly readable location.

**Notifications & control surfaces**

- **FR-027**: Vault events (proposed, approved, ready-to-execute, executed, rejected/replaced, governance
  change, incoming/outgoing funds) MUST be surfaced through the platform's notification and activity system,
  registered as a distinct **Custody** activity source.
- **FR-028**: The member MUST be able to control Custody notifications through the same preference surface as
  other notification sources, including enabling/disabling the Custody source, without affecting other
  sources.
- **FR-029**: Custody control surfaces MUST be integrated into the relevant existing surfaces across the app
  (at minimum: the wager creation flow and the Pay & Transfer section for "operate as," and the notification
  preferences surface), consistent with the app's established navigation and accessibility conventions.

**Scope & networks**

- **FR-030**: The feature MUST support **Ethereum Classic** plus the platform's existing deployment targets
  (e.g. Mordor testnet, Polygon), and MUST offer Custody only on networks where the Safe multisig contracts
  are already deployed; on unsupported networks Custody MUST clearly indicate it is unavailable rather than
  appearing broken.

### Key Entities *(include if data involved)*

- **Vault (Safe)**: A shared on-chain account governed by multiple owners. Key attributes: address, network,
  set of owner addresses, approval threshold, balances. Lives on-chain; the source of truth is the chain.
- **Vault Reference / Label**: A member's local record that they are associated with a given vault, plus a
  human-friendly name and metadata. Included in encrypted backup; never authoritative over on-chain state.
- **Vault Transaction (Proposal)**: A proposed movement or governance action from a vault. Attributes:
  originating vault, type (transfer, wager stake, governance change), parameters (recipient/amount/asset or
  owner/threshold change), collected approvals, status (pending, ready, executed, rejected/replaced), and
  history placement.
- **Approval**: An owner's endorsement of a specific vault transaction; counts once per owner toward the
  threshold.
- **Active Identity**: The identity a member is currently operating as — their personal wallet or a specific
  vault — governing whether actions are single-signer or vault-governed.
- **Custody Notification Event**: An activity-feed entry derived from a vault event, subject to Custody-source
  preference controls.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member can create a new multisig vault (choosing owners and threshold) and see it correctly
  reflected in Custody in under 3 minutes without external documentation.
- **SC-002**: For a vault requiring N approvals, no transaction ever moves funds with fewer than N distinct
  owner approvals — verified across normal, duplicate-approval, and concurrent-execution cases (0 violations).
- **SC-003**: A member can load an existing vault by address and see its owners, threshold, and balances match
  independent on-chain inspection 100% of the time.
- **SC-004**: A member operating "as a vault" can, from an ordinary wager-creation or Pay & Transfer flow,
  produce a co-owner-approved fund movement without leaving those flows, and 90% of test users correctly
  identify which identity is active from the on-screen indicator.
- **SC-005**: After backing up and restoring on a fresh device/browser, 100% of a member's previously known
  vaults and labels reappear in Custody.
- **SC-006**: When a co-owner proposes a transaction needing the member's approval, a "needs your action"
  notification appears in the member's activity feed, and disabling the Custody source suppresses subsequent
  vault notifications without affecting other sources (verified on/off).
- **SC-007**: Owners are notified of a pending transaction needing their approval promptly enough that a
  typical 2-of-3 transfer can be proposed, approved, and executed by a distributed group within a single
  working session.

## Assumptions

- **Reuse of existing platform infrastructure**: The feature reuses the platform's existing encrypted
  backup/recovery (spec 032), notification & activity system (spec 031), sanctions/membership gating, and
  wager/transfer flows rather than introducing parallel mechanisms.
- **Established multisig standard**: "Vault" refers to the widely deployed Safe multisignature pattern (as
  used by the Ethereum Classic Cooperative and mirrored by the referenced `etclabscore/web-core`), so that
  vaults created or loaded here are interoperable with that ecosystem rather than a bespoke scheme.
- **Both create and load**: Members can both create new vaults and load/import existing ones by address.
- **Owner = signer**: A vault owner is any address in the owner set; the member can only propose/approve/
  execute for vaults whose owner set includes an address they control.
- **No app backend / on-chain coordination**: Consistent with the platform's principles, the feature does not
  rely on a platform-operated backend. Proposals and approvals are coordinated entirely on-chain — the vault's
  on-chain state is the shared source of truth, and each approval is an on-chain transaction (owners pay gas
  per approval). This is inherently "never-stranded."
- **Off chain deferred**: The Off chain sub-section is intentionally out of scope for this feature beyond
  appearing as a disabled placeholder.
- **Native + supported tokens**: Vault transfers cover the network's native asset and the tokens the platform
  already supports; arbitrary contract-call composition beyond transfers/wagers/governance is out of scope for
  the first version.
- **Networks**: Ethereum Classic plus the platform's existing deployment targets (e.g. Mordor testnet,
  Polygon), each gated by Safe multisig contract availability on that network.

## Dependencies

- Encrypted backup & recovery (spec 032) for FR-025/FR-026.
- Platform notification & activity system (spec 031) for FR-027/FR-028.
- Existing wager creation and Pay & Transfer flows for FR-021/FR-022.
- Existing sanctions/membership eligibility checks for FR-024.
- Availability of the Safe multisig contracts on each in-scope network (FR-030).
