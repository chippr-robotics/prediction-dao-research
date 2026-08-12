# Platform Fees

FairWins is honest about fees: **any fee you pay is shown to you, as its own line, before you
confirm anything.** If you don't see a fee line, there is no fee.

## Where fees can appear

| Area | Fee | What you see |
| --- | --- | --- |
| **Earn** (lending) | A FairWins platform fee on the amount you deposit — **0.50%** today, never more than **2.5%**, sometimes zero. Withdrawing is always free. | A "FairWins platform fee" line on the deposit review: the rate, the exact amount, and what actually goes into the vault. |
| **Earn** (staking — Lido, Polygon) | A FairWins platform fee on the amount you **liquid**-stake — **0.50%** today, cap **2.5%**. **Delegated** staking carries no FairWins fee. Unstaking and claiming rewards are free. | A fee line on the stake review, separate from the provider's own fee on rewards. |
| **Earn** (supplying liquidity) | A FairWins platform fee on the capital you supply — **0.50%** today, cap **2.5%**. Withdrawing a position is free. | A fee line on the supply review, charged only on the capital the pool actually takes. |
| **Transfer → Bridge** | A FairWins platform fee on the amount you bridge — **0.50%** today, cap **2.5%**. | A fee line in the bridge quote, alongside the bridge provider's own fee. |
| **Trade → Perps** | On **GMX**, a FairWins fee of **0.05% of your position size** (not of your deposit — see below), charged by GMX when it opens *and* when it closes; GMX enforces a **0.10%** ceiling on it. On **Gains**, no FairWins fee. Hyperliquid is view-only, so none there either. **In-app perps trading is not switched on yet, so no perps fee is being charged today.** | A fee line in the trade sheet before you sign, in money terms for the exact position, on both the open and the close. |
| **Predict** (prediction markets) | A FairWins builder fee on orders that take liquidity — **0.50%**, capped at **1%**. Orders that add liquidity pay **nothing**. This one is genuinely added to your cost. | A fee line in the order confirmation with the rate and amount, included in the total shown. |
| **Collect** (collectibles) | None from FairWins. FairWins may earn a referral reward from OpenSea, paid out of OpenSea's own fee — it never changes your price. | Your price is your price; the confirmation says so. |
| Wagers, pools, sending money | No FairWins platform fee. | Network (gas) costs only, always shown. |

!!! note "Rates differ by network"
    The rates above are the ones live on **Polygon** today. On some networks the same fee is
    currently set to **zero** — and a zero rate means no fee line at all. Whatever the rate is
    where you are transacting, the app reads it live and shows it to you before you sign; it
    never assumes.

### Perps fees are charged on position size, not on what you put in

This is the one number people misread, so here it is plainly. (The GMX rate below is configured
and ready; it starts costing anyone money only when in-app perps trading is switched on, which it
is not yet.)

A perpetual position has a **size** (also called notional) equal to **the money you put in ×
your leverage**. The FairWins perps fee is a percentage of that size — not of your deposit.

> You commit **$100** and choose **10× leverage**. Your position size is **$1,000**.
> The 0.05% fee is 0.05% of $1,000 = **$0.50** — which is **0.50% of the $100 you actually
> committed**. Closing that position charges the fee again on the size being closed.

So the fee scales with leverage: the same $100 at 2× costs a tenth of what it costs at 20×.
Two more things that follow from how it works:

- **It applies on the way in and on the way out.** GMX computes it when it executes your open
  and again when it executes your close.
- **An order that never executes is never charged.** The venue calculates the fee at the moment
  it fills your order, so a cancelled, rejected, or unfilled order carries **no FairWins fee** —
  and the app says so when that happens.

The venue's own fees (spread, opening and closing fees, funding, borrowing) are separate and
additional. FairWins' fee sits on top of the venue's, and is shown as its own line so you can
tell them apart.

## How FairWins is funded

