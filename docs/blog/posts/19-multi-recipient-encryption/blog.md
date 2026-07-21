# One Locked Box, Several Keyholders: How a Private Wager Can Add a Referee

*How FairWins lets two players and a neutral referee each open the same encrypted agreement — without making a second copy for anyone*

| | |
|---|---|
| **Series** | Privacy Architecture (part 2 of 4) |
| **Part** | Follows [Envelope encryption for private prediction markets](../../private-prediction-markets-envelope-encryption.md) |
| **Audience** | Product, founders, and the crypto-curious |
| **Tags** | `encryption`, `privacy`, `plain-english` |
| **Reading time** | ~7 minutes |

> **Important note**: As in part 1, the private wagers described here are based on publicly available information and legitimate forecasting. Encryption protects competitive intelligence and trading strategy — not illegal activity. All participants remain fully subject to applicable laws and compliance obligations.

## The third-reader problem

In part 1, Sarah and Marcus made a 50,000 USDC private wager on a pharmaceutical merger. Their terms lived encrypted in public storage; the blockchain held only a reference. Exactly two people on Earth could read the agreement, and the smart contract guaranteed the money would settle correctly anyway.

That design had a quiet casualty: refereeing. Some bets settle themselves — "the merger closes before Q3" can be checked against a public prediction market. But "our team's redesign ships before yours" cannot. Those bets need a neutral human to read the terms and declare a winner. And here the two-reader setup fell apart. The referee could be named on the blockchain and given authority to call the result — but they couldn't read the agreement they were supposed to judge, or even find the wagers that named them. So the feature sat disabled. A referee who can't see the contract is worse than no referee.

The obvious fixes are all bad. Make a fresh encrypted copy for each reader, and you now have several copies that can quietly drift apart — a recipe for disputes, not a way to settle them. Share one password by email or chat, and you've reinvented the exact problem the system exists to avoid. Give the platform a master key, and you've thrown away the whole promise that no one but the players can read the bet.

The real fix needed no new cryptography. The design was already built to have multiple keyholders — it just wasn't using that capability. What changed was *who counts as a keyholder*, plus a tiny bookkeeping tweak so referees can find their cases. This post walks the mechanism that turned a redesign into a settings change.

## One locked box, one key per person

Think of the system as a locked box. Instead of scrambling the agreement separately for each person, it does something cleverer:

1. It picks a fresh, random key and locks the agreement **once**. This is the only copy of the content, sealed with modern authenticated encryption — the kind where tampering makes the box refuse to open rather than spilling out garbage.
2. Then, for each person allowed in, it locks *that key itself* inside a small personal envelope only that person's wallet can open.

The result is a single sealed box plus a bundle of personal envelopes — one per reader, each labeled with that reader's wallet address — all built on well-known, independently audited cryptography.

This is what makes multiple readers practical. The expensive part — locking the agreement — happens once no matter how many people you add; each extra reader costs one tiny envelope. And because everyone opens the *same* box, there's no question about which copy is the "real" one for a referee to argue over.

Opening it runs in reverse: find the envelope with your address on it, your wallet opens it to recover the shared key, and the key opens the box. Each person's path is independent — if one player's wallet is compromised, the attacker gets that player's envelope, not anyone else's.

## Where the personal envelopes come from

To lock the key for someone, you need their public "lockbox address" — the thing anyone can use to seal a message only they can open. But the person creating the wager may never have met the referee. So FairWins keeps a small public directory on the blockchain mapping each wallet to its current encryption key. Anyone can look up anyone's key; only you can set your own.

Users never manage these keys by hand. A regular wallet produces its encryption key by signing one fixed message and turning that signature into a key — same wallet, same key, every device. Passkey accounts (the same Face ID / fingerprint sign-in standard, WebAuthn, your phone already uses) derive the same kind of key from their own secure seed. Either way: nothing to write down, no key server to trust. The directory allows a range of key sizes, leaving room for a future-proof key type (below) without ever changing the contract.

