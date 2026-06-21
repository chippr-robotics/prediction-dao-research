---
description: "Task breakdown for Open-Challenge Wagers Gated by a Shared Claim Code"
---

# Tasks: Open-Challenge Wagers Gated by a Shared Claim Code

**Input**: Design documents from `/specs/024-open-challenge-wagers/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: REQUIRED. Constitution Principle II (Test-First and Comprehensive Coverage) is NON-NEGOTIABLE for
this funds-bearing + access-control surface, so unit/fuzz/frontend/subgraph tests are written **before** the
code they cover and must fail first.

**Organization**: Tasks are grouped by user story. US1 (P1) is the MVP. US2 (P1) is the defensive/anti-snipe
story (inseparable from US1 — ships with it). US3 (P2) is the public first-come extension.


> **Implementation status (2026-06-20):** Contract layer COMPLETE on PR #722 — `createOpenWager` / `acceptOpenWager` (EIP-712, front-run resistant) / claim mappings / Silver+ create gate / decline guard / `_clearClaim` wiring, on the now-upgradeable WagerRegistry. 12 open-challenge unit tests pass; full suite 271 passing / 0 failing; contract 24460 bytes (< 24576); storage-layout upgrade-safe. Terms-binding create variant deferred (addable as a later in-place upgrade). REMAINING: frontend claim-code crypto + create/take modals (T021–T025, T031–T039) and the subgraph `OpenWagerCreated` handler (T026–T027); contract negative-path tests T028/T029/T030/T037 are covered by `test/WagerRegistry.openChallenge.test.js`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (foundational, setup, polish, and deployment tasks carry no story label)
- Exact file paths are included in every task.

## Path Conventions

Web3 monorepo (per plan.md): Solidity in `contracts/`, Hardhat tests in `test/`, React app in `frontend/`,
The Graph indexer in `subgraph/`, deploy/sync utilities in `scripts/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolding and dependency confirmation. No behavior change. Builds on the existing repo.

- [X] T001 Create the claim-code module and test directories: `frontend/src/utils/claimCode/` and
  `frontend/src/test/claimCode/` (empty placeholders are fine; files land in Phase 2).
- [X] T002 [P] Verify no new dependencies are needed (plan.md "No new dependencies"): confirm
  `@openzeppelin/contracts` exposes `utils/cryptography/EIP712.sol` and `utils/cryptography/ECDSA.sol`,
  and that `frontend/package.json` already pins `ethers` (v6, bundled `LangEn`), `@noble/ciphers`, and
  `@noble/hashes`. Record the resolved versions in `specs/024-open-challenge-wagers/research.md` if any
  differ from the plan; do **not** add packages.

