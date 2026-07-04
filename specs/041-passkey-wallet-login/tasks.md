# Tasks: Passkey Wallet Accounts & Site-Wide Login Management

**Input**: Design documents from `specs/041-passkey-wallet-login/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — all present. **Sequencing status**: specs 035 (intents) + 036 (relayer) are **merged** (PR #800); spec 034's address-based `WagerPool` rework is merged (PR #793). The merged intent rails verify signers with **ECDSA only** — enabling contract-account (ERC-1271) signers is foundational work in THIS feature (T011–T015; analysis finding C1).

**Tests**: INCLUDED — constitution Principle II (test-first) is non-negotiable; every story carries its test tasks.

**Organization**: Grouped by user story (US1–US6 from spec.md) so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6 for story phases; none for Setup/Foundational/Polish

## Phase 1: Setup

**Purpose**: Vendor the account stack and prepare configuration surfaces.

- [x] T001 Vendor the pinned Coinbase Smart Wallet release (account, factory, WebAuthnSol, FCL P-256 fallback verifier, ERC-1271 plumbing — research.md §1, **no source modifications**) into `contracts/account/`, with a provenance header (upstream repo, commit, license) in `contracts/account/README.md`
- [x] T002 Verify the locked `viem`/`wagmi` versions in `frontend/package.json` expose the account-abstraction APIs assumed in research.md §5 (`toWebAuthnAccount`, `toCoinbaseSmartAccount`, `createBundlerClient`) and pin the account-release ↔ EntryPoint version pairing (research.md §2); record corrections in `specs/041-passkey-wallet-login/research.md` §2/§5, bumping the minor version only if required
- [x] T003 [P] Add per-network config for `bundlerUrls[]`, `erc20PaymasterUrl?`, and passkey `capabilities` flags to `frontend/src/config/networks.js`, with matching `VITE_*` vars documented in `frontend/.env.example` (SubmissionRoute entity, data-model.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Compilable, tested, deployed account stack; ERC-1271 enablement of the merged intent rails; the connector/library layer every story consumes.

**⚠️ CRITICAL**: No user story work begins until this phase completes.

- [x] T004 Integrate `contracts/account/` into the Hardhat build (`hardhat.config.js` compiler settings/remappings as needed) so `npm run compile` passes with the vendored stack
- [x] T005 [P] Unit tests in `test/account/wallet.test.js`: owner add/remove via self-call, remove-last-owner reverts, `executeBatch` atomicity (contracts/onchain-deployments.md behavioral surface)
- [x] T006 [P] Unit tests in `test/account/webauthn.test.js`: WebAuthnSol verifies a P-256 WebAuthn assertion via the Solidity fallback path; `isValidSignature` (ERC-1271) accepts WebAuthn-owner signatures and rejects tampered digests
- [x] T007 [P] Unit tests in `test/account/factory.test.js`: CREATE2 determinism — `getAddress(owners, nonce)` equals deployed address, address invariant under later owner changes (FR-023)
- [x] T008 Write `scripts/deploy/deploy-account-stack.js`: deterministic-deployer replay for factory (+ EntryPoint/p256Verifier where absent), **hard assertion that `accountFactory` addresses match across configured networks**, `--verify-7212` gas probe, and `deployments/` recording of `entryPoint`/`accountFactory`/`p256Verifier` (research.md §7, contracts/onchain-deployments.md)
- [x] T009 Extend `scripts/sync-frontend-contracts.js` to carry `entryPoint`, `accountFactory`, `p256Verifier` into the generated frontend artifacts (constitution V — never hardcoded)
- [x] T010 Integration test `test/integration/passkey-account.e2e.test.js` using `test/helpers/proxy.js#deployWagerRegistry` (deploys + wires both registry facets, merged ABI): membership purchase, wager create/accept/claim, and sanctions-guard block all behave identically when `msg.sender` is a smart account — asserting **zero interface changes** to MembershipManager/WagerRegistry/SanctionsGuard
- [x] T011 Extend `contracts/upgradeable/SignerIntentBase.sol` signature verification from ECDSA-only `digest.recover(sig)` to OpenZeppelin `SignatureChecker.isValidSignatureNow(signer, digest, sig)` (ECDSA first, ERC-1271 fallback for contract signers) so passkey smart accounts can be intent signers — logic-only, **no storage changes** (ERC-7201 nonce layout untouched); intent struct typehashes unchanged (three-way byte-identical rule: contracts ↔ `frontend/src/lib/relay/intentTypes.js` ↔ `services/relay-gateway/src/intent/intentTypes.js`) (analysis C1)
- [x] T012 [P] Tests `test/intent/SignerIntentBase.erc1271.test.js`: contract-account signer accepted via ERC-1271, EOA path byte-for-byte unchanged, malicious/invalid `isValidSignature` rejected, replay/nonce/validity-window semantics preserved (extends merged `test/upgradeable/SignerIntentBase.test.js` coverage)
- [x] T013 Ship the ERC-1271 change as in-place upgrades via the `scripts/deploy/upgrade-gasless-intents.js` pattern: both registry facets (`WagerRegistry` + `WagerRegistryIntents`, storage from `WagerRegistryCore`) and `membershipManagerImpl`; publish a new `poolImpl` version so **future** `WagerPool` clones accept ERC-1271 `…WithSig` intents (existing clones are immutable and stay ECDSA-only — documented limitation); run `npm run check:storage-layout` (gating)
- [x] T014 Extend `services/relay-gateway/src/intent/verify.js` with an ERC-1271 fallback (when ECDSA recovery mismatches a claimed signer that has code on the bound chain, `eth_call isValidSignature(digest, sig)` against the signer) + tests in `services/relay-gateway/test/gateway.test.js` covering accept/reject/no-code paths (analysis C1, gateway leg)
- [x] T015 [P] Fork test `test/fork/usdc-erc1271-authorization.test.js`: native USDC on Polygon accepts an EIP-3009 `receiveWithAuthorization` signed by a smart account via ERC-1271 (ERC-7598 path) — verifies the spec's stablecoin assumption (analysis U1)
- [ ] T016 [P] Implement `frontend/src/lib/passkey/credentials.js`: `createCredential` (PRF requested, platform authenticator), `getAssertion`, `detectDuplicate`, capability detection, typed `CeremonyCancelled`/`AuthenticatorUnavailable` errors (contracts/passkey-connector.md)
- [ ] T017 [P] Vitest `frontend/src/lib/passkey/credentials.test.js`: ceremony success/cancel/unavailable branches, duplicate steering, capability matrix (stubbed authenticator)
- [ ] T018 Implement `frontend/src/lib/passkey/smartAccount.js`: `deriveAddress` (must equal on-chain `getAddress`), `buildAction` (executeBatch + fee quote), `ownerAdd`/`ownerRemove`/`walletLink` builders with last-owner and screening guards (contracts/passkey-connector.md)
- [ ] T019 [P] Vitest `frontend/src/lib/passkey/smartAccount.test.js`: address parity vector tests, batch composition, guard refusals
- [ ] T020 Implement `frontend/src/lib/passkey/submission.js`: the routing decision table (intent via `frontend/src/lib/relay/intentClient.js` first, UserOp via ordered bundler list, both-down `SubmissionUnavailable`), bounded-time health detection reusing `frontend/src/lib/relay/errors.js` taxonomy, honest lifecycle states (contracts/submission-and-fees.md)
- [ ] T021 [P] Vitest `frontend/src/lib/passkey/submission.test.js`: all four routing rows, relayer back-pressure fallback, no-silent-retry invariant (mocked `intentClient`/bundler clients)
- [ ] T022 Implement `frontend/src/lib/passkey/prfKeys.js`: `probePrf`, `initMasterSeed`, `unwrapMasterSeed`, `wrapForController`, `revokeController`, `capability` per contracts/key-derivation.md (PRF → HKDF → AEAD wrap; blobs via the spec-032 sync channel; seed memory-only)
- [ ] T023 [P] Vitest `frontend/src/lib/passkey/prfKeys.test.js`: wrap/unwrap round-trip, per-credential KEK isolation, idempotent init, capability degradation, no-silent-wrong-keys invariant
- [ ] T024 Implement the wagmi connector `frontend/src/connectors/passkey.js` (`id: fairwinsPasskey`; connect/reconnect/disconnect/getAccounts/switchChain-with-`ChainNotSupportedError`/EIP-1193 facade per contracts/passkey-connector.md) and register it in `frontend/src/wagmi.js` beside `injected`/`walletConnect`
- [ ] T025 [P] Vitest `frontend/src/connectors/passkey.test.js`: fresh connect vs silent reconnect, disconnect clears session rows, unsupported-chain refusal, provider request routing
- [ ] T026 Extend `frontend/src/contexts/WalletContext.jsx`: viem-first `sendCalls` abstraction for smart accounts (ethers `BrowserProvider` path untouched for EOA connectors), `loginMethod`, `accountCapabilities.encryption` — all existing WalletContext Vitest suites must pass unchanged (SC-004 pre-gate)
- [ ] T027 Run Slither over `contracts/account/` + the `SignerIntentBase.sol` change and record accepted/inherited findings with rationale in `specs/041-passkey-wallet-login/security-notes.md`; complete the `.github/agents/smart-contract-security.agent.md` review checklist for the vendored stack, the ERC-1271 change, and the deploy/upgrade scripts (constitution I)

