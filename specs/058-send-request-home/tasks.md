# Tasks: Pay / Request / Wager Home

**Input**: Design documents from `/specs/058-send-request-home/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED — Constitution II (test-first) is non-negotiable in this repo; each
story writes its tests before its implementation. Test runner: Vitest +
@testing-library/react (`npm run test:frontend`), axe for a11y, Cypress fast E2E.

**Organization**: Grouped by user story (US1 Pay, US2 Request, US3 bottom nav,
US4 preferences) after a foundational phase that builds the two pure modules and
the HomeScreen mode-hosting skeleton every story plugs into.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 from spec.md
- All paths are repo-relative; feature code lives entirely under `frontend/`

---

## Phase 1: Setup

**Purpose**: Confirm a green baseline before touching the home surface (no project
init or new dependencies needed — plan pins zero new runtime deps).

- [X] T001 Verify baseline: run `npm run test:frontend` and the frontend ESLint check; confirm both pass on the branch before changes (record any pre-existing failures so they aren't attributed to this feature)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two pure modules (preference storage, payment-URI build/parse) and
the HomeScreen mode-hosting skeleton. Every user story depends on this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Write failing unit tests for the home preference util in `frontend/src/utils/__tests__/homePreference.test.js` — cases from `contracts/home-preferences.md`: defaults (`pay`/`stable`), invalid value rejection, corrupt-JSON and unavailable-storage fallbacks (never throws), setter persistence, `subscribe` notification, unknown-field preservation
- [X] T003 [P] Write failing unit tests for the payment-request module in `frontend/src/lib/payments/__tests__/paymentRequest.test.js` — cases from `contracts/payment-request-uri.md`: build stable/native URI shapes, note URL-encoding + empty-note omission, build validation errors, parse of all four accepted inputs, `@chainId` decimal/hex, malformed numeric params degrade to address-only, junk input → null, **round-trip guarantee** (build → parse identity)
- [X] T004 [P] Implement `frontend/src/utils/homePreference.js` per `contracts/home-preferences.md` (key `fairwins_home_v1`, `HOME_MODES`, getters/setters, `subscribe`; mirror `frontend/src/utils/quickAccessPreference.js` style) — T002 tests go green
- [X] T005 [P] Implement `frontend/src/lib/payments/paymentRequest.js` per `contracts/payment-request-uri.md` (`buildPaymentRequestUri`, `parsePaymentRequest`; ethers `parseUnits`/`isAddress`; leave `lib/addressBook/scanAddress.js` untouched) — T003 tests go green
- [X] T006 Extend `frontend/src/test/HomeScreen.test.jsx` (existing child-mocking pattern) with failing tests for mode hosting: initial mode from `getDefaultHomeMode()`, all three panels mounted with inactive ones `hidden`, wager extras (`.home-actions`, `.home-ticker`) rendered only in wager mode, ticker `onSelectMarket` forcing wager mode, desktop `PillSelect` switcher wiring
- [X] T007 Refactor `frontend/src/components/fairwins/HomeScreen.jsx` to host modes per `contracts/home-mode-components.md`: `mode` state initialized from `getDefaultHomeMode()` + `subscribe` sync, three always-mounted panels with `hidden` on inactive (placeholder stubs for Pay/Request until US1/US2), desktop/tablet `PillSelect` switcher, wager-only extras gating, ticker→wager forcing; `CreateChallengePanel` usage unchanged — T006 tests go green
- [X] T008 Add mode-switcher and panel-visibility styles to `frontend/src/components/fairwins/HomeScreen.css` (switcher row placement, hidden-panel rules; keep the home non-scrolling at 320px)

**Checkpoint**: Home still ships wager behavior unchanged, now inside a mode shell —
user story implementation can begin.

---

## Phase 3: User Story 1 — Pay someone from the home screen (Priority: P1) 🎯 MVP

**Goal**: Pay is the default home mode: amount hero (USDC default) + numpad +
standard recipient entry (typed / address book / QR scan) + note + "Pay" button
submitting through the existing `useTransfer` engine with its gating and honest
fee/lifecycle disclosure.

**Independent Test**: Fresh profile at `/app` lands on Pay; enter amount, choose a
recipient via each entry method, press Pay → existing transfer flow completes
(quickstart scenarios 1–3).

### Tests for User Story 1 (write first, must fail)

- [X] T009 [P] [US1] Write failing component tests in `frontend/src/test/PayPanel.test.jsx` (mock `useTransfer`, `useChainTokens`, `useAddressScreening`, `useWallet`, `useSwitchChain` — pattern: `src/test/CreateChallengePanel.test.jsx`): Pay disabled at zero amount / unresolved recipient / `restricted` screening / over balance; disconnected → connect prompt; chain mismatch → switch affordance instead of Pay; address-book pick and scan prefill recipient; scanned full payment request prefills amount+currency+note; wrong-token scan → error with **no partial prefill**; submit calls `useTransfer.send({asset, to, amount})`; success clears draft; currency pill toggles stable/native with honest symbols

### Implementation for User Story 1

- [X] T010 [US1] Implement `frontend/src/components/fairwins/PayPanel.jsx` per `contracts/home-mode-components.md`: `.fm-pay-*` layout with `AmountKeypad` (`prefix="$"`, symbol from `useChainTokens`), token pill (`.fm-pay-token-select`, default kind from `getDefaultCurrencyKind()`), `AddressInput` (`enableAddressBook`, `chainId`, `onResolvedChange`) + `AddressBookButton` + `AddressScreenNotice`, memo input, primary "Pay" button; gating + submit via `useTransfer` following `TransferForm.jsx` patterns (balance refresh, screening block, switch-chain gate, vault "proposed" outcome surfaced)
- [X] T011 [US1] Add scan handling to `frontend/src/components/fairwins/PayPanel.jsx`: scan button opens `components/ui/QRScanner.jsx`; decoded text goes through `parsePaymentRequest` with the consumer obligations from `contracts/payment-request-uri.md` (chainId mismatch → switch prompt before send; foreign token → error, no partial prefill; raw address → recipient-only prefill) — T009 scan cases go green
- [X] T012 [US1] Replace the Pay placeholder in `frontend/src/components/fairwins/HomeScreen.jsx` with `PayPanel` and extend `frontend/src/test/HomeScreen.test.jsx`: `pay` is the default mode on a fresh profile, Pay draft survives switching to wager and back, wager memo never leaks into the Pay note (FR-015)

**Checkpoint**: US1 fully functional — MVP: the app opens on a working Pay view;
wager one switch away, unchanged.

---

## Phase 4: User Story 2 — Request money with a QR code (Priority: P1)

**Goal**: Request mode: amount + note → EIP-681 payment-request QR (note as
`message` param + plain text beside the code), copy/share, and FairWins scan
round-trip into a prefilled Pay view.

**Independent Test**: Enter amount + note, press Request → QR decodes to the
correct URI; scanning it from the Pay scanner prefills recipient/amount/currency/
note (quickstart scenarios 4–6).

### Tests for User Story 2 (write first, must fail)

- [X] T013 [P] [US2] Write failing component tests in `frontend/src/test/RequestPanel.test.jsx` (mock `useWallet`, `useChainTokens`): Request disabled at zero amount; disconnected → connect prompt before generation; press builds the expected URI via `buildPaymentRequestUri` (requester = `useWallet().address`, active chainId, selected currency kind) and renders the QR + the note as plain text; Copy writes the URI to clipboard; Share uses `navigator.share` with clipboard fallback; editing amount/note/currency clears the displayed code

### Implementation for User Story 2

- [X] T014 [US2] Implement `frontend/src/components/fairwins/RequestPanel.jsx` per `contracts/home-mode-components.md`: amount hero (shared keypad + token pill), note input, primary "Request" button; QR via `qrcode.react` `QRCodeSVG` following `components/ui/AddressQRCode.jsx` (level "H", `utils/qrColorPreference.js` palette); copy/share chrome following `components/ui/AddressQRModal.jsx`; stale-QR clearing — T013 goes green
- [X] T015 [US2] Replace the Request placeholder in `frontend/src/components/fairwins/HomeScreen.jsx` with `RequestPanel` and extend `frontend/src/test/HomeScreen.test.jsx`: request mode renders the panel; Request draft survives mode switches (FR-015)
- [X] T016 [US2] Add a cross-panel round-trip test in `frontend/src/test/paymentRequestRoundTrip.test.jsx`: a URI generated with RequestPanel's inputs, fed through `parsePaymentRequest` into PayPanel's scan path, prefills recipient, amount, currency, and note ready to confirm (SC-003 logic-level guarantee)

**Checkpoint**: US1 + US2 — the home is a complete peer-to-peer money surface.

---

## Phase 5: User Story 3 — Mobile bottom navigation (Priority: P2)

**Goal**: On mobile, a three-glyph bottom bar — Pay (outgoing arrow), Request
(incoming arrow), Wager (head-to-head) — switches home modes in place with the
active glyph indicated; desktop keeps the segmented switcher.

**Independent Test**: At ≤768px the bar shows the three glyphs with accessible
names, switches modes without losing drafts, and appears only on the home surface
(quickstart scenario 8).

### Tests for User Story 3 (write first, must fail)

- [X] T017 [P] [US3] Add the three glyphs — outgoing arrow (pay), incoming arrow (request), head-to-head (wager, visually consistent with `EitherSideIcon` in `components/fairwins/resolutionIcons.jsx`) — to `frontend/src/components/nav/NavIcon.jsx`, with rendering assertions in `frontend/src/components/nav/__tests__/NavIcon.test.jsx` (create or extend)
- [X] T018 [US3] Extend `frontend/src/test/HomeScreen.test.jsx` with failing mobile-nav tests (mock `hooks/useMediaQuery` `useIsMobile`): mobile renders `SectionIconNav` with exactly the three items in Pay/Request/Wager order, each with an accessible name; active item reflects the mode; `onSelect` switches modes and drafts survive; desktop renders the `PillSelect` switcher and no bottom bar

### Implementation for User Story 3

- [X] T019 [US3] Wire `components/nav/SectionIconNav.jsx` (unmodified) into `frontend/src/components/fairwins/HomeScreen.jsx` per `contracts/home-mode-components.md`: items `pay`/`request`/`wager` with the T017 glyphs, `activeId` = mode, `onSelect` sets mode; render only for the home surface, mobile viewports (the component self-gates via `useIsMobile`) — T018 goes green
- [X] T020 [US3] Adjust `frontend/src/components/fairwins/HomeScreen.css` for the bottom bar: reserve safe-area/bottom spacing so no mode's content is obscured and each mode stays non-scrolling at 320px

**Checkpoint**: All three activities switchable in one view on mobile and desktop.

---

## Phase 6: User Story 4 — Preferences: default view and default currency (Priority: P3)

**Goal**: Account-section panel to set the default home mode (preset Pay) and
default currency (preset USDC/stable, shown with the active network's real
symbols); persists across sessions and applies on next home load.

**Independent Test**: Set default view = Wager and currency = native, reload
`/app` → opens in Wager; Pay/Request heroes default to the native symbol; clearing
storage restores Pay/USDC without errors (quickstart scenario 11).

### Tests for User Story 4 (write first, must fail)

- [X] T021 [P] [US4] Write failing component tests in `frontend/src/components/account/__tests__/HomePreferencesPanel.test.jsx`: two labeled radio groups with correct presets read from `utils/homePreference.js`; selections call the setters; currency options render the active network's symbols from a mocked `useChainTokens` while storing the network-agnostic kind

### Implementation for User Story 4

- [X] T022 [US4] Implement `frontend/src/components/account/HomePreferencesPanel.jsx` (+ `HomePreferencesPanel.css`) per `contracts/home-preferences.md`, following the panel pattern of `components/account/QuickAccessCardsPanel.jsx` — T021 goes green
- [X] T023 [US4] Register the panel in `frontend/src/components/account/AccountDashboard.jsx` (and `components/account/index.js` if panels are exported there), alongside the existing preference panels
- [X] T024 [US4] Extend `frontend/src/test/HomeScreen.test.jsx`: with `fairwins_home_v1` preset to `{defaultMode:'wager', defaultCurrencyKind:'native'}`, home opens in wager mode and the Pay/Request heroes default to the native symbol; live preference change propagates via `subscribe` (US4 acceptance scenarios 2–3)

**Checkpoint**: All four stories functional and individually testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T025 [P] Add axe accessibility coverage for the home surface in `frontend/src/test/home.axe.test.jsx` (pattern: `src/test/pools.axe.test.jsx`): each mode, both switchers, the request-QR view — no violations (FR-017, SC-008)
- [X] T026 [P] Extend the Cypress fast E2E home smoke in `frontend/cypress/e2e/` (follow existing home spec naming): land on Pay, switch modes via both switchers, generate a request QR, confirm wager create still reachable
- [X] T027 [P] Write `docs/developer-guide/home-pay-request.md`: the three-mode home, `fairwins_home_v1` schema, payment-request URI format + parser module, and the "no new value path — `useTransfer` only" rule
- [X] T028 Full verification: `npm run test:frontend`, frontend ESLint, and the quickstart.md manual scenarios (1–12); confirm the diff touches only `frontend/` and `docs/` (FR-018 — no `contracts/`, `deployments/`, or `services/` changes)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none — start immediately
- **Phase 2 (Foundational)**: after T001. Internal order: T002/T003 (tests) → T004/T005 (impl, parallel); T006 (tests) → T007 (HomeScreen refactor, needs T004) → T008
- **Phases 3–6 (US1–US4)**: all require Phase 2 complete
  - **US1** additionally consumes T005 (`parsePaymentRequest`) for scan handling
  - **US2** consumes T005 (`buildPaymentRequestUri`); T016 additionally needs US1's PayPanel (the only cross-story task — schedule US2 after US1, or defer T016)
  - **US3** touches only HomeScreen wiring + NavIcon — independent of US1/US2 panels (placeholders suffice), but is most meaningful after US1
  - **US4** consumes T004 (setters) and reuses HomeScreen's preference init from T007 — independent of US1–US3
- **Phase 7 (Polish)**: after all desired stories (T025/T026 exercise every mode)

### Within Each User Story

Tests are written first and must fail; implementation makes them green; HomeScreen
wiring last. Tasks in the same file (e.g. T010→T011, both PayPanel.jsx) are
sequential.

### Parallel Opportunities

- Phase 2: T002 ∥ T003, then T004 ∥ T005 (different modules)
- After Phase 2, story kickoff test tasks are mutually parallel: T009 ∥ T013 ∥ T017 ∥ T021 (four different files)
- US3 and US4 can proceed fully in parallel with US1/US2 (different files except the small HomeScreen wiring merges)
- Phase 7: T025 ∥ T026 ∥ T027

### Parallel Example: after Foundational completes

```bash
# Kick off all four stories' test tasks together:
Task: "T009 PayPanel tests in frontend/src/test/PayPanel.test.jsx"
Task: "T013 RequestPanel tests in frontend/src/test/RequestPanel.test.jsx"
Task: "T017 NavIcon glyphs + tests in frontend/src/components/nav/"
Task: "T021 HomePreferencesPanel tests in frontend/src/components/account/__tests__/"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 → Phase 2 (foundation: pure modules + mode shell; wager unchanged)
2. Phase 3 (US1 Pay) → **STOP and VALIDATE**: quickstart scenarios 1–3 — the app
   opens on a working Pay view; that alone is a shippable increment
3. Demo/ship if desired

### Incremental Delivery

1. Foundation → US1 (Pay default home — MVP)
2. + US2 (Request QR) → complete P2P money surface
3. + US3 (bottom nav) → the unified one-view mobile experience
4. + US4 (preferences) → personalization polish
5. Polish phase gates the PR: axe + Cypress + full suite + quickstart sweep

Each increment keeps the wager home fully functional (FR-012) — any checkpoint is
a safe stopping point.

---

## Notes

- 28 tasks total: Setup 1, Foundational 7, US1 4, US2 4, US3 4, US4 4, Polish 4
- Constitution II: never mark a story checkpoint done while its tests are red;
  Constitution III: no mock data outside test scope — panels always drive the real
  `useTransfer` / real network config
- Commit after each task or logical group; CI (lint, Vitest, a11y, Cypress fast
  E2E) must stay green — no `continue-on-error`
