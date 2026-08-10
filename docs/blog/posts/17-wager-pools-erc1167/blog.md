# Wager Pools: Group Escrow Where the Winner's Address Is the Claim Code

*Why FairWins gave group wagers their own factory of cheap, tamper-proof clones — and why nobody has to hold a secret to collect*

| | |
|---|---|
| **Series** | Prediction Markets (part 4) |
| **Part** | 17 of 34 |
| **Audience** | Product-minded builders, founders, and the crypto-curious |
| **Tags** | `prediction-markets`, `group-escrow`, `governance`, `product-design` |
| **Reading time** | ~7 minutes |

> **Responsible-use note**: This article describes wagering based on publicly available information and legitimate forecasting among consenting participants. Wager pools are not a mechanism for trading on material non-public information or circumventing applicable regulation. All participants remain fully subject to applicable laws and compliance requirements — the platform screens every creator and joiner against sanctions and membership gates before funds move.

## Twelve people, one bracket, one pot

FairWins' core escrow is built for a specific shape of agreement: two sides, a resolution from an outside data source or an arbitrator, one payout. It handles that shape well. But the request that kept coming back from testers was a different shape entirely: *twelve of us ran a season-long fantasy league; first place gets 60%, second gets 30%, third gets 10%. Hold the money so nobody has to chase anyone in March.*

You cannot express that as a one-on-one wager without contortions — sixty-six separate pairwise bets, or a designated wallet everyone has to trust. What the group actually needs is one pot that everyone pays into, and a way to settle it that doesn't depend on any outside market, because "who won our league" is not something a public market can answer. The group *is* the referee.

That is what **Wager Pools** delivers: a factory that stamps out one isolated escrow contract per group. It is a deliberately parallel system — a documented exception to the platform's usual rule that all wager escrow flows through the core registry — and it makes two choices that run opposite to that registry: each pool is a cheap, **tamper-proof clone** rather than upgradeable logic behind a proxy, and settlement is a **creator-proposed payout list keyed to public wallet addresses**, approved by the members themselves.

That second choice has a story. The original design leaned on zero-knowledge cryptography: anonymous membership, private approval votes, payouts unlocked by a secret only the winner knew. It worked — the anonymity proofs verified on-chain in testing. Testers killed it anyway. That private claim secret — a code the winner had to reveal to collect, derivable from nothing public — turned "collect your winnings" into a nerve-wracking secret-handling exercise. So the team pulled the anonymity out entirely and made membership, voting, and claims work by plain public wallet address. When your users are a friend group who already know each other, anonymity was cost without benefit. Dropping the heavy cryptography had a bonus: the pools became light enough to launch first on Ethereum Classic's Mordor test network, ahead of Polygon.

## One upgradeable factory, many frozen pools

The system has exactly one long-lived, upgradeable piece: the factory. Everything else is a clone.

The factory uses a well-known technique called the **minimal proxy** (the ERC-1167 standard). A minimal proxy is a tiny contract — about 45 bytes — whose entire job is to forward every call to one shared implementation. Each pool is one of these clones: it costs a fraction of a full deployment, gets its own address and its own isolated pot of money, and shares its logic with every other pool.

The crucial property is what clones *don't* have: an upgrade path. Once a pool is created, its rules are frozen for its life. The factory admin can point *future* pools at new logic, but no one — not the admin, not a vote — can change the rules governing money already sitting in an existing pool. Compare the core registry, which is deliberately upgradeable so a single long-lived contract can evolve in place. A pool is the opposite kind of object: short-lived (capped at a resolve deadline of at most 180 days), fully specified at birth, holding funds for a closed group. For that object, "the rules cannot change under you" is worth more than the ability to patch it later.

Before creating anything, the factory screens the creator's real wallet through the same sanctions and membership checks the core system uses, and validates the deadlines the same way: joining must close within 30 days, settlement within 180, in that order. Pools and one-on-one wagers deliberately share the same sense of timing. On networks where real money is at stake, the buy-in token must be on an approved allowlist — the total pot is just headcount times buy-in, which only holds for well-behaved tokens, so exotic tokens that shift balances on transfer are excluded at the door.