**Checkpoint**: `npm run compile`, `npm test` (incl. T012/T015), `npm run test:frontend`, `npm run check:storage-layout` green; relay-gateway suite green; live deploy + `--verify-7212` probe pass (quickstart.md §2) — story phases may now proceed.

---

## Phase 3: User Story 1 — From nothing to wagering with only a passkey (Priority: P1) 🎯 MVP

**Goal**: Clean-profile visitor → passkey account → funded → membership → wager round-trip; one ceremony per action, no seed phrase, no native token.

**Independent Test**: quickstart.md §4 row 1 + §5.1 (Cypress virtual-authenticator journey; SC-001/SC-002 assertions).

- [ ] T028 [US1] Add "Continue with passkey" to `frontend/src/components/wallet/WalletButton.jsx`, gated by connector capability detection (hidden/disabled-with-reason when unavailable — FR-001/FR-004), with vendor-neutral label support in `frontend/src/utils/walletLabel.js`
- [ ] T029 [US1] Implement `frontend/src/components/wallet/PasskeyOnboarding.jsx`: sign-up ceremony, address reveal in connected state, funding view reusing the spec-011 address+QR component for the counterfactual (never-transacted) account (FR-005/FR-007)
- [ ] T030 [US1] Implement `frontend/src/lib/passkey/intentSigner.js` **on top of the merged relay stack**: import EIP-712 types from `frontend/src/lib/relay/intentTypes.js` (never redefine — three-way byte-identical rule), produce the account's ERC-1271 signature envelope from a WebAuthn assertion, and submit/track via `frontend/src/lib/relay/intentClient.js` / `useIntentAction.js` (`IntentStatus.jsx` reused for status display) (contracts/submission-and-fees.md routing row 1; requires T011/T014)
- [ ] T031 [US1] Build the transaction-ceremony confirmation UI in `frontend/src/components/wallet/PasskeyConfirm.jsx`: action/amount/counterparty/fee disclosure in stablecoin terms, pre-flight `InsufficientFeeBalance` with exact shortfall, clarification-Q3 fallback options when the stablecoin fee path is down (FR-008/FR-014)
- [ ] T032 [US1] Wire first-action account deployment: include factory `initCode` in the first UserOp (or relayer-path equivalent) so activation is invisible inside the first paid action (FR-007, `frontend/src/lib/passkey/smartAccount.js` + `submission.js`)
- [ ] T033 [US1] Adapt `frontend/src/hooks/usePurchaseFlow.js` for passkey accounts: approve+pay collapsed via `executeBatch` (or membership intent) into one ceremony (FR-016), "sign" step sources key material from `prfKeys.js` master seed instead of `signMessage`, explicit encrypted-features-unavailable branch for non-PRF authenticators (FR-012, clarification Q1)
- [ ] T034 [P] [US1] Vitest for onboarding + confirmation + purchase-flow adaptation in `frontend/src/components/wallet/PasskeyOnboarding.test.jsx` and `frontend/src/hooks/usePurchaseFlow.test.js` (cancel mid-ceremony = clean abort; degradation branch)
- [ ] T035 [US1] Cypress e2e `frontend/cypress/e2e/passkey/onboarding-journey.cy.js` with the CDP virtual authenticator: full sign-up→fund→membership→create→accept→claim journey asserting SC-001 (≤60 s / ≤3 interactions to fundable), SC-002 (one prompt per action, zero native token), and no seed-phrase text anywhere in the DOM

