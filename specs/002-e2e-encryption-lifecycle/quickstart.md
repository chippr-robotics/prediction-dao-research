# Quickstart: completing the remaining E2E stubs

Validates that 03-encryption-chain, 16-privacy-encryption, and 23-lifecycle-e2e
pass with real assertions. Same harness as 001 (mock wallet + real local chain),
plus a mocked IPFS boundary and per-account signing for the encrypted flow.

## Prerequisites

- The 001 foundation present (branch `002-e2e-encryption-lifecycle` is stacked on
  `001-cypress-e2e-flows`).
- Node 22; deps installed; contracts compiled (`npm run compile`).

## Run (matches CI; use a FRESH node)

```bash
# Terminal 1 — fresh local chain + deployed contracts (chain 1337)
npm run node
npm run deploy:local            # writes localhost-chain1337-v2.json + syncs HARDHAT_CONTRACTS

# Terminal 2 — the three target specs
npm --prefix frontend run dev   # VITE_NETWORK_ID=1337
npm --prefix frontend exec cypress run -- --browser chrome \
  --spec 'cypress/e2e/full/03-encryption-chain.cy.js,cypress/e2e/full/16-privacy-encryption.cy.js,cypress/e2e/full/23-lifecycle-e2e.cy.js'
```

Then run the **whole** suite on a fresh node to confirm isolation:

```bash
npm --prefix frontend run test:e2e:full
```

## Expected outcomes (success criteria)

- **SC-001**: zero body-visible-only specs remain under `e2e/full/`.
- **SC-002**: the full `e2e/full/*.cy.js` suite passes on a fresh node.
- **SC-003**: in 16, a participant decrypts and a non-participant provably cannot
  (distinct, account-specific keys).
- **SC-004**: no spec references the removed challenge/arbitrator dispute feature
  (23's arbitrator journey is gone).
- **SC-005**: each acceptance scenario maps to ≥1 assertion.

## Notes

- IPFS is mocked via `cy.interceptIpfs()` (no network); the encrypted round-trip
  runs through the app's real `encryption.js`.
- Per-account `personal_sign` is required for account-specific keys — without it
  every account derives the same key and SC-003 cannot hold.
- Verify isolation on a **fresh** node: time-advancing journeys (E2E-03/04) and a
  reused node accumulate clock skew (see 001).
