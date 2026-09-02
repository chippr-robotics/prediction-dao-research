# Implementation notes: Funding Pools (spec 102)

## Smart-contract security self-review

Reviewed against `.github/agents/smart-contract-security.agent.md` (EthTrust-SL target L2). Every
item below names the code that answers it.

| Class | Finding | Where |
|---|---|---|
| Reentrancy | `contribute`, `contributeWithAuthorization`, `close`, `closeWithSig`, `claimRefund`, `claimRefundWithSig` are `nonReentrant`; every path is checks → effects → interactions (state written and event emitted before `safeTransfer*`). Probed with `contracts/mocks/ReentrantToken.sol` re-entering `contribute` / `close` / `claimRefund` — each reverts `ReentrancyGuardReentrantCall` with no state change (`FundingPool.security.test.js`). | `FundingPool.sol` |
| Access control | `close` / `cancel` gate on `organizer`; `voteRefund` / `claimRefund` gate on `contributed[actor] > 0`; the factory's admin surface is `DEFAULT_ADMIN_ROLE`, upgrades `UPGRADER_ROLE` (`UUPSManaged`). No function lets anyone but the organizer or a contributor move value, and none moves value to a caller-chosen address (`close` has no `recipient`). The ABI test asserts the absence of sweep/rescue/setter surfaces. | `FundingPool.sol`, `FundingPoolFactory.sol` |
| Fund custody | Escrow lives only in the clone; the factory never holds tokens (asserted). Escrow invariant I1 (`balance == totalRaised` while Open) and I2 (exits only to the organizer or each claimant's own amount) hold under 5 randomized 40-step sequences. | `FundingPool.security.test.js` |
| Never-stranded | I4: an `Open` pool at `settleDeadline` is always movable to `Refunding` by anyone; refunds are pull-based so no contributor can block another. | `pokeDeadline`, `_claimRefundBy` |
| Integer arithmetic | Solidity 0.8 checked math; `contributorCount`/`refundVotes`/`refundedCount` are `uint32` counters bounded by distinct addresses; `refundVotesNeeded = n/2 + 1` cannot overflow. | `FundingPool.sol` |
| Timestamp dependence | Deadlines are absolute, bounded by the factory (30 / 180 days) and compared with `>=` / `<` consistently; a miner's few-second skew cannot move a pool across a state it could not otherwise reach. | `_checkDeadlines`, `_preContribute`, `pokeDeadline` |
| Token assumptions | `totalRaised == balance` requires a non-fee-on-transfer, non-rebasing token — enforced operationally by the factory allow-list on value-bearing networks (`screeningRequired`), exactly as the wager pools do. | `FundingPoolFactory.createPool` |
| Signature / replay | All twins go through `SignerIntentBase._verifyIntent` (window, signer recovery incl. ERC-1271, single-use nonce burned before the action); per-clone EIP-712 domain so a signature never replays on another pool; the factory intent binds `purposeHash`; nonce namespaces are per signer per contract. | `FundingPool.withsig.test.js`, `FundingPoolFactory.forwarders.test.js` |
| Griefing (majority by count) | Many dust addresses can force a refund — which returns everyone's own money (nobody loses funds) and requires each address to pass screening. Accepted; recorded in research R2 with the alternative. | spec Assumptions |
| Organizer close vs. pending vote | The organizer can close while a vote is short of the majority. Deliberate (the request's "any time"); the vote's confirm copy says so. | spec Edge Cases |
| DoS | No unbounded loops on-chain; the feed is read off-chain from the event log. | — |
| Upgradeability | Factory storage append-only with `__gap`; `FundingPoolFactory.upgrade.test.js` proves an in-place upgrade preserves registry, phrases and roles; registered in `check:storage-layout`. Clones are immutable (constructor `_disableInitializers`, clone `initializer`). | — |

**Static analysis.** Slither/Medusa run in CI on the new sources (`test.yml` security jobs); they are
not installed in the authoring environment, so the CI run is the record. Expected informational
findings match `WagerPool`'s (timestamp comparisons, external calls in loops: none).

**Bytecode baseline.** Two new artifacts (`FundingPool`, `FundingPoolFactory`, plus their interfaces
and the V2 mock) were ADDED to `specs/075-monorepo-workspaces/baseline-bytecode.json`; no existing
digest changed.

## Gate results (authoring environment)

| Gate | Result |
|---|---|
| `npm run compile` | ok (Paris target; both contracts ≈ 12.2 KB / 9.4 KB deployed, well under 24 KB) |
| `npx hardhat test test/pools/FundingPool*.test.js test/upgradeable/FundingPoolFactory.upgrade.test.js test/intent/TypehashParity.test.js` | 112 + parity passing |
| `npm run check:storage-layout` | pass (26 live implementations; new factory registered, no live deployment yet) |
| `npm run check:abis` | pass (25 generated files) |
| `npm run check:deps` | pass |
| `node scripts/e2e/check-local-addresses.js --chainId 80002 --e2e` | PASS (25 addresses verified) after a real `HARDHAT_LOCAL_CHAIN_ID=80002` + `setup:e2e` run |
| Vitest `src/test/funding` + lookup + e2e-policy + brand | 98 + 28 + 162 passing |
| Cypress `fast/42-funding-pools` (desktop profile, local) | 6 of 7 pass; FP-FAST-03 — the ONE test that connects a wallet — could not complete here (below) |
| Cypress `full/39-funding-pools` (local) | could not complete here (below); the chain tasks it uses (`createFundingPool`, `contributeFunding`, `fundingAction`, `fundingInfo`, `fundingMemberInfo`) were exercised against the 80002 node by the capture harness fixtures |
| `scripts/ui/capture-funding-pools.mjs` | 36/36 shots, three rounds, see `screenshots/README.md` |

**Cypress in the authoring sandbox.** Every run that performs the header connect flow (click "Connect
Wallet" → pick the injected connector) dies with `read ECONNRESET` in the Cypress server process on the
NEXT navigation — reproduced with a throwaway spec that only does what `24-wager-pools.cy.js` does on
every test (connect on `/wallet?tab=paytransfer`, then connect again), which is CI-green. A session
restored before the Payments home mounts (`preAuthorized`) dies the same way on `/app`. The connect
modal opens an external wallet-connector socket, and this sandbox's egress proxy resets it; the
Cypress proxy does not survive that. Disconnected tests, and existing specs that never connect
(`23-home-modes`) or connect only via `preAuthorized` on `/wallet` (`26-trade-account`), run to green
here. Consequences for the specs as written: `42-funding-pools` puts its one connecting test LAST so
nothing depends on a page it leaves behind, and every other test runs disconnected; `39-funding-pools`
is judged by chain reads and follows the `24-wager-pools` connect pattern exactly. CI (GitHub-hosted,
no egress proxy) is the record for both.

## Deferred, deliberately

- Relay-gateway actions for funding pools (research R8) — contracts carry the twins/forwarders.
- Subgraph entity (Polygon) — totals are state reads; the feed is the pool log.
- Ledger (`RecentActivityFeed`) entries for pool contributions/refunds — the pool page has its own feed.
