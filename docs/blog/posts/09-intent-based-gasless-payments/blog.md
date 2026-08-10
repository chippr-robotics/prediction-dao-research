# One Signature, Zero Gas: How Gasless Payments Actually Work

*How FairWins turned every action into a signed "intent" — you sign what you want, and someone else pays the fee to submit it*

---

| | |
|---|---|
| **Series** | Gasless Rails (part 1 of 2) |
| **Part** | 9 of 34 |
| **Audience** | Founders, product managers, and the crypto-curious |
| **Tags** | `gasless`, `payments`, `user-experience`, `stablecoins` |
| **Reading time** | ~7 minutes |

---

## The Stranded User

A user wins a wager on FairWins. Fifty USDC sits in escrow with their address recorded as the winner. All they have to do is claim it. One problem: their wallet holds exactly zero of Polygon's native coin — the token every transaction needs to pay its network fee, its "gas." They funded their wallet with USDC from an exchange, never touched the native token, and have no intention of learning what a gas station is. Their money is on-chain, provably theirs, and completely out of reach.

The old flow was worse than one stuck action. Just creating a wager took *two* transactions: a step to authorize the platform to move your stablecoin, then the step that actually creates the wager. Accepting one meant the same dance. Every step needed native gas, and the failure mode was plain: a user who holds only the stablecoin can't act at all.

The cruelest version is lopsided — a user who scraped together enough gas to *place* a bet but can't afford the gas to *claim* their winnings. Money in, no money out. Any gasless design that fixes deposits but not withdrawals has built a lobster trap.

The fix is to make the entire platform run on **signed intents**. Instead of sending a transaction and paying the fee, the user signs a message — for free, no gas — describing exactly what they want to do. Anyone can then carry that signed message onto the blockchain and pay the fee to submit it. Crucially, the on-chain effect is always credited to the person who *signed* it, never to whoever submitted it. One signature replaces the whole authorize-then-act dance, and a helper service — a "relayer" — pays the fee.

## What an Intent Actually Is

An intent is a structured, human-readable message the user signs with their wallet, built on **EIP-712** — a widely used standard for signable data a wallet can display in plain terms, so you see the actual stake, deadline, and counterparty, not a wall of hex. Every action on the platform has its own intent: create a wager, accept one, claim a payout, declare a draw, buy a membership tier, and so on.

Each intent locks down three things:

1. **Who is acting** — a named field that must match whoever actually signed. You can't sign on someone else's behalf.
2. **Every detail of the action** — stake amounts, deadlines, which wager. Nothing is left blank for the submitter to fill in later.
3. **A replay guard and an expiry** — a random one-time code so the same intent can't be reused, plus a window so a stale intent eventually expires.

Signatures are checked under a fingerprint unique to each contract *and* each network, so a signed intent is valid on exactly one contract on exactly one blockchain — a one-time code used up on one contract can never be replayed on another. The check also accepts signatures from smart-contract wallets, so FairWins' passkey wallets can sign intents too. A failed intent never uses up its one-time code; a successful one can never run twice.

## Paying With a Signature, Not a Gas Balance

Signing an action is the easy half. The hard half is *money-in* actions. The intent says "stake 50 USDC" — but the platform still has to pull 50 USDC out of the wallet, which normally needs a separate, gas-paying authorization first.

This is what **EIP-3009** is for — a feature built into Circle's USDC that lets a holder authorize a specific payment purely by signing. The user signs an authorization naming who gets paid, how much, and a validity window; the receiving contract presents that signature to the USDC token, and the transfer happens. No standing "allowance" ever exists, and no separate transaction is needed.

So a money-in intent carries *two* signatures: the FairWins intent ("accept wager 41") and the USDC payment authorization ("pay 50 USDC"). Which raises the attack that shapes the whole design: **what stops the submitter from mixing and matching?** Could they staple your payment authorization to a different action, or pair your accept-intent with a payment meant for something else?

