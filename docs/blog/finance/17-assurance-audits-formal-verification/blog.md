# How to Read "Audited": Assurance for Smart Contracts

*What audits, automated analysis, and formal verification actually assure — and what they don't — read alongside SOC 2, model validation, and third-party assurance*

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Compliance, Disclosure & Governance |
| **Level** | Intermediate |
| **Audience** | Compliance officers, risk managers, allocators, and product leads assessing third-party assurance |
| **Tags** | `assurance`, `audit`, `formal-verification`, `due-diligence`, `smart-contracts` |
| **Reading time** | ~8 minutes |

---

A protocol's landing page says "audited." A due-diligence questionnaire comes back with a link to a PDF. You have read a great many assurance artifacts in your career — SOC 2 reports, ISAE 3402 controls attestations, model-validation memos, external audit opinions — and you know the discipline they require: *what was in scope, what standard was applied, who signed it, over what period, and what the exceptions were.* The word "audited," used about a smart contract, deserves exactly that scrutiny. This briefing is about how to apply it — how to read the assurance stack behind on-chain code the way you would read any third-party attestation, and what each layer genuinely tells you.

## The traditional model

In traditional finance, "assurance" is a layered, well-understood stack, and every layer has a defined scope. A financial-statement audit gives an opinion on whether statements are fairly presented — not a guarantee the business won't fail. A SOC 2 Type II report tests whether a service organization's controls *operated effectively over a period* — not that the system is bug-free. Model validation, in the sense your model-risk-management function uses it, independently checks that a model is conceptually sound, correctly implemented, and used within its limits. Penetration testing probes for exploitable weaknesses at a point in time. No competent professional confuses these. You would never accept "we passed our SOC 2" as evidence that a specific calculation is mathematically correct, and you would never accept a pen-test as proof that internal controls operate over a year. **Scope and standard are everything**, and the maturity of the field is precisely that everyone agrees on what each artifact does and does not cover.

## What changes on-chain

Smart-contract assurance has a parallel stack, and the single most useful thing you can do is stop treating "audited" as one thing and start reading it as *several distinct activities with very different guarantees.* There are broadly four layers.

**Automated static analysis** reads the code without running it — the way a spell-checker reads a document without understanding the plot. It is fast and cheap, so it runs on every code change, and it is genuinely good at catching known *dangerous shapes*: a payment sent before the internal record is updated (the classic re-entrancy trap), a missing check for an empty address, an ownership change with no lock. Its hard limit: it sees grammar, not meaning. It cannot tell you whether a payout *amount* is correct, because "add both stakes" and "use just one stake" look almost identical to it.

**Fuzzing** stands up a realistic copy of the whole system and throws long, random sequences of real actions at it — hundreds of operations in wild combinations — checking after every step whether a set of stated rules still holds. The most important such rule is solvency: does the contract always hold at least enough to cover everything it still owes? Fuzzing is superb at finding bugs that *no single action causes but some order of actions does*. Its honest limit is the mirror image of its strength: it is random, not exhaustive. A clean run means "no counterexample found this time," never "no counterexample exists."

**Formal verification** (in the smart-contract world, often via symbolic execution) is the layer most worth understanding, because it is the closest thing on offer to a mathematical *proof*. Instead of testing with a chosen number, it feeds the code an unknown value and reasons across *every possible value at once*, following every branch. That lets it prove statements a test never can: that a sum can never overflow into a wrong number across the entire range of inputs, or that there is no code path that skips a required safety check. This is genuinely stronger than testing — but only within a scope, and the scope is narrow: it excels at one contract at a time with a bounded number of steps, and it drowns if asked to reason about many interacting operations in arbitrary order.

**Third-party audit** is a human expert engagement: reviewers read the code, model attacker behavior, and produce a report with findings graded by severity, remediation notes, and — the part professionals actually read — the *scope*, the *commit* that was reviewed, and the *disclaimer*. A reputable audit report is explicit that it is a point-in-time review of a specific version, not a warranty that the code is safe forever.

## Where it genuinely differs

Two differences from TradFi assurance are worth stating plainly.

