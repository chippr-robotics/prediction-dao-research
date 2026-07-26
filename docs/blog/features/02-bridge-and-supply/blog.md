# Move It, Then Put It to Work: Bridge and Supply Come to FairWins

*Send an asset you already own to another network from inside Transfer, and supply liquidity to Uniswap and Across pools from inside Earn — from your own wallet, with every cost on the table before you sign.*

---

Holding crypto across several networks used to mean two annoyances at once. Your USDC was on Polygon and you needed it on Ethereum, so you left FairWins for a bridge app you didn't pick and couldn't check. And the assets that *were* in the right place mostly sat there doing nothing, while the Earn section's "Bridges" tile stayed greyed out with a promise on it.

Both are fixed. **Bridge** is now a tab inside **Finance → Transfer**, beside Send and Activity. **Supply** replaced that dead tile in **Finance → Earn**. One moves your asset to another network; the other puts assets into a pool and earns you a share of what people pay to use it. Neither ever holds your assets between transactions, and neither can move a position you own.

## Bridge: the same asset, a different network

Open **Finance → Transfer → Bridge**. Pick the asset you want to move — the selector shows what you hold on *every* supported network, each with its network badge, so you never switch networks just to find it. Pick where you want it: the destination list only ever offers **the same asset on other networks**, and look-alike assets (USDC and USDC.e, say) are genuinely different assets and are never quietly substituted. Then enter an amount, or tap **Max**, which on a native coin deliberately leaves a little behind so you can still pay for the transaction.

### What you see before you sign

A single card titled **"What this transfer costs"**, and nothing hidden inside a rate:

- **Amount received on** *(destination network)* — what is expected to land, after everything below is taken out. Not the amount you send.
- **Estimated arrival** — Across's own estimate from recent transfers, usually a couple of minutes. It's an estimate, and it's advisory: **nothing counts as delivered until the destination network says so**, however long that takes.
- **Bridge fee** — Across Protocol's own charge. It pays the people who front the asset on the other side so your transfer lands in minutes.
- **Delivery on the destination network** — the cost of the transaction that delivers your asset over there, so you don't have to pay it yourself.
- **Total cost** — the sum of those, and only those.
- **A countdown.** "This quote is good for another N seconds." When it lapses the card says so and makes you refresh before you can sign. The figure you confirmed is a hard ceiling — you can never be charged above the quote you agreed to.

If your wallet is on a different network, a line above the button says it will switch when you confirm — you don't go and do it yourself. A cost line that can't be read says **"Not available"** rather than showing a made-up `0.00`. And Across is named on the quote itself, with a link, because it is the third party your delivery depends on.

Then you sign once and watch it truthfully: **Sending → Sent → On the way → Delivered.** Only the last one claims completion, and only destination-chain evidence produces it. Close the app mid-transfer and it picks the true status back up when you return. A transfer past its usual window says *"Taking longer than expected"* and tells you what's known — never a silent spinner, never a fake tick.

## Supply: put assets into a pool

Open **Finance → Earn → Supply**. You get one curated list holding two clearly-labelled kinds of pool:

**Trading liquidity (Uniswap).** Supply a pair of assets on one network so other people can swap between them, and earn a share of the fee they pay on every swap. Positions are **full-range only** — your pair earns at every price, with no band to pick and nothing to come back and rebalance. The Uniswap position NFT is minted straight to your address.

**Bridge liquidity (Across).** Supply a single asset to the bridge's shared pot. Across lends it out to pay people out instantly on other networks, and you earn a share of what they're charged. This deposit goes **directly from your wallet to Across** — no FairWins contract is in the path at all.

### What you see before you supply

Amounts first, then a deliberate second step: **Review and confirm**. On it:

- **You supply** — the exact amounts, both legs for a pair.
- **Into** — the pool kind and the network it lives on.
- **A fee line, only if there is a fee.** At the moment there isn't one, so you won't see it (more below). A bridge pool goes further and says plainly *why* it can never carry one.
- **A disclosure you have to acknowledge.** Not a tooltip — a paragraph on the screen with a checkbox beneath it, and **the confirm button stays unusable until you tick it.** For a trading pool it explains in plain words that what you get back is a mix that moves with prices and can be worth less than simply holding. For a bridge pool it explains that your asset is lent out across networks and that withdrawal depends on what's available when you ask.
- **The network switch**, disclosed before the signature, same as Bridge.

Open positions show current value, earnings so far, and — for a pair — the mix of the two assets you're currently holding, each labelled an **estimate** because each moves with the market. A figure that can't be read shows a dash and a reason, never a filled-in guess.

**Withdrawing is always open and never carries a FairWins fee** — stated on the screen, not merely implied by the absence of a line. If a bridge pool is heavily lent out at that moment, you take what's available now and are told plainly that the rest comes shortly, the same pattern the lending vaults already use.

## What this costs you

**FairWins charges nothing on either surface today.** Both fee services ship at **zero**, and a zero rate renders *no fee line at all* rather than a line reading `0.00` — the flow is identical to a build with no fee configured. There is no revenue to us in bridging or supplying as it stands.

