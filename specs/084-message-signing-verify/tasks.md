# Tasks: Message Signing and Verification (Protect ▸ Verify)

**Input**: Design documents from `specs/084-message-signing-verify/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: Requested. Constitution II makes tests non-optional for non-trivial frontend logic, and
this feature's whole value is the correctness of a verdict — so test tasks are first-class here.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on incomplete work)
- **[US1] / [US2] / [US3]**: the user story the task serves
- Every task carries its file path.

## Verification status

Every task below is marked `[X]` **only where the merged code was checked against it**, with the
evidence named. Verified on branch `claude/message-signing-verification-ax4xbc` at
`origin/staging` (PR #1163: `34cb364`, `d6a2432`, `b7a707a`).

Two items are deliberately **not** claimed complete — see *Known gaps* at the end. They are real
and they are recorded rather than rounded up.

`/speckit-analyze` was run against these artifacts and found one requirement with no task behind it
(FR-024, now T057) and two success criteria claiming more evidence than existed (SC-004 and SC-007).
SC-007 was narrowed in `spec.md` to what is actually tested; SC-004's shortfall is T059.

Paths are repo-relative. Frontend paths are under `frontend/`.

---

## Phase 1: Setup

- [X] T001 Create the feature directory `specs/084-message-signing-verify/` with the visual review record under `screenshots/`
  — *exists; 24 PNGs + `screenshots/README.md`.*
- [X] T002 Confirm no new runtime dependency is required — `ethers` v6 already resolves at the workspace root
  — *`npm run check:deps` clean; `package-lock.json` untouched by the PR (`git diff --stat` empty for it).*

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the record format and the verdict model. Every user story depends on these; nothing
member-facing can be right if the verdict type cannot express "we could not tell".

- [X] T003 Define the portable record — build, serialize, parse — in `frontend/src/lib/verify/signedMessage.js`
  — *`SIGNED_MESSAGE_FORMAT`, `buildSignedMessage`, `serializeSignedMessage`, `parseSignedMessage`, `looksLikeSignedMessage`.*
- [X] T004 Refuse to build an ERC-1271 record without a `chainId`, in `frontend/src/lib/verify/signedMessage.js`
  — *throws "must record the chain it can be checked on"; asserted in `signedMessage.test.js`.*
- [X] T005 Make `parseSignedMessage` total (never throws) and refuse rather than default missing fields, in `frontend/src/lib/verify/signedMessage.js`
  — *returns `{ok,doc,error}`; non-JSON / bad format / missing message / missing signature / bad address each refused with a named reason.*
- [X] T006 Accept unknown extra keys so a later-version record stays readable, in `frontend/src/lib/verify/signedMessage.js`
  — *contract guarantee 4; asserted by "accepts unknown extra keys".*
- [X] T007 Define the three-outcome verdict model `VERIFY_STATUS` in `frontend/src/lib/verify/verifyMessage.js`
  — *`VALID` / `INVALID` / `UNVERIFIABLE`, frozen.*

**Checkpoint**: the record round-trips and the verdict type can express all three answers.

---

## Phase 3: User Story 1 — Check a proof somebody handed me (P1) 🎯 MVP

**Goal**: a member can establish whether a stated address signed a stated message, and is never
told a claim is false when it merely could not be checked.

**Independent test**: paste message + signature + address, read the outcome. No signing capability
and no connected account needed.

### Tests for User Story 1

- [X] T008 [P] [US1] Shared fixtures with **computed** signatures in `frontend/src/test/fixtures/signedMessages.js`
  — *signatures derived at import from Hardhat key #0; `stubProvider` for the on-chain leg.*
- [X] T009 [P] [US1] Confirmed-outcome tests (offline recovery, case-insensitive address, contract magic value, no-address recovery) in `frontend/src/test/verify/verifyMessage.test.js`
- [X] T010 [P] [US1] Contradicted-outcome tests (someone else signed, tampered message, contract declines, no code at address, malformed inputs) in `frontend/src/test/verify/verifyMessage.test.js`
- [X] T011 [P] [US1] **Not-determinable tests — every network-failure path asserts `unverifiable`, never `invalid`** in `frontend/src/test/verify/verifyMessage.test.js`
  — *no chain, no route, unreachable node, reverting call, and the mismatching-recovery-without-chain case.*
- [X] T012 [P] [US1] Verbatim-bytes test: whitespace/Unicode message verifies, and its trimmed variant does **not**, in `frontend/src/test/verify/verifyMessage.test.js`

### Implementation for User Story 1

- [X] T013 [US1] EIP-191 recovery that returns null instead of throwing, in `frontend/src/lib/verify/verifyMessage.js`
  — *`recoverPersonalSigner`; a 900-byte WebAuthn envelope reaching it is expected, not exceptional.*
- [X] T014 [US1] ERC-1271 leg distinguishing "the contract answered" from "we could not ask", in `frontend/src/lib/verify/verifyMessage.js`
  — *`checkErc1271` returns `{answered, valid}` or `{answered:false, reason}`; only `0x1626ba7e` counts.*
- [X] T015 [US1] Compose the verdict so a negative is reported only when established, in `frontend/src/lib/verify/verifyMessage.js`
  — *`verifyMessage`; decision table reproduced in `data-model.md`.*
- [X] T016 [US1] Report the recovered address as **evidence** alongside negatives and undeterminables, in `frontend/src/lib/verify/verifyMessage.js`
  — *`signer` populated on `invalid` and on `unverifiable`.*
- [X] T017 [US1] Resolve providers through the shared read-provider seam, never a hand-built one, in `frontend/src/lib/verify/verifyMessage.js`
  — *`getReadProvider(chainId)`; honours the member's spec-069 endpoints.*
- [X] T018 [US1] Scope the network selector to the build cohort in `frontend/src/components/custody/VerifyMessageForm.jsx`
  — *`cohortChainIds()`, not `listSupportedChainIds()` — constitution III.*
- [X] T019 [US1] Render the three verdicts as visually and textually distinct in `frontend/src/components/custody/VerifyMessageForm.jsx` + `Verify.css`
  — *three tones each with its own glyph, and "this is not a failed check" on the undeterminable one.*

**Checkpoint**: US1 is independently usable. A member with no account can check a proof.

---

## Phase 4: User Story 2 — Prove I control this account (P2)

**Goal**: a member produces a proof for the account they are acting as, or is told plainly why they
cannot.

**Independent test**: enter a challenge, sign, then check the result back to the member's address
via US1.

### Tests for User Story 2

- [X] T020 [P] [US2] Identity-routing tests incl. the vault refusal and the passkey-without-credential refusal in `frontend/src/test/verify/signMessage.test.js`
- [X] T021 [P] [US2] Verbatim-signing test asserting the signer receives the message unaltered in `frontend/src/test/verify/signMessage.test.js`
- [X] T022 [P] [US2] Cancellation tests across all four rejection shapes (EIP-1193 4001, `ACTION_REJECTED`, WebAuthn `NotAllowedError`, wallet copy) in `frontend/src/test/verify/signMessage.test.js`
- [X] T023 [P] [US2] Round-trip test: a signed record verifies in `frontend/src/test/verify/signMessage.test.js`

### Implementation for User Story 2

- [X] T024 [US2] Identity → signing-capability seam in `frontend/src/lib/verify/signMessage.js`
  — *`resolveMessageSigner`; mirrors `lib/collectibles/orderSigner.js`.*
- [X] T025 [US2] Refuse to sign as a vault, with the reason, in `frontend/src/lib/verify/signMessage.js`
  — *research R4; the security behaviour, not a limitation.*
- [X] T026 [US2] Sign verbatim and wrap the result in a record, in `frontend/src/lib/verify/signMessage.js`
  — *`signMessageAsAccount`; no trim, no template, no nonce (verified: no `.trim()` anywhere on the message path).*
- [X] T027 [US2] Distinguish cancellation from failure in `frontend/src/lib/verify/signMessage.js`
  — *`SignatureDeclined`.*
- [X] T028 [US2] Add `signMessage` to the passkey adapter, sharing one `signDigest` with `signTypedData`, in `frontend/src/lib/passkey/intentSigner.js`
  — *research R5; the envelope cannot drift between callers.*
- [X] T029 [US2] Sign form that withdraws the control and states the reason when the identity cannot sign, in `frontend/src/components/custody/SignMessageForm.jsx`
- [X] T030 [US2] Retire the record when the message changes — derived during render, not cleared in an effect, in `frontend/src/components/custody/SignMessageForm.jsx`

**Checkpoint**: a member can produce a proof and check it with US1.

---

## Phase 5: User Story 3 — Hand the proof over without losing anything (P3)

**Goal**: the record moves between two people intact, with no hand-copying.

**Independent test**: copy from the sign surface, paste into the check surface, confirm every field
populates and the outcome is correct.

### Tests for User Story 3

- [X] T031 [P] [US3] Round-trip test preserving whitespace/Unicode through serialize→parse→verify in `frontend/src/test/verify/signedMessage.test.js`
- [X] T032 [P] [US3] Test that a record **lying** about its scheme verifies identically in `frontend/src/test/verify/signedMessage.test.js`
- [X] T033 [P] [US3] Component test: pasting a record populates every field and states what was read in `frontend/src/test/verify/VerifySection.test.jsx`
- [X] T034 [P] [US3] Component test: an unreadable record is reported and blocks the check in `frontend/src/test/verify/VerifySection.test.jsx`

### Implementation for User Story 3

- [X] T035 [US3] Copy controls for the whole record and for the signature alone in `frontend/src/components/custody/SignMessageForm.jsx`
  — *reuses `useClipboard` (which surfaces copy failures rather than console-logging them).*
- [X] T036 [US3] Absorb a pasted record from either text box, leaving non-record text as ordinary input, in `frontend/src/components/custody/VerifyMessageForm.jsx`
- [X] T037 [US3] State what was read and when, in the reader's locale, in `frontend/src/components/custody/VerifyMessageForm.jsx`
  — *`readableTime`; the notice sits above the fields it filled.*
- [X] T038 [US3] Scroll both boxes to the top after an import so the member reads the message's first line in `frontend/src/components/custody/VerifyMessageForm.jsx`
- [X] T039 [US3] Bind a parse error to the field that produced it, so editing an unrelated field cannot re-enable the check, in `frontend/src/components/custody/VerifyMessageForm.jsx`
  — *`clearErrorFor`; commit `b7a707a`.*

---

## Phase 6: Surface & wiring (cross-cutting, serves all stories)

- [X] T040 Mount Verify as a third Protect subsection, ungated by the connected network, in `frontend/src/components/custody/CustodyPanel.jsx`
  — *asserted by "keeps Verify available on a chain with no custody deployment".*
- [X] T041 React wiring in `frontend/src/hooks/useMessageSigning.js`
  — *binds identity (spec 041 login method, spec 043 operate-as, spec 062 legacy key) to the pure seams.*
- [X] T042 **The verify seam never rejects**: an internal throw becomes an honest `unverifiable`, in `frontend/src/hooks/useMessageSigning.js`
  — *FR-014; commit `b7a707a`. The structural fix behind two review findings.*
- [X] T043 Two entry rows + two sheets, so the area costs the page ~300 px rather than ~3,000, in `frontend/src/components/custody/VerifySection.jsx`
  — *research R6; measured in the visual loop.*
- [X] T044 Show each entry's current state (last outcome tone, or the refusal reason) on the row in `frontend/src/components/custody/VerifySection.jsx`
- [X] T045 Hoist both drafts above the sheets so closing one does not discard work in `frontend/src/components/custody/VerifySection.jsx`
- [X] T046 Add an optional `className` to the shared sheet and pin the header for these two callers, in `frontend/src/components/account/ActionSheet.jsx` + `Verify.css`
  — *additive and defaulted; no existing caller's render changes.*
- [X] T047 Scroll results into view when they arrive, feature-detected, in both forms
  — *jsdom has no `scrollIntoView`; a convenience must not take the surface down.*
- [X] T048 Reuse the shared address field rather than a new input, in `frontend/src/components/custody/VerifyMessageForm.jsx`
  — *`CustodyAddressField` — address book, QR, ENS/callsign resolution.*
- [X] T049 Style the surface on the platform's tokens, wrapping addresses at phone widths, in `frontend/src/components/custody/Verify.css`

---

## Phase 7: Polish & cross-cutting concerns

- [X] T050 [P] Two axe audits (arrival, and each sheet with a result on screen) in `frontend/src/test/verify/VerifySection.test.jsx`
  — *3 `axe` assertions; FR-025 / SC-007.*
- [X] T051 [P] Actor-critic capture harness with loopback wallet + chain stubs in `scripts/ui/capture-verify.mjs`
  — *`personal_sign` bridged to Node and answered with a real signature, so screenshots show records that genuinely verify.*
- [X] T052 [P] Record the visual review — 24 shots and every finding — in `specs/084-message-signing-verify/screenshots/README.md`
  — *4 rounds, 13 findings, plus the harness fixture bug the loop caught.*
- [X] T053 [P] Developer guide + mkdocs nav entry in `docs/developer-guide/message-signing.md`, `mkdocs.yml`
- [X] T054 [P] Guardrail in `CLAUDE.md` for the three-outcome rule and the verbatim-message rule
- [X] T055 Full frontend suite passes — 622 files / 7052 tests
  — *run after the shared `ActionSheet` change, per the `monorepo-verify` gate for a shared component.*
- [X] T056 Lint clean on every changed file; `npm run check:deps` clean; lockfile untouched
- [X] T057 Verify FR-024 structurally: no new module reaches a write path, and nothing is persisted
  — *`grep` across `lib/verify/`, `useMessageSigning.js` and both forms finds no `sendTransaction`,
  `sendCalls` or `submit(`, and no `localStorage` / `userStorage` / `saveUserPreference`. The
  feature reads chain state and writes nothing, on-chain or off. Added after `/speckit-analyze`
  found FR-024 was the one requirement with no task behind it.*

---

## Known gaps

Recorded rather than rounded up to `[X]`.

- [ ] T059 [US2] **End-to-end passkey (ERC-1271) sign→verify against a deployed account.** The
  adapter routing is unit-tested (T020/T028) and the envelope shape is exercised by the existing
  on-chain suite for typed data, but no test signs a *personal message* with a real passkey account
  and verifies it against that account's deployed `isValidSignature`. It needs a WebAuthn
  authenticator and a deployed account on a test chain. **Impact**: SC-004 is proven for the wallet
  and recovered-key paths and *assumed* for the passkey path. **Why it is acceptable to ship**: the
  path reuses `passkeyIntentSigner`'s existing, on-chain-tested ceremony with only the digest
  changed (research R5), and a failure would be visible and non-destructive — a proof that does not
  verify, with no funds at risk.
- [ ] T060 **Cypress fast-suite spec for the Verify surface.** Other comparable surfaces carry one.
  The component suite covers the same flows in jsdom, so this is redundancy rather than a coverage
  hole, but it is absent and other features in this repo would have it. **Not written rather than
  written-blind**: the Cypress binary cannot be installed in this environment (the download is
  truncated by the proxy), so a spec added here could not be executed once before merging, and an
  unrun test is a claim rather than a gate.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Ph 1)** → no dependencies
- **Foundational (Ph 2)** → blocks every user story: the record shape and the verdict type are what
  the stories exchange
- **US1 (Ph 3)** → depends on Foundational only. **This is the MVP.**
- **US2 (Ph 4)** → depends on Foundational. Independent of US1, though US1 is how you check its output
- **US3 (Ph 5)** → depends on Foundational; meaningful once either US1 or US2 exists
- **Surface (Ph 6)** → depends on the stories it mounts
- **Polish (Ph 7)** → last

### Within each story

Tests → pure library → component → wiring. The library is testable without React, which is why the
decisions live in `lib/verify/` rather than in the components.

### Parallel opportunities

- T008–T012 (all US1 test files) are independent of each other
- T020–T023 (US2 tests) likewise
- T031–T034 (US3 tests) likewise
- Across stories: US1's library work and US2's signing seam touch different files and can proceed
  simultaneously once Phase 2 lands
- T050–T054 (polish) are four different files

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That alone ships something useful: a member handed a
proof can check it, with no account and on any network. Signing (US2) and frictionless exchange
(US3) are each an independent increment on top.

The order is deliberate: US1 first because it is the task members arrive with, it needs no
connected account, and it is the half that cannot cost anyone anything.
