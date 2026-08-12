# The Right Amount of Solidity Turned Out to Be Zero

*Why the fee-taking contract we planned for perpetual futures would have owned the member's position instead — and why "50 bps" only has one honest answer once the fee is charged on notional*

| | |
|---|---|
| **Series** | FairWins Engineering |
| **Audience** | Product and engineering readers interested in non-custodial design and how a platform funds itself |
| **Tags** | `perps`, `derivatives`, `non-custodial`, `fees`, `gmx`, `gains` |
| **Reading time** | ~10 minutes |

---

> **Perpetual futures are leveraged products traded on third-party venues.** A position can be
> liquidated and lose the entire stake during ordinary market moves. Nothing in this post is advice
> to trade one.

---

## The contract that was on the sprint board

Perps arrived in FairWins read-only: market data and a member's open positions across Gains
Network, GMX and Hyperliquid, visible in one place, with no way to act on any of them. Phase 1 was
to make them manageable — close, reduce, protect with a stop-loss, open, and recover an order that
got stuck.

The plan carried a contract. Call it a `PerpsRouter`: upgradeable, pulls the member's collateral,
takes the platform fee, forwards the rest into the venue. That is how every other paid surface in
the product works — Earn's deposit charges its fee and lands the net in the vault in one atomic
transaction, precisely so a member can never be charged for a deposit that didn't happen. Writing
the perps version looked like familiar work: confirm the venue interfaces, write the router, book
the security review.

The research killed it in an afternoon, and the reason is two lines of code we do not own.

## `msg.sender` is the owner, and there is no second opinion

Gains' `_openTrade` begins by ignoring you. It takes a `Trade` struct whose very first field is
`address user` — and then runs `address sender = _msgSender(); _trade.user = sender;`. You fill the
field in; the venue overwrites it. Collateral is pulled from the same `sender`.

GMX v2 doesn't even offer the field. `ExchangeRouter.createOrder` line 246 is
`address account = msg.sender;`, and that account is hashed straight into the position key:
`keccak256(account, market, collateralToken, isLong)`. Ownership isn't recorded next to the
position; ownership *is* the position's address.

Neither venue has an owner parameter, and every management function resolves the position the same
way. On Gains, `closeTradeMarket`, `updateSl`, `updateTp`, `increase/decreasePositionSize` and
`cancelOrderAfterTimeout` all resolve as `(_msgSender(), index)`. On GMX, `cancelOrder` reverts
unless `order.account() == msg.sender`.

So a fee-taking router in that path becomes the **owner of the member's leveraged position**. Not
"would need an extra helper function" — the member could not close it at all, because
`closeTradeMarket` looks up trades belonging to the caller and the member's index space is empty.
Only the router could exit, only through whichever functions we happened to have written, for the
life of the position. Their collateral, their risk, our position.

GMX appears to offer a way out and does not. `CreateOrderParamsAddresses` has a `receiver` field,
sitting right there in the params, and it is tempting to read it as ownership. It only directs
payouts. A router that names the member as `receiver` still owns the position — it would simply be
mailing the member the proceeds of something only it could close. Batching doesn't launder it
either: GMX's `multicall` is `delegatecall`-to-self and preserves the outer caller.

The unnerving part is that we had already written this rule down, in our own codebase, for a much
milder case. Across's bridge-LP `addLiquidity` takes no recipient, so LP tokens mint to whoever
called it — which is why FairWins doesn't route those deposits at all and charges nothing on them.
Same shape, an order of magnitude more consequence: an LP position you can't exit is bad, and a
leveraged position you can't exit is a liquidation you get to watch.

So this feature ships **no Solidity**. Every venue call is member-direct: FairWins builds calldata,
the member's wallet signs it and *is* the sender. A test asserts over constructed calldata that no
FairWins-controlled address appears in any ownership field of any venue call. Finding that out was
the work; the deliverable was a deletion.

## The rails were already there, and better than the one we'd have built

The second discovery made the first one painless. Both venues already ship a third-party fee rail,
and both are strictly better than a wrapper.

