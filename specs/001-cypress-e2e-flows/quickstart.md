# Quickstart: running the Cypress E2E flow suite

Validates that the implemented flows pass end-to-end. The "full" suite needs a
local Hardhat node with the v2 contracts deployed; the UI runs against it with a
mocked wallet.

## Prerequisites

- Node 22, repo deps installed (`npm ci` at root and in `frontend/`).
- Contracts compiled (`npm run compile`).

## One-shot (matches CI)

```bash
# Terminal 1 — local chain + deployed contracts (chain 1337)
npm run node                    # start Hardhat node on :8545
npm run deploy:local            # deploy v2 contracts + sync HARDHAT_CONTRACTS

# Terminal 2 — run the full E2E suite (starts the Vite dev server itself)
npm --prefix frontend run test:e2e:full
```

`test:e2e:full` = `start-server-and-test dev http://localhost:5173 'cypress run --spec cypress/e2e/full/**/*.cy.js'`.

## Interactive (developing a single spec)

```bash
# with the node + deploy running, and the dev server up (npm --prefix frontend run dev):
npm --prefix frontend run cypress         # open Cypress, pick a spec under e2e/full/
```

## Expected outcomes (success criteria)

- All `e2e/full/*.cy.js` specs pass (SC-001).
- No spec's only assertion is `cy.get('body').should('be.visible')` (SC-002).
- Each of the six target flows asserts its acceptance scenarios (SC-003).
- `09-challenge-dispute.cy.js` is absent; no spec references the removed dispute feature (SC-004).
- A failing assertion makes `cypress run` exit non-zero (Constitution IV).

## Notes

- The node is shared across the suite; specs create their own wagers and revert any
  global state (pause/freeze) they set — see `contracts/test-helpers.md` cleanup contract.
- Setup helpers use public Hardhat test keys (test-only) to drive no-UI preconditions
  (oracle resolution, fast pause/freeze/grant).
