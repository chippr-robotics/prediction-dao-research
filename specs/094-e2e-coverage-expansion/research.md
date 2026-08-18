# Phase 0 Research: End-to-End Coverage Expansion

**Feature**: 094-e2e-coverage-expansion | **Date**: 2026-08-18

Every decision below was taken against a constraint this repo has already been bitten by, and each
records what it rejected. Where a choice adds a dependency, the default answer is no — spec 075
documents how a lockfile touch drops the platform binary that every Vite build needs, and three of
five Dependabot lockfile PRs in one week did exactly that.

---

## R1 — Where the coverage matrix lives, and how it is kept honest

**Decision**: The matrix's source of truth is a machine-readable file,
`frontend/cypress/coverage/matrix.json`, keyed by **spec directory name** (`073-miniapp-platform`,
not `73`). A generator renders `docs/developer-guide/e2e-coverage-matrix.md` from it, and a gate
regenerates and diffs.

**Rationale**: FR-005 requires an automated staleness check, and prose cannot be checked. Keying on
the directory name rather than the number is forced by the repo: three numbers are used twice
(`017-subgraph-v2-wager-transfers` / `017-wager-grid-redesign`, `041-oracle-open-challenges` /
`041-passkey-wallet-login`, `050-earn-lending-rewards` / `050-sponsored-paymaster`), so a numeric key
would silently collapse two features into one row.

The staleness check works only because **every** spec directory gets an entry, including the ones
with no member-facing flow (`075-monorepo-workspaces`, `079-hardhat-3-migration`,
`087-infrastructure-as-code`). Those carry `memberFacing: false` with a reason. That makes the gate a
set-equality check — matrix ids equal directory names — rather than a judgement about which features
"should" have been listed, which is exactly the judgement that decays.

**Alternatives rejected**:
- *A markdown table as the source of truth.* Readable, unparseable, and the first thing to drift.
- *Deriving rows from the test files.* Only finds flows someone already tested — the file cannot
  represent an absent flow, which is the entire point of the document.
- *A row only for features judged member-facing.* No gate can then distinguish "correctly omitted"
  from "forgotten", which is the failure mode FR-005 names.

**Precedent in-repo**: spec 089's FinOps catalogue (declare once, generate the dashboards, gate the
coverage) and `infra/grafana/` (generated, committed, regenerate-and-diff).

---

## R2 — Assertion depth as data, and catching assertions that cannot fail

**Decision**: Depth is a four-value enum recorded per row — `none` / `smoke` / `flow` / `settled` —
where `settled` means the outcome was read back from the authority that decides it (chain state, a
stored record), `flow` means the journey completed and the interface agreed, and `smoke` means a
surface rendered. Two automated gates back it, both implemented as Vitest tests under
`frontend/src/test/e2e-policy/` so they run inside the existing Frontend Unit Tests job:

1. **Unconditional-truth gate** — `expect(true).to.be.true` (and `expect(1).to.equal(1)` and
   friends) in `cypress/e2e/**` fails unless the line directly above carries a
   `// EITHER-WAY: <reason>` comment. The comment is what keeps the exceptions countable.
2. **Contradictory-terms gate** — a single assertion whose accepted-terms list contains both a
   success term and a failure term (`'resolved'` alongside `'failed'`/`'error'`) is reported. This
   is the shape that made several current tests pass whether the operation worked or not.

**Rationale**: The 33 vacuous branches were invisible because "a test exists and passes" was the
only recorded fact. Depth as a separate column is what lets the matrix say *covered by a test that
cannot fail*, which is the true state of several rows today.

**Alternatives rejected**:
- *ESLint rule.* The e2e tree is linted, but the rule would live in the frontend ESLint config and
  fire on unit tests too; a targeted gate that reads the files is simpler and its failure message can
  quote the policy.
- *Banning the pattern outright.* There is one legitimate use — a genuinely either-way outcome — and
  banning it drives people to `expect(x).to.exist` instead, which is the same lie in a better
  disguise.
- *Auto-deriving depth from the test source.* Not decidable. A human sets the value; the gates catch
  the specific lies that have actually occurred.

---

## R3 — Running an accessibility ruleset in Cypress without a new dependency

**Decision**: A `cy.a11yScan(options)` command injects the already-installed `axe-core` (a frontend
devDependency at `^4.10.2`) into the application window and runs it. No `cypress-axe`.

**Mechanics**: read `node_modules/axe-core/axe.min.js` through a Cypress task at run time, evaluate
it in the app window, then call `axe.run(context, options)` and fail on results whose `impact` is
`serious` or `critical`. The failure message names the rule id, the impact, and the failing
selectors.