**Checkpoint**: US1 journey passes end-to-end on the local stack — MVP demonstrable.

---

## Phase 4: User Story 2 — One site-wide login surface for every account type (Priority: P1)

**Goal**: One connect surface; identical downstream behavior, gating, and session semantics for passkey and classic wallets; zero regression for existing users.

**Independent Test**: quickstart.md §4 rows 2–3; existing wallet suites pass unchanged (SC-004).

- [ ] T036 [US2] Audit and remove EOA assumptions across feature code: every identity/gating read uses `address` from `useWallet()` (never connector type or `signer` presence); guard the remaining ethers-signer call sites in `frontend/src/utils/blockchainService.js` behind the WalletContext signing abstraction (FR-002)
- [ ] T037 [US2] Implement passkey session persistence + sign-out in `frontend/src/contexts/WalletContext.jsx` + connector storage: silent reconnect on reload, no self-expiry (clarification Q4), sign-out atomically clears session/account/cached-role state (FR-003)
- [ ] T038 [US2] Implement clean identity switching between passkey and classic wallet in `frontend/src/contexts/WalletContext.jsx`: full LoginSession swap, no balance/role/history bleed (FR-024)
- [ ] T039 [P] [US2] Vitest `frontend/src/contexts/WalletContext.passkey.test.jsx`: persistence, sign-out clearing, switch-identity isolation, role-gating parity with a mocked smart-account address
- [ ] T040 [US2] Cypress e2e `frontend/cypress/e2e/passkey/unified-login.cy.js`: same gates/balances/roles resolve for both account types across wagers/pools/membership/account pages; reload persists; sign-out clears — plus a CI assertion that all pre-existing wallet/connect Cypress specs run unchanged (SC-003/SC-004)

