---

description: "Task list for Legacy Account Recovery (062)"
---

# Tasks: Legacy Account Recovery

**Input**: Design documents from `/specs/062-legacy-account-recovery/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — the constitution makes Test-First **NON-NEGOTIABLE** (Vitest for all non-trivial frontend logic).

**Organization**: Tasks are grouped by user story. **US1 (P1) is already shipped on this branch (PR #949)** — its tasks are marked complete `[X]` for traceability; new work starts at Phase 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- All paths are relative to repo root; frontend lives under `frontend/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Environment ready for the recovery feature.

- [X] T001 Install frontend deps (`cd frontend && npm ci`) and confirm Vitest runs.
- [X] T002 [P] Confirm the test-only ethers-crypto shim exists at `frontend/src/test/recovery/registerEthersCrypto.js` (registers `@noble/hashes` for ethers sha256/HMAC/PBKDF2 under jsdom; needed by any mnemonic test).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The flow spine and shared storage contract that US2/US3/US4/US5 attach to.

**⚠️ CRITICAL**: Complete before starting US2–US5.

- [X] T003 Restructure `frontend/src/components/account/LegacyKeyRecoveryPanel.jsx` so the import wizard **terminates at a SAVED confirmation** once the encrypted secret is stored (steps: intro → enter → secure → **saved**). Moving funds becomes an optional action offered on the saved screen and on each stored-key row — never a required wizard step (FR-011, research R7). Keep the existing unlock→transfer path for stored keys.
- [X] T004 Extract the vault localStorage key + entry shape into a single shared constant so both `legacyKeyVault` (in `frontend/src/lib/recovery/legacyKeys.js`) and the new backup store agree on `legacy_recovered_keys`. No behavior change; refactor + existing tests still green.
- [X] T005 [P] Update `frontend/src/components/account/__tests__/LegacyKeyRecoveryPanel.test.jsx` for the SAVED terminal state (recovery completes without any transfer; transfer is reachable but optional).

**Checkpoint**: Import completes at SAVED; the optional-transfer/save/audit hooks have a place to attach.

---

## Phase 3: User Story 1 - Recover a legacy account and store it safely (Priority: P1) 🎯 MVP — ALREADY SHIPPED

**Goal**: Detect key vs word list, confirm address, store the secret encrypted at rest under a passphrase.

**Independent Test**: Paste a known key and a known word list; confirm the correct address for each; set a passphrase; verify the secret unlocks only with the right passphrase and no plaintext exists in storage.

- [X] T006 [P] [US1] `classifySecret` / `walletFromSecret` / `encryptLegacySecret` / `decryptLegacySecret` / `legacyKeyVault` in `frontend/src/lib/recovery/legacyKeys.js`.
- [X] T007 [P] [US1] Guided ActionSheet import flow + stored-key list in `frontend/src/components/account/LegacyKeyRecoveryPanel.jsx` (+ `.css`).
- [X] T008 [US1] Rename section "Backup & Security" → "Recovery" in `frontend/src/config/appNav.js` and `frontend/src/pages/WalletPage.jsx` (tab id `security` + `backup` alias unchanged); update the two passkey messages in `lib/passkey/encryption.js` + `prfKeys.js`.
- [X] T009 [P] [US1] Library + panel tests in `frontend/src/test/recovery/legacyKeys.test.js` and `frontend/src/components/account/__tests__/LegacyKeyRecoveryPanel.test.jsx`; update `AppNavDrawer` + `encryption` tests for the rename.

**Checkpoint**: US1 functional and merged-ready on this branch.

---

## Phase 4: User Story 2 - Optionally move all supported assets to a smart account (Priority: P2)

**Goal**: When the member chooses, sweep native + every supported ERC-20 from the legacy account to a destination smart account, with per-asset honest outcomes and disclosed fees.

**Independent Test**: With a legacy account holding native + ≥1 supported token, open Move funds; verify all balances listed, destination editable, fee disclosed, per-asset outcomes on confirm, and a single-token failure doesn't abort the rest.

### Tests for User Story 2 ⚠️ (write first)

- [X] T010 [P] [US2] Unit tests for `quoteAllAssets` in `frontend/src/test/recovery/legacyKeysMultiAsset.test.js`: enumerates native + ERC-20s from a stub registry, reads balances for an arbitrary address, excludes zero balances, computes `nativeGasReserve`.
- [X] T011 [P] [US2] Unit tests for `sweepAllAssets` in the same file: ERC-20s-before-native ordering, native-last leaves gas reserve, per-asset outcome array, **partial failure** (one token throws → others still `sent`), invalid/`===from` destination throws, insufficient-native → native `skipped`.

### Implementation for User Story 2

