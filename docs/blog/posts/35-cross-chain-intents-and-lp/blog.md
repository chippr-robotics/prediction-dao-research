# One Argument Decides Who Gets the Money Back

*How FairWins built cross-chain transfers and pooled liquidity where the failure path needs no rescue button — and why a platform fee, if one is ever set, is charged after the deposit rather than before*

| | |
|---|---|
| **Series** | FairWins Engineering |
| **Audience** | Product and engineering readers curious about cross-chain design |
| **Tags** | `bridge`, `liquidity`, `cross-chain`, `non-custodial`, `fees` |
| **Reading time** | ~7 minutes |

---

## Two surfaces, one constraint

FairWins members hold assets on several networks at once, but until now the app could only move value *within* a network: if your USDC sat on Polygon and you needed it on Ethereum, you left the app to fix that. Meanwhile the Earn section carried a fourth tile — "Bridges" — greyed out as a placeholder since the day it was drawn.

Both gaps are now closed. Transfer gained a **Bridge** tab, and Earn's dead tile became **Supply**: a curated list of pools to put assets into, Uniswap V3 trading pools on five networks and Across bridge pools on Ethereum. Behind them sit two small upgradeable contracts, one of each per network — a bridge router and a liquidity router. Both hold funds only for the duration of a single transaction, and neither is ever in an exit path. The interesting engineering is almost entirely in what they decline to do.

## One argument decides who gets refunded

Cross-chain transfers settle through Across, an intent-based bridge. The model matters because the safety property falls straight out of it: you deposit on the origin chain, and a relayer competing for the job immediately pays your recipient on the destination chain out of their own inventory, to be reimbursed later from the protocol's pooled liquidity. The speed comes from somebody else fronting the money.

That model needs an answer for the case where nobody takes the job. Across's answer is a refund: a deposit no relayer fills by its fill deadline is returned on the *origin* chain — to the address recorded on the deposit as the **depositor**.

The depositor is an ordinary parameter, not "whoever sent the transaction". That flexibility is deliberate — it's what lets wrapper contracts exist at all, including Across's own periphery contract that deposits on a user's behalf. It is also the trap. The obvious fee-taking wrapper names *itself*: the router pulls the member's tokens, so surely the router is the depositor. Every successful bridge behaves identically either way. Only the *unfilled* deposit diverges, and then the refund lands inside a contract with no per-member accounting and no withdrawal path — a silent failure, surfacing first in production, on the unhappy path, with real money, at exactly the moment a member's transfer has already gone wrong once.

So the router passes the **member's own address** as depositor, never its own. One argument, and the worst case resolves itself — an unfilled deposit comes back to the person who made it, on the chain they started from, with no privileged action by anyone.

What that buys downstream is the point. Had the router named itself, it would have needed a rescue function: something an operator could call to pull stranded deposits out and return them, plus a record of whose money was whose. That function is a custody surface — an address FairWins controls that can reach into a member's in-flight transfer. Because the refund never arrives here, the contract has no rescue path, no claim-refund path, and no way for an operator to touch a submitted transfer. **The absence is the design**, and the contract says so in a comment, so a later reader doesn't mistake it for an oversight and helpfully add one.

## Testing a property you cannot stage

The plan asked for the direct test: let a deposit expire on a forked chain and assert the refund lands on the member. It isn't reproducible. An Across refund is not a timer — it needs an off-chain dataworker to propose a root bundle on Ethereum, a dispute window to elapse, and a merkle-proved refund leaf to execute back on the origin chain. Staging that would mostly be testing Across's machinery, then asserting against our own simulation of it.

What FairWins owns is one field: the depositor recorded on the deposit, because that is what Across's bundle logic reads when deciding who a refund belongs to. So the fork test runs against the **real** SpokePool, decodes the deposit event Across itself emits, and asserts the depositor is the member's address and is *not* the router's. It is merge-blocking, and the file says why in its header: the happy-path test passes whichever address is supplied, so this is the only assertion that catches the bug.

## A fee charged on capital that was actually used

The Supply side produced its own version of the same lesson — an implementation that looks entirely correct from outside. (The rate in question is currently **zero**, on both surfaces. The mechanism still has to be right before anyone ever sets one.)

A Uniswap V3 mint takes two tokens and the maximum of each you're willing to supply, then consumes only what the pool's current price ratio requires and hands the rest back. It almost never takes both legs exactly. The first version of the liquidity router skimmed the platform fee from the amounts the member *offered*, before minting. Concretely: a member offers 1,000 USDC and 0.3 ETH; the ratio needs all the USDC but only 0.21 ETH; 0.09 ETH comes back untouched — and they have nonetheless paid a fee on the full 0.3, charged on capital handed straight back to them, unsupplied.

Nothing about that looks wrong on the surface: a disclosed fee, the right percentage of a number on the confirm screen, a position that exists, a refund that arrives. The overcharge hides in the least-examined leg. It was found in adversarial review and reproduced on a live fork; four reviewers arrived at it independently.

