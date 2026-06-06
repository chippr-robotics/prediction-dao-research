---
description: "Task list — Polymarket-only oracle selection (frontend)"
---

# Tasks: Polymarket-Only Oracle Selection (Frontend)

**Input**: Design documents from `specs/003-polymarket-only-oracle-ui/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contract.md

**Tests**: A test is requested (Constitution II + the contract's test contract) — it asserts the default exposes only Polymarket, `all` exposes the full set, and a hidden-model wager still displays.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- All paths repo-relative. **Frontend-only — no contract/ABI/deployment changes.**

## Conventions

- Filter only the **selectable** oracle set; keep `RESOLUTION_TYPE_LABELS`/
  `RESOLUTION_TAB_LABELS` full so hidden-model wagers still display + settle (FR-006).
- One source of truth: `EXPOSED_ORACLE_RESOLUTION_TYPES` (default `[Polymarket]`),
  derived from `VITE_ORACLE_MODELS`. Re-enable = flip the flag, no re-add (FR-005).
- Admin `OracleAdaptersTab.jsx` and all `contracts/` are **out of scope — untouched**.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: surface the new flag where operators expect it.

- [ ] T001 Add `VITE_ORACLE_MODELS` to `frontend/.env.example` with a comment: values `polymarket-only` (default, hides Chainlink/UMA in the user creation flow) | `all` (restore every oracle model). Do NOT set a real value in committed env files.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the single source of truth every selection/copy surface reads. **US1 and US2 cannot start until this exists.**

- [ ] T002 In `frontend/src/constants/wagerDefaults.js`, add `EXPOSED_ORACLE_RESOLUTION_TYPES` (a `ResolutionType[]`) and an `isOracleModelExposed(rt)` helper, derived from `import.meta.env.VITE_ORACLE_MODELS`: default/unset/unknown → `[ResolutionType.Polymarket]`; `'all'` → `[Polymarket, ChainlinkDataFeed, ChainlinkFunctions, UMA]`. Polymarket is always included. Export both. Leave `ORACLE_RESOLUTION_TYPES`, `RESOLUTION_TYPE_LABELS` unchanged (display).

**Checkpoint**: importing `EXPOSED_ORACLE_RESOLUTION_TYPES` yields `[Polymarket]` by default.

---

## Phase 3: User Story 1 — Only Polymarket is selectable (P1) 🎯 MVP

**Goal**: a user creating an oracle wager sees and can select only Polymarket.
**Independent test**: open the oracle create flow → Polymarket is the only model offered; no Chainlink/UMA by any path; Polymarket create still works.

- [ ] T003 [US1] In `frontend/src/components/fairwins/FriendMarketsModal.jsx`, derive the oracle tab list (`ORACLE_TAB_TYPES`, ~L70–75; consumed at `availableResolutionTypes` ~L192 and the tab render ~L1045) from `EXPOSED_ORACLE_RESOLUTION_TYPES`. When only one oracle model is exposed: default `formData.resolutionType` to Polymarket for the oracle category and **suppress the multi-tab oracle chooser** (no dead single-tab/empty selector — FR-002). If an initial/pre-selected `resolutionType` is a now-hidden model, fall back to Polymarket. Do not change the Chainlink/UMA branches (`OracleConditionPicker`) — they become unreachable.
- [ ] T004 [US1] Add `frontend/src/test/oracleExposure.test.jsx`: (a) default flag → the oracle selector offers exactly one model (Polymarket) and no Chainlink/UMA option is selectable (SC-001); (b) `VITE_ORACLE_MODELS='all'` → the selector offers all four models (SC-004 — also serves US3); (c) a wager whose model is Chainlink or UMA still renders its label (SC-005/FR-006).

**Checkpoint**: `npm --prefix frontend run test -- oracleExposure` passes; the Polymarket create path is unchanged.

---

## Phase 4: User Story 2 — Copy reflects Polymarket-only (P2)

**Goal**: explanatory/onboarding copy doesn't advertise Chainlink/UMA as selectable.
**Independent test**: dashboard + onboarding name only Polymarket as the auto-settlement source under the default flag.

- [ ] T005 [US2] Condition the oracle copy on the exposure setting: `frontend/src/components/fairwins/Dashboard.jsx` (L54 "Auto-settles from Polymarket, Chainlink or UMA") and `frontend/src/components/fairwins/OnboardingTutorial.jsx` (the Chainlink/UMA explainer cards + "Polymarket, Chainlink or UMA", ~L191–198/L277) render Polymarket-only wording when the flag is default, and the full wording when `all` (FR-004).

---

## Phase 5: User Story 3 — Reversible via one switch (P3)

**Goal**: flipping `VITE_ORACLE_MODELS=all` restores all four models everywhere, with no other change.
**Independent test**: with `all`, the selector and copy show all four again.

- [ ] T006 [US3] Verify reversibility end-to-end and document it: confirm no other user-facing oracle-selection/copy surface bypasses `EXPOSED_ORACLE_RESOLUTION_TYPES` (grep for `ResolutionType.ChainlinkDataFeed|ChainlinkFunctions|UMA` and `Chainlink|UMA` strings across `frontend/src/components`/`pages`, excluding the admin tab + display labels); add a short note documenting `VITE_ORACLE_MODELS` (e.g., in `frontend/README` or the env section). The `all` assertion is covered by T004(b).

---

## Phase 6: Polish & Cross-Cutting

- [ ] T007 Run `npm --prefix frontend run test` and `npm --prefix frontend run lint`; manually validate `quickstart.md` in both flag states (default → only Polymarket; `VITE_ORACLE_MODELS=all` → all four restored) and that a hidden-model wager still displays.
- [ ] T008 Confirm SC-006: `git diff --stat` touches only `frontend/src/**`, `frontend/.env.example`, and `specs/**` — **zero** changes under `contracts/`, ABIs, `deployments/`, or `subgraph/`.

---

## Dependencies & order

- **Setup (T001)** + **Foundational (T002)** → US1, US2.
- **US1 (T003–T004)** and **US2 (T005)** both depend only on T002; they touch
  different files and can proceed in parallel after T002.
- **US3 (T006)** is a verification/doc pass after US1+US2 (and reuses T004's test).
- **Polish (T007–T008)** last.

## Parallel execution

- After T002: **T003/T004 (US1)** and **T005 (US2)** are `[P]`-eligible (distinct
  files: FriendMarketsModal + a new test vs Dashboard/OnboardingTutorial).
- T001 (`.env.example`) is `[P]` with T002 (different file).

## Implementation strategy

- **MVP = User Story 1** (T001→T002→T003→T004): the core — only Polymarket
  selectable, verified by a test. That alone satisfies the headline request.
- Then US2 (copy) for consistency, then US3 (reversibility verification + docs).
- Ship incrementally; the whole feature is ~5 files behind one flag.
