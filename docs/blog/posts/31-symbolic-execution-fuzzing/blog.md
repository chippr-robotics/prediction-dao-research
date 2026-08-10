# Three Ways to Break an Escrow: How We Stress-Test the Code That Holds the Money

*One small function decides who gets paid. Here are the three very different tools we point at it — and why no single one is enough.*

| | |
|---|---|
| **Series** | Security & DevOps |
| **Audience** | Founders, product managers, and the crypto-curious — no Solidity required |
| **Tags** | `security`, `testing`, `smart-contracts`, `plain-english` |
| **Reading time** | ~7 minutes |

---

> **A note on what FairWins is.** FairWins lets friends make peer-to-peer wagers based on public information and honest forecasting — who wins Sunday's match, not inside information. Everyone using it stays subject to the laws that apply to them. This post is about the code that holds the money safely, not about the wagers themselves.

---

## The function that can never be wrong

Somewhere inside a FairWins wager, there is a single, tiny piece of code whose only job is to move money to the winner. Two people each put up some stablecoin. An outcome gets declared. The winner clicks "claim," and this code hands over the pot.

It is maybe a dozen lines long, and every one matters. It has to check three things before it pays: that the wager is actually resolved, that the person claiming is actually the winner, and that the pot has not already been paid out. It has to mark the wager "paid" *before* it sends the money, not after. And it has to add the two stakes together correctly, without the total silently wrapping around to a wrong number.

Get the order of those steps wrong and a malicious token could trick the contract into paying twice. Get the "already paid" check wrong and anyone could claim someone else's winnings. Get the arithmetic wrong and the payout is simply incorrect. On a public blockchain, each mistake is permanent and there for attackers to find.

Here is the uncomfortable part: no single testing method catches all three. A tool that is brilliant at spotting a dangerous *ordering* of steps has no idea whether the math is right. A tool that can *prove* the math never overflows grinds to a halt if you ask it about ten wagers happening in an unpredictable order. And a tool that cheerfully throws ten thousand wagers at the contract in random orders can *find* failures but never *prove* their absence.

So we point three different tools at that money-moving code, each chosen for what the others miss. Think of them as two automated ways to hammer on the code to find bugs a human might overlook — one explores every possible path, the other throws millions of random inputs — plus a fast pattern-checker that runs first.

## Layer one: the fast pattern-checker

The first tool is a *static analyzer*. "Static" means it reads the code without ever running it — the way a spell-checker reads a document without understanding the plot. It knows what dangerous code *shapes* look like and flags them.

Because it is cheap and fast, it runs automatically on every code change, before anything can be merged. We tune it to be strict, and to look only at our own code, not the well-known libraries underneath.

What it is genuinely good at is the class of bug you can see in the *shape* of the code. Sending money before marking the wager paid? It flags the ordering instantly — that is the classic "reentrancy" trap, where an attacker re-enters the function mid-payment. A function that changes ownership with no lock on it, or a missing check for an empty address? It catches those too.

What it *cannot* do is tell you whether the payout amount is right. To a pattern-checker, "add both stakes together" and "use just one stake" look almost identical. It sees grammar, not meaning. Closing that gap is the job of the next two layers.

## Layer two: exploring every path

The second tool does *symbolic execution*, and the plain-English version is worth pausing on.

A normal test asks: "Does this work when the stake is 100?" You pick a number, run the code, check the answer. Symbolic execution asks a far bigger question: "Is there *any* stake — literally any value at all — that makes this go wrong?" Instead of a concrete number, it feeds the code an unknown and follows every branch, keeping track of the conditions that lead down each path. Where the code splits, it splits with it.

That means it can do something tests cannot: it can *prove* things. Point it at our payout math and it reasons across the entire range of possible stakes and confirms the sum can never overflow into a wrong number. It confirms there is no sneaky path that skips one of the three safety checks. This is the layer that turns "I'm pretty sure the math is fine" into "there is no input for which it isn't." Because it is slow and thorough, we run it on a schedule against the highest-risk contracts, not on every change.

There is a lesson buried in how we got this working. For a while, this tool ran on schedule and reported success every time — while quietly doing nothing. It couldn't find the shared libraries our code depends on, so it failed to even assemble the code, and our automation counted that failure as a pass. A security tool that reports green because it never actually examined your code is worse than no tool: it manufactures confidence you haven't earned. The fix was unglamorous. The real lesson was noticing it had been asleep.

Its honest limit: it shines on one contract at a time with a bounded number of steps. Ask it to reason about ten wagers created and settled in an arbitrary order and it drowns in possibilities. That is exactly where the third tool takes over.

## Layer three: throwing millions of random inputs

The third tool is a *fuzzer*. Its entire personality is chaos with a purpose. It stands up a realistic copy of the whole system and then throws long, random sequences of real actions at it — create a wager, accept it, claim it, refund it, cancel it, in wild combinations, up to a hundred moves in a row — and after *every single move* it checks whether a set of rules still holds.

It is hunting the kind of bug no single action causes but some *order* of actions does. The most important rule it checks is solvency: at every moment, in any history of moves, does the contract still hold at least enough money to cover every stake it still owes? If some sequence ever pays out twice, or releases a stake it already released, that rule goes false — and the fuzzer hands you the exact sequence that broke it.

It checks other rules the same way: that "paid" can never flip back to unpaid, that a wager's status only moves forward, that a winner is always one of the two participants, that the payout always equals the two stakes combined. There is even a clever one for private wagers: the fuzzer deliberately holds no secret key, so it *cannot* forge the signature needed to accept an open challenge. If it ever activates one anyway, the signature lock is broken.

Crucially, we fuzz a copy built the way the real thing is deployed — same setup, same memberships — not a stripped-down toy. A rule that only holds for a system you don't actually ship is worthless.

The fuzzer's weakness is the mirror of the path-explorer's strength: it is random, not exhaustive. A clean run means "no counterexample found this time," never "no counterexample exists." That is precisely why the payout math is checked by *both* the path-explorer (which proves it) and the fuzzer (which pressure-tests it under live sequences).

## Why three, and why the overlap

A few deliberate choices tie this together.

**We order the tools by cost.** The fast pattern-checker runs on every change for instant feedback. The two heavy tools run on a schedule, off the critical path, so nobody waits to save a file.

**We overlap the math on purpose.** Payout correctness is checked twice — once proven exhaustively over all inputs, once stress-tested over all orderings. Neither replaces the other, and on code that moves money the redundancy is the point.

**We test the real deployment, not a stand-in,** and we treat a silent tool as a failure. A guarantee that only holds for a contract you don't ship is a guarantee about nothing, and a verification tool asleep at its post is the most dangerous state it can be in.

None of this makes bugs impossible. It makes whole *categories* of them very hard to ship — which, for code that quietly holds other people's money, is the entire job.

## Further reading

- Reentrancy and the checks-effects-interactions pattern: [Ethereum smart contract best practices](https://consensys.github.io/smart-contract-best-practices/)
- The Smart Contract Weakness Registry, a catalog of known contract bug classes: [swcregistry.io](https://swcregistry.io/)
- A plain introduction to [symbolic execution](https://en.wikipedia.org/wiki/Symbolic_execution) and [fuzz testing](https://en.wikipedia.org/wiki/Fuzzing) on Wikipedia
- Open-source tools in this space from Trail of Bits and crytic: [Slither](https://github.com/crytic/slither) (static analysis), [Manticore](https://github.com/trailofbits/manticore) (symbolic execution), and [Medusa](https://github.com/crytic/medusa) (fuzzing)
