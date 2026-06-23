# Feature Specification: Token Mint & Compliant Token Administration

**Feature Branch**: `claude/fairwins-dao-token-mint-15who8`

**Created**: 2026-06-23

**Status**: Draft

**Input**: User description: "FairWins Token Mint — a token issuance and administration feature that lets authorized platform users create, mint, and administer tokens across multiple standards. Beyond basic fungible/non-fungible tokens (ERC-20 and ERC-721, with optional burnable/pausable variants), it MUST support compliant/permissioned token standards: ERC-1404 (Simple Restricted Token Standard) and T-REX / ERC-3643 (permissioned security tokens with on-chain identity registry, compliance modules, trusted claim issuers, and agent/owner administration including freeze, forced transfer, recovery, pause, and mint/burn). The feature includes the administration surface for these tokens and integration with the platform's existing access control (MembershipManager roles, SanctionsGuard) and UUPS-upgradeable patterns. Token creation must be wired to real on-chain transactions in the frontend (no mock-only flows). This revives and modernizes the archived TokenMintFactory/FairWinsToken designs."

## Overview

Token Mint extends the FairWins platform beyond peer-to-peer wagers by letting
authorized users **issue and administer their own tokens** directly on the
platform. It spans a spectrum of token types, from simple open tokens to fully
regulated, permissioned securities:

- **Open tokens** — standard fungible (ERC-20) and non-fungible (ERC-721)
  tokens, with optional burnable and pausable behavior, for utility, rewards,
  collectibles, and community use cases.
- **Restricted tokens (ERC-1404)** — fungible tokens that can block transfers
  to/from disallowed parties and return a **human-readable reason** when a
  transfer is restricted (e.g. "recipient not eligible", "sender frozen").
- **Permissioned security tokens (T-REX / ERC-3643)** — fully regulated tokens
  where every holder must carry verified on-chain identity claims, transfers are
  checked against configurable compliance rules, and an authorized agent can
  freeze accounts, force transfers, recover lost wallets, pause the token, and
  mint/burn.

Each token an issuer creates is administered through a single surface that
exposes only the controls valid for that token's standard. The feature reuses
the platform's existing access control (membership roles, sanctions screening)
and upgradeable-contract patterns rather than re-rolling its own.

This work revives and modernizes the archived `TokenMintFactory` and
`FairWinsToken` designs (reference only in `contracts-archive/`) against the
platform's current standards.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Issue an open token (Priority: P1)

An authorized issuer creates a standard token (fungible or non-fungible),
choosing its name, symbol, supply behavior, and optional burnable/pausable
features. The transaction is submitted on-chain and, once confirmed, the new
token appears in the issuer's token list with its real deployed address.

**Why this priority**: This is the smallest end-to-end slice that delivers
value and proves the full create → deploy → list → administer loop against real
on-chain state. Everything else builds on it. It is also the lowest-risk token
class (no compliance obligations), making it the natural MVP.

**Independent Test**: Connect an authorized wallet, create an ERC-20 with a
name/symbol/initial supply, confirm the transaction, and verify the token's
deployed address holds the expected supply and metadata — with no mock data
anywhere in the flow.

**Acceptance Scenarios**:

1. **Given** an authorized issuer with a connected wallet, **When** they submit
   a valid fungible-token creation (name, symbol, initial supply, decimals),
   **Then** a new token contract is deployed on-chain and the issuer is shown
   the confirmed token address and initial balance.
2. **Given** a token creation form, **When** the issuer selects "burnable" and
   "pausable", **Then** the resulting token supports holder burn and
   issuer-controlled pause, and the form reflects exactly the chosen options.
3. **Given** a pending creation transaction, **When** it is still unconfirmed,
   **Then** the UI shows it as pending and does not present the token as
   finalized until the chain confirms it.
4. **Given** a wallet **without** issuance authorization, **When** it attempts to
   create a token, **Then** the action is blocked and the reason is surfaced.

---

### User Story 2 - Administer a token I issued (Priority: P1)

An issuer opens one of their tokens and performs administrative actions
appropriate to that token's standard — for an open token: mint more (if
allowed), pause/unpause, and transfer ownership; the admin surface only shows
controls that the token actually supports.

**Why this priority**: Issuance without administration is not a usable product;
owners must manage tokens after creation. Pairing this with Story 1 yields a
complete, demonstrable open-token lifecycle.

**Independent Test**: As the owner of a previously created pausable token,
pause it, confirm transfers are blocked while paused, unpause it, and confirm
transfers resume — observing real on-chain state changes.

**Acceptance Scenarios**:

1. **Given** the owner of a mintable token, **When** they mint additional supply
   to a recipient, **Then** the recipient's on-chain balance increases by the
   minted amount and total supply updates.
