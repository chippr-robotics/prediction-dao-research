# What Is Polymarket? And What's a "Builder Fee"?

*A plain-English look at prediction markets, and the small, honestly-disclosed fee an app can earn for routing your trade*

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Oracles & Trading |
| **Level** | Beginner |
| **Audience** | Anyone curious about crypto, no technical background needed |
| **Tags** | `prediction-markets`, `polymarket`, `fees`, `transparency`, `basics` |
| **Reading time** | ~5 minutes |

---

> **A note on responsible use.** Prediction markets are for forecasting real-world events using publicly available information and ordinary skill. They are not a way to trade on secret, non-public information or to sidestep the rules that govern these markets — and they carry real financial risk; you can lose what you put in. Everyone who takes part remains fully subject to the laws that apply where they live, and to the platform's own regional restrictions. Only take part where it's legal for you to do so.

---

## Betting on the news

You've probably had an opinion about a future event and felt pretty sure you were right. "That product will launch late." "This team makes the finals." A **prediction market** is a place where opinions like that become tradable. People buy and sell shares in outcomes — "yes, it happens" or "no, it doesn't" — and when the event is decided, the correct side gets paid.

The interesting part is that the *price* of a "yes" share behaves like a crowd-sourced probability. If "yes" trades around 70 cents on the dollar, the market is collectively saying there's roughly a 70% chance it happens. That's why prediction markets are often surprisingly good forecasters: real money sharpens people's guesses.

## What Polymarket is

**Polymarket** is one of the largest prediction-market platforms in the world. It runs on a blockchain network called **Polygon** (a fast, low-cost network related to Ethereum), and it lets people trade shares in the outcomes of real-world questions — elections, sports, economics, current events. Trades settle in **USDC**, a digital dollar (a "stablecoin" designed to stay worth about one US dollar).

A key thing about Polymarket: it's **non-custodial**, meaning it never takes hold of your funds the way a traditional betting site does. Every order is signed by your own wallet and stays under your control. Nobody can place a trade for you; only your wallet can authorize your trades. That's a genuine safety feature — but it also shapes how other apps can connect to it, which brings us to fees.

## What a "builder fee" (or referral code) is

Here's a normal, everyday version of the idea. When you book a hotel through a travel site, that site often earns a small commission for sending the hotel your booking. The hotel offers it on purpose, to reward partners who bring customers. You still get the room; the site gets a cut for making the connection.

A **builder fee** — sometimes called a referral code — is the crypto version. Polymarket runs an official program where an app that helps route your order can attach a small "this trade came through us" tag. In return, that app earns a small fee (and a share of a weekly rewards pool). It's a legitimate, built-in way for a helpful app to earn without taking custody of your money or getting between you and the exchange.

## The honest part: it's a real added cost

This is the part to read slowly, because it's where transparency matters most.

Unlike a hotel commission — which the hotel pays out of its own pocket, costing you nothing — a builder fee is **additive**. It stacks *on top of* Polymarket's own trading fee, and it comes out of *your* trade. It is a real, extra cost to you as the trader. Small, yes, but real.

Because it's a genuine added cost, the only fair way to handle it is to **show it to you before you trade** — as its own clearly labeled line, never folded silently into a total, and never described as "free." An app that hides a fee like this, or pretends it's free, is not being straight with you. An app that shows it plainly, every time, is.

## How it shows up in FairWins

FairWins offers prediction-market trading powered by Polymarket, in a section of the app for exactly that. A few things are worth knowing as a user:

- **Your wallet is the only signer.** FairWins never holds your funds or your credentials; your trades go from your device to Polymarket directly. FairWins earns by *attributing* the trade with its builder code, not by sitting in the middle of your money.
- **The fee is disclosed as its own line, before you approve.** You see the FairWins builder fee spelled out on the confirmation screen. Polymarket's own separate fee is noted too. What you see is what you're charged for the part FairWins controls.
- **It only appears on Polygon.** Because Polymarket runs only on the Polygon network, the trading section simply isn't shown elsewhere.
- **Regional rules are respected.** Polymarket restricts trading from certain regions, and FairWins surfaces those limits rather than trying to bypass them. If it's not available where you are, you'll be told honestly.

## What to watch out for

- **You can lose money.** Prediction markets are real financial risk, not entertainment with guaranteed returns. A "70% yes" can still turn out "no." Never stake more than you can comfortably lose.
- **Fees add up.** Between Polymarket's own fee and the builder fee, there's a real cost to each trade. Read the disclosure and factor it in — especially if you trade often.
- **"Additive" means on top.** Don't confuse a builder fee with a cost-free referral. This one comes out of your trade. The right response isn't alarm — it's simply expecting to *see* it clearly before you tap approve.
- **Know your local rules.** Whether you can legally use prediction markets depends on where you live. That's on each participant to check.

The takeaway: prediction markets are a fascinating way to turn opinions into forecasts, and referral fees are a normal way apps earn for connecting you. The line between a trustworthy app and an untrustworthy one isn't *whether* there's a fee — it's whether they tell you about it, in plain sight, before you agree.

## Related deep-dive

Want the engineering details? Read [Predict: Earning From Prediction-Market Trades Without Ever Touching One](../../posts/24-predict-polymarket-builder-codes/blog.md).

## Learn more

- [Polymarket documentation](https://docs.polymarket.com/) — the prediction-market platform, including its builder-code referral program
- [Prediction market (overview)](https://en.wikipedia.org/wiki/Prediction_market) — background on how these markets work
- [What is USDC? (Circle)](https://www.circle.com/usdc) — the digital dollar these trades settle in
