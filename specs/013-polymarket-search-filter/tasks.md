---

description: "Task list for Polymarket Search & Category Filter"
---

# Tasks: Polymarket Search & Category Filter

**Input**: Design documents from `/specs/013-polymarket-search-filter/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — required by Constitution Principle II (Test-First, NON-NEGOTIABLE)
and spec FR-016. Tests for each story are written first and must fail before the
story's implementation.

**Organization**: Grouped by user story. Note this feature touches a small,
shared surface — `frontend/src/hooks/usePolymarketSearch.js` and
`frontend/src/components/fairwins/PolymarketBrowser.jsx` — so several
implementation tasks within a phase edit the same file and run sequentially.
Test files differ per layer, so hook-test vs component-test tasks parallelize.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different file, no dependency on an incomplete task)
- **[Story]**: US1–US4 (from spec.md)
- Exact file paths are included in each task

## Path Conventions

Web app — frontend feature. Source under `frontend/src/`, tests under
`frontend/src/test/` (the repo's established Vitest location).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test fixtures/helpers the rest of the work depends on

- [X] T001 [P] Create Gamma API test fixtures in `frontend/src/test/fixtures/polymarket.js`: a `/public-search?q=knicks` payload (events with a multi-sub-market game event + the GTA-VI regression items), `/events?tag_id=<id>` payloads for ≥2 categories, an event containing a closed/condition-less (ineligible) market, a single-market event, and an error case.
- [X] T002 [P] Add a `fetch` mock helper (URL-aware, returns fixtures via `vi.stubGlobal`) in `frontend/src/test/helpers/mockGammaFetch.js`, following the existing pattern in `frontend/src/test/ipfsService.test.js`.
- [X] T003 [P] Confirm the Gamma base URL is sourced from `frontend/src/config/networks.js` (`network.polymarket.gammaApiUrl`) and note the verified category seed map (politics=2, sports=1, crypto=21, pop-culture=596, business=107, tech=1401) for use in T005.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared data-layer building blocks used by every story. All live in
`frontend/src/hooks/usePolymarketSearch.js`, so they run sequentially.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add `normaliseGammaEvent(event)` in `frontend/src/hooks/usePolymarketSearch.js` that reuses `normaliseGammaMarket` for children, sets each child `label = groupItemTitle || question`, keeps only eligible children (`conditionId` present, `active === true`, `closed !== true`), captures event `id/title/slug/volume/tagIds`, and returns `null` when the event has zero eligible children. (data-model: NormalizedEvent/NormalizedMarket; Decisions 7, 10)
- [X] T005 Add `resolveCategoryTagId(slug)` in `frontend/src/hooks/usePolymarketSearch.js` backed by the verified seed map, memoized in module scope, with a `GET /tags/slug/{slug}` fallback for unseeded slugs. (Decision 3)
- [X] T006 Add a single-flight request helper (one `AbortController`, discard superseded responses, swallow `AbortError`, surface non-2xx as `Polymarket Gamma API returned <status>`) in `frontend/src/hooks/usePolymarketSearch.js`, to be used by both hooks. (Decision 8; C6/C7)

**Checkpoint**: Normalization, tag resolution, and fetch safety are ready.

---

## Phase 3: User Story 1 - Find a specific market by searching (Priority: P1) 🎯 MVP

**Goal**: Typing a term returns relevant markets, grouped by event, where a game
with many sub-markets is one expandable row; selecting a (sub-)market links it.

**Independent Test**: Type `knicks`; results are Knicks-related (no GTA-VI noise),
a multi-sub-market game shows as one expandable row, expanding lets you select a
sub-market, and a single-market event selects directly.

### Tests for User Story 1 ⚠️ (write first, must fail)

- [X] T007 [P] [US1] Hook tests in `frontend/src/test/usePolymarketSearch.test.js`: search calls `…/public-search?q=<encoded>&limit_per_type=…` (never `/markets?search=`), normalizes to events with eligible children, drops ineligible/empty events, and the `knicks` fixture yields only relevant events. (C1, C3, C8; regression)
- [X] T008 [P] [US1] Component tests in `frontend/src/test/PolymarketBrowser.test.jsx`: typing shows grouped event rows; a multi-sub-market event renders one expandable row that reveals children on expand; selecting a child calls `onSelectMarket` with its `conditionId`; a single-market event selects directly without expanding. (T1, T7)

### Implementation for User Story 1

- [X] T009 [US1] Rewrite `usePolymarketSearch({ limit })` in `frontend/src/hooks/usePolymarketSearch.js` to fetch `GET /public-search?q=<query>&limit_per_type=<limit>` via the T006 helper, map results through `normaliseGammaEvent`, return `NormalizedEvent[]`, and clear on blank/whitespace query. (C1; Decision 1)
- [X] T010 [US1] Implement event-grouped rendering in `frontend/src/components/fairwins/PolymarketBrowser.jsx`: one row per `NormalizedEvent` keyed by `id`; events with >1 child get an expand toggle (`aria-expanded`) backed by an `expandedEventIds` set; expanded child list keyed by `conditionId` with `label`; single-child events select on row click; selection calls `onSelectMarket(market)` and honors `selectedConditionId`. (FR-017; Decision 10)
- [X] T011 [US1] Add expandable-event-row and sub-market-list styles (collapsed/expanded, selected child) in `frontend/src/components/fairwins/PolymarketBrowser.css`.
- [X] T012 [US1] Wire the search input through a single debounce to `usePolymarketSearch` in `frontend/src/components/fairwins/PolymarketBrowser.jsx`, removing the component-level pre-debounce so search no longer double-fires. (depends on T010)

**Checkpoint**: Search returns relevant, grouped, expandable, selectable results — MVP usable.

---

## Phase 4: User Story 2 - Narrow the list by category (Priority: P1)

**Goal**: Multi-selectable category chips actually filter browse results (OR
semantics), reusing the grouped event rendering.

**Independent Test**: With no query, tap Sports → sports events; also tap Crypto →
the union of sports OR crypto events; Clear → default top events.

### Tests for User Story 2 ⚠️ (write first, must fail)

- [X] T013 [P] [US2] Hook tests in `frontend/src/test/usePolymarketTopMarkets.test.js`: no category → `GET /events?…order=volume&ascending=false`; one category → includes `tag_id=<seed id>` (never `tag_slug`, never `/markets`); multiple categories → one request per `tag_id`, results merged/de-duped by event `id`. (C2, C5)
- [X] T014 [P] [US2] Component tests in `frontend/src/test/PolymarketBrowser.test.jsx`: selecting a category narrows results; selecting a second shows the union; chips are multi-select (`aria-pressed`); Clear restores default top events; category-empty shows its distinct empty state. (T2)

### Implementation for User Story 2

- [X] T015 [US2] Rewrite `usePolymarketTopMarkets({ categories, limit })` in `frontend/src/hooks/usePolymarketSearch.js` to fetch `GET /events?…&order=volume&ascending=false` (default) and `GET /events?tag_id=<resolveCategoryTagId(slug)>…` per selected category in parallel, merge/de-dupe by event `id`, re-sort by volume, cap at `limit`, and normalize via `normaliseGammaEvent`. (C2, C5; Decisions 2, 4, 5)
- [X] T016 [US2] Make the category chips multi-select in `frontend/src/components/fairwins/PolymarketBrowser.jsx` (toggle add/remove slug, Clear-all) and route browse mode through the shared grouped event render from T010. (FR-002)

**Checkpoint**: Browse-by-category works with OR multi-select; US1 still works.

---

## Phase 5: User Story 3 - Search within a category (Priority: P2)

**Goal**: Combine query + category; the active category constrains search by
default; toggling a category never wipes the typed query.

**Independent Test**: Type `lakers`, toggle Sports → query preserved and results
reflect both; select Sports first then type → constrained; remove Sports →
broadens to query alone.

### Tests for User Story 3 ⚠️ (write first, must fail)

- [X] T017 [P] [US3] Hook test in `frontend/src/test/usePolymarketSearch.test.js`: `usePolymarketSearch({ categories })` keeps only events whose `tagIds` intersect the selected `tag_id`s (OR across categories). (C4)
- [X] T018 [P] [US3] Component tests in `frontend/src/test/PolymarketBrowser.test.jsx`: toggling a category preserves the query; query+category constrains results; selecting a category before typing also constrains (default); removing the category broadens results. (T3)

### Implementation for User Story 3

- [X] T019 [US3] Add a `categories` input to `usePolymarketSearch` in `frontend/src/hooks/usePolymarketSearch.js` and filter the normalized events by `tagIds ∩ resolved selected tag_ids` (OR) before returning. (C4; Decision 6)
- [X] T020 [US3] In `frontend/src/components/fairwins/PolymarketBrowser.jsx`, pass `activeCategories` into `usePolymarketSearch`, and remove the `if (trimmedQuery) setQuery('')` branch in `toggleCategory` so the query persists across category toggles. (FR-003, FR-004)

**Checkpoint**: Query and category compose correctly; US1/US2 still work.

---

## Phase 6: User Story 4 - Trustworthy, responsive results (Priority: P2)

**Goal**: Single debounce, abort/supersession safety, distinct loading/empty/
error states with retry, only eligible markets, and accessibility.

**Independent Test**: Rapid typing updates without out-of-order overwrites; an
induced failure shows an error + working Retry (no stale list); empty/loading are
distinct; every listed market is eligible; axe finds no violations.

### Tests for User Story 4 ⚠️ (write first, must fail)

- [X] T021 [P] [US4] Hook tests in `frontend/src/test/usePolymarketSearch.test.js`: a superseded in-flight request is aborted and never overwrites newer results; non-2xx/network failure sets an error string and clears results; `AbortError` is swallowed. (C6, C7, T5)
- [X] T022 [P] [US4] Component tests in `frontend/src/test/PolymarketBrowser.test.jsx`: distinct loading (skeleton/`aria-busy`), empty (search vs category vs no-markets), and error (`role="alert"` + Retry) states; Retry re-issues the correct request for the active mode; ineligible markets never render. (T4, T6)
- [X] T023 [US4] Accessibility test in `frontend/src/test/PolymarketBrowser.test.jsx` using `vitest-axe`: no violations in collapsed list, expanded event, empty, and error states. (T8) — same file as T022, so runs after it.

### Implementation for User Story 4

- [X] T024 [US4] Consolidate to a single debounce (~300–350ms) and confirm both hooks use the T006 single-flight/supersession helper in `frontend/src/hooks/usePolymarketSearch.js`; remove the now-redundant second debounce. (FR-009, FR-010; Decision 8)
- [X] T025 [US4] Finalize the picker's state UI in `frontend/src/components/fairwins/PolymarketBrowser.jsx`: mutually-exclusive loading/empty/error/list rendering, mode-aware Retry handler, distinct empty copy, and preserved/added ARIA (`aria-expanded` on the expand toggle, keyboard-navigable sub-markets, `role="alert"`, `aria-busy`). (FR-011, FR-012; Constitution V)

**Checkpoint**: All four stories function independently and the picker is trustworthy.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T026 [P] Verify both call sites consume grouped events correctly — `FriendMarketsModal.jsx` (inline) and `Dashboard.jsx` (feed) — and update the PolymarketBrowser stub/assertions in `frontend/src/test/FriendMarketsModal.test.jsx` if the grouped shape changed expectations. (FR-015)
- [X] T027 [P] Remove dead code (old `search=`/`tag_slug` params, double-debounce remnants) and refresh JSDoc in `frontend/src/hooks/usePolymarketSearch.js`.
- [X] T028 Run `npm run lint` and `npm run test:frontend` from `frontend/`; fix any lint/test failures (no `continue-on-error`; Constitution IV).
- [X] T029 Execute the manual validation in `specs/013-polymarket-search-filter/quickstart.md` (search+grouping, multi-select OR, search-within-category, states) and confirm SC-001…SC-009.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–6)**: all depend on Foundational.
  - US1 (P1) is the MVP and introduces the shared grouped render (T010) that US2
    reuses, so **US2 depends on T010**. US3 and US4 also build on US1's hook/UI.
  - Practical order: US1 → US2 → US3 → US4 (priority order). They are
    independently *testable*, but because they edit two shared files, parallel
    development across stories needs coordination.
- **Polish (Phase 7)**: after the desired stories are complete.

### User Story Dependencies

- **US1 (P1)**: after Foundational. No dependency on other stories.
- **US2 (P1)**: after Foundational; reuses US1's grouped render (T010).
- **US3 (P2)**: after Foundational; extends US1's search hook + chips.
- **US4 (P2)**: after Foundational; hardens US1/US2/US3 behavior.

### Within Each User Story

- Write the story's tests first and confirm they fail, then implement.
- In the hook file: normalization/resolver/fetch helper (Phase 2) before hook
  bodies; hook bodies before the component wiring that consumes them.

### Parallel Opportunities

- Setup: T001, T002, T003 all `[P]`.
- Per story, the hook-test task and the component-test task target different
  files and are `[P]` with each other (e.g. T007 ∥ T008; T013 ∥ T014;
  T017 ∥ T018; T021 ∥ T022).
- T023 shares `PolymarketBrowser.test.jsx` with T022 → not parallel with it.
- Implementation tasks editing the same file (hook file T004–T006, T009, T015,
  T019, T024; component file T010, T012, T016, T020, T025) are sequential within
  that file. The CSS task (T011) is `[P]` against hook/component edits.
- Polish: T026 and T027 are `[P]` (different files); T028/T029 run last.

---

## Parallel Example: User Story 1

```bash
# Write the two test layers in parallel (different files), confirm they FAIL:
Task: "T007 Hook tests in frontend/src/test/usePolymarketSearch.test.js"
Task: "T008 Component tests in frontend/src/test/PolymarketBrowser.test.jsx"

# Then implement sequentially within shared files (T009 hook → T010/T012 component),
# with the CSS task in parallel:
Task: "T011 Expandable event-row styles in frontend/src/components/fairwins/PolymarketBrowser.css"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup → 2. Phase 2: Foundational → 3. Phase 3: US1.
4. **STOP and VALIDATE**: search returns relevant, grouped, expandable,
   selectable results (the headline bug — "knicks → GTA VI" — is fixed).
5. Demo/ship the MVP.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → relevant grouped search (MVP).
3. US2 → working multi-select category browse.
4. US3 → search-within-category.
5. US4 → responsiveness, states, a11y hardening.
6. Polish → call-site verification, cleanup, lint/test, quickstart.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- `[Story]` maps each task to a user story for traceability.
- Contract obligations C1–C8 ([contracts/gamma-api.md]) and component obligations
  T1–T8 ([contracts/polymarket-hooks.md]) are covered across the test tasks.
- This is frontend-only — no `contracts/` (Solidity), on-chain, or oracle changes;
  no security-review gate is triggered.
- Commit after each task or logical group; keep CI green (Constitution IV).
