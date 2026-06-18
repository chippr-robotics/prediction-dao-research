# Tasks: Wager Tax & Activity Report Generation (user self-service)

**Input**: Design documents from `specs/016-wager-tax-report/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED — the project constitution mandates test-first/comprehensive coverage
(Principle II) and the plan specifies Vitest suites. Test tasks are included and precede the
implementation they cover within each story.

**Organization**: Tasks are grouped by user story so each story is an independently testable
increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 for story-phase tasks; setup/foundational/polish carry no story label
- All paths are repo-relative; this is a frontend-only feature under `frontend/`

## Path conventions

Web frontend (single SPA). Source under `frontend/src/`, tests under `frontend/src/test/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and module scaffolding.

- [X] T001 Add frontend dependencies `jspdf`, `jspdf-autotable`, `papaparse`, `file-saver` to `frontend/package.json` (and lockfile) per research.md D6; run install and confirm the dev build still boots.
- [X] T002 [P] Create the reports module directory `frontend/src/data/reports/` and the test directory `frontend/src/test/reports/` (add a short `frontend/src/data/reports/README.md` summarizing the module per plan.md).
- [X] T003 [P] Confirm lint/test scripts cover the new paths: run `npm run test:frontend` (baseline green) and ESLint over `frontend/src/data/reports/` and `frontend/src/components/wallet/` (no new ignores; Constitution IV/V).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure, shared building blocks both stories depend on. No story-specific UI here.

⚠️ Complete before starting Phase 3.

- [X] T004 [P] Create shared test fixture `frontend/src/test/fixtures/wagers.js` with sample wagers + lifecycle event logs + receipts (deposit/payout/refund cases, multi-month, multi-ticker, plus a transfer the user did NOT send) per data-model.md.
- [X] T005 [P] Write tests `frontend/src/test/reports/reportPeriods.test.js` for named-preset resolution (last month/quarter/year/calendar year) to UTC boundaries and range validation (inverted, future-`to`, equal bounds) per data-model.md ReportingPeriod.
- [X] T006 Implement `frontend/src/utils/reportPeriods.js` (preset→`{from,to,label}` in UTC + `validateRange`) to satisfy T005.
- [X] T007 [P] Write tests `frontend/src/test/reports/valuation.test.js` for the $1.00 par `usdValue`/`costBasis` and the structured-field shape (research.md D3).
- [X] T008 [P] Implement `frontend/src/data/reports/valuation.js` (par-baseline FMV + cost basis, structured for a future price feed) to satisfy T007.
- [X] T009 [P] Write tests `frontend/src/test/reports/tokenMeta.test.js` for resolving stablecoin ticker/decimals from `config/networks.js` with a memoized on-chain `symbol()/decimals()` fallback for non-default tokens (research.md D7).
- [X] T010 [P] Implement `frontend/src/data/reports/tokenMeta.js` (ticker/decimals resolver, memoized per address+chainId) to satisfy T009.

**Checkpoint**: shared period, valuation, and token-metadata utilities exist and are green.

---

## Phase 3: User Story 1 — Self-service report for a chosen period (Priority: P1) 🎯 MVP

**Goal**: A signed-in user selects a custom or preset period, generates a report of all their
wager transfers in that period, and downloads it as PDF + CSV.

**Independent test**: With an account that has a resolved wager (deposit+payout) and an open
wager (deposit only), select a period covering them, generate, and confirm each row shows
timestamp/ticker/amount/USD value/cost basis/fee/full txHash/sending+receiving addresses,
totals reconcile, and PDF+CSV download (spec Story 1; SC-001..SC-004).

### Data layer (engine)

