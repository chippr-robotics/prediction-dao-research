# Bridges and Liquidity Pools, Explained Simply

*How money gets from one blockchain network to another, what it means to "provide liquidity", and the one risk almost everybody underestimates*

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Earning & Yield |
| **Level** | Beginner |
| **Audience** | Anyone who has seen a "Bridge" or "Supply liquidity" button and hesitated |
| **Tags** | `bridge`, `cross-chain`, `liquidity`, `impermanent-loss`, `defi` |
| **Reading time** | ~8 minutes |

---

## Two buttons that sound simpler than they are

Most crypto apps have a button called **Bridge** and another called **Supply** or **Add liquidity**. One appears to move your money; the other appears to earn you some. Both work in ways that will surprise you if you assume they behave like a bank.

Three things, in order: what a bridge actually does, what you're really doing when you provide liquidity, and **impermanent loss** — the risk that costs people money precisely because it doesn't sound like one.

## What a bridge actually is

Start with something that sounds obvious but isn't: **a blockchain network is a self-contained record book.** Ethereum has one. Polygon has another. Different crowds of computers keep them, and neither can see or edit the other's pages. (New to that? Read [Blockchain networks and layer-2s](../19-blockchain-networks-and-l2s/blog.md) first.)

So moving a token from Polygon to Ethereum is **nothing like a bank transfer**. Two banks sit inside a shared settlement system with agreed rules for debiting one and crediting the other. Blockchain networks have no such system: there is no wire between them, and your dollars on Polygon genuinely cannot travel to Ethereum.

A **bridge** is what people built instead — and the fast ones are closer to a favour between friends than to a transfer. Say you want $500 of USDC moved from Polygon to Ethereum:

1. You hand $500 to the bridge's contract **on Polygon**, saying where you want it delivered.
2. A **relayer** — an independent participant whose own money already sits on Ethereum — takes the job and immediately pays you $500 out of *their* funds. That's what lands in your wallet.
3. Later, in the background, the bridge reimburses that relayer from your Polygon deposit, plus a fee.

Nothing crossed anything. Two separate payments happened on two separate networks, and a stranger's inventory covered the gap in time between them. That explains everything people find confusing about bridges:

- **Why it's fast.** You're not waiting for two chains to agree — only for one relayer to decide your job is worth taking. Often a couple of minutes.
- **Why there's a fee.** Somebody put their own capital at risk on your behalf, and had to keep it stocked on the right network. That's what the fee buys.
- **Why the estimate is only an estimate.** An "expected delivery window" is a forecast from how fast recent transfers got picked up. Nothing counts as delivered until the destination network itself confirms it — and an honest app won't tick the box a moment earlier.

If no relayer ever takes the job, a well-designed bridge has a deadline, after which your deposit is **returned to you on the network it left from**. Which is why one unglamorous detail matters enormously: the address recorded as the depositor must be **yours**, not an app's contract. Then a failed transfer simply comes home.

## What "providing liquidity" means

**Liquidity** is just a word for *inventory that's ready to be traded with*. An airport exchange booth has liquidity: it can hand you euros because it keeps euros in the drawer. Empty drawer, no deal, however good the rate on the sign.

**Providing liquidity means being the person who stocks the drawer**, and taking a cut of what people pay to use it. You're not lending to a named borrower and not buying a share of a company — you're supplying working inventory to a machine other people use.

Two kinds show up here. **Trading pools** take a *pair* of assets — say ETH and USDC — into a shared pot anyone can swap against; each swap pays a small fee, split among everyone who stocked the pot. Supply 1% of the pool, collect 1% of the fees. **Bridge pools** take a *single* asset into the pot relayers ultimately draw on, so other people's transfers can be paid out instantly. You are, indirectly, the one fronting the money.

Either way the return is **a share of activity, not a rate**. A busy week pays well; a quiet week pays close to nothing. Any percentage shown is an estimate from what the pool earned recently — a fact about the past, not a commitment about the future.

## Impermanent loss — read this part twice

This one applies to **trading pools**, and it is the single most important thing to understand before supplying one.

**Impermanent loss is not a fee, not a hack, and nobody takes it from you.** It is a comparison: the gap between what your position is worth when you withdraw and what those same assets would have been worth if you had simply held them and done nothing.

The gap opens because a trading pool has no opinion about prices. When an asset gets more valuable elsewhere, traders buy it cheaply out of the pool until the pool catches up; when it gets less valuable, they dump it in. The net effect is that **the pool automatically sells whatever is rising and buys whatever is falling**, using your inventory, all day.

### A worked example, with real numbers

ETH is at $2,000, and you supply an ETH/USDC pool with **0.5 ETH** (worth $1,000) and **1,000 USDC** — $2,000 total, half in each. ETH then doubles to $4,000, and you withdraw.

- **Had you just held:** 0.5 ETH × $4,000 = $2,000, plus 1,000 USDC = **$3,000**.
- **What the pool hands back:** roughly **0.354 ETH and 1,414 USDC** — about **$2,828**.

