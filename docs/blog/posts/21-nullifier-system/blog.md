# The Blocklist That Never Shipped: Voiding Bad Markets Without Publishing a Wall of Shame

*A design-history piece: what FairWins built to revoke bad markets without posting a public blacklist — a compact cryptographic membership check — and the honest reasons it was shelved*

| | |
|---|---|
| **Series** | Privacy Architecture (part 4) |
| **Audience** | Product, founders, and the crypto-curious |
| **Tags** | `privacy`, `moderation`, `design-history`, `plain-english` |
| **Reading time** | ~7 minutes |

---

> This post describes a design that was explored and then shelved. It is a moderation idea, not a way to evade law or sanctions screening. Everything live on FairWins today runs the platform's real compliance checks, and all participants remain subject to applicable law.

## A word with two meanings

"Nullifier" is a loaded term. In privacy tech — coin mixers and anonymous-signaling systems — a nullifier is a one-time value you reveal to prove you haven't already spent something or already voted, all without revealing *who* you are. It's the anti-double-use safeguard behind an otherwise anonymous action. You never learn *who*; you only learn *again* — and you reject the "again."

The FairWins design explored here borrowed that word for a different, older meaning: *to nullify* as in *to void, to cancel*. It was a moderation tool — a way for a platform admin to void a scam market or block a repeat bad actor, so the app would stop showing it and, optionally, the smart contracts would refuse to deal with it. Worth being blunt: it is not the anonymous-spend kind of nullifier, and it never reached a live network. This is a design-history piece.

What makes it interesting anyway is the *shape* of the problem. A blocklist is a set of things. You want to answer one question about that set — "is this thing blocked?" — and its harder twin, "prove this thing is *not* blocked." That second question is exactly what a certain family of cryptography is unusually good at — the same family the privacy-tech world reaches for. So the design reached for it too.

## The problem: revoking without publishing

Picture moderating an open, permissionless-feeling marketplace. An admin finds a market built to defraud people, or an address that keeps spinning up abusive markets. They want it gone from the interface — and for high-value actions, they want the contract itself to refuse to touch it.

The obvious way to do this is a simple on/off list stored on the blockchain: this address is blocked, that one isn't. For small lists, that's genuinely fine. But it has two properties the designers disliked. First, a blocklist on a public blockchain is fully readable — anyone can pull up every entry, turning a moderation list into a published "wall of shame" that broadcasts the platform's threat model. Second, its storage and cost grow with every entry.

So the design set a more ambitious goal: check whether something is blocked, and even *prove* that something is *not* blocked, without ever publishing the list itself.

## The idea: shrink the whole list into one small value

Here's the everyday-analogy version. Imagine every blocked item gets its own unique padlock, and you build a single master seal by threading all those padlocks together into one compact object. That one object stands in for the entire blocklist — whether the list has one entry or a million, the object on the blockchain stays the same tiny size.

The clever part is what you can do with that seal. Given it, someone can produce a short "certificate of innocence" for a specific market — a small proof that this market's padlock was *never* threaded into the seal. And critically, that certificate reveals nothing about what *else* is on the list. You learn "this one is clean," and nothing more.

That's the mirror image of the privacy-tech nullifier. Here the platform proves: "this market is *not* in the blocklist, here's a compact proof, and the proof tells you nothing about the rest of the list."

Under the hood this used a well-known cryptographic accumulator — a construction from the academic literature designed for exactly this "compress a set into one value, then prove membership or non-membership" job. The app could carry a cached copy of the seal and check a market on the spot, and a sensitive on-chain action could demand a proof instead of trusting a simple list lookup.

## Two modes, one design

The design actually offered two ways to run, sharing one structure.

**The simple mode** was the boring, working half: a plain on/off list with an audit trail. An admin marks a market or address as void with a human-readable reason; the change is timestamped, the admin recorded, the reason logged. Batch versions were capped at a fixed size so nobody could jam the system with an enormous request. This mode ships zero fancy cryptography and gives you an obvious paper trail — but the list is public, exactly the downside above.

**The compact mode** was the privacy upgrade: the single-seal, prove-it's-not-blocked machinery just described, layered on the same structure. The guidance was to use simple mode for small lists and reach for the compact one only when the list got large or hiding it actually mattered.

## The catch: enforcement, and a ceremony that never happened

Two parts of the platform were wired to *enforce* a block on-chain: a legacy market-creation path that could refuse a blocked address, and a treasury component that could refuse to pay out to a blocked recipient. But both hid that enforcement behind a switch that defaulted to **off**. Left alone, the system degraded to "the app hides bad markets, the contracts don't care." That was a safety choice — a bug or a stolen admin key couldn't freeze trading unless someone had flipped the switch — but it also meant "voided" meant nothing on-chain until someone did.

The bigger catch was the compact mode's foundation. That scheme depends on a **trusted setup**: some secret numbers must be generated to bootstrap the system and then *destroyed*. If anyone keeps them, they can forge proofs in both directions — mark a real scam market as clean, or frame a legitimate one as blocked. This is a well-known caveat for this family of cryptography, the same class of setup risk many privacy systems carry. The design called for a careful, verifiable ceremony to generate and destroy those secrets safely. That ceremony was never run.

## Why it was shelved

Search the live codebase and there's no blocklist system in it. No live network runs one. The whole thing sits in a reference-only archive — kept for study, never deployed. The app hooks that once talked to it now simply do nothing when no such system answers.

The honest read is that FairWins pivoted. Instead of an admin-run market blocklist with its own bespoke cryptography and an unperformed ceremony, the platform shipped compliance checks that are actually wired into the money path: a shared sanctions check run against real wallet addresses across wagers and pools, plus role-based gating of who can participate. Those solve the real "keep bad actors out" problem without the ceremony risk and without a custom accumulator to maintain.

## What's worth keeping from it

So if you came looking for a mixer-style anonymous-spend nullifier, the accurate answer is: this was a *nullification* registry — a voiding tool — not a nullifier in the privacy-tech sense, and it was shelved before launch.

What survives is a clean case study in a genuinely useful idea: you can compress an entire blocklist into a single small value and then prove a specific item *isn't* on it, without ever revealing the rest. That's a real capability with real trade-offs — a trusted-setup ceremony you have to actually perform, enforcement that's meaningless until switched on, and moderation that ultimately rested on a single admin role rather than governance. The value of studying it is precisely that the cryptography is real and the limits are printed on the label.

The lesson for builders is familiar: reach for exotic cryptography only when the problem truly needs it. A plain list was simpler, honest, and — for the sizes that actually mattered — good enough. When FairWins needed real enforcement, it chose primitives already proven on the value path over a beautiful mechanism that still owed the world a ceremony.

## Further reading

- [The Semaphore protocol](https://semaphore.pse.dev/) — the anonymous-signaling sense of "nullifier"
- [Camenisch & Lysyanskaya, *Dynamic Accumulators* (2002)](https://link.springer.com/chapter/10.1007/3-540-45708-9_5) — the foundational paper on cryptographic accumulators
- [Boneh, Bünz & Fisch, *Batching Techniques for Accumulators* (2018)](https://eprint.iacr.org/2018/1188) — modern non-membership proofs
- [Trusted setup ceremonies, explained](https://en.wikipedia.org/wiki/Trusted_setup) — why generating-and-destroying secrets is the recurring risk