2. **Given** the owner of a pausable token, **When** they pause it, **Then**
   transfers are rejected until they unpause.
3. **Given** a token that is **not** pausable, **When** the owner opens its admin
   surface, **Then** no pause control is offered.
4. **Given** a non-owner, **When** they attempt an administrative action, **Then**
   the action is rejected on-chain and the UI explains they lack authority.

---

### User Story 3 - Issue a restricted token with transfer rules (Priority: P2)

An issuer creates an ERC-1404 restricted token and configures who may hold or
receive it. When a transfer would violate a rule, the token reports a specific,
human-readable reason, and wallets/explorers can check eligibility **before**
attempting a transfer.

**Why this priority**: Restricted tokens are the first compliance tier and a
meaningful differentiator over plain ERC-20, but they depend on the issuance and
admin foundation from Stories 1–2.

**Independent Test**: Create a restricted token, mark an address as ineligible,
attempt a transfer to it, and verify the transfer is rejected with the expected
human-readable reason code/message — and that an eligibility pre-check returns
the same reason without spending a transfer.

**Acceptance Scenarios**:

1. **Given** a restricted token with an eligibility rule, **When** a transfer to
   an ineligible recipient is attempted, **Then** it is rejected and a
   human-readable reason is available describing why.
2. **Given** the same token, **When** a caller checks transfer eligibility for a
   sender/recipient/amount **before** transferring, **Then** they receive a
   restriction code and matching message without moving any tokens.
3. **Given** a transfer between two eligible parties, **When** it is submitted,
   **Then** it succeeds like a normal transfer.
