# Membership Vouchers

A **membership voucher** is a prepaid, transferable claim on a FairWins
membership. You buy it with USDC, and it can be **held, gifted, or resold** like
any NFT. It only becomes a membership when someone **redeems** it.

Think of it as a gift card: buying it doesn't sign *you* up — it creates a token
that whoever holds it can turn into a membership.

## Voucher vs. buying a membership directly

| | Buy a tier directly | Buy a voucher |
|---|---|---|
| What you get | A membership on your own wallet | A transferable ERC-721 token |
| Transferable? | No — memberships are **soulbound** | Yes — gift or resell it freely |
| Gives membership immediately? | Yes | No — only once **redeemed** |
| Good for | Joining yourself | Gifting, resale, buying ahead |

Both cost the same USDC price for a given tier (Bronze, Silver, Gold,
Platinum — see [Roles and Tiers](../system-overview/roles-and-tiers.md) for the
current ladder).

## Buying a voucher

1. Go to **Account Center → Membership** and choose **Buy a voucher**.
2. Pick the **tier**. The price is that tier's USDC price.
3. Confirm the wallet prompts — **approve** USDC, then **mint**. The USDC goes
   to the treasury and a voucher NFT lands in your wallet.

Buying a voucher does **not** screen you against the sanctions list and does
**not** give you a membership — screening and the membership grant happen at
**redemption**.

## Gifting or selling a voucher

A voucher is a standard ERC-721, so you move it like any NFT:

- **Gift** — send the voucher to a friend's address from your wallet (or any
  NFT-aware wallet/marketplace).
- **Resell** — list it on an NFT marketplace. A small creator royalty
  (2.5% by default, capped at 5%) may apply on marketplace sales.

While you hold it, the voucher confers **no** membership and grants **no**
wager rights — it's purely a bearer claim waiting to be redeemed.

## Redeeming a voucher

Whoever holds the voucher redeems it to receive the membership:

1. Go to **Account Center → Membership** and choose **Redeem a voucher**.
2. Confirm the redemption. This **burns** the voucher and writes a
   **soulbound, time-bound** membership (the tier the voucher carries) to your
   wallet.

Redemption screens the redeemer against the sanctions oracle, and — like a
direct purchase — records your acceptance of the current Terms.

!!! note "Redeem to a wallet you control"
    The membership is soulbound to whoever redeems, so redeem from the wallet
    you want to wager with. The voucher itself is transferable; the membership
    it produces is not.

## After redeeming

You now have an active membership exactly as if you'd bought the tier directly —
it's time-bound (30 days) and gates wager creation/acceptance and your monthly /
concurrent limits. See [Getting Started](getting-started.md#4-get-a-membership)
and [Roles and Tiers](../system-overview/roles-and-tiers.md).
