# Tasks: Protect Multi-Chain Vaults & Advanced Policy Engine

**Input**: Design documents from `/specs/068-protect-multi-chain-policies/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/SafePolicyGuardV2.md,
contracts/frontend-integration.md, quickstart.md

**Tests**: INCLUDED — constitution principle II (test-first) is non-negotiable for this repo, and
this feature touches fund custody (highest-risk surface, principle I).

**Organization**: Grouped by user story. US6 (nav move) already shipped with the spec commit
(FR-024) — only its regression test remains.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 multi-chain · US2 ordered rules · US3 approved contracts · US4 reorder ·
  US5 owners entry · US6 nav

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: test harness + config plumbing every story builds on

- [ ] T001 Extend `contracts/mocks/MockSafe.sol` with the Safe v1.4.1 surface `SafePolicyGuardV2` reads: `approvedHashes(address,bytes32)`, `isOwner(address)`, `nonce()`, `getTransactionHash(...10 args)` (hash matching `vaultTransaction.js#computeSafeTxHash`), plus helpers to set owners/approvals in tests; keep `execTransactionMock` ordering (checkTransaction → CALL → checkAfterExecution)
- [ ] T002 [P] Add ETC mainnet to custody: `61: SAFE_V1_4_1` in `frontend/src/config/safeContracts.js` (updates `CUSTODY_SUPPORTED_CHAIN_IDS`); update the stale comment
- [ ] T003 [P] Fix the shipped proposal-discovery gap: add `safeProposalHub` entries to `DEPLOYMENT_BLOCKS_BY_CHAIN` in `frontend/src/config/contracts.js` for every chain that has the hub (137 block 90120743; extend as hub deploys land), and add a regression test in `frontend/src/test/custody/` asserting `getDeploymentBlockForChain('safeProposalHub', 137) > 0`

**Checkpoint**: harness + config ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the V2 engine contract and its client library core — US2/US3/US4 all sit on these

**⚠️ CRITICAL**: complete before any user-story phase that touches policy

- [ ] T004 Write the unit test skeleton FIRST: `test/custody/SafePolicyGuardV2.test.js` covering (per contracts/SafePolicyGuardV2.md): config bounds + typed errors; zero-regression (no rules ⇒ pass); hard denials; exemptions (`to == safe`, guard self-call, `ValueToGuardBlocked`); matching (asset scopes incl. mixed-leg ⇒ ANY only, banding, targets, first-match, `NoRuleMatches`); same-scope alternative fall-through (a+b/c); approver verification (approvedHashes, executor-implicit, `approvalsRequired` K-of-N, removed-owner ⇒ fail, FR-010); per-rule window accounting + reset on `setRules`; cooldown; lockout-proofing under a deny-all rule set; `matchTransaction`/`previewTransaction` parity (incl. `bytes32(0)` scope-only mode)
- [ ] T005 Implement `contracts/custody/SafePolicyGuardV2.sol` — storage (`Rule[]`, `RuleAccounting`, `VaultMeta`, MAX_RULES 16 / MAX_APPROVERS 8 / MAX_TARGETS 16, `ANY_ASSET = address(1)`), `setRules` full replacement (validation, accounting clear, `RulesSet` + per-rule `RuleConfigured` events), ERC-165/guard interface; reuse v1's `_classify` calldata logic verbatim
- [ ] T006 Implement enforcement in `contracts/custody/SafePolicyGuardV2.sol`: `checkTransaction` evaluation order (exemptions → no-rules pass → hard denials → classify → match with banding/targets → govern with same-scope alternative fall-through → cooldown → approver verification via `getTransactionHash(nonce()-1)` + `approvedHashes`/executor + `isOwner` → limits → commit accounting), `checkAfterExecution` no-op, all typed errors, read views (`getRules`, `getRuleAccounting`, `matchTransaction`, `previewTransaction`)
- [ ] T007 Make T004 green; run `npm run compile && npx hardhat test test/custody/SafePolicyGuardV2.test.js` and the untouched v1 suites (`SafePolicyGuard.test.js`, `PolicyGuardSetup.test.js`) to prove zero regression
- [ ] T008 [P] Create `scripts/deploy/custody/deploy-policy-guard-v2.js` (pattern: `deploy-policy-guard.js`; CREATE2 salt `SALT_PREFIXES.V2 + 'SafePolicyGuardV2'`; targets hardhat/mordor/etc/polygon; records `safePolicyGuardV2` + deploy block; runs sync); extend `scripts/deploy/custody/deploy-safe-proposal-hub.js` TARGETS with 63 + 61
- [ ] T009 [P] Create `frontend/src/lib/custody/policyV2.js` core: `getPolicyEngineV2Addresses`, `isPolicyV2Supported`, extended `getPolicyStatus` (adds `'managed-v2'`, comparing the guard slot against BOTH singletons), `readPolicyV2`, `encodeSetRules`, `buildRulesChangeTx`, `buildAdoptV2Txs`, `decodePolicyErrorV2`, `classifyPolicyProposalV2`, `fromV1Policy` — with unit tests in `frontend/src/test/custody/policyV2.test.js` (encode/decode round-trip against the contract ABI, status routing per chain 1337/63/1, v1→V2 lossless mapping)
- [ ] T010 [P] Add `validateRulesConfig`, `analyzeShadowing`, `matchPreview` (client twin of matching incl. banding + same-scope fall-through), `describeRulesV2` to `frontend/src/lib/custody/policyV2.js`, tested in `frontend/src/test/custody/policyV2.test.js` (shadow detection, preview parity with the contract test vectors, member-language descriptions)
- [ ] T011 Deploy V2 locally: add `safePolicyGuardV2` to `deployments/hardhat-chain1337-v2.json` + `frontend/src/config/contracts.js` HARDHAT record (via T008 script against a local node, then `sync:frontend-contracts`), so frontend tests use chain 1337 as the fully-wired convention

