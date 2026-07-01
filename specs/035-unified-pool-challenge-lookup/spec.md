# Feature Specification: Unified Phrase Lookup for Pools & Challenges, Consolidated My Wagers, and Recovery Codes in Security

**Feature Branch**: `claude/unified-pool-challenge-lookup-mslzd9`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "we have recently expanded the fairwins app to allow for 'pools' as well as adding 'open challenges'. both of these systems have similar mechanics for sharing and joining using a 4 word phrase for coordination. The site uses a 'my wagers' for displaying data on wagers and historical data. From a users point of view, we need to simplify lookup and management of their active wagers and pools together. 'join a pool' and 'take a challenge' should be combined into the same feature. a user should enter a phrase and we will find the counterparty whether it is a pool or challenge and present the user with the appropriate interface. recoverycodes should be moved to the security tab of the 'my accounts' page."

## Overview

FairWins has grown two independently-built ways to be invited into someone else's
wager coordination:

- **Open challenges** (a code-gated 1v1 wager) are taken by entering a **four-word
  phrase** under the "Take a challenge" tab of the Open Challenge surface.
- **Group pools** (a larger multi-member buy-in) are joined by entering a
  **four-word phrase** under the "Join a pool" tab of the Group Pool surface.

To a person holding four words a friend sent them, these are the same action —
"someone gave me four words, take me to the thing." But today the app forces them
to already know *which kind of thing* it is and to pick the correct, separate
entry point. Guess wrong and the phrase "doesn't work," even though it is valid.

This feature makes the phrase the primary object and the type a detail the system
figures out. It delivers three connected simplifications:

1. **One lookup for both.** A single "enter your phrase" flow replaces the separate
   "Take a challenge" and "Join a pool" entry points. The user types four words;
   the system determines whether the phrase points to an open challenge or a group
   pool and shows the matching take/join interface — the user never has to know the
   type in advance.
2. **One place to manage everything.** The existing **My Wagers** view — today
   limited to 1v1 wagers — becomes the single hub where a user sees and manages
   their active and historical wagers, open challenges, and pools together.
3. **Recovery codes where security lives.** The open-challenge **recovery codes**
   feature (the device-local code backup, today buried as a third tab inside the
   Open Challenge surface) moves to the **Security** tab of the My Account page,
   next to the other key/recovery material.

Creating a challenge and creating a pool remain distinct actions (they ask for
different things); only the **join/take** side and the **management/recovery**
surfaces are unified.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One phrase finds the right thing (Priority: P1)

Dana receives four words from a friend — "crystal orbit harbor violet" — with no
explanation of whether it's a pool or a challenge. Dana opens FairWins, finds one
obvious "enter a phrase" action, types the four words, and taps find. The system
recognizes the phrase as a group pool and shows Dana the pool details (buy-in,
members joined, slots remaining) with a Join action. Had the same phrase pointed to
an open challenge instead, Dana would have seen the challenge terms and stake with a
Take action — from the exact same starting point and without choosing a type.

**Why this priority**: This is the core of the request and the largest usability
win. It removes the "guess the type or it won't work" failure and collapses two
entry points into one. It is independently valuable even if My Wagers and recovery
codes are untouched.

**Independent Test**: From the unified lookup, enter a known pool phrase and confirm
the pool join interface appears; enter a known challenge phrase and confirm the
challenge take interface appears; enter an unknown phrase and confirm a clear
"not found" result — all without any type selector.

**Acceptance Scenarios**:

1. **Given** a valid phrase that identifies an active open challenge, **When** the
   user submits it in the unified lookup, **Then** the system presents the
   take-a-challenge interface (terms, stake, and accept action) for that challenge.
2. **Given** a valid phrase that identifies an open group pool, **When** the user
   submits it in the unified lookup, **Then** the system presents the join-a-pool
   interface (buy-in, members joined, slots remaining, join action) for that pool.
3. **Given** a well-formed phrase that matches neither a challenge nor a pool,
   **When** the user submits it, **Then** the system shows a single clear "no match
   found" message and lets the user correct and retry.
