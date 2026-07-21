# Prediction Markets as Information Machines: Event Contracts, Read Honestly

*How staking on outcomes aggregates dispersed information into a price — and why the resemblance to event contracts is an analogy, not a claim of regulated-derivative status*

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Money, Yield & Markets |
| **Level** | Intermediate |
| **Audience** | Portfolio strategists, research and risk analysts, fintech product managers, allocators |
| **Tags** | `prediction-markets`, `event-contracts`, `information-aggregation`, `forecasting` |
| **Reading time** | ~8 minutes |

---

> **Responsible-use note.** This briefing describes prediction markets based on publicly available information and legitimate, skill-based forecasting. These markets are not a mechanism for trading on material non-public information or for circumventing securities, commodities, or gaming regulation. All participants remain fully subject to applicable law and to any platform-level regional restrictions in their jurisdiction.

---

## A question your research desk already asks

Your firm spends heavily to answer forward-looking questions. Will the central bank cut at the next meeting? Will this deal clear antitrust review before quarter-end? Will a named macro figure print above consensus? You buy sell-side research, run internal models, and poll experts — and you know the frustration of a survey that averages confident-but-stale opinions with no cost to being wrong.

A prediction market answers the same class of question with a different instrument: it lets people **stake capital on a yes-or-no outcome**, and the price at which those stakes clear becomes a probability estimate. This briefing is about what that price is worth as an input to your process, how the instrument structurally resembles an event contract, and — importantly — the lines you should not cross when reading that resemblance.

## The traditional model: surveys, models, and event contracts

You already have three tools for the same job. **Surveys** (consensus estimates) aggregate opinion but attach no cost to a bad answer, so they drift toward the safe and the herd-like. **Models** are disciplined but only as good as their assumptions and data. And **event contracts** — instruments that pay a fixed amount if a specified event occurs — let participants express a probabilistic view with real money on the line. In the United States, certain event contracts trade on venues regulated by the Commodity Futures Trading Commission (CFTC); binary options are a close structural cousin, paying a fixed sum on a yes outcome and zero otherwise.

The distinguishing virtue of the money-on-the-line instruments is **skin in the game**. A forecaster who is confident and correct is rewarded; one who is loud and wrong pays. That incentive is what makes a market price more than an opinion poll.

## What changes on-chain

An on-chain prediction market keeps that incentive structure and changes the plumbing. Participants take positions on a defined outcome; the market clears to a price between 0 and 1 that reads directly as an implied probability. When the event resolves, an oracle imports the real-world result and the contract pays the winning side. Polymarket is the widely known example; settlement typically leans on a dispute-based oracle for outcomes that require human judgment.

Two structural features are worth a professional's attention:

- **The price is a live, capital-weighted probability.** A market sitting at 0.68 says the marginal dollar prices the event at roughly a 68% chance. Unlike a monthly survey, it updates continuously as new information arrives, and unlike a model, it aggregates the private information of everyone willing to back a view.
- **Resolution is mechanical and public.** The payout is a function of an imported outcome, not a discretionary determination by an issuer. That reduces one kind of counterparty ambiguity — but relocates trust onto the oracle and its dispute process (a subject in its own right).

## Where it genuinely differs

**The forecasting value is real and measurable.** A deep, liquid prediction market has repeatedly proven a competitive forecaster — often matching or beating polls and pundits — precisely because it prices in incentives and updates in real time. As a *research input*, a market probability is a genuinely useful cross-check against your consensus estimate and your own model. Treat it as one signal among several, not as an oracle of truth.

**But the resemblance to a regulated event contract is a structural analogy — not a legal equivalence.** This is the line to hold firmly. A prediction market that pays a fixed sum on a yes outcome *looks like* a binary option or a CFTC-style event contract. It does not follow that any given on-chain market **is** a regulated derivative, or that trading it carries the protections — or the permissions — of one. Classification of these instruments is genuinely unsettled and varies by jurisdiction; the same market may be treated as an event contract, a swap, a form of gaming, or something else entirely depending on where you sit and how it is offered. Use the analogy to build intuition about payoff and pricing; do not use it to infer regulatory status.

**Liquidity and thinness are the practical caveat.** A market's probability is only as informative as its depth. A thin market moves on a single large stake, and its price then reflects one participant's conviction more than a genuine consensus. The same skepticism you apply to a price discovered in an illiquid instrument applies here.

## Risk & controls

A professional lens on treating prediction-market data as an input, and on any participation:

- **Interpretation risk.** An implied probability is a market's view, not a fact. Read it as you would a forward curve — informative about expectations, not a guarantee of outcomes. Weight it against liquidity: a probability from a deep market carries more signal than the same number from a thin one.
- **Oracle and settlement risk.** The payout depends on an external resolution. A disputed, ambiguous, or invalid outcome is a real scenario; well-designed markets route these to a draw or refund rather than an arbitrary winner. Understand the resolution mechanism before relying on a market's expected payoff.
- **Regulatory and eligibility risk.** Access is often gated by region and by platform policy, and the legal characterization of both the instrument and the activity varies widely. A participant remains responsible for their own eligibility and compliance; a platform surfacing and enforcing regional restrictions is doing the right thing, and those restrictions should never be bypassed.
- **Conduct risk.** These markets are for forecasting on public information. Staking on the basis of material non-public information, or on outcomes one can improperly influence, raises exactly the legal and ethical exposures you already police elsewhere. The responsible-use framing at the top of this piece is not boilerplate — it is the operative constraint.
- **Behavioral risk.** Skin in the game sharpens forecasts in aggregate but can concentrate individual risk. Position sizing and the usual discipline apply.

## How FairWins approaches this

FairWins treats prediction-market outcomes primarily as a *source of truth* for settling peer-to-peer wagers: it can read a resolved public prediction market and map the result to a plain yes-or-no, with undecidable or invalid outcomes routed to a refund rather than a guessed winner. Separately, FairWins offers a way to browse and trade on a major public prediction market directly, without taking custody of a member's funds or standing between them and the venue — the member's own wallet is the only signer, and regional eligibility is surfaced and respected rather than circumvented.

The through-line is honesty about what the instrument is and is not: a useful information machine and a defined-payoff position, described in those terms — never dressed up as a regulated derivative or a guaranteed return.

> *Informational only.* This briefing is educational and is not investment, legal, tax, or regulatory advice, and is not a recommendation to participate in any market. Prediction-market instruments and their legal treatment vary by jurisdiction and are evolving; assess any specific market against your own obligations and eligibility.

## Related deep-dive

For the engineering details, see [Three Kinds of Truth, One Referee Slot](../../posts/15-oracle-adapter-abstraction/blog.md).

## Further reading

- [CFTC: Event Contracts](https://www.cftc.gov/) — the U.S. regulator's materials on event-contract oversight
- [Investopedia: Binary Option](https://www.investopedia.com/terms/b/binary-option.asp) — the fixed-payoff instrument a prediction market structurally resembles
- [Wolfers & Zitzewitz, "Prediction Markets" (Journal of Economic Perspectives)](https://www.aeaweb.org/articles?id=10.1257/0895330041371321) — foundational work on information aggregation in these markets
- [Polymarket documentation](https://docs.polymarket.com/) — a widely used on-chain prediction market and its resolution model
- [Prediction market (overview)](https://en.wikipedia.org/wiki/Prediction_market) — general background
