# Implementation Plan: Cypress End-to-End Test Flow Coverage

**Branch**: `001-cypress-e2e-flows` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-cypress-e2e-flows/spec.md`

## Summary

Replace the placeholder ("page rendered" only) Cypress "full" E2E specs with assertions that exercise the real wager user flows, and remove the obsolete challenge/dispute spec. The suite runs the production UI in a browser with a **mocked wallet** (`window.ethereum`) while every contract call/transaction is forwarded to a **real local Hardhat node (chain 1337)** that has the v2 contracts deployed. The core implementation problem is therefore *arranging on-chain preconditions* (paused protocol, frozen account, expired membership, resolved/tied oracle, elapsed deadlines) for each flow, then driving the UI as the appropriate account and asserting the user-visible outcome. Most preconditions are reachable through the existing UI + account-switching + `advanceTime`; the one gap (resolving a mock oracle condition, which has no UI) is closed with a small set of new setup helpers that send transactions directly to the node.

## Technical Context

**Language/Version**: JavaScript (Node 22), Cypress 13 E2E specs.

**Primary Dependencies**: Cypress; a local Hardhat node (chain 1337) with v2 contracts deployed via `npm run deploy:local`; the existing `frontend/cypress/support/commands.js` custom commands (`mockWeb3Provider`, `connectWallet`, `switchAccount`, `fillWagerForm`, `openCreateWagerModal`, `openMyWagers`, `advanceTime`, `assertToast`, `checkA11y`); ethers v6 for direct setup transactions.

**Storage**: N/A — preconditions are on-chain state on the ephemeral Hardhat node.

**Testing**: Cypress, run via `npm run test:e2e:full` (`start-server-and-test dev http://localhost:5173 'cypress run --spec cypress/e2e/full/**/*.cy.js'`), against the Vite dev server + Hardhat RPC.

**Target Platform**: Browser (Cypress) against the Vite dev server (`localhost:5173`) and Hardhat RPC (`localhost:8545`).

**Project Type**: Web application — frontend E2E testing only; no contract or production-code changes.

**Performance Goals**: Deterministic, non-flaky runs; the full suite completes within the existing torture-test CI window.

**Constraints**: Mock-wallet + real-local-chain harness is fixed (no conversion to a pure mock or to a public chain). Specs MUST be order-independent and MUST restore global state they change (unpause, unfreeze) so they don't poison later specs. The 5 Hardhat default accounts are the fixed actor set (#0 admin/creator, #1 opponent, #2 arbitrator, #3 guardian, #4 bystander).

**Scale/Scope**: Implement 6 stub specs (`19-paused-protocol`, `18-frozen-accounts`, `11-refund-timeout`, `08-oracle-resolution`, `20-expired-membership`, `15-admin-panel`); delete 1 obsolete spec (`09-challenge-dispute`, already done in the spec commit); extend shared commands with a few precondition helpers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **II. Test-First & Comprehensive Coverage (NON-NEGOTIABLE)** — This feature directly advances it: it adds E2E coverage of the resolution, claim, refund, and timeout paths (incl. the failure/edge cases the principle names) on top of the existing hardhat unit/integration coverage. **PASS.**
- **III. Honest State, No Mocks in Shipped Paths** — The wallet mock and setup helpers live only under `frontend/cypress/` (a dedicated test scope); no mock/placeholder enters a production path. Contract reads hit a real chain (honest state). Tests run isolated on chain 1337, so no testnet/mainnet data leak. **PASS.**
- **IV. Fail Loudly in CI** — The suite must fail the pipeline on a failing assertion; the implementation MUST NOT introduce `continue-on-error` or `cy.get('body')`-only assertions that hide failures. The existing Cypress job already exits non-zero on failures; tasks will verify it. **PASS (verify in tasks).**
- **V. Accessible, Consistent Frontend** — No new UI; existing `checkA11y` available where a flow opens a new view. **N/A / PASS.**
- **I. Security-First Smart Contracts** — No `contracts/` changes. **N/A.**

No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-cypress-e2e-flows/
├── plan.md              # This file
├── research.md          # Phase 0 — harness analysis + precondition strategy
├── data-model.md        # Phase 1 — state/precondition matrix per flow
├── contracts/
│   └── test-helpers.md  # Phase 1 — new Cypress command signatures + per-flow assertion contracts
├── quickstart.md        # Phase 1 — how to run the suite
└── checklists/
    └── requirements.md  # spec quality checklist (from /speckit-specify)
```

### Source Code (repository root)

```text
frontend/cypress/
├── support/
│   ├── commands.js      # EXTEND: add precondition helpers (admin tx, oracle resolve, expired membership)
│   └── e2e.js
└── e2e/full/
    ├── 08-oracle-resolution.cy.js     # IMPLEMENT
    ├── 11-refund-timeout.cy.js        # IMPLEMENT
    ├── 15-admin-panel.cy.js           # IMPLEMENT
    ├── 18-frozen-accounts.cy.js       # IMPLEMENT
    ├── 19-paused-protocol.cy.js       # IMPLEMENT
    ├── 20-expired-membership.cy.js    # IMPLEMENT
    └── 09-challenge-dispute.cy.js     # DELETED (obsolete)

contracts/test/MockPolymarketCTF.sol   # used by setup helpers to drive oracle outcomes (already deployed locally)
scripts/operations/seed-testnet.js     # reference for local seeding patterns
```

**Structure Decision**: Web application. All work is confined to `frontend/cypress/` (spec files + shared `support/commands.js`). No production code, contract, or top-level structure changes. Setup helpers reuse the locally-deployed v2 contracts (incl. `MockPolymarketCTF`) on chain 1337.

## Complexity Tracking

*No constitution violations — no entries.*