If that ever changes the mechanism is already public: both services sit in the same on-chain fee configuration every other FairWins service reads, each capped at **2.5%** by a limit that can't be raised, each disclosed as its own line before you sign and passed to the contract as a ceiling. Withdrawals, earnings, and bridge refunds are excluded by design and can never be charged.

**The costs that are real are not ours.** The bridge fee and the destination delivery cost go to Across and its relayers, and network gas on the chain you sign from is yours — bridges are never gasless. We itemize all of it rather than folding it into a rate and calling the result "free".

## Nothing here is custodial — and a pause can't trap you

- **When you bridge, you are the depositor.** Our router touches your asset only inside the one transaction, and it hands Across *your* address as the depositor, never its own. That single detail is why an undeliverable transfer refunds to **your wallet on the network it left from**, rather than to a contract you'd have to petition.
- **Your Uniswap position belongs to you.** The NFT is minted to your address and exits go straight to Uniswap's position manager.
- **Bridge-pool deposits never touch a FairWins contract.** Across's deposit function has no recipient parameter, so wrapping it would have made FairWins the owner of a position you could never exit. We didn't wrap it.
- **Emergency pauses stop new value going in, and nothing else.** A paused route accepts no new bridges; transfers already on their way keep settling through Across regardless. A closed pool takes no new deposits, stays listed, keeps earning, and stays withdrawable — because exits never went through our contracts to begin with.

Availability itself is read, not assumed: if the routes or the pool list can't be read right now, the surface says so and offers no controls rather than guessing, and it tells you when it last managed to look.

## Where it works

- **Bridging** runs on the five EVM mainnets where Across is deployed — **Ethereum, Polygon, Arbitrum, Base, and Optimism** — in both directions between every pair. Arbitrum, Base, and Optimism join FairWins as full networks in this release, so what arrives there is visible and spendable.
- **Trading liquidity (Uniswap)** is offered on those same five networks.
- **Bridge liquidity (Across)** is **Ethereum only.** The bridge's shared pot is an Ethereum contract by design, so there is nothing to supply on Polygon or on an L2. The app states that asymmetry rather than implying both kinds exist everywhere.
- **Ethereum Classic and Mordor** run neither protocol and say so instead of going quietly missing. **Bitcoin is not part of either surface** — it's its own network and isn't connected to these; sending and receiving bitcoin work exactly as before.

## The risks, in plain words

- **Impermanent loss** is the big one for trading pools. As people trade, the pool ends up holding more of whichever asset fell and less of whichever rose, so what you withdraw can be worth less than if you had simply held the two assets and done nothing. The fees you earn may cover that, or may not. It isn't a fee, and it isn't something FairWins can prevent.
- **Bridge pools get rebalanced.** Your asset is lent out across networks, so part of the pot is in transit at any moment and a full exit isn't guaranteed to be fillable the instant you ask.
- **Estimated returns are estimates** — drawn from what a pool has been earning lately, moving with activity, and capable of falling to almost nothing in a quiet week. No rate anywhere in this feature is a promise.
- **Third-party protocol risk is real.** Across settles every bridge; Uniswap and Across hold every pool. Smart contracts carry risk. We name the protocol on every quote and every card rather than hiding behind our own logo.

New to any of this? The knowledge-base primer — [Bridges and Liquidity](../../knowledge/21-bridges-and-liquidity/blog.md) — teaches the concepts from scratch, no DeFi background assumed.

## Woven into the app you already use

- **Your activity log** records a bridge as one logical move naming both networks and both transactions — never double-counted as two unrelated movements — plus pool supplies, withdrawals, and claims, each with its own class.
- **Reporting** includes them with fees attributed, and never treats moving your own assets between networks as income.
- **Notifications** gained two new categories, **Bridge** and **Liquidity**, each independently controllable and each distinct from Wager Pools — an unrelated feature that keeps the word "Pool".
- **Passkey and classic wallets both work**, with approve-and-supply batched into one ceremony where your wallet supports it.

## Get started

1. **To move an asset:** open **Finance → Transfer → Bridge**, pick the asset and destination network, enter an amount, read the quote, confirm.
2. **To put assets to work:** open **Finance → Earn → Supply**, pick a pool, enter amounts, tap **Review and confirm**, read the disclosure and tick it, confirm.
3. **To get out:** open the pool and hit Withdraw. No fee, no waiting on us, any time.

Your assets should be where you need them, and they shouldn't sit idle when they're not. Both are now one tab away — in your custody, with every number in front of you.

*Bridging depends on a third-party protocol and is not guaranteed to deliver; undelivered transfers are returned to the wallet they came from. Supplying liquidity carries impermanent loss, protocol risk, and variable returns that are not guaranteed. You pay the bridge protocol's fee and network gas on both surfaces. Availability depends on the network and on what operators have enabled. Always read the quote and the disclosure shown before you sign.*
