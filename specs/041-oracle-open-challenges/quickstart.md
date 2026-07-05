# Quickstart: Validating Oracle-Settled Open Challenges

**Feature**: 041 | **Plan**: [plan.md](./plan.md) | **Contracts**: [contracts/](./contracts/)

## Prerequisites

- `npm install` at repo root (Hardhat + frontend workspaces)
- No deployments needed — all validation runs against local Hardhat fixtures and the
  Vitest suite. Manual UX checks use the dev server on a Polymarket-capable network
  (Polygon Amoy) with a Silver+ test membership.

## 1. Contract-path equivalence (no Solidity changes — prove the existing path)

```bash
npm run compile
npx hardhat test test/integration/oracle/WagerRegistry_PolymarketOpenChallenge.test.js
```

Expected:

- `createOpenWager(..., ResolutionType.Polymarket, conditionId, creatorIsYes, ...)`
  succeeds for an unresolved mock condition and emits `OpenWagerCreated` +
  `PolymarketLinked` (D1).
- Creation **reverts** with `PolymarketRequired` (zero conditionId),
  `ConditionAlreadyResolved` (pre-resolved condition), `AdapterNotSet` (registry
  deployed without adapter), and still rejects `Creator`/`Opponent` types (SC-008 gate,
  FR-008).
- A code-holder accepts via `acceptOpenWager`; then `autoResolveFromPolymarket` settles
  YES-win, NO-win, and tie→draw identically to the named-opponent suite
  (`WagerRegistry_Polymarket.test.js`) — winner claims payout (SC-006, FR-017).
- An untaken oracle open challenge expires → creator refund (edge case parity).

Regression (SC-007):

```bash
npm test           # full contract suite — existing open-challenge + oracle suites unchanged
```

## 2. Frontend units & components

```bash
npm run test:frontend
```

Expected new/extended suites green:

- `oracleTimeline.test.js` — caps/buffer/invariants per
  [timeline-derivation.md](./contracts/timeline-derivation.md) (SC-003).
- `claimCode/OracleOpenChallengeModal.test.jsx` — picker→side→stake→create submits
  `resolutionType=4`, `oracleConditionId`, `creatorIsYes`, derived deadlines, sealed
  `oracle` block; ineligible markets unselectable; capability + `VITE_ORACLE_MODELS`
  gating (FR-001..FR-011).
- `claimCode/TakeChallengePanel.oracle.test.jsx` — bet summary, Polymarket badge in
  live AND degraded states, mismatch flag, closed-warn / resolved-block accept gate
  (FR-012..FR-016, SC-004/SC-005).
- `usePolymarketMarket.test.jsx` — fetch/normalize/error/disabled contract.
- `claimCode/OpenChallengeModal.test.jsx` — still green after `ClaimCodeResultPanel`
  extraction (FR-018).
- `Dashboard.test.jsx` — new card wiring + gating (FR-004).

## 3. Manual end-to-end (dev server)

```bash
npm run frontend    # on Polygon Amoy with a Silver+ membership wallet
```

1. Dashboard → **Oracle Open Challenge** card (visible only on Polymarket-capable
   chains) → default feed shows popular markets with no input (US3/SC-001).
2. Filter by a category, pick a market → choose a side (labels + live prices) → enter
   stake → confirm the displayed timeline is derived from the event (capped case: pick
   a far-future market and check the disclosure) → create.
3. Save the shown four-word code; verify copy / QR / take-challenge link render (FR-010).
4. In a second browser/wallet (any active membership tier): unified lookup → enter the
   code → verify the single-view bet summary: question, YOUR side, stake, payout,
   deadlines, **"Settled automatically by Polymarket"** badge + explanation, live odds
   row (SC-004/SC-005).
5. Kill network access to `gamma-api.polymarket.com` (devtools offline for that origin)
   → reload lookup → bound terms still render with the "live market info unavailable"
   notice; accept still enabled (FR-014).
6. Accept with the second wallet → wager appears in My Wagers for both; manual draw
   controls disabled ("resolves from an oracle") as with existing oracle wagers.

## 4. Lint & a11y gates

```bash
npm run lint --workspace frontend   # zero errors (build-blocking)
```

Axe/Lighthouse CI audits must stay green — the new side picker/badge use labelled
buttons, `aria-pressed`, `role="status"`, text+glyph (not color-only) semantics.
