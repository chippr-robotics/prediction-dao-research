---
description: "Task list for feature 094 — End-to-End Coverage Expansion"
---

# Tasks: End-to-End Coverage Expansion

**Input**: Design documents from `/specs/094-e2e-coverage-expansion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: This feature *is* test infrastructure. "Test tasks" here means gates that prove the
infrastructure works — they are required, not optional, because a gate that cannot fail is the exact
defect this feature exists to remove.

**Organization**: Grouped by user story. The branch ships Phases 1–7 (the foundation, per the scope
decision in plan.md); Phase 8 files the flow backlog as sub-issues, and the flows themselves land
against those issues in later branches.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- **[Story]**: US1..US5 from spec.md

## Path Conventions

Repository root. Frontend paths are under `frontend/`, shared scripts under `scripts/e2e/`,
documents under `docs/developer-guide/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the homes for the new artefacts and wire the npm scripts, so every later task
lands in a place that is already read.

- [x] T001 Create `frontend/cypress/coverage/` and `scripts/e2e/` with a README in each stating what the directory holds and which gate reads it
- [x] T002 Add `e2e:matrix`, `check:e2e-matrix` and `e2e:split` scripts to the root `package.json`, following the existing `check:deps` / `check:iac` / `check:finops` idiom
- [x] T003 [P] Create `frontend/src/test/e2e-policy/` and confirm the existing Frontend Unit Tests job picks it up with no workflow change (it globs `src/test/**`)

**Checkpoint**: `npm run check:e2e-matrix` exists and fails cleanly with "no matrix file yet" rather than a stack trace.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The matrix schema and its generator. Everything downstream — the gates, the backlog,
the prioritisation — reads this file, so nothing else can start honestly until its shape is fixed.

**⚠️ MUST complete before Phases 3–8**

- [x] T004 Define the matrix schema in `frontend/cypress/coverage/matrix.json` (version, generatedDoc, specs[]) exactly as fixed in `data-model.md` §1, seeded with the enum values and two example entries
- [x] T005 Write `scripts/e2e/generate-coverage-matrix.js` rendering `docs/developer-guide/e2e-coverage-matrix.md` — grouped by risk (custody first), each group leading with its covered/partial/absent/out-of-scope counts **and** the count of rows whose depth is `smoke` or `none` despite a `covered` status
- [x] T006 Write `frontend/src/test/e2e-policy/coverageMatrix.test.js` enforcing invariants 1–10 from `data-model.md` §1, each failure naming the offending id or path per `contracts/coverage-matrix.md`

**Checkpoint**: the gate fails on a deliberately removed entry and names the directory; it fails on a hand-edited generated document and names the regenerate command.

---

## Phase 3: User Story 1 — The inventory (Priority: P1) 🎯 MVP

**Goal**: A reader can pick any shipped feature and correctly predict whether CI would catch a break
in its flows.

**Independent test**: Pick five spec directories at random, including one with no member surface;
each has a row that reads true against the suite.

- [x] T007 [US1] Enumerate all 96 directories under `specs/` into `matrix.json` — id is the **directory name**, never the number (three numbers are reused across two features each)
- [x] T008 [P] [US1] Mark the non-member-facing specs (`006-local-dev-environment`, `046-contract-audit-coverage`, `075-monorepo-workspaces`, `076-monorepo-semantic-versioning`, `079-hardhat-3-migration`, `080-deterministic-addresses`, `087-infrastructure-as-code`, `089-finops-dashboard`, and any peer) `memberFacing: false` with a reason
- [x] T009 [US1] Record the flows for the **custody** group — 034 wager pools, 067 bridge + supplied liquidity, 050-earn/065/066 earn and staking, 061 bitcoin, 062 legacy recovery, 043/049/068 protect — with status, tier, depth, risk and proposed tier
- [x] T010 [P] [US1] Record the flows for the **disclosure** group — 060 platform fees, 057 predict/Polymarket, 055/056 collect, 082/083 perps, 050-sponsored-paymaster
- [x] T011 [P] [US1] Record the flows for the **access** group — 054 callsigns, 073 mini-apps, 093 admin mini-apps, 072 tenants, 069 endpoints, 084 verify, 085 hardware, 007 compliance, 027/026 membership
- [x] T012 [P] [US1] Record the flows already covered by `e2e/full/**`, `e2e/fast/**` and `e2e/passkey/**`, citing the test ids that back each claim
- [x] T013 [US1] Re-read `05-wager-acceptance`, `06-decline-cancel`, `07-manual-resolution` and `10-claim-payouts` and record their **true** depth — a branch guarded by a precondition that can be absent is `smoke`, not `settled`, however many tests pass
- [x] T014 [US1] Apply the R9 disposition to flows that cannot be driven locally: cover to the venue boundary, or `out-of-scope` with the reason — never a silent skip
- [x] T015 [US1] Generate `docs/developer-guide/e2e-coverage-matrix.md` and commit it alongside the source

**Checkpoint**: US1 is independently shippable. Every spec has a row, the document renders, the gate passes.

