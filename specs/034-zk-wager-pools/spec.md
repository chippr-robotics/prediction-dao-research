# Feature Specification: ZK-Wager Pools

**Feature Branch**: `claude/wager-pool-group-gateway-u4g0zq`

**Created**: 2026-06-27

**Status**: Draft

**Input**: User description: "A new wager management flow that allows larger groups while staying simple to share among members. Pools are discovered and joined with a four-word phrase built from the BIP-39 wordlist, with a word-list language selector in My Account. Members get anonymous two-word nicknames decoupled from their wallet. Resolution is by anonymous m-of-n consensus. Launched from a new quick-action button. The privacy mechanics may later be reused elsewhere in the app."

## Overview

FairWins today supports one-to-one wagers escrowed and resolved through the
`WagerRegistry`. This feature adds **group wager pools**: a creator opens a pool,
many members buy in, and the group reaches an outcome together — while sharing
nothing more complicated than four ordinary words and never exposing which
on-chain wallet cast which vote.

The guiding product principle is **"Web2 friction, Web3 sovereignty"**: members
keep self-custody of their funds and identity, but never have to copy a contract
address, manage a native gas token, or read a hex string to participate.

This ships as a **parallel system** to the existing `WagerRegistry` (a separate
group-pool surface), with shared compliance and membership interfaces so it can
converge with the wider wager ecosystem later. The anonymous-identity and
nickname layer is designed as a **reusable module** that could improve privacy
for existing one-to-one wagers in a future feature (out of scope here).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and join a group pool with four words (Priority: P1)

A creator starts a group wager pool from a new quick-action button, sets the
buy-in amount and group size, and receives a memorable **four-word phrase**
(e.g. `crystal-orbit-harbor-violet`) to share. Friends open FairWins, type the
four words, see the pool details (buy-in, members joined, slots remaining), and
join by paying the buy-in. On joining, each member is shown a stable, friendly
**two-word nickname** (e.g. "Prismatic Fox") that represents them inside that
pool without revealing their wallet. The group then reaches an outcome by
anonymous **m-of-n consensus**: enough members independently agree on how the
pot is split, the pool locks that result, and winners claim their share.

