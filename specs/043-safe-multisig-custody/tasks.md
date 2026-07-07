---

description: "Task list for Safe Multisig Custody (043)"
---

# Tasks: Safe Multisig Custody

**Input**: Design documents from `specs/043-safe-multisig-custody/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — Constitution Principle II (Test-First & Comprehensive Coverage) is NON-NEGOTIABLE, so
every story carries tests written before/with its implementation. Contract fund paths get unit + integration +
fork tests; frontend logic gets Vitest unit/component/a11y.

**Organization**: By user story (US1–US6 from spec.md), in priority order. Each story is an independently
testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6; Setup/Foundational/Polish carry no story label

## Path Conventions

Web-app monorepo (per plan.md): contracts under `contracts/`, tests under `test/`, frontend under
`frontend/src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolding and external Safe wiring that every later phase reuses.

- [X] T001 [P] Add hand-maintained Safe v1.4.1 ABIs in `frontend/src/abis/Safe.js`, `frontend/src/abis/SafeProxyFactory.js`, `frontend/src/abis/MultiSendCallOnly.js` (only the methods/events in `contracts/vault-transactions.md`)
- [X] T002 [P] Create `frontend/src/config/safeContracts.js` with the verified canonical v1.4.1 addresses for chainId 63 and 137 (`safe`, `safeL2`, `proxyFactory`, `fallbackHandler`, `multiSendCallOnly`) plus `getSafeContracts(chainId)` returning `undefined` on unsupported chains (research.md Decision 1 & 8)
- [X] T003 [P] Create feature directories: `contracts/custody/`, `test/custody/`, `frontend/src/lib/custody/`, `frontend/src/components/custody/`, and a `frontend/src/components/custody/Custody.css` scaffold
- [X] T004 [P] Add a `custody` entry to `frontend/src/data/notifications/domains.js` `DOMAIN_META` (label "Custody") so the domain resolves early (used by US6, harmless now)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The on-chain helper, its deployment, the shared transaction encoders, and the Custody surface
shell. **No user story can be completed until this phase is done.**

**⚠️ CRITICAL**: Blocks all user stories.

- [X] T005 Implement `contracts/custody/SafeProposalHub.sol` — events-only broadcaster per `contracts/SafeProposalHub.md` (`propose`, `cancel`, `Proposed`, `Cancelled`; optional `operation <= 1` guard; no state, no funds)
- [X] T006 [P] Write `test/custody/SafeProposalHub.test.js` FIRST (assert events emitted with exact args, no state writes, invalid operation reverts) and confirm it fails before T005 is wired
- [X] T007 Create `scripts/deploy/custody/deploy-safe-proposal-hub.js` (deploy, record under `safeProposalHub` in `deployments/<network>-chain<id>-v2.json`)
- [ ] T008 Deploy `SafeProposalHub` to Mordor (63) and run `npm run sync:frontend-contracts -- --network mordor --chainId 63`, adding the `safeProposalHub` address to `MORDOR_CONTRACTS` in `frontend/src/config/contracts.js`
- [X] T009 [P] Add `frontend/src/abis/SafeProposalHub.js` ABI
- [X] T010 Implement shared transaction encoders in `frontend/src/lib/custody/vaultTransaction.js` (`buildSafeTx`, `computeSafeTxHash`, `buildPrevalidatedSignatures` with ascending-owner ordering, `encodeMultiSend`, `encodeExecTransaction`, and governance builders) per `contracts/vault-transactions.md`
- [X] T011 [P] Write `frontend/src/test/custody/vaultTransaction.test.js` — known-answer vectors for `getTransactionHash`, pre-validated signature byte layout (`r=owner`, `s=0`, `v=1`) and mandatory ascending sort, and MultiSend packing
- [X] T012 Add the Custody tab shell: insert `{ id: 'custody', label: 'Custody' }` into the **Finance** group in `frontend/src/pages/WalletPage.jsx` and render `frontend/src/components/custody/CustodyPanel.jsx` with **On chain** and **Off chain** (disabled) sub-sections, an empty/onboarding state, and network gating (`getSafeContracts(chainId)` undefined → "unavailable on this network")
- [X] T013 [P] Write `frontend/src/test/custody/CustodyPanel.test.jsx` (renders both sub-sections, Off chain disabled, unsupported-network message) and `CustodyPanel.axe.test.jsx` (WCAG 2.1 AA)

