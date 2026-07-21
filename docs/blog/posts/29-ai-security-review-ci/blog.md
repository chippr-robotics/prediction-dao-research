# The AI Reviewer That Reads Every Contract Change — And Can Never Approve One

*How FairWins adds an AI security reviewer to its pipeline as one layer among many — advisory by design, never the thing that lets code ship*

| | |
|---|---|
| **Series** | Security & DevOps (Part 1 of 4) |
| **Audience** | Founders, product leads, and AI-curious builders |
| **Tags** | smart-contract-security, ai, code-review, quality |
| **Reading time** | ~7 minutes |

---

A developer opens a change to one of FairWins' core contracts — the one that escrows every wager. It adds a new refund path: if a wager expires before anyone accepts it, the creator can pull their stake back. A dozen lines, one token transfer, one bit of saved state.

Within a few minutes, three different things look at that change and disagree about what matters. An automated code scanner flags a known-risky pattern around the transfer. A test-coverage check reports that the new branch is exercised by exactly one test. And an AI teammate leaves a comment that reads less like a tool and more like a colleague: the refund quietly emits no notification event, the "only the creator can do this" rule should be stated explicitly rather than assumed, and touching this contract's stored data deserves a second look, since it is an upgradeable contract where the shape of stored data must stay stable.

None of the three is the final word. The scanner produces false alarms; the coverage number is a proxy for thoroughness, not proof; and the AI reviewer is a language model — fluent, confident, and occasionally wrong in ways that are *harder* to catch precisely because it writes so plausibly. So the interesting question was never "can an AI find bugs in a smart contract?" It was: **how do you place an AI reviewer into a pipeline so it adds signal without adding noise — and without anyone mistaking its output for a guarantee?**

## Several layers, each with a different blind spot

FairWins treats every line of on-chain code as hostile until proven otherwise — it handles real money held in escrow. The project's own standards make the security bar non-negotiable, and deliberately name *several* mechanisms, not one:

- Automated static analysis must pass with no new serious findings.
- Logic that manages state must survive automated stress-testing (throwing large volumes of random inputs at it) and, on a slower cadence, deeper mathematical exploration of the states it can reach.
- Every contract change must be reviewed against the AI security reviewer.
- Human security review — and, for the highest-risk paths, an external audit — remains the final word.

Each has a *different* blind spot, which is exactly why they are stacked. The static scanner is fast and consistent but only catches patterns it was taught to recognize. The stress-testing tools explore far more behavior but are slow and finicky. Human review is the deepest but the scarcest resource — and human attention fatigues.

The AI reviewer fills a specific gap. It reads a change the way a person does — in context, with an eye for intent — and reasons about things a pattern-scanner handles poorly: a missing notification event, an access-control comment that doesn't match the rule it describes, a refund path inconsistent with the rest of the contract. It is good at the "a careful teammate would raise an eyebrow here" category, and bad, unavoidably, at being consistent.

## What the reviewer actually is

The reviewer is not a custom-trained model — it is an off-the-shelf AI coding agent, configured with a written brief that gives it a persona, a review method, and a strict scope. It wakes on changes that touch contract code and posts comments inline, the same place a human reviewer would.

That brief is deliberately opinionated about *how* the reviewer may speak. Every finding must follow one fixed shape: a severity label, the precise location, a plain description, what could happen if it were exploited, a concrete recommended fix, and a reference to a recognized security standard. That template is a noise-control device: an AI asked to simply "review this contract" will generate paragraphs of generic advice, but forcing every comment to carry a severity, a location, a real consequence, and an actionable fix means a vague, un-pin-downable comment tends not to get written at all. Severity comes from a fixed scale with worked definitions, so "Critical" means "funds could be lost or the contract fully compromised," not "the model felt strongly."

The review method mirrors the checklist a human security engineer would run — access control, reentrancy, arithmetic safety, oracle manipulation, and the extra care upgradeable contracts demand — and frames findings against a published, industry-recognized set of security levels, giving severity a shared external vocabulary instead of a per-reviewer gut call.

