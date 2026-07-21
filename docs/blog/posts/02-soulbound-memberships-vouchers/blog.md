# Soulbound Memberships, Transferable Vouchers: Splitting a Token in Two

*Why FairWins made membership non-transferable, then built a gift-and-resale market on top of it anyway*

| | |
|---|---|
| **Series** | Identity & Access, part 2 |
| **Audience** | Token designers, product engineers, growth |
| **Tags** | `soulbound`, `erc721`, `tokenomics`, `memberships`, `access-control` |
| **Reading time** | ~8 minutes |

> **Responsible use.** FairWins wagers are based on publicly available information and legitimate forecasting. Memberships gate access to that activity; they are not a mechanism for circumventing any law. All participants remain fully subject to applicable laws and compliance requirements, and every membership grant — however acquired — passes sanctions screening.

## The gift you can't give

A FairWins membership is deliberately boring. You pay USDC — $2 for Bronze, $8 Silver, $25 Gold, $100 Platinum — and for 30 days your wallet can create and accept wagers, up to a per-tier throughput limit. The membership is **soulbound**: it lives at your address, it cannot be transferred, and there is no market for it. That's a feature. Access records that can move are access records that can be stolen, rented to sanctioned parties, or flash-loaned through a compliance check.

Then a product request landed: *let me buy a membership for a friend.* And its sibling: *let me resell the one I bought and don't want.* Both are completely reasonable — gift cards and secondary markets are table stakes for any paid product — and both are, on their face, impossible. A soulbound record keyed to an address has nothing to hand over. Making it transferable would torch the properties the platform depends on: sanctions screening happens when membership is granted, usage limits are tracked per address, and `WagerRegistry` trusts that the address holding a membership is the address that was screened.

The wrong fix is a "transfer with re-screening" function on the membership itself — a mutable access record with a moving owner, special-cased through every downstream read. The fix FairWins shipped in spec 026 is cleaner: don't make the membership transferable. Make the *right to claim one* transferable, and keep the two ideas in separate contracts with separate lifecycles.

## Two rails, one membership

The first thing to notice is what "soulbound" means here. A FairWins membership is not an NFT with transfers disabled — it is not a token at all. It's a plain storage record inside `MembershipManager` (a UUPS proxy, spec 027), keyed by `(address, role)`:

```solidity
// contracts/interfaces/IMembershipManager.sol
struct Membership {
    Tier    tier;        // None, Bronze, Silver, Gold, Platinum
    uint64  expiresAt;
    uint32  monthCount;  // rolling 30-day wager-creation counter
    uint32  activeCount; // concurrent open wagers
    uint64  monthAnchor;
}
```

