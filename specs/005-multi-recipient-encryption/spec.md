# Feature Specification: Multi-Recipient Wager Encryption (Participants + Arbitrator)

**Feature Branch**: `005-multi-recipient-encryption`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "we need to chang the way we are storinging the encrypted wager to enable the two parties and an observer to each decode the wager. we also need to ensure when a 3rd party arbitritor is assigned the are able to see the wager so they can resolve it when the time comes. my proposal is we have a json object with the creator encrypting the message for the other parties and saving them in a file in ipfs"

## Overview

Today a private wager's terms are encrypted so that exactly **two** people can read them: the creator and the opponent. The encrypted bundle is stored off-chain (on IPFS) and the wager only references it on-chain. This locks out the **designated arbitrator** (the neutral third-party resolver): they can neither read the encrypted terms nor even discover which wagers name them. Because of that, third-party arbitration was disabled in the app — a wager whose fair resolution depends on a neutral human currently has no working path.

This feature changes how an encrypted wager is stored so that **each intended reader gets their own decryptable copy of the terms**: the two participants and, when assigned, the arbitrator. The creator prepares the encrypted bundle so every named reader — and only those readers — can open it; the arbitrator can both **find** and **read** the wagers they are responsible for, so they can resolve them when the time comes.

> Note on the "observer" in the original request: the third reader is realized as the **arbitrator**. There is no separate read-only observer role in this version — the party who needs to read a wager they did not create or join is the neutral arbitrator, who reads *and* resolves.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Arbitrator can find, read, and resolve the wager they were assigned (Priority: P1)

A creator makes a private wager and assigns a neutral third party as the arbitrator. The arbitrator can later find that wager among the ones they oversee, open it to read the agreed terms, and — when the event is decided — resolve it in favor of the correct party. Neither participant can stop the arbitrator from reading the terms, and no one outside the named readers can.

**Why this priority**: This is the headline gap and the reason the change is needed. Third-party arbitration is currently unusable because the arbitrator can neither discover nor decrypt the wager. Restoring a trustworthy neutral-resolver path end-to-end is the core value.

**Independent Test**: Create a private wager naming an arbitrator, then, as the arbitrator, locate it in "wagers I arbitrate," open and read the plaintext terms, and resolve it — verifying a third party who is not the named arbitrator can do none of these.

**Acceptance Scenarios**:

1. **Given** a private wager that names an arbitrator, **When** the arbitrator opens it, **Then** they can read the same plaintext terms the participants see.
2. **Given** a private wager that names an arbitrator, **When** the arbitrator looks for the wagers they are responsible for, **Then** that wager appears in their list so they can act on it (without already knowing its identifier).
3. **Given** the arbitrator has read the terms and the outcome is known, **When** they resolve the wager, **Then** resolution succeeds for the correct party (the third-party resolution path works end-to-end, including being offered when creating a wager).
4. **Given** a person who is neither participant nor the named arbitrator, **When** they try to read the wager, **Then** the terms remain unreadable to them.

---

### User Story 2 - Both participants can still read their own wager (Priority: P1)

The creator and the opponent can each open and read the private terms of a wager they are part of, exactly as today, with no regression — whether or not an arbitrator was also added as a reader.

**Why this priority**: The existing two-party privacy guarantee must not break while adding the arbitrator as a reader. It is the baseline the whole product already depends on.

**Independent Test**: Create a private wager both with and without an arbitrator, and confirm both the creator and the opponent can read the terms, and that adding the arbitrator does not change what the participants see.

**Acceptance Scenarios**:

1. **Given** a private wager, **When** the creator opens it, **Then** they can read the terms.
2. **Given** a private wager the opponent has accepted, **When** the opponent opens it, **Then** they can read the terms.
3. **Given** a wager that additionally names an arbitrator, **When** either participant opens it, **Then** their experience and the readable terms are unchanged from a two-party wager.
4. **Given** a private wager with **no** arbitrator, **When** anyone who is not a participant tries to read it, **Then** the terms remain unreadable (two-party privacy preserved).

---

### Edge Cases