**Why this priority**: This is the core product — a shareable, larger-group
wager whose participants and votes are unlinkable to wallet addresses. It is the
minimum that delivers the headline value ("larger groups, simple to share,
private") and is independently demonstrable end to end.

**Independent Test**: Create a pool, share the four words to a second device,
join from it, have a quorum agree on a payout split, lock the result, and claim
winnings — all without sharing a contract address and without any participant's
vote being attributable to their wallet.

**Acceptance Scenarios**:

1. **Given** a creator on the dashboard, **When** they use the new pool
   quick-action and set buy-in and maximum members, **Then** the system creates
   an isolated pool and returns a unique four-word phrase that maps to it.
2. **Given** a valid four-word phrase, **When** a participant enters it, **Then**
   the pool's buy-in, current member count, and remaining slots are displayed
   before they commit funds.
3. **Given** a participant viewing a pool with open slots, **When** they join and
   pay the buy-in, **Then** their stake is escrowed, the member count increments,
   and they are assigned a deterministic two-word nickname stable for that pool.
4. **Given** a participant attempting to join a full pool, **When** they submit,
   **Then** the join is rejected and they are told the pool is full.
5. **Given** a joined member, **When** they vote on a payout outcome, **Then**
   their vote counts toward consensus exactly once and cannot be linked to their
   wallet address.
6. **Given** a member who has already voted on an outcome, **When** they attempt
   to vote again on the same outcome, **Then** the second vote is rejected.
7. **Given** a pool where an m-of-n majority has agreed on the same payout
   outcome, **When** the threshold is reached, **Then** the pool locks that
   outcome and no further votes change the result.
8. **Given** a locked, resolved pool, **When** a member entitled to a payout
   claims, **Then** they receive their share and cannot claim twice.

---

### User Story 2 - Choose a word-list language in My Account (Priority: P1)

A member opens **My Account** and selects their preferred **word-list language**
(for example English, Spanish, Japanese, French) from a language selector. The
four-word pool phrases and the join field then read in their chosen language,
because the same underlying pool can be expressed in any supported language's
standard wordlist.

**Why this priority**: The four-word gateway is the primary onboarding surface;
international members must be able to read and type phrases in their own
language for the gateway to be usable. It is small but tightly coupled to the P1
gateway.

**Independent Test**: Change the word-list language in My Account, create or open
a pool, and confirm the four-word phrase renders in the selected language and
that entering the phrase in that language resolves to the correct pool.

**Acceptance Scenarios**:

1. **Given** the My Account settings, **When** a member opens word-list
   preferences, **Then** they can choose from the supported languages and the
   choice persists for their account.
2. **Given** a member with a selected language, **When** a pool phrase is shown,
   **Then** the four words are drawn from that language's wordlist.
3. **Given** a phrase generated in one language, **When** it identifies a pool,
   **Then** the same pool is resolvable regardless of which member's language is
   active (the phrase identifies the pool, not the language).
4. **Given** no explicit selection, **When** a member first uses the gateway,
   **Then** a sensible default language is applied.

---

### User Story 3 - Gasless join without a native gas token (Priority: P2)

A member joins a pool and pays the buy-in **without ever holding the network's
native gas token**. They approve the buy-in with a single off-chain signature,
and the transaction is submitted and paid for on their behalf. From the member's
perspective, joining is one tap and one signature.

**Why this priority**: Removing the native-gas-token hurdle is essential to the
"Web2 friction" promise and meaningfully widens who can participate, but the pool
is already viable (P1) with members paying their own gas. It layers on top of P1.

**Independent Test**: From a wallet holding only the buy-in currency (no native
gas token), join a pool with a single signature and confirm the stake is
escrowed and membership recorded, with the member paying no native gas.

**Acceptance Scenarios**:

1. **Given** a member with sufficient buy-in currency but no native gas token,
   **When** they join via the gasless flow, **Then** the buy-in is authorized and
   pulled in a single confirmed transaction and the member pays no native gas.
2. **Given** a signed gasless join request, **When** the relaying service is
   temporarily unavailable, **Then** the member is informed and no funds are
   moved until the request succeeds.
3. **Given** a gasless join request, **When** its authorization signature has
   expired, **Then** the join is rejected and the member is prompted to re-sign.
4. **Given** a replayed or duplicate gasless request, **When** it is submitted
   again, **Then** it does not result in a second buy-in or double charge.

---

### User Story 4 - Live unresolved leaderboard for multi-round formats (Priority: P3)

For tournaments, multi-round games, or elimination brackets, the creator runs a
visual dashboard where they update scores or eliminate players using the
**two-word nicknames**. All members watch the standings change in near real time
without sending any transaction or revealing their wallet, until the format
concludes and the group resolves the final payout on-chain (per User Story 1).

**Why this priority**: It enriches the experience for structured competitions and
showcases the nickname layer, but simple pools resolve fine without it. It is the
most independent and least critical slice.

**Independent Test**: In an active pool, have the creator update scores and
eliminate a player from the dashboard, and confirm every member sees the updated
standings by nickname in near real time with no member transaction required.

**Acceptance Scenarios**:

1. **Given** an active pool, **When** the creator updates a score or eliminates a
   player, **Then** members see the revised standings (by nickname) without
   sending a transaction.
2. **Given** live standings, **When** a member views the leaderboard, **Then**
   players are identified only by two-word nickname, never by wallet address.
3. **Given** the leaderboard reflects an interim, non-final state, **When** it is
   displayed, **Then** the UI clearly marks it as unresolved/off-chain and not a
   settled on-chain outcome.

---

### Edge Cases

- **Phrase collision**: Two pools must never share the same four-word phrase at
  the same time; the system must guarantee uniqueness when generating phrases.
- **Invalid / mistyped phrase**: Entering words not in the wordlist, the wrong
  word count, or a phrase that maps to no pool must produce a clear "not found"
  message, not a confusing error.
- **Stale phrase**: Opening the phrase for a pool that is already full, resolved,
  or cancelled must surface that state rather than offering to join.
- **Under-quorum pool**: A pool that never reaches its consensus threshold (too
  few members vote) needs a defined outcome — e.g. a timeout that allows members
  to recover their buy-in.
- **Tie / competing outcomes**: If members split across two different payout
  outcomes and neither reaches the threshold, the pool must remain unresolved
  until one outcome reaches quorum or the timeout path triggers.
- **Creator abandonment**: A pool whose creator disappears (P3 leaderboard never
  finalized) must still allow the group to resolve or recover funds.
- **Nickname collision**: Two members deriving the same two-word nickname within
  one pool should be disambiguated so standings remain unambiguous.
- **Lost identity secret**: A member who loses the local secret behind their
  anonymous identity may be unable to vote; the consequences (and any recovery)
  must be made clear.
- **Late join during resolution**: Attempting to join after voting/resolution has
  begun must be handled deterministically (rejected or clearly scoped).
- **Refund/cancellation**: A pool cancelled before it fills must return every
  member's buy-in.

## Requirements *(mandatory)*

### Functional Requirements

#### Group pools & the four-word gateway

- **FR-001**: The system MUST let a member create a group wager pool by
  specifying at least a buy-in amount, a buy-in currency, a maximum number of
  members, and the consensus threshold required to resolve.
- **FR-002**: Each pool MUST have **isolated state** so that one pool's data and
  funds cannot be affected by another pool, and so total on-chain footprint stays
  bounded regardless of how many pools exist.
- **FR-003**: On creation, the system MUST generate a **unique four-word phrase**
  drawn from the BIP-39 wordlist that maps to exactly one pool, with guaranteed
  uniqueness among active pools.
- **FR-004**: A member MUST be able to discover and load a pool by entering its
  four-word phrase, with no need to handle a contract address.
- **FR-005**: Before committing funds, a joining member MUST be shown the pool's
  buy-in amount, currency, current member count, and remaining slots.
- **FR-006**: The system MUST let a member join an open pool by paying the buy-in,
  escrowing that stake until the pool resolves, refunds, or is cancelled.
- **FR-007**: The system MUST reject joins to a pool that is full, resolved, or
  cancelled, with a clear reason.
- **FR-008**: The new pool flow MUST be launchable from a **new quick-action
  button** on the dashboard alongside the existing quick actions.

#### Anonymous identity & nicknames

- **FR-009**: When a member joins, the system MUST assign them a **stable two-word
  nickname** that is consistent for the duration of that pool.
- **FR-010**: A member's nickname and their votes MUST NOT be linkable to their
  wallet address by other members or observers of on-chain data.
- **FR-011**: The nickname MUST be derived deterministically from the member's own
  local identity material so it is reproducible for that member in that pool.
- **FR-012**: Nicknames MUST be unique-enough within a pool that standings and
  leaderboards are unambiguous; collisions within a pool MUST be disambiguated.

#### Resolution by anonymous consensus

- **FR-013**: Each pool MUST support resolution by **m-of-n anonymous consensus**,
  where a configured threshold of members must independently agree on the same
  payout outcome for it to take effect.
- **FR-014**: Each member MUST be able to vote on a payout outcome **exactly once**
  per outcome; repeat votes MUST be rejected (no double-voting).
- **FR-015**: A member's vote MUST be verifiable as coming from a legitimate pool
  member without revealing which member or which wallet cast it.
- **FR-016**: When the consensus threshold is reached for an outcome, the pool
  MUST lock that outcome as final and prevent further changes to the result.
- **FR-017**: After resolution, members entitled to a payout MUST be able to claim
  their share, and MUST NOT be able to claim more than once.
- **FR-018**: The payout outcome MUST encode how the escrowed pot is divided among
  recipients, and claims MUST be validated against the locked outcome.
- **FR-019**: The system MUST define a fallback for pools that never reach
  consensus within a bounded time, allowing members to recover their buy-in
  (refund/timeout path) so funds are never permanently stuck.
- **FR-020**: Who may propose a payout outcome, and whether multiple competing
  outcomes may be voted on simultaneously, MUST be defined.
  [NEEDS CLARIFICATION: Can any member submit a candidate payout outcome (so the
  group votes among competing proposals), or only the creator proposes and members
  approve/reject a single outcome?]

#### Compliance, membership & funds safety

- **FR-021**: Pool participation MUST respect the platform's existing compliance
  posture. [NEEDS CLARIFICATION: Anonymous, relayer-submitted joins are in tension
  with the existing per-wager sanctions screening and membership gating
  (`WagerRegistry` screens both parties and enforces membership limits). Which
  controls apply at pool join — sanctions screening of the joining wallet,
  membership-tier gating, both, or a different model for pools?]
- **FR-022**: Escrowed funds MUST only ever be released via a resolved payout
  claim or a refund/cancellation path; there MUST be no path for the creator or
  any party to unilaterally withdraw other members' stakes.
- **FR-023**: A pool cancelled before it fills (or otherwise voided) MUST refund
  every member's buy-in in full.
- **FR-024**: The buy-in currency for pools is USDC (the platform's stable buy-in
  currency); support for other allowlisted currencies is out of scope for this
  feature unless later specified.

#### Gasless participation (P2)

- **FR-025**: The system MUST let a member authorize and pay their buy-in with a
  single off-chain signature, such that they need not hold the network's native
  gas token to join.
- **FR-026**: Gasless join requests MUST be single-use and resistant to replay, so
  a member is never charged twice for one join.
- **FR-027**: An expired or malformed gasless authorization MUST be rejected
  cleanly and the member prompted to retry, with no partial fund movement.
- **FR-028**: If the gas-relaying service is unavailable, the member MUST be
  informed and no funds MUST move until the request is successfully processed.

#### Live leaderboards (P3)

- **FR-029**: For multi-round/elimination formats, the creator MUST be able to
  update scores and eliminate players, identified by two-word nickname, without
  requiring members to send transactions.
- **FR-030**: Members MUST be able to watch live standings update in near real
  time, with players shown only by nickname.
- **FR-031**: Interim, off-chain standings MUST be visually distinguished from a
  final, settled on-chain outcome so members are never misled about finality.

#### Indexing & data availability

- **FR-032**: Because pools are created dynamically, the system MUST index each
  new pool's activity (joins, allocations, nickname references, and final
  payouts) automatically once the pool is created, without manual reconfiguration
  per pool.
