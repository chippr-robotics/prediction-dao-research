# Perps (Perpetual Futures)

The **Perps** view (Finance → Trade → **Perps**) brings perpetual-futures markets from several
outside venues into one place: live prices, funding, open interest, and the positions your
wallet already holds. Where in-app trading is switched on, you can also open, close, reduce, and
protect a position without leaving FairWins.

!!! warning "These are leveraged products, and you can lose everything you put in"
    A perpetual position can be **liquidated** — closed automatically at a loss — during an
    ordinary market move, and a liquidation can take your entire stake. Perps are not a savings
    product and nothing here is advice. Read the
    [Risk Disclosure](https://fairwins.app/risk) before you trade.

!!! info "Where this is today"
    In-app trading is switched on venue by venue and is **not switched on yet**. Right now the
    Perps view is read-only everywhere — markets and your existing positions, with links to the
    venue — and **no FairWins perps fee is being charged to anyone**. The rest of this page
    describes how trading behaves where it is switched on.

## What a perpetual future is

A perpetual future is a contract that tracks the price of something — BTC, ETH, an index — and
lets you take a position on it with **leverage**, meaning you control a position larger than the
money you put up. It never expires, so instead of settling on a date it uses a recurring
**funding** payment between the two sides to keep its price tethered to the real one.

Leverage cuts both ways: it multiplies gains and losses equally, and once your losses eat the
money you put up, the venue closes your position for you and that money is gone.

## Whose product this is

Every perp market here belongs to a **third-party venue**, not to FairWins:

| Venue | Where it runs | What FairWins can do, once trading is switched on |
| --- | --- | --- |
| **Gains Network** | Arbitrum, Base, Polygon | Browse markets, open, close, reduce, protect, recover a stuck order |
| **GMX v2** | Arbitrum | Browse markets, open, close, reduce, protect, recover a stuck order |
| **Hyperliquid** | Its own network | Browse markets and **view** your positions — management happens on the venue |

The venue sets the rules: which markets exist, the maximum leverage, its own fees, funding
rates, when trading is paused or restricted to closing only, and whether an order gets filled.
FairWins prepares the transaction; **your wallet signs it and your wallet is the sender**, so
the position belongs to you and to no one else. FairWins never holds your collateral, never owns
your position, and holds no approval over it — you can always go to the venue's own app and
manage or close the position there, even if FairWins is unavailable or gone. That is a structural
property of how this is built, not a promise.

!!! note "Availability"
    Perps are a mainnet-only feature and depend on the venues being reachable. If a venue is
    down or unreadable, it is named and its markets are left out rather than shown stale — the
    other venues keep working. Wherever in-app trading is not switched on, the section stays
    read-only and links you to the venue, and **no FairWins perps fee is charged at all**.

## Before your first trade

Opening a position asks you for two things once:

- a **screening check** on your wallet, and
- an **acknowledgement** that you can lawfully trade leveraged derivatives where you are, and
  that you understand a position can be liquidated.

These gate **opening** a position and nothing else. Closing, reducing, cancelling, and
recovering collateral are **never** blocked — not by screening, not by your jurisdiction, not by
FairWins turning the feature off. Nothing may stand between you and getting out.

If you use a **passkey account**, the position is owned by your smart account rather than a
browser wallet. That is still yours, but FairWins is currently the only app that can drive it —
the confirm step says so before you sign.

## Opening a position

1. Open **Trade → Perps** and pick a pair. The list shows price, funding, open interest, and the
   maximum leverage each venue allows.
2. The trade sheet opens with sensible choices already made for you: a venue (with the reason it
   was picked), a direction, collateral you actually hold, and a conservative leverage. Change
   whatever you like — usually just the amount.
3. Review the preview: **position size**, estimated entry price, **liquidation price**, the
   venue's fees, the FairWins fee, and the total. These are estimates until the venue executes.
4. Confirm in your wallet.

If your amount is too small, too large for the venue's limits, or your balance is short, the app
says so **before** your wallet is ever involved.

## "Sent" is not "filled"

This is the most important thing to understand about perps in the app.

Your transaction being confirmed on-chain only means the **venue has received your order**. The
venue executes it separately, moments later, and only then does a real fill price, a real size,
and a real liquidation price exist. So the app says:

- **Sent to the venue — pending** when your transaction goes through, and
- **Opened** / **Closed** only when the venue actually executes it.

Until then, every number shown is labelled as requested or estimated. If the venue rejects or
cancels your order, you see the venue's own stated reason — slippage, price impact, exposure
limits, and so on — your collateral comes back, and **no FairWins fee is charged**, because the
fee is only calculated when an order actually fills.

## Closing and reducing

Open a position from the list and the sheet shows its size, entry price, leverage, liquidation
price, and unrealized profit or loss — with a **—** wherever the venue does not report a value,
never a guess. From there you can **close all of it**, or reduce part of it.

You'll see what you should receive and what the fees are before you sign. As with opening, the
close is **sent** first and **closed** only when the venue executes it.

If a venue is in **close-only** mode, you can still close and reduce there; only opening is
disabled, and the venue is named as the reason.

## Stop-loss and take-profit

From the same sheet you can set a **stop-loss** (close automatically if the price moves against
you by a set amount) and a **take-profit** (close automatically once you're up by a set amount).
Both are first-class actions, not buried settings.

- The sheet suggests a starting level based on the position itself and shows what that level
  means **in money**, not just as a price.
- A stop-loss placed beyond your liquidation price is refused, with an explanation, before your
  wallet is asked to sign — the position would be liquidated first, so the stop would never fire.
- The sheet always shows the levels **the venue has stored**, not the ones you asked for, so you
  can tell the difference between requested and in force.

You can change or remove them at any time. Protection is not a guarantee: in a fast or gapping
market a venue can fill a stop worse than the level you set, or not in time at all.

## When an order gets stuck

Occasionally an order is neither filled nor cancelled — a Gains order the keepers never picked
up, or a GMX order the venue **froze**. Collateral sitting in limbo with no visible control is
indistinguishable from lost money, so FairWins does not hide it:

- The order is listed in the Perps view as needing attention, with the venue's reason where it
  gives one.
- A named recovery control is offered that cancels the order and **returns your collateral to
  your wallet**.
- That control is never gated — not by screening, not by your jurisdiction, not by FairWins
  disabling the feature.

The recovery call is owner-only at the venue, which means only you can make it, and you always
can.

## Fees

- **Nothing is being charged today.** In-app perps trading is not switched on yet, so no member
  is paying a FairWins perps fee. The GMX rate below is configured and applies once trading is
  switched on.
- **FairWins' fee** on GMX is **0.05% of your position size** — your deposit multiplied by your
  leverage — charged by GMX when it opens the position and again when it closes it. GMX enforces
  a 0.10% ceiling on it. On **Gains** there is no FairWins fee; on **Hyperliquid**, which is
  view-only here, there is none either.
- **Position size, not deposit.** At 10× leverage, 0.05% of the position is about 0.50% of the
  money you actually put in. Higher leverage means a bigger fee from the same deposit.
- **The venue's own fees are separate** and usually larger: spread, opening and closing fees,
  ongoing **funding** payments, and borrowing costs. They are the venue's, shown as the venue's.
- **No fill, no FairWins fee.** The fee is computed by the venue at execution.
- Every fee you pay appears as its own line before you sign. If there is no line, there is no
  fee. The full picture is in [Platform Fees](platform-fees.md).

## Your activity record

Position and order activity feeds your activity feed and your financial activity record, with
links to the venue or block explorer where a verifiable record exists — and an honest note where
a venue provides none.

## The honest risk summary

- **You can lose your entire stake.** Leverage magnifies losses, and liquidation happens
  automatically during normal market moves. Only commit what you can afford to lose completely.
- **Funding is an ongoing cost or credit** that accrues for as long as you hold the position.
- **These are third-party venues** running third-party smart contracts. Their bugs, outages,
  pauses, restrictions, and liquidation engines are theirs, not FairWins'.
- **Orders can fail.** A venue can reject, cancel, or freeze an order, or fill it at a worse
  price than the estimate you saw.
- **Nothing here is advice**, and FairWins does not recommend leverage, a direction, or a venue.
  Read the [Risk Disclosure](https://fairwins.app/risk) and the
  [Terms](https://fairwins.app/terms) in full.