**Checkpoint**: engine enforceable + readable; user stories can proceed (US1 needs none of Phase 2 except T003 and can start after Phase 1)

---

## Phase 3: User Story 1 — Deploy and manage vaults across supported chains (Priority: P1) 🎯 MVP

**Goal**: every vault carries visible chain identity; cross-chain list; wrong-chain actions impossible

**Independent test**: vault refs on chains A+B ⇒ both listed with chain labels from either
network; off-chain vault read-only with switch prompt; switching enables actions (quickstart § 4)

- [ ] T012 [US1] Write failing tests first in `frontend/src/test/custody/useCustodyVaults.multichain.test.jsx`: no chain filter (refs on 63 + 137 both returned while connected to 137), per-vault failure isolation (`reachable:false` row, list intact), `chainName` strict lookup (unknown id renders numeric), `onVaultChain` flag
- [ ] T013 [US1] Rework `frontend/src/hooks/useCustodyVaults.js`: drop the `r.chainId === Number(chainId)` filter, enrich all refs in parallel via `getProvider(ref.chainId)` with per-vault try/catch, add `chainName`/`onVaultChain`/`reachable` to returned vaults; keep create/preview/load on the connected chain. Align `frontend/src/data/notifications/sources/custodySource.js` with the same cross-chain model (drop its per-chain filter so custody notifications cover all saved vaults — FR-002 consistency across surfaces); update `frontend/src/test/sources/custodySource.test.js`
- [ ] T014 [P] [US1] Chain badge in `frontend/src/components/custody/VaultList.jsx` (chain name + testnet marker per row, honest unreachable row) + styles in `Custody.css`; update `frontend/src/test/custody/VaultList.test.jsx` (badge rendering, axe)
- [ ] T015 [P] [US1] `frontend/src/components/custody/VaultDetail.jsx`: Network row shows chain name + id (strict lookup, replaces raw number); when `!onVaultChain` render read-only — hide/disable Operate-as + policy propose and show the switch-network prompt (generalize the `VaultProposalsPanel` pattern); update `frontend/src/test/custody/VaultDetail.test.jsx`
- [ ] T016 [US1] `frontend/src/components/custody/CustodyPanel.jsx`: always render the cross-chain vault list (even when the connected chain is unsupported — FR-005 lists stay visible); gate only creation/load per connected chain, naming the other custody chains with a switch affordance; update `frontend/src/test/custody/CustodyPanel.test.jsx` (unsupported-network state still lists saved vaults, axe)
- [ ] T017 [US1] `frontend/src/components/custody/CreateVaultWizard.jsx`: explicit "This vault will be deployed on {chain name}" statement (FR-001); update `frontend/src/test/custody/CreateVaultWizard.test.jsx`
- [ ] T018 [US1] Mid-flow chain-switch guard: in `frontend/src/components/custody/VaultProposalsPanel.jsx` + `ProposeTransactionForm.jsx`, verify wallet chain equals vault chain at submit time and fail with an error naming both chains (spec edge case); test in the respective suites