- **FR-033**: Pool data presented to members MUST be scoped to the active network
  and MUST NOT leak across testnet/mainnet boundaries.

### Key Entities *(include if data involved)*

- **Wager Pool**: An isolated group wager. Attributes: buy-in amount and currency,
  maximum members, current member count, consensus threshold, lifecycle state
  (open / full / resolving / resolved / cancelled), creation time, escrowed
  balance, and the locked payout outcome once resolved. Has exactly one four-word
  phrase while active.
- **Four-Word Phrase**: A human-readable identifier drawn from a BIP-39 wordlist
  that maps one-to-one to an active pool. Language-independent in identity; can be
  rendered in any supported language's wordlist.
- **Pool Member**: A participant who has paid the buy-in. Holds an anonymous
  in-pool identity and a derived two-word nickname; entitled to vote once per
  outcome and to claim any payout owed.
- **Anonymous Identity**: Local, member-held identity material that lets a member
  prove pool membership and cast an unlinkable vote, and from which their nickname
  is deterministically derived.
- **Two-Word Nickname**: A stable, friendly label representing a member within one
  pool, decoupled from their wallet address.
- **Payout Outcome (Proposal)**: A proposed division of the escrowed pot among
  recipients, identified by a fixed reference that members vote on; becomes the
  locked result when it reaches consensus.
