# Sponsored Gas Without a Vendor: How "No Network Fee" Became True

*How FairWins made "no network fee" an honest promise — by quietly covering the fee itself, using infrastructure it already ran*

| | |
|---|---|
| **Series** | Accounts & Keys (part 3) |
| **Audience** | Product folks, founders, and developers curious how gasless apps work |
| **Tags** | `gasless`, `sponsored-gas`, `wallets`, `self-custody`, `onboarding` |
| **Reading time** | ~7 minutes |

## The lie in the confirm screen

A member creates a FairWins passkey account, receives 40 USDC from a friend, and tries to send 10 of it onward. The confirm screen says "Gasless · sponsored — no network fee." They tap confirm with their fingerprint. The transfer fails.

Here's why. Every blockchain transaction costs a small network fee, paid in the chain's own native token — not in the stablecoin the member actually holds. This account had 40 USDC and zero native token, so there was nothing to pay the fee with, and the transaction was rejected. It's worse on a member's very first action, which also has to pay to deploy their account on-chain — so during a busy period even an account holding *some* native token could come up short.

In other words, the product had promised "sponsored" before the machinery to sponsor anything existed. That broke a standing FairWins principle: the interface must never claim something that isn't true. There were two ways to fix it — change the words, or make them true. FairWins chose to make them true, with one firm constraint: no third-party sponsorship service. The company already ran the plumbing that submits these gasless transactions and the gateway that screens them, so sponsorship had to be built from those parts.

This post walks through what that took: a deliberately tiny "paymaster" contract, an approval service bolted onto the gateway FairWins already ran, a securely held signing key, and — because nobody may ever be stranded — a fallback that keeps every member able to act even when sponsorship is down.

## What sponsoring a fee actually means

The smart-account standard these wallets use lets a transaction name a **paymaster**: a contract that tells the network, "I'll cover the fee for this one." The network then charges the fee to the paymaster's pre-funded balance instead of the user's. The entire design question is *how the paymaster decides which transactions to pay for.*

A *verifying* paymaster answers that with a signature. An off-chain service looks at each transaction and, if it approves, signs a stamp of approval tied to that exact transaction. The contract's only on-chain job is to check the stamp is genuine — signed by the one authorized signer — and, if so, cover the fee.

The FairWins paymaster is intentionally minimal: its approval stamp is bound to the specific transaction — its sender, its exact contents, the fee ceiling, the network, the paymaster's own address, and a short expiry window. Because the stamp is nailed to all of that, an approval can't be reused on a different transaction, on a different network, or after it expires. And it needs no memory of past transactions: the account's own built-in transaction counter already makes each one single-use. A contract that checks a signature and stores no state is the simplest and safest kind, and stays portable to other networks later.

The economics are just as simple. The paymaster holds a pre-funded deposit with the network, and that deposit *is* both the sponsorship pool and the hard cap on how much can ever be lost. When the network runs a sponsored transaction, it draws the fee from that deposit — FairWins paying its own gas back, one transaction at a time, all accounted for on-chain.

## The decision half: an approval service on the gateway FairWins already ran

The approval signature has to come from somewhere, and *where* is the real policy decision. There's an open standard for exactly this handshake — how a wallet asks a sponsorship service for approval — with two steps: a dummy approval so the wallet can estimate the transaction size, then the real, signed one. Because the FairWins frontend already builds transactions with standard tooling, adopting it made the client-side work nearly free.

Rather than stand up a whole new service, FairWins added a sponsorship route to the gateway that already fronts its other gasless features. That gateway already had the three controls sponsorship needs, and the new route reuses them instead of reinventing them:

1. **A kill switch** — one setting halts all sponsorship instantly; clients quietly fall back to paying their own fee.
2. **Sanctions screening** — the account is checked against sanctions lists, and it fails closed: if it can't be screened, it isn't sponsored.
3. **Quotas** — per-account and platform-wide rate limits, so no one account and no single day can drain the pool.

Two extra ceilings are new, because sponsorship spends real money on every transaction: a sanity limit on transaction size and a worst-case cost cap, so a single deliberately expensive transaction can't burn a big slice of the deposit. Every refusal happens *before* anything is signed, so a rejected request costs the operator nothing.

That signature comes from a securely managed cloud key service — the gateway never holds the raw signing key. Critically, the gateway **refuses to start** if its signing key doesn't match the signer the on-chain contract expects. A mismatch that would otherwise silently break every sponsorship instead fails loudly at deploy time, where someone will notice.

One discipline is worth calling out: the "stamp" being signed is computed in two separate codebases — the contract and the gateway — and they must produce byte-for-byte identical results, or every sponsored transaction fails. A cross-check test deploys the real contract and asserts the two agree.

## Never stranded, never dishonest

Sponsorship is a nice-to-have, and the platform rule is that a nice-to-have must never strand a member. So the app treats *every* failure to get sponsorship — service down, kill switch on, quota hit, screening refusal, network blip — identically: rebuild the transaction to pay its own fee and quietly retry once.

There's a subtle trap the code is careful about. If a transaction would fail on its own merits — say, sending more than the account holds — that's not a sponsorship failure and must not be silently retried, because the retry would fail identically and hide the real reason. So the fallback only kicks in for genuine sponsorship or network failures.

The disclosure follows the same honesty rule that created this feature. The system tracks a single fact: was this transaction actually sponsored? The confirm screen renders straight from it — "Gasless — no network fee" when true, "You pay the network fee" when false, including the exact shortfall when the account can't cover it. The rule that the words must match reality is built into the mechanism, not left to good intentions.

## Why we built it this way

**Sponsor the fee, don't charge it in stablecoin.** An alternative was a paymaster that quietly takes a little USDC to cover the fee — but that needs price feeds, extra accounting, and an approval step, all for an outcome where the member still pays. Sponsoring is the smallest pattern and the only one that makes "no network fee" literally true.

**Self-hosted, eyes open.** Refusing outside vendors costs real work — key management, quota design, watching the runway — and buys independence: no vendor lock-in, no per-transaction markup, and every policy decision enforced in FairWins' own gateway.

**A small, bounded blast radius.** If the approval-signing key were ever stolen, the thief could approve sponsorships — wasting the deposit on other people's fees — but *could not withdraw a cent*: withdrawal is restricted to a separate owner key kept in offline, air-gapped storage. The worst case is capped at the deposit, throttled by quotas, cut off by the kill switch, and cleaned up by rotating to a new signer. Keeping the deposit deliberately small keeps that worst case small by policy, not by hope.

**Open to everyone.** Sponsorship isn't reserved for higher membership tiers. Any passkey account that passes screening and stays within quota qualifies — spend is bounded by the ceilings, the pool, and the kill switch, not by narrowing who benefits.

The result: when the confirm screen says "no network fee," it's telling the truth — the app quietly covered it — and when it can't, it says so plainly.

## Further reading

- The ERC-4337 account-abstraction standard (smart-contract wallets): <https://eips.ethereum.org/EIPS/eip-4337>
- ERC-7677, the paymaster / sponsorship web-service standard: <https://eips.ethereum.org/EIPS/eip-7677>
- What "gas" is, in plain terms (ethereum.org): <https://ethereum.org/en/developers/docs/gas/>
