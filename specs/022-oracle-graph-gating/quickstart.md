# Quickstart & Validation: Oracle & Graph Network Gating

Runnable validation that the gating works end-to-end. Frontend-only; no contract or
subgraph deploy required. See [data-model.md](./data-model.md) and
[contracts/](./contracts/) for the underlying shapes — not repeated here.

## Prerequisites

- Node + repo deps installed (`npm install`).
- Frontend env (`frontend/.env`): the build's chain is `VITE_NETWORK_ID`. Subgraph
  endpoints resolve per chain via `VITE_SUBGRAPH_URL_<chainId>` (or `VITE_SUBGRAPH_URL`
  for the build's active chain). See `frontend/.env.example`.

## A. Automated tests (primary gate)

```bash
npm run test:frontend
```

Expected new/updated coverage to pass:
- `frontend/src/test/network/oracleSupport.test.js` — `hasOracleSupport(chainId)`:
  137/80002 → true, 63 → false, unknown → false; matches modal `anyOracleEnabled`.
- `frontend/src/test/network/subgraph.test.js` — `isGraphConfigured`/`getSubgraphUrl`:
  per-chain override > back-compat single URL; unset → false.
- Dashboard test — `create-1v1-oracle` tile is disabled with a reason on a no-oracle
  chain and not activatable; enabled on an oracle chain.
- Reports test — `TaxReportsPanel` shows "requires indexing" and blocks generation on
  an un-indexed chain; full panel on an indexed chain.
- Account stats test — basic tiles render from RPC on an un-indexed chain, advanced
  sections show "requires indexing"; advanced sections render on an indexed chain.

Accessibility (must stay green):
```bash
npm run test:frontend -- account/AccountDashboard.axe reports/reportsAccessibility
```
- Disabled oracle tile exposes an accessible name + discoverable reason; no axe
  violations.

## B. Manual validation — oracle quick action (US1)

```bash
npm run frontend
```

1. Build/run with `VITE_NETWORK_ID=63` (Mordor, no oracle adapters). Connect a
   wallet. On the dashboard quick-select menu, the **Oracle Settles (1v1)** tile is
   **disabled**; focus/hover shows the unavailable reason. Activating it does nothing.
   → SC-001.
2. Switch to Polygon (137) or Amoy (80002). The tile becomes **enabled** and opens
   the oracle wager flow. → SC-002.
3. Switch back and forth without reloading — the tile state tracks the active chain.
   → SC-005 (oracle dimension).

## C. Manual validation — reporting & advanced metrics gating (US2)

1. Active chain with **no** subgraph configured (e.g. 63, or unset
   `VITE_SUBGRAPH_URL_<chain>`): open the tax-report panel and the account-stats
   view. Advanced sections (P&L, breakdowns, valued activity) and report generation
   show a clear **"requires indexing on this network"** message — no error, no
   infinite spinner. Attempting to generate a report is blocked with the explanation.
   → SC-003, FR-008/FR-009.
2. Active chain **with** a subgraph configured: the full reporting + advanced metrics
   render and populate as before. → FR-007 (positive path).

## D. Manual validation — basic stats via RPC (US3)

1. On the un-indexed chain from C, confirm the stats view still shows **basic stats**
   (total/active wager counts, wallet balances) sourced from direct chain reads,
   visibly labeled as basic and distinguished from the (disabled) advanced metrics.
   → SC-004, FR-010/FR-011.
2. Temporarily point the chain's RPC at an unreachable URL: the basic stats degrade
   to an honest empty/last-known state with a non-blocking message — no hang, no raw
   error. → FR-013, SC-003.
3. Switch from the un-indexed chain to an indexed one and back: stats flip between
   basic and advanced and never show the other chain's figures. → SC-005, FR-014.

## E. Distinguish "not configured" vs "temporarily unavailable" (FR-015)

- With a subgraph **configured** but its endpoint down, the reporting/advanced views
  show a transient error/stale state (retry), NOT the "requires indexing" disabled
  state. With **no** subgraph configured, they show the disabled "requires indexing"
  state. Confirm the two are visually and behaviorally distinct.

## Success criteria mapping

| Criterion | Validated by |
|-----------|--------------|
| SC-001, SC-002 | B (US1) + Dashboard test |
| SC-003 | C, D2, E |
| SC-004 | D1 + account stats test |
| SC-005 | B3, D3 |
| SC-006 | B + C (no dead-end flows / broken reports on unsupported networks) |
```