FairWins earns in five ways. The difference that matters to you is that **some of these are
fees you pay, and some are rewards a venue pays us out of its own fee, costing you nothing.**

**Fees you pay:**

1. **Membership.** Members pay for access to the platform. Membership fees are non-refundable
   and are covered in the [Terms](https://fairwins.app/terms).
2. **Platform fees on services FairWins wraps.** A percentage of the capital you commit —
   lending, staking, supplying liquidity, bridging — charged once, when the money goes in.
   0.50% today where it applies, hard-capped at 2.5% by the system itself.
3. **Builder and interface fees on outside venues.** A percentage of what you trade on a
   third-party venue, collected by that venue and credited to FairWins. These are a real cost
   to you, so they always appear as their own line before you sign.
   - **Predict** (prediction markets): 0.50% on taker orders, 0% on maker orders, cap 1%.
     Live today.
   - **Perps** on GMX: 0.05% of position size, cap 0.10%, charged on open and close. The rate
     is **set up but not being charged**, because in-app perps trading is not switched on yet.
     It applies once it is.
   - **Perps** on Hyperliquid: registered at a rate of **zero** and not charged. Hyperliquid
     trading is not enabled in the app.

**Rewards that cost you nothing:**

4. **Referral rewards paid by the venue out of its own fee.** Your price does not change.
   OpenSea pays an affiliate reward on **Collect** purchases. GMX pays a share of its own
   trading fee under its referral program — and the trader referred by FairWins also receives
   a **discount** on GMX's fee. Gains Network has a referral program too, but it pays FairWins
   **nothing** unless and until Gains approves the FairWins referrer address, so FairWins
   claims no income from it.
5. **Nothing at all on wagers, pools, or sending money.** No cut of a wager, no cut of a pool,
   no cut of a transfer. You pay network gas and that is it.

**What FairWins never does:** on the outside venues the app connects to, FairWins never holds
your collateral, never owns your position, and holds no approval over it. Your own wallet is the
owner and the sender — which is why you can always go to the venue's own app and manage or close
your position there, even if FairWins is unavailable or gone. That is a structural property of
how this is built, not a promise.

## The rules we hold ourselves to

- **Always shown first.** The live rate and the exact amount appear on the confirm screen before
  you sign. Zero fee ⇒ no fee line.
- **Never more than you were shown.** If the rate changes while your transaction is on its way,
  it either completes at (or below) the rate you saw, or it safely fails and asks you to review
  again. It can never complete at a higher rate.
- **Hard caps.** Fees are set in basis points (1 bps = 0.01%) with caps built into the system
  itself — 250 bps (2.5%) for platform fees on services like lending, staking, supplying and
  bridging; 100 bps (1%) for the Predict builder fee; and 10 bps (0.10%) for a perps fee — a
  ceiling enforced by the **venue** (GMX, and Hyperliquid for its own builder fee), not by us.
- **Rounding favors you.** Fee amounts round down; a fee that rounds to zero is simply zero.
- **Entry only — with one stated exception.** Where a platform fee applies to capital you
  commit (Earn, staking, supplying, bridging), it applies once, on the way in — never on
  withdrawals and never on what you earn. **Perps are the exception**: GMX charges the fee when
  it opens the position and again when it closes it, because the fee is on the size being
  traded, not on money parked somewhere. We would rather say that than keep the rule tidy.
- **No execution, no fee.** Where a venue computes the fee at execution — the perps fee does —
  an order that is cancelled, rejected, or never filled costs you nothing, and the app tells you
  so rather than leaving you to wonder.
- **We never guess a rate.** If the app cannot read the live rate, it says the fee could not be
  confirmed and declines to proceed with an opening action rather than charging a rate it
  assumed. Getting out of a position is never blocked by a fee read.

Rates can change over time (they are set transparently on-chain, with a public history), but the
rules above never do: whatever the rate is, you see it before you commit.