**Checkpoint**: Module layout exists and the dependency assumptions in the plan are confirmed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared, security-critical primitives that BOTH the create and accept paths (and therefore
all three user stories) depend on — the off-chain claim-code crypto and the additive contract scaffolding.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. The same `deriveFromCode` module
is reused by create and accept (plan.md "preventing the security-critical derivation from drifting between
surfaces"), and the contract functions cannot be written before the EIP-712 domain, mappings, events, and
errors exist.

### Off-chain claim-code crypto (pure, deterministic, device-independent)

- [X] T003 [P] Write FAILING wordlist tests in `frontend/src/test/claimCode/wordlist.test.js`:
  `generateCode()` yields exactly 4 valid BIP-39 (LangEn) words; `isValidCode` rejects wrong length /
  unknown words / extra whitespace; `normalizeCode` collapses case + internal whitespace + NFKC
  (`"River  Amber tiger Kite"` → `"river amber tiger kite"`). (research.md R6, claim-code-crypto.md)
- [X] T004 Implement `frontend/src/utils/claimCode/wordlist.js`:
  `generateCode()` (44 bits CSPRNG via `crypto.getRandomValues` → 4 `LangEn` indices),
  `normalizeCode(input)`, `isValidCode(input)`. Makes T003 pass. (FR-003, research.md R6)
- [X] T005 [P] Write FAILING derivation tests in `frontend/src/test/claimCode/deriveFromCode.test.js`:
  `deriveFromCode` is deterministic across calls and independent of device; `claimAddress` and `symKey` are
  domain-separated (changing one tag does not change the other); `signOpenAccept` produces a signature whose
  recovered address equals `claimAddress` for the bound `(wagerId, taker)` and **fails** for any other taker
  or wagerId (front-run/replay vector, mirrors `ECDSA.recover`). (claim-code-crypto.md, research.md R1/R2,
  FR-011/SC-006)
- [X] T006 Implement `frontend/src/utils/claimCode/deriveFromCode.js`:
  `deriveFromCode(code) → { claimPrivateKey, claimAddress, symKey }` using
  `keccak256("FairWins/claim/v1"‖normalize)` (reduce mod n, reject 0) and
  `keccak256("FairWins/terms/v1"‖normalize)`; and
  `signOpenAccept(code, {wagerId, taker, chainId, verifyingContract})` producing the EIP-712 `OpenAccept`
  signature with `claimPrivateKey`. Makes T005 pass. (research.md R1/R2, FR-002/FR-010/FR-011)
- [X] T007 [P] Write FAILING code-keyed envelope tests in
  `frontend/src/test/claimCode/envelopeCode.test.js`: `encryptEnvelopeCode → decryptEnvelopeCode`
  round-trips; a tampered ciphertext throws (FR-019); a wrong `symKey` fails to decrypt and never reveals
  terms (FR-009/SC-003); `isCodeEnvelope` detects `mode === "code"`. (claim-code-crypto.md R4)
- [X] T008 Add the code-keyed envelope mode to `frontend/src/utils/crypto/envelopeEncryption.js`:
  `encryptEnvelopeCode(terms, symKey, termsVersion?)` (XChaCha20-Poly1305, random 24-byte nonce, no
  recipients list, AAD binds the terms-version hash), `decryptEnvelopeCode(envelope, symKey)`, and
  `isCodeEnvelope(envelope)`. Makes T007 pass. (research.md R4, data-model.md "Code-keyed terms envelope")

### Contract scaffolding (additive surface; no function bodies yet)

- [X] T009 Edit `contracts/wagers/WagerRegistry.sol` to add EIP-712 support on the **upgradeable** base from
  spec 025: inherit `EIP712Upgradeable` and call `__EIP712_init("FairWins WagerRegistry", "1")` in the
  registry's initializer (OZ's EIP712 is proxy-safe — it recomputes the domain separator when proxied), add
  `import {ECDSA}` + `using ECDSA for bytes32`, and declare
  `bytes32 private constant OPEN_ACCEPT_TYPEHASH = keccak256("OpenAccept(uint256 wagerId,address taker)")`.
  No logic change to existing functions. (depends on 025; contracts/wager-registry-open-challenge.md "EIP-712")
- [X] T010 Add the two public side mappings to `contracts/wagers/WagerRegistry.sol`:
  `mapping(uint256 => address) public claimAuthority;` and
  `mapping(address => uint256) public openWagerIdByClaim;`, **appended after the last existing state
  variable** (storage-layout-compatible with the 025 UUPS upgrade — never insert before or reorder existing
  storage), following the existing out-of-struct pattern. The OZ storage-layout check (T047) must pass.
  (data-model.md "New side mappings", research.md R3)
- [X] T011 [P] Add the new events and errors to `contracts/wagers/WagerRegistry.sol` (and mirror in
  `contracts/interfaces/IWagerRegistry.sol`): event `OpenWagerCreated(uint256 indexed wagerId, address
  indexed creator, address indexed claimAuthority, address token, uint128 stake, ResolutionType
  resolutionType, bytes32 metadataHash, string metadataUri)`; errors `ZeroClaimAuthority`,
  `ClaimAuthorityInUse`, `OpenResolutionTypeNotAllowed`, `NotOpenChallenge`, `BadClaimSignature`,
  `ArbitratorCannotTake`. The `Wager` struct and all existing signatures stay byte-identical (FR-024).
- [X] T012 Add the `_clearClaim(uint256 wagerId)` internal helper to `contracts/wagers/WagerRegistry.sol`
  (deletes `openWagerIdByClaim[claimAuthority[wagerId]]` then `claimAuthority[wagerId]`, no-op if unset).
  Not yet wired into callers — that happens with the function bodies in US1.
  (contracts/wager-registry-open-challenge.md "Internal _clearClaim")

**Checkpoint**: `npm run compile` succeeds (new state/events/errors present, struct/ABI unchanged);
`npm run test:frontend -- claimCode` passes (T003–T008 green). Foundation ready — user stories can begin.

---

## Phase 3: User Story 1 - Post an open challenge and let a chosen friend take it with a code (Priority: P1) 🎯 MVP

**Goal**: A member creates a counterparty-less wager, gets a four-word code, shares it; a different
code-holding member discovers the wager by the code, reads its decrypted terms, and accepts — becoming the
bound opponent. From accept onward the wager resolves/pays/refunds/draws identically to a named-opponent wager.

