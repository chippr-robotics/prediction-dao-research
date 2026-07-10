# Tasks: Unified Connect & Account Recovery

**Input**: Design documents from `/specs/045-unified-connect-recovery/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/connect-and-recovery.md

**Tests**: Included — constitution Principle II (test-first) is non-negotiable; every behavior change lands with Vitest coverage.

**Organization**: Grouped by user story from spec.md. US1/US2 are P1 (bug fix + consolidation), US3/US4/US5 are P2, US6 is P3.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Baseline: run `npm run test:frontend` and record the pre-change pass state (no code changes)

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Credential-book and smart-account hardening that US1 and US3 both build on.

- [x] T002 [P] Add `upsertCredential` (merge by credentialId, never drops publicKey) and `isTransactComplete` to frontend/src/lib/passkey/credentials.js with tests in frontend/src/lib/passkey/__tests__/credentials.test.js
- [x] T003 [P] Change `getAssertion` in frontend/src/lib/passkey/credentials.js: pinned → `allowCredentials:[pinned]`; unpinned with known book → `allowCredentials` from all known ids; empty book → discoverable (omit); falsy assertion result throws `CeremonyCancelled`; update frontend/src/lib/passkey/__tests__/credentials.test.js (replaces the "allowCredentials undefined when unpinned" assertion)
- [x] T004 Add `CredentialRecordIncomplete` error, `resolveOwnerIndex({chainId,address,credential,deps})`, credential validation + pinned/null-guarded `getFn` + resolved ownerIndex in `buildAccount` in frontend/src/lib/passkey/smartAccount.js with tests in frontend/src/lib/passkey/__tests__/smartAccount.test.js

**Checkpoint**: lib/passkey primitives are hardened; nothing user-visible yet.

## Phase 3: User Story 1 — Passkey actions always work (P1)

**Goal**: No "reading 'id'" crashes; sign-in/sign-up/restored sessions can all transact; incomplete records fail with plain-language guidance.

**Independent test**: quickstart scenario 3 (sign-in then transfer; corrupted record shows recovery message).

- [x] T005 [US1] Sign-in branch upserts the asserted credential (address refresh, publicKey preserved) and sign-up uses the same upsert in frontend/src/connectors/passkey.js; `isReconnecting` restore refuses sessions without a transact-complete record for `session.credentialId`; tests in frontend/src/connectors/__tests__/passkey.test.js
- [x] T006 [US1] `sendPasskeyBatch` selects the record by `credentialId` param first (address match fallback), validates `isTransactComplete` before any ceremony, resolves ownerIndex via `resolveOwnerIndex`, and passes the pinned credential to `buildAccount` in frontend/src/lib/passkey/sendBatch.js; tests in frontend/src/lib/passkey/__tests__/sendBatch.test.js
- [x] T007 [US1] `sendCalls` passes the passkey session's `credentialId` into `sendPasskeyBatch` in frontend/src/contexts/WalletContext.jsx; tests in frontend/src/contexts/WalletContext.passkey.test.jsx

**Checkpoint**: US1 acceptance scenarios 1–4 pass in Vitest.

## Phase 4: User Story 2 — One connect surface everywhere (P1)

**Goal**: Single ConnectModal from every entry point; Passkey/WalletConnect featured; serialized connects; no restore-vs-manual races.

**Independent test**: quickstart scenario 1.

- [x] T008 [P] [US2] Extract connector availability probing from WalletButton into frontend/src/hooks/useConnectorAvailability.js (injected detection, walletConnect always, passkey capability + network gate) with tests in frontend/src/hooks/__tests__/useConnectorAvailability.test.jsx
- [x] T009 [US2] Create frontend/src/components/wallet/ConnectModal.jsx — accessible dialog, method rows ordered Passkey (Recommended) → WalletConnect → Browser Wallet, honest availability badges, single-flight connect state, "New to Web3 wallets" footer; tests in frontend/src/components/wallet/__tests__/ConnectModal.test.jsx
- [x] T010 [US2] WalletContext: add `openConnectModal`/`closeConnectModal`/`isConnectModalOpen`, render ConnectModal at provider level, serialize `connectWallet` with an in-flight guard (`userInitiated` flag; background restore never overrides), make no-arg `connectWallet()` open the modal instead of defaulting to injected, and defer the mount-time `wc@2:*` cleanup until wagmi reconnect settles in frontend/src/contexts/WalletContext.jsx; tests in frontend/src/contexts/WalletContext.passkey.test.jsx (or a new WalletContext.connect.test.jsx)
- [x] T011 [US2] WalletButton: disconnected state opens ConnectModal (remove the inline dropdown list and the 500ms pendingConnector workaround), keep connected-state account menu in frontend/src/components/wallet/WalletButton.jsx; update frontend/src/components/wallet/__tests__ accordingly
- [x] T012 [P] [US2] WalletPage connect section delegates to `openConnectModal` (remove inline connector list) in frontend/src/pages/WalletPage.jsx
- [x] T013 [P] [US2] Dashboard WelcomeView connect buttons call `openConnectModal` (remove no-arg `connectWallet()` default) in frontend/src/components/Dashboard.jsx; also update frontend/src/pages/StateManagementDemo.jsx no-arg call
- [x] T014 [US2] Remove superseded orphans frontend/src/components/wallet/PasskeySignIn.jsx and frontend/src/components/wallet/PasskeyOnboarding.jsx (their tests move/fold into ConnectModal tests; keep PasskeyConfirm and DeviceLossWarning)

**Checkpoint**: every entry point opens the same modal; connects are serialized.

## Phase 5: User Story 3 — Pick the right passkey (P2)

**Goal**: Multiple known passkeys → in-app account picker; chosen credential pins the session and all its ceremonies (fixes Brave).

**Independent test**: quickstart scenario 4.

- [x] T015 [US3] Passkey connector accepts `connect({ credentialId })` and pins the sign-in assertion to it; session stores the asserted credentialId (not the requested one) in frontend/src/connectors/passkey.js; tests in frontend/src/connectors/__tests__/passkey.test.js
- [x] T016 [US3] ConnectModal passkey path: when ≥2 transact-complete records exist show an account picker (label + short address, stale-entry removal affordance) and pass the chosen credentialId through `connectWallet('fairwinsPasskey', { credentialId })` in frontend/src/components/wallet/ConnectModal.jsx and frontend/src/contexts/WalletContext.jsx; tests in frontend/src/components/wallet/__tests__/ConnectModal.test.jsx

**Checkpoint**: US3 acceptance scenarios pass; ceremonies always match the picked account.

## Phase 6: User Story 4 — First-time passkey explainer (P2)

**Goal**: One-time, dismissible explainer before the first passkey ceremony on a browser.

**Independent test**: quickstart scenario 2.

- [x] T017 [P] [US4] Create frontend/src/lib/passkey/explainer.js (`hasSeenExplainer`, `markExplainerSeen`, key `fairwins.passkey.explainer.v1`, storage failures non-fatal) with tests in frontend/src/lib/passkey/__tests__/explainer.test.js
- [x] T018 [US4] Create frontend/src/components/wallet/PasskeyExplainer.jsx (copy adapted from the former PasskeyOnboarding intro: device-secured self-custodial account, platform sync, add-a-recovery-method) and gate ConnectModal's passkey path on it; tests in frontend/src/components/wallet/__tests__/ConnectModal.test.jsx

## Phase 7: User Story 5 — Link an external wallet as additional owner (P2)

**Goal**: Mount the existing controller management for passkey users; single-controller risk warning with a path to recovery methods.

**Independent test**: quickstart scenario 5.

- [x] T019 [US5] Mount ControllersPanel + DeviceLossWarning in the Account/security area for passkey sessions (locate the Account page/section used by spec 044 layout) — new section in the appropriate page under frontend/src/pages/ or frontend/src/components/account/; integration test in frontend/src/components/account/__tests__/ControllersPanel.test.jsx or a page-level test
- [x] T020 [US5] Verify/complete the link-wallet flow end-to-end (screen-before-link fail-closed, full-control warning copy per FR-011, idempotent already-a-controller refusal) in frontend/src/components/account/ControllersPanel.jsx; extend tests

## Phase 8: User Story 6 — Recover access without FairWins (P3)

**Goal**: Wallet-only recovery adds a new passkey controller via direct EOA contract call; independent runbook.

**Independent test**: quickstart scenario 6.

- [x] T021 [US6] Create frontend/src/components/account/RecoverAccountPanel.jsx — EOA-session flow: account address entry (hints from credential book), on-chain `isOwnerAddress` gate, `createCredential`, `addOwnerPublicKey(x,y)` via the existing ethers signer, receipt-gated lifecycle, `rememberCredential` on success; tests in frontend/src/components/account/__tests__/RecoverAccountPanel.test.jsx
- [x] T022 [US6] Surface recovery entry points: Account area for EOA sessions + a "Lost your passkey?" link on the ConnectModal passkey step in frontend/src/components/wallet/ConnectModal.jsx
- [x] T023 [P] [US6] Write docs/runbooks/passkey-account-recovery.md — app flow plus FairWins-independent path (public ABI, `addOwnerPublicKey` from any wallet tool), last-owner invariant, security cautions

## Phase 9: Polish & Cross-Cutting

- [x] T024 Full `npm run test:frontend` green; fix fallout in suites touching connect surfaces (WalletButton/WalletPage/Dashboard tests)
- [x] T025 [P] Lint (`npm run lint` if configured / eslint on frontend) and accessibility pass on ConnectModal (roles, focus trap, esc-to-close)
- [x] T026 Update specs/041-passkey-wallet-login cross-references if behavior notes changed (sign-in remembering, picker) and quickstart manual verification per specs/045-unified-connect-recovery/quickstart.md

**Notes**: Full `npm run test:frontend` — all suites touched by this feature pass
(127 tests across 16 files); 17 failures in `ClearPathPanel` / `ProposalBuilder` /
`quickAccessPreference` are pre-existing on the base commit (verified identical via
`git stash`) and unrelated to this feature. Manual quickstart scenarios on real
Chrome/Brave authenticators remain for reviewer verification (quickstart.md).

## Dependencies

- Phase 2 (T002–T004) blocks US1 (T005–T007) and US3 (T015–T016)
- US2's T010 (openConnectModal) blocks T011–T013, T016, T018, T022
- US5 (T019–T020) blocks US6 recovery verification end-to-end (linked wallet is the precondition), but T021–T023 can be built in parallel
- Story completion order: US1 → US2 → US3 → US4 → US5 → US6 → Polish

## Parallel Execution Examples

- T002 ∥ T003 (same file — actually sequential; run T002 then T003) — T002/T003 ∥ T004 across files
- After T010: T011, T012, T013 in parallel (different files)
- T017 ∥ T019 ∥ T023 (independent files)

## Implementation Strategy

MVP = Phase 2 + US1 (the crash fix) + US2 (single surface). US3/US4 layer onto
ConnectModal. US5 is mostly mounting existing components. US6 is additive and
ships with the runbook. Each checkpoint leaves the app releasable.