**Checkpoint**: Safe wiring, hub, encoders, and Custody shell exist — stories can begin.

---

## Phase 3: User Story 1 — Create or load an on-chain vault (Priority: P1) 🎯 MVP

**Goal**: A member creates a new Safe vault (owners + threshold) or loads an existing one by address, and sees
live on-chain state.

**Independent Test**: Create a 2-of-3 vault on Mordor, confirm owners/threshold/address/balance render from
chain; load a pre-existing vault by address and see the same live state (quickstart Scenario 1).

### Tests for User Story 1

- [X] T014 [P] [US1] Write `frontend/src/test/custody/safeVault.test.js` — createVault initializer/predicted-address, loadVault parses owners/threshold/version, threshold>owners rejected (FR-005)
- [ ] T015 [P] [US1] Write `test/fork/safe-mordor-polygon.fork.js` create+load leg — deploy a 2-of-3 Safe via `SafeProxyFactory` and read back owners/threshold (fork test against live Safe v1.4.1)

### Implementation for User Story 1

- [X] T016 [P] [US1] Implement `frontend/src/lib/custody/vaultReferences.js` — local store of `{chainId,address,label,addedAt,role}[]` with load/save/upsert (data-model.md)
- [X] T017 [US1] Implement `frontend/src/lib/custody/safeVault.js` — `createVault`, `loadVault`, `readVaultState` (owners/threshold/nonce/version/balances; validates the address is a Safe) per `contracts/vault-transactions.md`
- [X] T018 [US1] Implement `frontend/src/hooks/useCustodyVaults.js` — vault list from `vaultReferences`, load-by-address, refresh, active-vault selection
- [X] T019 [P] [US1] Build `frontend/src/components/custody/CreateVaultWizard.jsx` — owners + threshold inputs, live validation (FR-005), predicted address shown before signing
- [X] T020 [P] [US1] Build `frontend/src/components/custody/LoadVaultForm.jsx` — load by address; distinguish "not a vault", "view-only (not an owner)", and "owned" (edge cases)
- [X] T021 [P] [US1] Build `frontend/src/components/custody/VaultList.jsx` and `VaultDetail.jsx` — address, network, owners, threshold, balances; switch between multiple vaults (FR-007)
- [X] T022 [US1] Wire CreateVaultWizard/LoadVaultForm/VaultList/VaultDetail into the On chain sub-section of `CustodyPanel.jsx`, persisting references with labels on create/load
- [X] T023 [US1] Write `frontend/src/test/custody/CreateVaultWizard.test.jsx`, `LoadVaultForm.test.jsx`, `VaultDetail.test.jsx` (+ axe), covering the empty/onboarding state

**Checkpoint**: MVP — a member can create/load vaults and see honest on-chain state.

---

## Phase 4: User Story 2 — Propose, approve, execute a vault transaction (Priority: P1)

**Goal**: An owner proposes a transfer from the vault; co-owners discover and approve it on-chain; any owner
executes once threshold is met; history is retained.

**Independent Test**: 2-of-3 vault — owner A proposes a token transfer, owner B (separate browser) discovers it
from chain and approves, it flips to ready, any owner executes, balance moves, entry lands in history
(quickstart Scenario 2).

### Tests for User Story 2

- [X] T024 [P] [US2] Write `frontend/src/test/custody/proposalStatus.test.js` — status derivation (pending/ready/executed/failed/superseded) from approvals + nonce (data-model.md state machine)
- [ ] T025 [P] [US2] Extend `test/fork/safe-mordor-polygon.fork.js` — full propose→`approveHash`→`execTransaction` (pre-validated sigs) round-trip for a token transfer, plus negative cases (execute below threshold reverts, duplicate approval idempotent, same-nonce supersession)

### Implementation for User Story 2