## The address is the claim code

Settlement is where the address-based redesign earns its keep. After joining closes — the creator's call, an automatic close when the pool is full, or anyone nudging it past the deadline — the member count freezes and the creator proposes a full payout list: who gets what.

The contract validates that list before anyone can vote on it: it can't be empty, can't pay a nonexistent address, and the amounts must sum to the exact pot, to the penny. The proposal and its entire breakdown are recorded on-chain, so every member sees the precise split from public data before approving. Nothing about the outcome lives in a side channel.

Members approve with a plain transaction. Revising the list starts a fresh tally rather than carrying over old votes. The pool settles when approvals reach a set fraction of the members who joined — with one hard floor: in any multi-member pool, at least two approvals are required. That means no single member — including the creator, who might also be a player — can unilaterally lock in a self-dealing payout. The creator *proposes*; only the group *disposes*. And if the group never reaches the threshold, the deadline flips the pool into refund-only mode and everyone recovers exactly their buy-in. Funds can't be stranded by a stalemate.

Claiming is where "the address is the claim code" becomes literal. A winner submits the agreed payout list and points to their row; the contract confirms the list matches the one the group locked in, confirms that row belongs to the caller, and pays out to any address the winner names. There is no secret to exchange, nothing to reveal to the creator, nothing to lose. Every member can work out every claim from the public roster. Claims are tracked per *row* rather than per person, so a list that names the same winner twice (say, first *and* third place) is fully claimable, row by row.

## Gasless collection, baked in from day one

Because a pool can never be upgraded, whatever convenience features it will ever have must be in the template on day one. So every member action ships with a signed, "gasless" twin: instead of paying network fees yourself, you sign an intent and a helper service submits it for you. That includes the money-in path — a member with zero native gas can still buy in using a signed token authorization — and, most importantly, the money-out path. A winner with an empty gas tank can sign a claim that a helper submits, and because the signed claim is bound to a specific row and payout address, that helper can never redirect the winnings.

Clones create one wrinkle here: each pool has a fresh, unpredictable address, so a helper service can't pre-approve them one by one. The factory solves this by acting as a stable front door — the helper only ever targets the factory, and an on-chain check guarantees a forwarded call can only reach a pool this factory actually created, with each pool still verifying the member's own signature. And self-submitting your own transaction always remains the primary path — gasless is a convenience layer, never a dependency.

## Design decisions

- **A parallel system, on purpose.** Pools don't route through the core wager registry or its outside-data resolution. Group self-settlement is a genuinely different trust model, and bolting a many-party approval vote onto the tightly space-constrained core contract would have compromised both. The two systems share the same compliance checks and identical deadline behavior, so they can converge later.
- **Frozen clones over upgradeable pools.** Upgradeable pools would allow post-launch fixes but would also mean an admin key could rewrite the rules of live escrow. For bounded-lifetime group funds, FairWins chose the stronger promise. The cost is real: a template bug affects every existing pool with no patch path, which is why the template gets a formal security review before going live anywhere real money moves.
- **Public addresses over zero-knowledge.** The anonymous design was cryptographically sound and empirically working; it lost to a usability finding. The lesson generalizes: privacy machinery whose secret-handling burden lands on the *winner at claim time* fails exactly when the stakes are highest. Friendly two-word nicknames survive as pure display, derived from the wallet address on the user's own device, never stored on-chain.
- **Validate the full payout list up front.** Requiring the complete breakdown at proposal time — checked to sum to the exact pot, and published in full — costs a little more data but buys a guarantee members care about: a locked outcome is always fully claimable, and nobody ever approves a split they can't see.

## Further reading

- [ERC-1167: Minimal Proxy Contract](https://eips.ethereum.org/EIPS/eip-1167) — the tiny-clone standard behind every pool
- [OpenZeppelin Clones library](https://docs.openzeppelin.com/contracts/5.x/api/proxy#Clones) — a widely used implementation of that standard
- [EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712) — the format behind the signed, gasless action twins
- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009) — how a member with no gas can still fund a buy-in
