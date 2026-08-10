# Adding Bitcoin to an App That Was Never Built for It

*How FairWins added its first non-Ethereum blockchain without quietly breaking everything built around the old assumptions*

| | |
|---|---|
| **Series** | Finance Surfaces (part 4) |
| **Part** | 25 of 34 |
| **Audience** | Product and engineering readers curious about multi-chain design |
| **Tags** | `bitcoin`, `wallets`, `multi-chain`, `product` |
| **Reading time** | ~7 minutes |

---

## The assumption hiding in a mature app

Picture a wallet app that has only ever spoken one dialect of blockchain: the Ethereum family. Polygon, Ethereum Classic, and the test networks are all cut from the same cloth. Deep in the code, each network is identified by a plain number, and that number quietly drives almost everything — which smart contract to talk to, which server to query, which network the app is pointed at right now.

Nobody ever wrote down the rule "a blockchain is a number with contracts on it." They didn't have to. It was simply true everywhere, until the roadmap said: add Bitcoin.

Bitcoin does not fit that mold. It has no identifying number the way Ethereum networks do. It has no smart contracts, so "which contract do I talk to?" has no answer. And it doesn't even track balances the same way: instead of an account with a running total, Bitcoin holds value in discrete chunks of unspent coins, addresses are meant to be used once and rotated, and fees are priced by transaction size rather than by "gas."

The tempting shortcut is to hand Bitcoin a fake number and let it ride through the existing plumbing. That is exactly how multi-chain codebases rot: every place that trusted "this number is an Ethereum network" becomes a hidden trap waiting to receive something that isn't one. FairWins took the opposite path. Bitcoin is genuinely different, so it gets its own separate identity, and every point where the two worlds touch gets an explicit checkpoint. The scope is deliberately small — portfolio, send, and receive — a real wallet you control, living inside your existing FairWins passkey account.

This is the story of the four boundaries that made that work.

## Boundary 1: keep Bitcoin in its own lane

Rather than smuggling Bitcoin into the list of Ethereum networks, FairWins gives it a small, separate registry of its own. Bitcoin's networks are named with words — a mainnet and a test network — not numbers, and they live apart from the numeric world on purpose.

A single yes/no check acts as the gatekeeper: *is this a Bitcoin network?* Any shared screen runs that check before handing an identifier to code that only understands Ethereum, so a Bitcoin identifier can never wander into Ethereum-only plumbing by accident.

Two touches keep this honest. The app's single testnet toggle flips Bitcoin between its test and main networks in lockstep with the Ethereum side, so the two environments never mix. And a small capabilities list is the single source of truth for what Bitcoin can do: wagers, group pools, membership, and gasless transactions are switched off; sending and receiving are on. Anything switched off simply doesn't appear, so the interface never implies Bitcoin can do something it can't.

## Boundary 2: one backup, two kinds of keys

A FairWins passkey account already holds a single master secret that lives only in memory and can be recovered through the passkey itself — the same WebAuthn standard your phone uses for Face ID or fingerprint login. Bitcoin keys grow from that same secret. There is no second seed phrase to write down and no separate backup to lose.

