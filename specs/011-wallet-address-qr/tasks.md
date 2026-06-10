# Tasks: Wallet Address QR Display & Sharing

**Input**: Design documents from `/specs/011-wallet-address-qr/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/address-qr-ui-contract.md, quickstart.md

**Tests**: INCLUDED — constitution Principle II (Test-First, NON-NEGOTIABLE) requires tests written alongside behavior. Each story phase writes failing tests before implementation. Contract IDs (C*, M*, P*, H*, W*, A*) reference `contracts/address-qr-ui-contract.md`.

**Organization**: Tasks are grouped by user story so each story is an independently testable increment. US1 = display QR (MVP), US2 = copy/share, US3 = color customization.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Frontend-only feature: all source under `frontend/src/`, all tests in the flat `frontend/src/test/` directory (repo convention — no `__tests__/` subdirs). No changes under `contracts/`, `subgraph/`, or `.github/workflows/`.

---

## Phase 1: Setup

**Purpose**: Branch hygiene and a recorded green baseline

- [x] T001 Create feature branch from the up-to-date default branch: `git fetch origin && git checkout -b 011-wallet-address-qr origin/main` (repo rule: never commit to `main`; always branch from `origin/main`. Branch named `011-wallet-address-qr` instead of `feat/...` so Spec Kit's feature-branch detection works without overrides — analysis finding P1)
- [x] T002 Record green baseline: run `npm run test:frontend` and confirm it passes before any change; note that `frontend/src/components/ui/WagerQRCode.jsx`, `frontend/src/components/ui/WagerQRCode.css`, and `frontend/src/test/WagerQRCode.test.jsx` must remain byte-identical for the whole feature (contract W3)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The palette + persistence module that both US1 (default rendering) and US3 (customization) depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Write failing unit tests for the QR color preference module in `frontend/src/test/qrColorPreference.test.js`: P1 (default `'midnight'` on missing key / unknown stored value / throwing storage), P2 (round-trip via `localStorage` key `fairwins_qrcolor_v1` as plain string), P3 (unknown id is a no-op), P4 (never throws), and palette invariants C7 — exactly 4 entries (`midnight #0E141B`, `forest #14532D`, `ocean #1E3A8A`, `plum #581C87`), each with computed WCAG contrast ≥ 4.5:1 against `#FFFFFF` (implement the relative-luminance formula in the test), each foreground darker than the background, each with a non-empty `name`
- [x] T004 Implement `frontend/src/utils/qrColorPreference.js` exporting `QR_COLOR_PALETTE` (`[{ id, name, fg }]`), `DEFAULT_QR_COLOR_ID = 'midnight'`, `getQRColorPreference()`, `setQRColorPreference(id)` per research D2/D6 (plain-string storage, try/catch with `console.warn`, follows `frontend/src/utils/viewPreference.js` pattern) — make T003 pass

**Checkpoint**: `npx vitest run src/test/qrColorPreference.test.js` green — user story implementation can begin

---

## Phase 3: User Story 1 - Display My Address as a QR Code (Priority: P1) 🎯 MVP

**Goal**: Connected user opens Account tab → "Show QR" → branded modal with a scannable QR of their exact (EIP-55) address; gated on connection; reactive to account switch.

**Independent Test**: Connect a wallet, go to `/wallet` → Account tab, click "Show QR", scan the modal QR with a separate device — decoded text equals the connected address exactly. Disconnect → no QR entry point.

### Tests for User Story 1 (write first, must fail)

