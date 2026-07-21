# Quality Gates That Fail Loudly

*How a false 0% on our escrow contract taught us to build guardrails that physically stop a risky change from shipping*

---

| | |
|---|---|
| **Series** | Security & DevOps (part 2) |
| **Part** | 30 of 34 |
| **Audience** | Engineering leads, founders, security-minded teams |
| **Tags** | `quality-gates`, `test-coverage`, `ci`, `guardrails` |
| **Reading time** | ~7 minutes |

---

## A green test suite that was quietly lying

On July 6, 2026, the weekly deep-test run went red. The number of failures was not a coincidence: 182 contract tests had all failed with the same error, "ran out of gas." Those tests were exactly the ones exercising the core escrow contracts — the code that holds every participant's stake — so the report showed the entire escrow family at a flat **0% tested**, and overall coverage had dropped from about 57% the week before to 31%.

Here is the uncomfortable part. Nothing had actually broken in the contracts. The escrow logic was fine, its tests passed under a normal run, and no funds were ever at risk. What had broken was the *measurement*.

To measure test coverage, tooling rewrites the contract code to record which lines run during a test — which makes it bigger and more expensive to execute. Several recently added contracts — the passkey smart wallets, the group wager pools, and the gasless registry that already sits right against the blockchain's hard size limit — got pushed past the run's execution budget once rewritten, and ran out of gas before their tests could reach the escrow paths.

That failure mode is worse than a broken test. A broken test is loud and obvious; this was a *safety net reporting a false alarm in the wrong direction*. The most important contract read as untested, and the number was low enough that a *real* coverage regression could have hidden in the noise and merged unnoticed.

So the work had two goals — restore a measurement you can trust, then wire it so a genuine regression fails the build loudly instead of drifting by unseen. This post is about those guardrails. The interesting part is not "write more tests"; it is: how do you build a quality gate that measures the right thing, can't be tricked into a false pass, and actually blocks a risky change instead of filing a complaint nobody reads?

## Fix the measurement before trusting the number

The first job was to get the measured tests to run at all. The fix was deliberately narrow: only in coverage mode does the system relax its execution budget, giving the rewritten, bloated contracts enough headroom to finish, while normal test runs and gas reports keep realistic, production-like limits. We restored the room needed to measure without pretending real-world gas is unlimited. A few days later the run was clean: 674 tests passing, zero out-of-gas failures.

The second problem was subtler: *what* to measure. Even when green, the blended number was misleading, because it averaged in third-party code the project didn't write — cryptography libraries, wallet-standard code, other vendored components — plus test-only scaffolding, none of which FairWins owns or should be judged on.

The obvious fix — telling the coverage tool to skip those files — is a trap. When a first-party contract *imports* a skipped file, skipping it corrupts the tool's line-attribution, and the importing contract's own coverage collapses to a fraction of the truth: the exact false-0% disease we were curing. So the design keeps measurement broad and does all the filtering *afterward*, in a separate accounting step that subtracts the vendored and test-only code so the headline number reflects only what the team owns.

One deliberate exception survives: a handful of wallet contracts adapted from third-party code but *deployed live and custodying real funds*. Because they hold money, they are counted. Only the deeper cryptography libraries beneath them stay excluded.

## The policy file is the whole argument

Every threshold lives in one auditable place — a single policy file, changed only through a reviewed pull request, with no config scattered across pipeline scripts. The gate reads three risk-based tiers:

- **Tier A — funds custody and settlement** (escrow contracts, group pools, voucher redemption, oracle auto-resolution): the highest bar, at least 95% of statements and 90% of branches.
- **Tier B — security-critical supporting code** (deployed wallets, oracle adapters, access control, gasless plumbing): at least 90% / 80%.
- **Tier C — everything else first-party:** at least 80% / 70%.

Each gated contract carries its tier and, optionally, a per-contract floor that works as a **ratchet**. The tier is the audit-readiness *target*; the floor is the currently-enforced minimum for a contract that hasn't reached target yet. The gate fails the moment coverage drops below the floor, so it can never regress, while the target stays visible as the number to climb toward. As gaps close, you raise the floor and eventually delete it, at which point the full tier is enforced.

Two more lists complete the policy. **Report-only** contracts are measured and printed but never able to fail the gate, so code that hasn't shipped is visible without blocking work; **excluded** vendored and test-only paths are dropped from accounting entirely. The rule is strict: never leave a shipped, fund-handling contract in report-only. When a new custody contract goes live, it moves into the gated tier, its tests come up to standard, and only then does the gate go green.

## The gate itself: pass, fail, or bad input — no negotiation

The gate reads the coverage results and the policy, then returns one of three plain outcomes: pass, something below its floor (fail), or broken input (fail differently). Two design choices make it hard to fool.

First, a gated contract that is **missing** from the coverage report is treated as a *failure*, not an oversight. "File present, essentially untested" in a security-critical area is exactly the July 6 scenario — so you cannot make the gate pass by deleting a contract's tests so it quietly drops out of the report.

Second, beyond the per-contract tiers, the gate enforces a floor on the *overall* first-party number that only ratchets upward: after the fix it was raised to the new, honest baseline, and the blended total can only go up from there.

The gate runs in two places. On **every pull request** it checks the gated contracts and blocks the merge if any security-critical contract is below its floor — coverage generation is a required step that can't be quietly skipped, so a regression is caught *before* merge, not a week later. **Weekly**, it runs across everything, printing the full first-party table into the run summary and failing on any gated breach.

## A second guardrail rides alongside

Coverage is not the only thing that fails loudly. FairWins runs several contracts as upgradeable proxies, where the logic can be swapped out but the stored data must be preserved exactly. A well-meaning refactor that reorders a stored variable is invisible to a coverage number and catastrophic to a live proxy: it can silently scramble everyone's balances. So a storage-layout check runs in the same job, before the tests, and blocks the pipeline on any change that would make an upgrade unsafe. Same doctrine, a different invariant: catch the catastrophic-but-invisible change before it can ship.

## Design decisions and trade-offs

Two choices drove the design. We filter vendored code *in accounting, not in measurement* — the only way to get an honest number and uncorrupted line-attribution at once. And we made the threshold a *ratchet, not a cliff*: it locks in current coverage and only blocks a *drop*, which is the difference between a gate teams route around and one they live with.

The subtler point is being **honest about what actually blocks.** Coverage thresholds, storage layout, unit tests, linting, and the frontend build are hard gates that cannot be bypassed. The heuristic security analyzers, by contrast, run as *informational* steps: their findings are saved and reviewed, but a raw finding does not automatically fail the pipeline, because their false-alarm rate would turn the gate into noise. A "fail loudly" culture is only credible when you are precise about which checks are loud and which are advisory.

The measurable outcome: 182 measurement-induced out-of-gas failures went to zero, the escrow family reports real coverage instead of a false 0%, and a deliberately weakened test on a security-critical contract now fails the gate — naming the contract and the metric — *before* it can merge, not a week after.

## Further reading

- Istanbul — the code-coverage tooling standard behind these reports: https://github.com/istanbuljs/istanbuljs
- solidity-coverage — how coverage is measured for smart contracts: https://github.com/sc-forks/solidity-coverage
- OpenZeppelin Upgrades — the storage-layout safety rules for upgradeable contracts: https://docs.openzeppelin.com/upgrades-plugins/
