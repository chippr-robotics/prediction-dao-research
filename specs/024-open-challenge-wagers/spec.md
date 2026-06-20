# Feature Specification: Open-Challenge Wagers Gated by a Shared Claim Code

**Feature Branch**: `claude/open-challenge-wagers-twl5m8`

**Created**: 2026-06-20

**Status**: Draft

**Input**: User description: "Open-challenge wagers gated by a shared 4-word claim code. Today the wager system binds a named opponent at creation and only that address can accept, so there is no way to post a wager that any chosen person (or a first-come taker) can take. Add an open challenge mode where a wager is created without a counterparty and is protected by a human-friendly 4-word claim code instead of a registered-key encryption recipient. The same code does triple duty: discovery, accept authorization, and readability of the private terms. Capture the security properties (offline brute-force resistance via entropy, front-running resistance at accept, out-of-band sharing), keep all existing protections at accept time, and keep named-opponent 1v1 wagers fully backward compatible."

## Overview

Today every wager names a specific counterparty (the "opponent") when it is created,
and only that exact person can accept it. There is no way to post a wager and let
someone you have not yet chosen — a specific friend you will message later, or simply
the first willing taker — pick up the other side.

This feature adds an **open challenge**: a wager created with **no named counterparty**,
protected instead by a short, human-friendly **claim code** of four ordinary words
(e.g. `river-amber-tiger-kite`). The creator shares the code out-of-band — a direct
message, a group chat, or a public post — and the code is the single thing a taker
needs. The same code does three jobs at once:

1. **Discovery** — a taker who enters the four words is taken straight to that one
   wager. Someone *without* the code sees an open challenge as one indistinguishable
   entry among many and cannot tell which wager it is, so automated scanners cannot
   single it out to snipe.
2. **Accept authorization** — only a person who can prove they hold the code may take
   the other side and become the bound opponent.
3. **Readability** — the code also unlocks the wager's private terms, so the agreed
   terms stay confidential to code-holders. This replaces the usual requirement that
   the creator encrypt the terms to a *known* recipient's published key — which is
   impossible when the taker is not yet known.

The result is a "tell-a-friend (or a crowd) the magic words" wager that is private,
hard to snipe, and does not need to know the taker in advance. Existing named-opponent
1v1 wagers and all of their flows are unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Post an open challenge and let a chosen friend take it with a code (Priority: P1)

A creator stakes a wager without naming an opponent, receives a four-word claim code,
and shares it privately with one friend. The friend opens the app, enters the four
words, is shown that exact wager with its readable terms, and accepts — becoming the
bound opponent. From that moment the wager behaves exactly like any accepted 1v1
wager (resolution, payout, refund, draw all work as today).

**Why this priority**: This is the headline capability and the minimum viable slice.
Without it there is no open-challenge feature at all. It delivers value on its own:
a private, code-gated, taker-unknown-at-creation wager that resolves like any other.

**Independent Test**: Create an open wager (no opponent named), capture the code, and —
as a *different* account that was given the code — look it up by the code, read the
terms, and accept. Confirm the accepter is now the opponent and the wager is active.

**Acceptance Scenarios**:

1. **Given** a member creates an open challenge with a stake and a claim code, **When**
   creation succeeds, **Then** the creator's stake is escrowed, the wager is discoverable
   only via its code, and no counterparty is bound yet.
2. **Given** a person who has been given the correct code, **When** they enter the four
   words, **Then** they are shown that specific wager and can read its private terms.
3. **Given** a person holding the correct code, **When** they accept, **Then** they become
   the bound opponent, their stake is escrowed, and the wager becomes active.
4. **Given** the wager has been accepted by a first taker, **When** anyone else later
   presents the same code and tries to accept, **Then** acceptance is refused because the
   counterparty slot is already filled.
5. **Given** an accepted open wager, **When** resolution, payout, refund, or draw occur,
   **Then** they behave identically to a named-opponent wager (no new resolution rules).

---

### User Story 2 - Reject takers who do not hold the code, and resist sniping (Priority: P1)

A person who does not hold the claim code must not be able to find, read, or accept the
open challenge — whether they are a casual browser, an automated scanner of newly-created
wagers, or an attacker who tries to guess the code.

