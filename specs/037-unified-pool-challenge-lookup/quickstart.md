# Quickstart: Unified Phrase Lookup — Validation Guide

How to run and validate the three deliverables end-to-end. Details live in `data-model.md`,
`contracts/`, and `research.md`; this is the run/verify guide only.

## Prerequisites
- Node 22, repo deps installed (`npm ci` at root and in `frontend/`).
- A configured network with the `wagerRegistry` and `zkWagerPoolFactory` addresses (Amoy/Polygon or
  local dev). Subgraph reachable for My Wagers enumeration (or graceful-empty when absent).
- A wallet with: one open challenge you created (save its four words), one group pool you created or
  joined (note its four words), and at least one 1v1 wager — to exercise My Wagers.

## Run
```bash
npm run frontend            # Vite dev server
npm run test:frontend       # Vitest (unit/integration for this feature)
npm run sync:frontend-contracts   # only if addresses/ABIs changed (they should NOT here)
```

## Scenario 1 — One phrase finds the right thing (US1 / P1)
1. Open the app → click the **Enter a phrase** quick action (the separate "Take a challenge" and
   "Join a pool" entries should be gone).
2. **Pool phrase**: type your pool's four words → **Find** → expect the join-a-pool panel (buy-in,
   members joined, slots, Join). No wallet signature was requested to preview. *(AS1.2, FR-010)*
3. **Challenge phrase**: type your challenge's four English words → **Find** → expect the
   take-a-challenge panel (terms, stake, Accept). *(AS1.1)*
4. **Unknown phrase** (valid words, no match): expect a single **"no match found"** + retry — only
   after both lookups completed. *(AS1.3, FR-007)*
5. **Malformed** (3 words / a non-list word): expect an inline format hint and **no** lookup call.
   *(AS1.5, FR-008)*
6. **Normalization**: same phrase with Mixed Case, hyphens, extra spaces → resolves identically.
   *(AS1.4)*

Edge checks:
- **Collision** (a phrase that resolves to both): expect a chooser with both options, no auto-pick.
  *(FR-006)* — reproduce in tests via mocked deps (unlikely to hit naturally).
- **Language mismatch**: set word-list language ≠ English (My Account), enter a valid non-English
  pool phrase → resolves as a pool, not "invalid". *(FR-009)*
- **Not-actionable**: a phrase for an accepted/expired challenge or full/closed pool → shows the
  item with an explanatory state, not "not found". *(FR-011)*
- **Couldn't check**: simulate a lookup source error (offline/RPC blocked) with no match → expect
  **"couldn't check right now — retry"**, NOT "no match". *(FR-025)* — best asserted in unit tests.
- **Deep link**: open `/app?oc=take&code=<your%20four%20words>` → the unified surface opens
  prefilled and auto-resolves. *(FR-013)*

## Scenario 2 — My Wagers shows everything (US2 / P2)
1. Open **My Wagers**.
2. Confirm your 1v1 wager, your open challenge, and your pool all appear, each with a **type
   indicator** and **status**. *(AS2.1, FR-016)*
3. Toggle active vs history / apply sort — items of all three types are grouped/sorted correctly.
   *(AS2.2, FR-017)*
4. Select each type → routed to the correct surface (wager detail; challenge take/resolve; pool
   page). *(AS2.3, FR-018)*
5. On a fresh account with no challenges/pools → the view behaves exactly as the old wager-only
   view (no errors/empty-state breakage). *(AS2.4, FR-019)*
6. Note: a challenge/pool known only from this device's records may not appear on another device
   (expected — FR-024).

## Scenario 3 — Recovery codes in Security (US3 / P3)
1. Go to **My Account → Security**. Confirm a **Recovery codes** section is present. *(AS3.1, FR-020)*
2. Click **Unlock my saved codes** → one signature → your previously saved codes list with copy
   buttons. *(FR-023)*
3. Confirm the codes saved before the change are all present (no data loss). *(AS3.3, FR-022)*
4. Open the **Open Challenge** surface → confirm there is **no** "Recover codes" tab anymore.
   *(AS3.2, FR-021)*

## Expected automated results
- `npm run test:frontend` passes, including new tests for `resolvePhraseLookup` (all `LookupResult`
  branches), `myWagersAggregation` (union/dedup/empty), deep-link redirect, and `RecoveryCodesPanel`.
- ESLint: zero errors; accessibility audit (axe/Lighthouse) passes for the new surfaces
  (Constitution V).

## Out of scope to validate here
On-chain mechanics, code/phrase derivation, contract tests (unchanged — FR-014); cross-device code
sync; a per-user on-chain pool/challenge index.