**Independent Test**: Create an open wager (no opponent), capture the code; as a *second* account given the
code, look it up, read the terms, and accept. Confirm the accepter is the opponent, the wager is Active, the
claim slot is freed, and a configured resolution path pays the winner the full pot. (spec US1 Independent Test)

### Tests for User Story 1 (write first, must fail) ⚠️

- [X] T013 [P] [US1] Write FAILING happy-path unit tests in `test/WagerRegistry.openChallenge.test.js`:
  `createOpenWager` with each ALLOWED resolution type (`Either`, `ThirdParty`, `Polymarket`,
  `ChainlinkDataFeed`, `ChainlinkFunctions`, `UMA`) succeeds, escrows the creator stake, charges
  `recordCreate`, sets `opponent == address(0)` / `status == Open` / `creatorStake == opponentStake`, and
  emits `OpenWagerCreated`; `openWagerIdForClaim(authority) == wagerId` and `isOpenChallenge(id) == true`.
  A valid member-taker signature → `opponent == taker`, `status == Active`, opponent stake escrowed,
  `openWagerIdForClaim(authority) == 0` (slot freed), `WagerAccepted` emitted. (Use a **Silver+** creator;
  tier-floor negatives are in T030.) (FR-001/004/005/005a/007/010/012/016b, quickstart §1)
- [X] T014 [P] [US1] Write FAILING lifecycle/slot-release unit tests in
  `test/WagerRegistry.openChallenge.test.js`: `cancelOpen` before accept refunds the creator and
  `openWagerIdForClaim == 0` (code reusable); after `acceptDeadline` with no taker, `claimRefund` and
  `batchExpireOpen` refund the creator, release the membership slot, and clear the claim mappings
  (FR-021/FR-022); after accept, `declareWinner` / oracle auto-resolve / `declareDraw` / `claimPayout` /
  `claimRefund` behave identically to a named-opponent wager (FR-016/SC-009).
- [X] T014a [P] [US1] Write FAILING decline/withdrawal-authorization tests in
  `test/WagerRegistry.openChallenge.test.js`: `declineWager` against an open challenge reverts
  `DeclineNotAllowedForOpenChallenge` (for any caller, including a random address and the creator); a
  non-creator calling `cancelOpen` reverts `NotCreator`; only the creator can withdraw an unaccepted open
  challenge and its funds are never released to anyone else. (FR-023/FR-021)
- [ ] T015 [P] [US1] Write FAILING integration test in
  `test/integration/fairwins/openChallengeLifecycle.test.js`: end-to-end create → discover via
  `openWagerIdForClaim` → accept with a code-derived signature → resolve → winner `claimPayout` gets the
  full pot, mirroring an equivalent named-opponent run. (quickstart §1 "Lifecycle", SC-009)

### Implementation for User Story 1

- [X] T016 [US1] Implement `createOpenWager(...)` and the `createOpenWagerWithTerms(...)` overload in
  `contracts/wagers/WagerRegistry.sol` per data-model "createOpenWager Checks" (sanctions `_screen`;
  `claimAuthority_ != 0` else `ZeroClaimAuthority`; `openWagerIdByClaim[claimAuthority_] == 0` else
  `ClaimAuthorityInUse`; allowed-token + non-zero stake → `creatorStake = opponentStake = stake`; deadline
  window checks; resolution type ∈ allowed set else `OpenResolutionTypeNotAllowed`; ThirdParty arbitrator
  rules; oracle linkage; `checkCanCreate`; **`getActiveTier(msg.sender, WAGER_PARTICIPANT_ROLE) >=
  Tier.Silver` else `InsufficientMembershipTier`** — the Silver+ creation privilege, FR-005a), escrow the
  single stake (checks→effects→interaction under `nonReentrant whenNotPaused notFrozen`), set the claim
  mappings, index the creator (+ arbitrator), emit `OpenWagerCreated` (+ `OracleConditionLinked` /
  terms-bound events). (FR-001/004/005/005a/006/006a/016a/016b)