4. **Given** a sanctioned address (per the platform's sanctions screening),
   **When** it is set as sender or recipient, **Then** the transfer is blocked
   regardless of other rules.

---

### User Story 4 - Issue & administer a permissioned security token (T-REX / ERC-3643) (Priority: P2)

An issuer creates a fully permissioned security token. Holders must carry
verified on-chain identity claims from trusted issuers; transfers are validated
against configurable compliance rules. An authorized agent can freeze/unfreeze
accounts or partial balances, force a transfer, recover tokens from a lost
wallet to a replacement, pause the token, and mint/burn.

**Why this priority**: This is the most compelling and demanding capability —
institutional-grade compliant tokens — but it sits atop all prior stories and
carries the highest regulatory/security surface, so it follows the restricted-
token tier.

**Independent Test**: Create a permissioned token, register two holders with
valid identity claims, transfer between them successfully, then revoke/omit a
recipient's required claim and confirm the transfer is blocked; separately, as
the agent, freeze an account and confirm its tokens cannot move until unfrozen.

**Acceptance Scenarios**:

1. **Given** a permissioned token, **When** a transfer is attempted to a holder
   **without** the required verified identity claims, **Then** it is rejected.
2. **Given** two holders with valid claims that satisfy the compliance rules,
   **When** a transfer between them is attempted, **Then** it succeeds.
3. **Given** an authorized agent, **When** they freeze an account (or a portion
   of its balance), **Then** the frozen amount cannot be transferred until the
   agent unfreezes it.
4. **Given** an authorized agent and a holder who lost access to their wallet,
   **When** the agent executes recovery to a replacement wallet holding the same
   verified identity, **Then** the holder's balance and frozen status move to the
   replacement wallet.
5. **Given** an authorized agent, **When** they execute a forced transfer or a
   mint/burn permitted by the token's rules, **Then** balances update accordingly
   and the action is attributable to the agent.
6. **Given** an account or address that is **not** an authorized agent/owner,
   **When** it attempts any agent-only action, **Then** the action is rejected.

---

### User Story 5 - Discover and inspect tokens (Priority: P3)

Any platform user can view a token's public profile — its standard, metadata,
supply, and (for compliant tokens) the high-level rules that govern it — and
issuers can see the full set of tokens they administer.

**Why this priority**: Visibility improves usability and trust but is not
required for the core issue/administer loop; it can follow once tokens exist.

**Independent Test**: After creating tokens of different standards, open the
token list and each token's detail view and confirm the displayed standard,
metadata, and supply match real on-chain values.

**Acceptance Scenarios**:

1. **Given** tokens of different standards exist, **When** a user opens the token
   list, **Then** each token shows its standard, name, symbol, and live supply
   from chain.
2. **Given** a compliant token, **When** a user opens its detail view, **Then**
   the governing rule summary (e.g. "identity-verified holders only") is shown
   truthfully.
3. **Given** the active network, **When** tokens are listed, **Then** only tokens
   for that network are shown and data never leaks across networks.

---

### User Story 6 - Manage supply with optional caps (Priority: P2)

An issuer mints new supply to a recipient and burns supply from a treasury wallet.
At creation they may set an optional **maximum supply cap**; for capped tokens the
admin surface shows supply-vs-cap progress and remaining headroom, and minting that
would exceed the cap is rejected.

**Why this priority**: Supply control is the most-used post-issuance action; caps
are a common requirement for fixed-supply assets and must be enforced on-chain.

**Independent Test**: Create a capped token, mint up to the cap (progress and
headroom update), then attempt a mint over the cap and confirm it is rejected
on-chain; burn some supply and confirm circulating supply decreases.

**Acceptance Scenarios**:

1. **Given** a capped token below its cap, **When** the owner mints within the
   remaining headroom, **Then** supply increases and the progress/headroom update.
2. **Given** a capped token, **When** a mint would exceed the cap, **Then** it is
   rejected on-chain with a clear reason.
3. **Given** a burnable token, **When** supply is burned from a holding wallet,
   **Then** circulating supply decreases and the change is irreversible.
4. **Given** an uncapped token, **When** the admin surface is shown, **Then** no
   supply-vs-cap progress is presented (only circulating supply).

---

### User Story 7 - Configure transfer controls (Priority: P2)

An issuer pauses/unpauses all transfers, toggles configurable transfer-restriction
rules evaluated on-chain before every transfer, and freezes/unfreezes specific
addresses, seeing the list of currently frozen wallets.

**Why this priority**: Pausing and freezing are core incident-response and
compliance controls for any administered token.

**Independent Test**: Pause a token and confirm transfers are blocked; freeze an
address and confirm it cannot send or receive while frozen, then unfreeze and
confirm transfers resume; toggle a restriction rule and confirm enforcement.

**Acceptance Scenarios**:

1. **Given** a paused token, **When** any transfer/mint/burn is attempted, **Then**
   it is blocked at the contract level until the token is resumed.
2. **Given** a frozen address, **When** it tries to send or receive, **Then** the
   transfer is rejected; the frozen balance remains on-chain but cannot move.
3. **Given** the freeze list, **When** the owner unfreezes an address, **Then** it
   can transact again and the list updates.
4. **Given** a configurable restriction rule, **When** the owner enables/disables
   it, **Then** the on-chain transfer check reflects the change.

---

### User Story 8 - Administer compliance allowlist (ERC-1404) (Priority: P2)

For a restricted token, a compliance administrator manages an eligibility allowlist
(add individually, import in bulk, revoke), each entry carrying an optional label
and status; views the restriction-code table with human-readable messages; and sets
a default restriction message.

**Why this priority**: The allowlist is the operational heart of a compliant
restricted token; it must be manageable at scale with truthful reason reporting.

**Independent Test**: Add several addresses to the allowlist (one with a label),
confirm an allowlisted recipient can receive and a non-allowlisted one is rejected
with the matching restriction code/message; revoke an address and confirm it can no
longer receive.

**Acceptance Scenarios**:

1. **Given** a restricted token, **When** the admin adds/imports addresses to the
   allowlist, **Then** those addresses become eligible and appear in the list with
   their label and status.
2. **Given** an allowlisted address, **When** the admin revokes it, **Then** it
   becomes ineligible and transfers to it are rejected with the matching reason.
3. **Given** the restriction-code table, **When** a transfer would be blocked,
   **Then** the returned code maps to the displayed human-readable message.
4. **Given** a configurable default restriction message, **When** the admin updates
   it, **Then** future eligibility checks surface the updated message.

---

### User Story 9 - Administer roles & ownership (Priority: P2)

A token owner grants and revokes scoped administrative roles (e.g. Minter, Pauser,
Compliance officer, Burner) to other wallets, views the current role holders and
when each was granted, transfers ownership to a new wallet, or permanently
renounces ownership.

**Why this priority**: Delegated, least-privilege administration and safe ownership
hand-off are required for real organizations operating a token.

**Independent Test**: Grant the Minter role to a second wallet and confirm only it
(and the owner) can mint; revoke it and confirm minting is again blocked; transfer
ownership and confirm the prior owner loses authority.

**Acceptance Scenarios**:

1. **Given** a token, **When** the owner grants a role to an address, **Then** that
   address can perform exactly the actions the role authorizes, and nothing more.
2. **Given** a role holder, **When** the owner revokes the role, **Then** the
   address can no longer perform that action.
3. **Given** ownership transfer, **When** the owner assigns a new owner, **Then**
   full admin authority moves to the new owner and the prior owner loses it.
4. **Given** renounce ownership, **When** the owner confirms, **Then** no address
   can ever administer the token again (irreversible), surfaced with a clear warning.
5. **Given** any role-gated action, **When** an unauthorized caller attempts it,
   **Then** it is rejected on-chain with a surfaced reason.

---

### User Story 10 - Inspect the holder cap table (Priority: P3)

Any user inspecting a token can view its holder cap table — ranked holders with
address, optional label, balance, percentage of supply, and holding-since — a
supply-distribution bar, and can export the cap table.

**Why this priority**: Holder visibility builds trust and supports compliance
reporting, but it is read-only and depends on holder-enumeration indexing.

**Independent Test**: For a token with several holders, open its cap table and
confirm ranked holders, balances, and percentages match real on-chain balances,
and the distribution bar reflects the same totals; export and confirm the export
matches the displayed data.

**Acceptance Scenarios**:

1. **Given** a token with holders, **When** the cap table is opened, **Then** it
   lists holders ranked by balance with truthful balance, percentage, and
   holding-since values from chain/index.
2. **Given** the cap table, **When** the user exports it, **Then** the export
   contains the same holders and balances shown.
3. **Given** a network without holder indexing, **When** the cap table is opened,
   **Then** the view falls back to on-chain reads or is disabled with a truthful
   explanation — never fabricated holders.

---

### User Story 11 - Distribute and snapshot (Priority: P3)

An issuer distributes tokens to many recipients in a single batched transaction
(airdrop) with computed recipient count, total, and estimated cost; takes balance
snapshots; and distributes dividends based on a snapshot.

**Why this priority**: Batch distribution and snapshot-based dividends are powerful
but advanced operational tools that build on the core supply/holder machinery.

**Independent Test**: Submit a batch distribution to several recipients and confirm
each balance increases by the specified amount in one transaction; take a snapshot
and confirm holder balances are captured at that block for a subsequent dividend.

**Acceptance Scenarios**:

1. **Given** a list of recipients and amounts, **When** the issuer submits a batch
   distribution, **Then** every recipient's balance increases accordingly in a
   single confirmed transaction, and the preview's count/total matched the result.
2. **Given** a token, **When** the issuer takes a snapshot, **Then** holder
   balances at that block are recorded and referenceable.
3. **Given** a snapshot, **When** a dividend is distributed against it, **Then**
   each holder's entitlement is computed from their snapshot balance.

---

### User Story 12 - Review activity & event history (Priority: P3)

Any user reviewing a token can see its on-chain event history — event type, detail,
actor, transaction, and time — filterable by category (e.g. supply, admin).

**Why this priority**: An auditable activity trail is important for trust and
operations but is read-only and depends on event indexing.

**Independent Test**: Perform a mint and a pause on a token, then open its activity
history and confirm both events appear with the correct actor, transaction, and
time, and that category filters narrow the list correctly.

**Acceptance Scenarios**:

1. **Given** a token with on-chain actions, **When** the activity view is opened,
   **Then** each event shows its type, detail, actor, transaction reference, and
   time from indexed on-chain data.
2. **Given** the activity view, **When** the user filters by category, **Then**
   only matching events are shown.
3. **Given** a network without event indexing, **When** the activity view is
   opened, **Then** it falls back to on-chain log reads or is disabled with a
   truthful message — never fabricated events.

---

### User Story 13 - Inspect the contract surface (Priority: P3)

Any user can view a token's contract surface: metadata (compiler, license, deployed
date, address), source-verification status with links to the block explorer and
source, and the per-network deployment list; and can copy the address or ABI.