4. **Given** a phrase entered with extra spaces, mixed case, or hyphens between
   words, **When** the user submits it, **Then** the system normalizes the input and
   resolves it the same as the canonical form.
5. **Given** the user submits an entry that is not four valid words, **When** they
   attempt the lookup, **Then** the system explains what a valid phrase looks like
   without performing a failed on-chain search.

---

### User Story 2 - Manage wagers, challenges, and pools in one place (Priority: P2)

Sam has an active 1v1 wager, took an open challenge last week, and joined a pool with
friends. Instead of hunting through three separate surfaces, Sam opens **My Wagers**
and sees all three, each labeled by type and status, alongside past/resolved items.
From this one hub Sam can open any item to act on it — claim a settled wager, view a
challenge's terms, or check a pool's progress toward resolution.

**Why this priority**: The request explicitly asks to "simplify lookup and management
of their active wagers and pools together." My Wagers is the natural home, but it
currently ignores challenges and pools, so users must remember where each lives. High
value, but the lookup unification (P1) is the more urgent friction.

**Independent Test**: With at least one wager, one taken/created challenge, and one
joined/created pool on the account, open My Wagers and confirm all three appear with
correct type labels and statuses, and that opening each routes to the correct
management interface.

**Acceptance Scenarios**:

1. **Given** a user who participates in wagers, open challenges, and pools, **When**
   they open My Wagers, **Then** all three item types are listed together with a
   visible type indicator and current status.
2. **Given** the combined list, **When** the user filters or switches to active vs.
   history, **Then** items of every type are included in the appropriate active or
   historical grouping.
3. **Given** an item in the list, **When** the user selects it, **Then** they are
   taken to the correct interface for that item type (wager detail, challenge take/
   resolve, or pool management).
4. **Given** a user with no challenges or pools, **When** they open My Wagers,
   **Then** the view behaves exactly as before for wagers with no empty-state errors.

---

### User Story 3 - Recovery codes live in Security (Priority: P3)

Priya wants to back up or recover the codes for open challenges she created. She goes
to **My Account → Security**, where recovery/key material already lives, and finds the
recovery-codes feature there. She no longer has to open the Open Challenge creation
surface and hunt for a "Recover codes" tab to get to it.

**Why this priority**: A discoverability and information-architecture fix. It is the
smallest slice and is independent of the lookup and My Wagers work, so it can ship on
its own.

**Independent Test**: Open My Account → Security and confirm the recovery-codes
feature is present and fully functional there; confirm it is no longer required to
open the challenge-creation surface to reach it.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they open My Account → Security, **Then** the
   recovery-codes feature (unlock, view saved codes, copy a code) is available there.
2. **Given** the recovery-codes feature has moved, **When** the user opens the Open
   Challenge surface, **Then** it no longer presents a separate recovery-codes tab, or
   redirects the user to Security for that function.
3. **Given** a user who previously saved codes, **When** they access recovery codes
   from Security, **Then** all their previously saved codes remain accessible (no data
   loss from the move).

---

### Edge Cases

- **Both types match the same phrase (collision).** The two systems use overlapping
  four-word phrase spaces, so a phrase could in principle resolve to both an active
  challenge and an open pool. The system MUST NOT silently pick one; it presents the
  user with both matches and lets them choose which to open.
- **Language mismatch.** Pools support multiple phrase languages (per the account
  word-list language setting); challenges use the English word list only. A phrase
  entered in a non-English language can only resolve to a pool. The lookup MUST resolve
  against the appropriate language(s) and not report "invalid" for a legitimate
  non-English pool phrase.
- **Item exists but is not actionable.** The phrase resolves to a challenge that is
  already accepted/expired/cancelled, or to a pool that is full/closed/past its join
  window. The system MUST show the item with an explanatory state rather than a bare
  "not found."
- **Self-match.** The phrase belongs to a challenge or pool the user themselves
  created or already joined. The system MUST route them to the appropriate management
  view rather than offering to join/take again.