- [X] T026 [US2] Implement `frontend/src/lib/custody/proposalHub.js` — `emitProposal`, `readProposals` (decode `Proposed`, **recompute + verify** `safeTxHash` before trusting), `cancelProposal`, and the EIP-712 payload `encodePayloadLink`/`parsePayloadLink` never-stranded fallback (research.md Decision 4)
- [X] T027 [P] [US2] Write `frontend/src/test/custody/proposalHub.test.js` — tampered-preimage rejection (hash mismatch), payload link round-trip
- [X] T028 [US2] Implement `frontend/src/hooks/useVaultProposals.js` — build the pending queue + history from Safe events, hub events, and `approvedHashes`; expose approve/execute actions
- [X] T029 [P] [US2] Build `frontend/src/components/custody/ProposeTransactionForm.jsx` — native + supported-token transfer proposal (FR-009); insufficient-balance surfaced honestly
- [X] T030 [P] [US2] Build `frontend/src/components/custody/ProposalQueue.jsx` and `ProposalDetail.jsx` — approvals-remaining, approve/execute buttons, blocked-state messaging, history view (FR-011, FR-015)
- [X] T031 [US2] Wire approve (`approveHash`) and execute (`execTransaction` with ascending-sorted pre-validated sigs) through `useVaultProposals`, enforcing guards: threshold met, `nonce == Safe.nonce()`, no double execution, non-owners read-only (FR-012, FR-013, FR-016)
- [X] T032 [US2] Handle network-mismatch (prompt switch) and non-owner view-only state in the proposal UI (edge cases)
- [X] T033 [US2] Write `frontend/src/test/custody/useVaultProposals.test.js`, `ProposalQueue.test.jsx`, `ProposeTransactionForm.test.jsx` (+ axe)

**Checkpoint**: Full on-chain multisig lifecycle works — this + US1 is the complete P1 MVP.

---

## Phase 5: User Story 3 — Operate as the vault across the app (Priority: P2)

**Goal**: A member switches to "operate as" a vault; money-moving actions become threshold-gated vault
transactions surfaced only in the Custody queue.

**Independent Test**: Operate as a vault; create a wager (pending proposal, no My Wagers placeholder) and send
from Pay & Transfer (pending proposal); switch back to personal (single-signer) (quickstart Scenario 3).

### Tests for User Story 3

- [X] T034 [P] [US3] Write `frontend/src/test/custody/submitAsActiveAccount.test.js` — personal mode sends; vault mode returns a pending proposal (emits + proposer approve) and does not execute
- [ ] T035 [P] [US3] Write `frontend/src/test/custody/operateAs.integration.test.jsx` — wager-as-vault builds a MultiSend `approve+createWager` proposal; transfer-as-vault builds a proposal; neither appears in domain lists until executed (FR-022b)

### Implementation for User Story 3

- [X] T036 [US3] Implement `frontend/src/contexts/CustodyContext.jsx` (active identity `personal|vault`, chainId guard) and `frontend/src/lib/custody/submitAsActiveAccount.js` (personal path vs. vault proposal path) per `contracts/frontend-integration.md`
- [X] T037 [US3] Implement `frontend/src/hooks/useActiveAccount.js` exposing `submit(tx)`; mount `CustodyProvider` in the app tree
- [X] T038 [P] [US3] Build `frontend/src/components/custody/OperateAsIndicator.jsx` — persistent, WCAG-AA active-identity banner + "switch back" (FR-020, FR-023); render app-wide
- [ ] T039 [US3] Wire **P1 chokepoints** to route through `useActiveAccount().submit` in vault mode: `frontend/src/hooks/useTransfer.js` (`send`) and `frontend/src/hooks/useFriendMarketCreation.js` + `useOpenChallengeAccept.js` (MultiSend `approve+createWager`/`approve+acceptWager`) (FR-021, FR-022)
- [ ] T040 [US3] Implement FR-022c routing: `claimRefund` as a single-owner direct call (no threshold); vault-won `claimPayout` as a threshold vault transaction; plain receipts unrestricted (research.md Decision 7)
- [ ] T041 [US3] Wire **P2 chokepoints**: `frontend/src/hooks/usePurchaseFlow.js` (membership), `frontend/src/components/tokens/useTokenFactory.js` (mint), `frontend/src/components/clearpath/connectors/{ozGovernor,governorBravo}.js` + `ExternalDaoView.jsx` (DAO), `frontend/src/contexts/DexContext.jsx` (`swap`) (FR-022a)
- [ ] T042 [US3] Ensure vault-originated actions pass the same eligibility/compliance checks as personal actions (sanctions, membership roles) (FR-024) and surface only in the Custody queue (FR-022b)
- [X] T043 [US3] Write tests: `useActiveAccount.test.js`, `OperateAsIndicator.test.jsx` (+ axe), and per-chokepoint vault-branch unit tests

