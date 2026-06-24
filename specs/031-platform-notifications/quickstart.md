# Quickstart & Validation: Platform-Wide Notification & Activity System

How to run and prove the feature end-to-end. Frontend-only; no backend, no contract deploy. Detailed shapes
live in `data-model.md` and `contracts/`; this is the run/validation guide.

## Prerequisites

- Repo on branch `feat/platform-notifications-031`.
- `cd frontend && npm install` (already present in the repo).
- A wallet with state on a supported network — **Mordor (chainId 63)** is the richest target: ClearPath +
  Olympia DAO are live there (spec 030), and membership/token modules are deployed.

## Run

```bash
cd frontend
npm run dev      # http://localhost:5173  (do NOT commit the .env VITE_PINATA_JWT change)
```

Open **My Account**-mode, connect the wallet, watch the **header bell**.

## Automated validation (the gates)

```bash
cd frontend
# Pure data layer + sources + store/migration + provider integration + a11y
npx vitest run src/test/activityStore.test.js \
               src/test/diffEngine.test.js \
               src/test/derivedState.test.js \
               src/test/deadlineWarnings.test.js \
               src/test/activityEngine.test.js \
               src/test/sources \
               src/test/ActivityProvider.test.jsx \
               src/test/ActivityFeed.test.jsx
npx vitest run --run accessibility      # axe over feed/bell/filter (WCAG 2.1 AA, FR-023)
npx eslint src/data/notifications src/contexts/ActivityProvider.jsx src/hooks/useActivity.js \
           src/components/notifications
```
All green + lint clean is the CI-equivalent local gauntlet (Constitution IV).

## Scenario validations (map to spec Success Criteria)

### V1 — Unified cross-domain feed (US1 / SC-001, SC-002)
1. With wager activity **and** a tracked DAO with a recent proposal on the active scope, open the bell.
2. **Expect**: one chronological feed listing entries from both domains, each with a domain tag; a correct
   unread count.
3. Navigate to another page and back, then reload the tab.
4. **Expect**: same entries + unread count persist (durable per scope).

### V2 — Wager no-regression (US1 / SC-003)
1. Run the **existing** wager tests (`diffEngine`, `derivedState`, `deadlineWarnings`, `activityStore`
   migration-aware, and the wager-source wrapper test).
2. **Expect**: all pass unchanged; wager toasts, unread, action-needed, and entries behave exactly as
   before. Legacy `wager_activity_v1` store migrates with read-state preserved (V7).

### V3 — Live alerts, no catch-up storm (US2 / SC-007)
1. Seed a stored snapshot, then on a live cycle introduce several new changes across domains.
2. **Expect**: at most `MAX_TOASTS_PER_CYCLE` (3) toasts + one "+N more updates in activity" summary; all
   changes present in the feed. First poll after a fresh load is **feed-only** (no toasts).

### V4 — Action-needed across domains (US3 / SC-008)
1. Create, on the active scope, a DAO proposal where you can still vote (action) and a membership about to
   expire (action), plus one informational entry.
2. **Expect**: both action entries flagged `actionable`; the bell's action-needed count (in its
   `aria-label`) reflects them; the info entry is not flagged. Cast the vote, refresh → that action clears
   within one cycle (FR-012).

### V5 — Read state + domain filter (US4 / SC-012)
1. Mark one entry read → unread count drops by one. Mark all read → zero.
2. Apply a domain filter (e.g. "DAO") → only DAO entries show; clear → all return; unread/action-needed
   counts unchanged by filtering.

### V6 — Scope isolation (US4 / SC-005)
1. Switch wallet (or network) and back.
2. **Expect**: each scope shows only its own feed; zero cross-scope entries; original read-states intact.

### V7 — Honest state under failure (US4 / SC-006)
1. Force a source/detection failure (e.g. block the DAO RPC).
2. **Expect**: feed/unread/read-state byte-for-byte preserved; other sources still show; the failing source
   keeps its prior slice; at most one failure notice; recovery on the next successful cycle. A truncated DAO
   scan is marked **partial**, never presented as complete.

### V8 — Freshness (US2 / SC-011)
1. With the tab visible, cause a new on-chain activity.
2. **Expect**: it appears in the feed within ~one detection cycle (~30 s). Hide the tab → detection pauses;
   reveal → immediate refresh.

### V9 — No backend / honest gaps (SC-010, Constitution III)
1. Inspect network traffic.
2. **Expect**: only on-chain RPC + (where available) the existing subgraph; no app backend. Documented
   client-side gaps (token/membership historical events, DAO proposals beyond the bounded window) are
   **omitted**, never fabricated.

### V10 — Accessibility (SC-009 / FR-023)
1. `npx vitest run --run accessibility`; keyboard-only: open bell, Tab through entries and the filter,
   Escape to close.
2. **Expect**: no axe violations; dialog focus-on-open, Escape-to-close, bell `aria-label` includes
   unread (+ action-needed) counts; toast polite/assertive split preserved; filter buttons keyboard-
   operable with visible focus and do not steal panel focus.

## Definition of done (this plan's artifacts)

- `ActivitySource` + `activityEngine` + the four sources implemented; wager logic behind `wagerSource`
  with no behavior change.
- Generalized store (partitioned v1) + one-time wager migration; `ActivityProvider`/`useActivity` mounted
  in `App.jsx` in place of the wager provider.
- Feed renders any domain + per-domain filter; bell surfaces unread **and** action-needed.
- `GOVERNOR_READ_ABI` gains `hasVoted`/`getVotes` (+`proposalEta` if exposed) — reads only.
- All scenarios above pass; lint + a11y green; no backend; no contract changes.
