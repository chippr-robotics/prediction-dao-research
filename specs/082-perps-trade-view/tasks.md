# Tasks: Perps — Cross-Protocol Perpetual-Futures Markets in Trade

**Input**: plan.md, research.md, contracts/gateway-perps-api.md
**Format**: `[ID] [P?] [Story] Description` — [P] = parallelizable

## Phase 1 — Setup

- [x] T001 Feature branch + spec artifacts (spec/plan/research/contracts/tasks)

## Phase 2 — Foundational (blocking)

- [x] T010 [US1] Gateway `src/perps/normalize.js`: venue payload → PerpPair /
      PerpPosition DTOs per contracts/gateway-perps-api.md; null-preserving; funding
      interval explicit per venue (Gains v10 hourly, GMX hourly net rate, HL hourly)
- [x] T011 [US1] Gateway `src/perps/client.js`: Gains (3 chains) / GMX / Hyperliquid
      clients, injected `fetchImpl`, timeouts, read retries
- [x] T012 [US1] Gateway `src/perps/routes.js`: `/v1/perps/pairs|positions|config`,
      pipeline (killswitch → config → validation → quota → cache), per-venue
      isolation, stale-marked cache ≤10×TTL
- [x] T013 [US1] Gateway config env block + boot HL fee-cap check (≤10 bps) +
      `.env.example`; `server.js` mount + `/status.perps`
- [x] T014 [P] [US1] Gateway tests `test/perps.test.js`: fixtures per venue,
      normalization, merge, degradation, quotas, killswitch, unconfigured 503,
      boot cap throw, config source chain|env-fallback

## Phase 3 — US1 browse pairs (P1)

- [x] T020 [US1] `frontend/src/config/perps.js`: venue registry (labels, chains,
      non-EVM hyperliquid guard `isEvmPerpVenue`), `perpsAvailable()`, `perpsPath()`,
      cohort (mainnet-only) check
- [x] T021 [P] [US1] `lib/perps/perpsClient.js` (PerpsUnavailable, 12s abort),
      `lib/perps/format.js` (total functions), `lib/perps/perpsCopy.js`
      (PERPS_TIPS/DISCLOSURE/risk)
- [x] T022 [US1] `hooks/usePerpsMarkets.js`: 3-state + per-venue sources, search/
      venue-filter/sort, race-safe
- [x] T023 [US1] `components/perps/{PerpsView,PerpsPairTable,PerpsVenueBadge}.jsx` +
      `Perps.css`: merged table, badges, degraded/unavailable/testnet notices,
      InfoTips, a11y announcements
- [x] T024 [US1] `TradePanel.jsx` view switcher (`?view=perps`), swap view untouched
- [x] T025 [P] [US1] Tests `frontend/src/test/perps/`: format, client, markets hook,
      view states, axe (light+dark)

## Phase 4 — US2 positions (P2)

- [x] T030 [US2] `hooks/usePerpsPositions.js`: gateway positions read, 60s poll,
      stale-guard, account-switch hard reset, per-venue isolation
- [x] T031 [US2] `components/perps/PerpsPositions.jsx`: read-only positions with
      venue attribution, unreadable/empty states, link-out per position
- [x] T032 [P] [US2] Tests: positions hook + component (isolation, reset, empty)

## Phase 5 — US3 fees & admin (P2)

- [x] T040 [US3] `scripts/deploy/lib/feeServices.js` launch entry
      `perps.hyperliquid.builder` cap 10 ConfigOnly + table test
- [x] T041 [US3] `lib/fees/feeQuote.js` FEE_SERVICES.PERPS_HL_BUILDER;
      `FeesTab.jsx` KNOWN_SERVICES label
- [x] T042 [US3] Gateway fee read: `fees/onchain.js` service id + `/v1/perps/config`
      live-vs-fallback (done in T012/T013)
- [x] T043 [P] [US3] Disclosure UI: HL builder-fee line on link-out surface
      (zero ⇒ absent; unreadable ⇒ "could not be confirmed") + tests

## Phase 6 — US4 link-outs (P3)

- [x] T050 [US4] `lib/perps/linkouts.js`: per-venue URL builders with attribution +
      plain fallback; external marking + risk disclosure in PerpsView; tests

## Phase 7 — Reporting & polish

- [x] T060 [P] `data/notifications/sources/perpsSource.js` snapshot-diff + register;
      tests
- [x] T061 [P] Cypress `frontend/cypress/e2e/fast/23-perps.cy.js` (stubbed gateway:
      deep link, pairs, search, degraded, link-out attribution, a11y)
- [ ] T062 `scripts/ui/capture-perps.mjs` + actor-critic loop; screenshots into
      `specs/082-perps-trade-view/screenshots/` + README
- [ ] T063 [P] Docs: `docs/developer-guide/perps.md`, mkdocs nav, runbook note,
      CLAUDE.md guardrail entry
- [ ] T064 Full verification: scoped vitest suites, gateway tests, lint; PR

## Dependencies

Phase 2 blocks 3–6; T020 blocks all frontend tasks; T040 blocks T041/T043;
T062 needs T023/T024.
