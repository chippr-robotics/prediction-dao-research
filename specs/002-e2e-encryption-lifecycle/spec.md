# Feature Specification: Complete the Remaining E2E Stubs (Encryption, Privacy, Lifecycle)

**Feature Branch**: `002-e2e-encryption-lifecycle`
**Created**: 2026-06-05
**Status**: Draft
**Input**: "Review the remaining body-visible stubs (03-encryption-chain, 16-privacy-encryption, 23-lifecycle-e2e) so our testing will be complete end to end."

## Overview

Feature 001 replaced six placeholder E2E specs with real assertions. Three
placeholder specs remain in `frontend/cypress/e2e/full/` whose only assertion is
`cy.get('body').should('be.visible')` — they advertise coverage they do not
provide:

- **03-encryption-chain** — on-chain encryption-key registration (KeyRegistry).
- **16-privacy-encryption** — the full encrypted-wager lifecycle (create with
  private metadata, store/retrieve, decrypt as a participant, fail to decrypt as
  a non-participant).
- **23-lifecycle-e2e** — six connected end-to-end journeys spanning create →
  accept → resolve/timeout → claim/refund.

This feature replaces those stubs with real, passing assertions so the FairWins
E2E suite covers the platform end-to-end, and removes any journey that tests a
removed feature (the challenge/arbitrator dispute path, deleted in #621/#625).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Full lifecycle journeys are verified end-to-end (Priority: P1)

As a release manager, I need the connected user journeys — not just isolated
controls — to be proven against the real contracts so I can trust that a user can
go from creating a wager all the way to getting paid (or refunded) without a gap.

**Why this priority**: These journeys are the product's core promise and the
highest-confidence signal before users transact. They reuse capabilities already
verified in 001 (create, accept, oracle resolve, refund-timeout, frozen-claim),
so they are achievable now.

**Independent Test**: Run `23-lifecycle-e2e.cy.js` against a fresh local node and
confirm each journey drives the flow to its terminal state and asserts the
on-chain + user-visible outcome.

**Acceptance Scenarios**:

1. **Given** a funded creator and opponent, **When** a 1v1 stablecoin wager is
   created, accepted, manually resolved, and the winner claims, **Then** the
   winner receives the payout and the wager reaches Resolved/paid.
2. **Given** a Polymarket-linked wager that both parties accept, **When** the
   condition resolves to an outcome, **Then** auto-resolution settles the correct
   winner who can claim.
3. **Given** an open wager nobody accepts, **When** the accept deadline passes,
   **Then** the creator reclaims their stake (Refunded).
4. **Given** an accepted oracle wager that never resolves, **When** the resolve
   deadline passes, **Then** both parties are refunded.
5. **Given** a resolved wager whose winner is frozen, **When** the winner tries to
   claim, **Then** the claim is blocked until they are unfrozen.
6. **Given** the obsolete "challenged resolution with arbitrator" journey, **When**
   the suite is reviewed, **Then** that journey is removed (it tests a feature that
   no longer exists), not left as a passing stub.

### User Story 2 - Encryption key registration is verified on-chain (Priority: P2)

As a privacy-conscious user, I must be able to register my encryption public key
so others can create private wagers addressed to me; the test suite must prove
this registration works and is queryable.

**Why this priority**: Key registration is the prerequisite for every private
wager. It is an on-chain write/read with no external dependency, so it is
self-contained and unblocks User Story 3.

**Independent Test**: Run `03-encryption-chain.cy.js` and confirm a user can
register a key and that its registration status is correctly reported before and
after.

**Acceptance Scenarios**:

1. **Given** a connected wallet with no registered key, **When** the user
   registers their encryption key, **Then** the key is recorded on-chain and the
   UI reflects a registered status.
2. **Given** a wallet, **When** registration status is queried, **Then** it
   correctly reports "not registered" before and "registered" after.

### User Story 3 - The encrypted private-wager lifecycle is verified (Priority: P3)

As two counterparties who want a private bet, we need the encrypted metadata to be
created, stored, and retrievable — readable by the participants and unreadable by
anyone else — and the test suite must prove that round-trip and its failure modes.

**Why this priority**: Highest assurance value for the privacy promise, but the
most constrained: it depends on the off-chain metadata store and on
account-specific key material, which the test harness must provide (see
Assumptions). Sequenced last because it builds on User Story 2.

**Independent Test**: Run `16-privacy-encryption.cy.js` and confirm a private
wager round-trips: a participant decrypts the details, a non-participant cannot,
and a storage-fetch failure surfaces a graceful, retryable error.

**Acceptance Scenarios**:

1. **Given** an opponent with a registered key, **When** a creator makes a private
   wager and both complete the lifecycle, **Then** the encrypted details are
   stored and retrievable by the participants.
2. **Given** a private wager, **When** a non-participant opens it, **Then** the
   public fields (addresses, stakes, status) are visible but the private details
   are not ("Unable to decrypt").
3. **Given** a private wager, **When** a participant opens it, **Then** the private
   details decrypt and render.
4. **Given** the metadata store is unreachable, **When** a participant opens a
   private wager, **Then** a graceful error with a retry option is shown (no hang,
   no crash).

### Edge Cases

- A creator tries to make a private wager addressed to an opponent who has **not**
  registered a key → the UI blocks/guides them (no silent failure or hang).
- Wrong-wallet decryption attempt → "Unable to decrypt" rather than garbled output.
- Storage (IPFS) fetch timeout/failure → graceful error + retry, never an
  indefinite spinner.
- The removed arbitrator/challenge path must not reappear in any journey.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `23-lifecycle-e2e.cy.js` MUST implement the five valid journeys
  (1v1 manual, Polymarket auto-resolve, accept-timeout refund, oracle-timeout
  refund, frozen-winner-cannot-claim) with assertions on the terminal on-chain
  state and the user-visible outcome.
- **FR-002**: The obsolete "challenged resolution with arbitrator" journey MUST be
  removed (the challenge/dispute/arbitrator-reresolution feature no longer exists);
  no spec may reference it.
- **FR-003**: `03-encryption-chain.cy.js` MUST assert that a user can register an
  encryption key on-chain and that registration status is reported correctly
  before and after.
- **FR-004**: `16-privacy-encryption.cy.js` MUST assert the private-wager
  round-trip: encrypted metadata stored and retrievable, a participant can decrypt,
  a non-participant cannot (public fields still visible), and a storage-fetch
  failure surfaces a graceful retryable error.
- **FR-005**: The test harness MUST supply the external dependencies these flows
  require so the assertions are deterministic: an off-chain metadata store that
  accepts and returns encrypted blobs, and **per-account** wallet signatures (so
  derived keys — and therefore decryption rights — differ by account).
- **FR-006**: No completed spec's only assertion may be
  `cy.get('body').should('be.visible')`; every acceptance scenario gets at least
  one assertion that fails on a wrong outcome.
- **FR-007**: The completed `frontend/cypress/e2e/full/` suite MUST pass on a
  fresh local node, and a failing assertion MUST fail the run (no
  `continue-on-error`, no passing stubs).

### Key Entities

- **EncryptionKey**: a user's on-chain public key in KeyRegistry; states
  `registered | not-registered`; gates whether a private wager can be addressed to
  that user.
- **EncryptedMetadata**: the private wager payload stored off-chain (referenced by
  a URI on-chain); readable only with a participant's key.
- **LifecycleJourney**: a connected path through wager states (Open → Active →
  Resolved|Refunded) asserted end-to-end.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three target specs contain real assertions; zero
  body-visible-only specs remain in `frontend/cypress/e2e/full/`.
- **SC-002**: The full `e2e/full/*.cy.js` suite passes on a fresh local node
  (Hardhat + deployed contracts).
- **SC-003**: In the private-wager flow, a participant successfully decrypts the
  details and a non-participant provably cannot (distinct, account-specific keys).
- **SC-004**: No spec references the removed challenge/arbitrator dispute feature.
- **SC-005**: A reviewer can map every acceptance scenario above to at least one
  assertion in the corresponding spec.

## Assumptions

- **Harness, not product, supplies external infra**: consistent with the existing
  mock-wallet + real-local-chain model, the off-chain metadata store (IPFS) is
  mocked at the network boundary (store-and-return) and the wallet signing is
  mocked **per account** so encryption keys are deterministic yet account-distinct.
  No production code changes to encryption or storage.
- **Encryption-test depth = full round-trip** (decided 2026-06-05): encrypt →
  store → retrieve → decrypt is exercised through the UI with a mocked IPFS store
  (`cy.intercept` upload/fetch → in-memory blob) and per-account wallet signatures.
  A participant decrypts; a non-participant cannot. The crypto is verified through
  the browser, not only at the unit level.
- Lifecycle journeys reuse the helpers and patterns delivered in 001
  (createAndAcceptWager, createWagerViaUI, chainTx setup, advanceTime).
- Chainlink/UMA oracle paths remain out of scope for E2E (not wired on the local
  chain; covered by hardhat integration tests), per 001.
- This feature depends on the 001 foundation; it lands after or stacked on 001.

## Out of Scope

- Converting the suite to run against a public chain.
- The six specs already completed in 001, and the substantive non-stub specs.
- Re-introducing or testing the removed challenge/arbitrator dispute feature.
- Real (non-mocked) IPFS infrastructure in CI.
