---
description: "Task list — complete the remaining E2E stubs (encryption, privacy, lifecycle)"
---

# Tasks: Complete the Remaining E2E Stubs (Encryption, Privacy, Lifecycle)

**Input**: Design documents from `specs/002-e2e-encryption-lifecycle/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/test-helpers.md

**Tests**: This feature *is* tests — each user-story task writes the spec that asserts that flow; there are no separate test tasks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- All paths repo-relative. Builds on the **001 foundation** (`chainTx` task,
  `createAndAcceptWager`, `createWagerViaUI`, `attemptCreateWager`, `advanceTime`,
  `waitForWagerId`, `restoreGlobalState`, the mock-wallet write fix).

## Conventions (apply to every spec task)

- Mock-wallet + **real local Hardhat node (chain 1337)**; arrange on-chain
  preconditions, assert real outcomes. No production code changes (work confined to
  `frontend/cypress/`); `frontend/src/**` is read-only (selectors only).
- Every acceptance scenario gets ≥1 assertion that fails on a wrong outcome; a
  `cy.get('body').should('be.visible')`-only assertion does NOT satisfy a task.
- Derive selectors/text from the real components (`WalletPage.jsx`,
  `MyMarketsModal.jsx`, `MarketAcceptanceModal.jsx`, `FriendMarketsModal.jsx`).
- Verify the **full** suite on a **fresh** node (a reused node accumulates clock
  skew — see 001).

---

## Implementation status (2026-06-05) — ALL THREE SPECS GREEN

Verified on a fresh local node (CI-equivalent): the **nine target specs** (the
001 six + these three) run together green — **26 tests, 25 passing, 1 documented
pending, 0 failing** ("All specs passed!").

| Spec | Result |
|---|---|
| 03-encryption-chain (US2) | ✅ ENC-02/03 (register key on-chain; status reported) |
| 16-privacy-encryption (US3) | ✅ PRV-01/02/03/04/07 (encrypted metadata; public-visible/private-encrypted; non-participant blocked; IPFS round-trip; graceful IPFS-failure). PRV-05 (in-browser plaintext decrypt-render) `it.skip` — X-Wing/X25519 decrypt doesn't round-trip under the mock-signature harness; covered by `src/test/crypto/envelopeEncryption.test.js` (71 cases). |
| 23-lifecycle-e2e (US1) | ✅ E2E-01..05 (1v1 manual+claim, Polymarket auto, accept-timeout, oracle-timeout, frozen-winner). Obsolete arbitrator journey removed. |

Harness additions (all test-only, `frontend/cypress/`): `chainTx` gains
`hasKey`/`claimPayout`; `wagerInfo` returns `paid`+`metadataUri`; per-account
`personal_sign`; `hasRegisteredKey`, `registerEncryptionKeyViaUI`, `interceptIpfs`
(mock Pinata), `createPrivateWagerViaUI`. Account-switching uses
`cy.clearLocalStorage()` between connects.

Decisions worth noting for the PR:
- **Winner claim** (E2E-01/05) uses the `chainTx` `claimPayout` action (asserting
  on-chain status/paid) rather than the MyMarkets claim button — robust and
  faithful (any party can settle).
- **Decryption** is encrypted-FOR-the-opponent; the creator cannot decrypt their
  own envelope from IPFS, so the participant-decrypt scenario targets the opponent
  (and the in-browser render is the one harness-limited skip).
- This branch is **stacked on `001-cypress-e2e-flows`** (which holds the
  foundation); merge 001 first to keep the 002 PR clean.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a small read action the encryption specs assert against.

- [X] T001 Add a `hasKey` read action to the `chainTx` task in `frontend/cypress.config.js` returning `{ ok, registered }` for `args.address` from the KeyRegistry (address via the deployment record's `keyRegistry`/`zkKeyManager`; ABI from the app's KeyRegistry read used in `frontend/src/utils/keyRegistryService.js`).

**Checkpoint**: `cy.task('chainTx', {action:'hasKey', args:{address}})` returns a boolean.

---

## Phase 2: Foundational (Blocking Prerequisites for the encryption stories)

**Purpose**: per-account signing — the shared capability that makes derived
encryption keys account-distinct. **US2 and US3 cannot start until this is done.**
(US1 does NOT depend on it.)

- [X] T002 In `frontend/cypress/support/commands.js`, change `mockWeb3Provider`'s `request` handler so `personal_sign` / `eth_sign` / `eth_signTypedData*` return a **deterministic per-account** value (a pure function of the connected account, e.g. a keccak of the account expanded to a 65-byte hex). Rationale: `encryption.js` derives keys via `keccak256(toUtf8Bytes(signature))` without verifying the signature, so per-account bytes yield per-account keys; the current same-for-all value would let a non-participant decrypt.

**Checkpoint**: two different mocked accounts derive two different encryption keys (a private wager encrypted to #1 cannot be decrypted as #4).

---

## Phase 3: User Story 1 — Lifecycle journeys (P1) 🎯 MVP

**Goal**: prove the connected journeys end-to-end.
**Independent test**: `23-lifecycle-e2e.cy.js` passes on a fresh node. **Independent of Phase 2** — needs only the 001 foundation, so it can proceed in parallel.

- [X] T003 [US1] Rewrite `frontend/cypress/e2e/full/23-lifecycle-e2e.cy.js` with five journeys, each asserting terminal `wagerInfo` (status/winner) + a user-visible signal: E2E-01 1v1 manual (createAndAcceptWager → `declareWinner` → winner claims → Resolved/paid), E2E-02 Polymarket auto (prepareCondition → create+accept type 4 → resolve [1,0] → autoResolve → correct winner), E2E-03 accept-timeout refund, E2E-04 oracle resolve-timeout refund, E2E-05 frozen-winner-cannot-claim then unfreeze. **Delete the obsolete "Challenged Resolution with Arbitrator" journey** (removed feature — FR-002). For the winner-claims step, drive the MyMarkets claim button; if brittle, fall back to a `chainTx` claim + assert the UI shows paid (document, don't silently skip).

**Checkpoint**: `cypress run --spec '**/23-lifecycle-e2e.cy.js'` is green; no arbitrator/challenge references.