**Why this priority**: Transparency about the underlying contract supports trust and
integration, and is read-only.

**Independent Test**: Open a token's contract view and confirm the displayed
metadata, verification status, and deployment address match the recorded deployment
and explorer; copy the address and ABI and confirm they are correct.

**Acceptance Scenarios**:

1. **Given** a deployed token, **When** the contract view is opened, **Then** its
   metadata, verification status, and per-network deployments reflect the real
   recorded deployment and explorer state.
2. **Given** the contract view, **When** the user copies the address or ABI,
   **Then** the copied value matches the deployed contract.
3. **Given** an unverified contract, **When** the view is shown, **Then**
   verification status is reported truthfully (not implied as verified).

---

### Edge Cases

- **Duplicate / invalid metadata**: empty name/symbol, zero or absurd decimals,
  or initial supply exceeding a defined maximum are rejected before submission.
- **Transaction failure / rejection**: a reverted or user-rejected creation or
  admin transaction leaves no phantom token in any list; state reflects only
  confirmed chain results.
- **Authorization revoked mid-session**: an issuer whose authorization is removed
  can no longer create tokens, and the UI reflects this on next action.
- **Compliance rule conflicts**: configuring contradictory rules (e.g. a holder
  who is both allowed and frozen) resolves deterministically toward the more
  restrictive outcome, with a clear reason surfaced.
- **Sanctioned actors**: a sanctioned creator cannot issue, and sanctioned
  senders/recipients cannot transact, for every standard.
