# What Is a Blockchain Oracle? The Trusted Referee

*Why a smart contract can't see the outside world on its own — and how an "oracle" tells it who won, what the price is, and what actually happened*

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Oracles & Trading |
| **Level** | Beginner |
| **Audience** | Anyone curious about crypto, no technical background needed |
| **Tags** | `oracles`, `smart-contracts`, `prediction-markets`, `basics` |
| **Reading time** | ~5 minutes |

---

> **A note on responsible use.** This primer describes prediction and forecasting based on publicly available information and ordinary skill. It is not about trading on secret, non-public information or sidestepping any rules. Everyone who takes part remains fully subject to the laws that apply where they live.

---

## A bet between two friends

Say you and a friend bet on whether it rains tomorrow. You each put $10 on the table. Simple — until the moment of truth. Who decides if it "rained"? A drizzle at dawn? You'll want someone you both trust to look outside and make the call: a referee.

Now imagine that same bet handled by a **smart contract** — a small program on a blockchain that automatically holds the money and pays out the winner, with no human in the middle. It's brilliant at holding the $20 safely and following its rules exactly. But it has one strange limitation, and it's the whole reason this article exists: **the contract has no way to look outside and see whether it rained.**

## Why a contract is "blind"

A blockchain is a shared, tamper-proof record that thousands of computers agree on. For them to agree, every computer must be able to check every fact for itself and get the identical answer. That works beautifully for things *inside* the system — who sent what to whom.

But the outside world doesn't work that way. Yesterday's rainfall, the price of Bitcoin at noon, who won an election — none of that lives on the blockchain. If the contract tried to "go check a website," different computers might get different answers (the site changed, went down, or lied), and the agreement would fall apart. So blockchains are deliberately sealed off: a contract can't browse the web or peek out a window. It only knows what's already written on the blockchain.

That's the gap an oracle fills.

## What an oracle is

An **oracle** is the trusted bridge that carries a real-world fact *onto* the blockchain so a contract can use it. It's the referee for the digital bet: it looks at reality, decides the answer, and writes it down where the contract can read it.

The name is old — an oracle was a source you consulted for truth. Same idea here: the contract asks "did the 'yes' side win?" and the oracle answers. The contract trusts that answer and pays out accordingly. Everything hinges on the oracle being reliable, which is why designing oracles is one of the most scrutinized parts of any serious crypto app.

## The different styles of referee

Not all facts are alike, so there isn't one kind of oracle. Here are the main styles, in plain terms.

**The live scoreboard (price feeds).** Some facts are numbers that update constantly, like the price of Bitcoin. A price-feed oracle publishes those numbers onto the blockchain around the clock, whether or not anyone's asking. When the contract needs the price, it just reads the latest posted value — like glancing at a scoreboard that's always lit up. Cheap and fast, but only for things already being measured and posted.

**The messenger you send out (on-demand lookups).** Some facts sit on a website and nobody's put them on the blockchain yet — say, a city's official rainfall reading. Here the oracle acts like a messenger: the contract asks a question, a network of computers fetches the answer from the source and brings it back. More flexible — it can fetch almost anything public — but it takes a round trip, and you're trusting the messenger and the source.

**The panel of judges (dispute-based).** Some facts are messy human judgments with no official feed at all — "did this company merger close before June?" For these, someone *asserts* the answer and puts down a cash deposit backing it up. If nobody challenges the claim within a set window, it's accepted as true; if someone does, it escalates to a wider vote. It's slower and needs money on the line, but it can settle almost any question a scoreboard or messenger can't.

**Reading another referee's final score (settled markets).** Sometimes the answer has *already* been decided somewhere reputable — like a large prediction-market platform that officially resolved its own question and posted the result. The oracle just reads that finished result. Almost free, because someone else did the hard part; the catch is you can only ask questions that platform already answered.

## How it shows up in FairWins

When you make a wager on FairWins that settles from real-world data, an oracle is the referee that decides who won. You don't have to manage any of this — you pick an outcome to bet on, and behind the scenes the app consults the appropriate referee when it's time to settle, then pays the winner automatically.

FairWins is built so any of these referee styles can plug into the same "settlement slot," and it leans toward the safest behavior: if the answer genuinely can't be determined — an unavailable feed, a tied or invalid outcome — the wager doesn't guess a winner. It returns everyone's stakes instead. Failing toward a refund, never a coin flip.

## What to watch out for

- **An oracle is a point of trust.** The contract will faithfully pay out whatever the oracle says — so a wrong or manipulated oracle means a wrong payout. "It's on the blockchain" doesn't make the *input* true; garbage in, garbage out still applies.
- **Different styles, different trade-offs.** Live feeds are cheap but narrow. Messengers are flexible but slower. Dispute panels answer anything but cost time and money. There's no single best oracle — only the right one for the question.
- **Timing isn't always exact.** A feed read "after the deadline" is the latest value at the moment someone checks, not necessarily the value at the precise instant. Good systems bound this, but it's worth knowing.

Once you see oracles as referees, a lot of crypto stops feeling like magic. The contract handles the money honestly; the oracle handles the truth. Keep an eye on *who your referee is*, and you've grasped the most important question in the whole system.

## Related deep-dive

Want the engineering details? Read [Three Kinds of Truth, One Referee Slot](../../posts/15-oracle-adapter-abstraction/blog.md).

## Learn more

- [What is a blockchain oracle? (Chainlink)](https://chain.link/education/blockchain-oracles) — a clear primer from a leading oracle provider
- [Oracles (ethereum.org)](https://ethereum.org/en/developers/docs/oracles/) — Ethereum's own explainer
- [Prediction market (overview)](https://en.wikipedia.org/wiki/Prediction_market) — background on markets that settle on real-world outcomes