- **Vote**: A single, anonymous, member-authenticated endorsement of a payout
  outcome, counted at most once per member per outcome.
- **Word-List Language Preference**: A per-member account setting selecting which
  language's wordlist is used to render and read four-word phrases.
- **Leaderboard State (P3)**: Off-chain, creator-maintained interim standings for
  multi-round formats, expressed by nickname and explicitly non-final.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A creator can open a new pool and obtain its shareable four-word
  phrase in under 60 seconds from the dashboard.
- **SC-002**: A new participant who is given only the four words can find and join
  the correct pool in under 2 minutes, without ever seeing or entering a contract
  address.
- **SC-003**: 100% of generated four-word phrases are unique among concurrently
  active pools (zero collisions).
- **SC-004**: No member's vote or nickname can be linked to their wallet address
  using on-chain data alone (verified by review/audit of what is observable).
- **SC-005**: Each member can vote at most once per payout outcome; 0% of pools
  resolve on duplicated or double-counted votes.
- **SC-006**: A pool with a quorum of agreeing members resolves and locks its
  outcome, and entitled members can claim their full share with no double-claims.
- **SC-007**: Pools that fail to reach consensus within the defined window always
  return every member's buy-in; 0% of buy-ins become permanently unrecoverable.
- **SC-008**: At least 4 word-list languages are selectable in My Account, and a
  phrase generated under one member's language resolves to the same pool for a
  member using a different language.