The fix inverts the order. The mint happens first, and the fee is quoted afterwards against the amounts Uniswap actually consumed — at the same rate the member's consent ceiling was already checked against, earlier in the same transaction. Whatever the position didn't take and the fee didn't claim is returned whole, and the transaction reverts outright if the router's balance afterwards differs from what it started with.

That has an upstream consequence: **before the mint, there is no such number as "the fee".** So the confirm screen discloses the *rate*, says it applies to whatever is actually supplied, says the remainder comes back whole, and shows an upper bound rather than a precise figure — and the client library exposes no function computing a fee from a desired amount, because no honest one exists. A contract detail became a copy constraint; a fee line showing an exact figure would have been a small, confident lie.

Ownership follows the same rule as the depositor: the position NFT is minted with the **member** as recipient, never the router. Once the mint returns, the member holds a position the router has no power over — they add to it, collect from it, or close it by calling Uniswap directly. A fork test exercises exactly that with the router paused *and* the pool retired, to prove the exit doesn't depend on us.

## The deposit that is deliberately not ours

Bridge pools work differently, because of one missing parameter. Across's `addLiquidity` takes an asset and an amount — and no recipient. LP tokens mint to whoever called it. A fee-skimming wrapper would hold those LP tokens itself, making FairWins the custodian of a position the member could never withdraw.

So bridge-pool deposits are **not routed at all**: they are a direct call from the member's wallet to Across's HubPool, and they are fee-free. It is the same rule the codebase applied earlier to delegated staking — a fee is charged only where it can be charged atomically *without* taking custody. Where it can't, the fee doesn't ship; the guarantee does.

That costs real control, and the honest thing is to name it. The liquidity router still curates and lists bridge pools, but it is not in their path, so its pause switch cannot stop them; only the listing's enabled flag, which the app honours, withholds one from members. That is a weaker lever than the Uniswap path has, and the admin surfaces say so rather than implying the button does more than it does.

One asymmetry the copy has to carry: the HubPool is an L1 contract by design — the pot lives on Ethereum and the bridge lends *from* it to every other network. **Bridge liquidity is therefore available on Ethereum and nowhere else** — not on Polygon, not on any of the L2s — while trading liquidity is available on all five networks this feature covers (Ethereum, Polygon, Arbitrum, Base, Optimism). Every client entry point answers for an unsupported network with an explicit "not available here" naming where it is, rather than an empty list that would read as "nothing to show".

## Why build it this way

**The platform fee is zero today, and a zero fee shows nothing.** Both services — one for bridging, one for pool deposits — are registered at 0 bps against a permanent 250 bps ceiling, so neither surface shows a fee line at all right now; a line reading 0.00 implies a lever that isn't being pulled. What members do pay is real and is not FairWins': the relayer's fee for fronting money on the far side, and network gas. Those are itemised, named for what they are, and never called free.

**Two ceilings, in two places.** The rate the member was shown travels back into the transaction as a maximum, and a live rate above it reverts rather than overcharging. Each router also carries its own hard 250 bps constant, making the cap a property of the charging contract rather than of a registration argument.

**A pause stops new value going in, never value already in.** In-flight bridges live in the SpokePool and settle or refund regardless of this contract's state; existing positions were never held by us to begin with. Both pause switches depend on nothing but their own contract's storage, so they work while every optional service is degraded. On the same principle, a pool listing has no removal function at all — retirement is a flag, because a listing may have members' money behind it and must stay visible and withdrawable.

**Honest limits.** Positions are full-range only: no ranges, no rebalancing, no out-of-range state. Fee-on-transfer and rebasing tokens aren't curatable — residual-balance assertions make both routers fail closed rather than under-deliver. And a bridge price isn't derivable client-side, so when the quoting service is unreachable the Bridge surface says it's unavailable rather than showing a remembered number, while an already-submitted transfer still resolves without it, straight from the chain.

The property this feature most wants to be boring is the one nobody should ever need: when a cross-chain transfer fails, there is nothing to rescue, because nothing FairWins holds was ever standing in the way.

## Further reading

- [Across Protocol documentation](https://docs.across.to/) — the intent-based bridge behind Transfer → Bridge, including the deposit / fill / refund lifecycle and the origin-chain refund rule
- [Uniswap V3 position manager](https://docs.uniswap.org/contracts/v3/reference/periphery/NonfungiblePositionManager) — how a mint consumes only what the current price ratio requires and returns the rest
- [ERC-1822 / UUPS proxies](https://eips.ethereum.org/EIPS/eip-1822) and [OpenZeppelin's upgradeable-contract docs](https://docs.openzeppelin.com/contracts/5.x/api/proxy) — the upgrade pattern both routers use
- For deeper implementation details, see the FairWins developer documentation.
