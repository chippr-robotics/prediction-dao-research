---
description: "Task list for Fix QR Share & Scan Rendering"
---

# Tasks: Fix QR Share & Scan Rendering

**Input**: Design documents from `/specs/009-fix-qr-share/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/qr-ui-contract.md ✅, quickstart.md ✅

**Tests**: INCLUDED — the spec (SC-006/SC-007) and constitution Principle II (Test-First, NON-NEGOTIABLE) require Vitest coverage across all surfaces. Test tasks are written first and must FAIL before the matching implementation task.

**Organization**: Tasks are grouped by the four user stories from spec.md so each can be implemented and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 / US4 (Setup, Foundational, Polish carry no story label)
- Exact file paths are included in every task.

## Path Conventions

Web-application frontend only — all source under `frontend/src/`. No backend, contracts, or subgraph changes.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Branch + green baseline before changing anything.

- [x] T001 Create dedicated branch `fix/qr-share-rendering` from `main` (workflow rule: feature branch → PR, never push to main) — do NOT build on top of `fix/membership-purchase-chain-aware`.
- [x] T002 Establish a green baseline: run `npm run test:frontend` and `cd frontend && npm run lint`; record current pass state so regressions are attributable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared `WagerQRCode` component that User Stories 1, 2, and 3 all consume. (User Story 4 — the scan-button fix — does NOT depend on this and may proceed in parallel after Setup.)

**⚠️ CRITICAL**: US1–US3 cannot begin until this phase is complete.

- [x] T003 [P] Write failing unit test `frontend/src/test/WagerQRCode.test.jsx` asserting contract G1–G5: renders an `<svg>` QR reachable by its `ariaLabel`; encodes the exact `value` passed; uses `bgColor="#FFFFFF"` + dark `fgColor`; renders **no `<image>` element** (`container.querySelector('image')` is null); renders without any logo prop. (Must FAIL — component does not exist yet.)
- [x] T004 Create `frontend/src/components/ui/WagerQRCode.jsx` — a presentational component wrapping `QRCodeSVG` from `qrcode.react` with props `value` (required), `size` (default 200), `ariaLabel` (default "QR code"), `className`; fixed policy `level="H"`, `bgColor="#FFFFFF"`, `fgColor="#0E141B"`, and **no `imageSettings`** (no embedded center logo). Guard empty `value` (render nothing) per FR-008.
- [x] T005 [P] Create `frontend/src/components/ui/WagerQRCode.css` — white, padded quiet-zone container so dark modules always sit on a light field regardless of the surrounding modal theme.

**Checkpoint**: `WagerQRCode.test.jsx` passes; shared component ready for adoption.

---

## Phase 3: User Story 1 — Scannable QR on the create-wager success screen (Priority: P1) 🎯 MVP

**Goal**: After creating a wager from `/app` ("Your Wagers"), the success screen shows a crisp, scannable dark-on-white QR (no broken-image triangle) whose payload equals the displayed acceptance link.

**Independent Test**: Reach the create-wager success step; confirm one scannable QR renders (no `<image>`/broken-image), and its encoded value equals the "Acceptance link" field.

- [x] T006 [US1] Extend `frontend/src/test/FriendMarketsModal.test.jsx` with a FAILING test: in the `creationStep === 'success'` view, exactly one `WagerQRCode` renders; the encoded value equals `getMarketUrl(createdMarket)` shown in the `#fm-market-url` input (FR-005, contract G6/G7); no `<image>` element present (G8).
- [x] T007 [US1] Edit `frontend/src/components/fairwins/FriendMarketsModal.jsx` (success step, ~line 1869): replace the inline `<QRCodeSVG … imageSettings={{ src:'/assets/logo_fairwins.svg' … }}/>` with `<WagerQRCode value={getMarketUrl(createdMarket)} size={180} ariaLabel="QR code to share this wager" />`; add the import; keep the white `.fm-qr-container`; remove the now-unused `QRCodeSVG` import if no other use remains in this file.

**Checkpoint**: Create-wager success QR is scannable and broken-image-free — MVP deliverable.

---

## Phase 4: User Story 2 — Consistent working QR across every share surface (Priority: P1)