**Checkpoint**: The vault is usable across the app's money-moving surfaces.

---

## Phase 6: User Story 4 — Manage vault ownership and threshold (Priority: P2)

**Goal**: Owners add/remove owners and change the threshold as threshold-approved vault transactions.

**Independent Test**: Propose add-owner + threshold change on a 2-of-3 vault, approve to threshold, execute,
confirm new config governs the next transaction (quickstart Scenario 4).

### Tests for User Story 4

- [ ] T044 [P] [US4] Extend `test/fork/safe-mordor-polygon.fork.js` — `addOwnerWithThreshold` / `removeOwner` / `changeThreshold` via the propose→approve→execute path; threshold>owners rejected

### Implementation for User Story 4

- [ ] T045 [US4] Build `frontend/src/components/custody/OwnersThresholdPanel.jsx` — add/remove owner, change threshold, using the governance builders from `vaultTransaction.js`; validation that resulting threshold ≤ owner count (FR-018, FR-005)
- [ ] T046 [US4] Route governance proposals through the US2 proposal queue (they are ordinary vault transactions targeting the Safe) and reflect the updated owners/threshold live after execution (FR-019)
- [ ] T047 [US4] Write `frontend/src/test/custody/OwnersThresholdPanel.test.jsx` (+ axe), including owner-removed-mid-flight evaluation against current config (edge case)

**Checkpoint**: Vault governance is self-serve and threshold-gated.

---

## Phase 7: User Story 5 — Backup and recovery of vault references (Priority: P2)

**Goal**: Vault references + labels ride the app-wide encrypted backup and restore on a new device.

**Independent Test**: Add two labeled vaults, back up, restore in a fresh profile, confirm both reappear
(quickstart Scenario 5).

### Tests for User Story 5

- [X] T048 [P] [US5] Write `frontend/src/test/backup/vaultReferences.sync.test.js` — `load/apply/merge` round-trip, network-scoped tag validation, union-by-(chainId,address) with newest label winning

### Implementation for User Story 5

- [X] T049 [US5] Add the `vaultReferences` entry to `frontend/src/lib/backup/syncedObjects.js` (`networkScoped: true`, `load/apply/merge` delegating to `frontend/src/lib/custody/vaultReferences.js`) (FR-025)
- [X] T050 [US5] Extend `assertNetworkTagged` in `frontend/src/lib/backup/backupBundle.js` to validate the `chainId` tag on `vaultReferences`
- [X] T051 [US5] Write `frontend/src/test/backup/backupBundle.vaultReferences.test.js` confirming the bundle includes and restores vault references and stays encrypted (FR-026)

**Checkpoint**: Vault references survive device/browser loss.

---

## Phase 8: User Story 6 — Vault event notifications and controls (Priority: P3)

**Goal**: Vault events surface in the activity feed as a distinct Custody source with per-source controls.

**Independent Test**: A co-owner proposes a transaction needing the member's approval → "needs your action"
entry appears; setting Custody to `silent` stops new entries (quickstart Scenario 6).

### Tests for User Story 6

- [ ] T052 [P] [US6] Write `frontend/src/test/sources/custodySource.test.js` — snapshot-diff emits `approvalNeeded` (actionable), `executed`, `governanceChanged`, `fundsIn/Out`; `currentIds`/`actionNeededById` correct

### Implementation for User Story 6

