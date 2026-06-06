---
description: "Task list for Multi-Recipient Wager Encryption (Participants + Arbitrator)"
---

# Tasks: Multi-Recipient Wager Encryption (Participants + Arbitrator)

**Input**: Design documents from `/specs/005-multi-recipient-encryption/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: INCLUDED and REQUIRED. Constitution Principle II (Test-First, NON-NEGOTIABLE) covers resolution/access/privacy paths. Write each story's tests first and confirm they fail before implementing.

**Branch**: `005-multi-recipient-encryption`

**⚠️ Cross-feature dependency**: the single on-chain change (index the arbitrator) composes into the in-flight **004 draw-resolution v3** `WagerRegistry` redeploy (PR #633). The frontend slice (recipients, key-gate, ThirdParty UI) is buildable/testable independently; live arbitrator *discovery* needs the deployed index.

**Organization**: Tasks grouped by user story (from spec.md) for independent implementation/testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no incomplete-task dependency.
- **[Story]**: US1 / US2 (Setup, Foundational, Polish carry no story label).
- Exact file paths included.

## Path Conventions

Web3 monorepo (per plan.md): Solidity in `contracts/`, Hardhat tests in `test/`, React app in `frontend/src/`. Subgraph NOT involved (it indexes the Factory, not `WagerRegistry`). Paths are repo-root-relative.

---

## Phase 1: Setup

**Purpose**: Establish baselines and record the 004 v3 coordination before changing the create/encryption paths.

- [ ] T001 Confirm the contract baseline is green (`npm run compile` && `npm test`) and add a one-line comment at the `_userWagerIds` writes in `contracts/wagers/WagerRegistry.sol` noting that the arbitrator-index addition is authored on the `004-draw-resolution` branch and ships in the single 004 **v3** redeploy (one CREATE2 address) — not as a separate 005 deploy (regression guard for SC-005/no-regression).
- [ ] T002 [P] Confirm the frontend baseline is green: `npm run test:frontend`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared encryption-creation change both stories depend on — assembling the reader set (adding the arbitrator when assigned) and gating on key registration.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [ ] T003 In the private-wager encryption/creation builder (`frontend/src/hooks/useEncryption.js`, where the `recipients` for `encryptEnvelope` are assembled), include the assigned arbitrator address as a third recipient when a non-zero arbitrator is set; look up its key via `lookupPublicKey(arbitrator)`. Participant-only wagers continue to assemble exactly two recipients (no behavior change).
- [ ] T004 In the same create-encryption path, add the key-gate: before building the envelope for a private wager that names an arbitrator, verify `hasRegisteredKey(arbitrator, provider)`; if missing, abort with a clear, surfaced error that names the arbitrator (no IPFS upload, no `createWager`). Reuse `frontend/src/utils/keyRegistryService.js` helpers.

**Checkpoint**: The reader set includes the arbitrator (when assigned) and creation is gated on the arbitrator's key. US1 and US2 can proceed.

---

## Phase 3: User Story 1 - Arbitrator can find, read, and resolve the wager they were assigned (Priority: P1) 🎯 MVP

**Goal**: An assigned arbitrator can discover their wagers, decrypt and read the terms, and resolve them; third-party-resolved wagers can be created again.

**Independent Test**: Create a private ThirdParty wager naming an arbitrator; as the arbitrator, find it in "Arbitrating", read the plaintext terms, and resolve it — verifying a non-arbitrator third party can do none of these. (Maps SC-001, SC-002, SC-003, SC-004, SC-007.)

### Tests for User Story 1 (write first, ensure they FAIL) ⚠️

- [ ] T005 [P] [US1] Create `test/WagerRegistry.arbitrator-index.test.js`: a `ThirdParty` wager naming arbitrator `A` appears in `getUserWagerIds(A,…)` and `getUserWagerCount(A)` increments; a non-`ThirdParty` wager does NOT write an arbitrator index; creator/opponent indexes are unchanged; `declareWinner` by the arbitrator still resolves. **004 coordination assertion** (run on the combined 004 branch): a draw via `declareDraw` reaching `Status.Draw` does not corrupt the arbitrator's `_userWagerIds` entry, and 004's draw tests stay green on the same artifact.
- [ ] T006 [P] [US1] Create `frontend/src/test/wagerArbitratorEncryption.test.jsx`: a private ThirdParty wager's envelope has a `keys[]` entry for the arbitrator (3 recipients), `canDecrypt(envelope, arbitrator) === true`, and `canDecrypt(envelope, stranger) === false`; the single `content` ciphertext shape is unchanged.
- [ ] T007 [US1] In `frontend/src/test/wagerArbitratorEncryption.test.jsx`, add a key-gate test: creating a private ThirdParty wager whose arbitrator has no registered key is blocked with a clear message (no upload/createWager); once the arbitrator has a key, creation proceeds.
- [ ] T008 [P] [US1] In `frontend/src/test/FriendMarketsModal.test.jsx`, add tests: the create form offers ThirdParty resolution and reveals an arbitrator-address input; invalid / self / opponent addresses are rejected inline; when an arbitrator is set on a private wager the UI discloses the arbitrator can read the terms.
- [ ] T009 [P] [US1] In `frontend/src/test/MyMarketsModal.test.jsx`, add tests: an "Arbitrating" view lists wagers where the connected wallet is the arbitrator (mock `getUserWagers`) and offers the resolve action; it is empty for a wallet that arbitrates nothing.
- [ ] T009a [US1] In `frontend/src/test/MyMarketsModal.test.jsx` (same file as T009 — sequential), add FR-010 graceful-degradation assertions: (1) a selected encrypted market with `decryptionError` set and no `decryptedMetadata` renders a "terms unavailable" state (text matching /terms unavailable/i) with a Try-again/decrypt control — not a silent stuck "Decrypt Wager Details" button; (2) a market with `ipfsEnvelopeError` set renders the same state; (3) in the Arbitrating view, an arbitrated encrypted wager whose decryption fails STILL renders the resolve action (assert the resolve control is present/enabled alongside the terms-unavailable state) — proving on-chain resolution is not blocked.

### Implementation for User Story 1

- [ ] T010 [US1] **On the `004-draw-resolution` branch (PR #633) — NOT a separate 005 contract branch** — in `contracts/wagers/WagerRegistry.sol` `createWager`, immediately after the existing creator/opponent index writes (`_userWagerIds[msg.sender].add(wagerId); _userWagerIds[opponent].add(wagerId);`), add `if (w.arbitrator != address(0)) { _userWagerIds[w.arbitrator].add(wagerId); }`; `npm run compile`. This composes into the single 004 **v3** bytecode / CREATE2 address (verified: 004's diff touches only `declareDraw`/`revokeDraw`/`_settleDraw`/`drawConsent` — `createWager` is byte-identical to `main`, so zero conflict). Do NOT deploy 005's contract change as a separate registry.
- [ ] T011 [US1] In `frontend/src/components/fairwins/FriendMarketsModal.jsx`, add `ResolutionType.ThirdParty` back to `PARTICIPANT_RESOLUTION_TYPES` (currently omitted ~:33-37), add a validated arbitrator-address input (valid address; not creator; not opponent), wire the Foundational key-gate, and render the honest "arbitrator can read the terms" disclosure.
- [ ] T012 [US1] In `frontend/src/hooks/useFriendMarketCreation.js`, pass the real arbitrator address to `createWager` for ThirdParty wagers (replace the hardcoded `ethers.ZeroAddress` ~:241); keep `ZeroAddress` for all other resolution types.
- [ ] T013 [US1] In `frontend/src/components/fairwins/MyMarketsModal.jsx`, add an "Arbitrating" tab/filter listing wagers where `wager.arbitrator?.toLowerCase() === account` (from `getUserWagers(account)`), rendering the decrypted terms and the arbitrator's resolve action (and, post-004, draw action) — read-and-resolve only (no accept/cancel). Ensure the FR-010 terms-unavailable state from T013a is rendered: a decryption/fetch failure MUST NOT hide the resolve/draw action (it needs no plaintext — `declareWinner(wagerId, winner)`).
- [ ] T013a [US1] In `frontend/src/components/fairwins/MyMarketsModal.jsx` `MarketDetailView` (~1390-1406), render FR-010 graceful degradation: when an encrypted wager cannot be decrypted or its IPFS envelope is unavailable (`market.isEncrypted && !market.decryptedMetadata && (market.decryptionError || market.ipfsEnvelopeError)`), show a clear "Terms unavailable" state in a `mm-decrypt-error` div (CSS already exists, `MyMarketsModal.css:1265`) with the specific reason (`market.ipfsEnvelopeError ? 'Encrypted terms could not be retrieved' : market.decryptionError`) and a "Try again" button calling `onDecrypt(market.id)` — mirroring the existing `MarketAcceptanceModal.jsx:540-552` pattern. The errors are already plumbed onto the market (`useEncryption.js` sets `decryptionError`; `useIpfs.js` sets `ipfsEnvelopeError`), so no new state is needed; confirm `handleDecryptMarket` (~80-87) does not clear them before re-render. The resolve/withdraw/refund action row MUST remain visible and enabled in this state (gated by `canResolve()`, not by decryption). Shared component → applies to both the participant detail view and the new Arbitrating view.
- [ ] T014 [US1] Run `npx hardhat test test/WagerRegistry.arbitrator-index.test.js` and `npm run test:frontend` for the US1 specs (incl. T009a); iterate to green; confirm no regression with `npm test`.

**Checkpoint**: Arbitrator read + discovery + resolution work end-to-end; ThirdParty wagers can be created again. MVP.

---

## Phase 4: User Story 2 - Both participants can still read their own wager (Priority: P1)

**Goal**: Creator and opponent read their wager exactly as before, with or without an arbitrator added as a reader (no regression).

**Independent Test**: Create private wagers with and without an arbitrator; confirm both participants can read, and that adding the arbitrator changes nothing the participants see. (Maps SC-005, SC-006.)

### Tests for User Story 2 (write first, ensure they FAIL/serve as guardrail) ⚠️

- [ ] T015 [US2] In `frontend/src/test/wagerArbitratorEncryption.test.jsx`, add no-regression tests: a participant-only private wager has exactly 2 `keys[]` entries; both creator and opponent `canDecrypt`; adding an arbitrator leaves the creator/opponent entries unchanged and the same `content` ciphertext; a non-reader cannot decrypt either way; the decrypted terms verify against the on-chain `metadataHash` (tamper-evident).

### Implementation for User Story 2

- [ ] T016 [US2] Run `npm run test:frontend`; confirm the participant read path and existing encryption tests are unchanged (no regression introduced by the Foundational recipient/key-gate change).

**Checkpoint**: Two-party privacy and readability preserved alongside the new arbitrator reader.

---

## Phase 5: Polish, Security & Deployment (Cross-Cutting)

**Purpose**: Security gates, accessibility, docs, and the gated deploy (coordinated with 004 v3).

- [ ] T017 [P] Run Slither (`slither .`) on the modified `createWager`; 0 new high/critical (Constitution I); document any accepted finding.
- [ ] T018 [P] Run Medusa with an invariant that indexing the arbitrator changes no fund or resolution behavior (only adds a discovery entry); document results.
- [ ] T019 Smart-contract security-agent review (`.github/agents/smart-contract-security.agent.md`) of the `createWager` diff, focused on the additive index write and the absence of new fund/authority surface.
- [ ] T020 [P] Frontend accessibility audit (axe/Lighthouse) on the create form (arbitrator input + disclosure), the "Arbitrating" view, and the FR-010 "terms unavailable" state (T013a) → WCAG 2.1 AA: labeled input, announced validation errors, text disclosure, and the terms-unavailable message announced (`role="alert"`/`aria-live`) with a labeled "Try again" button — on both the participant detail view and the Arbitrating view.
- [ ] T021 [P] Update `docs/fairwins-functional-testing-checklist.md`: replace the REMOVED CRE-06 (create ThirdParty) and RES-05 (arbitrator resolves) entries with active scenarios (create ThirdParty with arbitrator key-gate, arbitrator discovers/reads/resolves), and add arbitrator read + missing-key-block cases.
- [ ] T022 Run ESLint on the changed frontend files (`FriendMarketsModal.jsx`, `MyMarketsModal.jsx`, `useEncryption.js`, `useFriendMarketCreation.js`, new test files); zero errors (Constitution V).
- [ ] T023 Run the full suites green: `npm test` and `npm run test:frontend`; run the `quickstart.md` validation matrix (§1–§5) and confirm SC-001…SC-007.
- [ ] T024 ⚠️ GATED (coordinated with 004 v3, explicit go-ahead). Clear three I1 preconditions first: (a) 005's `createWager` arbitrator-index line is committed on the **004 branch** (T010); (b) PR #633's stale `CONFLICTING` flag is cleared via a no-op sync/rebase onto `origin/main` (verified clean: `004..main` = 0 commits, merge-base == main HEAD `2cc844f`, so it fast-forwards); (c) CI on #633 actually runs and is green — `statusCheckRollup` is currently EMPTY, so the Slither/Medusa/test gates (T017–T019, T023) have not executed. Then bump the CREATE2 salt to `WagerRegistry-userindex-draw`, **reuse the existing Polymarket adapter** (no adapter redeploy / no `setPolymarketAdapter`), deploy ONE v3 to **Amoy**, record `deployments/<network>-chain<id>-v3.json`, `npm run sync:frontend-contracts:amoy`, and verify arbitrator discovery + read + resolve end-to-end (quickstart §6).
- [ ] T025 ⚠️ GATED (mainnet, explicit go-ahead + security sign-off; registry paused): the mainnet v3 cutover includes this line; verify `getUserWagers(arbitrator)` returns arbitrated wagers and a test ThirdParty wager resolves before announcing.

---

## Dependencies & Execution Order

> **COMPOSITION GUARD (I1):** 004 (PR #633) and 005's one `createWager` line ship as **ONE v3 `WagerRegistry`, at ONE CREATE2 address, via ONE PR**. State as of analysis: #633 is **OPEN/unmerged** (head `004-draw-resolution`, 2 commits ahead of `main`); 005 has **no committed contract work**; 004's `createWager` is byte-identical to `main` so the 005 line composes with **zero conflict**. Author T010 on the 004 branch, keep #633 as the single combined v3 PR, clear its stale `CONFLICTING` flag with a no-op sync, ensure CI runs (currently empty) and is green, merge, then one gated v3 deploy (T024→T025). **Never** cut a separate 005 contract branch off `main`; **never** deploy two registries.

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; **BLOCKS US1 and US2** (both exercise the shared recipient-assembly + key-gate change in `useEncryption.js`).
- **US1 (Phase 3)**: depends on Foundational. The MVP. Contains the one contract line (T010) and the index test (T005).
- **US2 (Phase 4)**: depends on Foundational. Independent of US1 (guardrail/regression); shares the encryption test file with US1's T006/T007 (so its test task is sequential, not `[P]`).
- **Polish/Deploy (Phase 5)**: depends on US1 (+US2). T024 (Amoy) precedes T025 (mainnet); both hard-gated and coordinated with PR #633.

### Within Each User Story

- Tests first, confirm failing, then implementation (Constitution II).
- T003/T004 (same file, Foundational) are sequential. T010 (contract) is independent of the frontend impl.

### Parallel Opportunities

- Setup: T002 alongside T001.
- US1 tests: T005 (`test/…index.test.js`), T006 (`wagerArbitratorEncryption.test.jsx`), T008 (`FriendMarketsModal.test.jsx`), T009 (`MyMarketsModal.test.jsx`) are `[P]` — different files. T007 shares T006's file (sequential).
- US1 impl: T010 (contract) ∥ T011 (FriendMarketsModal) ∥ T013 (MyMarketsModal) are different files; T012 (useFriendMarketCreation) is its own file. All four can proceed in parallel after the tests exist; only T011 and T012 are coupled by the create flow (validate together).
- Polish: T017/T018/T020/T021 are `[P]` (different tools/files); deploy tasks T024→T025 strictly ordered.

---

## Parallel Example: genuinely parallel work (different files)

```bash
# US1 tests — distinct files:
Task: "Arbitrator index test in test/WagerRegistry.arbitrator-index.test.js"        # T005 [P]
Task: "Recipients-include-arbitrator in frontend/src/test/wagerArbitratorEncryption.test.jsx"  # T006 [P]
Task: "ThirdParty create UI in frontend/src/test/FriendMarketsModal.test.jsx"        # T008 [P]
Task: "Arbitrating view in frontend/src/test/MyMarketsModal.test.jsx"                # T009 [P]
# (T007 shares T006's file — run it after T006, not in parallel.)
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational (shared recipient + key-gate) → 3. Phase 3 US1 → **STOP & VALIDATE**: arbitrator finds, reads, and resolves a private ThirdParty wager; non-readers can't read. Shippable once US2 regression (Phase 4) confirms no participant regression.

### Incremental Delivery

1. Setup + Foundational → reader-set + key-gate ready.
2. + US1 → arbitrator end-to-end (MVP) → validate.
3. + US2 → confirm two-party privacy unaffected → validate.
4. + Polish/Security → Slither/Medusa/a11y/docs.
5. Amoy (folded into 004 v3) → **gated** mainnet cutover.

### Notes

- [P] = different files, no incomplete-task dependency. Multiple tasks editing the SAME file are NOT [P] (write them sequentially).
- The envelope/IPFS format does NOT change — only the recipient set grows (add the arbitrator). `canDecrypt` already handles N readers.
- 005's contract line adds NO ABI surface (no new function/event), so no standalone ABI regen; it rides the 004 v3 artifact.
- Commit on this branch; never push to `main` — PR after CI. The on-chain slice merges/coordinates with PR #633 before any v3 deploy.