They can't, because the two signatures are cryptographically stapled together. The intent you sign references the exact payment it's meant to travel with, and the contract refuses to proceed unless the payment matches — same amount, same one-time code — the one you committed to. The USDC token adds the final lock: the payment can only land in the contract that's asking. The net result: a submitter can *refuse* to carry your intent, but can never substitute, redirect, or resize the payment.

## Two Twins, Identical Rules

Every gasless action is a *twin* of an ordinary one. Accepting a wager the normal way and accepting it via a signed intent run **the exact same checks against the person acting** — sanctions screening, membership gating, ownership, account freezes. The only difference is *how* the acting identity is established: from the sender on the direct path, from the recovered signature on the intent path. The submitter's own standing is never consulted, and because both twins run the same underlying action, they can't quietly drift apart.

## Keeping Three Codebases in Perfect Sync

Here's the lesson most write-ups skip. The exact shape of each intent has to be defined in *three* separate places: the smart contract that verifies it, the app that helps the user sign it, and the relayer service that handles it.

These three definitions must be **byte-identical** — not just similar in spirit. The signing standard fingerprints the *entire* structure, so a single reordered field, or a field's type written slightly differently, produces a completely different fingerprint and a signature that verifies to a random, wrong address. The failure is silent when you build it and total when a real user tries: every signature rejected, every time.

The discipline FairWins landed on treats the deployed contract as authoritative, and every other copy documents exactly where it matches. New intents ship in all three places at once, with cross-references so no one edits one and forgets the others. It's unglamorous bookkeeping, and it's the entire difference between a working gasless system and a flood of mysterious support tickets.

## Never Stranded

The final rule is architectural humility: the relayer is *optional*, and the design has to survive without it. Every gasless flow keeps a **pay-your-own-gas fallback** — the original path is never removed. The app enforces this at the wiring level: a screen literally can't ship a gasless-only dead end, because the code refuses to build one. If the relayer is switched off, overloaded, rate-limiting, or timing out, the app quietly falls back to the user paying their own gas, and the on-chain result is identical.

The fallback also covers networks where the signature-based payment simply doesn't exist — one test network's stablecoin lacks it entirely, so the app detects the gap *before* opening the signing prompt and uses the normal path. And status is honest end to end: the interface never shows "confirmed" before a transaction is actually mined. Signed, pending, confirmed, expired, and failed are all distinct, truthful states.

## Design Decisions

**Random one-time codes, not a counter.** Each intent's replay guard is a random value, usable in any order. A counter would force a user's actions into strict sequence and let one stuck intent block everything behind it; random codes let someone sign three intents and have them land in any order. Cancellation is precise — a user can kill one specific unsubmitted intent, and even that can be gasless.

**Sign everything, trust nothing.** Every detail the action uses is inside the signed message. The alternative — signing a compact code that stands for details delivered separately — is fewer bytes but shows the user nothing legible to approve. Human-readable signed data means the wallet displays the real stake, deadline, and counterparty.

**Fee recovery is bounded and segregated.** An optional second payment authorization lets the platform recover its gas cost in USDC, but it's capped on-chain, settles in the same transaction as the action, and pays into a segregated account — never the relayer's own wallet. A compromised relayer gains no power to skim fees.

**Censorship is the accepted residual risk.** A relayer can decline to submit an intent; it cannot forge, alter, or replay one. And because the pay-your-own-gas path always exists, refusal degrades to mere inconvenience. That trade — accept the possibility of censorship, eliminate any custody of user funds — is the entire design in one sentence.

---

> **Note**: FairWins wagers are peer-to-peer agreements based on publicly available information and legitimate forecasting. Gasless submission changes who pays the transaction fee, not who is accountable: every intent is credited to its signer, who remains fully subject to applicable law and the platform's compliance screening.

## Further reading

- EIP-712, the standard for human-readable signable data — https://eips.ethereum.org/EIPS/eip-712
- EIP-3009, "transfer with authorization," the pay-by-signature feature in USDC — https://eips.ethereum.org/EIPS/eip-3009
- ERC-1271, how smart-contract wallets prove a signature — https://eips.ethereum.org/EIPS/eip-1271