- [x] T005 [P] [US1] Write failing contract tests for `AddressQRCode` in `frontend/src/test/AddressQRCode.test.jsx` using the REAL `qrcode.react` renderer (no mock): C1 single `<svg>`, C2 encodes the value verbatim (assert checksummed-case test address), C3 fg = palette hex / bg = `#FFFFFF` and never `transparent`, C4 no `<image>` element ever, C5 `level="H"` + `marginSize={2}`, C6 `null` render on empty value, A1 `role="img"` with accessible name containing shortened address, unknown `paletteId` falls back to midnight
- [x] T006 [P] [US1] Write failing tests for `AddressQRModal` (US1 scope) in `frontend/src/test/AddressQRModal.test.jsx`: M1 (nothing when `isOpen=false`; connect prompt instead of QR when `address` falsy), M2 subset (QR + selectable full address text render), M3 (`role="dialog"`, `aria-modal="true"`, labelled by heading, Escape closes, focus enters on open and returns to trigger on close), M10 (changing `address` prop re-renders QR and text), A2 (vitest-axe `toHaveNoViolations` on the open modal)
- [x] T007 [P] [US1] Write failing integration tests for the entry point in `frontend/src/test/WalletPage.test.jsx` (create or extend): W1 (connected → Account tab shows a "Show QR" button; activating it opens the modal with the connected address), W2 (disconnected → existing connect prompt, no QR entry point). Mock wallet state at the `WalletContext.Provider` level per repo convention (NOT raw wagmi hooks); use `vi.hoisted()` for identity-stable mock values

### Implementation for User Story 1

- [x] T008 [US1] Implement `frontend/src/components/ui/AddressQRCode.jsx`: thin wrapper around `QRCodeSVG` from `qrcode.react` with props `{ value, paletteId='midnight', size=240, ariaLabel, className }`; fg from `QR_COLOR_PALETTE`, fixed `bgColor="#FFFFFF"`, `level="H"`, `marginSize={2}`, NO `imageSettings`, `null` on empty value, `role="img"` + derived aria-label — make T005 pass
- [x] T009 [US1] Implement `frontend/src/components/ui/AddressQRModal.jsx` + `frontend/src/components/ui/AddressQRModal.css` (US1 scope): dialog semantics + focus management + Escape/backdrop/close-button close (follow `frontend/src/components/ui/ShareModal.jsx` / `ModalSystem.css` idiom), branded frame per research D1 (white quiet-zone card, brand corner accents via `::before`/`::after` with theme tokens, FairWins wordmark text below the code — NO embedded logo image), `AddressQRCode` initialized from `getQRColorPreference()`, full address text user-selectable, responsive sizes (~240px desktop / ~200px ≤640px, bottom-sheet behavior per `ModalSystem.css`), `prefers-reduced-motion` disables entrance animation — make T006 pass
- [x] T010 [US1] Integrate the entry point in `frontend/src/pages/WalletPage.jsx` + `frontend/src/pages/WalletPage.css`: "Show QR" button in the Account tab wallet-details block (next to the address text, ~line 255-276), `isQRModalOpen` state, mount `AddressQRModal` with `address` from the existing `useWallet()` destructuring — make T007 pass

**Checkpoint**: US1 fully functional — `npx vitest run src/test/AddressQRCode.test.jsx src/test/AddressQRModal.test.jsx src/test/WalletPage.test.jsx` green; manually scan the QR with a phone camera (quickstart US1 walkthrough)

---

## Phase 4: User Story 2 - Copy or Share My Address (Priority: P2)

**Goal**: One-tap copy with visible success AND failure feedback; native share with the fixed text payload and graceful copy fallback.

**Independent Test**: In the open modal, Copy → paste yields the exact address; break the clipboard (DevTools) → visible inline error, address still selectable; Share on mobile opens the share sheet pre-filled, Share on desktop falls back to copy.

### Tests for User Story 2 (write first, must fail)

