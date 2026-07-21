# Three Kinds of Truth, One Referee Slot: How FairWins Settles a Bet

*How four very different sources of truth — live price feeds, on-demand data lookups, human-judgment disputes, and resolved prediction markets — all plug into the same slot, so the escrow never has to know the difference*

| | |
|---|---|
| **Series** | Prediction Markets (part 2) |
| **Part** | 15 of 34 |
| **Audience** | Product managers, founders, and the crypto-curious |
| **Tags** | `oracles`, `prediction-markets`, `how-it-works` |
| **Reading time** | ~7 minutes |

---

> **Responsible-use note.** This article describes prediction markets based on publicly available information and legitimate, skill-based forecasting. Oracle-settled wagers are not a mechanism for trading on material non-public information or circumventing securities regulations. All participants remain fully subject to applicable law and compliance obligations in their jurisdiction.

---

## Three wagers, three kinds of truth

Consider three wagers a member might create on FairWins:

1. *"ETH closes above $4,000 on September 30."* The truth is a number that a well-known price feed already publishes on the blockchain, continuously, whether anyone asks or not.
2. *"The city's open-data service reports more than 40mm of rainfall for October."* The truth lives behind a web address. Nothing on the blockchain knows it until someone goes and fetches it.
3. *"The Meridian–Vantage merger closes before the third quarter."* The truth is a human judgment about a messy real-world event. No feed publishes it and no service is authoritative. Someone has to assert it, and someone else has to be able to dispute them.

Each needs a fundamentally different referee — an oracle, meaning the trusted outside source that tells the contract who won. The first is a live feed: data arrives on the blockchain on its own schedule and you read the latest value. The second is an on-demand lookup: you ask a question, a network fetches the answer off the blockchain, and it comes back a moment later. The third is a dispute process: anyone may assert the answer by putting up a deposit, and the assertion stands unless someone challenges it within a set window.

Here's the key idea. The FairWins escrow — the wager engine from part 1 — should not care about any of this. It holds two stakes and needs exactly one fact: did the "yes" side win? The engineering challenge is designing a single slot so that four wildly different referees all reduce to that one yes-or-no answer, with the same behavior when the answer isn't available yet.

## The slot: one yes-or-no, one "not yet"

Every referee, no matter how it works inside, plugs into the same standard slot and answers two questions: has this been decided yet, and if so, who won? The answer to "who won" is deliberately just a single yes-or-no. FairWins wagers are binary — the creator takes one side, the opponent the other — so every referee's richer internal output (numbers, arrays, verdicts) gets boiled down to one bit right at the boundary, keeping the escrow's settlement logic to a single shape of answer.

One more convention does a surprising amount of work: asking a referee is always safe and never errors out. If the answer isn't ready, it simply reports "not resolved yet." That lets the app, the escrow, and automated helpers all check in cheaply and often — and, as we'll see, it lets an undecidable outcome route to a refund instead of a wrong payout. Each referee also advertises whether it's available on a given network, so the app can hide a settlement option that isn't wired up rather than let a member start a wager that would dead-end.

## How the escrow stays referee-agnostic

The escrow keeps a small directory: for each kind of oracle settlement, which referee to consult. Wiring one up is an admin action; leaving one unset disables that option on that network. The referee is consulted at exactly two moments.

At creation, the escrow checks that an oracle-settled wager names a valid question, that a referee for its type is configured, and — importantly — that the question hasn't already been decided. You can't open a wager on an outcome the referee has already called.

At settlement, anyone may trigger resolution. This is permissionless on purpose: the outcome is a pure fact of public record, so there's no reason to restrict who pushes the button. The escrow looks up the right referee, asks who won, and pays out — or, if the answer is "not yet," waits. That's the entire connection; the escrow contains no referee-specific code at all.

## Referee one: reading a resolved prediction market

The simplest referee doesn't run an oracle at all — it reads the output of one. Large public prediction markets already resolve their questions and publish the result on the blockchain. This referee looks up that published result and maps it to a plain yes-or-no. It costs almost nothing to operate — no deposits, no subscriptions, no data to curate — which is why it's the model FairWins offers first.