**Checkpoint**: Both P1 stories complete — site-wide login manager is shippable.

---

## Phase 5: User Story 3 — Returning user signs back in, on any device (Priority: P2)

**Goal**: Same account (address, funds, roles, history) on return visits, synced devices, and cross-device authentication.

**Independent Test**: quickstart.md §4 row 3 + §5.3.

- [ ] T041 [US3] Implement returning sign-in in `frontend/src/lib/passkey/credentials.js` + `connectors/passkey.js`: credential discovery, platform picker for multiple site credentials (never guess — edge case), credential→address resolution surviving cleared browser data (re-derive via on-chain owner lookup with local mapping as cache)
- [ ] T042 [US3] Handle synced-passkey and cross-device (hybrid transport) sign-in in `frontend/src/components/wallet/PasskeySignIn.jsx`, reaching the identical account with full state (FR-009)
- [ ] T043 [P] [US3] Vitest `frontend/src/lib/passkey/signin.test.js`: multi-credential picker, cleared-storage recovery of the address mapping, wrong-credential error paths
- [ ] T044 [US3] Cypress e2e `frontend/cypress/e2e/passkey/returning-user.cy.js`: reload/sign-in ≤10 s and one prompt (SC-005); second virtual authenticator simulating a synced device reaches the same address/balances/roles