**Checkpoint**: US1 independently deliverable (multi-chain visibility + safety) — no Phase 2 dependency beyond T003

---

## Phase 4: User Story 2 — Configure ordered approver and limit rules (Priority: P1)

**Goal**: compose/attach/edit numbered rules; enforcement matches the spec's a+b/c, tiered, and
token-limit scenarios end-to-end

**Independent test**: quickstart § 1 integration walk (two-rule policy on a real Safe: A+B ok, C
ok, A alone blocked, over-limit blocked) + § 3 UI walk

- [ ] T019 [US2] Write `test/integration/policy-guard-v2-safe.test.js` against real Safe v1.4.1 (pattern: `policy-guard-safe.test.js`, 2-of-3 vault): US2 acceptance walk (rules 001 A+B ≤ L / 002 C ≤ L — all four outcomes), tiered banding (X/Y boundary tx), token-specific limit, `NoRuleMatches` denial, adopt-from-none two-step (`setRules` then `setGuard`), upgrade-from-v1 (v1 vault → V2 rules → v1 state inert), FR-010 removed-owner block, FR-021 loosening change always executable
- [ ] T020 [US2] Build `frontend/src/components/custody/RuleList.jsx` (display mode only in this story): numbered rows (`001…` zero-padded), per-rule plain-language line via `describeRulesV2`, window consumption, shadow warnings from `analyzeShadowing`, **broken-rule flag** when a rule's approver is no longer a vault owner (cross-check against live `vault.owners` — FR-010 read-view requirement), legacy-v1 variant (unnumbered, visually distinct — FR-020); tests + axe in `frontend/src/test/custody/RuleList.test.jsx`
- [ ] T021 [US2] Build `frontend/src/components/custody/RuleComposer.jsx`: per-kind editors (approver-set with owner-only picker + K-of-N "any of" toggle; tiered wizard emitting banded rule pairs; token limit with address+decimals; destination entry — catalog picker lands in US3), emits rules validated by `validateRulesConfig`; deny-all (empty rules) requires explicit confirmation; tests + axe in `frontend/src/test/custody/RuleComposer.test.jsx`
- [ ] T022 [US2] Build `frontend/src/components/custody/PolicyPanelV2.jsx`: status routing (`managed-v2` read/edit; `none` attach; `managed` v1 → read-only legacy + "Upgrade to ordered rules" pre-populated via `fromV1Policy`), staged before/after diff incl. order (FR-018), propose via `buildRulesChangeTx`/`buildAdoptV2Txs` (consecutive nonces), FR-019 single-pending-change block by inspecting queue for guard/`setGuard` targets with explanation; tests in `frontend/src/test/custody/PolicyPanelV2.test.jsx` + `PolicyPanelV2.change.test.jsx` (axe both)
- [ ] T023 [US2] Route `PolicyPanelV2` from `frontend/src/components/custody/CustodyPanel.jsx`/`VaultDetail.jsx` by policy status; extend `frontend/src/components/custody/PolicyBadge.jsx` with a `managed-v2` presentation; update `PolicyBadge.test.jsx`
- [ ] T024 [US2] Extend `frontend/src/components/custody/ProposeTransactionForm.jsx` violation preview to V2: debounced `matchPreview` + `previewTransaction(bytes32(0))`, warning names the display rule number or "no rule allows this" (SC-003); preview copy MUST disclose it checks scope/limits only ("approvals are verified at execution") since `bytes32(0)` mode skips approver evaluation; update `frontend/src/test/custody/ProposeTransactionForm.test.jsx`
- [ ] T025 [US2] Extend `frontend/src/components/custody/ProposalQueue.jsx` decode with `classifyPolicyProposalV2` (setRules diffs render rule-numbered lines; `setGuard(guardV2)` labeled as upgrade/adopt); update `frontend/src/test/custody/ProposalQueue.test.jsx`
- [ ] T026 [US2] Wire the create-flow Policy step to V2 ONLY: `frontend/src/components/custody/PolicyStep.jsx` emits a V2 rules config (`policyGuardSetup.enablePolicy(guardV2, encodeSetRules(...))`) when `isPolicyV2Supported(chainId)`, and skips the step with an honest notice where V2 is undeployed — no v1 path for NEW vaults (v1 stays read/upgrade-only per FR-020; avoids a dead dual branch once T040 deploys V2 everywhere); update `PolicyStep.test.jsx` and `CreateVaultWizard.test.jsx` (setup calldata decodes to V2 guard + setRules)

