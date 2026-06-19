---

description: "Task list for Address Book implementation"
---

# Tasks: Address Book

**Input**: Design documents from `/specs/021-address-book/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution Principle II (Test-First & Comprehensive Coverage)
is NON-NEGOTIABLE, so each behavior carries Vitest unit/component + `vitest-axe`
accessibility tasks, authored before/with the implementation.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing. This is a **frontend-only** feature — no smart-contract,
subgraph, or backend tasks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story the task belongs to (US1–US5)
- All paths are repository-relative.

## Path Conventions

Web app (frontend only): pure logic under `frontend/src/lib/addressBook/`, React
state under `frontend/src/hooks/`, UI under `frontend/src/components/{account,ui}/`,
tests under `frontend/src/test/addressBook/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the feature's directory structure and shared constants.

- [x] T001 Create feature directories `frontend/src/lib/addressBook/` and `frontend/src/test/addressBook/` (and confirm `frontend/src/components/account/` exists)
- [x] T002 [P] Create `frontend/src/lib/addressBook/constants.js` with the storage key helper (`fw_user_<address>_addressBook` via userStorage), `SCHEMA_VERSION = 1`, export `FORMAT`/`VERSION` strings, and `ADDRESS_BOOK_BACKUP_MESSAGE_V1 = "FairWins Address Book Backup v1"` (domain-separated from crypto/constants.js)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure data layer and its React binding — used by every user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [P] Unit tests for the data store in `frontend/src/test/addressBook/addressBookStore.test.js` — cover CRUD, `normalizeAddress`/`isValidAddress` (reject bad input), `addressKey`, `findByAddress` (duplicate detection regardless of case), `searchEntries`, and `mergeBook`/`applyConflictResolutions` (additive, no data loss) per `contracts/address-book-store.md`
- [x] T004 Implement `frontend/src/lib/addressBook/addressBookStore.js` — `loadAddressBook`/`saveAddressBook` (per-wallet localStorage via `utils/userStorage.js`), `createEmptyBook`, contact CRUD, address CRUD, `normalizeAddress`/`isValidAddress` (ethers `getAddress`), `addressKey`, `findByAddress`, `listEntries`, `searchEntries`, `mergeBook`, `applyConflictResolutions` (pure functions; `(address,chainId)` identity per data-model.md)
- [x] T005 [P] Unit tests for the hook in `frontend/src/test/addressBook/useAddressBook.test.jsx` — reactivity, per-wallet scoping/isolation, and persistence across mount
- [x] T006 Implement `frontend/src/hooks/useAddressBook.js` — reactive binding over the store, keyed to the connected wallet (load on mount, expose CRUD + search + merge actions that persist) (depends on T004)

**Checkpoint**: Store + hook ready — user story work can begin.

---

## Phase 3: User Story 1 - Manage contacts in My Account (Priority: P1) 🎯 MVP

**Goal**: A connected member can fully CRUD a persistent, per-wallet address book
(one nickname, many addresses with network + notes) from a My Account tab.

**Independent Test**: Open My Account → Address Book, create "Alex" with two
addresses on two networks + a note, reload, confirm everything persists and is
editable/deletable. Invalid addresses are rejected.

- [x] T007 [P] [US1] Component + axe test `frontend/src/test/addressBook/ContactEditModal.test.jsx` — add/edit contact with multiple addresses, network defaults to active chain, invalid-address rejection (FR-005), duplicate `(address,chainId)` warning
- [x] T008 [P] [US1] Component + axe test `frontend/src/test/addressBook/AddressBookPanel.test.jsx` — list/group, add/edit/delete contact and individual address, persistence after remount, empty state, no-wallet state
- [x] T009 [P] [US1] Implement `frontend/src/components/account/ContactCard.jsx` — render one contact: nickname + grouped addresses (network, shortened address, notes) with edit/delete affordances (no screening yet)
- [x] T010 [US1] Implement `frontend/src/components/account/ContactEditModal.jsx` — create/edit contact and its addresses; network selector defaulted to active chain (from `config/networks.js`/wallet); address validation + duplicate warning (uses store helpers)
- [x] T011 [US1] Implement `frontend/src/components/account/AddressBookPanel.jsx` + `AddressBookPanel.css` — list contacts via `ContactCard`, in-panel search, add/edit/delete via `ContactEditModal`, empty + no-wallet states (uses `useAddressBook`)
- [x] T012 [US1] Integrate the tab in `frontend/src/pages/WalletPage.jsx` — add `{ id: 'addressbook', label: 'Address Book' }` to `WALLET_TABS` and render `<AddressBookPanel address={address} />` when `activeTab === 'addressbook'`

**Checkpoint**: Address book CRUD is fully functional and persistent — MVP complete.

---

## Phase 4: User Story 2 - Sanctions/compliance warnings (Priority: P1)

**Goal**: Restricted saved addresses show a clear warning tag; unscreenable ones show
an uncertain (not clear) tag; contacts containing a restricted address are marked.

**Independent Test**: Save a restricted and a clear address (mock `screenAddress`),
confirm the warning tag appears only on the restricted one, an unconfigured network
yields "uncertain", and a contact with one restricted address is flagged.