GMX's is `uiFeeReceiver`. Any address can call `setUiFeeFactor(uint256)` and set its own rate —
`account = msg.sender`, so registration is permissionless and self-service, with no GMX approval
step. The venue enforces the ceiling itself: `MAX_UI_FEE_FACTOR = 1e27`, which is **10 bps**. And
the fee is computed inside GMX's own `getPositionFees` at **order execution**.

That third property is the one we could not have built. Our router would have taken its fee at
submission. On a venue where a keeper executes your order some time later — and may decline to, for
slippage or exposure limits — charging at submission means charging for something that may never
happen. Not charging would have required holding the fee pending the outcome and refunding it:
custody, per-member accounting, a refund path, an operator with a button. GMX hands us the property
for free, because GMX is the party actually executing.

A fourth fell out of it. When `uiFeeReceiver` is the zero address, GMX's fee calculation
short-circuits to zero and returns early — so the platform-wide rule that a zero rate must behave
identically to a fee-free integration is here enforced by the venue rather than by a branch we
maintain and can break.

Hyperliquid's equivalent is builder codes: a fee ceiling the *member* signs and can revoke at any
time, capped at 10 bps for perps. Also better than a wrapper. It isn't in use yet, for reasons
below.

## "50 bps" — of what?

The instruction from product was reasonable: 50 bps is the standard fee the platform charges across
its other services, so perps should be similar. That standard is real and live. On Polygon today,
`earn.lend`, `stake.lido`, `stake.polygon`, `bridge.transfer` and `liquidity.deposit` are all set to
**50 bps** under a hard **250 bps** cap. (The same services are registered on Arbitrum and Base at
0 bps.) Those fees are charged on the **capital a member commits**, at entry only, never on the way
out.

Perps fees are not charged on capital committed. They are charged on **notional** — margin ×
leverage. A member who puts up $200 at 25× controls $5,000, and every venue in the world prices
that trade off the $5,000.

So the same number, applied to the base perps actually uses, means something entirely different.
Each cell below is that fee expressed in bps of the member's *own margin*:

| Rate on notional | 1× | 5× | 10× | 25× | 50× |
|---|---|---|---|---|---|
| **5 bps** (chosen) | 5 | 25 | **50** | 125 | 250 |
| 10 bps (venue ceiling) | 10 | 50 | 100 | 250 | 500 |
| 50 bps (the platform number, naively) | 50 | 250 | 500 | 1,250 | **2,500 = 25% of margin** |

And GMX charges its UI fee on **open and close**, so a round trip doubles every cell.

Fifty bps of notional at 50× leverage is a quarter of the member's margin per side — half of it
round-trip — before the venue's own costs. Nobody intended that. It is the right number applied to
the wrong base, and it would have been very easy to ship: the config field says "bps", the
disclosure says "0.50%", and both statements are true and useless.

**5 bps of notional at 10× leverage is about 50 bps of margin.** That is the platform standard,
honestly translated into the unit perps uses. It also survives the external sanity check: GMX and
Hyperliquid each independently cap a third party at 10 bps, which is a decent proxy for what the
venues themselves consider the top of the range for someone who is not them. Sitting at half the
ceiling is a defensible place to be.

That rate is now configured. GMX's UI fee factor for the FairWins receiver
`0x52502d049571C7893447b86c4d8B38e6184bF6e1` is set to `5e26` on Arbitrum — 5 bps, against the
venue's 10 bps ceiling, charged on notional, on both open and close, computed by GMX at execution
(transaction `0x2034f95a10e5ab040bc38f38d9bd393f85f00547ff9b5430b21955d264d772f0`).

**No member is paying it today.** In-app perps trading sits behind a feature flag that is currently
off. The rate is configured, not collected. It will apply when the flag is turned on, and the
disclosure rules were written before the rate was.

Those rules are short. The fee line appears before any signature, and states its base plainly —
*charged on position size, not on the amount you put in* — with the money amount for this position
in front of the member. A zero rate produces no line at all. If the rate cannot be read, **opening**
is blocked with "the fee could not be confirmed"; **closing is never blocked by a fee read**. Both
sides are disclosed, because GMX charges on both. And when an order is cancelled or never filled,
the app says outright that no FairWins fee was charged — a statement we can only make because the
venue computes it at execution.

## How FairWins actually makes money

The fee above is one fifth of the answer to a fair question, so here is all of it. FairWins earns in
five distinct ways, and the distinction that matters is **who pays**.

