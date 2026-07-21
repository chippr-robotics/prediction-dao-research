# Builder Codes and Best Execution: An Honest Look at a Disclosed, Additive Fee

*What a builder fee is, how it compares to payment for order flow, and why the only defensible version is the one the client sees before they sign*

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Money, Yield & Markets |
| **Level** | Advanced |
| **Audience** | Best-execution and compliance officers, brokerage product managers, cost-transparency and MiFID leads |
| **Tags** | `builder-codes`, `best-execution`, `PFOF`, `cost-disclosure`, `conflicts-of-interest` |
| **Reading time** | ~9 minutes |

---

> **Responsible-use note.** This briefing describes an order-routing referral mechanism on a public prediction market, used for legitimate, skill-based trading on publicly available information. It is not a way to trade on non-public information or to circumvent applicable market rules or regional restrictions. Participants remain fully subject to the law and to the venue's own policies in their jurisdiction.

---

## A conflict you already know how to police

You have spent a career on a specific tension: the venue or intermediary that routes a client's order often earns money in a way the client cannot see, and that revenue can — sometimes subtly — pull against the duty to get the client the best result. Payment for order flow (PFOF) is the canonical case. A broker routes retail orders to a market maker, the market maker pays the broker for that flow, and the debate that has run for years is whether the client's execution quality is quietly compromised to fund a "free" trade. Regulators on both sides of the Atlantic have circled it; some jurisdictions restrict or ban it outright.

The relevant frameworks are familiar: **best execution** obligations that require an intermediary to act in the client's interest across price, cost, speed, and likelihood of execution; and **cost-disclosure** regimes — MiFID II's ex-ante and ex-post cost transparency being the sharpest example — that insist the client can see what they are paying. This briefing takes a newer, on-chain construct — the **builder code** — and holds it up against exactly these frameworks.

## The traditional model: where the money hides

In the PFOF arrangement, the defining feature for a compliance officer is that the intermediary's revenue is **embedded and invisible**. The client sees "commission-free." The payment happens behind the quote, in the spread the market maker captures. Whether or not any individual execution is worse for it, the *structure* buries the intermediary's incentive where the client cannot weigh it — which is precisely why it draws best-execution scrutiny and why disclosure of routing practices became a regulatory demand.

Hold that property in mind — *embedded, invisible, potentially in tension with best execution* — because it is the exact benchmark against which a builder code should be judged.

## What a builder code is

On some public trading venues, an application that helps a user place an order can attach a **builder code** to that order: a public identifier that credits the referring app and entitles it to a **builder fee**, a small share of the trade. It is the venue's official, sanctioned way for an interface to earn from the volume it originates. Polymarket's program is the example relevant here.

Mechanically, three properties define it:

- **It is additive.** The builder fee stacks *on top of* the venue's own trading fee. It is not carved out of a spread the client was paying anyway — it is an extra, real cost to the trader on a taker order. (Common designs charge it only to takers, not to makers who post resting liquidity.)
- **It is attribution, not intermediation.** The referring app does not stand between the client and the venue, does not take custody, and need not touch the order's economics. It attaches a tag; the client's own wallet signs and submits the trade to the venue directly.
- **It is capped and configurable.** The venue sets a hard ceiling on the fee, and the rate is a published setting rather than a buried constant.

## The honest comparison to PFOF

It is tempting to wave a builder code through as "better than PFOF because it's on a public venue." Resist that. The right comparison is structural, and it cuts both ways.

**Where a builder code is genuinely more defensible:** it can be made **fully visible**. Because the fee is a discrete, known amount rather than value captured inside a spread, it can be shown to the client as its own line item *before* they authorize the trade. That is the opposite of PFOF's defining flaw. And because the model is attribution rather than intermediation, the referring app has no lever over the client's *execution* — it cannot route to a worse venue for a kickback, because it isn't routing at all; the client trades directly with the venue.

