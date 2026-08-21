# End-to-End Testing Policy

**Spec**: [094-e2e-coverage-expansion](../../specs/094-e2e-coverage-expansion/spec.md) ·
**Matrix**: [e2e-coverage-matrix.md](./e2e-coverage-matrix.md) · **Issue**: #1228

This is the document to read before writing an end-to-end test. It answers two questions without a
judgement call — which tier does this belong in, and what must the test assert to count — and it
carries the anti-patterns that made the current suite report coverage it did not have.

## The three tiers

| Tier | Directory | Needs | Runs | Budget |
|---|---|---|---|---|
| **no-chain** | `frontend/cypress/e2e/fast/` | A built app | Every push, twice — once per viewport profile | **< 6 min per leg** — ⚠️ **currently missed**: measured 11:20 desktop / 11:30 phone (#1249) |
| **on-chain** | `frontend/cypress/e2e/full/` | A local chain, a deploy and a seed | Every push, 4 shards in parallel | **< 15 min per shard** (measured: 6:37 / 7:51 / 6:29 / 6:09) |
| **account-native** | `frontend/cypress/e2e/passkey/` | The WebAuthn harness | Every push, **once** — it rides the no-chain job's desktop leg for a runner, not because it is a viewport question | **< 5 min** |

## The two admission rules

**1. A flow that can be validated without a chain MUST NOT live in the on-chain tier.**

Rendering, validation, disclosure copy, gated controls, error and degraded states, responsive
behaviour and accessibility all belong to the no-chain tier. The on-chain tier's cost is mining real
transactions and waiting on real receipts; spending it to prove a button exists spends the merge
gate's wall clock on nothing.

The test for this, from #1228: *would this test pass against a mock and still let a real bug
through?* If yes, it does not need a chain.

**2. A flow in which a member signs something that costs them money MUST have on-chain-tier
coverage.**

Not "should". The on-chain tier exists because the fast tier cannot tell a working money path from a
broken one. A money flow with only fast-tier tests is a gap in the coverage matrix no matter how
thorough those tests are.

It runs on **every push**, which is affordable because it is sharded: the measured legs are
6:37 / 7:51 / 6:29 / 6:09 against a serial total of ~27 minutes. Deferring it to the release PR was
considered and rejected once those numbers existed — a money-path regression caught at the release
PR is caught later and against a much larger diff, and ~7 minutes in parallel is not what a branch
waits on.

## What a test must do to count

- **Establish its own preconditions.** With per-test chain isolation, a test that relies on state an
  earlier test left behind is not saving setup — it is unfalsifiable when run alone. If a
  precondition cannot be established, the test **fails**. It never continues past it.
- **Judge the outcome by the authority that decides it.** Where the chain settles it, read the chain
  (`waitForWagerActive`, `waitForWagerResolved`, a token balance). Modal wording has passed here
  while the transaction was never sent — that is how #1226 and #1227 stayed hidden.
- **Assert something that can be false.** An accepted-terms list containing both the success and the
  failure wording proves only that the page contains words.

## Assertion depth

The matrix records depth as a fact separate from coverage, because a flow can be `covered` by a test
that cannot fail:

| Depth | Means |
|---|---|
| `settled` | The outcome was read back from the authority that decides it — chain state, a stored record, a balance. |
| `flow` | The journey completed and the interface agreed it had. |
| `smoke` | A surface rendered; a control existed. |
| `skipped` | Tests are written and cited, and they **do not execute**. |
| `none` | No test, or only assertions that cannot fail. |

A flow whose only test is guarded by a precondition that can be absent is `smoke`, however many
tests pass.

`skipped` exists because a permanently-skipped test is the same defect as anti-pattern 7 arriving
by another route — the suite is green, the row says covered, nothing was checked. It was measured
(#1271): the account-native tier ran **1 of its 17 tests** for want of an env var nothing set, while
six rows read `covered / flow`. The depth cites the dead tests, so a reader can find them, and
claims nothing: its status must be `absent` or `partial`, and `missing` must say why they do not
run. It sorts below `smoke`, so it loses every is-this-proven comparison.

A skip that is *conditional* on something CI provides is fine. A skip nothing can satisfy is a
gap, and belongs in the matrix as one.

## Anti-patterns

Each of these was a real cause in the 122-blocker list, and each made a test that *looked* like it
was checking something.

| # | Pattern | Why it looks fine | What it actually did |
|---|---|---|---|
| 1 | `cy.get(x).then($el => { if ($el.length) … })` | Reads as an optional step | `cy.get` **fails the command** when nothing matches, so the guard never runs. The step is not optional — it is absent. |
| 2 | Unscoped `cy.contains` in a portalled-modal app | The assertion passes | It matched the page *behind* the modal. A visibility assert does not catch it: the wrong element genuinely is visible. |
| 3 | `$panel.find(...)` inside `.then()` reported as state | Looks like reading the UI | It is a DOM snapshot taken once, before async-gated controls render. |
| 4 | `cy.on(...)` registered before `cy.mockWeb3Provider()` | Both lines are present | `cy.on` registers synchronously and the mock only enqueues, so the wrapper finds nothing to wrap and installs nothing. |
| 5 | Rejecting `eth_sendTransaction` to test a refusal | Looks like a refusal test | On the intent rail the member's authorization is a **signature**; nothing is refused. |
| 6 | Silent no-op branches | The test goes green | It continued past a failed precondition and died somewhere unrelated — or passed having tested nothing. |
| 7 | `expect(true).to.be.true` behind a precondition guard | Reports as coverage | 33 branches across four money-path specs. **A test that passes when its precondition is absent is worse than a missing test.** |
| 8 | `if (!Cypress.env('X')) this.skip()` where nothing sets `X` | Reads as a conditional skip | The skip is permanent, not conditional. 16 of the account-native tier's 17 tests were pending for a year while the matrix called them covered; when they were finally allowed to run, every one of them failed (#1271) — including three asserting a `data-testid` the app does not have. Record it as depth `skipped`, and make the env var real or delete the test. |
| 9 | `const t0 = Date.now()` in a Cypress test body | Looks like a stopwatch | The body is EVALUATED before a single command runs, so the timer starts at test start and a later assertion is charged everything before it. RU-01 read 16s for a sign-in that takes ~700ms. Stamp inside `cy.then()`. |

### Pattern 7 is gated

`frontend/src/test/e2e-policy/assertionDepth.test.js` fails the build on an unconditional-truth
assertion in `cypress/e2e/**` unless the line above it carries:

```js
// EITHER-WAY: <why this outcome is genuinely either-way>
expect(true).to.be.true
```

There is one legitimate use of the pattern — an outcome that may honestly go either way — and it
deserves a sentence saying which, so the exceptions stay countable. The gate reports the running
total on every failure.

The same gate reports **contradictory accepted-terms** (a success check that also accepts `'error'`
or `'failed'`) and requires every accessibility suppression to name its tracking issue.

## Fixture and precondition conventions

- On-chain preconditions go through the `chainTx` task, never through the UI — unless driving the UI
  *is* the thing under test.
- A spec that advances the chain clock opts into per-test isolation with `resetChainBetweenTests()`,
  called **after** the spec's own `before` hook so durable fixtures survive the reverts.
- After any revert, re-point the browser clock at the chain with `syncBrowserClockToChain()`. The app
  decides expiry in browser time and the contracts enforce chain time; a deadline test is meaningless
  while the two disagree.
- `chainTx` decodes custom errors, so a reverting precondition says why rather than failing silently.
- The **development warning banner is dismissed before every test** (`dev_warning_banner_dismissed`,
  set from `window:before:load` in `cypress/support/e2e.js`). It is a dev-build affordance that never
  ships, it is `position: fixed`, and it reserves a hardcoded 45px while wrapping to three lines at
  390px — so at phone width it covers the fixed wallet-connect button (#1248). A spec working around
  it would be paying attention to something no member ever sees.

## Viewports

Both viewport profiles live in `frontend/cypress/support/viewports.js` and are applied from a global
`beforeEach`, selected by `CYPRESS_VIEWPORT_PROFILE`:

| Profile | Size | Notes |
|---|---|---|
| `desktop` (default) | 1280 × 720 | What every existing spec was written against. |
| `phone` | 390 × 844 | iPhone 12/13/14 logical viewport. |

Applying it globally is deliberate: a spec that sets its own viewport inherits desktop forever, and
the phone leg quietly stops growing. Only the no-chain tier runs both legs — responsive behaviour
needs no chain, and admission rule 1 applies to it like everything else.

Use `cy.assertReachable(selector)` before operating a control in a responsive assertion.
`should('be.visible')` passes for an element scrolled outside a clipping container: present is not
reachable.

## Accessibility

`cy.a11yScan()` runs the installed `axe-core` against the surface on screen.

```js
cy.a11yScan()                                         // the document
cy.a11yScan({ context: '.modal-root' })                // an open modal, not the page behind it
cy.a11yScan({ disableRules: [{ rule: 'color-contrast', issue: '#1019' }] })
```

- **Serious and critical violations fail the build**, per constitution V's WCAG 2.1 AA commitment.
  Moderate and minor are logged.
- **Scope the context** when a modal or drawer is open. The app portals its modals; a document-wide
  scan attributes the page's violations to the modal under test — pattern 2 in a different costume.
- **Every suppression names an issue.** Both the command and the gate reject one that does not.
- A scan that could not run fails. An accessibility check that silently did nothing is a green gate
  over an absent test.

## Performance

Budgeted routes live in `frontend/lighthouse-routes.json` and are measured on both a desktop and a
mobile profile (`frontend/lighthouserc.desktop.json`, `frontend/lighthouserc.mobile.json`). Both
configs must collect **exactly** that route list — asserted by
`check-lighthouse-coverage.js --routes-only` and by a unit-job gate, because otherwise the route set
lives in three files and a disagreement makes the coverage check answer a different question than
the one it appears to answer.

Budgets **report**; they do not block. A Lighthouse score on a shared runner moves several points
run to run, and a gate that mostly reports the runner is a gate people learn to re-run.

That is asserted, not assumed: **only accessibility audits may be set to `error`**, and the configs
carry no assertion preset — `lighthouse:recommended` marks nearly every audit `error`, which is how
`non-composited-animations` blocked this job on four routes the first time it measured more than
one. `frontend/src/test/e2e-policy/lighthouseRoutes.test.js` fails on a re-added preset, or on any
non-accessibility audit set to `error`.

What does block is a route that produced **no measurement**:
`scripts/e2e/check-lighthouse-coverage.js` fails when any route × profile is missing. `lhci` asserts
only over URLs it collected, so a route that failed to load otherwise contributes nothing and leaves
the job green — the same shape as every gate this repo has had to repair.

## Runtime budgets and sharding

The on-chain tier is split across 4 shard legs, each with its own chain. Per-spec durations live in
`frontend/cypress/coverage/full-tier-weights.json` and the split is longest-first
(`scripts/e2e/split-full-tier.js`), because balancing spec *count* leaves the critical path almost
unchanged — the specs are nowhere near equal.

A tier over budget is a backlog item: split it, trim it, or move flows to a cheaper tier. Raising the
number is a decision that gets written down with its reason.

**The no-chain tier is over budget today** — 11:20 and 11:30 a leg against the 6 minutes stated
above. That budget was set from an assumption before this tier had ever run at two profiles, and the
first measurement contradicted it by roughly a factor of two. It is left as written, with the
measured value beside it and #1249 tracking the gap, rather than quietly rewritten to match what CI
happens to produce — a budget edited to fit its measurement is not a budget.

The on-chain tier is inside its budget: 6:37 / 7:51 / 6:29 / 6:09 against 15 minutes a shard.

## Adding coverage

1. Add or update the flow's row in `frontend/cypress/coverage/matrix.json`.
2. Run `npm run e2e:matrix` and commit the regenerated document.
3. Write the test in the tier the admission rules choose.
4. Run `npm run test:frontend -- --run src/test/e2e-policy` before pushing.

**Do not add a dependency for any of this without reading spec 075's lockfile hazard first.** The
accessibility scan injects the already-installed `axe-core` rather than adding `cypress-axe` for
exactly that reason.