**Goal**: The Share Wager modal and the market Share modal render the same scannable dark-on-white QR via `WagerQRCode`, and the live "Share QR" entry point on the wagers screen routes to a working QR. All surfaces behave identically (FR-010).

**Independent Test**: Open each share surface; confirm a scannable QR with no broken-image placeholder whose payload matches that surface's copy/acceptance link.

- [x] T008 [US2] Trace the live "Share QR" entry point reported on the Your Wagers/`/app` screen: inspect `frontend/src/components/fairwins/Dashboard.jsx` and the wager-list/card components to confirm which modal a wager's share button opens, and ensure that path renders a `WagerQRCode`-based modal (not a stale inline QR). Document the wiring in the PR description.
- [x] T009 [P] [US2] Extend `frontend/src/test/ShareModal.test.jsx` with a FAILING test: renders one `WagerQRCode` whose payload equals the resolved `marketUrl`/`url` shown in the copy field; no `<image>` element (G7/G8).
- [x] T010 [P] [US2] Create FAILING test `frontend/src/test/ShareWagerModal.test.jsx`: renders one `WagerQRCode` whose payload equals the `url` prop shown in the copy field; no `<image>` element (G7/G8).
- [x] T011 [US2] Edit `frontend/src/components/ui/ShareModal.jsx` (~line 120): replace the inline `<QRCodeSVG … imageSettings={{ src:'/assets/fairwins_no-text_logo.svg' … }}/>` with `<WagerQRCode value={url} size={240} ariaLabel="QR code for market link" />`; add import; drop the unused `QRCodeSVG` import.
- [x] T012 [US2] Edit `frontend/src/components/ui/ShareModal.css`: give `.qr-code-frame`/`.qr-code-container` a solid white background so modules sit on a light field inside the dark glassy modal.
- [x] T013 [US2] Edit `frontend/src/components/fairwins/ShareWagerModal.jsx` (~line 54): replace the inline `<QRCodeSVG … imageSettings={…}/>` with `<WagerQRCode value={url} size={200} ariaLabel="QR code to share this wager" />`; add import; drop unused `QRCodeSVG` import.
- [x] T014 [US2] Edit `frontend/src/components/fairwins/ShareWagerModal.css`: change `.share-wager-qr-container` background from `var(--bg-primary, #0E141B)` to solid white (theme-independent), keeping padding/border for the quiet zone.

**Checkpoint**: All three QR-display surfaces render identical, scannable, broken-image-free QRs (US1 + US2 complete).

---

## Phase 5: User Story 3 — QR stays usable when the decorative logo can't load (Priority: P2)

**Goal**: No QR surface can ever show a broken-image placeholder due to a missing/decorative logo — guaranteed by construction (no embedded image) and locked in by tests.

**Independent Test**: With `/assets/*logo*.svg` blocked/unavailable, every QR still renders fully and scannably (no warning triangle).

- [x] T015 [P] [US3] Add a resilience test (in `frontend/src/test/WagerQRCode.test.jsx` and one per-surface assertion) proving QR output contains no `<image>` element and renders unchanged when logo assets are unavailable (simulate by asserting absence of any `imageSettings`/`<image>` dependency) — FR-004 / SC-004.
- [x] T016 [US3] Verify no `imageSettings` remains at any QR call site and remove now-dead logo imports/paths in `FriendMarketsModal.jsx`, `ShareWagerModal.jsx`, `ShareModal.jsx` (grep `imageSettings` and `logo_fairwins`/`fairwins_no-text` under `frontend/src/components` → expect zero in QR render paths).

**Checkpoint**: Logo-failure failure mode is eliminated and guarded by tests.

---

## Phase 6: User Story 4 — QR-scan button shows its icon and opens the scanner (Priority: P2)

**Goal**: The button next to "Opponent Address" shows a visible QR icon (not a blank box) in both light and dark themes, and opening it lets a member scan a counterparty address. Independent of the `WagerQRCode` work — may start right after Setup.

**Independent Test**: On the create-wager form, the scan button shows a visible QR icon in light AND dark themes; activating it opens the scanner; a valid scanned `0x…` address fills the Opponent field.

