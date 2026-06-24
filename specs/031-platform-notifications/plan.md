# Implementation Plan: Platform-Wide Notification & Activity System

**Branch**: `feat/platform-notifications-031` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/031-platform-notifications/spec.md`

## Summary

Generalize the wager-only activity watcher (spec 012) into a **domain-agnostic, source-driven** activity
system so all four current domains — wagers, ClearPath DAO governance, token administration, and
membership — feed one durable, per-(account, chain) feed behind the header bell, with unread counts,
action-needed signals, live toasts, and a per-domain view filter.

The research (`research.md`) shows the existing engine is already ~80% domain-agnostic. The plan extracts
an **`ActivitySource` interface** and a generalized **`ActivityProvider`** that runs N sources per cycle,
reusing verbatim the proven, generic machinery: the persisted store envelope (versioned, corrupt-reset,
account+chain scoped), `appendEntries` (id-dedup + cap), `markRead`, the scope-swap/in-flight-guard
refs, the 30 s visibility-aware poll loop, and the toast policy (per-cycle cap, catch-up feed-only,
one-failure-notice). The wager logic becomes the first source with **no behavior change**.

The unifying technical decision: **every source uses the same snapshot-diff kernel** the wagers use —
read the user's current on-chain state for that domain each cycle, diff it against the prior per-source
snapshot, emit an entry on change (first-sight = snapshot-only, zero entries). This makes new domains
honest and **backend-free**: a "role granted to you" / "membership upgraded" / "proposal entered voting"
is detected as a *state change between two polls*, not via a complete historical event index (which would
need a subgraph/backend we do not have). Gaps that genuinely require historical event coverage are
documented and omitted per Constitution III, never faked.

## Technical Context

**Language/Version**: JavaScript (ES2022) + JSX; React 18 function components/hooks.

**Primary Dependencies**: React + Vite; ethers v6 (on-chain reads); the existing `src/data/notifications/*`
pure data layer (reused) and `src/contexts/UIContext` toast channel; domain read paths already in the app
— `fetchFriendMarketsForUser` + `fetchDrawProposals` (wagers), `useClearPath`/`governorConnector` (DAO),
`useTokenFactory` + token ABIs (token), `MembershipManager`/`MembershipVoucher` ABIs + `useRoleDetails`/
`useVouchers` (membership).

**Storage**: Browser `localStorage` only, key-scoped per `(account, chainId)` (no backend, FR-022).
Generalized store key `platform_activity_v1_<chainId>` (prefixed `fw_user_<address>_` by `userStorage`),
with a one-time migration of the legacy `wager_activity_v1` slice into the wagers partition so no
read-state is lost.

**Testing**: Vitest + jsdom (pure-module unit tests + provider integration test) and `vitest-axe` for the
feed/bell/filter accessibility, mirroring the existing `src/test/{activityStore,diffEngine,derivedState,
deadlineWarnings,WagerActivityContext}.test.*` conventions.

**Target Platform**: The existing single-page app (modern browsers); app-mode tree only (landing pages
never poll).

**Project Type**: Web frontend (SPA). Frontend-only feature.

**Performance Goals**: Opening the bell/feed is instant (reads in-memory state). Detection runs ~30 s
while visible, paused when hidden (FR-024). On-chain read load per cycle stays bounded: cheap per-cycle
state reads for token/membership/wager snapshots; the DAO source caches each tracked DAO's proposal list
(the bounded log scan) and per cycle only re-reads `state`/`votes`/`hasVoted` for **non-terminal**
proposals, refreshing the proposal-list scan on a slower sub-cadence.

**Constraints**: No application backend (FR-022); honest state — retain-on-failure, no fabrication,
partial results marked (FR-017/019/020, Constitution III); strict per-(account, chain) isolation
(FR-015/016); WCAG 2.1 AA with preserved aria-live/roles/focus (FR-023, Constitution V); no new core tech
(Constitution Additional Constraints).

**Scale/Scope**: 4 sources; up to a small number of tracked DAOs per user (each bounded-scan capped at 50
recent proposals, partial beyond); ≤100 merged entries retained per scope (existing `MAX_ENTRIES`).

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1.*

| Principle | Assessment |
|-----------|-----------|
| **I. Security-First Smart Contracts** | **No contract changes.** Frontend-only generalization over existing on-chain state. The only ABI change is adding the **already-existing** OZ Governor view functions `hasVoted(proposalId,account)` and `getVotes(account,timepoint)` (and, if readable, `proposalEta`) to the frontend Governor read-ABI so DAO "you can still vote" is truthful — reads only, no new/changed Solidity, no deployment. Smart-contract security gate **N/A**. |
| **II. Test-First & Coverage** | Pure data modules (the engine, each source's diff/derive) are unit-tested first, mirroring the existing `diffEngine`/`activityStore` tests (full-shape `.toEqual`, deep-freeze non-mutation, idempotence re-diff, case-insensitive addresses, fixed `NOW`); the provider gets an integration test with mocked source seams; the feed/bell/filter get axe tests. Wager **no-regression** is locked by keeping the existing pure modules and their tests intact. |
| **III. Honest State, No Mocks** | Core design principle here: snapshot-diff detects real state changes; failures retain prior state and surface at most one notice; partial DAO scans are marked partial; documented gaps are **omitted, never faked**. Per-(account, chain) scoping preserved end to end. |
| **IV. Fail Loudly in CI** | Lint, unit/integration tests, and accessibility checks gate the PR; no `continue-on-error` added. |
| **V. Accessible, Consistent Frontend** | Preserve the existing dialog role/label, focus-on-open, Escape-to-close, bell aria-label-with-count, and toast polite/assertive split; the new domain filter is keyboard-operable buttons with visible focus and does not steal panel focus; axe passes. Contract addresses/ABIs continue to come from the generated sync artifacts (no hardcoding). |

**Result**: PASS (no violations; no Complexity Tracking entries required). Re-checked after Phase 1 — still PASS (design adds one provider, one source interface, four small source modules, and additive UI; no new core technology, no backend, no contracts).

## Project Structure

### Documentation (this feature)

```text
specs/031-platform-notifications/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (engine seam, per-domain detection, gaps)
├── data-model.md        # Phase 1 — entities, generalized store v1, entry shape, snapshots
├── contracts/           # Phase 1 — internal interface contracts
│   ├── activity-source.md   # The ActivitySource interface every domain implements
│   └── store-schema.md      # Persisted store v1 shape + migration from wager_activity_v1
├── quickstart.md        # Phase 1 — runnable validation scenarios
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root) — frontend only

```text
frontend/src/
├── data/notifications/
│   ├── activityStore.js          # GENERALIZE: store envelope partitioned by source key (+ migration)
│   ├── diffEngine.js             # REUSE (wager kernel) — unchanged; stamp domain:'wagers'
│   ├── derivedState.js           # REUSE (wager) — unchanged
│   ├── deadlineWarnings.js       # REUSE (wager) — unchanged
│   ├── drawProposalScan.js       # REUSE (wager) — unchanged
│   ├── activityEngine.js         # NEW: run N sources, merge, cap toasts once, persist per scope
│   └── sources/                  # NEW: one ActivitySource per domain
│       ├── index.js              #   the source registry (ordered list)
│       ├── wagerSource.js        #   wraps existing fetch/diff/derive — no behavior change
│       ├── daoSource.js          #   listExternalDAOs + governor state diff (proposal events)
│       ├── tokenSource.js        #   role/pause snapshot diff on administered tokens
│       └── membershipSource.js   #   tier/expiry snapshot diff + expiring-soon + voucher
├── contexts/
│   ├── ActivityContext.js        # NEW: context object + POLL_INTERVAL_MS (generic)
│   └── ActivityProvider.jsx      # NEW: generalized provider (replaces WagerActivityProvider)
├── hooks/
│   └── useActivity.js            # NEW: useActivity()/useActivityOptional() (supersede useWagerActivity)
├── components/notifications/
│   ├── ActivityFeed.jsx          # EDIT: render any domain (domain tag + generic deep-link) + filter
│   ├── ActivityFeed.css          # EDIT: filter row + per-domain tag styles
│   └── NotificationBell.jsx      # EDIT: fold action-needed into the indicator/aria-label
├── abis/externalDAORegistry.js   # EDIT: add hasVoted/getVotes (+proposalEta if present) to GOVERNOR_READ_ABI
└── App.jsx                       # EDIT: mount ActivityProvider in place of WagerActivityProvider

frontend/src/test/                # NEW/EDIT unit + integration + a11y tests (mirror existing suite)
```

**Structure Decision**: Frontend-only. Keep the proven pure data layer in `src/data/notifications/` and
add a thin `activityEngine` + a `sources/` folder; introduce a generic `ActivityProvider`/`useActivity`
that supersede the wager-named provider/hook (the wager pure modules stay, now invoked by `wagerSource`).
The bell/feed are edited in place to render any domain and gain the filter. No backend, no contracts, no
new core technology.

## Phase 0 — Research

See `research.md`. All Technical-Context unknowns resolved: the generalization seam (ActivitySource +
engine), the per-domain detection strategy (shared snapshot-diff kernel; DAO list via the existing bounded
log scan with cached/throttled re-scan), the legacy-store migration, and the documented client-side
detection **gaps** (DAO vote-eligibility ABI additions; token/membership *historical* events omitted in
favor of live snapshot-diff; partial DAO windows marked). No `NEEDS CLARIFICATION` remain.

## Phase 1 — Design & Contracts

See `data-model.md` (generalized store v1, entry shape with `domain`/`refId`/`link`, per-source snapshot
slices, action-needed map), `contracts/activity-source.md` (the source interface + engine composition
contract), `contracts/store-schema.md` (persisted shape + migration), and `quickstart.md` (end-to-end
validation scenarios incl. wager no-regression, cross-domain feed, scope isolation, failure retention,
accessibility).

## Complexity Tracking

No constitution violations — no entries.