- **Lost-wallet recovery without matching identity**: recovery to a wallet that
  does not carry the holder's verified identity is rejected.
- **Network without support**: on a network where token issuance is not
  configured/deployed, the feature is disabled with a truthful explanation
  rather than a failing or mock flow.
- **Paused or frozen at claim time**: actions attempted against a paused token or
  frozen balance fail loudly with the specific reason.

## Requirements *(mandatory)*

### Functional Requirements

**Issuance**

- **FR-001**: The system MUST allow an authorized issuer to create a fungible
  (ERC-20) token specifying at least name, symbol, decimals, and initial supply.
- **FR-002**: The system MUST allow an authorized issuer to create a
  non-fungible (ERC-721) token specifying at least name, symbol, and metadata
  reference.
- **FR-003**: The system MUST allow optional **burnable** and **pausable**
  behavior to be selected at creation for supported standards, and the created
  token MUST reflect exactly the selected options.
- **FR-004**: The system MUST allow an authorized issuer to create an **ERC-1404
  restricted** token with a configurable eligibility/transfer-restriction policy.
- **FR-005**: The system MUST allow an authorized issuer to create a **T-REX /
  ERC-3643 permissioned** token bound to an on-chain identity registry, a
  compliance ruleset, and one or more trusted claim issuers.
- **FR-006**: Token creation MUST execute as a real on-chain transaction and MUST
  NOT present a created token as finalized before the chain confirms it. No
  mock-only or placeholder creation flow may ship in production paths.
- **FR-007**: The system MUST restrict token creation to wallets holding the
  required platform authorization (issuance role), and MUST reject unauthorized
  creation attempts with a surfaced reason.

**Restricted-token (ERC-1404) behavior**

- **FR-008**: A restricted token MUST be able to **block** a transfer that
  violates its policy and MUST expose a **human-readable reason** for the
  restriction.
- **FR-009**: A restricted token MUST allow a caller to **check transfer
  eligibility** for a given sender, recipient, and amount **without** performing
  the transfer, returning a restriction code and matching message.
- **FR-010**: An authorized administrator of a restricted token MUST be able to
  update its eligibility policy (e.g. add/remove eligible parties or freeze a
  party) after creation.

**Permissioned-token (T-REX / ERC-3643) behavior**

- **FR-011**: A permissioned token MUST verify that both sender and recipient
  carry the **required verified identity claims** from trusted issuers before
  allowing a transfer, and MUST reject transfers when claims are missing or
  invalid.
- **FR-012**: A permissioned token MUST validate transfers against its
  **configurable compliance rules** and reject transfers that violate them.
- **FR-013**: An authorized agent MUST be able to **freeze and unfreeze** an
  entire account or a partial balance, preventing movement of the frozen amount.
- **FR-014**: An authorized agent MUST be able to perform a **forced transfer**
  permitted by the token's rules (e.g. for legal/recovery reasons).
- **FR-015**: An authorized agent MUST be able to **recover** a holder's balance
  and frozen status from a lost wallet to a replacement wallet that carries the
  same verified identity, and MUST reject recovery to a wallet without it.
- **FR-016**: An authorized agent MUST be able to **mint and burn** supply
  subject to the token's rules, and **pause/unpause** the token.
- **FR-017**: The system MUST allow management of the token's **identity
  registry** (registering/updating/removing holder identities) and its **trusted
  claim issuers** and **required claim topics**, restricted to authorized roles.

**Administration surface (all standards)**

- **FR-018**: Each token MUST be administered through a surface that exposes
  **only the controls valid for that token's standard** (e.g. no pause control
  for a non-pausable token; no freeze/recovery for an open token).
- **FR-019**: Every administrative action MUST be restricted to the appropriate
  owner/agent/role and MUST reject unauthorized callers on-chain (not only in the
  UI), surfacing the reason.
- **FR-020**: The system MUST allow an owner to transfer ownership / agent rights
  of a token they administer.

**Platform integration & cross-cutting**

- **FR-021**: All token types MUST enforce the platform's **sanctions screening**
  so that sanctioned addresses cannot create tokens and cannot send or receive
  for any standard, regardless of other rules.
- **FR-022**: Authorization for issuance and administration MUST integrate with
  the platform's **existing access-control / membership roles** rather than a
  parallel permission system.
- **FR-023**: Token data presented to users MUST be **scoped to the active
  network** and MUST NOT leak across networks; on networks where the feature is
  not deployed, it MUST be disabled with a truthful explanation.
- **FR-024**: The feature MUST surface honest transaction state (pending,
  confirmed, failed, rejected) and MUST NOT leave phantom tokens or actions in
  any list when a transaction does not confirm.