**Where it is not automatically better — and the honesty this demands:** an additive fee is a *real, additional cost*. A builder fee makes the client's all-in cost higher than trading without it, full stop. Calling it "free," folding it into a blended total, or crediting it silently would reproduce the precise sin that makes PFOF objectionable — an intermediary earning from the client in a way the client cannot see and weigh. The mechanism does not earn its defensibility automatically; it earns it *only if disclosed*. A hidden builder fee is arguably worse than PFOF, because it is additive rather than spread-embedded — it takes more from the client, not less.

So the compliance conclusion is precise: the builder code is not virtuous because of what it is, but because of how it is presented. Same conflict, different — and, done right, better — disclosure.

## Risk & controls

A best-execution and cost-transparency lens:

- **Disclosure as the primary control.** The fee must appear as its own clearly labeled line, in the currency and amount (or exact rate) the client will pay, *before* authorization — the ex-ante cost transparency MiFID II demands. "What you see is what you're charged" is the standard; a blended total is a red flag.
- **Separating controlled from uncontrolled costs.** The referring app controls its own builder fee and should disclose it exactly. The venue's own execution-time fee varies with price and size and is not the app's to promise; the honest treatment is to disclose it as a separate, clearly-flagged estimate or note rather than invent a precise figure the app cannot guarantee.
- **A cap enforced early, loudly.** A misconfigured fee above the venue's ceiling should fail fast — ideally a service refusing to start rather than quietly overcharging. A fat-fingered rate ought to be an outage you catch in seconds, not a fee incident surfacing in complaints weeks later.
- **Conflict transparency.** The client should understand the referring app earns from their volume. That is not disqualifying — venues explicitly sanction it — but an undisclosed conflict is. The whole point is to make the incentive legible.
- **Best-execution posture.** Because attribution does not alter routing or execution, the app is not exercising execution discretion for a kickback. Preserve that separation: the moment a referral fee could influence *where or how* a client's order executes, you are back in classic best-execution territory and the analysis hardens considerably.
- **Never-stranded principle.** Attribution should be best-effort: if the referral component is unavailable, the client's trade should still go through — unattributed — rather than be blocked. A client must never be prevented from trading merely to protect the intermediary's fee.

## How FairWins approaches this

FairWins participates in a public prediction market's builder-code program and treats the resulting fee as a first-class disclosure obligation, not a footnote. The member's own wallet is the only signer; FairWins takes no custody and does not intermediate the trade — it attaches attribution alongside an order the member submits directly to the venue. Because the builder fee is additive and real, it is shown as its own labeled line before the member approves — never described as free, never folded into a total. The venue's own execution-time fee, which FairWins does not control, is disclosed separately and honestly rather than guessed at. The rate is a capped configuration setting, and a value above the program's ceiling is designed to fail loudly rather than silently overcharge. And if the attribution component is unavailable, the trade still proceeds unattributed — the member is never stranded to protect a referral fee.

The design principle worth taking away is transferable well beyond crypto: *disclose what you control exactly, admit what you don't, and never let your own revenue mechanism sit invisibly against the client's interest.* That is the standard best execution has always asked for.

> *Informational only.* This briefing is educational and is not investment, legal, tax, or regulatory advice. Fee structures, best-execution obligations, and the treatment of referral arrangements vary by jurisdiction and are evolving; assess any specific arrangement against your own regulatory obligations.

## Related deep-dive

For the engineering details, see [Predict: Earning From Prediction-Market Trades Without Ever Touching One](../../posts/24-predict-polymarket-builder-codes/blog.md).

## Further reading

- [SEC: Payment for Order Flow](https://www.sec.gov/) — U.S. regulator materials on PFOF and order-routing disclosure
- [ESMA / MiFID II cost and charges disclosure](https://www.esma.europa.eu/) — the ex-ante and ex-post cost-transparency regime
- [Investopedia: Payment for Order Flow (PFOF)](https://www.investopedia.com/terms/p/paymentoforderflow.asp) — primer on the arrangement and its criticisms
- [Investopedia: Best Execution](https://www.investopedia.com/terms/b/bestexecution.asp) — the duty and its components
- [Polymarket documentation](https://docs.polymarket.com/) — the venue and its builder-code referral program