- [X] T011 [P] [US1] Write tests `frontend/src/test/reports/transferDerivation.test.js`: each lifecycle event → correct line item(s) with `direction` and `from`/`to` (user ↔ `wagerRegistry` escrow) per research.md D2 / data-model.md.
- [X] T012 [US1] Implement `frontend/src/data/reports/transferDerivation.js` (wager + lifecycle events → `TransferLineItem[]` with direction/from/to/amount/ticker) using synced `config/contracts.js` escrow address, to satisfy T011.
- [X] T013 [P] [US1] Write tests `frontend/src/test/reports/receiptEnrichment.test.js`: resolves `txHash` + exact block `timestamp`; populates `feeNative` when the user sent the tx and `null` + `feeUnavailableReason` when they did not (data-model.md; FR-005/FR-015).
- [X] T014 [US1] Implement `frontend/src/data/reports/receiptEnrichment.js` (ethers logs/receipts/blocks → txHash, timestamp, gas fee) to satisfy T013.
- [X] T015 [P] [US1] Write tests `frontend/src/test/reports/csvReport.test.js`: all 11 columns present, full untruncated txHash/addresses, metadata + disclaimer block (contracts/report-line-item.md).
- [X] T016 [US1] Implement `frontend/src/data/reports/csvReport.js` (papaparse render → CSV string) to satisfy T015.
- [X] T017 [P] [US1] Write tests `frontend/src/test/reports/pdfReport.test.js`: produces a PDF blob containing header, line-item table, totals, valuation note + disclaimer (contracts/report-line-item.md).
- [X] T018 [US1] Implement `frontend/src/data/reports/pdfReport.js` (jspdf + jspdf-autotable render → Blob) to satisfy T017.
- [X] T019 [US1] Write integration tests `frontend/src/test/reports/reportBuilder.test.js`: enumerate→derive→enrich→filter-by-period→value→totals; empty period yields a valid empty report; only the signed-in account's data; per-ticker + overall totals reconcile exactly to line items (SC-002/SC-003/SC-004/SC-005).
- [X] T020 [US1] Implement `frontend/src/data/reports/reportBuilder.js` orchestrator per contracts/report-builder.md (reuses `WagerRepository` for enumeration + the modules above), to satisfy T019.

### Hook + UI

- [ ] T021 [P] [US1] Write tests `frontend/src/test/reports/useTaxReport.test.js` for the `idle → generating(progress) → ready | error` state machine and download triggering (contracts/reports-ui.md).
- [ ] T022 [US1] Implement `frontend/src/hooks/useTaxReport.js` (resolve+validate period → `buildReport` with `onProgress` → render PDF+CSV → `file-saver` download) to satisfy T021.
- [ ] T023 [P] [US1] Write tests `frontend/src/test/reports/ReportPeriodSelector.test.jsx`: preset + custom inputs, invalid-range error surfaced and generation disabled (FR-002/FR-013).
- [ ] T024 [US1] Implement `frontend/src/components/wallet/ReportPeriodSelector.jsx` (accessible presets + from/to inputs + validation) to satisfy T023.
- [ ] T025 [P] [US1] Write tests `frontend/src/test/reports/TaxReportsPanel.test.jsx`: generate flow renders rows/totals, empty "no activity" state, error state, download actions (Story 1 AC1–AC5).
- [ ] T026 [US1] Implement `frontend/src/components/wallet/TaxReportsPanel.jsx` (period selector + generate button + progress + result/empty/error + download) to satisfy T025; scope to active `chainId` via `useChainId()`.
- [ ] T027 [US1] Wire the "Tax Reports" tab into `frontend/src/pages/WalletPage.jsx` (add `role="tab"` button + `role="tabpanel"` rendering `TaxReportsPanel`, following the existing tab pattern) and add `.reports-section` styles to `frontend/src/pages/WalletPage.css`.

**Checkpoint**: US1 is a complete, independently testable MVP — pick a period, generate,
view rows + totals, download PDF + CSV.

---

## Phase 4: User Story 2 — View, re-download, and manage report history (Priority: P2)

**Goal**: Saved reports appear in a history list (period + date); the user can re-download an
equivalent document and remove entries. History stores metadata only and regenerates on
demand.

**Independent test**: After generating in US1, return to the tab and confirm the report is
listed; re-download reproduces equivalent content; remove deletes the entry (it disappears,
wager data untouched) (spec Story 2 AC1–AC3; FR-010/FR-011).