- [x] T017 [P] [US4] Extend `frontend/src/test/FriendMarketsModal.test.jsx` with FAILING tests (contract S1–S4): the scan button exposes accessible name "Scan QR code"; its inline `<svg>` icon has explicit non-zero dimensions (not collapsed); clicking it opens the `QRScanner`; a scanned valid `0x`+40-hex address updates `opponent`/`opponentResolved`, while a non-address scan does not.
- [x] T018 [US4] Edit `frontend/src/components/fairwins/FriendMarketsModal.css`: add `.fm-scan-btn svg { width: 20px; height: 20px; flex: none; }` to defeat the global `svg { height: auto }` collapse, and set an explicit icon color (e.g. `color: var(--text-primary)` or brand green) verified ≥3:1 against the button background in BOTH `theme-light` and `theme-dark` (FR-012, WCAG 1.4.11).
- [x] T019 [US4] Review `frontend/src/App.css:666` global `img, video, svg { height: auto }`: confirm the scoped `.fm-scan-btn svg` override fully resolves the collapse; if other inline UI icons are affected by the same rule, note them in the PR (do NOT broadly remove the global rule without verifying blast radius).

**Checkpoint**: Scan-button icon visible across themes; scanner flow works end-to-end.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify the whole fix, accessibility, and clean up.

- [x] T020 [P] Run `cd frontend && npm run lint` — zero errors (constitution IV/V); fix any unused-import warnings left by the QR swaps.
- [x] T021 Run `npm run test:frontend` — full suite green, including all new/extended QR and scan tests (SC-006/SC-007).
- [ ] T022 Run the axe/Lighthouse accessibility check on the create-wager form and each share surface; confirm non-text contrast passes for the QR (dark-on-white) and the scan icon (constitution V, contract A2/A3).
- [ ] T023 Execute `specs/009-fix-qr-share/quickstart.md` manual validation: real-device scan of all three QRs in light AND dark themes and, if possible, a mobile in-app webview (the reported failure environment); confirm each scans to the displayed link (SC-001/002/003) and the scan icon is visible (SC-007).
- [ ] T024 [P] If the 237 KB `public/assets/logo_fairwins.svg` / `fairwins_no-text_logo.svg` are no longer referenced anywhere (grep across `frontend/src`), note them as removable in the PR (defer actual deletion if used elsewhere, e.g. brand header).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup. BLOCKS US1, US2, US3.
- **US1 (Phase 3, P1)**: depends on Foundational. → MVP.
- **US2 (Phase 4, P1)**: depends on Foundational. Independent of US1 (different surfaces) but conventionally follows it.
- **US3 (Phase 5, P2)**: depends on Foundational; lightest once US1/US2 adopt `WagerQRCode` (resilience is by construction).
- **US4 (Phase 6, P2)**: depends ONLY on Setup — independent of Foundational/US1–US3; can run fully in parallel.
- **Polish (Phase 7)**: depends on all desired stories being complete.

### User Story Dependencies

- US1, US2, US3 share `WagerQRCode` (Phase 2) — no cross-story dependencies among them beyond that shared component.
- US4 is standalone (scan button + CSS), no shared component.

### Within Each Story

- The test task (FAIL first) precedes its implementation task(s).
- For US2: T009/T010 (tests, parallel) before T011–T014 (impl). T011/T013 edit different files and can parallelize; T012/T014 are their CSS counterparts.

### Parallel Opportunities

- T003 ∥ T005 (test + CSS, different files).
- Entire **US4 (T017–T019)** runs in parallel with Phase 2/US1/US2/US3 — assign to a second developer.
- T009 ∥ T010 (two different test files).
- T011 ∥ T013 (ShareModal vs ShareWagerModal, different files), then T012 ∥ T014.
- Polish T020 ∥ T024.

---

## Parallel Example: kick off the two independent tracks

