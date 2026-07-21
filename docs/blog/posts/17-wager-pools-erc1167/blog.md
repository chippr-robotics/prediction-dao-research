# Wager Pools: ERC-1167 Clones and Address-Keyed Payouts

*Why FairWins gave group wagers their own factory of immutable minimal-proxy clones — and why the winner's address is the claim code*

| | |
|---|---|
| **Series** | Prediction Markets (part 4) |
| **Part** | 17 of 34 |
| **Audience** | Smart-contract developers |
| **Tags** | `erc1167`, `minimal-proxy`, `clones`, `factory`, `governance` |
| **Reading time** | ~8 minutes |

> **Important note**: This article describes wagering based on publicly available information and legitimate forecasting among consenting participants. Wager pools are not a mechanism for trading on material non-public information or circumventing applicable regulation. All participants remain fully subject to applicable laws and compliance requirements — the platform screens every creator and joiner against sanctions and membership gates before funds move.

## Twelve people, one bracket, one escrow

The FairWins `WagerRegistry` is built for a specific shape of agreement: two sides, an oracle or counterparty resolution, one payout. It handles that shape well. But the request that kept coming back from testers was a different shape entirely: *twelve of us ran a season-long fantasy league; first place gets 60%, second gets 30%, third gets 10%. Hold the money so nobody has to chase anyone in March.*

You cannot express that as a 1v1 wager without contortions — sixty-six pairwise wagers, or a designated stakeholder wallet everyone has to trust. What the group actually needs is one escrow that N people pay into, and a resolution mechanism that doesn't depend on any external oracle, because "who won our league" is not a Polymarket condition. The group *is* the oracle.

This is spec 034, and it shipped as **Wager Pools**: a `WagerPoolFactory` that stamps out one isolated `WagerPool` contract per group. It is a deliberately parallel system — a documented exception to the platform rule that all wager escrow routes through `wagerRegistry` — and it made two architectural choices that run opposite to the registry's: the pools are **immutable ERC-1167 clones** rather than logic behind an upgradeable proxy, and resolution is a **creator-proposed payout matrix keyed by public wallet addresses**, approved by the members themselves.

That second choice has a story. The spec directory is still called `specs/034-zk-wager-pools/` because the original design used Semaphore V4: anonymous membership commitments, zero-knowledge approval votes, payouts keyed by claim nullifiers. It worked — real Groth16 proofs verified on-chain in integration tests. Testers killed it anyway. The private "claim code" (a nullifier the winner had to reveal to the creator, not derivable from any public data) was the failure point: it turned "collect your winnings" into a secret-handling exercise. The round-7 addendum in `specs/034-zk-wager-pools/spec.md` records the pivot: Semaphore removed entirely, `ZKWagerPool → WagerPool`, membership, voting, and claims by public wallet address. When your users are a friend group who already know each other, anonymity was cost without benefit — and dropping the BN254 pairing requirement had a side effect: pools became deployable to Ethereum Classic's Mordor testnet, which is the launch target ahead of Polygon.

## One upgradeable factory, N immutable pools

The system has exactly one state-bearing, upgradeable contract: `contracts/pools/WagerPoolFactory.sol`, a UUPS proxy inheriting the platform's shared `contracts/upgradeable/UUPSManaged.sol` base, with append-only storage and a trailing `__gap`. Everything else is a clone:

```solidity
poolId = ++poolCount;
pool = Clones.clone(poolImpl);

WagerPool(pool).initialize(
    p.token, creator, p.buyIn, p.maxMembers,
    p.thresholdBips, p.acceptDeadline, p.resolveDeadline
);
```

`Clones.clone` is OpenZeppelin's implementation of [ERC-1167](https://eips.ethereum.org/EIPS/eip-1167), the minimal proxy standard: a 45-byte contract whose entire runtime code is "delegatecall everything to a hard-coded implementation address." Each pool costs a fraction of a full deployment, gets its own address and its own isolated storage, and shares bytecode with every other pool.