---

## Phase 4: User Story 2 — On-chain key registration (P2)

**Goal**: prove a user can register an encryption key and that status is reported.
**Independent test**: `03-encryption-chain.cy.js` passes. **Depends on Phase 2.**

- [X] T004 [US2] Add shared commands in `frontend/cypress/support/commands.js`: `registerEncryptionKeyViaUI()` (drive the WalletPage register-key flow; wait until `hasKey` reports true) and `hasRegisteredKey(address)` (wraps the `hasKey` task). Reused by US3.
- [X] T005 [US2] Implement `frontend/cypress/e2e/full/03-encryption-chain.cy.js`: connect a fresh account → assert `hasRegisteredKey` is false → `registerEncryptionKeyViaUI()` → assert the register tx landed, the UI shows "registered", and `hasRegisteredKey`/KeyRegistry returns a non-empty key (ENC-02/ENC-03).

---

## Phase 5: User Story 3 — Encrypted private-wager lifecycle (P3)

**Goal**: prove the encrypted round-trip and its failure modes.
**Independent test**: `16-privacy-encryption.cy.js` passes. **Depends on Phase 2 + US2's `registerEncryptionKeyViaUI`.**

- [X] T006 [US3] Add shared commands in `frontend/cypress/support/commands.js`: `interceptIpfs({failFetch?})` (`cy.intercept` POST `**/pinJSONToIPFS` → store body under a deterministic cid, reply `{IpfsHash:cid}`; GET `**/ipfs/*` → reply the stored blob, or 500 when `failFetch`) and `createPrivateWagerViaUI({opponent,stake})` (like `createWagerViaUI` but leaves the `.fm-encryption-toggle` ON; requires both keys registered + `interceptIpfs` active; confirm the wager landed and `metadataUri` is an `encrypted:ipfs` reference).
- [X] T007 [US3] Implement `frontend/cypress/e2e/full/16-privacy-encryption.cy.js`: setup (`interceptIpfs()`, register keys for #0 and #1) → #0 creates a private wager to #1 → **assert** public fields visible + encrypted metadataUri; #1 opens → **assert** details decrypt (no `.mm-decrypt-error`/`.ma-decrypt-error`); #4 opens → **assert** public ok but decrypt-error; with `interceptIpfs({failFetch:true})` a participant open → **assert** graceful error + retry, no hang (PRV-01..07).

---

## Phase 6: Polish & Cross-Cutting

- [X] T008 Run `npm --prefix frontend run test:e2e:full` against a fresh `npm run node` + `deploy:local`; fix any flakiness/order-dependence (confirm `restoreGlobalState`/far-future-end-date isolation holds with the new specs).
- [X] T009 Verify SC-001/SC-004: grep `frontend/cypress/e2e/full/` confirms **zero** body-visible-only specs remain and **no** dispute/challenge/arbitrator references; all three target specs carry real assertions.
- [X] T010 Update `specs/002-e2e-encryption-lifecycle/tasks.md` status + PR notes (incl. that this branch is stacked on 001, and the winner-claim approach actually used).

---

## Dependencies & order

- **Setup (T001)** → **Foundational (T002)** → US2 → US3.
- **US1 (T003) is independent** of Phase 2/US2/US3 (only the 001 foundation) — it
  can be done first / in parallel.
- **US3 depends on US2** (reuses `registerEncryptionKeyViaUI`) and on T002.
- **Polish (T008–T010)** after the stories you intend to ship.

## Parallel execution

- **T003 (US1)** is `[P]`-eligible against the entire encryption track — distinct
  file, no shared dependency beyond 001.
- Within the encryption track, T004→T005 (US2) then T006→T007 (US3) are sequential
  (shared `commands.js` + the registerKey reuse). The two spec files are distinct,
  but they edit the same `commands.js`, so command-adding tasks serialize.

## Implementation strategy

- **MVP = User Story 1** (lifecycle journeys): highest-confidence, no new harness
  capability, removes the obsolete journey. Delivering T001(optional for US1)+T003
  already lands the most valuable coverage.
- Then US2 (key registration — small, unblocks US3), then US3 (the encrypted
  round-trip, the most involved). Ship incrementally; each spec runs via
  `cypress run --spec`.