**Checkpoint**: full ordered-policy lifecycle usable and enforced on-chain

---

## Phase 5: User Story 3 — Approve platform-supported contracts/services (Priority: P2)

**Goal**: curated per-chain service picker + manual addresses in destination sets

**Independent test**: rule allowing only the swap venue ⇒ approved call to venue executes,
unlisted contract blocked with rule named (quickstart § 1/§ 3)

- [ ] T027 [P] [US3] Create `frontend/src/config/serviceCatalog.js`: `getServiceCatalog(chainId)` from `NETWORKS[chainId].dex` + `dexProvider` name (Uniswap 137 / ETCswap 61·63), `config/staking.js` where applicable, platform contracts via `getContractAddressForChain`; strict lookups, empty on non-custody chains; unit tests in `frontend/src/test/custody/serviceCatalog.test.js` (per-chain entries, no fallback leakage)
- [ ] T028 [US3] Service picker in `frontend/src/components/custody/RuleComposer.jsx`: catalog entries for the vault's chain (name + addresses), manual address entry with the "not platform-vetted" warning (FR-023); extend `RuleComposer.test.jsx` (picker lists per-chain services only, manual warning, axe)
- [ ] T029 [US3] Add approved-contracts coverage to `test/integration/policy-guard-v2-safe.test.js`: targets-only rule admits an approved contract call and blocks an unlisted one; value-carrying approved call still bounded by the same rule's limits (FR-013)

**Checkpoint**: service allowlists composable from the catalog

---

## Phase 6: User Story 4 — Reorder the policy list easily (Priority: P2)

**Goal**: drag + keyboard reorder, staged and threshold-approved, renumbering live

**Independent test**: two-rule swap → before/after diff → approve → boundary tx governed by the
new order (quickstart § 3, SC-005)

- [ ] T030 [US4] Add reorder to `frontend/src/components/custody/RuleList.jsx`: native HTML5 drag (`draggable`, `dragIndex`, `onDragOver` preventDefault, `.dragging`) + always-present keyboard ↑/↓ buttons (`aria-label="Move rule N up/down"`, disabled at ends), immediate renumbering, `onReorder(nextOrder)` staging (PoolParticipants pattern); tests drive the buttons in `RuleList.test.jsx` (+ axe)
- [ ] T031 [US4] Reorder staging in `frontend/src/components/custody/PolicyPanelV2.jsx`: staged order renders old vs new side-by-side with a plain-language note on which rules exchange precedence (FR-018), proposes one `setRules`; window-restart disclosure ("changing rules restarts 24-hour windows"); extend `PolicyPanelV2.change.test.jsx`
- [ ] T032 [US4] Add reorder coverage to `test/integration/policy-guard-v2-safe.test.js`: swap two banded/same-scope rules via threshold-approved `setRules`, prove the governing rule for a boundary transaction changes (US4 acceptance 3)

**Checkpoint**: ordering fully member-manageable

---

## Phase 7: User Story 5 — Owners entry with QR and address book (Priority: P2)

**Goal**: every custody address input uses the platform triad (paste / QR / book)

**Independent test**: add owners by book pick, QR scan, and paste in the wizard; all validate,
book names shown, owners land in the deployed set (US5 acceptance)

- [ ] T033 [US5] Create `frontend/src/components/custody/CustodyAddressField.jsx` per contracts/frontend-integration.md (`AddressInput` + `AddressBookButton` + QR via `QRScanner`/`extractAddressFromScan`; string `onChange`; `chainId` threaded; CpAddressField pattern) + styles; tests + axe in `frontend/src/test/custody/CustodyAddressField.test.jsx` (paste validation, book pick fills value, scan path mocked, camera-denied degradation)
- [ ] T034 [US5] Adopt in `frontend/src/components/custody/CreateVaultWizard.jsx` (owner rows) and `OwnersThresholdPanel.jsx` (new-owner input); book names shown beside known owners in `VaultDetail.jsx` owners list via `useAddressBook().findByAddress` (FR-007); update the three suites
- [ ] T035 [P] [US5] Adopt in `frontend/src/components/custody/LoadVaultForm.jsx` (vault address) and `ProposeTransactionForm.jsx` (recipient + token address) and RuleComposer destination entry; update suites