- [x] T013 [P] [US2] Unit test `frontend/src/test/addressBook/useAddressScreening.test.jsx` — status mapping (clear/restricted/uncertain), fail-closed on unavailable (FR-011), short-TTL cache + in-flight de-dup, and network-scoped behavior (FR-014) per `contracts/address-screening.md`
- [x] T014 [US2] Implement `frontend/src/hooks/useAddressScreening.js` — wrap `utils/sanctionsScreen.js` (`screenAddress`/`isClear`), cache by `(chainId, lowercase(address))` with ~60s TTL, expose `getStatus`/`screen`/`anyRestricted`
- [x] T015 [P] [US2] Component + axe test `frontend/src/test/addressBook/RestrictionTag.test.jsx` — icon + text for restricted/uncertain, nothing for clear, distinct from colour-only (FR-023)
- [x] T016 [P] [US2] Implement `frontend/src/components/account/RestrictionTag.jsx` — accessible tag for `restricted | uncertain | clear | loading`
- [x] T017 [US2] Wire screening into `frontend/src/components/account/ContactCard.jsx` and `AddressBookPanel.jsx` — screen visible addresses on open via `useAddressScreening`, show `RestrictionTag` per address, and mark a contact "contains restricted" (FR-010, FR-012)
- [x] T018 [US2] Extend `frontend/src/test/addressBook/AddressBookPanel.test.jsx` — assert restricted/uncertain rendering and contact-level restricted mark (mock `screenAddress`)

**Checkpoint**: Screening is advisory, fail-closed, network-scoped, and visible.

---

## Phase 5: User Story 3 - Select a saved contact anywhere an address is required (Priority: P2)

**Goal**: Wherever a member enters an address, they can search and select a saved
contact; selection populates the field and any restriction warning travels with it.

**Independent Test**: With ≥1 saved contact, open Create/Accept Wager, search by
nickname, select an address, confirm the field populates and a restricted selection
surfaces its warning; an empty book still allows manual entry.

- [x] T019 [P] [US3] Component + axe test `frontend/src/test/addressBook/AddressBookPicker.test.jsx` — search results (nickname/partial address), per-result `RestrictionTag`, `onSelect` payload, empty-book no misleading results
- [x] T020 [US3] Implement `frontend/src/components/ui/AddressBookPicker.jsx` — searchable dropdown over `searchEntries`, renders `RestrictionTag` per result, calls `onSelect({ address, chainId, nickname })`
- [x] T021 [US3] Extend `frontend/src/components/ui/AddressInput.jsx` — add backward-compatible optional props (`enableAddressBook`, `chainId`); when enabled, render `AddressBookPicker` and surface `RestrictionTag` for the resolved/selected address via existing `onChange`/`onResolvedChange` (FR-015/016)
- [x] T022 [P] [US3] Test `frontend/src/test/addressBook/AddressInput.addressBook.test.jsx` — selection populates the field, warning surfaced for restricted selection, and **no behavior change when `enableAddressBook` is falsy** (regression guard)
- [x] T023 [US3] Opt in the opponent and arbitrator inputs in `frontend/src/components/fairwins/FriendMarketsModal.jsx` to the picker (pass `enableAddressBook` + `chainId`)

**Checkpoint**: Saved contacts are reusable across the app without regressions.

---

## Phase 6: User Story 4 - Prompt to save a newly entered address (Priority: P2)

**Goal**: After an action succeeds on-chain with a new (unsaved) address, a
dismissible, non-blocking toast invites saving it; already-saved addresses never
prompt; dismissal never affects the completed action.

**Independent Test**: Transact with a brand-new address, confirm the toast appears
after success; dismiss it (no save, action unaffected); repeat with a saved address
and confirm no toast.

- [x] T024 [P] [US4] Component + axe test `frontend/src/test/addressBook/SaveAddressToast.test.jsx` — appears only for unsaved address, quick-add (nickname required, network prefilled, notes optional), dismiss is a no-op (FR-017/018)
- [x] T025 [US4] Implement `frontend/src/components/ui/SaveAddressToast.jsx` — non-blocking toast with quick-add or attach-to-existing, using `useAddressBook` + `findByAddress` to suppress when already saved
- [x] T026 [US4] Trigger `SaveAddressToast` after a successful create/accept in `frontend/src/components/fairwins/FriendMarketsModal.jsx` for the counterparty address when not already saved (post-on-chain-confirmation)

**Checkpoint**: The book grows naturally without interrupting the flow.

---

## Phase 7: User Story 5 - Encrypted export and import for portability (Priority: P3)

**Goal**: Export the book to a wallet-signature-encrypted file and re-import it on
the same wallet (any device); wrong wallet/corrupt file fails safely; overlapping
imports merge additively.

**Independent Test**: Export, clear/second-profile, import with same wallet →
restore 100%; import with a different wallet or corrupt file → clear error, book
unchanged; overlapping import merges without loss/duplicates.