## Making the referee a real reader

With multiple keyholders and a public key directory already in place, "let the referee read the wager" came down to one thing: add a third person to the list of keyholders when a wager names a referee. Two people for a normal bet, three with a referee — who then opens the agreement exactly like a player.

Three surrounding decisions carry the real design weight:

**Refuse to create a bet the referee can't read.** A wager can only be locked for someone whose encryption key is already in the directory. If the named referee has never registered a key, creation is *blocked* right away, naming who's missing. The alternative — quietly minting a wager whose own referee can never open it, discovered months later at settlement — is far worse than a little friction up front.

**Finding your cases is public bookkeeping, not guesswork.** Being able to open an agreement is useless if you don't know it exists. So when a wager names a referee, the blockchain quietly adds it to the referee's personal index, alongside the two players. Referees browse their caseload the same way players already do — one extra line in a ledger, no new machinery.

**The blockchain vouches for the sealed box.** The blockchain stores a fingerprint of the sealed agreement. Before trusting anything it fetches, a reader re-checks that fingerprint, so a swapped or corrupted box is *detected*, not shown as real. And if storage is temporarily unreachable, the app says so — the money never waits on the text being available.

One honesty point mirrors the platform's approach to fees: when a referee is a reader, the interface says so. Players should never believe a bet is strictly two-party-private when a third keyholder exists.

## Growing and shrinking the guest list

Because access is granted through those little envelopes, changing the guest list never touches the sealed agreement. Any existing reader — not just the creator — can open the shared key and seal a new envelope for a newcomer, with no blockchain transaction at all.

Removal is where the design is honest about its limits. You can strike someone's envelope from the bundle, but that doesn't un-tell them a key they already saw and might have saved. True revocation means re-locking under a brand-new key. FairWins documents this plainly rather than pretending removing a name equals taking back access. Locks grant access; they can't reach into someone's memory.

## The future-proof variant

Everything above also runs in a second mode built to resist a future threat: an attacker who records encrypted data today, hoping to crack it years from now once quantum computers mature ("harvest now, decrypt later"). This variant seals each envelope with a hybrid approach (an emerging standard called X-Wing) combining today's proven encryption with a new quantum-resistant method — if *either* holds, your data stays sealed. The envelopes get bigger; the sealed agreement and blockchain footprint don't change, and old and new bets coexist.

## Why it was built this way

- **Reuse the multiple-keyholder capability instead of inventing an "observer" role.** The referee simply *is* a third keyholder who also declares the winner — one more entry in a list that always supported many.
- **Block creation on a missing key rather than patch it later.** Failing loudly at creation beats failing silently at settlement, at the cost of a little friction: a referee registers a key before being named.
- **No pretend revocation.** Removing a reader without re-locking is documented as *not* true revocation. Correct-but-limited, stated openly, beats a guarantee the math can't back.

The through-line so far: part 1 encrypted one agreement for two rival readers; part 2 shows the same locked box stretching to whatever readers a wager's life requires. Part 3 turns the same machinery inward — syncing your own private data across your own devices.

## Further reading

- [ChaCha20-Poly1305 authenticated encryption (RFC 8439)](https://datatracker.ietf.org/doc/html/rfc8439) — the "tampering makes it refuse to open" property
- [X25519 key exchange (RFC 7748)](https://datatracker.ietf.org/doc/html/rfc7748) — how two parties agree on a shared key
- [HKDF key derivation (RFC 5869)](https://datatracker.ietf.org/doc/html/rfc5869)
- [WebAuthn / passkeys](https://www.w3.org/TR/webauthn-2/) — the Face ID / fingerprint sign-in standard
- [The X-Wing hybrid post-quantum scheme](https://datatracker.ietf.org/doc/draft-connolly-cfrg-xwing-kem/)
- [The Noble cryptography libraries](https://paulmillr.com/noble/) — the audited building blocks used here