## Scoped tight, so it stays worth reading

The single most important choice was deciding what the reviewer *refuses* to look at. Its scope is explicit: smart contracts and the code directly around them — and *not* the web frontend, backend services, generic pipeline config, or documentation-only edits. That narrowing does real work. An AI that comments on everything trains people to ignore it — the tenth reflexive "consider adding a comment here" on a docs change is the one that mutes the whole bot. Keeping the reviewer bound to the highest-risk code and quiet elsewhere is what keeps its comments dense and worth reading.

## The line we do not cross: advisory, never the gate

This is the design decision that matters most. The AI reviewer has **no ability to block a change from shipping.** The deterministic layers — the test suite, the coverage check, the static scanner — are required checks that can turn the merge button red. The AI's output is *not* one of them: it posts comments; it never sets a required check.

That asymmetry is intentional. A gate has to be *reproducible* — run it twice on the same code and get the same answer — or it becomes a flaky, resented obstacle. AI output is non-deterministic: the same change can yield differently-worded findings, or a finding on one run and silence on the next. Wiring that into a required check would either block work arbitrarily or, far worse, teach the team that a green "AI security passed" badge means the code is safe. It doesn't — it means one probabilistic reviewer didn't object this time.

So the tests and scanner are the gates, and the AI reviewer is a colleague whose comments a human still has to read and judge. The requirement is that a change *be reviewed against* the AI, not that the AI *approve* it — human security review remains the merge authority.

## Being honest about what an AI reviewer can't do

Any team adopting this should say the quiet parts out loud.

- **It hallucinates with confidence.** The failure mode isn't silence — it's a fluent, well-formatted finding that cites a real-sounding standard for a vulnerability that isn't there. Every finding still needs a human to confirm the risk is real.
- **There is no guarantee of what it catches.** Unlike the static scanner, whose rule set is finite and knowable, you cannot say what the AI will and won't find. A missed problem leaves no trace, and silence is not evidence of safety.
- **It sees the change, not the whole system.** It reasons well about local details and poorly about how contracts interact, economic attacks, and exploits that unfold across many transactions — exactly where stress-testing and human auditors earn their keep.
- **It is not an attacker.** A real adversary chains together borrowed funds, reordered transactions, and manipulated price feeds. The AI is a careful reviewer, not a red team.

The right mental model is a tireless, well-read junior security engineer who reviews every change without fatigue and must never be trusted as the last line of defense. Its value is catching the *ordinary* issues early — so human reviewers and the deterministic tooling can spend their scarce attention on the hard, systemic questions no AI can be trusted to answer.

## Trade-offs

The design comes down to a few deliberate exchanges. We accept that the AI layer can't block changes, so a probabilistic pass can never masquerade as a safety guarantee. We restrict it to contract code to keep its signal high. And we force every comment into a rigid severity/location/impact/fix shape, losing the occasional brilliant tangent but making the typical comment actionable. The through-line: the AI is cheap and continuous, the scanner is reproducible, stress-testing is deep, humans and auditors are final — remove any one and the stack weakens, but no single layer, least of all the AI, is sufficient alone.

---

> **A note on responsible use:** FairWins is a platform for peer-to-peer wagers on public-information forecasting. The security tooling described here protects escrowed user funds; it is not a substitute for professional audit, and participants remain subject to applicable law.

## Further reading

- EthTrust Security Levels, Enterprise Ethereum Alliance — the security-level vocabulary findings are framed against: https://entethalliance.org/specs/ethtrust-sl/
- Smart Contract Weakness Classification (SWC) Registry — a catalog of common contract vulnerabilities: https://swcregistry.io/
- Consensys Smart Contract Best Practices — a widely used security reference: https://consensys.github.io/smart-contract-best-practices/
- Trail of Bits, "Building Secure Contracts" — public guidance on tooling and secure design: https://github.com/crytic/building-secure-contracts