- **Deep links / shared links.** Existing shared links that carried a phrase or code
  into the old "take a challenge" flow MUST continue to work by routing into the
  unified lookup with the phrase pre-filled and resolved.
- **Whitespace, case, hyphen, and Unicode normalization.** Phrases pasted with mixed
  case, hyphen separators, leading/trailing spaces, or Unicode variants MUST normalize
  to the same canonical result.
- **Ambiguous partial input.** Fewer or more than four words, or a word not in the
  relevant word list, is caught as an input-format error before any lookup.
- **No key / not connected.** Read-only lookup and preview MUST NOT require a wallet
  signature; only the terminal join/take action may require one, matching today's
  behavior.

## Requirements *(mandatory)*

### Functional Requirements

**Unified phrase lookup**

- **FR-001**: The system MUST provide a single entry point where a user enters a
  four-word phrase to be taken to the matching pool or open challenge, replacing the
  separate "Take a challenge" and "Join a pool" entry points.
- **FR-002**: The system MUST accept the phrase without requiring the user to declare
  in advance whether it belongs to a pool or a challenge.
- **FR-003**: On submission, the system MUST attempt to resolve the phrase against both
  the open-challenge lookup and the group-pool lookup and determine the item type from
  the results.
- **FR-004**: When the phrase resolves uniquely to an open challenge, the system MUST
  present the existing take-a-challenge interface for that challenge, preserving all
  current behavior (terms preview, accept authorization, stake/approval, decryption).
- **FR-005**: When the phrase resolves uniquely to a group pool, the system MUST
  present the existing join-a-pool interface for that pool, preserving all current
  behavior (pool summary, buy-in approval, join, membership identity).
- **FR-006**: When the phrase resolves to both an open challenge and a pool, the system
  MUST present both matches and let the user choose which to open; it MUST NOT silently
  select one.
- **FR-007**: When the phrase matches neither an active challenge nor an open pool, the
  system MUST show a single, clear "no match found" outcome and allow correction and
  retry.
- **FR-008**: The system MUST validate and normalize phrase input (word count, valid
  words, case, whitespace, hyphen/separator, Unicode) before performing a lookup, and
  explain the expected format when input is malformed.
- **FR-009**: The system MUST honor the user's word-list language preference for pool
  resolution and resolve English phrases for challenges, so a legitimate phrase in a
  supported language is not rejected as invalid.
- **FR-010**: The read-only lookup and preview MUST NOT require a wallet signature; only
  the final join/take action may prompt for one, matching current behavior.
- **FR-011**: When a resolved item is not actionable (challenge already accepted/expired/
  cancelled; pool full/closed/past its join window), the system MUST display the item
  with an explanatory state rather than a generic "not found."
- **FR-012**: When the phrase resolves to an item the user already created or joined, the
  system MUST route them to the appropriate management/detail view instead of offering a
  duplicate join/take.
- **FR-013**: Existing deep links / shared links that carried a phrase or code into the
  prior take-a-challenge flow MUST continue to work by opening the unified lookup with the
  phrase pre-filled and resolved.
- **FR-014**: The unified lookup MUST NOT change the on-chain mechanics, code/phrase
  derivation, entropy, or security properties of either open challenges or pools; it only
  unifies discovery and presentation.

**Consolidated My Wagers**

- **FR-015**: My Wagers MUST display the user's open challenges and pools alongside their
  1v1 wagers, for both active and historical items.
- **FR-016**: Each item in My Wagers MUST show a clear type indicator (wager, open
  challenge, or pool) and its current status.
- **FR-017**: My Wagers MUST group items of every type correctly into active vs.
  historical/resolved views and apply existing sort/filter controls across all types.
- **FR-018**: Selecting any item in My Wagers MUST route the user to the correct
  management interface for that item type (wager detail/resolution, challenge take/
  resolve, or pool management).
- **FR-019**: My Wagers MUST continue to behave correctly for users who have no
  challenges or pools (no errors, graceful empty states), preserving today's wager-only
  experience.

**Recovery codes in Security**

- **FR-020**: The open-challenge recovery-codes feature (unlock, list saved codes, copy a
  code) MUST be available from the Security tab of the My Account page.