---

## Phase 4: User Story 2 — Policy and enforcement (Priority: P1)

**Goal**: A contributor can choose a tier from the document alone, and cannot land a test that
cannot fail.

**Independent test**: Introduce each codified anti-pattern; each is rejected by a gate naming the rule.

- [x] T016 [US2] Write `docs/developer-guide/e2e-testing-policy.md` from `contracts/tiering-policy.md`: three tiers with purpose and cost, the two admission rules, the runtime budgets, the seven anti-patterns each with the failure it caused, and the fixture/precondition conventions
- [x] T017 [US2] Write `frontend/src/test/e2e-policy/assertionDepth.test.js` — fail on an unconditional-truth assertion in `cypress/e2e/**` unless the preceding line carries `// EITHER-WAY: <reason>`; report the total count in the failure message so the number is visible
- [x] T018 [US2] Extend that gate to report success assertions whose accepted-terms list also contains failure wording (`'resolved'` beside `'failed'`/`'error'`)
- [x] T019 [US2] Extend that gate to require an `issue` on every accessibility suppression, and to report the suppression count
- [x] T020 [US2] Annotate the 33 existing vacuous branches with `// EITHER-WAY:` naming the rewrite issue — **annotate, do not rewrite**: they are money-path tests and the rewrite is its own reviewed change (T041)
- [x] T021 [P] [US2] Write `frontend/src/test/e2e-policy/harnessBoundary.test.js` asserting nothing under `frontend/src/` imports `axe-core`, so the injected ruleset can never reach a production bundle
- [x] T022 [US2] Cross-link the policy from `CLAUDE.md`'s testing guidance and from `docs/developer-guide/e2e-coverage-matrix.md`

**Checkpoint**: the gates run inside the existing unit-test job; the unconditional-truth count is reported and shrinking-by-construction.

---

## Phase 5: User Story 4 — Viewports and accessibility (Priority: P2)

**Goal**: Every no-chain flow runs at a phone width as well as a desktop one, and is scanned by a
real ruleset.

**Independent test**: Remove a control's accessible name, or push a control outside the phone
viewport; the run fails naming the offender.

- [x] T023 [US4] Write `frontend/cypress/support/viewports.js` — `phone` 390×844 and `desktop` 1280×720, selected by `CYPRESS_VIEWPORT_PROFILE`, defaulting to `desktop`, logged once per run
- [x] T024 [US4] Apply the profile from a global `beforeEach` in `frontend/cypress/support/e2e.js` so a new spec is covered at both widths with no author action
- [x] T025 [US4] Add `cy.assertReachable(selector)` asserting the control is inside the layout viewport and unclipped by any ancestor — `should('be.visible')` passes for an element scrolled outside a clipping container
- [x] T026 [US4] Write `frontend/cypress/support/a11y.js` — `cy.a11yScan({ context, disableRules })` injecting the installed `axe-core` via a Cypress task, failing on `serious` and `critical` with rule id, impact and selectors, and failing if injection itself failed
- [x] T027 [US4] Reject any `disableRules` entry with no `issue`, in the command itself as well as in the gate
- [x] T028 [US4] Delete `cy.checkA11y` from `frontend/cypress/support/commands.js` — it guards both its loops with `if ($els.length > 0)` and passes when there is nothing to check; leaving it is leaving a weaker twin
- [x] T029 [US4] Convert `frontend/cypress/e2e/fast/22-accessibility.cy.js` to run the ruleset per surface, scoping modal scans to the modal root rather than the document
- [ ] T030 [US4] Add `cy.a11yScan` calls to the other no-chain specs at each distinct surface they reach, and record the resulting suppression list with its issues — **not done in this branch**: the suppression list can only be written from a real run, and the Cypress binary could not be downloaded in this environment (the 250 MB fetch truncated repeatedly). The command and its gate are in place; the sweep belongs with the first run that can execute it.

**Checkpoint**: both viewport legs pass; the desktop leg is byte-for-byte the behaviour of today's suite.

---

## Phase 6: User Story 5 — Performance budgets (Priority: P3)

**Goal**: Key routes are measured on both profiles, and a route that was not measured fails.

**Independent test**: Add an unserved route to the route list; the coverage check fails naming it.

- [x] T031 [US5] Create `frontend/lighthouse-routes.json` from the real router — `/`, `/app`, `/wallet`, `/wallet?tab=trade`, `/apps`, `/admin`, `/terms` — with a note per route saying why it is budgeted
- [x] T032 [US5] Split `frontend/lighthouserc.json` into `lighthouserc.desktop.json` and `lighthouserc.mobile.json`, both reading the one route list, preserving the current assertion set
- [ ] T033 [US5] Baseline the budgets from a real measurement on each profile and record the numbers with their run reference — **not done in this branch**: the two configs carry the previous warn-level assertions unchanged, so nothing regressed, but the numbers are inherited rather than measured. The first CI run on both profiles is what produces them.
- [x] T034 [US5] Write `scripts/e2e/check-lighthouse-coverage.js` failing when any route × profile produced no `lhr-*.json`, naming the missing pair
- [x] T035 [US5] Update `.github/workflows/frontend-testing.yml` to run both profiles and then the coverage check, keeping the existing step summary and artefact upload

