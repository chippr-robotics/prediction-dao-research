# Callsigns: A Human-Readable Name That Nothing Depends On

*How FairWins built an optional, ENS-style handle for members — and deliberately made sure you can send, receive, and settle every wager without ever using one.*

| | |
|---|---|
| **Series** | FairWins Engineering |
| **Audience** | Product teams, founders, and the crypto-curious — no Solidity required |
| **Tags** | `naming`, `identity`, `usability`, `plain-english` |
| **Reading time** | ~7 minutes |

---

## The forty-two-character problem

Maya wants to invite her friend Dev to a wager on Sunday's match. The invite form asks for a wallet address. Dev's address is `0x7f3a…` — forty-two characters of hex that Maya has to dig out of a chat thread, paste, and then squint at, because one wrong character sends the invite, and eventually the stake, to a stranger.

Every crypto product hits this wall. The best-known answer is ENS, the Ethereum Name Service — register a name like `dev.eth` and type that instead of the hex. But ENS lives on Ethereum's main network, and FairWins runs its wagers elsewhere. More importantly, FairWins already has its own notion of identity that ENS knows nothing about: an on-chain membership system with tiers, sanctions screening, and role-based access. A name that resolves to "some wallet, somewhere" is less useful than a name that resolves to "a screened member of this platform."

So FairWins built its own: a **callsign**. A member can optionally claim a handle like `%chipprbots`, and it resolves to their wallet everywhere the app asks you to enter or display an address.

The interesting part isn't that we built a naming system. It's the two disciplines wrapped around it. It borrows the hardest-won safety mechanism from ENS while deliberately refusing ENS's most dangerous flexibility — and, the part to remember, **the whole thing is engineered so that nothing of value ever depends on it.** You can create, accept, and settle every wager you'll ever make without ever registering or using a callsign. That is not a marketing line; it is a property the test suite actively verifies.

## Optional, and we mean it

Start here, because it shapes everything else. **A callsign is a perk, never a requirement.** No wager, no pool, no transfer, and no payout ever checks the naming system as a precondition. Money moves on wallet addresses, full stop.

This isn't left to good intentions. The automated tests include an account with no callsign at all, below the tier that could even register one, completing a full wager from start to finish. The naming system can be switched off on a given network, be unreachable, or be paused entirely, and every dollar-moving flow works exactly the same. If callsigns vanished tomorrow, every wager would still settle — some screens would just show hex again.

Because it never touches the money, the naming system is deliberately kept off to the side. It holds no funds and has no ability to move anyone's money. Its worst-case failure is cosmetic: a name doesn't show up, and you see a raw address instead. That containment is the whole design philosophy in one sentence.

## A name format chosen for safety, not flair

A callsign is 3 to 20 characters: lowercase letters, digits, and single interior hyphens. No uppercase, no spaces, no emoji, no accented or non-Latin characters.

That last restriction is doing serious security work. ENS supports the full range of Unicode characters, and in doing so inherits an entire category of impersonation attack: homoglyphs — characters that look identical but aren't, like a Cyrillic "а" standing in for a Latin "a." A scammer can register a name that looks pixel-for-pixel like a trusted one. FairWins simply removes the possibility: if the only characters you can register are plain lowercase letters, digits, and hyphens, there is no look-alike to defend against. Less expressive, categorically safer. Names that differ only in capitalization collapse to the same handle, so there's no trickery there either.

## Claiming a name without getting sniped

Naming systems have a classic front-running problem. You broadcast "register `chipprbots`," a bot watching the network sees it, and it registers the name one step ahead of you. ENS solved this years ago with a two-step "commit then reveal" dance, and FairWins uses the same idea:

1. First you quietly commit — you publish a scrambled fingerprint of the name you want, which reveals nothing to onlookers.
2. You wait a short mandatory period (about a minute).
3. Then you reveal and register. By the time your desired name is visible, your claim to it is already locked in, and a sniper's own commitment can't possibly be old enough to jump the queue.

The FairWins version also closes a subtler hole. That committed fingerprint is public. In a naive design, an attacker could keep re-submitting *your* fingerprint every few blocks, forever resetting its clock so your reveal never becomes eligible — a way to grief you out of your own name. The registry refuses to reset a commitment that's still pending, which quietly defeats that attack. It was one of two issues caught and hardened during the security review.

## One name, one address — on purpose

Here's the design choice that most sharply distinguishes callsigns from ENS. ENS separates who *owns* a name from what the name *points at*, and lets the owner freely repoint it. That flexibility is also a fraud vector: point the name at a new address and every future payment aimed at that name silently goes somewhere else.

A callsign points at exactly one address, and moving it is treated as a rare, deliberate migration. When you request to move a callsign to a new wallet, the name enters a visible "address changing" state, refuses to resolve for any payment during that window, and only completes after a built-in delay of about two days. If someone hijacked your session and tried to redirect your name, you get two days of visible warning to cancel it. And repointing is genuinely rare to begin with, because FairWins' smart-account wallets keep the same address even when you recover access with a new credential.

A few more touches serve the same goal: a name that once routed payments can never silently start routing them elsewhere. A released or changed name goes into a long quarantine during which *nobody* — not even its former owner — can re-register it, so a stranger can't capture payments aimed at the old name. And moderators can reserve obvious names (brand terms, `admin`, `support`) or suspend a name — but crucially, **no one, not even the platform operator, can ever reassign a callsign to a different wallet.** Suspension can stop a name from resolving; it can never move it or touch funds.

## How the app uses a name — carefully

When you look up a callsign, the match is exact — no "did you mean," no fuzzy matching, because a near-match on an address field is a payment-misdirection bug waiting to happen. And a name only displays if it currently points back at the address showing it; a suspended or mid-move name simply disappears rather than telling you a stale story.

Callsigns also slot politely into a chain of name sources rather than taking over. When the app shows who's on the other side of a wager, it prefers, in order: your own private nickname for that address, then their callsign, then an ENS name, and finally a friendly auto-generated two-word label so no card ever shows raw hex or a spinner. Every step fails softly — if the naming system is off on your network or a lookup times out, the app falls through to the next option. When you type a `%callsign` into an address field, it resolves it and shows you the full address plus whether the name is verified, so you can confirm before anything is committed.

## Why we built it this way

- **In-house instead of leaning on ENS.** We needed membership gating, sanctions screening, moderation, and presence on the networks we actually run on — none of which ENS offers here. ENS still participates, as one option in the display chain.
- **A plain ASCII name format instead of full Unicode.** Less expressive, but it *eliminates* the look-alike impersonation attack rather than trying to mitigate it.
- **One name, one address.** Splitting a name's owner from its target invites redirect fraud; keeping them fused makes the common case safe and the rare migration deliberate.
- **A perk, not a primitive.** Making callsigns an optional membership benefit — and actively testing that wagers work without one — keeps a nice-to-have from ever hardening into a load-bearing requirement.

The result is a naming system with the registration safety of the best in the ecosystem, a narrower and safer way of pointing names at addresses, and a blast radius engineered down to zero. It makes the product friendlier. It is not allowed to make the product more fragile.

## Further reading

- [ENS (Ethereum Name Service)](https://docs.ens.domains/) and its commit–reveal registration, the model this borrows from
- [ENS name normalization (ENSIP-15)](https://docs.ens.domains/ensip/15), the standard that wrestles with the Unicode look-alike problem we sidestep
- A general explainer on [homoglyph / look-alike attacks](https://en.wikipedia.org/wiki/IDN_homograph_attack)
- The broader FairWins developer documentation for how identity and address entry fit together