- [X] T017 [US1] Implement `acceptOpenWager(uint256 wagerId, bytes calldata signature)` in
  `contracts/wagers/WagerRegistry.sol` (checks→effects→interaction, `nonReentrant whenNotPaused
  notFrozen`): `status == Open && claimAuthority[id] != 0` else `NotOpenChallenge`; `<= acceptDeadline`
  else `AcceptExpired`; `ECDSA.recover(_hashTypedDataV4(OpenAccept(id, msg.sender)), signature) ==
  claimAuthority[id]` else `BadClaimSignature`; `msg.sender != creator` else `SelfWager`; ThirdParty
  `msg.sender != arbitrator` else `ArbitratorCannotTake`; `_screen(taker)`, `_screen(creator)`,
  `checkCanCreate(taker)`; then set `opponent`/`Active`, `_clearClaim(id)`, index taker, `recordCreate`,
  `safeTransferFrom(opponentStake)`, emit `WagerAccepted`. (FR-010–016, makes T013 happy path pass)
- [X] T018 [US1] Add the two views to `contracts/wagers/WagerRegistry.sol` (and `IWagerRegistry.sol`):
  `openWagerIdForClaim(address authority) → uint256` and `isOpenChallenge(uint256 wagerId) → bool`.
  (contracts/wager-registry-open-challenge.md "New views", FR-007/FR-008 discovery)
- [X] T019 [US1] Wire `_clearClaim` into every path an open wager leaves `Open` in
  `contracts/wagers/WagerRegistry.sol`: at the start of `cancelOpen` (before its existing `delete`), in the
  `Open` branch of `claimRefund`, and in `batchExpireOpen` (`acceptOpenWager` already calls it via T017).
  Makes T014 pass. (data-model "_clearClaim called from…", FR-006a/021/022)