- **FR-025**: Users MUST be able to **view a token's public profile** (standard,
  metadata, live supply, governing-rule summary) and issuers MUST be able to see
  the full list of tokens they administer.
- **FR-026**: The platform's contracts that hold authority over tokens (e.g. the
  issuance factory / registry) MUST follow the project's **upgradeable-contract
  pattern** where they hold state or authority, preserving state across logic
  upgrades. *(Whether individual issued tokens are themselves upgradeable is a
  design decision deferred to planning — see Assumptions.)*

**Administration portal & discovery (US5/US10/US12/US13)**

- **FR-027**: The system MUST present a management view of the tokens an issuer
  administers, including a summary of tokens administered, total holders across
  them, networks in use, and a count of tokens needing attention (e.g. paused),
  with filtering by standard/status and search by name/symbol/address.
- **FR-028**: The system MUST present a per-token detail view organized into
  sections (overview, supply, transfer controls, compliance, holders,
  distributions, roles & ownership, activity, contract) showing **only** the
  sections valid for that token's standard and the caller's authority.
- **FR-029**: The system MUST provide a public explorer of all tokens on the active
  network, openable by any user for read-only details, network-scoped (FR-023).

**Supply & caps (US6)**

- **FR-030**: The system MUST allow an authorized actor to mint supply to a
  recipient and to burn supply, with circulating supply reflecting both.
- **FR-031**: The system MUST allow an OPTIONAL maximum supply cap to be set at
  creation; for capped tokens it MUST enforce the cap on-chain (rejecting mints
  that would exceed it) and surface supply-vs-cap progress and remaining headroom.

**Transfer controls (US7)**

- **FR-032**: The system MUST allow an authorized actor to pause and unpause all
  transfers/mints/burns at the contract level.
- **FR-033**: The system MUST allow an authorized actor to freeze and unfreeze
  specific addresses and MUST present the list of currently frozen addresses;
  frozen balances remain on-chain but cannot move.
- **FR-034**: The system MUST evaluate configurable transfer-restriction rules
  on-chain before every transfer and allow an authorized actor to toggle them.

**Compliance allowlist (US8)**

- **FR-035**: For restricted tokens, the system MUST allow a compliance
  administrator to add (individually and in bulk), label, and revoke allowlist
  entries, each with a status, and MUST reject transfers to non-eligible parties
  with the matching restriction code and human-readable message.
- **FR-036**: The system MUST present the restriction-code table mapping each code
  to its human-readable message and MUST allow a configurable default restriction
  message.

**Roles & ownership (US9)**

- **FR-037**: The system MUST allow a token owner to grant and revoke scoped
  administrative roles (e.g. minter, pauser, compliance, burner) to addresses, and
  MUST present current role holders and their grant time; each role MUST authorize
  only its specific actions (least privilege), enforced on-chain.
- **FR-038**: The system MUST allow an owner to transfer ownership and to renounce
  ownership permanently (irreversible), with renounce surfaced behind a clear
  warning.

**Holders, distributions & activity (US10/US11/US12)**

- **FR-039**: The system MUST present a per-token holder cap table (ranked holders
  with address, optional label, balance, percentage of supply, holding-since), a
  supply-distribution summary, and an export of the cap table, sourced from real
  on-chain balances/indexed data.
- **FR-040**: The system MUST allow an authorized actor to distribute tokens to many
  recipients in a single batched transaction, with a pre-submission preview of
  recipient count, total amount, and estimated cost.
- **FR-041**: The system MUST allow an authorized actor to take balance snapshots
  and to distribute dividends computed from a snapshot's balances.
- **FR-042**: The system MUST present a per-token on-chain event history (type,
  detail, actor, transaction, time) with category filtering, sourced from indexed
  on-chain events.
- **FR-043**: Where holder/activity/snapshot data depends on indexing that is
  unavailable on a network (e.g. subgraph-less networks), the system MUST fall back
  to on-chain reads where feasible or disable the affected view with a truthful
  explanation — it MUST NOT display fabricated holders, events, or balances.

**Contract surface (US13)**

- **FR-044**: The system MUST present a token's contract metadata (compiler,
  license, deployed date, address), source-verification status with explorer/source
  links, and per-network deployment list, and MUST allow copying the address and
  ABI — all reflecting the real recorded deployment and explorer state.

**Create flow (US1 enhancement)**

- **FR-045**: The creation flow MUST let the issuer choose a standard, configure its
  parameters (name, symbol, decimals/initial supply for fungible, base URI for
  ERC-721, initial eligible list for ERC-1404), select feature options (e.g.
  burnable, pausable, capped), and review a deployment summary (standard, network,
  owner, estimated cost) before signing the real on-chain deployment.

### Key Entities *(include if feature involves data)*