There is no `transfer` to disable because there is nothing to transfer — non-transferability falls out of the data model rather than being enforced against it. (This is worth contrasting with the soulbound-token discourse around [EIP-5192](https://eips.ethereum.org/EIPS/eip-5192), which standardizes *locked* ERC-721s. EIP-5192 solves the problem of making a token non-transferable while keeping it wallet-visible. FairWins didn't need the token part at all: memberships are read by contracts, not displayed in wallets, so a mapping is simpler, cheaper, and has no transfer surface to audit.)

Direct purchase (`purchaseTier` / `purchaseTierWithTerms`) writes that record: sanctions screen the buyer, pull the tier's USDC price, set `tier` and `expiresAt`, reset the counters. Thirty days later it lapses.

Spec 026 adds a **second acquisition rail** that converges on the exact same record. `contracts/access/MembershipVoucher.sol` is a real, freely transferable ERC-721 — "FairWins Membership Voucher", symbol `FWMV` — minted for the tier's configured USDC price. The critical property is what a voucher *doesn't* do:

- It confers **no membership** while held. `hasActiveRole` on the holder stays false; no clock starts, no limits accrue.
- It never expires. A voucher is a bearer claim you can hold for a year and still redeem into a full 30-day membership.
- It snapshots its `(role, tier, durationDays)` at mint. If the admin later reprices or deactivates the tier, the voucher still grants exactly what it was minted for.

Because the voucher is inert, it is safe to trade. Gifting is a `transferFrom`. Reselling is any standard NFT marketplace — the contract advertises a best-effort [EIP-2981](https://eips.ethereum.org/EIPS/eip-2981) royalty to the treasury (2.5% default, hard-capped at 5% by `MAX_ROYALTY_BPS`; `setRoyaltyBps` reverts above it). Nothing about a transfer touches compliance, because nothing about a transfer grants access.

## Redemption: where the rails converge

The voucher becomes a membership through `redeemVoucher(uint256 voucherId, bytes32 acceptedTermsHash)` on `MembershipManager`. This is the single control point where everything a direct purchaser faces is imposed on the redeemer:

```solidity
// contracts/access/MembershipManager.sol — _redeemVoucher (abridged)
if (IMembershipVoucher(v).ownerOf(voucherId) != actor) revert NotVoucherOwner();
IMembershipVoucher.VoucherInfo memory info = IMembershipVoucher(v).voucherInfo(voucherId);

Membership storage m = _memberships[actor][info.role];
if (m.tier != Tier.None && m.expiresAt > block.timestamp) revert AlreadyActive();

_screen(actor); // sanctions screen — fail-closed, before effects

m.tier = info.tier;                    // grant the snapshotted (role, tier)
m.expiresAt = uint64(block.timestamp) + uint64(info.durationDays) * 1 days;
m.monthCount = 0;
m.monthAnchor = uint64(block.timestamp);
_recordTerms(actor, info.role, acceptedTermsHash);

IMembershipVoucher(v).burn(voucherId); // interaction LAST — reverts roll everything back
```

The ordering is strict checks-effects-interactions, and it carries the product's failure semantics: if the redeemer is sanctioned, or already has an active membership for the role, the whole call reverts and the voucher is **untouched** — still owned, still tradable. A legitimate buyer is never punished because a previous holder couldn't redeem. The burn is the only external call, performed last, against a contract the manager itself was wired to via `setVoucher`.

Note who gets screened: **only the redeemer, only at redemption.** Minters and secondary buyers are deliberately unscreened. That's an explicitly accepted tradeoff, recorded in the spec: a sanctioned party could profit from reselling a voucher without ever redeeming it. What they can never do is convert one into platform access, because the screen sits exactly where standing is granted — the same non-bypassable choke point the direct rail uses. Compliance lives at the point of *use*, not the point of *trade*.

After redemption, the two rails are indistinguishable. `WagerRegistry` reads the same `Membership` struct either way and has no idea how it was acquired — spec 026's FR-008 makes that a hard requirement, verified by running the full membership and wager suites against both rails.

## The economics are deliberately flat

A voucher costs exactly the tier's configured price — the same `TierConfig.priceUSDC` the direct rail charges — so neither rail is cheaper and there's no mint-vs-purchase arbitrage. Proceeds go to the treasury **at mint** (the voucher does `token.safeTransferFrom(msg.sender, treasury_, cfg.priceUSDC)` before `_safeMint`), which works because granting a membership at redemption costs the platform nothing on-chain; no escrow or solvency reserve is needed for outstanding vouchers. There is no primary refund: minter's remorse is resolved by reselling or redeeming. And the on-chain `tokenURI` — self-contained JSON plus SVG, no IPFS dependency — literally says "Utility access token, not an investment" in the token description.

Batch buying and direct gifting arrive via a third contract, `contracts/access/VoucherBatchMinter.sol`, because the voucher is immutable and only ever mints one token to `msg.sender`. The helper's `mintBatch(role, tier, quantity, recipient)` pulls exactly `quantity × price` in one approval, loops the mints (capped at `MAX_QUANTITY = 50`), and forwards every token to the recipient in the same transaction. It is stateless and custody-free — no funds or NFTs at rest, allowance reset to zero after the loop via `forceApprove`, no admin, no withdrawal path, no upgradeability. If it isn't deployed on a network, single self-mint still works and the UI degrades honestly.

## Privacy: pseudonymity, stated plainly

The voucher rail has a quiet second use. Because redemption only checks that the redeemer *owns* the voucher — never that they minted it — a holder can transfer a voucher to a fresh wallet and redeem there. The resulting membership record stores no back-reference to the mint or trade history, so wagering activity isn't on-chain-linked to the wallet that bought the voucher. The relayed twin `redeemVoucherWithSig` (spec 035's EIP-712 intent rail) goes further: since redemption moves no money, a relayer can submit it, so even the gas payer needn't be the trading wallet.

The spec is emphatic about not overselling this. Mints, transfers, and burns are public ERC-721 events; anyone can watch a voucher move. What fresh-wallet redemption provides is **pseudonymity, not cryptographic unlinkability**, and FR-020 requires the UI to say exactly that. Zero-knowledge redemption was considered and explicitly scoped out.

## Design decisions

**Mutable logic upgradeable, bearer asset immutable.** `MembershipManager` is a UUPS proxy — spec 026's redemption capability shipped as the first in-place, append-only upgrade of the spec 027 proxy (the `voucher` address slot consumed one `__gap` slot; `check:storage-layout` gates it in CI). The voucher is the opposite: intentionally *not* upgradeable, because a tradable bearer asset's rules must not change after purchase, and an immutable contract minimizes the attack surface on a USDC-taking token. Screening, Terms, and grant logic — the parts that must evolve — live behind the proxy; the thing people pay for is frozen.

**The membership is a mapping, not a locked NFT.** No transfer function to disable, no operator approvals to reason about, no EIP-5192 lock semantics to implement. The cost is wallet invisibility, which doesn't matter for a record only contracts read.

**Least privilege at the seam.** The manager never gets broad minting rights over vouchers, and the voucher never writes memberships. The voucher's `burn` accepts exactly two callers — the owner (or approved operator) and the `membershipManager` address — so redemption authority is scoped to the one action redemption needs (FR-025).

**Royalty as a hint, not a cage.** Enforced royalties would mean allowlisted operators or a platform marketplace, killing open composability and trade privacy. A flat 2.5% EIP-2981 hint with a contract-enforced 5% ceiling keeps the utility framing defensible and accepts that some marketplaces will ignore it — the platform earns reliably on the primary mint.

**Screening only where standing is granted.** One choke point, identical for both rails, fail-closed, with the documented residual that unredeemed vouchers trade unscreened.

The general pattern travels well: when you need a token to be both non-transferable (for compliance and integrity) and transferable (for gifting and resale), you don't need one token that does both badly. You need two artifacts — an inert, tradable *claim* and a soulbound *grant* — joined by a single, guarded redemption that burns one and writes the other.

## Sources

- `specs/026-membership-vouchers/spec.md` — voucher rail requirements, clarifications, accepted tradeoffs
- `specs/027-upgradeable-membership/` — UUPS migration of the membership authority
- `contracts/access/MembershipManager.sol` — `_purchaseTier`, `_redeemVoucher`, `redeemVoucherWithSig`, storage layout and `__gap`
- `contracts/access/MembershipVoucher.sol` — mint, snapshot, burn authorization, EIP-2981, on-chain `tokenURI`
- `contracts/access/VoucherBatchMinter.sol` — custody-free batch/gift helper
- `contracts/interfaces/IMembershipManager.sol` — `Membership`, `TierConfig`, `Tier`
- `docs/system-overview/roles-and-tiers.md` — tier table ($2/$8/$25/$100, 30-day terms) and role model
- [ERC-721: Non-Fungible Token Standard](https://eips.ethereum.org/EIPS/eip-721)
- [EIP-2981: NFT Royalty Standard](https://eips.ethereum.org/EIPS/eip-2981)
- [EIP-5192: Minimal Soulbound NFTs](https://eips.ethereum.org/EIPS/eip-5192)
- [OpenZeppelin Contracts — ERC721, ERC2981, AccessControl](https://docs.openzeppelin.com/contracts)