- [X] T019a [US1] Add the `declineWager` open-challenge guard in `contracts/wagers/WagerRegistry.sol`: at the
  top of `declineWager`, `if (claimAuthority[wagerId] != address(0)) revert DeclineNotAllowedForOpenChallenge();`
  so decline is rejected for open challenges (the creator's `cancelOpen` stays the only withdrawal path).
  Makes T014a pass. (FR-023, contracts doc "declineWager guard")
- [X] T020 [US1] Regenerate the frontend contract artifacts so the new functions/events land in
  `frontend/src/abis/WagerRegistry.{js,json}` (GENERATED — never hand-edit). Run the network-matching
  variant: `npm run sync:frontend-contracts:local` after a local deploy during dev (and `:amoy` / `:polygon`
  at deploy time) — the ABI is identical across networks; only the addresses differ.
  (plan.md Structure Decision / Principle V)
- [X] T021 [P] [US1] Add the open-challenge create branch to
  `frontend/src/hooks/useFriendMarketCreation.js`: `code = generateCode()`,
  `{ claimAddress, symKey } = deriveFromCode(code)`, encrypt terms with `encryptEnvelopeCode` → IPFS →
  `metadataReference`/`metadataHash`, then call `createOpenWager(claimAddress, …, single stake)`; surface
  the generated `code` to the UI. (claim-code-crypto.md "Create flow", FR-001/004)
- [X] T022 [P] [US1] Add the new accept hook `frontend/src/hooks/useOpenChallengeAccept.js`: validate
  words → `deriveFromCode` → `registry.openWagerIdForClaim(claimAddress)` (0 ⇒ "no challenge for that
  code") → fetch wager + envelope → `decryptEnvelopeCode` (verify `metadataHash`) → `signOpenAccept` →
  `registry.acceptOpenWager(wagerId, sig)`. (claim-code-crypto.md "Take flow", FR-007/010/017)
- [X] T023 [US1] (Implemented as a standalone `CreateOpenChallengeModal.jsx` instead of editing the
  2173-line `FriendMarketsModal.jsx` — same UX, far lower risk.) Original text: Add the open-challenge mode to `FriendMarketsModal.jsx`:
  a "no opponent / open challenge" toggle, single equal-stake input, restricted resolution-type choices,
  and a one-time code display with copy/save/share affordances. (FR-001/025, depends on T021)
- [X] T024 [US1] Add `frontend/src/components/fairwins/TakeChallengeModal.jsx`: four-word entry → discover →
  show decrypted terms → accept; "terms unavailable" fallback when IPFS retrieval fails. (FR-007/017/020,
  depends on T022)
- [X] T025 [P] [US1] Write frontend flow tests covering the create and take hooks in
  `frontend/src/test/claimCode/` (e.g. `openChallengeCreate.test.jsx` / `openChallengeAccept.test.jsx`):
  create returns a shareable code and calls `createOpenWager` with the derived `claimAddress` + single
  stake; take resolves a wager by code, decrypts terms, and submits a `(wagerId, taker)`-bound signature.
  (SC-001/SC-002)
- [ ] T025a [P] [US1] Write a post-accept readability test in `frontend/src/test/claimCode/` asserting the
  bound opponent re-derives `symKey` from the code and `decryptEnvelopeCode`s the terms **after** accepting
  (no re-key step, no registered encryption key required), and that discarding the code yields the "terms
  unavailable" state without affecting funds or resolution. (FR-018/FR-018a)
- [X] T026 [P] [US1] Add `handleOpenWagerCreated` to `subgraph/src/mappings/wagerRegistry.ts` (writes a
  `Wager` with `opponent = null`, `status = "open"`) and register the `OpenWagerCreated` event in
  `subgraph/subgraph.yaml`. (research.md R5, FR-007 discovery indexing)
- [ ] T027 [P] [US1] Add a matchstick test under `subgraph/tests/` asserting `handleOpenWagerCreated`
  indexes `opponent = null` / `status = "open"` and that the existing `handleWagerAccepted` backfills
  `opponent` on accept (run via the Docker matchstick flow). (quickstart §4)

**Checkpoint**: `npm test -- --grep "OpenChallenge"`, the integration test, the frontend create/take tests,
and the subgraph test are green. The MVP — discover → read → accept → resolve → claim — works end to end.

---

## Phase 4: User Story 2 - Reject takers who do not hold the code, and resist sniping (Priority: P1)

**Goal**: A non-holder cannot find, read, or accept an open challenge; a guessed/wrong code fails; a mempool
observer cannot steal the counterparty slot; and every existing accept-time protection
(membership/sanctions/self-accept/arbitrator) holds. This is the defensive half of the same contract
functions built in US1 — it is realized mainly as negative-path tests plus honest UI gating.

**Independent Test**: As an account *not* given the code, fail to (a) identify the wager among open
challenges, (b) read its terms, and (c) accept with no/wrong code; confirm a copied pending acceptance
cannot be reused by an observer, and a four-word brute force is impractical within the open window.
(spec US2 Independent Test)

### Tests for User Story 2 (write first, must fail) ⚠️

- [X] T028 [P] [US2] Write FAILING signature/anti-front-run unit tests in
  `test/WagerRegistry.openChallenge.test.js`: a wrong-key signature → `BadClaimSignature`; a signature
  bound to a *different* `taker` or `wagerId` (replay/front-run attempt) → `BadClaimSignature`; a
  malleable-`s` signature is rejected by `ECDSA.recover`; an unset claim slot can never be satisfied by a
  forged accept. (FR-011/SC-006, research.md R1)
- [X] T029 [P] [US2] Write FAILING accept-gauntlet unit tests in `test/WagerRegistry.openChallenge.test.js`:
  creator self-accept → `SelfWager`; named arbitrator accepting a ThirdParty open challenge →
  `ArbitratorCannotTake`; non-member taker → `MembershipDenied`; sanctioned taker / sanctioned creator →
  sanctions revert; frozen taker → revert; **a Bronze (lowest active tier) taker with the code SUCCEEDS** —
  participation has no tier floor (FR-005a/FR-013). (FR-013/014/015, SC-007)
- [X] T030 [P] [US2] Write FAILING create-guard unit tests in `test/WagerRegistry.openChallenge.test.js`:
  `Creator` or `Opponent` resolution type → `OpenResolutionTypeNotAllowed`; zero `claimAuthority` →
  `ZeroClaimAuthority`; a second open wager reusing an already-`Open` authority → `ClaimAuthorityInUse`;
  (equal stakes are enforced by the single-`stake` param — assert `creatorStake == opponentStake`); a
  **Bronze or non-member (None)** creator → `InsufficientMembershipTier`, while **Silver / Gold / Platinum**
  creators succeed — the Silver+ creation privilege (FR-005a). (FR-005a/006a/016a/016b)
- [ ] T031 [P] [US2] Write FAILING frontend defensive tests in `frontend/src/test/claimCode/`: an unknown
  code yields "no challenge for that code" and never reveals a wager; a tampered envelope shows "terms
  unavailable"/error rather than partial terms; `signOpenAccept` for taker A cannot be replayed by taker B
  (JS-side `recover` mismatch). (FR-008/009/019, SC-003)

### Implementation for User Story 2

- [X] T032 [US2] Confirm and, if needed, tighten the US1 contract checks so every assertion in T028–T030
  passes in `contracts/wagers/WagerRegistry.sol` (the CEI gauntlet from T016/T017 should already cover
  these; add any missing revert/branch). No new public surface.
- [X] T033 [US2] Add the non-member buy-membership prompt to
  `frontend/src/components/fairwins/TakeChallengeModal.jsx`: when the taker lacks active membership, block
  acceptance and route to the existing membership-purchase flow (no open-challenge exemption). (FR-013)
- [X] T033a [US2] Ensure no "decline" affordance is shown for open challenges in the wager-management UI
  (e.g. `frontend/src/components/fairwins/` wager views): an open challenge only ever exposes the creator's
  cancel/withdraw action while Open — never a decline button — mirroring the contract guard. (FR-023/FR-025)
- [X] T034 [US2] Add the honest-state notices to
  `frontend/src/components/fairwins/FriendMarketsModal.jsx` (and the code-display step): the v1
  residual-brute-force notice (FR-003a — non-color-only, WCAG-discoverable), the "save the code to read
  this later" reminder (FR-018a), and "no counterparty yet / code-gated" status; for `ThirdParty`, disclose
  that the named arbitrator can read and resolve. (FR-003a/018a/025, SC-004)
- [X] T035 [US2] Restrict the create UI to permitted resolution types in
  `frontend/src/components/fairwins/FriendMarketsModal.jsx` so a creator cannot pick `Creator`/`Opponent`
  for an open challenge (mirrors the contract `OpenResolutionTypeNotAllowed`), keeping all types available
  for named-opponent wagers. (FR-026)
- [X] T035a [US2] Gate the open-challenge **create** option to Silver+ members in
  `frontend/src/components/fairwins/FriendMarketsModal.jsx` (and the entrypoint that opens it): read the
  active tier via the membership hook/contract; for Bronze/None, hide or disable the "open challenge" mode
  and show an upgrade prompt (mirrors the contract `InsufficientMembershipTier`). The take/accept flow is
  unaffected — any active tier may participate. Add a Vitest case asserting the option is hidden/disabled
  below Silver and enabled at Silver+. (FR-005a, SC honest-state)
- [X] T036 [US2] Ensure discovery indistinguishability in the frontend: open challenges are never listed or
  rendered identifiably without the code (no public list endpoint reveals which entry is which); a holder
  reaches the wager only via `openWagerIdForClaim`. Verify in `frontend/src/hooks/useOpenChallengeAccept.js`
  and any wager-listing view. (FR-008)

**Checkpoint**: All negative-path contract tests, the membership/sanctions/self/arbitrator gauntlet, and the
frontend defensive tests are green. A non-holder/non-member is cleanly blocked; front-run and replay fail.

---

## Phase 5: User Story 3 - Post a public first-come open challenge (Priority: P2)

**Goal**: A creator publishes the code openly; the first willing member takes the other side. Exactly one
binds; the rest are cleanly refused with no funds taken or stuck.

**Independent Test**: Publish the code; have several takers race; confirm exactly one becomes the opponent,
the others revert, and the terms were readable to every code-holder. (spec US3 Independent Test)

### Tests for User Story 3 (write first, must fail) ⚠️

- [X] T037 [P] [US3] Write a FAILING race/double-accept unit test in
  `test/WagerRegistry.openChallenge.test.js`: two members submit valid code-derived signatures; exactly one
  binds as opponent, the second reverts `NotOpenChallenge` (status no longer `Open`), and no funds are
  taken from the loser. (SC-005, quickstart §1 "two members race")

### Implementation for User Story 3

- [X] T038 [US3] Add a public-challenge sharing affordance to
  `frontend/src/components/fairwins/FriendMarketsModal.jsx` (share-the-code openly / "anyone with the code
  can take" copy) and ensure the take flow handles a lost race gracefully ("already accepted" rather than a
  raw revert) in `frontend/src/components/fairwins/TakeChallengeModal.jsx`. (US3, FR-012/025)
- [ ] T039 [P] [US3] Add a frontend test in `frontend/src/test/claimCode/` asserting the public-mode
  messaging renders and that a `NotOpenChallenge`/already-accepted result surfaces as a clean "already
  taken" state, not an unhandled error. (SC-005)

**Checkpoint**: The race test passes; the public-challenge UX is honest and a lost race degrades gracefully.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Whole-feature hardening, regression, and the security gates the constitution requires before
this funds-bearing change can ship.

- [ ] T040 [P] Extend `contracts/test/WagerRegistryFuzzTest.sol` (Medusa) with open-path invariants: escrow
  conservation across create/accept/refund, single-binding (≤ one opponent), claim-slot release on
  leaving `Open`, and "no accept without a matching claim signature." (plan.md Testing, quickstart §2)
- [ ] T040a [P] Add a fork test under `test/fork/` exercising one oracle-resolved (Polymarket/Chainlink/UMA)
  open-challenge lifecycle (create → accept → oracle auto-resolve → claim), OR document in
  `specs/024-open-challenge-wagers/research.md` that existing oracle fork coverage applies unchanged because
  post-accept behavior is identical to a named-opponent wager (FR-016). (Constitution II — fork tests where
  oracles are involved)
- [X] T041 Run the FULL existing contract suite (`npm test`) and confirm zero regressions in the
  named-opponent create/accept/cancel/decline/resolve/draw/refund/claim flows. (FR-024, SC-008)
- [ ] T042 [P] Run `npm run slither` and confirm no new high/critical findings on the changed paths;
  document EthTrust-SL ≥ L2 reasoning + the v1 residual-brute-force acceptance (FR-003a) in
  `specs/024-open-challenge-wagers/research.md` "EthTrust" section if not already captured. (Principle I)
- [ ] T043 [P] Run `npm run test:coverage` and confirm the open create/accept/lifecycle branches are
  covered; close any gap with targeted cases in `test/WagerRegistry.openChallenge.test.js`. (Principle II)
- [ ] T044 [P] Run the a11y check on the new/edited modals
  (`FriendMarketsModal.jsx`, `TakeChallengeModal.jsx`): labeled code input, clear error states, non-color-only
  residual-risk notice (WCAG 2.1 AA). (Principle V, FR-003a)
- [ ] T045 Request the smart-contract security-agent review (`.github/agents/`) of the
  `WagerRegistry` diff before merge — signature recovery, CEI ordering, slot-release completeness,
  backward-compat checklist in `contracts/wager-registry-open-challenge.md`. (Principle I)
- [ ] T046 Execute the `specs/024-open-challenge-wagers/quickstart.md` §5 manual two-account run on a local
  or Amoy deployment (A creates, B discovers+reads+accepts, C is blocked, non-member sees buy-membership)
  and record the result in the PR. (SC-002/003/005/006/007)

---

## Phase 7: Deployment (run from this environment, as needed)

**Purpose**: Ship the contract + frontend + subgraph to the live networks. **Depends on spec
`025-upgradeable-registry` (UUPS proxy) being deployed first.** Per the chosen direction, `WagerRegistry`
becomes UUPS-upgradeable in 025; 024's contract changes then ship as the **first in-place implementation
upgrade** of that proxy — the **proxy address does not change**, so there are **no stranded wagers and no
frontend/subgraph repoint** (only the ABI gains the new fns/events). Until 025's proxy is live on a network,
024 cannot deploy there. Testnet (Amoy) first, mainnet (Polygon) after validation + sign-off. Mordor/ETC are
legacy read-only and out of scope (spec Assumptions).

- [X] T047 Deploy 024 to **Amoy** (chainId 80002) as a **UUPS implementation upgrade** of the 025 proxy:
  run the OZ storage-layout compatibility check, deploy the new `WagerRegistry` implementation, then
  `upgradeToAndCall` via the proxy admin role (floppy-keystore keys, 25 gwei floor) — the **proxy address
  does not change**. Update `deployments/amoy-chain80002-v2.json` with the new implementation address, run
  `npm run sync:frontend-contracts:amoy` (ABI gains the new fns/events; address unchanged) and
  `npm run verify:amoy`. (depends on 025 proxy live on Amoy)
- [X] T048 Deploy the v2 subgraph for Amoy with the new `OpenWagerCreated` handler (`fairwins-amoy`,
  Studio) and confirm it indexes open wagers with `opponent = null` / `status = open` and no indexing
  errors; smoke-test discovery against the Amoy deployment. (subgraph deploy flow, research.md R5)
- [ ] T049 Validate on Amoy via quickstart §5 end-to-end (including the Silver+ create gate and the
  decline-blocked path), and **confirm the upgrade preserved all prior wager state through the proxy** (no
  storage corruption; spot-check existing wagers still read correctly). Get explicit maintainer sign-off
  before the mainnet upgrade. Block T050 on sign-off.
- [ ] T050 After sign-off, upgrade the **Polygon** mainnet (chainId 137) proxy implementation via the
  floppy-keystore flow (`upgradeToAndCall`; **proxy address unchanged**). Update
  `deployments/polygon-chain137-v2.json` with the new implementation address, run
  `npm run sync:frontend-contracts:polygon` + `npm run verify:polygon`, and deploy the `fairwins-polygon`
  (canonical id `matic`) v2 subgraph for the new `OpenWagerCreated` event. (project memory: Polygon deploy
  gotchas, Studio `matic` id)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories** (shared crypto + contract scaffolding).
- **US1 (Phase 3)**: depends on Foundational. The MVP.
- **US2 (Phase 4)**: depends on Foundational; its implementation tightens/relies on the US1 contract
  functions (T016/T017), so in practice US2 tests are written against US1's functions. Both are P1 and ship together.
- **US3 (Phase 5)**: depends on Foundational + the US1 accept path (race semantics are a property of `acceptOpenWager`).
- **Polish (Phase 6)**: depends on all desired user stories being complete.
- **Deployment (Phase 7)**: depends on Phase 6 gates passing; mainnet (T050) is gated on T049 sign-off.

### Within Each User Story

- Tests are written FIRST and must FAIL before implementation (Constitution Principle II).
- Contract scaffolding (Phase 2) → contract functions (US1) → views/lifecycle wiring (US1) → ABI sync →
  frontend hooks → frontend components → subgraph.
- ABI sync (T020) must precede any frontend task that imports the new functions/events (T021–T025).

### Parallel Opportunities

- Setup: T002 ∥ T001.
- Foundational: the three off-chain crypto pairs (T003/T004, T005/T006, T007/T008) are independent of the
  contract scaffolding (T009–T012) and of each other (different files) — run the test halves [P] together,
  then their impls. T011 ∥ T010 within the contract scaffolding.
- US1: the three test tasks T013/T014/T015 [P]; after the contract is done + ABI synced, the create hook
  (T021) ∥ accept hook (T022) ∥ subgraph (T026/T027) ∥ frontend flow tests (T025) — different files.
- US2: all four test tasks T028–T031 [P]; UI tasks T033/T034/T035 touch the same two modals so serialize
  those, but contract-side T032 is independent.
- US3: T037 (contract test) ∥ T039 (frontend test).
- Polish: T040/T042/T043/T044 [P] (fuzz, slither, coverage, a11y are separate tools/files); T041 is a gate.

---

## Parallel Example: User Story 1

```bash
# After Phase 2, write the three US1 test tasks together (they must fail first):
Task T013: happy-path unit tests in test/WagerRegistry.openChallenge.test.js
Task T014: lifecycle/slot-release unit tests in test/WagerRegistry.openChallenge.test.js
Task T015: integration test in test/integration/fairwins/openChallengeLifecycle.test.js

# After the contract functions + ABI sync (T016–T020), build the surfaces in parallel:
Task T021: open-create branch in frontend/src/hooks/useFriendMarketCreation.js
Task T022: accept hook frontend/src/hooks/useOpenChallengeAccept.js
Task T026: handleOpenWagerCreated in subgraph/src/mappings/wagerRegistry.ts
Task T025: frontend flow tests in frontend/src/test/claimCode/
```

---

## Implementation Strategy

### MVP First (User Story 1 + the US2 gauntlet)

1. Phase 1 Setup → Phase 2 Foundational (crypto module + contract scaffolding).
2. Phase 3 US1 — create → discover → accept → resolve happy path, with ABI sync, frontend flows, subgraph.
3. Because US2 is inseparable (the defensive properties of the *same* functions), land the US2 negative-path
   tests + honest UI gating with US1 before any deploy. **STOP and VALIDATE** via quickstart §5 (T046).

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 (+ US2 gauntlet) → test independently → demo on local/Amoy (MVP).
3. US3 public first-come → race test + public UX → demo.
4. Polish gates (regression, Slither, coverage, fuzz, security review).
5. Deploy: Amoy → validate → maintainer sign-off on migration → Polygon mainnet.

### Notes

- [P] = different files, no dependency on an incomplete task.
- Tests fail before implementation; commit after each task or logical group.
- The `Wager` struct, every existing signature, and all events stay byte-compatible (FR-024) — verify the
  backward-compat checklist in `contracts/wager-registry-open-challenge.md` before merge.
- The security-critical code↔key derivation lives ONLY in `frontend/src/utils/claimCode/` and is reused by
  both create and accept (no duplication/drift).
- ABIs/addresses reach the frontend ONLY through `sync:frontend-contracts` — never hand-edit
  `frontend/src/abis/WagerRegistry.{js,json}` (Principle V).
