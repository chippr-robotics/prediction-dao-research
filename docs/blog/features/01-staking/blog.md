# Put Your Idle Crypto to Work: Staking Comes to FairWins

*Earn staking rewards on ETH and POL, right from your wallet — with the same honest, self-custodial design you already trust for wagers.*

---

Most of the crypto sitting in a wallet is doing nothing. It waits. Staking changes that: you put an asset to work securing a network, and the network pays you for it. Until now, doing that meant leaving FairWins for a maze of unfamiliar apps, wrapped tokens, and fine print.

Not anymore. Staking is now live under **Finance → Earn → Staking**. Pick an asset, see exactly what you'll earn and what you'll pay, sign once, and you're staked — without ever handing your funds to us.

## Two ways to stake

We launched with the two staking styles that cover the most ground, each surfaced as its own clearly-labeled option in the Stake list.

**Liquid staking** keeps you flexible. You stake ETH with **Lido** and receive **wstETH**, or stake POL with **Polygon's sPOL** and receive **sPOL**. These liquid staking tokens quietly grow in value as rewards accrue — and because they're ordinary tokens in your wallet, you can hold them, move them, or swap back to the underlying asset whenever you like. No lock-up to think about for the token itself.

**Delegated staking** goes straight to the source. You delegate POL to a **curated Polygon validator** and earn the validator's rewards directly. We maintain a hand-picked allowlist of reputable, healthy validators — filtered for strong uptime, sensible commission, and a named operator — so you're choosing from a short, vetted list rather than a sea of unknowns. Delegated positions have an unbonding wait when you exit, and we tell you that up front, every time.

## Honesty is the whole point

FairWins has one rule that shapes every screen: **never imply something the chain hasn't actually done.** Staking is no exception.

- **You see the real numbers before you sign.** Estimated APR, the asset you'll receive, and — where one applies — the platform fee as its own line item with the exact amount that will actually be staked. No surprises after the fact.
- **You can always get your funds back.** Unstaking, withdrawing, and claiming rewards are always available. Nothing we do can trap your position.
- **Unbonding and slashing are stated plainly.** Delegated staking carries an unbonding period and, like all delegation, a slashing risk. We put both in front of you rather than burying them.
- **When something isn't available, we say so.** If a network's staking is temporarily unavailable, you'll see an honest "not available right now" state — never a broken screen or a guessed rate.

And it's **non-custodial** from end to end. You stake from your own wallet, straight to the provider. FairWins never takes custody of your assets between transactions — a stake either completes atomically or reverts and leaves you exactly where you started.

## A transparent platform fee that funds the commons

Running a trustworthy financial surface costs something, and we'd rather be honest about how it's funded than hide it. Liquid staking now carries a small **platform fee** that flows to the FairWins treasury — the shared pot that keeps the lights on and the platform improving.

Here's how we've kept it fair:

- **It's disclosed before you sign, always** — a clear line showing the rate and the net amount you'll stake. You are **never charged more than the rate you were shown.**
- **It applies only to liquid staking.** Delegated staking is **fee-free**. (This isn't arbitrary: a delegation is bound to your wallet by design, and routing it through a fee layer would have meant taking custody — which we won't do. So we charge only where we can do it cleanly and atomically.)
- **When the rate is zero, there's no fee line at all** — the experience is byte-for-byte identical to fee-free staking.

The fee lives in the same single, on-chain fee configuration every other FairWins service uses. One source of truth, publicly visible, no hidden second ledger.

## Built to be governed — and to be stopped

Behind the friendly Stake button is a new on-chain **control surface** that makes staking safe to operate at scale.

If a provider is ever compromised, a validator misbehaves, or a contract address comes into question, an authorized responder can **pause new staking on that network instantly** — no app update, no waiting. Within moments, the Stake area stops offering new positions and shows an honest paused state. Crucially, **a pause never touches your exits**: unstake, withdraw, and claim keep working the entire time, because those paths never route through our contracts.

Every operator action — pausing, resuming, updating a provider address, curating the validator list — is recorded on-chain as an auditable history of who changed what and when. And these controls are held by a **multisig**, so no single key can move them. It's the kind of plumbing you shouldn't have to think about, precisely because we did.

## Woven into the app you already use

Staking isn't a bolt-on. It's wired into the surfaces you rely on:

- **Portfolio bottom sheets** surface your staked positions and let you act on them in place.
- **Notifications** keep you posted on the moments that matter.
- **Your activity log** records every stake, unstake, and claim as part of your unified history.
- **Passkey and classic wallets both just work** — a passkey stakes in a single confirmation that covers the whole action, spending permission included.

## Get started

1. Open **Finance → Earn → Staking**.
2. Pick an option — Lido (ETH), sPOL (POL), or a curated Polygon validator (POL).
3. Review the terms: estimated APR, what you'll receive, the unbonding wait if any, and the fee line if one applies.
4. Enter an amount and confirm. You're staked.

Your crypto has been sitting still long enough. Put it to work — on your terms, in your custody, with every number on the table.

*Staking involves risk, including validator slashing and provider-protocol risk, and rewards are variable and not guaranteed. Availability depends on the network. Always review the terms shown before you stake.*
