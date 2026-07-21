# The Nullifier System: A Privacy-Preserving Blocklist That Never Shipped

*What FairWins built when it needed to revoke bad markets without publishing a
blacklist — and why the word "nullifier" means something different here than it
does in Tornado Cash*

| | |
|---|---|
| **Series** | Privacy Architecture (part 4) |
| **Audience** | ZK and privacy engineers |
| **Tags** | `nullifiers`, `zk`, `privacy`, `rsa-accumulator`, `moderation` |
| **Reading time** | ~9 minutes |

---

> This post describes a peer-to-peer wager platform built around forecasting on
> publicly available information. Nothing here is a mechanism for evading law or
> sanctions screening; the "nullifier" below is a moderation primitive, and it is
> archived. Participants on any live FairWins surface remain subject to applicable
> law and to the platform's on-chain sanctions guard.

## A word with two meanings

If you come from the zero-knowledge world, "nullifier" has a precise meaning. In
Tornado Cash, a nullifier is a value you reveal when you withdraw a note so that
the same note cannot be withdrawn twice. In Semaphore, a nullifier hash binds a
signal to an identity and an external topic so a member can prove "I am in this
group and I have not spoken on this topic before" without revealing which member
they are. The nullifier is the anti-double-spend, anti-replay half of an
otherwise anonymous action. You never learn *who*; you only learn *again* — and
you reject the "again."

FairWins has a "nullifier system" too, documented in `docs/NULLIFIER_SYSTEM.md`
and `docs/developer-guide/nullifier-system.md`. It is worth being blunt up front:
it is **not** that. The FairWins nullifier does not prevent replay of a
privacy-preserving action. It uses "nullify" in the older sense — *to make null,
to void* — and it is a moderation tool: a way for a platform admin to revoke a
malicious market or a bad-actor address so the frontend stops displaying it and,
optionally, contracts stop transacting with it.

What makes it interesting to a ZK engineer is the *shape* of the problem, which
turns out to be the same shape as a nullifier set. A blocklist is a set. You want
to answer one question against that set — "is this thing revoked?" — and its dual,
"prove this thing is *not* revoked." The FairWins design reached for the same
cryptographic primitive the ZK-mixer literature reaches for when it wants compact,
privacy-preserving set membership: an **RSA accumulator**. This post walks that
design, and is honest about the fact that it never reached a live network.

## The problem: revoking without publishing

Consider the moderation problem for a permissionless-feeling market venue. An
admin discovers a market crafted to defraud participants, or an address that keeps
seeding abusive markets. They want it gone from the interface, and for
high-value paths they want the contract itself to refuse to interact with it.

The naive implementation is an on-chain mapping — `mapping(address => bool)
blocked` — and that is genuinely fine for small sets. But it has two properties
the designers disliked. First, the blocklist is fully public and fully
enumerable: anyone can read every entry, which turns a moderation list into a
published "wall of shame" and leaks the platform's threat model. Second, storage
and gas grow with the list. The `docs/NULLIFIER_SYSTEM.md` table lays out the
trade study explicitly: an on-chain mapping is O(n) storage with a public list; a
Merkle tree gives O(log n) proofs and partial privacy; an RSA accumulator gives
O(1) storage, O(1) on-chain footprint, and — the headline property — the ability
to prove that something is **not** in the set without revealing the set.

That last property is exactly what a ZK nullifier set needs, approached from the
opposite direction. A mixer proves *membership* of a commitment and *non-membership*
of a nullifier. Here the platform wants to prove *non-membership* in a blocklist:
"this market is clean, and here is a 256-byte witness that says so, and the witness
tells you nothing about what else is blocked."

## The design: prime mapping plus an RSA accumulator

The archived contract lives at
`contracts-archive/security/NullifierRegistry.sol`, with its cryptography in
`contracts-archive/libraries/RSAAccumulator.sol` and
`contracts-archive/libraries/PrimeMapping.sol`. It is `AccessControl`,
`ReentrancyGuard`, `Pausable`, and it supports two modes that share one storage
layout.

