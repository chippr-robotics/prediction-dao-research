# What Is a Stablecoin?

*Why a dollar-shaped digital coin makes real-money apps possible — and how it actually stays worth about a dollar*

---

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Payments & Markets |
| **Level** | Beginner |
| **Audience** | Crypto-curious beginners — no technical background needed |
| **Tags** | `stablecoins`, `usdc`, `payments`, `how-it-works` |
| **Reading time** | ~5 minutes |

---

## The price-tag problem

Imagine you agreed to split dinner with a friend, and by the time the bill came, the value of the money in your wallet had jumped or dropped 8%. You'd never know what a fair share was. That is roughly what it feels like to use a typical cryptocurrency — like Bitcoin or Ether — for everyday amounts. The technology is fine; the *price* just won't sit still.

For a lot of what crypto promises — sending money to a friend, holding a shared pot, settling a bet — that wobble is a dealbreaker. You want the digital dollar in your app to be worth a dollar tomorrow, the same way the balance in your bank app is. That is exactly the gap a stablecoin fills.

## What it is

A **stablecoin** is a digital coin designed to hold a steady value, almost always one US dollar. It lives on a blockchain — a shared public ledger that many computers keep in sync — so it moves with the speed and openness of crypto, but it's meant to *behave* like cash.

The one you'll meet most often is **USDC**, issued by a regulated company called Circle. One USDC is intended to always be redeemable for one real US dollar. There are others (USDT, and dollar-pegged coins from various issuers), but USDC is the default across FairWins because it's transparent and widely trusted.

Think of it as a **digital gift card denominated in dollars** that you can freely send to anyone, spend, or cash back out — not a lottery ticket whose value swings around.

## Why it exists

Money apps need a stable unit. If you escrow a stake, hold a group pot, or pay someone across the world, every party needs to agree on what the amount *is*. Regular bank dollars can't travel on a blockchain, and volatile crypto can't hold a steady price. A stablecoin is the bridge: dollar-priced like your bank balance, but programmable and portable like crypto.

That's why nearly every serious "real-money" crypto app settles in stablecoins rather than in Bitcoin or Ether. It's the difference between a bet for "200 dollars" and a bet for "however much this coin happens to be worth on payout day."

## How it stays at about a dollar

A well-run stablecoin like USDC keeps its value through a simple, boring, and reassuring idea: **every coin is backed by a real dollar (or a safe dollar-equivalent, like short-term US government debt) held in reserve.**

Picture a coat check. For every coat handed in, the attendant issues exactly one ticket. Anyone holding a ticket can always walk up and get a coat back. Because the tickets are always redeemable one-for-one, a ticket is never worth more or less than a coat. USDC works the same way: Circle issues a coin only when a real dollar comes in, and burns the coin when someone cashes out. Reputable issuers publish regular reports from outside accountants confirming the reserves are really there.

That redeemability is what pins the price. If a coin ever drifted to 98 cents on an exchange, traders would happily buy it and redeem it for a full dollar, pocketing the difference — and that buying pressure pushes the price right back to a dollar. The promise of "always worth one real dollar on demand" is the anchor.

## How it shows up in FairWins

In FairWins, stablecoins are simply the money. When you place a wager, join a group pool, or send funds to a friend, the amount is denominated and settled in a stablecoin like USDC, so every number you see is a plain dollar amount. Stakes held in escrow are held in stablecoins; payouts arrive in stablecoins. FairWins only ever handles a short, vetted list of these dollar-pegged tokens — not volatile coins — precisely so the amount you agreed to is the amount that changes hands.

Whenever a fee applies, FairWins shows you the exact cost, in dollars, before you approve anything.

## What to watch out for

Stablecoins are steadier than other crypto, but "stable" isn't "risk-free." A few honest caveats:

- **It's only as good as its backing.** A stablecoin's promise depends on the issuer actually holding the reserves. This is why the *quality* of the issuer matters, and why transparent, regulated coins like USDC are preferred over obscure ones.
- **Rare "de-peg" moments.** In stressful markets a stablecoin can briefly trade slightly below a dollar. Fully-reserved coins have generally recovered, but it's a reminder that the peg is maintained, not magic.
- **Avoid the algorithmic kind.** Some past "stablecoins" tried to hold their price with clever code and trading tricks instead of real reserves. Several collapsed dramatically. Reserve-backed coins like USDC are a different, sturdier design — but the word "stablecoin" alone doesn't guarantee safety.
- **You're moving real money.** A stablecoin transfer is final, like handing over cash. Double-check amounts and recipients.

For everyday use inside a well-designed app, though, a reserve-backed stablecoin does exactly what you want: it keeps a dollar looking and acting like a dollar.

## Related deep-dive

Want the engineering details? Read [The Wager Lifecycle: How a Handshake Bet Becomes a Payout Nobody Can Strand](../../posts/14-wager-lifecycle-contract/blog.md).

## Learn more

- [What is USDC? (Circle)](https://www.circle.com/usdc) — the issuer's own explainer and reserve reporting
- [Stablecoin (Investopedia)](https://www.investopedia.com/terms/s/stablecoin.asp) — a plain-English overview of the different types
- [Stablecoins (ethereum.org)](https://ethereum.org/en/stablecoins/) — how dollar-pegged coins work on a blockchain