**Checkpoint**: no raw address inputs left in Protect

---

## Phase 8: User Story 6 — Protect lives in the Tools section (Priority: P3)

**Goal**: already shipped (FR-024, spec commit); pin it with a regression test

- [ ] T036 [P] [US6] Add `frontend/src/config/__tests__/appNav.test.js`: Protect (`custody`) is in the Tools group and absent from Finance (`groupForTab('custody').label === 'Tools'`), `pathForNavItem('custody') === '/wallet?tab=custody'`, and `TAB_ALIASES`-based deep links unchanged (US6 acceptance 1–3; `groupForTab` is what SectionIconNav derives the mobile bottom-bar siblings from, so the config-level assertion covers acceptance 2)

---

## Phase 9: Polish & Cross-Cutting

- [ ] T037 Add `contracts/custody/SafePolicyGuardV2.sol` to `coverage-threshold-policy.json` (tier per custody convention) and confirm `npm run test:coverage` gates it
- [ ] T038 [P] Static analysis + fuzz: Slither clean of new high/critical on `SafePolicyGuardV2.sol`; Medusa stateful properties (first-match determinism, window accounting never exceeds limit per rule per window span, no-rules ⇒ never reverts); record accepted-risk notes in the contract header (constitution I)
- [ ] T039 [P] Security review against `.github/agents/smart-contract-security.agent.md` for `SafePolicyGuardV2.sol` (custody path); log outcome in the PR
- [ ] T040 Deploy to live networks in launch order (Mordor 63 → ETC 61 → Polygon 137): run T008 scripts + `sync:frontend-contracts` per network; verify `deployments/*-v2.json` records and `DEPLOYMENT_BLOCKS_BY_CHAIN.safeProposalHub` completeness (floppy keystore flow for deployer keys). Chain 61 has NO record in `NETWORK_CONTRACTS` today — verify the sync script can mint a brand-new chain-61 record (extend `scripts/` sync tooling if it only updates existing records) and add a config test asserting `getContractAddressForChain('safePolicyGuardV2', 61)` resolves after sync
- [ ] T041 [P] Write `docs/developer-guide/protect-policies.md` (V2 rule model incl. `approvalsRequired`/banding/same-scope alternative in member + developer language, migration from v1, multi-chain behavior, service catalog) and update `CLAUDE.md` guardrails with a spec-068 bullet (two live guard versions; custody address entry; catalog)
- [ ] T042 Full-suite gate: `npm test`, `npm run test:frontend`, `npx vitest run` custody suites, quickstart § 3 local E2E walk; confirm SC-001…SC-007 spot-checks from quickstart § Success criteria

---

## Dependencies

```text
Phase 1 (T001–T003)
  ├─→ Phase 3 US1 (needs only T003; independent of the engine)          🎯 MVP
  └─→ Phase 2 (T004–T011, engine)
        └─→ Phase 4 US2 ─→ Phase 5 US3 ─→ (US3 optional for) Phase 6 US4
Phase 7 US5: independent of Phase 2 (only Phase 1); T035's RuleComposer part follows T021
Phase 8 US6: fully independent
Phase 9: after all story phases (T040 after T008; T037–T039 after T007)
```

Story-level: US1 ⊥ US2 (parallel after Phase 1/2 split); US3 and US4 extend US2's components;
US5 ⊥ everything except the RuleComposer touchpoint; US6 ⊥ all.

## Parallel Execution Examples

- After Phase 1: `T004` (contract tests) ∥ `T012` (US1 hook tests) ∥ `T033` (US5 field) ∥ `T036` (US6 test)
- Within Phase 2: `T008` ∥ `T009` ∥ `T010` once T005–T006 compile
- Within US1: `T014` ∥ `T015` after T013
- Within US3: `T027` ∥ (T028 waits on T027)

## Implementation Strategy

**MVP = Phase 1 + Phase 3 (US1)**: multi-chain visibility + wrong-chain safety ships without any
new contract — immediately valuable, zero custody risk. Then Phase 2 + Phase 4 (US2) delivers the
engine (the feature's core), followed by US3 → US4 → US5 as independent increments; US6 is a
one-test phase. Each checkpoint leaves the app releasable: legacy v1 vaults are untouched
throughout, and V2 surfaces appear only on chains where `safePolicyGuardV2` is deployed.