**Rationale**: `cypress-axe` is a thin wrapper over exactly this, and adding it means touching the
lockfile. Given spec 075's measured failure mode — an incremental install silently dropping
`@rolldown/binding-linux-x64-gnu` from both `node_modules` and the lockfile, breaking every Vite
build including the on-chain mini-app release path — a wrapper is not worth the risk. `axe-core` is
already present because `vitest-axe` uses it for component-level checks, so the ruleset version is
already pinned and already in the tree.

**Context, not the page**: the scan takes an explicit context so an open modal is scanned *as* the
context. This matters for the same reason unscoped `cy.contains` is an anti-pattern here — the app
portals its modals, so a document-wide scan reports violations from the page behind the modal and
attributes them to the modal under test.

**Severity**: `serious` and `critical` fail; `moderate` and `minor` are reported in the run log. That
is the level constitution V's WCAG 2.1 AA commitment actually maps onto in axe's taxonomy, and it is
also where the signal-to-noise stays usable.

**Suppressions**: a scan may pass `disableRules: [{ rule: 'x', issue: '#NNNN' }]`. The gate in R2's
directory also asserts every suppression carries an issue reference, so exceptions stay countable
rather than accumulating — the same reasoning as the `// EITHER-WAY:` comment.

**Alternatives rejected**:
- *`cypress-axe`.* One more lockfile entry for a wrapper we can write in 40 lines.
- *Keeping the hand-written `checkA11y` command.* It checks image alts and button names with jQuery
  and guards both loops with `if ($els.length > 0)` — the exact pattern that passes when the
  precondition is absent. It is superseded, and the old command is removed rather than left as a
  second, weaker way to do the same thing.
- *Lighthouse's accessibility category as the only check.* It runs against a cold page load, so it
  can never see a modal, a drawer, or any state a member reaches by interacting.

---

## R4 — Phone and desktop viewports

**Decision**: Two named profiles in one place, `frontend/cypress/support/viewports.js` —
`phone` (390×844) and `desktop` (1280×720, today's configured default). The profile is selected by
`CYPRESS_VIEWPORT_PROFILE` and applied in a global `beforeEach`; CI runs the no-chain tier twice, once
per profile, as two matrix legs of the same job. A spec that must assert responsive behaviour
directly can still call the profile helper inline.

**Rationale**: The alternative — every spec declaring its own `cy.viewport()` — guarantees that new
specs inherit 1280×720 and the phone leg quietly stops growing. Driving it from the environment means
a new spec is covered at both widths the day it lands, with no author action.

390×844 is the iPhone 12/13/14 logical viewport and the narrowest mainstream target; 1280×720 is kept
because it is what every existing spec was written against, so the desktop leg is a no-op change and
any diff in that leg is a real regression rather than a re-baselining.

**Only the no-chain tier is doubled.** The on-chain tier is ~30 minutes of mining real transactions;
doubling it to prove that a button is reachable at 390px is the exact trade the tiering policy
forbids — a flow validatable without a chain must not consume chain-tier runtime. Responsive
behaviour is validatable without a chain.

**Reachability, not existence** (FR-020): the helper asserts the control is in the layout viewport and
not clipped by an ancestor before it is operated, because `should('be.visible')` passes for an element
scrolled outside a clipping container as long as it has dimensions.

**Alternatives rejected**:
- *A separate `cypress/e2e/mobile/` tier.* A third place to forget to add a spec, and it would
  duplicate the flows rather than re-running them.
- *Cypress's `cy.viewport('iphone-x')` presets.* 375×812, an older device, and the name hides the
  number — a reader cannot tell what was actually asserted.

---

## R5 — Lighthouse: routes, profiles, budgets, and what "unmeasured" means

**Decision**: Split the single `lighthouserc.json` into two configs sharing one route list —
`lighthouserc.desktop.json` and `lighthouserc.mobile.json` — and run both. Budgets are baselined
from the current measured values and asserted at `warn`; a **post-run check script fails the job when
a route×profile produced no report**.

**Rationale**: `lhci` takes a single `settings.preset` per run, so desktop and mobile emulation cannot
coexist in one config; two configs is the supported shape, and route lists stay identical by both
reading one JSON list.

The gate strength was decided with the requester: accessibility blocks, performance reports. A
Lighthouse score on a shared GitHub runner moves several points run to run, so a failing budget
would mostly report the runner's neighbours. What is *not* noisy is whether a measurement happened at
all, and that is where the current setup is weakest: `lhci autorun` reports its assertions per URL it
collected, so a route that failed to load contributes nothing and the job stays green. FR-026 exists
for that case, and the check script — assert one `lhr-*.json` per configured route per profile — is
what implements it.

**Routes**: the SPA's member-facing entry points, taken from the real router (`/`, `/wagers`, the
wallet surfaces, the apps catalogue). `vite preview` serves the SPA fallback, so deep routes render
rather than 404.

**Alternatives rejected**:
- *Failing on the budget from day one.* Rejected by the requester's gate-strength decision, and
  correctly: the first flake teaches people to re-run the job, which is how a gate stops being read.
