# Platform Fees

FairWins is honest about fees: **any fee you pay is shown to you, as its own line, before you
confirm anything.** If you don't see a fee line, there is no fee.

## Where fees can appear

| Area | Fee | What you see |
| --- | --- | --- |
| **Earn** (lending) | A small FairWins platform fee may apply when your deposit goes in — a percentage of the amount (never more than **2.5%**, usually far less, sometimes zero). Withdrawing is always free. | A "FairWins platform fee" line on the deposit review: the rate, the exact amount, and what actually goes into the vault. |
| **Predict** (prediction markets) | A FairWins builder fee on orders that take liquidity (capped at **1%**). | A fee line in the order confirmation with the rate and amount, included in the total shown. |
| **Collect** (collectibles) | None from FairWins. FairWins may earn a referral reward from OpenSea, paid out of OpenSea's own fee — it never changes your price. | Your price is your price; the confirmation says so. |
| Wagers, pools, sending money | No FairWins platform fee. | Network (gas) costs only, always shown. |

## The rules we hold ourselves to

- **Always shown first.** The live rate and the exact amount appear on the confirm screen before
  you sign. Zero fee ⇒ no fee line.
- **Never more than you were shown.** If the rate changes while your transaction is on its way,
  it either completes at (or below) the rate you saw, or it safely fails and asks you to review
  again. It can never complete at a higher rate.
- **Hard caps.** Fees are set in basis points (1 bps = 0.01%) with caps built into the system
  itself — 250 bps (2.5%) for platform fees on services like lending; 100 bps (1%) for the
  Predict builder fee.
- **Rounding favors you.** Fee amounts round down; a fee that rounds to zero is simply zero.
- **Entry only.** Where a platform fee applies (like Earn), it applies once, when you put money
  in — never on withdrawals or on what you earn.

Rates can change over time (they are set transparently on-chain, with a public history), but the
rules above never do: whatever the rate is, you see it before you commit.