- [X] T012 [US2] Add `quoteAllAssets({ kind, secret, chainId, provider, registry? })` to `frontend/src/lib/recovery/legacyKeys.js` per `contracts/legacyKeys.md` — default registry `getPortfolioRegistry(chainId).filter(kind native|erc20)` (`frontend/src/config/assetTaxonomy.js`); concurrent `getBalance` / `balanceOf` reads; non-zero only.
- [X] T013 [US2] Add `sweepAllAssets({ kind, secret, to, chainId, provider, onProgress? })` to the same file: ERC-20 `transfer` (via `TRANSFER_ABI` from `frontend/src/lib/transfer/eip3009Transfer.js`) then native last (reuse the existing reserve logic); catch per-asset failures; return outcomes; never log the secret.
- [X] T014 [US2] Rework the transfer step in `frontend/src/components/account/LegacyKeyRecoveryPanel.jsx` to use `quoteAllAssets`/`sweepAllAssets`: list every asset + balance, disclose the network fee before signing, disclose that only supported assets move (NFTs excluded, FR-017), render per-asset outcomes, and offer retry on partial failure.
- [X] T015 [P] [US2] Add asset-list + per-asset-outcome styles to `frontend/src/components/account/LegacyKeyRecoveryPanel.css` (theme tokens, both themes).
- [X] T016 [US2] Extend `frontend/src/components/account/__tests__/LegacyKeyRecoveryPanel.test.jsx`: all-asset listing, fee disclosure, per-asset outcomes, partial-failure UI, and that declining the transfer still leaves recovery complete (FR-011).

**Checkpoint**: A member can optionally move all supported assets; declining still completes recovery.

---

## Phase 5: User Story 5 - Recovery is auditable but never leaks secrets (Priority: P2)

**Goal**: Every recovery writes one activity-ledger audit record (address/time/type only); no secret in any log/backup.

**Independent Test**: Recover an account; find exactly one `legacy_account_recovered` ledger record with address/time/source and no secret; re-recovering the same account adds no duplicate.

### Tests for User Story 5 ⚠️ (write first)

- [X] T017 [P] [US5] Unit tests for `captureLegacyRecovery` in `frontend/src/test/recovery/legacyRecoverySource.test.js`: appends the expected record shape; **serialized record contains neither the private key nor the mnemonic**; stable `entryId` makes a repeat call idempotent; never throws.

### Implementation for User Story 5

- [X] T018 [P] [US5] Create `frontend/src/data/ledger/sources/legacyRecoverySource.js` exporting `captureLegacyRecovery(account, chainId, { recoveredAddress, source })` per `contracts/recoveryAudit.md` (uses `appendClientRecord`, `clientEntryId`, `LEDGER_CLASS.MEMBERSHIP`, `kind:'legacy_account_recovered'`, `refs` metadata only).
- [X] T019 [US5] Call `captureLegacyRecovery` exactly once at the SAVED transition in `frontend/src/components/account/LegacyKeyRecoveryPanel.jsx` (session `account`/`chainId`, `source` = classified `kind`); guard so a failed audit write never breaks recovery.
- [X] T020 [US5] Add a panel test asserting the audit helper is invoked once on save with address/type (and not with any secret) in `frontend/src/components/account/__tests__/LegacyKeyRecoveryPanel.test.jsx`.

**Checkpoint**: Recovery is audited; no secret leaks; idempotent.

---

## Phase 6: User Story 3 - Make recovered accounts first-class across the platform (Priority: P2)

**Goal**: Save the recovered account into the address book (upsert), making it usable on every address surface.

**Independent Test**: Recover → Save to address book → the account is selectable/resolvable on an unrelated `AddressInput`/picker; saving again updates rather than duplicates.

### Tests for User Story 3 ⚠️ (write first)

- [X] T021 [P] [US3] Panel test in `frontend/src/components/account/__tests__/LegacyKeyRecoveryPanel.test.jsx`: "Save to address book" calls the address-book upsert with `{ nickname, addresses:[{ address, chainId, notes }] }`; re-saving an existing address updates (no duplicate) via `findByAddress`.

### Implementation for User Story 3

- [X] T022 [US3] Add a "Save to address book" action on the SAVED screen of `frontend/src/components/account/LegacyKeyRecoveryPanel.jsx` using `useAddressBook()` (`findByAddress` → `addContact` or `addAddress`), with an editable name (default "Recovered account") and provenance `notes` (research R4, FR-018/019/020).
- [X] T023 [P] [US3] Style the save-to-book control + confirmation in `frontend/src/components/account/LegacyKeyRecoveryPanel.css`.

**Checkpoint**: Recovered accounts are usable platform-wide via the address book.

---

## Phase 7: User Story 4 - Carry recovered accounts forward in encrypted backup (Priority: P3)

**Goal**: Recovered-account ciphertext records ride the spec-032 backup and survive restore without duplication.

**Independent Test**: Recover → back up → restore in a fresh profile → the account reappears (still passphrase-locked); a second merge restore creates no duplicate.

### Tests for User Story 4 ⚠️ (write first)

- [X] T024 [P] [US4] Unit tests for the store in `frontend/src/test/recovery/legacyRecoveredKeysStore.test.js`: `load/save` round-trip; `mergeLegacyRecoveredKeys` unions by lowercased address with newest `importedAt` winning and reports conflicts; payload is ciphertext-only (no plaintext).
- [X] T025 [P] [US4] Backup-integration test in `frontend/src/test/backup/legacyRecoveredKeys.sync.test.js`: `buildBundle`/`applyBundle` include and restore the `legacyRecoveredKeys` domain in merge and replace modes without duplication.