- [ ] T011 [P] [US2] Write failing hook tests in `frontend/src/test/useClipboard.test.jsx`: H1 (success sets `copied`, auto-resets after 2000 ms — `vi.useFakeTimers()`), H2 (rejection or absent `navigator.clipboard` sets non-empty `error`, resolves `false`, never throws), H3 (new `copy()` clears prior `copied`/`error`). Mock clipboard via `Object.defineProperty(navigator, 'clipboard', { configurable: true, ... })` reset in `beforeEach` (setup.js precedent)
- [ ] T012 [P] [US2] Extend `frontend/src/test/AddressQRModal.test.jsx` with failing copy/share tests: M4 (Copy writes exact address, "Copied!" state ~2 s), M5 (clipboard failure → inline `role="status"`/`aria-live="polite"` error message, NO `window.alert`, button never shows success, address text still selectable), M6 (`navigator.share` called with exactly `{ text: 'My FairWins wallet address:\n' + address }` — no `url`, no `title`; `AbortError` rejection produces no error UI), M7 (when `navigator.share` is undefined, Share button still renders and performs the copy path with confirmation)

### Implementation for User Story 2

- [ ] T013 [US2] Implement `frontend/src/hooks/useClipboard.js` returning `{ copied, error, copy }` per contract H1–H3 (feature-detect `navigator.clipboard?.writeText`, 2000 ms reset timer cleaned up on unmount) — make T011 pass
- [ ] T014 [US2] Add Copy and Share actions to `frontend/src/components/ui/AddressQRModal.jsx` + `frontend/src/components/ui/AddressQRModal.css`: Copy button wired to `useClipboard` with inline success/error feedback per D7; Share button with `navigator.share` feature detection mirroring `frontend/src/components/ui/ShareModal.jsx`, fixed text-only payload, silent `AbortError`, copy fallback when absent — make T012 pass

**Checkpoint**: US1 + US2 green together — modal now displays, copies, and shares

---

## Phase 5: User Story 3 - Customize the QR Code Color (Priority: P3)

**Goal**: Four named swatches inside the modal; selection restyles the QR immediately, persists per device, and is keyboard-accessible.

**Independent Test**: Pick Forest → QR restyles instantly; reload page, reopen modal → Forest still applied and `localStorage.getItem('fairwins_qrcolor_v1') === 'forest'`; operate the swatch group with arrow keys only.

### Tests for User Story 3 (write first, must fail)

- [ ] T015 [US3] Extend `frontend/src/test/AddressQRModal.test.jsx` with failing customization tests: M8 (radiogroup offers exactly Midnight/Forest/Ocean/Plum with visible/announced names; selecting one immediately changes the rendered QR fg to that palette hex and calls through to storage key `fairwins_qrcolor_v1`; a stored value pre-selects on open), M9 (radios keyboard-operable; selected state indicated beyond color alone — assert presence of the non-color indicator), re-run A2 axe assertion with the radiogroup rendered

### Implementation for User Story 3

- [ ] T016 [US3] Implement the color radiogroup in `frontend/src/components/ui/AddressQRModal.jsx` + `frontend/src/components/ui/AddressQRModal.css`: native radio inputs (or `role="radiogroup"`/`role="radio"`) labelled Midnight/Forest/Ocean/Plum driven by `QR_COLOR_PALETTE` (no hardcoded duplicate hex values), selection updates component state → `AddressQRCode` `paletteId` → `setQRColorPreference(id)`, selected swatch shows outline + check indicator, focus styles per `frontend/src/App.css` conventions — make T015 pass

**Checkpoint**: All three stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Gates, non-regression proof, manual acceptance, and PR