The crucial property is what clones *don't* have: an upgrade path. The implementation address is baked into the clone's bytecode. Once a pool is created, its rules are frozen for its life. The factory admin can call `setTemplate` to point *future* pools at a new `poolImpl`, but no one — not the admin, not an upgrade vote — can change the logic governing money already escrowed. Compare the registry side of the platform, where `WagerRegistry` is a UUPS proxy precisely so a long-lived singleton can evolve in place. A pool is the opposite kind of object: short-lived (bounded by a resolve deadline of at most 180 days), fully parameterized at birth, holding funds for a closed group. For that object, "the rules cannot change under you" is worth more than patchability. The master implementation calls `_disableInitializers()` in its constructor; each clone is initialized exactly once, by the factory, in the same transaction that creates it.

Before cloning anything, `_createPool` screens the creator's real wallet through the same shared singletons the registry uses — `ISanctionsGuard.checkBlocked` and `IMembershipManager.checkCanCreate` under a dedicated `POOL_PARTICIPANT_ROLE` — and validates deadlines with `_checkDeadlines`, which mirrors `WagerRegistry` exactly: `acceptDeadline` in the future and within 30 days, `resolveDeadline` strictly after it and within 180 days. Pools and 1v1 wagers deliberately share the same temporal feel. The pool calls back into the factory (`screen` / `requireMembership`) to apply the same checks to every joiner. On value-bearing networks `screeningRequired` is set, both guards must be configured, and the buy-in token must be on an admin-curated allowlist — `escrowTotal` is derived arithmetically as `memberCount * buyIn`, which only holds for well-behaved tokens, so fee-on-transfer and rebasing tokens are excluded at the door.

## The address is the claim code

Resolution is where the address-based redesign earns its keep. After joining closes — creator's call, auto-close when full, or anyone poking `pokeDeadline` past the accept deadline — the denominator freezes and the creator proposes a full payout matrix:

```solidity
struct PayoutEntry {
    address winner;
    uint256 amount;
}

function proposeOutcome(PayoutEntry[] calldata entries) external;
```

`proposeOutcome` validates the matrix on-chain before it can ever be voted on: non-empty, no zero-address winner, and `sum(amounts) == escrowTotal` — the exact escrow, to the wei. The `proposalId` is `keccak256(abi.encode(entries))`, and the `OutcomeProposed` event inlines the entire matrix, so every member reads the precise split from chain data before approving. Nothing about the outcome lives off-chain.

Members approve with a plain transaction. Approvals are counted per `(proposalId, member)` — revising the matrix produces a new id and restarts the tally with no storage reset. The pool resolves when approvals reach a fraction-of-joined threshold:

```solidity
/// Approvals required = ceil(frozenDenominator * thresholdBips / 10000).
uint256 req = (num + 9999) / 10000;
if (req == 0) req = 1;
if (frozenDenominator >= 2 && req < 2) req = 2;
```

That last line is a governance floor: in any multi-member pool, at least two approvals are required, so no single member — including the creator, who may also be a joined member — can unilaterally lock a self-dealing payout. The creator *proposes*; only the group *disposes*. And if the group never reaches threshold, the `resolveDeadline` converts the pool to refund-only: every member recovers exactly their buy-in. Funds cannot be stranded by a deadlock.

Claiming is where the "address is the claim code" phrase becomes literal. A winner calls `claim(entries, index, recipient)`; the contract checks that the supplied matrix hashes to `lockedOutcome`, that `entries[index].winner == msg.sender`, and pays `entries[index].amount` to any `recipient` the winner chooses. There is no secret to exchange, nothing to reveal to the creator, nothing to lose. Every party can derive every claim from the public roster. Claims are tracked per **row index** rather than per winner address — `mapping(uint256 => bool) claimedIndex` — a small but deliberate detail: a matrix that lists the same winner in multiple rows (say, first *and* third place) is fully claimable row by row, and never strands escrow. `claim`, `refund`, and `cancel` are the only paths by which value leaves the contract, all behind reentrancy guards and checks-effects-interactions.