So the Bitcoin keys can never collide with the account's other uses of that master secret, they are grown through a one-way derivation stamped with a Bitcoin-specific label, following Bitcoin's own standard recipes for turning a seed into spending keys — the widely used approaches for modern "native SegWit" addresses (the `bc1...` addresses you've probably seen) and, optionally, newer Taproot addresses. Every constant in that recipe is wallet-breaking: real money lives at the resulting addresses, so those values are versioned and migrated, never quietly edited.

Two rules shape everything downstream. First, the keys are memory-only: the seed and private keys are never saved to disk, logged, or sent anywhere, and the app forgets them the moment a transaction is signed. Second, even the "public" master keys that could reveal your whole history of addresses stay on your device. FairWins' server sees only bare addresses and already-signed transactions. A server that never holds keys cannot leak your wallet or quietly map out everywhere you've received money.

There's also a firm "no wrong keys" rule. If the master secret isn't available — say you're signed in with an outside wallet that doesn't support it — the Bitcoin wallet honestly reports itself as unavailable and explains why. It never improvises keys from some other source, because keys derived from the wrong material would be a *different wallet*, and someone's funds would be stranded behind a technical accident.

## Boundary 3: rotating addresses and coins that fail safe

Ethereum habits say "your address is your identity." Bitcoin practice says nearly the opposite: use a fresh receiving address every time. FairWins hands out a new address on each request, never reuses one, and keeps a simple forward-only counter of how far it has gone.

The saved list of addresses is treated as a convenience cache, not the source of truth. On a brand-new device, the wallet rediscovers your addresses by scanning forward until it sees a long-enough run of unused ones — the standard "gap limit" convention Bitcoin wallets have used for years — and picks up where it left off. Because the passkey seed plus the standard recipe *is* the backup, there's nothing Bitcoin-specific to write down.

Spending is where Bitcoin's chunk-of-coins model bites hardest. Some Bitcoin coins carry collectible data ("Stamps") baked into that specific chunk; spend one as ordinary money and the collectible is destroyed forever. So FairWins classifies every coin before it can be selected for a payment, leaning deliberately cautious: a coin counts as spendable only when it has been *positively confirmed* to be an ordinary, collectible-free coin. If the service that recognizes collectibles is degraded or unreachable, those coins are held back from spending, not risked. Occasionally that means you can send a little less than your full balance during an outage — but the alternative, accidentally destroying a collectible, isn't reversible, so caution wins.

## Boundary 4: the fee you see is the most you'll pay

On the Ethereum side, FairWins can sometimes cover transaction fees for you. Bitcoin has no such arrangement, and the app says so plainly: **on Bitcoin, you pay the network fee.** What FairWins *can* promise is that the fee shown when you confirm is the ceiling — you will never be charged more than that.

Fee estimates go stale fast, so a quote expires after about a minute; if it's older, the app throws it out and re-quotes before building anything, so a fee spike can't silently reprice your payment. The fee you confirm then becomes a hard limit at the last step: before signing, the app calculates the real fee and refuses to sign anything above what you approved. Tiny leftover change too small to be worth its own output is folded into the fee, and payments are sent in a way that lets a stuck transaction be bumped later if the network gets congested.

The server component for Bitcoin is deliberately dull: it checks that the feature is on, validates the request, enforces rate limits, and relays data to a public Bitcoin data provider. It never touches keys or funds, and the whole thing is optional — turn it off and every Bitcoin screen hides or degrades honestly. If it goes down entirely, none of the Ethereum-side money features are affected at all.

## Why we built it this way

A separate identity for Bitcoin beats a fake number: the shortcut would have been one line of code and an endless audit headache, whereas guarding every crossing turns a whole category of "wrong network" bugs into an impossibility. Reusing the passkey seed means no second recovery ritual, at the honest cost of a hard dependency — Bitcoin needs a passkey that supports it. Treating saved address state as a rebuildable cache means the wallet survives device loss with zero Bitcoin-specific backup. And throughout, the app prefers to fail safe over always acting: both the collectible check and the fee ceiling would rather refuse than act on unverified information, because a blocked send is recoverable while a destroyed collectible or a surprise fee is not.

## Further reading

- [Bitcoin BIP-32: Hierarchical Deterministic Wallets](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki) — how one seed grows a tree of keys
- [BIP-84: native SegWit (`bc1...`) address derivation](https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki) and [BIP-86: Taproot addresses](https://github.com/bitcoin/bips/blob/master/bip-0086.mediawiki)
- [BIP-125: opt-in "replace-by-fee"](https://github.com/bitcoin/bips/blob/master/bip-0125.mediawiki) — bumping a stuck transaction
- [WebAuthn / passkeys explained](https://webauthn.guide/) — the standard behind Face ID and fingerprint login