**Checkpoint**: both profiles report; an unmeasured route fails rather than passing quietly.

---

## Phase 7: User Story 3's precondition — Runtime and sharding (Priority: P1)

**Goal**: The on-chain tier is fast enough and independent enough to absorb the backlog.

**Independent test**: The four legs together pass exactly the set the serial tier passed.

- [x] T036 Record per-spec durations from a real CI run into `frontend/cypress/coverage/full-tier-weights.json` with `measuredAt` and the run reference — done from Actions run 32204349960, all 15 specs measured. Three are provisional (their work is mostly in chainTx tasks, or tests were skipped) and the file says so.
- [x] T037 Write `scripts/e2e/split-full-tier.js` — longest-processing-time-first over the weights, `--shards`/`--index`/`--csv`/`--print-all`, assigning the file mean to any unmeasured spec and **reporting it by name** (a silently dropped spec leaves the merge gate)
- [x] T038 Convert `cypress-full-e2e` in `.github/workflows/test.yml` to a 4-leg matrix, each leg starting its own Hardhat node, deploying and seeding, with a per-leg timeout sized to the measured leg rather than the old 60-minute serial cap
- [x] T039 [P] Add the viewport matrix (`phone`, `desktop`) to `cypress-fast-e2e` in the same workflow
- [x] T040 Run the sharded matrix and compare against the serial baseline — **done**: all four shards passed on the first sharded run at 6:37 / 7:51 / 6:29 / 6:09, against a measured serial total of 1621s (~27 min), which corroborates the issue's "~30 min" figure. With the measured weights the predicted critical path is 421s and the legs balance to within 2s of each other.

**Checkpoint**: measured wall clock recorded against the budget; `test/config/CiGates.test.js` still passes over the rewritten jobs.

---

## Phase 8: User Story 3 — The flow backlog (Priority: P1, delivered against sub-issues)

**Goal**: No gap exists only inside a document.

- [x] T041 File the sub-issues of #1228, ordered by money-at-risk, each naming its flow id, proposed tier, risk and the matrix row it closes — including one for rewriting the 33 vacuous branches annotated in T020
- [x] T042 Write the `issue` field of every `absent`/`partial` row back into `matrix.json`, regenerate the document, and post the matrix summary as a comment on #1228

**Checkpoint**: #1228's acceptance criteria are all met by artefacts in the repository or issues on the tracker.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [x] T043 [P] Update `CLAUDE.md` with a short spec-094 entry: the matrix is the source of truth, the two admission rules, and "never add an e2e dependency without reading spec 075's lockfile hazard"
- [x] T044 [P] Confirm `npm run check:deps` reports the lockfile unchanged — this feature adds no dependency, and that claim must be verified, not asserted
- [x] T045 Run the full validation sequence in `quickstart.md` §7 and record the results in the PR body — everything except the Cypress runs, which need the binary this environment could not download

---

## Dependencies & Execution Order

```
Phase 1 (Setup)
  └─> Phase 2 (Matrix schema + generator + gate)   ← blocks everything
        ├─> Phase 3  US1 inventory        ← MVP, independently shippable
        ├─> Phase 4  US2 policy + gates   (needs the depth enum from Phase 2)
        ├─> Phase 5  US4 viewports + a11y (independent of 3 and 4)
        ├─> Phase 6  US5 performance      (independent of everything above)
        └─> Phase 7  sharding             (independent; needs a CI run for T036)
              └─> Phase 8  backlog        (needs Phase 3's rows and Phase 4's annotations)
                    └─> Phase 9  polish
```

**Story independence**: US1, US4 and US5 touch disjoint files and can proceed in parallel once
Phase 2 lands. US2 depends on Phase 2's enums and on US1 only for the *content* of the annotations,
not for the gates themselves.

## Parallel Execution Examples

**After Phase 2, three streams run concurrently:**

- Stream A (US1): T009 → T010/T011/T012 in parallel → T013 → T014 → T015
- Stream B (US4): T023 → T024/T025 → T026 → T027 → T028 → T029 → T030
- Stream C (US5 + shard): T031 → T032 → T033 → T034 → T035, alongside T036 → T037 → T038

**Within Phase 3**: T010, T011 and T012 edit disjoint regions of one file — coordinate by writing
each group to a separate fragment and merging, or serialise them; they are marked [P] on the
understanding that the file is assembled group-by-group.

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3.** The matrix alone answers #1228's central question and is
useful the day it lands, even if nothing else follows.

**Increment 2** = Phase 4: the rules, and the gates that keep the matrix from being re-falsified.

**Increment 3** = Phases 5–7: the harness and the runtime, which are what make the backlog cheap to
work through.

**Increment 4** = Phase 8: hand the backlog to the tracker, where it can be assigned.