**Simple mode** is the boring, working half — plain mappings with an audit trail:

```solidity
mapping(bytes32 => bool) public nullifiedMarkets;
mapping(address => bool) public nullifiedAddresses;
mapping(bytes32 => uint256) public marketNullifiedAt;
mapping(bytes32 => address) public marketNullifiedBy;
```

An admin holding `NULLIFIER_ADMIN_ROLE` calls `nullifyMarket` or `nullifyAddress`
with a human-readable reason; the mapping flips, a timestamp and the admin address
are recorded, and an event carries the reason off-chain for indexing. Batch
variants exist, capped at `MAX_BATCH_SIZE = 50` to bound gas and prevent a
DoS-by-huge-array. Reads are trivial:

```solidity
function isAddressNullified(address addr) external view returns (bool) {
    return nullifiedAddresses[addr];
}
```

**Accumulator mode** is where the ZK-adjacent machinery appears. Every element —
a market hash or an address hash — is deterministically mapped to a prime. The
mapping starts from the keccak hash, forces it odd, and walks upward by twos until
a Miller-Rabin test passes:

```solidity
function hashToPrimeUint(bytes32 hash) internal pure returns (uint256 prime) {
    uint256 candidate = uint256(hash) | 1;   // ensure odd
    uint256 iterations = 0;
    while (!isPrime(candidate) && iterations < 1000) {
        candidate += 2;                        // only test odd numbers
        iterations++;
    }
    require(iterations < 1000, "Prime search exceeded limit");
    return candidate;
}
```

Deterministic hash-to-prime is the same trick the RSA-accumulator literature uses
so that the accumulator value is a single group element representing the product
of all members' primes: `A = g^(p1 * p2 * ... * pn) mod n`. Adding an element is a
single modular exponentiation, `A_new = A^p mod n`. The whole revoked set — one
entry or a million — collapses to one 256-byte value stored on-chain.

Non-membership is the payoff. To prove an element `x` is *not* in the set, an
off-chain prover computes a Bezout witness `(d, b)` such that the accumulator and
generator satisfy the identity `A^d · g^b ≡ g (mod n)` — which can only hold if
`gcd(prime(x), product_of_members) = 1`, i.e. `x` was never accumulated. The
contract verifies it:

```solidity
function verifyNonMembership(
    bytes32 elementHash,
    bytes calldata witnessD,
    bytes calldata witnessB,
    bool dNegative
) external view returns (bool valid);
```

The frontend can carry a cached accumulator and check a market client-side, and a
critical on-chain path can demand a proof rather than trusting a mapping read. The
JavaScript side of this lives in `frontend/src/utils/rsaAccumulator.js` and
`frontend/src/utils/primeMapping.js`, wired through the React hooks
`useNullifierContracts` and `useMarketNullification` and surfaced in the admin
`NullifierTab`.

## The integration points — and the trust model

Two consumers were designed to enforce revocation on-chain. The legacy
`FriendGroupMarketFactory` imports the registry, holds an `enforceNullification`
flag, and checks `isAddressNullified` before letting an address create, accept, or
be added to a market — reverting with `AddressNullified()` if blocked. A
`TreasuryVault` could refuse withdrawals to a nullified recipient. Both gate the
check behind an owner-set enforcement toggle that defaults **off**, so the system
degrades to "frontend filters, chain does not care" unless an operator explicitly
opts in.

The security of accumulator mode rests entirely on a **trusted setup**: the RSA
modulus `n` must be the product of two secret safe primes that are destroyed after
generation. If anyone knows the factorization, they can forge both membership and
non-membership proofs — add a market to the blocklist that verifies as clean, or
clear a real one. That is the classic RSA-accumulator caveat, and it is the same
class of ceremony risk that ZK systems carry for their structured reference
strings. The docs call for a verifiable ceremony or MPC; nothing in the repo
performs one.

## Design decisions and trade-offs