**Better: some of these layers deliver a strength no financial-statement audit can — actual proof over all inputs.** Formal verification, where it applies, is categorically stronger than sampling or testing. And because the code and the on-chain record are public, an assurance claim is unusually falsifiable: anyone can inspect the deployed code and the audit's stated scope and check they match.

**Worse / just different: the field is younger and less standardized.** There is no single universally-accepted "smart-contract audit standard" with the settled authority of a financial-statement audit or a SOC 2 framework. Audit quality varies widely between firms; an "audit" can mean a two-week engagement or a deep multi-month effort. The burden of reading scope critically falls more heavily on *you* than it does with a standardized attestation.

## Risk & controls: how to read "audited"

Apply the same discipline you apply to any assurance artifact.

**Insist on scope and version.** *What* was audited (which contracts), *which exact version* (code moves; an audit of last quarter's version says nothing about today's), and *what was explicitly out of scope*. An audit of the escrow logic tells you nothing about the oracle it trusts or the off-chain infrastructure around it.

**Read the findings, not the badge.** A serious report lists issues by severity and their remediation status. "Audited" with no accessible report is a marketing claim, not assurance. Look for high/critical findings and confirmation they were fixed and re-reviewed.

**Check that automated assurance is continuous and mandatory.** A one-time audit ages the moment code changes. The stronger signal is that static analysis and fuzzing run automatically on *every* change and *block* a merge on failure — the on-chain analogue of controls that operate continuously rather than being tested once. Ask whether these gates can be bypassed; a gate that can be waved through under deadline pressure is not a control.

**Beware the silent tool — the assurance-theater failure.** The most dangerous state for any verification tool is to report "green" while actually examining nothing. It is a real failure mode: a tool that cannot assemble the code, fails, and has that failure miscounted as a pass — manufacturing confidence no one earned. The professional analogue is a control that is documented but never actually operated. The mitigation is the same in both worlds: verify that the tool is genuinely exercising the real, as-deployed system, not a stripped-down stand-in, and that a non-run is treated as a failure, not a pass.

**Understand what none of it covers.** No audit or verification addresses governance risk (who can change the code afterward), key-compromise risk, oracle risk, or economic-design risk. "Audited" is a statement about code correctness within a scope — not about whether the overall arrangement is safe, sound, or suitable. Treat it as one input among several, exactly as you would treat a SOC 2 report as necessary but not sufficient.

## How FairWins approaches this

FairWins layers its assurance deliberately rather than relying on any single artifact. Fast automated static analysis runs on every change and blocks a merge on failure; fuzzing pressure-tests the real, as-deployed system — same setup, same memberships, not a toy — against explicit solvency and state-progression rules; and the highest-risk money-moving logic is additionally checked by symbolic-execution proofs, on purpose overlapping with the fuzzer so payout correctness is both *proven over all inputs* and *stress-tested over all orderings*. The team treats a silent or non-running tool as a failure rather than a pass — an explicit design lesson from experience. None of this makes bugs impossible, and FairWins says so; what it does is make whole *categories* of them very hard to ship. That posture — continuous, mandatory, overlapping, honest about limits — is what a professional should want to see behind the word "audited."

---

*This briefing is educational and informational only. It is not investment, legal, tax, or regulatory advice. An audit or verification is not a warranty of safety, and no assurance activity guarantees a system is free of defects or suitable for any particular use.*

## Related deep-dive

For the engineering details, see [Three Ways to Break an Escrow: How We Stress-Test the Code That Holds the Money](../../posts/31-symbolic-execution-fuzzing/blog.md).

## Further reading

- [AICPA SOC 2 overview](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2) — what a controls attestation covers, and its period-of-time basis
- [US Federal Reserve / OCC SR 11-7: Guidance on Model Risk Management](https://www.federalreserve.gov/supervisionreg/srletters/sr1107.htm) — the discipline of independent validation, conceptual soundness, and use limits
- [Smart Contract Weakness Registry](https://swcregistry.io/) — a catalog of known contract bug classes assurance tools target
- [Symbolic execution](https://en.wikipedia.org/wiki/Symbolic_execution) and [fuzz testing](https://en.wikipedia.org/wiki/Fuzzing) — plain introductions to the two heavy assurance techniques
- [Ethereum smart-contract security best practices](https://consensys.github.io/smart-contract-best-practices/) — the practitioner baseline for what audits look for
