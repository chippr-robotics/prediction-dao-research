---
description: "Task list for Encrypted Data Backup & Restore (spec 032)"
---

# Tasks: Encrypted Data Backup & Restore

**Input**: Design documents from `specs/032-encrypted-data-sync/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution II (Test-First) is non-negotiable for the new contract and the non-trivial
client logic.

**Organization**: By user story. The on-chain registry + the shared client libs (crypto, bundle, registry
client, synced-object registry) are blocking prerequisites → **Foundational**. Backup (US1) and Restore (US2)
are both P1 and together form the MVP.

**Path conventions**: contract under `contracts/` + `test/`; client under `frontend/src/`.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 [P] Add the `backupPointerRegistry` per-network address key (placeholder) to `frontend/src/config/contracts.js` and create the ABI module `frontend/src/abis/backupPointerRegistry.js` (set/get/has + `BackupPointerSet` event), per the hand-maintained-ABI convention.
- [x] T002 [P] Create the `frontend/src/lib/backup/` directory and `frontend/src/test/backup/` test folder; add a short `frontend/src/lib/backup/README.md` recording the bundle/envelope shapes and the synced-object contract from `data-model.md` + `contracts/backup-service.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the on-chain pointer registry + the shared client libraries that BOTH backup and restore need.
**⚠️ CRITICAL**: blocks all user stories.

### Contract (tests first, must fail before implementation)

