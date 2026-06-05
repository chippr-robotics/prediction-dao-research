# Phase 0 Research: Cypress E2E Flow Coverage

## R1. What the "mock" actually is

**Decision**: Treat the suite as **mock-wallet + real local chain**, not a pure UI mock.

**Findings**: `cy.mockWeb3Provider` (frontend/cypress/support/commands.js) only stubs `window.ethereum` wallet methods (`eth_requestAccounts`, `eth_chainId`, `eth_getBalance`, `personal_sign`, chain-switch). Every other JSON-RPC method — including `eth_call` and `eth_sendRawTransaction` — is **forwarded to `http://localhost:8545`**, a real Hardhat node (chain 1337) with the v2 contracts deployed. The substantive specs already declare "Requires a running Hardhat node with deployed contracts (chain 1337)", and `torture-test.yml`'s `cypress-e2e` job boots Hardhat + runs `npm run deploy:local` before the suite.

**Rationale**: Implementation must arrange **on-chain** preconditions, not stub return values. This is good — assertions exercise real contract logic end-to-end through the UI.

**Alternatives considered**: (a) extend `mockWeb3Provider` to fake `eth_call` responses per-test — rejected: brittle, and it would stop testing the real contracts, defeating the purpose. (b) Convert to a public testnet — rejected: explicitly out of scope, slow, flaky.

## R2. How to arrange each precondition

**Decision**: Prefer the **UI + account-switching + `advanceTime`**; add **direct-transaction setup helpers** only for states with no UI.

| Precondition | How |
|---|---|
| Paused / unpaused | Admin (account #0) via the AdminPanel UI **or** a `pause()`/`unpause()` setup tx. Prefer a setup helper for speed + reliability; assert the *participant* UI reacts. |
| Frozen / unfrozen | AdminPanel UI **or** `freezeAccount`/`unfreezeAccount` setup tx (GUARDIAN/MODERATOR = account #0). |
| Active/open wager to act on | Create through the UI (`openCreateWagerModal` + `fillWagerForm`), switch to opponent to accept — reuse the substantive specs' helpers. |
| Accept-timeout | Create, do not accept, `cy.advanceTime(> acceptDeadline)`, then claimRefund via UI. |
| Oracle resolve-timeout | Create oracle wager, accept, `cy.advanceTime(> resolveDeadline)`, refund via UI. |
| Oracle resolved to YES/NO/tie | **No UI** — new helper sends `MockPolymarketCTF.resolveCondition(conditionId, payouts)` directly; then trigger `autoResolveFromPolymarket` via the UI's resolve button. |
| Expired membership | Grant a membership, `cy.advanceTime(> duration)` so it lapses, then attempt create. (Or a helper that grants a near-zero-duration membership.) |
| Admin vs non-admin view | `switchAccount` between #0 (admin) and #4 (bystander). |

**Rationale**: Reuses existing infrastructure; only adds the minimum (a direct-tx signer for no-UI setup like oracle resolution and, optionally, fast pause/freeze/grant). `evm_increaseTime` is already wrapped by `cy.advanceTime`.

## R3. Direct-transaction setup helpers

**Decision**: Add a thin Node-side path for setup transactions using a known Hardhat account key, exposed as Cypress commands.

**Findings**: Cypress runs in the browser; direct ethers tx-sending with a private key is cleanest via `cy.task` (Node context, defined in `cypress.config.js`) or a small in-spec ethers call against `localhost:8545` using a default Hardhat private key (deterministic, well-known, test-only). Addresses come from the synced `HARDHAT_CONTRACTS` (chain 1337) the deploy writes.

**Rationale**: Some preconditions (resolving `MockPolymarketCTF`, optionally pausing/freezing/granting fast) have no UI; a deterministic admin signer is the simplest reliable way to set them. Keys are the public Hardhat test keys — never production.

**Alternatives considered**: driving every precondition through the UI — rejected: there is no UI to resolve a mock CTF condition, and UI-driving admin setup for every test is slow/flaky.

## R4. Test isolation & determinism

**Decision**: Each test creates its **own fresh wager(s)**; any **global** state a test sets (pause, freeze) is **reverted in `afterEach`**; tests assert by the wager they created, not by absolute counts.

**Findings**: The Hardhat node is shared across the suite (not reset between specs). The existing `property_frozen_cannot_create` fuzz pattern already unfreezes after itself; the substantive specs create fresh wagers per test. Pause and freeze are global/account-global and will break unrelated specs if left set.

**Rationale**: Prevents order-dependence and cross-spec contamination (a real risk given the shared node). Edge: membership concurrent-limit — tests must use accounts with headroom or close wagers they open.

## R5. CI gate placement (Fail Loudly)

**Decision**: Keep the suite a real gate; verify the Cypress job fails on a failing assertion and avoid any `continue-on-error`/page-render-only assertion that would hide failures (Constitution IV).

**Findings**: `torture-test.yml`'s `cypress-e2e` job runs the full suite weekly and has a "Check Cypress exit code" step that `exit 1`s on failures (good). The full suite is not currently on the per-PR CI (only the "fast" suite is). Whether to add it to PR CI is a follow-up noted for the team — out of scope here, but the suite must remain trustworthy so it *can* gate.

## Resolved unknowns

All Technical-Context items are resolved; no `NEEDS CLARIFICATION` remain. The single new capability required is the direct-tx setup helper(s); everything else reuses existing commands.