- **Accumulator over Merkle tree.** A Merkle blocklist gives non-membership too,
  but requires sorted leaves and O(log n) proofs that grow with the set, and it
  still tends to leak neighbors. The accumulator's constant on-chain footprint and
  set-hiding property were the deciding factors — at the cost of a trusted setup a
  Merkle tree does not need.
- **Two modes, one contract.** Simple mode is deployable today with zero ceremony
  and an obvious audit trail; accumulator mode is the privacy upgrade layered on
  the same storage. The `docs/developer-guide/nullifier-system.md` guidance is to
  use simple mode below ~1,000 entries and only reach for the accumulator when the
  set is large or the privacy of the list itself matters.
- **Enforcement off by default.** Making on-chain checks opt-in keeps gas and
  liveness risk out of the common path — a bug or a compromised admin key cannot
  freeze trading unless an operator turned enforcement on. The flip side is that
  "revoked" means nothing on-chain until someone flips that switch.
- **Admin, not governance.** Revocation is a single role, `NULLIFIER_ADMIN_ROLE`,
  granted by the default admin. The docs themselves flag this as the weak point and
  list multisig/timelock and a future governance-based path as the mitigation. It
  is centralized moderation wearing a cryptographic coat.

## Why it is archived — and what a real nullifier looks like here

Grep the active tree and there is no nullifier: `contracts/` has no
`NullifierRegistry`, no live network in `deployments/` configures one (only a
`localhost` chain-1337 registries file references a `nullifierRegistry` address),
and the testnet address that appears in the old dev guide points at Polygon Amoy,
a network FairWins has since moved off. The whole system sits in
`contracts-archive/`, which the project guide marks reference-only: never import,
never deploy. The frontend hooks still exist but soft-fail to a no-op when no
registry answers.

The honest read is that FairWins pivoted away from an admin-run market blocklist
toward compliance primitives that are actually wired into the value path — a shared
`ISanctionsGuard` checked on real wallet addresses across wagers and pools, and
role-gated participation via `MembershipManager`. Those solve the "keep bad actors
out" problem without a bespoke accumulator and its ceremony risk.

So if you came looking for a Semaphore-style spend-nullifier preventing replay of
an anonymous action, the accurate answer is: FairWins designed a *nullification*
registry, not a *nullifier* in the mixer sense, and then shelved it. What survives
is a clean, self-contained study in applying an RSA accumulator to a set-membership
problem — the exact primitive the ZK world uses, pointed at moderation instead of
anonymity. That is a genuinely useful thing to have read in full, even as reference
code, precisely because the cryptography is real and the honest limits are on the
label.

## Sources

- `docs/NULLIFIER_SYSTEM.md` — full RSA-accumulator design, trade study, and
  security model
- `docs/developer-guide/nullifier-system.md` — simple vs. accumulator mode, admin
  workflow, historical deployment notes
- `contracts-archive/security/NullifierRegistry.sol` — the registry contract
  (archived, reference-only)
- `contracts-archive/libraries/RSAAccumulator.sol`,
  `contracts-archive/libraries/PrimeMapping.sol` — accumulator math and
  deterministic hash-to-prime
- `contracts-archive/markets/FriendGroupMarketFactory.sol` — legacy on-chain
  enforcement integration
- `frontend/src/hooks/useNullifierContracts.js`,
  `frontend/src/hooks/useMarketNullification.js`,
  `frontend/src/utils/rsaAccumulator.js` — client-side filtering and proof
  verification
- `deployments/localhost-chain1337-registries-deployment.json` — the only
  deployment record that references a `nullifierRegistry`
- Background: Semaphore protocol (semaphore.pse.dev) and Tornado Cash on ZK
  nullifiers; Camenisch–Lysyanskaya, *Dynamic Accumulators* (2002) and Boneh–Bünz–Fisch,
  *Batching Techniques for Accumulators* (2018) on RSA accumulators; RFC-style RSA
  parameter guidance at eips.ethereum.org for on-chain `modExp` (EIP-198)