The subtle case is a tie. These markets occasionally resolve 50/50 — an "invalid" or disputed outcome. That's not a decidable yes-or-no, and paying either side would be wrong. So the referee reports "not resolved" even though the market technically settled, and the escrow reads that as "resolved tie" and settles the wager as an immediate draw: both stakes returned. The failure mode of an undecidable question is a refund, never a coin flip.

The trade-offs: you can only wager on questions the market already lists, and the timing is out of your hands. In exchange, it's nearly free to run.

## Referee two: a threshold on a live price feed

The second referee turns a continuously-updated price feed into a yes-or-no. An admin registers a condition like "is this feed above this number after this date?" Once the date passes, anyone can trigger the evaluation: it reads the feed, insists the reading is fresh enough (rejecting stale data), compares it to the threshold, and locks in the answer.

The trade-offs: this only answers questions that boil down to "a number versus a threshold at or after a time." But for those it's the cheapest and lowest-trust of the four, because the data is already on the blockchain and anyone can trigger the check. The honest caveat: the reading is the latest value at the moment someone evaluates, not the exact value at the deadline instant — though the freshness requirement bounds this.

## Referee three: an on-demand lookup for arbitrary data

The third referee handles truths that live behind a web service. It registers a small, pinned script describing exactly what to fetch, then anyone can request resolution: a decentralized network runs the script off the blockchain and delivers the answer back a moment later, which gets locked in.

Because the answer comes back asynchronously, two safeguards matter. A second request is blocked while one is in flight, and a failed fetch leaves the question unresolved — so a flaky data source means "try again," never "wrong answer locked in forever."

The trade-offs: maximum flexibility — any public data a script can reach — paid for in trust and upkeep. You're trusting the registered script and the service it queries. There's a funded subscription to maintain, and the round trip means settlement takes two steps.

## Referee four: truth by unchallenged assertion

The fourth referee handles the merger question — outcomes that need human judgment. Someone asserts the answer and puts up a deposit. If nobody disputes it within a set window, the assertion is accepted as truth. If someone does dispute it, the question escalates to a broader token-holder vote, and the verdict comes back the same way. The referee doesn't care whether the answer arrived quietly or after a fight — it just records it.

The trade-offs: this is the only one of the four that can answer genuinely arbitrary questions — at the cost of capital (someone must post a deposit), time (the challenge window is a floor on resolution), and an economic assumption: an unchallenged false assertion wins, so the deposit has to make it worthwhile for honest people to watch.

## The shared discipline

The four referees agree on more than the slot. Each remembers its answer after the first resolution, so future checks are cheap. Each makes triggering settlement open to anyone while keeping the setup of questions restricted to admins — curation is trusted, settlement is not. And here's the quiet payoff: FairWins currently exposes only the resolved-prediction-market option to members, keeping the other three behind a configuration switch, while the underlying system fully supports all four. Narrowing the product to one option required zero changes to the escrow, because the slot was already there.

## Why we built it this way

- **A yes-or-no answer, not a rich payout.** Binary wagers need one bit; funneling every referee's output through that single shape keeps settlement singular. The cost is that multi-outcome markets need a different design.
- **Fail toward a refund.** Undecidable market outcomes settle as draws; failed lookups stay unresolved; stale feeds are rejected. No path ever guesses a winner.
- **Referees are optional add-ons.** The escrow works with zero referees configured; each degrades gracefully to "this settlement type isn't available here," and the app reflects that per network.

Four referees, three ways of working, one slot — and an escrow that never learned the difference.

## Further reading

- [Chainlink Data Feeds](https://docs.chain.link/data-feeds) — live on-chain price feeds
- [Chainlink Functions](https://docs.chain.link/chainlink-functions) — on-demand off-chain data lookups
- [UMA Optimistic Oracle](https://docs.uma.xyz/developers/optimistic-oracle-v3) — truth by unchallenged assertion with a dispute window
- [Polymarket](https://docs.polymarket.com) and the [Gnosis Conditional Token Framework](https://docs.gnosis.io/conditionaltokens/) — how public prediction markets record their resolved outcomes
