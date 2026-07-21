# NFTs, Soulbound Tokens, and Memberships: What You Actually Own

*A plain-English guide to unique digital tokens — the kind you can trade, the kind welded to you forever, and the "gift card" that sits between them.*

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Identity, Privacy & Networks |
| **Level** | Beginner |
| **Audience** | Crypto-curious beginners — no technical background needed |
| **Tags** | `nfts`, `soulbound`, `memberships`, `identity`, `plain-english` |
| **Reading time** | ~5 minutes |

## Start with a concert ticket

Imagine two things in your wallet. The first is a $20 bill. It doesn't matter *which* $20 bill you hand over at the coffee shop — any twenty is worth exactly the same as any other. The second is a concert ticket with your seat number on it. That one is *unique*. Seat 14, Row C is not the same as Seat 88 in the balcony, and you can't swap one for the other and pretend they're identical.

Most crypto you've heard of — USDC, a stablecoin worth about one US dollar, or Bitcoin — behaves like the $20 bill. One unit is interchangeable with the next. But sometimes you want the concert ticket: a token that stands for one specific, one-of-a-kind thing. That's an NFT.

## What an NFT is

**NFT** stands for "non-fungible token." "Non-fungible" is a fancy word for "not interchangeable" — the concert-ticket property. Strip away the hype and an NFT is simply **a unique token that lives at your wallet address and that only you control.**

That token can *represent* almost anything: a piece of digital art, a ticket, a certificate, a membership card. The token itself is just a record on a blockchain — a public, shared ledger that everyone can read but no one can secretly rewrite — saying "this particular item belongs to this particular wallet." Because it's unique, you can prove you hold it, and (usually) you can send it to someone else, the way you'd hand a friend your concert ticket.

The key word there is *usually*. Being sendable is what makes an NFT feel like property you own. But sometimes you specifically *don't* want a thing to be sendable — and that's where the next idea comes in.

## What "soulbound" means

A **soulbound** token is an NFT with the transfer button switched off. Once it's yours, it stays yours. You can't sell it, gift it, or hand it to anyone — it's bound to you.

That sounds like a downside until you think about what it's good for. A university diploma is soulbound in real life: it says *you* earned the degree, and it would be worthless if you could sell it to a stranger. A driver's license is soulbound — it's proof about *you*, not a thing to trade. Anything that's meant to be a statement about a specific person is safer when it can't move.

The reason is simple: **a credential you can transfer is a credential that can be stolen, rented, or borrowed.** If a membership that grants access could be sold, someone could rent it out for an hour to slip past a check, or a bad actor could buy their way in. Making it non-transferable closes that door by design.

## Where memberships and vouchers fit

This is exactly the tension FairWins had to solve, and it's a nice way to see all three ideas at once.

A FairWins **membership** — the thing that lets your wallet create and accept wagers — is soulbound. It's tied to your wallet, it can't be transferred, and there's no market for it. That's on purpose: the platform screens you against sanctions lists when you get a membership and tracks your usage per wallet, so a membership that could hop between people would break those safeguards.

But people reasonably want to *gift* a membership to a friend, or resell one they aren't using — the everyday stuff gift cards are made for. You can't do that with something welded to your wallet. So FairWins splits the idea in two:

- The **membership** stays soulbound and non-transferable — the credential itself never moves.
- A **membership voucher** is a normal, freely tradable NFT — think of it as a **prepaid gift card** for a membership. While you hold a voucher it grants you *nothing*: no access, no clock ticking. It just sits there, and you can gift it or sell it like any other NFT.

The magic happens at **redemption**. When someone turns a voucher into an actual membership, that's the moment the platform runs its checks — sanctions screening, "do you already have one?" — and only then writes the soulbound membership to their wallet and destroys the voucher. So the tradable thing (the voucher) and the personal credential (the membership) are kept cleanly separate, and the safety checks land exactly where access is granted.

## What to watch out for

- **"NFT" doesn't mean "expensive art."** It just means a unique token. A membership voucher and a million-dollar monkey picture are the same *kind* of thing under the hood; what they represent is wildly different.
- **A voucher is only worth what it can be redeemed for.** Holding one grants you no access until you redeem it. Treat it like a gift card, not a magic key.
- **Soulbound is a feature, not a bug.** If something is bound to you and can't be moved, that's usually protecting you — it means no one can quietly transfer your credential away, and no one can buy their way into being "you."
- **Selling a voucher is not selling access.** The person who redeems it still has to pass the same checks anyone else would. Buying a voucher second-hand doesn't skip the line.

## Related deep-dive

Want the engineering details? Read [Soulbound Memberships, Transferable Vouchers: Splitting a Token in Two](../../posts/02-soulbound-memberships-vouchers/blog.md).

## Learn more

- [What is an NFT? (ethereum.org)](https://ethereum.org/en/nft/)
- [ERC-721: the standard behind most NFTs (ethereum.org)](https://ethereum.org/en/developers/docs/standards/tokens/erc-721/)
- [Non-Fungible Token (NFT), explained (Investopedia)](https://www.investopedia.com/non-fungible-tokens-nft-5115211)