- [x] T003 [P] Hardhat unit tests for `BackupPointerRegistry` (set/get/has, overwrite-latest-wins, per-wallet isolation, `CidTooLong` length-bound revert, `BackupPointerSet` event) in `test/BackupPointerRegistry.test.js`.
- [x] T004 [P] Medusa fuzz harness (invariant: `setPointer` from A only changes A's slot to the written value) in `contracts/test/BackupPointerRegistryFuzzTest.sol`.
- [x] T005 Implement `contracts/privacy/BackupPointerRegistry.sol` — `mapping(address=>string)`, `msg.sender`-keyed `setPointer(string)` (CID length bound + event), `getPointer`/`hasPointer`; plain non-upgradeable, no OpenZeppelin (clones the `KeyRegistry` shape) per `contracts/backup-pointer-registry.md`.
- [x] T006 Deterministic CREATE2 deploy + record: add `scripts/deploy/deploy-backup-pointer-registry.js` (model on the `KeyRegistry` block / `deploy-voucher-batch-minter.js`), deploy to a test network, record `contracts.backupPointerRegistry` in `deployments/<net>-chain<id>-v2.json`, and sync the ABI/address into `frontend/src/config/contracts.js` (T001 placeholder → real address).
- [ ] T007 Run Slither on `contracts/privacy/BackupPointerRegistry.sol` and confirm zero high/critical findings (no calls/arithmetic/roles); record in the PR.

### Shared client libraries (tests first)

- [x] T008 [P] Tests for `backupCrypto` (encrypt→decrypt round-trip; wrong-key/corrupt envelope → throw; domain message distinct from wager/address-book) in `frontend/src/test/backup/backupCrypto.test.js`.
- [x] T009 [P] Tests for `backupBundle` (`buildBundle` produces a network-tagged bundle; `parseBundle` validates schema/version and REJECTS a networkScoped element missing `chainId`; round-trip) in `frontend/src/test/backup/backupBundle.test.js`.
- [x] T010 [P] Tests for `syncedObjects` merge (address book additive by `(address, chainId)` — same address on two chains stays two entries; preferences last-writer-wins) in `frontend/src/test/backup/syncedObjects.test.js`.
- [x] T011 [P] Implement `frontend/src/lib/backup/backupCrypto.js` — `DATA_BACKUP_MESSAGE_V1`, `deriveKey(signer)` (keccak256 of `signMessage`, reusing the `addressBookCrypto`/`primitives` pattern), `encryptBundle`/`decryptBundle` via `encryptJson`/`decryptJson` with header AAD.
- [x] T012 [P] Implement `frontend/src/lib/backup/syncedObjects.js` — the registry: `addressBook` (`networkScoped:true`, load=`loadAddressBook`, merge=`mergeBook`+`applyConflictResolutions`, apply replace=`saveAddressBook`) and `preferences` (`networkScoped:false`, load/apply the 4 keys, LWW merge).
- [x] T013 Implement `frontend/src/lib/backup/backupBundle.js` — `buildBundle(account)`, `parseBundle(obj)` (network-tag validation), `applyBundle(account, bundle, mode)` over the synced-object registry.
- [x] T014 [P] Implement `frontend/src/lib/backup/backupRegistry.js` — `readPointer(reader, owner)` (free, read provider on `CANONICAL_CHAIN_ID=137`), `writePointer(signer, cid)`, using the synced ABI/address.

**Checkpoint**: registry deployed + tested; shared libs ready and unit-green.

---

## Phase 3: User Story 1 - Back up my data (Priority: P1) 🎯 MVP

**Goal**: One explicit action encrypts the unified bundle, pins it, and records the on-chain pointer — with honest success only after both confirm.

**Independent Test**: trigger backup with local data; confirm encrypted envelope pinned, `getPointer(wallet)` returns the CID, success+last-backup time shown only after pin AND pointer-tx confirm; a failure leaves local data unchanged.

### Tests (write first)

- [ ] T015 [P] [US1] Tests for `useDataBackup.backup()` — happy path (build→encrypt→pin→writePointer; success only after BOTH confirm), honest failure (pin error / tx reject → local unchanged, not shown "backed up"), ~1 MB size-warn, no-gas-on-canonical guard (mock ipfsService + backupRegistry) in `frontend/src/test/backup/useDataBackup.backup.test.jsx`.

### Implementation

- [ ] T016 [US1] Implement `backup()` in `frontend/src/hooks/useDataBackup.js` — derive key (sign once/session), `buildBundle`, `encryptBundle`, `uploadJson` (await pin), `writePointer` (await tx), honest status, ~1 MB warn, prompt network-switch to canonical + cost notice, block clearly with no gas.
- [ ] T017 [US1] `frontend/src/components/account/BackupPanel.jsx` (+ CSS) — "Back up my data" control, status (exists / last-backup / pending / error), pre-sign cost notice.
- [ ] T018 [US1] Mount `BackupPanel` as an Account-Center tab in `frontend/src/pages/WalletPage.jsx`.
- [ ] T019 [P] [US1] Accessibility test (axe, WCAG 2.1 AA) for the backup controls + status in `frontend/src/test/backup/BackupPanel.accessibility.test.jsx`.

**Checkpoint**: a member can back up their data with honest confirmation.

---

## Phase 4: User Story 2 - Restore my data on another device (Priority: P1) 🎯 MVP

**Goal**: On any device with the wallet, read the pointer from chain, fetch, decrypt, and load — using only the wallet, trustlessly.

**Independent Test**: on a fresh browser with the same wallet, trigger restore; confirm it reads the pointer from chain only, fetches by CID, decrypts, and loads; no-pointer → "nothing to restore" (local untouched); a different wallet cannot decrypt.

### Tests (write first)

- [ ] T020 [P] [US2] Tests for `useDataBackup.restore()` — readPointer→fetch→decrypt→apply; no pointer ⇒ "nothing to restore" (local untouched); corrupt/undecryptable ⇒ "no usable backup" (local untouched); wrong wallet cannot decrypt (mock registry+ipfs) in `frontend/src/test/backup/useDataBackup.restore.test.jsx`.
- [ ] T021 [P] [US2] Network-aware restore test — a bundle with contacts on two chains + the same address saved on both restores to the correct `chainId`s as two distinct entries (FR-015a / SC-012a) in `frontend/src/test/backup/networkAwareRestore.test.js`.

### Implementation

- [ ] T022 [US2] Implement `restore()` in `frontend/src/hooks/useDataBackup.js` — `readPointer` (free), `fetchByCid`, derive key, `decryptBundle`, hand to `applyBundle`; honest, non-destructive on every failure.
- [ ] T023 [US2] Add "Restore my data" control + restore states to `frontend/src/components/account/BackupPanel.jsx`.

**Checkpoint**: MVP — back up on one device, restore on another, trustlessly, network-aware.

---

## Phase 5: User Story 3 - Restore safely: merge vs replace (Priority: P2)

**Goal**: Restore offers merge or replace with confirmation; never destructive without explicit choice.

**Independent Test**: with non-empty local data, restore → choose merge (both sides kept, reconciled by `(address, chainId)`) or replace (warned before overwrite; cancel = no-op).

### Tests (write first)

- [ ] T024 [P] [US3] Tests — `applyBundle` merge keeps both (additive by `(address, chainId)`; prefs LWW) vs replace overwrites; replace warns; cancel is a no-op in `frontend/src/test/backup/restoreMergeReplace.test.jsx`.

### Implementation

- [ ] T025 [US3] Implement merge/replace choice + confirmation: `applyBundle` modes in `frontend/src/lib/backup/backupBundle.js` (reuse `mergeBook`/`applyConflictResolutions`) and the confirmation modal in `frontend/src/components/account/BackupPanel.jsx`.

**Checkpoint**: restore is non-destructive and member-controlled.

---

## Phase 6: User Story 4 - Privacy and control (Priority: P2)

**Goal**: Opt-in (nothing leaves the device until backup), visible status, and removal of the stored backup.

**Independent Test**: fresh install publishes nothing until backup; status visible; "Remove my backup" clears the pointer (`hasPointer` false) and leaves local data working.

### Tests (write first)

- [ ] T026 [P] [US4] Tests — opt-in (no publish without an explicit backup); status reflects exists/last-backup; remove (`writePointer("")` → `hasPointer` false); local data unaffected by removal in `frontend/src/test/backup/privacyControl.test.jsx`.

### Implementation

- [ ] T027 [US4] Implement status + "Remove my backup" (`writePointer("")`) in `frontend/src/hooks/useDataBackup.js` and surface in `frontend/src/components/account/BackupPanel.jsx`; ensure no implicit/automatic publish anywhere.

**Checkpoint**: member controls and can see/remove their backup.

---

## Phase 7: User Story 5 - Resilient & local-first (Priority: P3)

**Goal**: Local data always works; backup/restore fail clearly and non-destructively offline; retry on reconnect.

**Independent Test**: offline reads/edits work; offline backup/restore give a clear "try again online" with no data loss; reconnect → retry succeeds.

### Tests (write first)

- [ ] T028 [P] [US5] Tests — offline backup/restore fail clearly + non-destructively; mid-operation failure never partially overwrites; retry succeeds on reconnect in `frontend/src/test/backup/resilience.test.jsx`.

### Implementation

- [ ] T029 [US5] Harden `frontend/src/hooks/useDataBackup.js` for offline/failure paths — clear "try again online" state, atomic non-destructive apply (no partial writes).

**Checkpoint**: feature never degrades the core local experience.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Full accessibility audit (axe, WCAG 2.1 AA) over `BackupPanel` incl. the merge/replace modal in `frontend/src/test/backup/BackupPanel.accessibility.test.jsx` (extend).
- [ ] T031 [P] Run the full backup test suite + `eslint` (frontend) and the contract suite + Slither/Medusa; fix any failures (no `continue-on-error`).
- [ ] T032 Execute `quickstart.md` scenarios V1–V9 (local Hardhat for the contract, or a test-network deploy) and record results.
- [ ] T033 [P] Update docs/memory: the backup feature + canonical-network (Polygon 137) choice; evaluate adding the **open-challenge code vault** (`fairwins.ocCodeVault.<addr>`) as a synced object (irrecoverable-if-lost — high-value) via `frontend/src/lib/backup/syncedObjects.js`.
- [ ] T034 Production deploy `BackupPointerRegistry` to canonical **Polygon mainnet** (+ Amoy/Mordor for test) via the floppy keystore flow; record in `deployments/` and run `npm run verify:<net>`.

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)**: none.
- **Foundational (P2)**: depends on Setup; **BLOCKS all user stories** (contract + crypto/bundle/registry/synced-objects libs).
- **US1 Backup (P3)** & **US2 Restore (P4)**: both depend on Foundational; together = the **MVP**. US2 builds on US1's `useDataBackup`/`BackupPanel` files (sequential on those files) but is independently testable.
- **US3 (P5)**: depends on US2 (extends `applyBundle` + restore UI).
- **US4 (P6)**: depends on Foundational + US1/US2 (status + remove on the same hook/panel).
- **US5 (P7)**: depends on US1/US2 (hardens the same hook).
- **Polish (P8)**: after the desired stories; T034 (mainnet deploy) is an ops step gated on the contract being reviewed/merged.