**1. Membership fees.** Paid by members, for access. Non-refundable, and disclosed in the Terms.

**2. Platform fees on wrapped services.** A percentage of the capital a member commits, charged at
entry only and never on withdrawal. Live on Polygon today at 50 bps for `earn.lend`, `stake.lido`,
`stake.polygon`, `bridge.transfer` and `liquidity.deposit`, under a hard cap of 250 bps; registered
on Arbitrum and Base at 0 bps. One on-chain contract is the source of truth for every one of those
rates.

**3. Third-party builder and UI fees.** A percentage of the notional a member trades on an external
venue, collected by that venue and credited to FairWins:

- **Polymarket** (Predict): 50 bps taker, 0 maker, under a 100 bps cap. This one is *additive* — a
  genuine extra cost to the trader — so it is disclosed as its own line and never described as free.
- **GMX v2** (Perps): 5 bps of notional, on open and close, under GMX's 10 bps cap. Configured
  today; not collected, because trading is flagged off.
- **Hyperliquid** (Perps): the service `perps.hyperliquid.builder` was registered on Polygon today
  at a 10 bps cap and a **rate of 0** (transaction
  `0x2ecf8d5f512fb9d43584366da22da1d9027c871d65e9453ad45fbb1c9c6eb747`). Registered so the config
  isn't invented later under pressure; charging nothing, because Hyperliquid trading is not enabled.

**4. Venue-paid referral rebates.** Paid by the venue out of *its own* fee. These cost the member
nothing and never change the price they pay. OpenSea's affiliate reward on the Collect surface is
one. GMX's referral tier is another — a share of GMX's own fee, and the referred trader also
receives a fee *discount*. Gains Network has a referral rebate too, and it earns **nothing** until
Gains whitelists the FairWins referrer address, failing silently until then — so no revenue is
claimed from it anywhere in the product, including in this sentence.

**5. Nothing at all** on wagers, on pools, or on sending money. Those cost network gas and nothing
else.

What FairWins' perps fee is emphatically *not* is the venue's cost. Gains and GMX charge their own
spread, opening and closing fees, funding and borrowing. Ours sits on top of those and is itemised
separately, because a member who cannot tell whose fee is whose has not been told anything.

## Not owning the position is a business asset

The safety argument for member-direct calls writes itself. The business argument is what made the
decision comfortable rather than merely correct.

**No custody.** FairWins never holds member funds on a perps venue, never owns a position, and
holds no approval on a member's behalf. Collateral approvals point at the venue — the Gains diamond,
and for GMX its `Router`, which is *not* the ExchangeRouter members call, a mix-up that fails only
at execution and catches integrators every year.

**No rescue button, and therefore none to misuse, mis-key, or be asked to use.** The bridge post on
this blog made the same point about an unfilled cross-chain deposit: *the absence is the design*.

**No operational burden.** No upgrade key over a value-bearing contract, no storage-layout gate, no
guardian rota, no incident at 3am where a member's position is stuck behind our contract and the
only person who can act is asleep.

**A materially smaller regulatory surface.** A platform that never holds the member's money, never
owns the position, and can be removed from the picture entirely without changing who is able to
exit is a different kind of thing from one that does any of those.

And it is structural, not a promise. The member's wallet is `msg.sender` and therefore the owner.
If FairWins vanished tomorrow, every position remains closable directly on the venue's own app, by
the person who owns it, with no cooperation from us. There is no configuration we could get wrong
that changes it.

The symmetry is neat, too: FairWins claims its own accrued UI fees with `claimUiFees(...)`, which is
also `msg.sender`-keyed. The only value FairWins is capable of stranding on these venues is its own.

## Inclusion is not execution, and a leveraged product cannot be vague about it

Both venues are keeper-executed, which means a transaction that succeeded on-chain has *not* opened
or closed anything. It has queued an instruction.

On Gains, inclusion emits `MarketOrderInitiated`. The terminal state arrives later: `MarketExecuted`
— the first moment a real fill price, size and liquidation price exist — or `MarketOpenCanceled`
with a reason code that decodes into member-facing words (slippage, exposure limits, price impact,
max leverage). On GMX, inclusion emits `OrderCreated`, and the terminal state is `OrderExecuted`,
`OrderCancelled`, or **`OrderFrozen`** — a real state that nothing auto-clears, which only the
owner can resolve, and which the owner can always resolve.