- **Token**: A deployed token contract created through the feature. Attributes:
  standard (open ERC-20 / open ERC-721 / restricted ERC-1404 / permissioned
  ERC-3643), name, symbol, decimals (fungible), metadata reference, supply,
  optional behaviors (burnable/pausable), owner, network, deployed address.
- **Issuer / Owner**: A platform-authorized actor who creates and owns tokens and
  holds top-level administrative authority over them.
- **Agent**: An actor delegated operational authority over a permissioned token
  (freeze, forced transfer, recovery, mint/burn, pause) — may be the owner or a
  separate authorized party.
- **Holder Identity**: The on-chain identity record for a holder of a
  permissioned token, carrying verified claims that determine eligibility.
- **Trusted Claim Issuer**: An entity authorized to issue identity claims the
  token trusts; associated with one or more required claim topics.
- **Compliance Rule / Restriction Policy**: The configurable ruleset that governs
  whether a given transfer is permitted, and the human-readable reason returned
  when it is not.
- **Token Registry/List**: The per-network record of tokens created through the
  feature, used for discovery and the issuer's administration list.
- **Supply Cap**: An optional per-token maximum supply set at creation; bounds total
  supply and drives supply-vs-cap progress/headroom for capped tokens.
- **Administrative Role**: A scoped authority over a token (e.g. minter, pauser,
  compliance, burner) granted to an address; tracked with its grant time and the
  actions it authorizes (least privilege).
- **Allowlist Entry**: For restricted tokens, an eligible address with an optional
  label and status; governs whether the address may hold/receive the token.
- **Restriction Policy / Rule**: The configurable on-chain rules (eligibility,
  freeze, sanctions, toggleable rules) evaluated before each transfer, plus the
  restriction-code→message map and default restriction message.
- **Frozen Address**: An address blocked from sending/receiving a token; its balance
  remains on-chain but cannot move until unfrozen.
- **Holder / Cap-table Entry**: A token holder with balance, percentage of supply,
  optional label, and holding-since — the basis of the holder cap table and
  distribution summary (from indexed on-chain balances).
- **Snapshot**: A recorded set of holder balances at a block, referenceable for
  dividend distribution.
- **Distribution / Airdrop**: A batched transfer of a token to many recipients in a
  single transaction; and snapshot-based dividend distributions.
- **Activity Event**: An indexed on-chain event for a token (type, detail, actor,
  transaction, time) powering the activity history.
- **Contract Metadata**: A token's compiler/license/deploy info, verification
  status, ABI, and per-network deployment addresses.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized issuer can create an open fungible token and see it
  confirmed with its real on-chain address and balance, end-to-end, in under 3
  minutes on a supported network.
- **SC-002**: 100% of tokens shown as "created" in the UI correspond to a
  confirmed on-chain deployment — zero phantom or mock entries appear in any
  token list.
- **SC-003**: For restricted and permissioned tokens, every blocked transfer
  yields a specific human-readable reason, and a pre-transfer eligibility check
  returns the same outcome as the actual transfer in 100% of tested cases.
- **SC-004**: 100% of administrative actions (mint, burn, pause, freeze, forced
  transfer, recovery, ownership transfer) succeed only for authorized actors and
  are rejected on-chain for everyone else, verified by tests covering both paths.
- **SC-005**: No sanctioned address can create a token or send/receive any token
  standard, verified across all four standards.
- **SC-006**: Token data never crosses network boundaries: switching networks
  shows only that network's tokens in 100% of cases, and unsupported networks
  disable the feature with a clear message.
- **SC-007**: A permissioned token correctly enforces identity-claim and
  compliance checks: transfers between fully-verified, compliant holders succeed,
  and transfers involving a missing/invalid claim or violated rule are blocked,
  in 100% of tested scenarios.
- **SC-008**: The full automated test suite (unit, integration, and — where
  external protocols/oracles or identity infrastructure are involved — fork
  tests) passes in CI, with security static analysis and fuzzing reporting no new
  high/critical findings.
- **SC-009**: Every administration-portal action (mint, burn, pause/unpause,
  freeze/unfreeze, allowlist add/revoke, role grant/revoke, ownership
  transfer/renounce, batch distribute, snapshot) is a real on-chain transaction
  with honest pending/confirmed/failed state and succeeds only for an authorized
  actor — verified by tests covering both the authorized and unauthorized paths.
- **SC-010**: A capped token never exceeds its cap: 100% of over-cap mint attempts
  are rejected on-chain, and supply-vs-cap progress/headroom match real supply.
- **SC-011**: Scoped roles enforce least privilege: a role holder can perform
  exactly the actions its role authorizes and is rejected on-chain for all others,
  in 100% of tested cases.