### Within a story
- Tests first (must fail), then implementation. Contract before its deploy; libs before the hook; hook before the UI.

### Cross-story file notes (sequential, not parallel)
- `frontend/src/hooks/useDataBackup.js` — created in US1 (backup), extended in US2 (restore), US4 (remove/status), US5 (resilience).
- `frontend/src/components/account/BackupPanel.jsx` — US1 (backup), US2 (restore), US3 (merge/replace modal), US4 (status/remove).
- `frontend/src/lib/backup/backupBundle.js` — foundational, extended in US3 (merge/replace modes).

### Parallel opportunities
- Setup T001/T002.
- Foundational: contract tests T003/T004 ∥; client-lib tests T008/T009/T010 ∥; lib impls T011/T012/T014 ∥ (T013 depends on T012).
- US2 tests T020/T021 ∥. Polish T030/T031/T033 ∥.

---

## Parallel Example: Foundational client-lib tests

```bash
Task: "backupCrypto tests in frontend/src/test/backup/backupCrypto.test.js"      # T008
Task: "backupBundle tests in frontend/src/test/backup/backupBundle.test.js"      # T009
Task: "syncedObjects merge tests in frontend/src/test/backup/syncedObjects.test.js" # T010
```

---

## Implementation Strategy

### MVP (Setup + Foundational + US1 + US2)
1. Setup → Foundational (contract deployed to a test network + green; shared libs unit-green).
2. US1 Back up → US2 Restore. **STOP & VALIDATE** quickstart V1/V2/V3 (back up on one device, restore on a fresh one, network-aware).
3. Demo: trustless, encrypted, wallet-only backup/restore.

### Incremental delivery
- MVP → US3 (safe merge/replace) → US4 (privacy/control) → US5 (resilience) → Polish (a11y, full gauntlet, mainnet deploy). Each is an independently testable increment.

---

## Notes
- `[P]` = different files, no incomplete-task dependency.
- No backend; encryption client-side; storage IPFS; locator on-chain. The contract is value-free, `msg.sender`-keyed, no external calls (Constitution I — minimal surface), and uses no OZ (Mordor/pre-Cancun safe).
- Honest state throughout: success only after pin + pointer confirm; failures non-destructive; corrupt/undecryptable = "no usable backup"; restore merge/replace member-confirmed; network-tagged elements restore to the correct network.
- Commit per task/logical group; keep `main` clean (work on `feat/encrypted-data-sync-032`; rebase on the updated `main` — which now includes spec 031 — before opening the PR).