- **A named reader has no published encryption key**: A wager can only be encrypted for a reader who has a published encryption key. If the assigned arbitrator has never registered one, the system MUST block creating that private wager and tell the creator which reader is missing a key — rather than silently producing a wager the arbitrator can never read.
- **Arbitrator assigned/changed after creation**: Readers are decided when the encrypted bundle is prepared (at creation). Changing the arbitrator later would require re-preparing the bundle for the new reader; for this version, the arbitrator (and thus the reader set) is fixed at creation.
- **Tampering / wrong bundle**: A reader must be able to trust that the terms they decrypt are the ones the creator committed to on-chain (the off-chain bundle matches the on-chain reference), so a substituted or corrupted bundle is detectable rather than shown as valid.
- **Bundle unavailable off-chain**: If the off-chain encrypted bundle cannot be retrieved, readers see a clear "terms unavailable" state rather than a silent failure; on-chain funds and resolution are unaffected.
- **Public (non-private) wagers**: Plaintext wagers are unaffected — they remain readable by everyone and gain no encryption overhead; an arbitrator on a public wager simply reads it like anyone else.
- **Self-arbitration**: The arbitrator must be a neutral third party (not the creator or opponent); the existing rule that the arbitrator differs from both participants continues to hold.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A private wager's terms MUST be storable such that each designated reader — the creator, the opponent, and (when assigned) the arbitrator — can independently decrypt and read the same terms.
- **FR-002**: Only designated readers MUST be able to decrypt a private wager's terms; any party not designated as a reader MUST NOT be able to read them.
- **FR-003**: The two participants (creator and opponent) MUST retain the ability to read their wager with no change in experience or readability versus a two-party wager (no regression), whether or not an arbitrator is also a reader.
- **FR-004**: When an arbitrator is assigned to a private wager, that arbitrator MUST be able to decrypt and read the terms.
- **FR-005**: An assigned arbitrator MUST be able to discover the wagers for which they are the arbitrator (find them in order to act), not only the wagers they created or joined.
- **FR-006**: With arbitrator read access and discovery in place, the third-party (arbitrator) resolution path MUST be usable end-to-end again, including re-enabling the option to create a wager that uses third-party resolution.
- **FR-007**: Creating a private wager that names an arbitrator MUST be blocked unless every named reader (the arbitrator, alongside the participants) has a published encryption key; the creator MUST be told which named reader is missing a key.
- **FR-008**: A reader MUST be able to verify that the terms they decrypted correspond to what the wager committed to on-chain (the off-chain encrypted bundle is bound to the on-chain wager reference and tampering is detectable).
- **FR-009**: The set of readers and their per-reader encrypted copies MUST be established by the creator at the time the wager's private terms are prepared, and stored together as a single retrievable bundle referenced by the wager.
- **FR-010**: If the off-chain encrypted bundle cannot be retrieved, the system MUST present a clear "terms unavailable" state to readers and MUST NOT block on-chain actions (funds, resolution) that do not require the plaintext.
- **FR-011**: Adding the arbitrator as a reader MUST NOT expose the terms to anyone who is not a designated reader, and MUST NOT weaken the confidentiality of the participants' data.
- **FR-012**: The privacy state of a wager MUST be presented honestly in the app, so participants understand, when an arbitrator is assigned, that the arbitrator can read the terms.

### Key Entities *(include if feature involves data)*

- **Wager**: The on-chain agreement. Names the creator, opponent, and (optionally) the arbitrator, and references the off-chain terms. This feature ensures the arbitrator is a reader and is discoverable as the arbitrator.
- **Reader**: An address entitled to decrypt a wager's private terms — creator, opponent, and (when assigned) arbitrator. Each reader has their own decryptable copy within the bundle.
- **Encrypted Terms Bundle**: The single off-chain object holding the encrypted wager terms plus a per-reader means for each designated reader to decrypt them. Referenced by, and verifiable against, the on-chain wager.
- **Encryption Key Directory**: The existing registry mapping an address to its published encryption key, used to prepare a copy a given reader can open. A reader without a published key cannot be given a readable copy (and blocks creation per FR-007).
- **Arbitrator**: The neutral third party who is both a reader and the resolver; must be able to find and read the wagers they arbitrate so they can resolve them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of private wagers that name an arbitrator, the arbitrator can read the same plaintext terms the participants read.
- **SC-002**: For 100% of private wagers that name an arbitrator, the arbitrator can locate that wager among the wagers they arbitrate without already knowing its identifier.
- **SC-003**: An assigned arbitrator can complete a third-party resolution end-to-end (discover → read → resolve) with no step blocked by lack of visibility, and creators can again choose third-party resolution when creating a wager.
- **SC-004**: 100% of attempts to read a private wager's terms by an address that is not a designated reader fail to reveal the terms.
- **SC-005**: Both participants can read 100% of their private wagers, and adding an arbitrator changes none of what the participants can read (no regression vs. two-party wagers).
- **SC-006**: 100% of decrypted terms are verifiable as matching the on-chain wager reference (a substituted or corrupted bundle is detected, not shown as valid).
- **SC-007**: 100% of attempts to create a private third-party wager naming an arbitrator who has no published encryption key are blocked with a clear message — i.e. 0% of created private wagers have a named arbitrator who can never read the terms.

## Assumptions

- **Builds on the existing encryption + key registry + off-chain storage** established in `specs/002-e2e-encryption-lifecycle`. The per-reader bundle and the address→key directory already exist conceptually; this feature extends *which* readers are included (adds the arbitrator) plus the discovery and creation flows around them, rather than inventing a new cryptosystem. (Per the user's proposal: a single JSON bundle in which the creator includes a separately-encrypted copy for each reader, saved as one file on IPFS.)
- **"Observer" maps to the arbitrator (decided).** There is no separate read-only observer role in this version; the third reader is the neutral arbitrator, who both reads and resolves. A distinct read-only observer could be a future feature.
- **Arbitrator discovery is in scope (decided).** This feature makes arbitrators able to find the wagers they arbitrate and re-enables creating third-party-resolved wagers, so arbitration works end-to-end.
- **Missing key blocks creation (decided).** A reader must have a published encryption key to receive a readable copy; if the named arbitrator lacks one, creating the private wager is blocked with a clear message (no late-binding in v1).
- **Readers are fixed when the terms are prepared**, i.e. at creation; changing the arbitrator later would require re-preparing the bundle and is out of scope for v1.
- **No new fund or resolution mechanics.** This feature changes *who can read* a wager and how the encrypted terms are stored and discovered; it does not change stakes, payouts, or the rules of resolution beyond re-enabling the already-defined third-party path.
- **Networks**: Applies to the live deployments (Polygon mainnet, Amoy testnet); legacy read-only networks are out of scope.