- [x] T027 [P] [US5] Unit test `frontend/src/test/addressBook/addressBookCrypto.test.js` — round-trip with same signature, wrong-wallet/corrupt → typed error (no plaintext, book untouched), and exported envelope contains no readable names/addresses/notes per `contracts/export-format.md`
- [x] T028 [US5] Implement `frontend/src/lib/addressBook/addressBookCrypto.js` — `deriveBackupKey(signer)` / `deriveBackupKeyFromSignature` (keccak256 of signature over `ADDRESS_BOOK_BACKUP_MESSAGE_V1`), `exportAddressBook(book, signer)` and `importAddressBook(envelopeJson, signer)` using `utils/crypto/primitives.js` (`encryptJson`/`decryptJson`); reject unknown `format`/`version`
- [x] T029 [US5] Add Export/Import controls + merge-conflict resolution flow to `frontend/src/components/account/AddressBookPanel.jsx` — download encrypted file on export; on import decrypt then `mergeBook` and surface per-conflict keep/take choices via `applyConflictResolutions` (FR-019–022)
- [x] T030 [P] [US5] Component test `frontend/src/test/addressBook/AddressBookPanel.importExport.test.jsx` — export triggers download, import restores contacts, wrong-wallet/corrupt shows error and leaves book unchanged, conflict resolution applies choices

**Checkpoint**: Members have portable, encrypted backups.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and quality gates across all stories.

- [x] T031 [P] Run `npm run test:frontend` and ensure the full Vitest suite (unit + component + `vitest-axe`) is green
- [x] T032 [P] Run `cd frontend && npm run lint` and resolve any ESLint errors in the new/changed files (no `continue-on-error` added)
- [x] T033 Execute `specs/021-address-book/quickstart.md` scenarios US1–US5 manually against a dev server (`npm run frontend`)
- [x] T034 Confirm the diff contains **no** changes under `contracts/`, `subgraph/`, or any backend, and that no contract addresses are hardcoded (all via `config/contracts.js`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**.
- **User Stories (Phase 3–7)**: All depend on Foundational.
  - US1 (P1) is the MVP and the base UI other stories layer onto.
  - US2 (P1) modifies US1's `ContactCard`/`AddressBookPanel` → run after US1.
  - US3 (P2) reuses `RestrictionTag` + screening from US2 → run after US2.
  - US4 (P2) and US5 (P3) depend only on Foundational + US1's panel; US4 also touches `FriendMarketsModal` (independent of US3's edits there).
- **Polish (Phase 8)**: After all desired stories complete.

### User Story Dependencies

- **US1 (P1)**: Foundational only. Independently testable (CRUD + persistence).
- **US2 (P1)**: Foundational + US1 panel (it enriches `ContactCard`/`AddressBookPanel`). Independently testable via mocked `screenAddress`.
- **US3 (P2)**: Foundational; reuses `RestrictionTag`/`useAddressScreening` from US2. If built before US2, also build `RestrictionTag`+`useAddressScreening` first.
- **US4 (P2)**: Foundational + US1. Independent of US2/US3.
- **US5 (P3)**: Foundational + US1 (adds to the panel). Independent of US2/US3/US4.

### Within Each User Story

- Tests (where marked) are written first and must FAIL before implementation.
- Pure logic (store/crypto/hooks) before components; components before integration.

### Parallel Opportunities

- T002 runs alongside T001 setup work.
- Foundational tests T003/T005 [P] run together (different files) before their impls.
- Within US1: T007, T008, T009 [P] are different files. T010–T012 are sequential (T011 imports T009/T010; T012 edits a shared page).
- Within US2: T013, T015 [P] (tests) and T016 [P] are independent; T017 edits US1 files (sequential).
- Cross-story: US4 and US5 can be developed in parallel by different people once US1 is done (different files, except both eventually touch the panel/modal — coordinate T029 with US1 owner).

---

## Parallel Example: User Story 1

```bash
# Author US1 tests + the leaf component together (different files):
Task: "Component+axe test ContactEditModal in frontend/src/test/addressBook/ContactEditModal.test.jsx"
Task: "Component+axe test AddressBookPanel in frontend/src/test/addressBook/AddressBookPanel.test.jsx"
Task: "Implement ContactCard in frontend/src/components/account/ContactCard.jsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1.
4. **STOP and VALIDATE**: CRUD + persistence in My Account → Address Book.
5. Demo the MVP.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → test → demo (MVP: a working address book).
3. US2 → restriction warnings.
4. US3 → reuse anywhere an address is entered.
5. US4 → save-prompt toast.
6. US5 → encrypted export/import.
7. Polish (Phase 8).

### Parallel Team Strategy

After Foundational + US1: one developer takes US2 (then US3 builds on it), another
takes US4, another takes US5. Coordinate edits to `AddressBookPanel.jsx` (US2 + US5)
and `FriendMarketsModal.jsx` (US3 + US4).

---

## Notes

- [P] = different files, no incomplete dependencies.
- Constitution gates: every behavior has tests; WCAG 2.1 AA + axe on all UI; ESLint
  clean; addresses sourced from `config/contracts.js`; screening fail-closed and
  network-scoped; client warning advisory only (on-chain guard enforces).
- Commit after each task or logical group; stop at any checkpoint to validate.
- No contract/subgraph/backend changes in this feature.