**Why this priority**: The entire point of the code is to stop indiscriminate sniping and
keep terms private. If a non-holder can take or read the wager, the feature fails its core
promise. This is inseparable from Story 1 and ships with it.

**Independent Test**: As an account that was *not* given the code, attempt to (a) list/identify
the wager among open challenges, (b) read its terms, and (c) accept without the code or with a
wrong code — all must fail. Confirm a brute-force guess at the four words is computationally
impractical for a worthwhile wager within the wager's open window.

**Acceptance Scenarios**:

1. **Given** an open challenge, **When** a person without the code browses open wagers, **Then**
   they cannot determine which entry it is or read its terms.
2. **Given** an open challenge, **When** someone submits a wrong code (or no code) to accept,
   **Then** acceptance is refused.
3. **Given** an open challenge that is a favorable deal for the taker, **When** an attacker tries
   to discover the code by guessing, **Then** the number of guesses required is large enough that
   succeeding within the wager's open window is impractical (entropy floor met).
4. **Given** a legitimate taker who holds the code is submitting their acceptance, **When** an
   observer watching pending activity copies what they can see of that acceptance, **Then** the
   observer cannot use it to steal the counterparty slot for themselves — the legitimate taker who
   holds the code is the one who becomes the opponent.

---

### User Story 3 - Post a public first-come open challenge (Priority: P2)

A creator wants a public, anyone-can-take challenge: they publish the four-word code openly
(e.g. in a public channel) so the first willing person can take the other side.

**Why this priority**: A natural and valuable extension of the same mechanism — the only
difference is *how widely* the code is shared. It reuses Story 1's machinery, so it is
secondary but essentially free once Stories 1–2 exist.

**Independent Test**: Publish the code openly; have the first of several takers accept and
confirm exactly one taker is bound, the rest are refused, and the terms were readable to all
code-holders.

**Acceptance Scenarios**:

1. **Given** a publicly shared code, **When** several people race to accept, **Then** exactly one
   becomes the opponent and the others are cleanly refused (no double-accept, no stuck funds).
2. **Given** a publicly shared code, **When** any holder reads the terms, **Then** the terms are
   shown identically to all code-holders.

---

### Edge Cases

- **Creator tries to accept their own open challenge**: refused — a wager still requires two
  distinct parties; the creator cannot also be the opponent even when they trivially hold the code.
- **Concurrent acceptances**: only the first valid acceptance binds the opponent; all later ones are
  refused because the slot is filled (no funds are taken from the losers).
- **No one accepts before the accept deadline**: the open challenge expires exactly like a
  named-opponent wager — the creator's stake becomes refundable and the concurrency slot is released.
- **Creator cancels before anyone accepts**: allowed, exactly as today for an unaccepted wager;
  the stake is returned.
- **Third-party (arbitrator) resolution on an open challenge**: the arbitrator is chosen at creation,
  but the opponent is unknown then, so the rule that the arbitrator may be neither party MUST still
  hold once the taker is known — a taker who is the named arbitrator MUST be refused.
- **Self-resolution types (creator-decides / opponent-decides) on an open challenge**: permitted, but
  the taker is trusting a stranger (or being trusted by one) to report the outcome honestly; the app
  MUST make this trust implication clear before a taker accepts such a wager.
- **Sanctioned or non-member taker**: a taker who fails sanctions screening or lacks an active
  membership/limit is refused at accept time, exactly as a named opponent would be.
- **Lost code**: if the creator loses the code before anyone accepts, the wager simply cannot be
  accepted or read by anyone; it remains until it expires and the stake is refunded. The code cannot
  be recovered (there is no escrow of the code itself).
- **Terms bundle unavailable off-chain**: code-holders see a clear "terms unavailable" state and
  on-chain actions that do not need the plaintext (accept, refund, resolution) are unaffected — parity
  with existing private wagers.
- **Wrong-but-valid-looking code**: a code that is not the wager's code never reveals the terms and
  never authorizes acceptance; the taker is told the code did not match rather than shown a partial result.

## Requirements *(mandatory)*

### Functional Requirements

#### Creating an open challenge

- **FR-001**: The system MUST allow a member to create a wager with **no named counterparty** (an
  "open challenge"), in addition to the existing named-opponent wager.
- **FR-002**: Creating an open challenge MUST bind a **claim code** to the wager such that the code is
  required to discover, accept, and read it.