- **SC-012**: Holder cap table, activity history, and distribution data shown to
  users match real on-chain balances/events (no fabricated rows); on networks
  without the required indexing the affected view falls back to on-chain reads or is
  disabled with a truthful message in 100% of cases.
- **SC-013**: A batch distribution updates every listed recipient's balance in a
  single confirmed transaction, and the pre-submission preview's recipient count and
  total match the on-chain result.
- **SC-014**: The per-token detail view exposes only the sections/controls valid for
  that token's standard and the caller's authority — no control is shown that the
  contract would reject for that standard.

## Assumptions

- **Standards interpretation**: "ERC-1404" refers to the Simple Restricted Token
  Standard (transfer-restriction detection with reason messages), and "T-REX"
  refers to the ERC-3643 permissioned/security-token suite (on-chain identity
  registry, compliance modules, trusted issuers, agent administration). These are
  treated as the target behaviors regardless of the specific contract libraries
  chosen at planning time.
- **Reuse of platform infrastructure**: The feature integrates with the existing
  `MembershipManager` roles for authorization and `SanctionsGuard` for sanctions
  screening rather than introducing a parallel permission or screening system.
- **Upgradeability scope**: Platform-owned contracts that hold authority/state
  over the token system follow the project's UUPS-upgradeable pattern. Whether
  each individually issued token is itself upgradeable (vs. an immutable
  per-issuer deployment) is deferred to `plan.md`; the default assumption is that
  issued tokens are standard (non-upgradeable) deployments unless a token class
  requires otherwise.
- **Gas-efficient deployment**: A factory/clone approach (as in the archived
  `TokenMintFactory`) is the assumed deployment mechanism for issued tokens, to
  be confirmed in planning.
- **On-chain identity source**: For permissioned tokens, holder identities and
  claims rely on an on-chain identity model compatible with ERC-3643 (e.g.
  ONCHAINID-style identity contracts). The exact identity/claim provider and
  trusted-issuer onboarding process is a planning decision; this spec assumes one
  exists and is configurable per token.
- **Issuance authorization**: Token issuance is gated to authorized platform
  members (a dedicated issuance role) rather than open to any wallet, consistent
  with the platform's role-based access model. The precise role name/tier is a
  planning detail.
- **Archived designs are reference only**: The archived `TokenMintFactory` and
  `FairWinsToken` contracts inform the design but are not imported or deployed;
  new active contracts are written against current standards.
- **Frontend revival**: The previously archived token-mint UI is rebuilt with
  real Web3 wiring; no mock-data flows are carried forward.
- **DEX listing**: The archived "list on DEX" placeholder is **out of scope** for
  this feature and may be addressed separately later.
- **Governance token**: A platform-wide governance token (the archived
  `FairWinsToken` use case) is **out of scope** here; this feature provides the
  issuance machinery, and any specific governance token would be a separate spec
  (and relates to the forthcoming DAO-manager feature).
- **Design reference**: The administration-portal information architecture and
  visual language follow the imported design `TokenMint.dc.html` (Claude Design
  project "Token administration portal design"). The frontend adapts it to the
  app's existing component patterns and theme (theme-aware: mapped onto the app's
  CSS theme variables so it respects light/dark mode) rather than transplanting the
  mockup's standalone page chrome.
- **Role-based token administration**: The advanced admin surface (US9) assumes
  issued tokens move from plain single-owner control to a role-based access model
  (scoped roles such as minter/pauser/compliance/burner) so authority can be
  delegated least-privilege; the exact role set and contract base are a planning
  decision. This is an in-place evolution of the open/restricted templates and must
  preserve the existing owner-as-admin behavior as the default.
- **Caps, snapshots, batch distribution**: Optional supply caps, balance snapshots,
  snapshot-based dividends, and batch distribution are new on-chain capabilities to
  be designed in planning (e.g. capped/snapshot extensions, a batch-distribute
  entrypoint). Snapshots/dividends and the full holder cap table are advanced and
  may ship after the core supply/transfer/role controls.
- **Indexing dependency**: The holder cap table (US10) and activity history (US12)
  depend on indexed on-chain data (e.g. a subgraph indexing Transfer and admin
  events). On subgraph-less networks (Mordor/ETC) these views fall back to on-chain
  reads where feasible or are disabled with a truthful message; they never show
  fabricated data (Constitution III).
- **Phasing**: These portal capabilities extend the already-shipped open ERC-20/721
  + ERC-1404 issuance/admin/discovery; they are expected to land incrementally by
  priority (P2 supply/transfer-controls/compliance/roles before P3 holders/
  distributions/activity/contract surface). The T-REX/ERC-3643 class (US4) remains
  deferred (OZ-4.x/Solidity-0.8.17 incompatibility with the repo's OZ 5.4.0 pin).