So the UI says **"sent to the venue"** on inclusion, and says "opened" or "closed" only when the
venue's execution event arrives. Values that exist only after execution — fill price, actual size,
liquidation price, realised P&L — are labelled as requested or estimated until then.

This distinction is non-negotiable on a leveraged product for one reason: a member who believes
their close executed **stops watching the position**. If the order was in fact rejected for
slippage, the position is still open, still funded, still liquidatable, and the only person who can
act on it has gone to bed on the strength of a green checkmark. Optimistic UI is an annoyance in
most of this product. Here it is a liquidation.

The same rule runs downward into the unhappy states. A Gains market order the keeper never executed
gets a named recovery control — `cancelOrderAfterTimeout`, offered once the venue's timeout has
passed — that returns the collateral. A frozen GMX order is presented as needing attention, with
the venue's reason and `cancelOrder` offered by name. A stuck order holding collateral with no
visible control is indistinguishable, from where the member sits, from lost money.

One trap earned its own type in the code: Gains has **two disjoint index spaces** — a pending-order
index consumed only by `cancelOrderAfterTimeout`, and a trade index consumed by everything else.
Pass one where the other belongs and you act on a different object entirely.

## What ships, and what deliberately doesn't

**Gains Network and GMX v2 get full management**: close, partial reduce, stop-loss and take-profit,
open with defaults pre-selected from what the member actually holds, and recovery of stuck orders —
all through the app's standard bottom sheets.

**Hyperliquid stays read-only.** Its L1 actions sign under a hardcoded `chainId 1337` that injected
wallets reject, so a browser needs an agent key held client-side *even to close a position*, plus
USDC already bridged onto Hyperliquid's own L1. There is no cheap manage-only version of that.
Positions stay visible with an honest statement that management happens on the venue, and a link
there. We are not going to ship a Close button that cannot close — which is also why that fee rail
is registered at a rate of zero rather than at 5 bps.

**Exits are never gated.** Sanctions screening and the jurisdiction-and-leverage-risk attestation
gate **opening** a position, and fail closed there — FairWins is the enforcement point, because
neither venue provides a server-side backstop. Nothing gates the other direction. Not screening,
not jurisdiction, not the killswitch, not the feature flag, not an unreadable fee rate. It is
tested as a hard rule: zero code paths gate a close, reduce, cancel or recovery.

And the risk gets said in the product, not just in a post. Perpetual futures are leveraged products
on third-party venues, a position can be liquidated and lose the entire stake during ordinary market
moves, and the terms have to name leveraged derivatives before execution is enabled for anyone — a
gate, not a follow-up.

---

The sprint expected a contract, a deploy script, a storage-layout gate and a security review. It
produced none of them. What it produced was one sentence — *any contract we put in this path becomes
the owner of the member's leveraged position* — and everything else in the feature followed from it,
including a fee that is capped by someone other than us, charged only on orders that actually
happened, and priced in the unit the member is actually exposed to.

## Further reading

- [GMX v2 documentation](https://docs.gmx.io/) — the `uiFeeReceiver` mechanism, `setUiFeeFactor`,
  the order lifecycle, and why `receiver` is a payout target rather than an owner
- [Gains Network documentation](https://docs.gains.trade/) — gTrade's trade struct, the market-order
  lifecycle, and the timeout-cancellation path
- [Hyperliquid documentation](https://hyperliquid.gitbook.io/hyperliquid-docs) — builder codes and
  the member-signed fee ceiling
- [One Argument Decides Who Gets the Money Back](../35-cross-chain-intents-and-lp/blog.md) — the same
  no-custody rule applied to cross-chain deposits and pooled liquidity
- [The FeeRouter: one source of truth for platform fees](../22-fee-router/blog.md) — where the 50 bps
  platform standard lives, and why no rate is ever hardcoded
- [Predict: earning from prediction-market trades without ever touching one](../24-predict-polymarket-builder-codes/blog.md)
  — the other venue-native fee rail, and why an additive fee must be disclosed differently