- [ ] T053 [US6] Implement `frontend/src/data/notifications/sources/custodySource.js` per `contracts/frontend-integration.md` (reads the member's vaults, diffs nonce/approvedHashes/Safe+hub logs/transfers; entries deep-link to `{ tab: 'custody', vault }`)
- [ ] T054 [US6] Register `custodySource` in `frontend/src/data/notifications/sources/index.js` and add `{ domain:'custody', label:'Custody', description }` to `NOTIFICATION_CATEGORIES` in `frontend/src/lib/notifications/deliveryPreferences.js` (FR-027, FR-028)
- [ ] T055 [US6] Confirm the notification tap navigates to the Custody tab via `ActivityNotificationBridge` (link.state), no engine change expected
- [ ] T056 [US6] Write `frontend/src/test/sources/custodySource.integration.test.js` verifying `silent` suppresses only Custody while other sources still deliver

**Checkpoint**: Owners are notified when their approval is needed; controls work.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T057 [P] Author `docs/developer-guide/safe-custody.md` and `docs/runbooks/safe-proposal-hub-deploy.md` (deploy + sync + network-onboarding, incl. the ETC(61) prerequisite)
- [ ] T058 Deploy `SafeProposalHub` to Polygon (137), record in `deployments/polygon-chain137-v2.json`, and `sync:frontend-contracts -- --network polygon --chainId 137`; add addresses to `POLYGON_CONTRACTS` and `safeContracts.js`
- [ ] T059 Run the smart-contract security review (`.github/agents/`) and `slither contracts/custody/SafeProposalHub.sol`; document any accepted findings (Constitution I)
- [ ] T060 [P] Full a11y pass (axe/Lighthouse) across all Custody UI and the OperateAsIndicator (Constitution V)
- [ ] T061 Execute all of `quickstart.md` end-to-end on Mordor (and Polygon), including network-gating and the Off chain disabled state
- [ ] T062 [P] Add the ETC mainnet (61) network-block prerequisite note/issue reference in `specs/043-safe-multisig-custody/plan.md` follow-ups (config-only path to light up Custody on ETC)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: needs Setup; **blocks all user stories**.
- **US1 (P1, Phase 3)**: needs Foundational. MVP with US2.
- **US2 (P1, Phase 4)**: needs Foundational; uses US1's vault selection but is testable on a loaded vault.
- **US3 (P2, Phase 5)**: needs Foundational + US2 (reuses the proposal queue/execution seam).
- **US4 (P2, Phase 6)**: needs Foundational + US2 (governance = proposals).
- **US5 (P2, Phase 7)**: needs US1's `vaultReferences.js`; otherwise independent.
- **US6 (P3, Phase 8)**: needs Foundational; reads state produced by US1/US2 but is independently testable via fixtures.
- **Polish (Phase 9)**: after the desired stories.

### Independent Test Criteria (per story)

- **US1**: create 2-of-3 + load-by-address show correct live state.
- **US2**: propose→approve→execute a transfer moves funds and records history; guards hold.
- **US3**: operate-as produces pending proposals for wager + transfer; switch-back restores single-signer.
- **US4**: add/remove owner + threshold change take effect and govern the next tx.
- **US5**: backup→restore reinstates vaults + labels on a fresh profile.
- **US6**: approval-needed entry appears; `silent` suppresses only Custody.

### Parallel Opportunities

- Setup: T001–T004 all [P].
- Foundational: T006/T009/T011/T013 [P] alongside their siblings.
- US1: T014/T015 [P] (tests); T019/T020/T021 [P] (components); T016 [P].
- US2: T024/T025 [P]; T027/T029/T030 [P].
- Cross-story: once Foundational lands, US5 (backup) and US6 (notifications) can proceed in parallel with US3/US4 by different developers.

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → 4. Phase 4 US2 → **STOP & VALIDATE** (quickstart
   Scenarios 1–2). US1+US2 is a demoable multisig custody MVP.

### Incremental Delivery

Foundation → US1 (create/load) → US2 (lifecycle) → US3 (operate-as) → US4 (governance) → US5 (backup) →
US6 (notifications). Each adds value without breaking prior stories. Deploy the hub to Polygon (T058) before
promoting operate-as beyond Mordor.

## Notes

- [P] = different files, no incomplete-task dependency. [Story] label maps to spec.md user stories.
- Contract changes (T005/T007/T059) require the security review + Slither gate; `SafeProposalHub` is stateless
  and non-upgradeable, so no storage-layout gating applies.
- Vault-won wager payout claims are a threshold vault transaction (FR-022c reconciliation) — see T040.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