## Gasless twins baked into immutable bytecode

Immutability forced one design constraint you don't face with proxies: whatever relayer support a pool will ever have must be in the template on day one. So every actor-attributed action carries an [EIP-712](https://eips.ethereum.org/EIPS/eip-712) `…WithSig` twin — `approveWithSig`, `claimWithSig`, `proposeOutcomeWithSig`, `closeJoiningWithSig`, `cancelWithSig`, `refundWithSig` — via the shared `contracts/upgradeable/SignerIntentBase.sol` mixin, which authorizes the recovered signer instead of `msg.sender` under a per-clone EIP-712 domain (`"FairWins WagerPool"`, version `"1"`) with single-use nonces. The money-in path gets its own relayable form: `joinWithAuthorization` moves USDC via [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) `receiveWithAuthorization`, so a member with zero native gas can still buy in. The strongest case is the winner with an empty gas tank: `claimWithSig` binds the signed intent to `index` and `recipient`, so a relayer can submit the claim but can never redirect the payout.

Clones create one operational wrinkle for relaying: their addresses are dynamic, so a relayer engine cannot pre-whitelist them. The factory answers with pass-through forwarders (`approveWithSigFor`, `claimWithSigFor`, and friends) that let the relayer target only the stable factory address, while an on-chain provenance check — `poolAddressToId[pool] != 0` — guarantees the forwarded call can only reach a pool this factory actually minted. The forwarders add no trust; each clone still verifies the member's signature against its own domain. Self-submit remains the primary path throughout: gasless is a convenience layer, never a dependency.

## Design decisions

- **A parallel system, on purpose.** Pools do not route through `wagerRegistry`, its oracle adapters, or its draw logic — group self-resolution is a genuinely different trust model, and grafting an N-party matrix vote onto a 24 KB-constrained two-facet proxy would have compromised both. The exception is documented platform-wide; the systems share compliance interfaces (`ISanctionsGuard`, `IMembershipManager`) and identical deadline semantics so they can converge later.
- **Immutable clones over upgradeable pools.** Per-pool proxies would allow post-deploy fixes but would also mean an admin key can rewrite the rules of live escrow. For bounded-lifetime group funds, FairWins chose the stronger promise. The cost is real: a template bug affects every existing pool with no patch path, which is why the template requires a formal security review before going live on any value-bearing network.
- **Public addresses over zero-knowledge.** The Semaphore design was cryptographically sound and empirically working; it lost to a usability finding. The lesson generalizes: privacy machinery whose secret-handling burden lands on the *winner at claim time* fails exactly when the stakes are highest. Two-word nicknames survive as pure client-side display, derived from the wallet address, never on-chain.
- **On-chain matrix validation over commit-and-reveal.** Requiring the full matrix at propose time (validated to sum to escrow, emitted in the event) costs calldata but buys the invariant that a locked outcome is always fully claimable — members never approve a hash they cannot verify from chain data alone.

## Sources

- `specs/034-zk-wager-pools/spec.md` — including the round-7 redesign addendum (Semaphore removed, address-based pivot)
- `specs/034-zk-wager-pools/implementation-notes.md` — tester rounds, gas figures, ETC/Mordor enablement
- `contracts/pools/WagerPool.sol`, `contracts/pools/WagerPoolFactory.sol`
- `contracts/pools/interfaces/IWagerPool.sol`, `contracts/pools/interfaces/IWagerPoolFactory.sol`
- `contracts/upgradeable/SignerIntentBase.sol`, `contracts/upgradeable/UUPSManaged.sol`
- `docs/developer-guide/zk-wager-pools.md` (documents the pre-pivot Semaphore architecture; historical context)
- [ERC-1167: Minimal Proxy Contract](https://eips.ethereum.org/EIPS/eip-1167)
- [EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009)
- [OpenZeppelin Clones library](https://docs.openzeppelin.com/contracts/5.x/api/proxy#Clones)