### Implementation for User Story 4

- [X] T026 [US4] Create `frontend/src/lib/recovery/legacyRecoveredKeysStore.js` (`loadLegacyRecoveredKeys` / `saveLegacyRecoveredKeys` / `mergeLegacyRecoveredKeys`) over `userStorage` key `legacy_recovered_keys`, sharing the constant from T004; ciphertext only (contracts/legacyRecoveredKeysStore.md).
- [X] T027 [US4] Register the `legacyRecoveredKeys` synced object (`networkScoped:false`, `load`/`apply`/`merge`) in `frontend/src/lib/backup/syncedObjects.js` (no `assertNetworkTagged` branch needed).
- [X] T028 [US4] Verify `legacyKeyVault` and the store read/write the same key/shape after T004 (no drift); adjust if needed.

**Checkpoint**: Recovered accounts persist across devices via encrypted backup.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T029 [P] Accessibility: add an axe test for the new SAVED/transfer/save-to-book UI states in `frontend/src/components/account/__tests__/LegacyKeyRecoveryPanel.test.jsx` (WCAG 2.1 AA, both themes).
- [X] T030 [P] Docs: add `docs/developer-guide/legacy-account-recovery.md` and a CLAUDE.md guardrail bullet summarizing the Recovery section (encrypted-at-rest vault, all-asset sweep, address-book/backup/audit integration, no-secret-in-logs rule).
- [ ] T031 Run the full frontend gate: `npm run test:frontend` + `npx eslint` over changed files; ensure green with no `continue-on-error`.
- [ ] T032 Execute `specs/062-legacy-account-recovery/quickstart.md` scenarios 1–5 and confirm each success-criteria mapping.
- [ ] T033 Update PR #949 description to reflect the full feature (US1–US5) and push.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: done.
- **Foundational (Phase 2)**: T003 (SAVED restructure) and T004 (shared key constant) block the new stories. T003 is a prerequisite for T014/T019/T022 (they attach to SAVED); T004 is a prerequisite for T026/T028.
- **User Stories (Phase 4–7)**: all depend on Phase 2. US2, US5, US3 are independent of each other (different concerns, mostly different files) and can proceed in parallel; US4 depends on T004.
- **Polish (Phase 8)**: after the desired stories are complete.

### User Story Dependencies

- **US1 (P1)**: shipped.
- **US2 (P2)**: needs T003. Independent of US3/US4/US5.
- **US5 (P2)**: needs T003. Independent of US2/US3/US4.
- **US3 (P2)**: needs T003. Independent of US2/US4/US5.
- **US4 (P3)**: needs T004. Independent of US2/US3/US5.

### Within Each User Story

- Tests first (write and see them fail), then implementation, then wire into the panel.
- Library functions (`legacyKeys.js`, store, ledger source) before the panel edits that consume them.

### Parallel Opportunities

- T010/T011 (US2 tests) ∥ T017 (US5 test) ∥ T024/T025 (US4 tests) — different files.
- T012/T013 (legacyKeys.js) ∥ T018 (legacyRecoverySource.js) ∥ T026 (store) — different files, after Phase 2.
- CSS tasks T015/T023 ∥ their component logic.
- Docs T030 ∥ code once behavior is settled.

**⚠️ Serialize panel edits**: T014, T019, T022 all edit `LegacyKeyRecoveryPanel.jsx` — do them sequentially (or one combined pass) to avoid conflicts, even though their stories are logically independent.

---

## Parallel Example: post-Foundational fan-out

```bash
# After T003 + T004, three stories' libraries in parallel (different files):
Task: "US2 — quoteAllAssets/sweepAllAssets in frontend/src/lib/recovery/legacyKeys.js (+ tests)"
Task: "US5 — captureLegacyRecovery in frontend/src/data/ledger/sources/legacyRecoverySource.js (+ tests)"
Task: "US4 — legacyRecoveredKeysStore.js + syncedObjects registration (+ tests)"
# Then serialize the LegacyKeyRecoveryPanel.jsx edits (T014 → T019 → T022).
```

---

## Implementation Strategy

### MVP

US1 (P1) is the MVP and is **already delivered** on this branch. The remaining phases are incremental value on top.

### Incremental Delivery (recommended order)

1. Phase 2 (SAVED restructure + shared key) → foundation for the delta.
2. **US2** (all-asset sweep) → the headline value; test → demo.
3. **US5** (audit, security-critical) → ships alongside the core storage behavior.
4. **US3** (address book) → makes recovered accounts first-class.
5. **US4** (backup durability) → cross-device safety.
6. Phase 8 polish → a11y, docs, quickstart, PR update.

### Notes

- Each story is independently testable; stop at any checkpoint to validate.
- Commit after each task or logical group; keep secrets out of every log and record.
- Serialize the shared-file (`LegacyKeyRecoveryPanel.jsx`) edits.