---

## Phase 6: User Story 4 — Managing the account: devices, names, linked wallet (Priority: P2)

**Goal**: Controllers panel — view/rename, add passkey, link wallet, remove controller — all on-chain enforced.

**Independent Test**: quickstart.md §4 row 4.

- [ ] T045 [US4] Implement `frontend/src/hooks/usePasskeyAccount.js`: controllers state (on-chain owners ∪ local credential metadata), activation state per network, capability + degradation flags (data-model AccountController)
- [ ] T046 [US4] Implement `frontend/src/components/account/ControllersPanel.jsx`: controllers list with kind/label/addedAt/screening status, account nickname (local AccountProfile), address + QR reuse (FR-018)
- [ ] T047 [US4] Implement add-passkey flow (new credential ceremony → `ownerAdd` via UserOp → `wrapForController` PRF blob) and link-wallet flow (screening gate refusing flagged addresses per clarification Q2 → `ownerAdd` → optional legacy signature-derived wrap) in `frontend/src/components/account/ControllersPanel.jsx` + `lib/passkey/smartAccount.js` (FR-019)
- [ ] T048 [US4] Implement remove-controller flow: on-chain `ownerRemove` + `revokeController` blob deletion, last-controller removal refused in UI and asserted reverting on-chain (FR-020)
- [ ] T049 [P] [US4] Vitest `frontend/src/components/account/ControllersPanel.test.jsx` + `frontend/src/hooks/usePasskeyAccount.test.js`: add/link/remove state machines, screening refusal, last-owner guard
- [ ] T050 [US4] Cypress e2e `frontend/cypress/e2e/passkey/controllers.cy.js`: add second credential (both sign successfully), remove first (on-chain assert it can no longer sign), link wallet operates account, last-owner removal refused

---

## Phase 7: User Story 5 — Losing a device is not losing the money (Priority: P2)

**Goal**: Non-custodial recovery via synced passkey / second controller; mandated warnings for single-credential accounts.

**Independent Test**: quickstart.md §4 row 5.

- [ ] T051 [US5] Implement device-loss warnings in `frontend/src/components/wallet/DeviceLossWarning.jsx`, injected at the three FR-021 moments (account creation, first funding, membership purchase), with dismissal tracking in AccountProfile that re-arms until a second controller exists
- [ ] T052 [US5] Verify and document the three recovery paths (synced passkey, second passkey, linked wallet) in `docs/user-guide/passkey-recovery.md`, confirming no step involves FairWins or third-party fund control (FR-021)
- [ ] T053 [US5] Cypress e2e `frontend/cypress/e2e/passkey/recovery.cy.js`: simulate device loss for scenarios (a) synced credential, (b) second passkey, (c) linked wallet — all recover full control unaided; (d) single-credential path saw all three warnings (SC-007)

---

## Phase 8: User Story 6 — Compliance and gating apply unchanged (Priority: P3)

**Goal**: Screening/gating parity for passkey accounts, including the linked-controller screening decision.

**Independent Test**: quickstart.md §4 row 6.

- [ ] T054 [US6] Extend `frontend/src/hooks/useAddressScreening.js` + `frontend/src/utils/sanctionsScreen.js`: screen linked controller addresses at link time and alongside periodic account screening; flagged controller ⇒ account treated as flagged for gated actions (clarification Q2; on-chain guards remain authoritative). Confirm the relay-gateway signer-screening (`services/relay-gateway/src/policy/sanctions.js`) needs no change (signer = account address)
- [ ] T055 [US6] Cypress e2e `frontend/cypress/e2e/passkey/compliance.cy.js`: entry gate, flagged-account block, flagged-controller propagation, membership-gated refusal — outcomes identical to the classic-wallet compliance matrix (SC-008)

---

## Phase 9: Polish & Cross-Cutting