- **FR-003**: The claim code MUST be a human-friendly four-word phrase drawn from a standard word list,
  carrying at least ~2^44 of effective entropy (the agreed floor for resisting offline guessing).
- **FR-004**: The creator's stake MUST be escrowed at creation for an open challenge exactly as for a
  named-opponent wager (no change to custody or accounting).
- **FR-005**: An open challenge MUST count against the creator's membership limits at creation, the same
  as a named-opponent wager.
- **FR-006**: The system MUST commit to the code on-chain in a form that lets the contract later verify a
  taker's knowledge of the code **without** the creator having to store or reveal the code on-chain.

#### Discovery

- **FR-007**: A person who enters the correct four-word code MUST be taken to the single corresponding
  open challenge.
- **FR-008**: A person who does **not** hold the code MUST NOT be able to identify which open challenge a
  given code refers to, nor distinguish a specific open challenge from other open challenges by its public
  on-chain data alone.
- **FR-009**: Entering an incorrect code MUST NOT reveal any open challenge or its terms.

#### Accepting (taking the other side)

- **FR-010**: Only a party that can **prove knowledge of the code** MUST be able to accept an open
  challenge and become the bound opponent.
- **FR-011**: The acceptance flow MUST NOT expose the code (or anything reusable to derive it) to a
  front-running observer in a way that lets the observer steal the counterparty slot from the legitimate
  taker who holds the code.
- **FR-012**: The **first** valid acceptance MUST bind that taker as the opponent; all subsequent
  acceptances MUST be refused without taking their funds.
- **FR-013**: A taker who becomes the opponent MUST be subject to **all** existing accept-time
  protections, unchanged: sanctions screening (of the taker and the creator), active-membership and
  concurrency-limit checks, stake escrow of the opponent's stake, and recording of the taker against the
  wager so they can find it afterward.
- **FR-014**: The creator MUST NOT be able to accept their own open challenge (the two parties must be
  distinct).
- **FR-015**: For third-party (arbitrator) resolution, a taker who is the named arbitrator MUST be refused
  acceptance, preserving the rule that the arbitrator is neither participant.
- **FR-016**: Once an open challenge has been accepted, it MUST behave identically to a named-opponent
  wager for every subsequent action — resolution, payout claim, refund, and draw — with no new or altered
  resolution rules.

#### Readability of private terms

- **FR-017**: The private terms of an open challenge MUST be readable by anyone who holds the code and MUST
  NOT be readable by anyone who does not.
- **FR-018**: Readability MUST NOT depend on the taker having a previously published encryption key, since
  the taker is unknown at creation.
- **FR-019**: A code-holder MUST be able to verify that the terms they read are the ones the wager
  committed to (a substituted or corrupted terms bundle is detectable, not shown as valid) — parity with
  existing private wagers.
- **FR-020**: If the off-chain terms cannot be retrieved, code-holders MUST see a clear "terms unavailable"
  state, and on-chain actions that do not require the plaintext MUST remain available.

#### Lifecycle, refunds, and expiry

- **FR-021**: An unaccepted open challenge MUST be cancellable by its creator (stake returned), exactly as
  an unaccepted named-opponent wager.
- **FR-022**: An open challenge that no one accepts before its accept deadline MUST become refundable to the
  creator and release the creator's concurrency slot, exactly as a named-opponent wager that was never
  accepted — including via any existing batch-expiry path.
- **FR-023**: The "decline" action (a named opponent rejecting a wager) MUST NOT apply to an open challenge,
  since there is no named opponent to decline; the creator's cancel path covers the equivalent need.

#### Backward compatibility and honesty

- **FR-024**: All existing named-opponent wagers and their flows (create, accept, cancel, decline, resolve,
  draw, refund, claim) MUST continue to work unchanged; the open-challenge path is additive.
- **FR-025**: The app MUST present an open challenge's state honestly: that it has no counterparty yet, that
  it is code-gated, and — for self-resolution types — that the chosen resolver (creator or opponent) will be
  trusted to report the outcome.
- **FR-026**: The system MUST make clear to a creator which resolution types are trust-minimized for an open
  challenge (oracle-resolved and "either side submits") versus those that rely on a participant's honesty,
  so the creator can choose appropriately for a taker they may not know.