```bash
# Track A (shared QR): Setup → Foundational → US1 → US2 → US3
Task: "T003 Write failing WagerQRCode.test.jsx"
Task: "T005 Create WagerQRCode.css"          # parallel with T003

# Track B (scan button, independent): start right after Setup
Task: "T017 Failing scan-button tests in FriendMarketsModal.test.jsx"
Task: "T018 Pin .fm-scan-btn svg size + AA-contrast color in FriendMarketsModal.css"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational (`WagerQRCode`) → 3. Phase 3 US1.
4. **STOP & VALIDATE**: create a wager, confirm the success-screen QR is scannable and broken-image-free.
5. Ship/demo the MVP.

### Incremental Delivery

1. Setup + Foundational → shared QR ready.
2. US1 → scannable success QR (MVP).
3. US2 → all share surfaces consistent.
4. US3 → resilience locked by tests.
5. US4 → scan-button icon fixed (can land independently, even first).
6. Polish → lint, full tests, axe, real-device scan.

### Parallel Team Strategy

- Dev A: Foundational → US1 → US2 → US3 (the shared-QR track).
- Dev B: US4 (scan button) immediately after Setup, in parallel.
- Both converge in Polish (Phase 7).

---

## Notes

- [P] = different files, no incomplete-task dependency.
- Every QR change must keep the encoded payload identical to the displayed copy link (FR-005) and introduce no embedded `<image>` (FR-002/FR-004).
- Verify each FAIL-first test actually fails before implementing.
- Commit after each task or logical group; keep contracts (`contracts/qr-ui-contract.md`) as the assertion source of truth.
- No backend/contract changes — stay within the client-side/no-backend footprint (FR-011).

---

## Implementation Notes (2026-06-08)

**Status**: T001–T021 complete on branch `fix/qr-share-rendering` (off `main`). ESLint clean; frontend suite 794 passed / 9 failed (see below). T022–T024 remain (manual/deferred).

**Key finding (T008) — screenshot 1 was the *scanner*, not a share QR.** Tracing the live "Share QR / Scan QR" entry point on `/app` showed:
- `ShareWagerModal` and `ShareModal` are **not wired into any screen** (no imports outside tests). They were fixed anyway for consistency (FR-010) and for when they are wired.
- The only live QR *display* is `FriendMarketsModal`'s create-wager success step (fixed, US1).
- The Dashboard **"Scan QR Code"** quick action opens `QRScanner`, whose **camera-error state renders only a bare `⚠️` on a pure-black modal** (`.qr-scanner-modal { background:#000 }`, `.scanner-error .error-icon { font-size:3rem }`, close `✕`). This matches the original screenshot 1 far better than a broken QR image. **The error message is in `aria-label` only — never shown as visible text.**

**Root cause of the scanner failure (confirmed) + fix included in this PR.** `frontend/nginx.conf` sent `Permissions-Policy: … camera=() …` (added 2026-06-06 in commit `50619c5`, PR #640 "harden CSP/headers"). `camera=()` is an empty allowlist → the browser blocks `getUserMedia` on the app's own origin → `html5-qrcode`'s `getCameras()`/`start()` throws → the scanner shows the bare `⚠️`. The hardening comment said "disable powerful features the app does not use," but the app *does* use the camera (QR scanner). **Fix:** `camera=(self)` — lets the top-level app origin use the camera while still blocking third-party iframes; microphone stays fully disabled. Needs real-device verification after deploy (Cloud Run SPA serves this nginx.conf). Follow-up still worth doing: render the QRScanner error text visibly (instead of `aria-label` only) so genuine permission denials aren't a cryptic triangle.

**T012**: no edit needed — `.qr-code-frame` was already `background: white`; `WagerQRCode` now renders dark-on-white on it (was green-on-transparent).

**Pre-existing failures (NOT caused by this work)**: `FriendMarketsModal.test.jsx` has 9 failing oracle-adapter tests (Chainlink/UMA tabs) on the `main` base. The `008` branch (`fix/membership-purchase-chain-aware`) fixes these via chain-aware `getContractAddressForChain` + updated assertions. They are unrelated to QR/scan and unchanged by this work. If a green base is required for the PR, base 009 on `008` or land 009 after `008` merges.

**Remaining**:
- T022 — axe: covered for the market share surface (`ShareModal.test.jsx` runs `vitest-axe` and passes with `WagerQRCode`). Full axe/Lighthouse on the create-wager form + scan icon contrast runs in CI.
- T023 — manual real-device scan + light/dark theme check of the scan-button icon (cannot run a camera/browser here). See `quickstart.md`.
- T024 — the 237 KB logo SVGs are still referenced by the brand header/landing/loading screen, so they are **not** removable; deferred.
