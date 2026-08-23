# Contract: Tiering Policy

The shipped form of this is `docs/developer-guide/e2e-testing-policy.md`. This file fixes what that
document must say, so a later edit that removes a rule is visible as a spec change.

## The three tiers

| Tier | Directory | Needs | Runs on | Budget |
|---|---|---|---|---|
| **no-chain** | `cypress/e2e/fast/` | A built app | Every push, twice — once per viewport profile | < 6 min per leg |
| **on-chain** | `cypress/e2e/full/` | Local chain + deploy + seed | Every push, 4 shards in parallel | < 15 min per shard (measured 6:37 / 7:51 / 6:29 / 6:09) |
| **account-native** | `cypress/e2e/passkey/` | The WebAuthn harness | Every push | < 5 min |

## The two admission rules

1. **A flow that can be validated without a chain MUST NOT live in the on-chain tier.** Rendering,
   validation, disclosure copy, gated controls, error and degraded states, and every responsive or
   accessibility question belong to the no-chain tier. The on-chain tier's cost is mining real
   transactions; spending it on a button is spending the merge gate's wall clock on nothing.

2. **A flow in which a member signs something that costs them money MUST have on-chain-tier
   coverage.** Not "should" — this is the tier that exists because the fast tier cannot tell a
   working money path from a broken one. A flow of this kind with only fast-tier tests is a gap in
   the matrix no matter how thorough those tests are.

A useful test for rule 1, from the issue: *would this test pass against a mock and still let a real
bug through?* If yes, it does not need the chain.

## What a test must do to count

- **Establish its own preconditions.** With per-test chain isolation, a test that relies on state an
  earlier test left behind is not saving setup — it is unfalsifiable when run alone. If a
  precondition cannot be established, the test fails; it never continues.
- **Judge the outcome by the authority that decides it.** Where the chain settles it, read the chain
  (`waitForWagerActive`, `waitForWagerResolved`, a balance). Modal wording has passed while the
  transaction was never sent.
- **Assert something that can be false.** An assertion whose accepted terms include both the success
  and the failure wording proves the page contains words.

## Budgets

Budgets are measured, recorded, and stated per tier above. A tier over budget is a backlog item — to
split, to trim, or to move flows to a cheaper tier. Raising the number is a decision that gets
written down with its reason, not a silent edit.

## Anti-patterns (each caused a real failure here)

| # | Pattern | Why it looks fine | What it did |
|---|---|---|---|
| 1 | `cy.get(x).then($el => { if ($el.length) … })` | Reads as an optional step | `cy.get` fails the command when nothing matches, so the guard never runs and the step is not optional — it is absent. |
| 2 | Unscoped `cy.contains` in a portalled-modal app | The assertion passes | It matched the page *behind* the modal. A visibility assert does not catch it: the wrong element genuinely is visible. |
| 3 | `$panel.find(...)` inside `.then()` reported as state | Looks like a read of the UI | It is a DOM snapshot taken once, before async-gated controls render. |
| 4 | `cy.on(...)` registered before `cy.mockWeb3Provider()` | Both lines are present | `cy.on` registers synchronously and the mock only enqueues, so the wrapper finds nothing to wrap and installs nothing. |
| 5 | Rejecting `eth_sendTransaction` to test a refusal | Looks like a refusal test | On the intent rail the member's authorization is a *signature*; nothing is refused. |
| 6 | Silent no-op branches | The test goes green | It continued past a failed precondition and died somewhere unrelated — or passed having tested nothing. |
| 7 | `expect(true).to.be.true` behind a precondition guard | Reports as coverage | 33 branches across four money-path specs. A test that passes when its precondition is absent is worse than a missing test. |

Pattern 7 is gated: an unconditional truth in `cypress/e2e/**` fails the build unless the preceding
line carries `// EITHER-WAY: <reason>` naming the genuinely-either-way outcome it stands for.

## Fixture and precondition conventions

- On-chain preconditions go through the `chainTx` task, never through the UI, unless driving the UI
  *is* the thing under test.
- A spec that advances the chain clock opts into per-test isolation via `resetChainBetweenTests()`,
  called **after** the spec's own `before` hook so durable fixtures survive.
- After any revert, re-point the browser clock at the chain (`syncBrowserClockToChain`). The app
  decides expiry in browser time and the contracts enforce chain time; a deadline test is
  meaningless while the two disagree.
- Custom errors are decoded in `chainTx`. A precondition that reverts says why.