- **FR-021**: After the move, the Open Challenge surface MUST NOT require a separate
  recovery-codes tab to reach that function; any remaining reference MUST direct the user
  to Security.
- **FR-022**: Codes a user saved before the move MUST remain accessible from the new
  Security location with no data loss.
- **FR-023**: Access to recovery codes from Security MUST preserve the current
  protection (e.g., the existing unlock/authorization step) before codes are revealed.

### Key Entities *(include if data involved)*

- **Four-word phrase**: The human-friendly coordination string a person shares to invite
  someone into a challenge or pool. The primary lookup key in this feature; its type
  (challenge vs pool) is resolved by the system rather than declared by the user.
- **Open challenge**: A code-gated 1v1 wager discovered and taken via a phrase; has terms,
  stake, and an actionable lifecycle state (open/accepted/expired/cancelled).
- **Group pool**: A multi-member buy-in discovered and joined via a phrase; has a buy-in,
  member/slot counts, approval threshold, and join/resolution windows.
- **Lookup result**: The outcome of resolving a phrase — one of: single challenge match,
  single pool match, both (collision), none, or matched-but-not-actionable — that drives
  which interface is shown.
- **My Wagers item**: A unified list entry representing a wager, open challenge, or pool,
  carrying a type indicator, status, and the route to its management interface.
- **Recovery codes vault**: The user's device-local backup of open-challenge codes,
  gated by an unlock step, relocated to the Security tab.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user given a four-word phrase can reach the correct pool or challenge
  interface from a single entry point without first selecting or knowing the item type.
- **SC-002**: The number of distinct entry points a user must choose between to act on a
  shared phrase drops from two ("Take a challenge" and "Join a pool") to one.
- **SC-003**: For a valid phrase, the system returns the correct match type (or an
  unambiguous no-match/collision result) in at least 95% of attempts in usability
  testing, with no case where a valid phrase is wrongly reported as invalid.
- **SC-004**: 90% of test users can locate and act on any of their active wagers,
  challenges, and pools starting from My Wagers, without visiting a separate surface.
- **SC-005**: 90% of test users can find the recovery-codes feature under My Account →
  Security on the first attempt.
- **SC-006**: No existing shared link or previously saved recovery code stops working as a
  result of this change (zero regressions in link resolution and code access).
- **SC-007**: The unified lookup performs no slower for a single-type match than the
  prior dedicated flow, from the user's perspective.

## Assumptions

- **Creation stays separate.** Only the join/take side is unified. "Create a challenge"
  and "Create a pool" remain distinct actions because they collect different inputs; the
  request explicitly names only "join a pool" and "take a challenge" for combining.
- **My Wagers is the home for management.** "Manage active wagers and pools together"
  is satisfied by extending the existing My Wagers surface to include challenges and
  pools, rather than creating a new surface.
- **Collision is rare but possible.** The two phrase spaces overlap, so a collision is
  handled explicitly (present both) rather than assumed impossible.
- **Phrase-language behavior is inherited.** Pools remain multi-language and challenges
  remain English-only per their current implementations; the lookup adapts to this rather
  than changing either system's language support.
- **Underlying mechanics are untouched.** On-chain contracts, code/phrase derivation,
  entropy, encryption, and security properties for challenges and pools are unchanged;
  this feature is a frontend discovery/management/information-architecture change.
- **Existing protections are preserved.** Take/join authorization, stake/approval steps,
  and the recovery-codes unlock step keep their current security behavior.
- **Recovery-codes storage is unchanged.** Only the location of the recovery-codes
  feature moves (to Security); the underlying device-local storage and its contents are
  reused as-is.

## Out of Scope

- Merging the on-chain systems for pools and challenges, or changing their contracts,
  escrow, or resolution mechanics.
- Changing how phrases/codes are generated, their entropy, or their cryptographic
  derivation.
- Unifying the *creation* flows for challenges and pools.
- Adding new item types to My Wagers beyond wagers, open challenges, and pools.
- Migrating recovery-codes storage to a new backend or cross-device sync.