### Key Entities *(include if feature involves data)*

- **Open Challenge**: A wager with no counterparty bound at creation, protected by a claim code. Becomes an
  ordinary accepted wager once a code-holding taker accepts. Carries the same stake, token, deadlines,
  resolution type, and (optional) arbitrator as any wager.
- **Claim Code**: A four-word, human-shareable secret that simultaneously enables discovery, authorizes
  acceptance, and unlocks the private terms of one open challenge. Held by whoever the creator shares it
  with; never stored on-chain in recoverable form. Its entropy is the security parameter that resists
  offline guessing.
- **Code Commitment**: The public, on-chain value bound to a wager that lets the contract verify a taker
  knows the code, and lets the app route a code to its wager, without exposing the code itself.
- **Taker (Opponent)**: The first code-holder to accept; becomes the bound opponent and is thereafter
  treated exactly like a named opponent (subject to sanctions, membership, escrow, and resolution rules).
- **Private Terms Bundle**: The off-chain confidential terms of the wager, unlockable with the code and
  verifiable against the on-chain commitment, with no dependency on the taker's identity or published key.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A creator can post an open challenge without naming anyone and receive a shareable four-word
  code in a single creation flow.
- **SC-002**: 100% of takers who hold the correct code can find the wager, read its terms, and accept it
  (when still open), with no step requiring them to have been named in advance.
- **SC-003**: 100% of attempts to read or accept an open challenge **without** the correct code fail to
  reveal the terms or bind the taker.
- **SC-004**: For an open challenge that is a favorable deal for the taker, guessing the code by brute force
  is impractical within the wager's open window (the chosen entropy floor of ~2^44 or greater is met).
- **SC-005**: In a race where several code-holders try to accept, exactly one becomes the opponent and no
  losing taker has funds taken or left stuck.
- **SC-006**: A front-running observer who copies what is visible of a legitimate taker's acceptance cannot
  use it to take the counterparty slot for themselves.
- **SC-007**: 100% of accepted open challenges enforce the same accept-time protections as named-opponent
  wagers (sanctions screening, membership/limits, escrow, self-accept rejection, arbitrator-not-a-party).
- **SC-008**: 100% of existing named-opponent wager flows pass their existing tests unchanged (no regression).
- **SC-009**: After acceptance, an open challenge is indistinguishable from a named-opponent wager for
  resolution, payout, refund, and draw (same outcomes in equivalent scenarios).

## Assumptions

- **Builds on the existing wager escrow, membership, sanctions, and private-terms machinery.** This feature
  adds a counterparty-less creation mode and a code-based gate; it does not change stakes, payouts, the set
  of resolution types, or the rules of resolution beyond who may accept.
- **The claim code is shared out-of-band by the creator.** The system generates and displays the code at
  creation and routes it to its wager; it does not deliver the code to takers (the creator messages, posts,
  or speaks it). There is no on-chain or in-app directory that maps people to codes.
- **Four words from a standard word list is the agreed entropy floor (~2^44).** This is a deliberate
  trade-off between memorability/shareability and resistance to offline guessing; higher-entropy options may
  be offered later but four words is the v1 baseline. Low-entropy formats (short PINs, a few emoji from a
  small set) are explicitly out of scope because the public on-chain commitment makes them brute-forceable.
- **The code, not a registered key, secures private terms for open challenges.** Named-opponent private
  wagers continue to use the existing recipient-key encryption; only open challenges use code-derived
  readability (because the taker is unknown at creation).
- **First-come-first-served acceptance is acceptable and intended.** For a favorable open challenge, the
  fastest code-holder wins the slot; this is by design (it is how a public challenge works) and is not
  treated as a defect.
- **Trust implications of self-resolution are surfaced, not prevented.** Open challenges with
  creator-decides or opponent-decides resolution are allowed, but the app warns about the trust required;
  oracle-resolved and "either side submits" types are the trust-minimized recommendations.
- **Networks**: Applies to the live deployments (Polygon mainnet, Amoy testnet); legacy read-only networks
  are out of scope.
- **No new fund or resolution mechanics, and no change to the on-chain stake-custody model.** The contract
  remains the escrow; the only fund-flow change is *who* is allowed to become the opponent and *when* their
  identity is determined.