- [ ] T056 [P] Write `docs/developer-guide/passkey-accounts.md`: architecture (connector, routing table, PRF pipeline), ERC-1271 intent signing (cross-reference `docs/developer-guide/gasless-intents.md`), deployment keys, ETC/Mordor increment posture, and the two Complexity Tracking exceptions
- [ ] T057 [P] Extend `docs/runbooks/relayer-operations.md` with the colocated alto bundler deployed alongside `services/relay-gateway` + `services/oz-relayer`: endpoints, edge perimeter, health checks, per-network config (ops-config only; no gateway/engine code changes beyond T014)
- [ ] T058 Wire CI: `test/account/` + `test/intent/SignerIntentBase.erc1271.test.js` + integration suite into the contract test job, T015 into the fork-test job, passkey Cypress specs into the fast-e2e job, axe/Lighthouse over the login + account-management surfaces — all gating, no `continue-on-error` (constitution IV/V)
- [ ] T059 Fee benchmark script `scripts/ops/passkey-fee-benchmark.js`: same action EOA vs passkey UserOp path on the live test network, asserting SC-006 (≤2×); record results in `specs/041-passkey-wallet-login/security-notes.md`
- [ ] T060 Execute the quickstart.md §5 live-network checklist (real device, relayed-intent membership purchase, cross-device sign-in) and record outcomes in `specs/041-passkey-wallet-login/quickstart.md` amendments
- [ ] T061 Final constitution re-check + SC-009 review: confirm no FairWins service beyond the relay-gateway-colocated bundler shipped; update `specs/041-passkey-wallet-login/plan.md` Complexity Tracking if anything drifted

---

## Dependencies

```text
Setup (T001–T003)
  → Foundational (T004–T027)
      # T005–T007 ∥ after T004; T011→T012→T013 serial (change → tests → upgrade ship); T014 ∥ T011-chain;
      # T015 ∥ anytime post-T004; T016–T025 as parallel pairs (distinct files); T026 after T024; T027 after T001+T011
    → US1 (T028–T035) 🎯 MVP    # T030 requires T011 (contract) + T014 (gateway); T033 requires T022 (prfKeys)
    → US2 (T036–T040)           # independent of US1 tasks, but ships with US1 for a coherent P1 release
      → US3 (T041–T044)         # builds on connector reconnect (T024) + session work (T037)
      → US4 (T045–T050)         # builds on smartAccount owner ops (T018) + prfKeys wrap (T022)
        → US5 (T051–T053)       # rides US4 controller mechanics
      → US6 (T054–T055)         # independent of US3–US5; needs only foundation + US2 gating audit
    → Polish (T056–T061)        # after all shipped stories
```

## Parallel Execution Examples

- **Foundational**: after T004 → T005, T006, T007, T015 in parallel; the ERC-1271 chain (T011→T012→T013) runs parallel to the gateway leg (T014) and to the frontend pairs T016+T017, T018+T019, T020+T021, T022+T023 (distinct files); T008→T009 serial (deploy before sync).
- **US1**: T028, T029, T030, T031 in parallel (distinct components/libs) → T032, T033 → T034 ∥ T035.
- **Post-P1**: US3, US4, and US6 phases can run as three parallel workstreams; US5 starts when US4's T047/T048 land.

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + US1** (a no-wallet user demonstrably onboards and wagers with only a passkey). Ship P1 as one release (US1+US2) since the unified surface is the user-visible wrapper. Then increment: US3 (return visits) → US4/US5 (controllers + recovery — required before promoting passkey accounts for meaningful balances, per spec Story 5 rationale) → US6 (compliance matrix) → Polish.

Notes carried from analysis: the ERC-1271 enablement (T011–T015) is the critical path for the intent-first architecture — without it every passkey action degrades to the UserOp fallback. Existing immutable `WagerPool` clones remain ECDSA-only for `…WithSig` twins (new `poolImpl` covers future pools; passkey users can still join/act on old pools via direct transactions from their account). ETC/Mordor passkey support remains a later increment (spec FR-022) — the deploy script and WebAuthnSol fallback already leave the door open.
