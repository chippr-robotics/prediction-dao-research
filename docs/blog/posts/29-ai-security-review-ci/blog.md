# The LLM Reviewer That Never Merges Your Code

*How FairWins wires an AI smart-contract security reviewer into CI as one layer among many — advisory by design, never the gate*

| | |
|---|---|
| **Series** | Security & DevOps (Part 1 of 4) |
| **Audience** | Security engineers, AI-curious contract devs |
| **Tags** | smart-contract-security, ci-cd, llm, static-analysis, solidity |
| **Reading time** | ~9 minutes |

---

A developer opens a pull request that touches `contracts/wagers/WagerRegistry.sol`. It adds a new refund path: if a wager expires unaccepted, the maker can pull their stake back. Straightforward — twelve lines, one external token transfer, one storage write.

Within a few minutes, three different things look at that diff, and they disagree about what matters.

Slither, running in GitHub Actions, flags a reentrancy pattern on the transfer and notes the external call ordering. The coverage job reports that the new branch is exercised by exactly one test. And a fourth reviewer — an AI teammate configured in `.github/agents/smart-contract-security.agent.md` — leaves a PR comment that reads less like a linter and more like a colleague: it points out that the refund emits no event, that the maker-only check should be spelled out against `msg.sender` rather than inferred, and that the new path pushes the contract's storage layout in a way that deserves a second look given `WagerRegistry` is a UUPS proxy.

None of these three is authoritative. The static analyzer produces false positives on patterns it can't fully model. The coverage number is a proxy, not proof. And the AI reviewer is a language model — confident, fluent, and occasionally wrong in ways that are harder to spot precisely *because* it writes so plausibly. The interesting engineering problem is not "can an LLM find bugs in Solidity." It's: **how do you place an LLM reviewer into a pipeline so that it adds signal without adding noise, and without anyone mistaking its output for a guarantee?**

This is how FairWins does it.

## Three layers, three failure modes

FairWins treats every line of on-chain code as adversarial-by-default — it handles user funds in escrow. The project constitution (`.specify/memory/constitution.md`, Principle I) makes the security bar non-negotiable, and it names *four distinct mechanisms*, not one:

- Static analysis (Slither) must pass with no new high/critical findings.
- Stateful logic must survive fuzzing (Medusa) and, weekly, symbolic execution (Manticore).
- Every `contracts/` change must be reviewed against the smart-contract security agent.
- Human security review and, for the highest-risk paths, external audit remain the final word.

Each of these has a *different* failure mode, and that's the entire point of stacking them. Slither is deterministic and fast but pattern-bound: it catches what its detectors encode and stays silent on novel logic errors. Medusa and Manticore explore state space but are expensive and fragile — Manticore is a best-effort weekly job precisely because its install is brittle and its runs are slow. Human review is the deepest but the scarcest resource, and it fatigues.

The LLM reviewer occupies a specific gap. It reads a diff the way a reviewer does — in context, with intent — and it reasons about things a detector doesn't model well: is this event missing, is this NatSpec wrong, does this access-control comment actually match the modifier, is this refund path consistent with how the *rest* of `WagerRegistry` handles deadlines? It is good at the "a careful teammate would raise an eyebrow here" category. It is bad, unavoidably, at determinism.

## What the agent actually is

The agent is not a bespoke model or a fine-tune. It's a GitHub Copilot coding-agent configuration — a single markdown file that defines a persona, a review methodology, and a strict scope. It triggers on pull requests that modify `.sol` files under `contracts/` and posts review comments inline, the same surface a human reviewer uses.

The configuration is deliberately opinionated about *how* to speak. Every finding is forced into one shape (`.github/agents/smart-contract-security.agent.md`):

```
**[SEVERITY] Issue Title**

**Location**: `contracts/Example.sol:123-145`

**Description**: [what and why]
**Impact**: [what happens if exploited]
**Recommendation**: [specific fix, with code]
**Reference**: [standard / EthTrust-SL level requirement]
```

That template is a noise-control mechanism. An unconstrained LLM asked to "review this contract" will happily generate paragraphs of generic advice. Forcing every comment to carry a severity, a precise location, a concrete impact, and an actionable fix means a comment that can't be pinned to a line and an exploit path tends not to get written at all. Severity is drawn from a fixed taxonomy — Critical, High, Medium, Low, Informational — with worked definitions, so "Critical" means "loss of funds or complete compromise," not "the model felt strongly."