- [X] T028 [P] [US2] Write tests `frontend/src/test/reports/reportHistoryStore.test.js`: `add`/`list`/`remove` with strict `address`+`chainId` key scoping, newest-first ordering, and corrupt-store→empty defensiveness (contracts/report-history-store.md; FR-012/FR-014).
- [X] T029 [US2] Implement `frontend/src/data/reports/reportHistoryStore.js` (localStorage key `fw_user_<address>_tax_report_history_v1_<chainId>`, metadata-only entries) to satisfy T028.
- [ ] T030 [US2] Persist a `ReportHistoryEntry` from `frontend/src/hooks/useTaxReport.js` on successful generation (call `reportHistoryStore.add`); add a test to `frontend/src/test/reports/useTaxReport.test.js` asserting the entry is saved (FR-010).
- [ ] T031 [P] [US2] Write tests `frontend/src/test/reports/ReportHistoryList.test.jsx`: lists entries (period + date), re-download regenerates via `buildReport`, remove deletes the entry (Story 2 AC1–AC3).
- [ ] T032 [US2] Implement `frontend/src/components/wallet/ReportHistoryList.jsx` (accessible list with re-download + remove actions) to satisfy T031.
- [ ] T033 [US2] Integrate `ReportHistoryList` into `frontend/src/components/wallet/TaxReportsPanel.jsx` (render history below the generator; refresh on generate/remove; scope to active account+chainId).

**Checkpoint**: US2 complete — history list, re-download, and removal all work atop US1.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and finishing touches spanning both stories.

- [ ] T034 [P] Add an accessibility test/audit for the Tax Reports tab (axe via the existing test setup) ensuring WCAG 2.1 AA: keyboard-operable tabs/controls, labeled inputs, `aria-live` progress/status (Constitution V; contracts/reports-ui.md).
- [ ] T035 [P] Add a network-scoping integration test `frontend/src/test/reports/networkScoping.test.js`: switching `chainId` shows only the active network's history and report rows (Constitution III; FR-014).
- [ ] T036 [P] Verify no hardcoded addresses/ABIs — the engine reads `wagerRegistry` and token data only from synced `config/contracts.js` / `config/networks.js` (Constitution V); add an assertion/comment guard where helpful.
- [ ] T037 Run the full frontend quality gate: `npm run test:frontend` and `npm run test:coverage`, fix ESLint warnings in new files, and confirm CI steps stay fail-loud (no `continue-on-error`) (Constitution II/IV).
- [ ] T038 Execute `specs/016-wager-tax-report/quickstart.md` manual validation against a configured network (presets, custom range, invalid range, empty period, history re-download + remove, network switch) and confirm SC-001..SC-005.

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → blocks everything.
- **Foundational (T004–T010)** → blocks all user stories. Within it: T005→T006, T007→T008, T009→T010 (test→impl pairs); fixtures T004 unblock later story tests.
- **User Story 1 (T011–T027)** → depends on Foundational. Internal order: derivation (T011→T012) and enrichment (T013→T014) and renderers (T015→T016, T017→T018) feed the builder (T019→T020); builder feeds the hook (T021→T022); selector (T023→T024) + panel (T025→T026) feed the tab wiring (T027).
- **User Story 2 (T028–T033)** → depends on US1's `buildReport` + `useTaxReport`. Store (T028→T029) → hook persistence (T030) → list (T031→T032) → panel integration (T033).
- **Polish (T034–T038)** → after the stories it covers.

**Story independence**: US1 is fully usable without US2. US2 only adds persistence/history UI on top of US1's generation engine.

## Parallel execution examples

- **Foundational**: T004, T005, T007, T009 can run in parallel (separate files); then their impls T006/T008/T010 in parallel.
- **US1 test-writing**: T011, T013, T015, T017, T021, T023, T025 are parallelizable (distinct test files) before their respective implementations.
- **Polish**: T034, T035, T036 run in parallel.

## Implementation strategy

- **MVP = Phase 1 + Phase 2 + Phase 3 (US1)**: ship self-service generate + download first.
- **Increment 2 = Phase 4 (US2)**: add history, re-download, and removal.
- **Harden = Phase 5**: accessibility, network-scoping, and coverage gates.
- Out of scope (separate PR): admin/operations generation and the Operations role.