You're about **$172 short**, roughly **5.7%** behind. Traders bought your ETH out of the pool the whole way up, paying you dollars at each step, so you finish holding less of the asset that doubled and more of the one that didn't.

Two things worth noticing. **You're still up in absolute terms** — $2,000 in, $2,828 out. Impermanent loss is usually an *underperformance* against doing nothing rather than a shrinking balance, which is exactly why it's easy to miss. And **it works both ways**: had ETH halved instead, you'd have finished holding more ETH and fewer dollars, again worth less than holding. What matters is how far the two prices move *apart*, not which direction.

### Why "impermanent" is a misleading word

It's called impermanent because if prices drift back to the ratio they had when you supplied, the gap closes on its own. True — and that's where the reassuring version of this explanation usually stops.

Here's the part that matters: **the moment you withdraw while the prices have diverged, the loss is permanent.** It stops being a paper comparison and becomes the final difference between what you have and what you'd have had. Prices are under no obligation to come back, and you're under no obligation to wait — but you can't have both.

### Do the earned fees make up for it?

**Sometimes. Nobody can tell you in advance.** The honest arithmetic is *fees earned − impermanent loss = whether supplying beat just holding.* In a busy pool over a period where prices moved little, fees can comfortably win; in a quiet pool over a period where one asset ran away, they may not come close. Anyone who says the fees "always cover it" is guessing, and anyone calling this passive income is skipping the second half of that subtraction. A useful instinct: the more likely two assets are to move apart, the bigger the effect — two dollar-pegged stablecoins barely diverge, and their fees are usually small to match.

Single-asset **bridge pools** have no pair, so there's no divergence and no impermanent loss. They carry a different risk: your asset is lent out across networks, so much of the pot is in transit at any moment and a large withdrawal may only be fillable in part until inventory returns.

## What this costs you

- **FairWins charges no platform fee on bridging or on supplying today.** Both are configured at zero, and a zero rate shows **no fee line at all** — not a line reading 0.00. There is nothing in these two features for us as they stand.
- **The bridge fee is real, and it isn't ours.** It goes to the bridge protocol and the relayer who fronted your money, alongside the cost of the transaction that delivers it. Both are itemized before you sign.
- **Network fees ("gas") are real, and they're yours.** These are blockchain transactions; bridging is never free of that.

"FairWins takes nothing" is not the same sentence as "this is free", and we'd rather you read the first one.

## How it shows up in FairWins

**Bridge** sits in **Transfer**, beside Send. Transfers settle through Across Protocol, which is named on the quote itself because it is the third party your delivery depends on. Pick an asset and a destination network, read one quote with every cost on its own line and a countdown on its validity, then confirm from your own wallet. Progress reads *Sending → Sent → On the way → Delivered*, and only destination-chain evidence produces that last one. **You** are recorded as the depositor, so an undeliverable transfer refunds to your wallet on the network it left from.

**Supply** sits in **Earn**. Trading pools are full-range only — no price band to pick, nothing to rebalance — and the position created belongs to your address, not ours; bridge-pool deposits never touch a FairWins contract at all. Before a trading-pool deposit you must read and tick an impermanent-loss disclosure on the screen itself. Bridging and trading pools cover five networks — Ethereum, Polygon, Arbitrum, Base and Optimism — while **bridge liquidity is Ethereum only**, because the bridge's shared pot is an Ethereum contract by design. Withdrawing is always open, never carries a FairWins fee, and doesn't route through us — which is why an emergency pause stops new deposits without ever trapping a position that exists.

## What to watch out for

- **Nothing is delivered until the destination network says so.** Be suspicious of any app that ticks the box before the far side confirms.
- **Supplying liquidity is not a savings account.** You can withdraw less than you supplied, and you can end up ahead of your deposit while still doing worse than holding. Both are normal outcomes, not malfunctions.
- **Estimated returns are estimates.** Drawn from recent activity, moving constantly, capable of falling to almost nothing.
- **You're trusting other people's code.** Bridges and pools are third-party software holding real value; no audit removes that risk. Only supply what you could afford to have at risk.

Both ideas are old ones in new clothes: somebody fronting money so a transfer feels instant, and somebody stocking a shelf for a cut of the till. Neither is magic, and neither is free of consequences — which is why they're worth understanding before you tap the button.

## Related deep-dive

Want the engineering details? Read [One Argument Decides Who Gets the Money Back](../../posts/35-cross-chain-intents-and-lp/blog.md) — how FairWins built cross-chain transfers and pooled liquidity so the failure path needs no rescue button.

## Learn more

- [Ethereum.org — Blockchain bridges](https://ethereum.org/en/developers/docs/bridges/) — why separate networks need bridges, and the trade-offs between designs
- [Across Protocol — Documentation](https://docs.across.to/) — the bridge behind FairWins' Bridge tab, including the deposit, fill and refund lifecycle
- [Uniswap — Documentation](https://docs.uniswap.org/) — how trading pools price swaps and pay the people who supply them
- [Ethereum.org — Decentralized finance (DeFi)](https://ethereum.org/en/defi/) — the wider landscape both of these sit inside