The methodology mirrors the same checklist a security engineer would run: access control, reentrancy and checks-effects-interactions, integer operations, unchecked external calls, oracle manipulation, DoS via unbounded loops, timestamp dependence, and — relevant to FairWins specifically — proxy initialization and delegatecall safety, because `WagerRegistry` and `MembershipManager` are UUPS proxies with append-only storage. Findings are framed against the [EthTrust Security Levels](https://entethalliance.org/specs/ethtrust-sl/), which gives severity a shared external vocabulary instead of a per-reviewer gut call.

## Scoped to be signal, not noise

The single most important configuration choice is what the agent *refuses* to review. Its scope section is explicit: Solidity contracts, deployment scripts, and contract-adjacent integration code — and **not** React/TypeScript frontend, backend APIs, generic CI/CD config, non-Ethereum code, or documentation-only changes.

This narrowing does real work. An LLM that comments on everything trains reviewers to ignore it; the tenth reflexive "consider adding a comment here" on a docs PR is the one that gets the whole bot muted. By binding the agent to the highest-value, highest-risk file type and staying quiet elsewhere, its comments stay dense. The configuration guide (`docs/developer-guide/ethereum-security-agent-configuration.md`) goes further, letting a project exclude `contracts/mocks/` and test contracts, and tune review depth per contract — a full analysis on fund-custody paths, a lighter pass on interfaces and libraries. In FairWins' repo map, `mocks/` is test-only and `contracts-archive/` is reference-only; there's no value in an AI reviewer litigating code that never ships.

## The line we do not cross: advisory, never the gate

Here is the design decision that matters most, and the one most easily gotten wrong.

The AI reviewer does **not** have a merge-blocking status check of its own. Look at `.github/workflows/security-testing.yml` and you'll find the deterministic layers — Hardhat tests, coverage, and Slither — wired as jobs. Slither runs `slither . --config-file slither.config.json --checklist`; its output is deterministic and reproducible, which is what lets it be a gate. The LLM's output is not in that workflow. It posts comments; it does not set a required check that turns the merge button red.

That asymmetry is intentional. A gate has to be *reproducible* — run it twice on the same commit and get the same answer — or it becomes a flaky, resented obstacle. LLM output is non-deterministic by construction; the same diff can yield differently-worded findings, or a finding on one run and silence on the next. Wiring that into a required check would either block merges arbitrarily or, worse, teach the team that a green "AI security" check means the code is safe. It doesn't. It means one probabilistic reviewer didn't object this time.

So the enforcement structure is: Slither and the test suite are gates. Medusa and Manticore are scheduled deep-dives. The AI agent is a reviewer whose comments a human must still read and adjudicate — exactly like a human colleague's comments. The constitution requires that a change *be reviewed against* the agent, not that the agent *approve* it. Human security review remains the merge authority.

## Being honest about what an LLM reviewer can't do

Any team adopting this should say the quiet parts out loud:

- **It hallucinates with confidence.** The failure mode isn't silence; it's a fluent, well-formatted finding that cites a real-sounding standard for a vulnerability that isn't there. The structured template curbs this but does not eliminate it. Every finding still needs a human to confirm the exploit path is real.
- **No ground truth, no recall guarantee.** Unlike Slither, whose detector set is enumerable, you cannot say what the LLM will and won't catch. A missed vulnerability leaves no trace. Absence of comments is not evidence of safety.
- **It sees the diff, not the system.** It reasons well about local patterns and less well about cross-contract invariants, economic attacks, and multi-transaction state machines — precisely where Medusa's fuzzing and Manticore's symbolic execution earn their keep, and where human auditors are irreplaceable.
- **It is not adversarial.** A real attacker composes flash loans, reorderings, and oracle manipulation across calls. The agent is a careful reviewer, not a red team.

The right mental model is a tireless, well-read junior security engineer who reviews every single PR without fatigue, writes tidy comments, and must never be trusted as the last line of defense. Its value is catching the *ordinary* issues early — the missing event, the unchecked return value, the CEI violation, the undocumented access-control assumption — so that human reviewers and the deterministic tooling spend their scarce attention on the hard, systemic, economic questions that no current LLM can be trusted to answer.

## Trade-offs

- **Non-deterministic reviewer, deterministic gates.** We accept that the AI layer can't block merges, in exchange for never letting a probabilistic pass masquerade as a safety guarantee.
- **Narrow scope over broad coverage.** Restricting the agent to Solidity keeps its signal-to-noise high at the cost of ignoring frontend and infra — which are covered by their own tooling.
- **Structured comments over free-form insight.** Forcing severity/location/impact/fix reduces the occasional brilliant tangent but makes the median comment actionable and auditable.
- **A layer that complements, never replaces.** The agent is cheap and continuous; Slither is reproducible; fuzzing and symbolic execution are deep; humans and auditors are final. Removing any one weakens the stack, but no single layer — least of all the LLM — is sufficient alone.

---

> **A note on responsible use:** FairWins is a platform for peer-to-peer wagers on public-information forecasting. The security tooling described here protects escrowed user funds; it is not a substitute for professional audit, and participants remain subject to applicable law.

## Sources

- `.github/agents/smart-contract-security.agent.md` — agent persona, methodology, severity taxonomy, comment template, scope limits
- `.github/agents/README.md` — trigger conditions and team-member framing
- `docs/developer-guide/ethereum-security-agent.md` — full agent guide, how PR review works
- `docs/developer-guide/ethereum-security-agent-configuration.md` — severity thresholds, exclusions, per-contract review depth, CI integration options
- `docs/developer-guide/ethereum-security-quickstart.md` — developer workflow and the explicit "not a replacement for audits/human review" note
- `docs/developer-guide/ethereum-security-agent-examples.md` — worked example findings
- `.github/workflows/security-testing.yml` — deterministic CI gates (Hardhat tests, coverage, Slither)
- `.github/workflows/torture-test.yml` — weekly Manticore symbolic execution and Medusa fuzzing
- `.specify/memory/constitution.md` — Principle I, Security-First Smart Contracts (non-negotiable multi-mechanism requirement)
- [EthTrust Security Levels](https://entethalliance.org/specs/ethtrust-sl/) — Enterprise Ethereum Alliance
- [SWC Registry](https://swcregistry.io/) — Smart Contract Weakness Classification
- [Slither](https://github.com/crytic/slither) and [building-secure-contracts](https://github.com/crytic/building-secure-contracts) — Trail of Bits
- [Consensys Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)