- **SC-009 (P2)**: A member holding only the buy-in currency and no native gas
  token can join a pool successfully with a single signature.
- **SC-010 (P3)**: When the creator updates standings, every viewing member sees
  the change within a few seconds and never sends a transaction to do so.
- **SC-011**: On-chain storage per pool stays bounded — the cost of operating the
  system does not grow without limit as the number of pools increases.

## Assumptions

- **Parallel to existing wagers**: Pools ship as a separate group-pool surface
  alongside `WagerRegistry`, not as a modification of the one-to-one wager
  contract. Shared membership/compliance interfaces are designed for future
  convergence but the two systems operate independently for now. This is an
  intentional, documented exception to the usual "route escrow through
  `wagerRegistry`" guidance and will be reflected in `CLAUDE.md`.
- **Reusable privacy module (future)**: The anonymous-identity + nickname layer is
  designed to be reusable so a later feature could bring it to one-to-one wagers;
  that integration is explicitly out of scope here.
- **Buy-in currency**: USDC is the buy-in currency for v1 pools.
- **Phrase source**: The four words come from the standard BIP-39 wordlist, which
  has equivalent lists across supported languages — this is what enables the
  language selector.
- **Default language**: English is the default word-list language when a member
  has not chosen one.
- **Identity custody**: Members are responsible for their local anonymous-identity
  material (consistent with self-custody); recovery of a lost identity secret is
  out of scope unless raised in clarification.
- **Quorum/timeout configured at creation**: The consensus threshold and the
  resolution timeout window are set when the pool is created.
- **Network**: Pools target the platform's standard L2 deployment networks, with
  data strictly scoped per active network.
- **Gasless is additive (P2)**: P1 pools are fully usable with members paying their
  own gas; the gasless relayer is a P2 enhancement, not a P1 dependency.
- **Leaderboard authority (P3)**: The pool creator is the off-chain authority for
  interim standings; standings are advisory until the group resolves the final
  payout on-chain.

## Out of Scope

- Bringing anonymous identity/nicknames to existing one-to-one `WagerRegistry`
  wagers (designed-for, not implemented).
- Buy-in currencies other than USDC.
- Automated/oracle-based pool resolution (pools resolve by member consensus, not
  Polymarket/Chainlink/UMA oracles).
- Recovery of a lost local anonymous-identity secret.
- On-chain enforcement of interim leaderboard standings (P3 standings are
  off-chain and advisory).

## Dependencies

- The platform's existing membership and compliance/sanctions screening surfaces
  (for the shared interfaces referenced in FR-021), pending the clarification on
  how they apply to anonymous pool joins.
- The dashboard quick-action surface (for the new pool button).
- The My Account settings surface (for the word-list language selector).
- Per-network address/config sync used by the frontend (pool data must come from
  generated sync artifacts, never hardcoded).
