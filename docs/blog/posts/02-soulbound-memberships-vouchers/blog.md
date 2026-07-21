# Soulbound Memberships, Transferable Vouchers: Splitting a Token in Two

*Why FairWins made membership non-transferable, then built a gift-and-resale market on top of it anyway*

| | |
|---|---|
| **Series** | Identity & Access, part 2 |
| **Audience** | Product managers, founders, growth teams, junior engineers |
| **Tags** | `memberships`, `token-design`, `gifting`, `access-control` |
| **Reading time** | ~7 minutes |

> **Responsible use.** FairWins wagers are based on publicly available information and legitimate forecasting. Memberships gate access to that activity; they are not a mechanism for circumventing any law. All participants remain fully subject to applicable laws and compliance requirements, and every membership — however acquired — passes sanctions screening.

## The gift you can't give

A FairWins membership is deliberately boring. You pay in USDC — $2 for Bronze, $8 for Silver, $25 for Gold, $100 for Platinum — and for the next 30 days your wallet can create and accept wagers, up to a limit set by your tier. The membership is **soulbound**, a term for something permanently bound to a single wallet: it lives at your address, it can't be transferred, and there's no market for it. That's a feature, not a limitation. An access record that can move is an access record that can be stolen, rented out to a sanctioned party, or briefly borrowed to sneak past a compliance check.

Then a product request landed: *let me buy a membership for a friend.* And its sibling: *let me resell the one I bought and don't want.* Both are completely reasonable — gift cards and resale markets are table stakes for any paid product — and both are, on their face, impossible. A record welded to your address has nothing to hand over. And making it movable would destroy the very properties the platform relies on: sanctions screening happens when membership is granted, usage limits are tracked per wallet, and the wager engine trusts that the wallet holding a membership is the one that was screened.

The tempting-but-wrong fix is to bolt a "transfer, and re-screen the new owner" button onto the membership itself — turning a fixed access record into a moving target every other part of the system has to special-case. The fix FairWins shipped is cleaner: don't make the *membership* transferable. Make the *right to claim one* transferable, and keep the two ideas in completely separate contracts.

## Two rails, one membership

Start with what "soulbound" actually means here. A FairWins membership isn't an NFT with transfers switched off — it isn't a token at all. It's just a record in the platform's membership ledger, filed under your wallet address: which tier you have, when it expires, and how much of your usage limit you've used this month. There's no "transfer" button to disable because there's nothing to hand over — non-transferability simply falls out of how the data is shaped.

It's worth contrasting this with the popular "soulbound token" — a standard for NFTs permanently locked to a wallet but still visible in it. FairWins didn't need the token part at all: memberships are read by contracts, not shown off in wallets, so a plain ledger entry is simpler, cheaper, and has no transfer machinery to audit.

Buying a membership directly writes that record: it screens the buyer against sanctions lists, pulls the tier's price in USDC, marks the tier and its expiry, and resets the usage counters. Thirty days later, it lapses.

The new idea adds a **second way in** that lands on the exact same record. A **membership voucher** is a real, freely transferable NFT — think of it as a prepaid gift card for a membership — minted for the tier's normal price. The whole trick is in what a voucher *doesn't* do:

- It grants **no membership** while you hold it. No clock is running, no usage limits accrue, your wallet has no access.
- It **never expires.** A voucher is a bearer claim you can sit on for a year and still redeem into a fresh, full 30-day membership.
- It **locks in its tier and duration at the moment it's minted.** If the team later reprices or retires that tier, the voucher still delivers exactly what it was bought for.

Because the voucher is inert — it confers nothing until redeemed — it is completely safe to trade. Gifting it is an ordinary transfer. Reselling it works on any standard NFT marketplace. The contract even suggests a small resale royalty back to the treasury (2.5% by default, capped in the code at 5% so it can never be cranked higher). None of that touches compliance, because none of it grants anyone access.

## Redemption: where the rails converge

A voucher becomes a membership at one moment: redemption. This is the single control point where everything a direct buyer faces gets applied to the person redeeming.

In plain terms, the redemption does this, in order:

1. Confirm the person redeeming actually owns the voucher.
2. Confirm they don't already have an active membership for that role.
3. Screen them against the sanctions lists — and if they're listed, stop everything right here.
4. Write the membership: grant the exact tier and duration the voucher locked in, reset the usage counters, record which terms they agreed to.
5. Only then, as the very last step, burn the voucher.

The ordering carries the product's failure semantics. If the redeemer is sanctioned, or already holds an active membership, the entire call is undone and the voucher is left **completely untouched** — still owned, still tradable. A legitimate buyer is never punished because some previous holder couldn't redeem, and because the voucher is destroyed only at the very end, any earlier failure rolls the whole thing back safely.

Notice *who* gets screened: **only the person redeeming, and only at the moment of redemption.** Minters and resale buyers are deliberately not screened. That's a conscious trade-off: a sanctioned party could profit by reselling a voucher they never redeem. What they can never do is turn one into actual platform access, because the screen sits exactly where access is granted. Compliance lives at the point of *use*, not the point of *trade*.

After redemption, the two routes are indistinguishable. The wager engine reads the same membership record either way and has no idea how it was obtained — and that's a hard requirement, verified by running the full test suite against both routes.

## The economics are deliberately flat

A voucher costs exactly the tier's normal price — the same amount the direct route charges — so neither path is cheaper and there's no buy-here-redeem-there arbitrage to game. The money goes to the treasury the moment the voucher is minted, which works because granting the membership later costs the platform essentially nothing, so there's no need to hold reserves against outstanding vouchers. There are no primary refunds: buyer's remorse is resolved by reselling or redeeming. And the voucher's own artwork and description — generated entirely on-chain — literally reads "utility access token, not an investment."

Buying a batch of vouchers as gifts and sending them straight to a recipient is handled by a small, separate helper, since the voucher itself only mints one at a time. The helper pulls the exact total, mints the batch, and forwards every one to the recipient in a single transaction. It holds no funds at rest and has no admin or withdrawal path. If it isn't deployed on a given network, buying one at a time still works.

## Privacy: pseudonymity, stated plainly

The voucher route has a quiet second use. Because redemption only checks that you *own* the voucher — never that you *minted* it — you can move a voucher to a fresh wallet and redeem it there. The resulting membership keeps no back-reference to who bought it or how it changed hands, so your wagering activity isn't chained on the public ledger to the wallet that originally paid. A gasless version goes further: since redeeming moves no money, a helper service can submit the transaction for you, so even the wallet paying the network fee needn't be your trading wallet.

FairWins is careful not to oversell this. Voucher mints, transfers, and burns are all public events — anyone can watch a voucher move. What redeeming from a fresh wallet buys you is **pseudonymity, not cryptographic unlinkability**, and the interface is required to say exactly that.

## Design decisions

**Changeable logic, frozen asset.** The membership ledger can be upgraded in place — the voucher feature itself arrived as one such upgrade — because screening, terms, and grant logic must be able to evolve. The voucher is the opposite: deliberately *not* upgradeable, because the rules of a tradable, paid-for bearer asset must not change after someone buys it. The thing people pay for stays fixed; the machinery around it can improve.

**The membership is a ledger entry, not a locked NFT.** No transfer function to disable, no locked-token standard to implement. The only cost is that it's invisible in your wallet — which doesn't matter for something only contracts ever read.

**Royalty as a hint, not a cage.** Forcing royalties would mean whitelisting marketplaces or running our own, killing open trading and the trade privacy that comes with it. A flat, capped suggestion keeps the utility framing honest, accepts that some marketplaces will ignore it, and lets the platform earn reliably on the first sale.

The general pattern travels well. When you need a token to be *both* non-transferable (for compliance and integrity) *and* transferable (for gifting and resale), you don't need one token that does both badly. You need two artifacts — an inert, tradable *claim* and a soulbound *grant* — joined by a single, guarded redemption that burns one and writes the other.

## Further reading

- ERC-721, the non-fungible token standard the voucher is built on: https://eips.ethereum.org/EIPS/eip-721
- EIP-2981, the NFT royalty standard: https://eips.ethereum.org/EIPS/eip-2981
- EIP-5192, the minimal soulbound (locked) NFT standard discussed above: https://eips.ethereum.org/EIPS/eip-5192
- OpenZeppelin Contracts, the audited building blocks behind the token and access logic: https://docs.openzeppelin.com/contracts