- *Lighthouse-CI's server/upload.* Infrastructure to run and pay for; the artifacts plus the step
  summary already carry the numbers.

---

## R6 — Sharding the on-chain tier

**Decision**: Shard `cypress-full-e2e` across a GitHub Actions matrix of **4** legs, each starting
its own Hardhat node, deploying, seeding, and running its own subset. Subsets come from a committed
weights file (`frontend/cypress/coverage/full-tier-weights.json`, measured seconds per spec) split
longest-first by a small deterministic script; with no weights recorded, the script falls back to
round-robin over the sorted spec list.

**Rationale**: Per-spec chain isolation (`chainCheckpoint`, merged in #1222) is what makes this legal
— before it, run order decided which specs passed, and splitting the list would have changed results.
Each leg gets a private chain, so legs cannot interfere at all.

Longest-first (LPT) matters: alphabetical round-robin balances *spec count*, and the specs are not
close to equal — one lifecycle spec runs many minutes while others run one. Balancing counts leaves
the critical path barely shorter than today, which would be an honest measurement of nothing.

4 legs, not 8: each leg pays a fixed ~3-4 minutes of install, compile, node start, deploy and seed. At
8 legs that setup is a large fraction of each leg's wall clock, and the runner minutes grow faster
than the wall clock falls. 4 is where the marginal leg still pays for itself against a ~30 minute
serial run.

**The timeout must come down with it.** A 60-minute cap on a leg that should take ~10 means a hung
leg burns an hour before failing. Each leg gets its own bounded timeout.

**Alternatives rejected**:
- *`cypress-split` / Cypress Cloud orchestration.* A dependency (or a paid service) for a list split
  that is fifteen lines and deterministic.
- *One chain shared by all legs.* Legs would race on chain state; the isolation harness is per-process.
- *Not sharding.* Rejected by the requester. The tier is the merge gate for the money paths and it is
  about to grow by every flow in the backlog; the time to split is before it doubles, not after.

---

## R7 — What "measured" means for the runtime budget

**Decision**: Record per-spec durations from a real CI run into the weights file, and state each
tier's budget in the policy: no-chain tier under 6 minutes per viewport leg, on-chain tier under
15 minutes per shard, account-native tier under 5 minutes. A tier over budget is a backlog item to
split or trim, not a licence to raise the number silently.

**Rationale**: The issue's ~30 minutes is a local measurement. Shard balance depends on per-spec
numbers, so they have to be recorded anyway; recording them in the repo makes the budget checkable
and the sharding decision reproducible rather than asserted.

---

## R8 — Where the enforcement gates run

**Decision**: All new gates run in **existing** jobs. The assertion, suppression and matrix-staleness
gates are Vitest tests under `frontend/src/test/e2e-policy/`, picked up by the Frontend Unit Tests
job. The generated-matrix diff is a `check:e2e-matrix` npm script called from the same test. No new
workflow.

**Rationale**: A new job is a new thing to be excluded from the merge gate. The repo's own history
here is the argument: the e2e gate carried `continue-on-error: true` *and* grepped for a token its
reporter never emits, so it reported success on every run while tests failed. Gates that ride inside
a job people already read are harder to quietly neutralise, and `test/config/CiGates.test.js` already
guards the workflow shape from the other side.

---

## R9 — Which flows can be driven locally at all

**Decision**: Classify each absent flow by what it needs, and record the ones that cannot be driven
as out-of-scope **with the reason** rather than as tests that skip.

| Needs | Flows | Disposition |
|---|---|---|
| Local chain only | Wager pools, platform fees, callsigns, mini-app registry, admin consoles, membership, custody policy evaluation | On-chain tier — drivable today |
| Client-side only | Legacy recovery import/encrypt, message signing + verify (offline leg), network endpoints, tenant resolution, nav/search | No-chain tier — drivable today |
| A third-party venue | Polymarket order book, Across relayers, OpenSea, perpetuals venues | Drive up to the venue boundary (disclosure, quoting, gating); the venue call itself is out of scope with the reason recorded |
| Physical hardware | Ledger/Trezor confirmation | Out of scope; the vendor seam is already unit-tested behind `connectHardware` |
| A non-EVM chain | Bitcoin send/receive | Out of scope for now — no local regtest in the harness; recorded as a gap with what it would take |

**Rationale**: FR-018. A test that skips silently and a test that passes vacuously are the same
defect; the matrix row with a reason is the honest form, and it is also the thing that stops the same
gap being re-litigated next quarter.

---

## Dependencies added

**None.** `axe-core` is already a frontend devDependency; `@lhci/cli` is already installed in CI as a
global; sharding and the gates are plain Node scripts and Vitest tests. Spec 075's lockfile hazard is
the reason this is stated explicitly rather than left implicit.