- [ ] T017 [P] Lint gate: `cd frontend && npm run lint` — zero new errors/warnings in the feature files (`AddressQRCode.jsx`, `AddressQRModal.jsx`, `useClipboard.js`, `qrColorPreference.js`, `WalletPage.jsx`, new tests)
- [ ] T018 [P] Full suite + coverage: `npm run test:frontend` and `npm run test:coverage` from repo root — everything green including the untouched `frontend/src/test/WagerQRCode.test.jsx` (W3) and the existing axe suite
- [ ] T019 Non-regression proof per plan constraints: `git diff --stat origin/main` shows NO changes under `contracts/`, `subgraph/`, `.github/workflows/`, `frontend/nginx.conf*`, `frontend/src/components/ui/WagerQRCode.*`, `frontend/src/test/WagerQRCode.test.jsx`, and NO dependency additions in `frontend/package.json`
- [ ] T020 Execute the manual validation walkthroughs AND the SC-002 device scan matrix from `specs/011-wallet-address-qr/quickstart.md` (4 palette colors × iOS Camera / Android Camera / FairWins in-app QRScanner — 12 cells, every cell must decode to the exact address); record the filled matrix for the PR description
- [ ] T021 Commit on `feat/wallet-address-qr`, push, and open the PR: `gh pr create -R chippr-robotics/prediction-dao-research --head feat/wallet-address-qr --title "feat: wallet address QR display & sharing (spec 011)" --body "<summary + filled scan matrix>"` (gh snap constraints: explicit `-R`/`--head`, inline `--body`); confirm CI green before merge

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (palette module is imported by US1 and US3 code)
- **US1 (Phase 3)**: Depends on Phase 2. No dependency on US2/US3
- **US2 (Phase 4)**: Depends on Phase 2; extends the modal built in US1 (T014 edits `AddressQRModal.jsx`), so runs after T009. Independently testable via its own contract assertions
- **US3 (Phase 5)**: Depends on Phase 2; extends the modal built in US1 (T016 edits `AddressQRModal.jsx`), so runs after T009. Independently testable via its own contract assertions
- **Polish (Phase 6)**: Depends on all implemented stories

### Task-level notes

- Within every story: test task(s) FIRST and must FAIL before the paired implementation task starts (constitution II)
- T012/T014 and T015/T016 touch files created in US1 — do not parallelize across phases 4 and 5 in a single working tree (both edit `AddressQRModal.jsx`/`.test.jsx`); run 4 then 5, or accept a merge cost
- T008 depends on T004 (imports `QR_COLOR_PALETTE`); T009 depends on T008 and T004; T010 depends on T009

### Parallel Opportunities

- T005, T006, T007 — three different new test files, all writable concurrently after Phase 2
- T011 and T012 — different files (new hook test vs modal test extension)
- T017 and T018 — independent gates
- US2 and US3 could be parallelized across developers only with coordination on `AddressQRModal.jsx` (shared file — see note above); single-agent execution should go sequentially

## Parallel Example: User Story 1

```bash
# After T004, write all three US1 test files together (different files):
Task: "T005 contract tests in frontend/src/test/AddressQRCode.test.jsx"
Task: "T006 modal tests in frontend/src/test/AddressQRModal.test.jsx"
Task: "T007 entry-point tests in frontend/src/test/WalletPage.test.jsx"

# Then implement sequentially (T008 → T009 → T010): each component feeds the next.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (branch + baseline) → Phase 2 (palette module, tested)
2. Phase 3: US1 — failing tests, then `AddressQRCode` → `AddressQRModal` → WalletPage wiring
3. **STOP and VALIDATE**: scan the QR from a real device; confirm connect-gating and account-switch reactivity
4. This alone ships user value (in-person address exchange) and satisfies the P1 acceptance scenarios

### Incremental Delivery

1. MVP (above) → demo/PR-able
2. Add US2 (copy/share) → re-validate → demo
3. Add US3 (color customization) → re-validate → demo
4. Polish phase gates (lint, full suite, non-regression diff, device matrix) → PR (T021)

---

## Notes

- Total: 21 tasks (Setup 2, Foundational 2, US1 6, US2 4, US3 2, Polish 5)
- Traceability: every story task cites contract IDs from `contracts/address-qr-ui-contract.md`; FR/SC coverage — FR-001/002/003/008/009 → US1; FR-004/005 → US2; FR-006/007 → US3; SC-002 → T003 (contrast) + T020 (device matrix)
- Never modify: `WagerQRCode.*`, its tests, nginx configs, anything under `contracts/` (Solidity) — this feature is frontend-only
- Commit after each task or logical group on `feat/wallet-address-qr`; never push to `main`
