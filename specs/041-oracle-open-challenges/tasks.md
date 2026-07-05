# Tasks: Oracle-Settled Open Challenges (Polymarket)

**Input**: Design documents from `/specs/041-oracle-open-challenges/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D9), data-model.md, contracts/

**Tests**: INCLUDED — Constitution Principle II (test-first) is non-negotiable, and the
plan's Constitution Check commits to contract-level lifecycle tests for the
previously-untested `createOpenWager` + Polymarket path before the UI ships it.

**Organization**: Grouped by user story; US1 (create) and US2 (claimant) are the joint
MVP, US3 (discovery/share polish) layers on top.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (create flow), US2 (claimant clarity), US3 (fast discovery & sharing)

## Path Conventions

Web app: product code under `frontend/src/`, contract JS tests under `test/`
(no Solidity changes — `contracts/` source is untouched).

---

## Phase 1: Setup (Baseline)

**Purpose**: Anchor the zero-regression guarantee (SC-007) before any edits.

- [X] T001 Record a green baseline: run `npm test` (contract suite) and
      `npm run test:frontend`; note current pass counts in the PR description or
      commit message so SC-007 regressions are attributable. No file changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Risk gate + shared modules every story builds on.

**⚠️ CRITICAL**: T002 is the constitutional risk gate (oracle-resolution path); the
shared helpers/hooks (T003–T009) block both US1 and US2.

- [X] T002 [P] Contract lifecycle proof (D1, FR-017, SC-006, SC-008): create
      `test/integration/oracle/WagerRegistry_PolymarketOpenChallenge.test.js` modeled
      on `test/integration/oracle/WagerRegistry_Polymarket.test.js` fixtures
      (`MockPolymarketCTF` → `PolymarketOracleAdapter` → `deployWagerRegistry` from
      `test/helpers/proxy.js` with the adapter as 3rd init arg) and the code-based
      accept helpers from `test/WagerRegistry.openChallenge.test.js`. Cover:
      (a) `createOpenWager(..., Polymarket, conditionId, creatorIsYes, ...)` succeeds
      for an unresolved condition, emits `OpenWagerCreated` + `PolymarketLinked`;
      (b) creation reverts: zero conditionId (`PolymarketRequired`), pre-resolved
      condition (`ConditionAlreadyResolved`), registry without adapter
      (`AdapterNotSet`), and `Creator`/`Opponent` types still revert
      (`OpenResolutionTypeNotAllowed`); (c) code-holder accepts via `acceptOpenWager`,
      then `autoResolveFromPolymarket` settles YES-win, NO-win, tie→draw, and reverts
      `ConditionNotResolved` when unresolved; winner claims payout; (d) untaken oracle
      open challenge expires → creator refund.
- [X] T003 [P] Create `frontend/src/lib/openChallenge/oracleTimeline.js` per
      contracts/timeline-derivation.md: export `deriveOracleChallengeTimeline(marketEndIso, nowMs)`
      and constants `MIN_LEAD_MS` (1h), `ACCEPT_CAP_MS` (30d−1h), `SETTLE_BUFFER_MS`
      (7d), `RESOLVE_CAP_MS` (180d−1h); pure, injected clock, returns
      `{ eligible, reason, acceptDeadlineMs, resolveDeadlineMs, acceptCapped }`.
- [X] T004 [P] Create `frontend/src/test/oracleTimeline.test.js`: eligibility floor,
      cap behavior (`acceptCapped`), settle buffer, invariants
      `now < accept < resolve ≤ now+180d` across near/far/absent/garbage end dates
      (SC-003).
- [X] T005 [P] Export `normaliseGammaMarket` from
      `frontend/src/hooks/usePolymarketSearch.js` (named export; no behavior change —
      existing search/browse hooks keep using it internally).
- [X] T006 Create `frontend/src/hooks/usePolymarketMarket.js` per
      contracts/polymarket-market-hook.md: fetch
      `{gammaBase}/markets?condition_ids=<id>&limit=1` (gamma base resolved like
      `usePolymarketSearch`), normalize via `normaliseGammaMarket`, return
      `{ market, isLoading, error, refresh }`; no fetch when conditionId is
      falsy/ZeroHash or `enabled:false`; AbortController on unmount/param change;
      never throws into render. (Depends on T005.)
- [X] T007 [P] Create `frontend/src/test/usePolymarketMarket.test.jsx`: success
      normalization, not-found, network error → `{market:null, error}`, disabled/zero
      conditionId skips fetch, `refresh()` refetches.
- [X] T008 Extract `ClaimCodeResultPanel` per contracts/create-flow.md: new
      `frontend/src/components/fairwins/ClaimCodeResultPanel.jsx` carrying the
      post-create result UI currently inside
      `frontend/src/components/fairwins/OpenChallengeModal.jsx` (one-time code display,
      copy-with-check, `WagerQRCode` + `buildTakeChallengeUrl` deep link,
      `useOpenChallengeCodeVault` auto-backup states); rewire `OpenChallengeModal.jsx`
      to render it with zero user-visible behavior change (FR-018).
- [X] T009 Extend `frontend/src/hooks/useOpenChallengeCreate.js` per
      contracts/create-flow.md: accept optional `form.oracleMeta`; seal
      `{ description, createdAt: <ISO now>, oracle: oracleMeta }` when present
      (unchanged payload otherwise); add oracle revert translations to
      `translateOpenCreateRevert` (`PolymarketRequired`, `AdapterNotSet`,
      `ConditionAlreadyResolved`, `PolymarketDisallowed`).
- [X] T010 Extend `frontend/src/test/claimCode/OpenChallengeModal.test.jsx` (and add
      hook-level assertions there or in a sibling test) to cover: result-panel
      extraction leaves the user-defined flow identical, sealed payload includes
      `createdAt` + `oracle` block only when `oracleMeta` given, and the new revert
      translations map to friendly messages. (Depends on T008–T009.)

**Checkpoint**: Foundation ready — `npm test` + `npm run test:frontend` green.

---

## Phase 3: User Story 1 — Pick a Polymarket event and post an oracle-settled open challenge (Priority: P1) 🎯 MVP

**Goal**: Silver+ member browses/searches Polymarket markets, picks a side and stake,
sees the event-derived timeline, creates, and gets the shareable four-word code.

**Independent Test**: On a Polymarket-capable chain, create an oracle open challenge
end-to-end from the new section; verify escrow, code issuance, on-chain market linkage
+ side, and deadlines consistent with the event (quickstart §3 steps 1–3).

- [X] T011 [US1] Create `frontend/src/components/fairwins/OracleOpenChallengeModal.jsx`
      per contracts/create-flow.md — structure + discovery step: `fm-*` modal shell
      (mirror `OpenChallengeModal.jsx` header/close/backdrop/Escape patterns), gating
      (`useChainTokens().capabilities.polymarketSidebets` +
      `isOracleModelExposed(ResolutionType.Polymarket)` from
      `frontend/src/constants/wagerDefaults.js`), embedded
      `<PolymarketBrowser variant="inline" showFilters limit={20}
      onSelectMarket selectedConditionId>`; selecting a market runs
      `deriveOracleChallengeTimeline(market.endDate, nowMs)` (mount-anchored `nowMs`)
      and refuses ineligible markets with the returned `reason` displayed.
- [X] T012 [US1] Add the configure step to `OracleOpenChallengeModal.jsx`: selected
      market summary (question, image, end date, live outcome prices); side picker —
      two labelled buttons from `market.outcomes[].name` (fallback Yes/No) with prices,
      `aria-pressed`, index 0 → `creatorIsYes: true` (D6); stake input identical to
      OpenChallengeModal's (USDC select, `> 0`, 2-dp blur normalize); read-only derived
      timeline summary ("Takeable until … · settles by …", provenance "from the
      event", disclosure when `acceptCapped`); "change market" affordance back to the
      picker.
- [X] T013 [US1] Wire submit in `OracleOpenChallengeModal.jsx`: compose `description`
      (market question + chosen side label), call `createOpenChallenge({ description,
      stake, resolutionType: ResolutionType.Polymarket, oracleConditionId:
      market.conditionId, creatorIsYes, acceptDeadline, resolveDeadline, oracleMeta })`
      with progress states; on success render `ClaimCodeResultPanel`; surface
      translated reverts (incl. `ConditionAlreadyResolved` → back to picker per
      FR-008).
- [X] T014 [P] [US1] Create `frontend/src/components/fairwins/OracleOpenChallengeModal.css`
      (section-specific styles over the shared `fm-*`/`OpenChallengeModal.css` base;
      side-picker buttons meet contrast + focus-visible requirements).
- [X] T015 [US1] Dashboard entry point: add `oracle-open-challenge` to
      `frontend/src/constants/quickAccessCards.js`; in
      `frontend/src/components/fairwins/Dashboard.jsx` add the card to `createActions`
      (capability-aware like `create-1v1-oracle`), a `handleQuickAction` case opening
      the new modal, and the `<OracleOpenChallengeModal>` instance beside
      `<OpenChallengeModal>` (FR-001, FR-004).
- [X] T016 [P] [US1] Create `frontend/src/test/claimCode/OracleOpenChallengeModal.test.jsx`:
      renders feed with no input; ineligible market unselectable with reason; side/stake
      step gates create button; submit passes `resolutionType=4`, conditionId,
      `creatorIsYes` per side, derived deadlines, and `oracleMeta` (mock
      `useOpenChallengeCreate`); success shows the code result panel; hidden/locked
      when capability or oracle-model exposure is off.
- [X] T017 [P] [US1] Extend `frontend/src/test/Dashboard.test.jsx`: new card appears
      (and is gated by `polymarketSidebets`), quick action opens the oracle modal, the
      existing `open-challenge` card still opens the user-defined modal.

**Checkpoint**: US1 independently testable — create flow works end-to-end against a
mocked create hook in tests and real Amoy manually (quickstart §3.1–3.3).

---

## Phase 4: User Story 2 — Claimant opens the code and clearly understands the bet (Priority: P1) 🎯 MVP

**Goal**: A code-holder sees the full bet summary — question, THEIR side, stake,
payout, deadlines — with Polymarket unmistakably identified as the automatic settlement
source, live market context when reachable, and honest warnings/blocks around
closed/resolved markets.

**Independent Test**: With a code from US1, look it up as another member and verify the
single-view summary in live, degraded (Gamma offline), closed, and resolved states;
accept and confirm standard oracle settlement (quickstart §3.4–3.6).

- [X] T018 [US2] Extend `frontend/src/components/fairwins/TakeChallengePanel.jsx` per
      contracts/claimant-view.md — bet summary + oracle block: for
      `Number(wager.resolutionType) === ResolutionType.Polymarket`, render between the
      terms `<pre>` and `<ChallengeDeadlines>`: market question (verified
      `terms.oracle` → live → shortened conditionId fallback), "You take
      {takerSideLabel} / Creator holds {creatorSideLabel}" driven by on-chain
      `creatorIsYes` (labels from verified terms or live outcomes), and the
      stake/payout line from on-chain `opponentStake` + token metadata (stake/payout
      line renders for non-oracle challenges too). Include the integrity check:
      `terms.oracle.conditionId` vs `wager.polymarketConditionId` mismatch → warning +
      prefer live data (Constitution III).
- [X] T019 [US2] Add the settlement-source badge + live context to
      `TakeChallengePanel.jsx`: distinct text+glyph badge "Settled automatically by
      Polymarket" with the plain-language explanation (shown in live AND degraded
      states), public market link when slug known; wire
      `usePolymarketMarket(wager.polymarketConditionId)` for current prices/status
      (`role="status"`, skeleton while loading, disclosed "live market info
      unavailable" on error with accept still enabled); accept gate per D8 —
      closed/past-end → prominent warning, publicly resolved outcome → accept button
      disabled with adjacent explanation (FR-013..FR-015).
- [X] T020 [P] [US2] Create `frontend/src/test/claimCode/TakeChallengePanel.oracle.test.jsx`:
      full summary fields present on one view (SC-004); Polymarket named in live and
      degraded states (SC-005); side labels follow `creatorIsYes` both ways; integrity
      mismatch warning; closed-market warning vs resolved-market accept block;
      non-oracle challenge unchanged except stake/payout line; a11y roles
      (`role="status"`, button semantics).
- [X] T021 [P] [US2] Extend `frontend/src/test/useOpenChallengeAccept.test.jsx`:
      lookup payload passes through `resolutionType`, `polymarketConditionId`,
      `creatorIsYes` untouched, and decrypted terms with an `oracle` block reach the
      caller (accept flow itself unchanged — FR-016).

**Checkpoint**: US1+US2 together = MVP (quickstart §2–§3 fully green).

---

## Phase 5: User Story 3 — Fast, exciting discovery and effortless sharing (Priority: P2)

**Goal**: Section opens straight into a browsable feed; filters/search feel immediate;
grouped events stay scannable; share tools at hand — SC-001/SC-002 interaction targets.

**Independent Test**: Timed walkthrough per quickstart §3.1–3.3: open section → code in
hand in under 2 minutes, ≤ 3 interactions from feed to side-picked market; feed/search
under ~2 s typical.

- [X] T022 [US3] Discovery polish in `OracleOpenChallengeModal.jsx` +
      `OracleOpenChallengeModal.css`: default feed opens expanded with popular markets
      (no input required), event-grouped rows expand inline, ineligible-market reason
      copy is friendly ("ends too soon…"), selection → configure step transition is a
      single tap, and an `InfoTip` explains the section ("Polymarket settles it — you
      just pick a side and share the code").
- [X] T023 [US3] Share-readiness pass on `ClaimCodeResultPanel.jsx`: copy / QR /
      take-challenge deep link and vault-backup states visible without scrolling on
      mobile-width viewport; code-retention prompt copy mentions the taker needs the
      code to read the bet (parity with FR-010; no new mechanics).
- [X] T024 [P] [US3] Extend `frontend/src/test/claimCode/OracleOpenChallengeModal.test.jsx`
      for US3 acceptance: feed renders with zero input, grouped event expands, ≤ 3
      interactions from feed to side selection (assert step transitions), stale-result
      guard (loading state shown while switching filters).

---

## Phase 6: Polish & Cross-Cutting

- [X] T025 [P] Accessibility audit additions in
      `frontend/src/test/accessibility.test.jsx`: axe checks over
      `OracleOpenChallengeModal` (both steps) and the oracle-summary
      `TakeChallengePanel` state (WCAG 2.1 AA — Constitution V).
- [X] T026 [P] Update `docs/` developer notes: brief section in the wagers/oracle
      developer guide (e.g. `docs/developer-guide/` alongside existing guides) covering
      the sealed `oracle` terms block, timeline-derivation constants, and the
      chain-authoritative display rule (D4).
- [X] T027 Full verification sweep per quickstart: `npm run compile`, `npm test`,
      `npm run test:frontend`, frontend lint — all green with zero regressions
      (SC-007); compare against the T001 baseline.
- [ ] T028 (PENDING — needs a wallet on Amoy; see PR description) Manual quickstart §3 walkthrough on Amoy (create → share → second-wallet
      claim view incl. degraded state → accept) and record outcomes in the PR
      description (SC-001/SC-004/SC-005 evidence).

---

## Dependencies

```text
Phase 1 (T001)
  └─► Phase 2: T002 ∥ (T003→T004) ∥ (T005→T006→T007) ∥ (T008→T009→T010)
        └─► Phase 3 (US1): T011→T012→T013; T014 ∥; T015 after T011; T016/T017 after T013/T015
              └─► Phase 4 (US2): T018→T019; T020/T021 after T019   [needs T006, T009 sealing]
                    └─► Phase 5 (US3): T022→T023; T024 after T022  [polish over US1 UI]
                          └─► Phase 6: T025–T028
```

- US2 depends on Foundational (T006 hook, T009 sealed block) and benefits from US1 for
  end-to-end data, but its component tests run against fixture wagers — implementable
  in parallel with US1 after Phase 2 if desired.
- T002 (contract proof) has no frontend dependents and can run fully in parallel.

## Parallel Execution Examples

- **Phase 2**: T002, T003+T004, T005→T006+T007, T008→T009→T010 are four independent
  tracks (different files).
- **US1**: T014 (CSS) and T016/T017 (tests) parallel to late implementation tasks.
- **US2**: T020 and T021 in parallel once T019 lands.

## Implementation Strategy

**MVP = Phase 2 + US1 + US2** (create + claim are one promise; US1 alone already
demos end-to-end with the existing lookup showing terms + deadlines). Ship order:
foundation risk-gate first (T002 proves the chain path), shared modules, then US1 and
US2 (parallelizable), US3 polish, final sweep. Each checkpoint leaves the branch green
(`npm test` + `npm run test:frontend`).
