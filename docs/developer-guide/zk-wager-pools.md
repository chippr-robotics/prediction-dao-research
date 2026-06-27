# ZK-Wager Pools (spec 034)

ZK-Wager Pools are **group** wagers: a creator opens a pool, many members buy in with USDC, and the group
resolves by **anonymous fraction-of-joined consensus** — sharing nothing more than four ordinary words and
never exposing which wallet cast which vote. They run as a **parallel system** to the one-to-one
`WagerRegistry` (CLAUDE.md carve-out): a separate group-pool factory, with shared compliance interfaces so the
two designs can converge later.

Spec: [`specs/034-zk-wager-pools/`](../../specs/034-zk-wager-pools). Architecture decisions are grounded in
[`plan.md`](../../specs/034-zk-wager-pools/plan.md) and [`research.md`](../../specs/034-zk-wager-pools/research.md).
Deploy/ops: [runbooks/zk-wager-pools-deploy.md](../runbooks/zk-wager-pools-deploy.md).

## Architecture

- **`ZKWagerPoolFactory`** (`contracts/pools/ZKWagerPoolFactory.sol`) — the single upgradeable, state-bearing
  contract. Inherits [`UUPSManaged`](upgradeable-contracts.md) (UUPS + AccessControl + non-brickable upgrade
  gate + impl-init lockout) and `ReentrancyGuard`. It screens the **creator's real wallet**, assigns a unique
  language-independent **4-word BIP-39 index tuple**, creates a per-pool **Semaphore V4** group (with the new
  pool as group admin), deploys the pool as an immutable **ERC-1167 clone**, and records it in a
  network-scoped registry. Storage is **append-only** with a trailing `__gap` (register in
  `npm run check:storage-layout`). It also serves the pools' compliance callbacks via
  `screen(address)` / `requireMembership(address)`.
- **`ZKWagerPool`** (`contracts/pools/ZKWagerPool.sol`) — an **immutable** per-group clone. It holds the
  USDC escrow and owns the pool lifecycle (join → close → propose → approve → resolve → claim, plus
  refund/cancel). Only the **factory** is upgradeable; pool logic is fixed. The master constructor calls
  `_disableInitializers()`; each clone is `initialize`d exactly once by the factory.

```
creator ──createPool──▶ ZKWagerPoolFactory (UUPS; screens creator; assigns 4-word tuple)
                            │ semaphore.createGroup(pool)  → pool is the group admin
                            │ Clones.clone(poolImpl) + initialize (per-pool mutable state)
                            ▼
                       ZKWagerPool (immutable clone, isolated storage, USDC escrow)
                            │ join → Semaphore.addMember(groupId, commitment)
                            │ closeJoining/pokeDeadline → freeze denominator
                            │ proposeOutcome → approve(SemaphoreProof) × N → OutcomeLocked
                            ▼
                       claim(matrix, index, proof, recipient)  |  refund  |  cancel
```

### Per-pool Semaphore V4 group (the anonymity primitive)

Each pool owns **one Semaphore V4 group**, created at `createPool` time with the **new pool as the group
admin** — the single most important security invariant: the deployed `Semaphore.sol` is a permissionless
singleton, so the pool MUST be the only path to `addMember`. Joins screen + escrow happen in the pool's
`join`, which then calls `Semaphore.addMember(groupId, identityCommitment)`. Approvals and claims call
`Semaphore.validateProof(groupId, proof)`:

```solidity
struct SemaphoreProof {
    uint256 merkleTreeDepth;
    uint256 merkleTreeRoot;
    uint256 nullifier;
    uint256 message;   // vote choice (approve) or recipient (claim)
    uint256 scope;      // proposalId (approve) or the pool's fixed claim scope (claim)
    uint256[8] points;  // Groth16 proof
}
```

Semaphore rejects a **reused nullifier within a scope**, which gives **one approval per member per proposal**
(and **no double-claim**) for free, while the proof never reveals which leaf voted. Tree depth is **16**
(capacity 65,536; protocol cap is ~1,000 members) and per-proof verification cost is **constant** regardless
of group size.

### Anonymous fraction-of-joined approval

Resolution is creator-proposes, members-anonymously-approve:

1. After joining closes (`closeJoining` by the creator, auto-close when full, or anyone calling
   `pokeDeadline` past `joinDeadline`), the **denominator is frozen** (`frozenDenominator = memberCount`) and
   `escrowTotal = memberCount * buyIn`.
2. The creator calls `proposeOutcome(proposalId)`. Approvals are **keyed by `proposalId`**, so revising the
   proposal (a new id) starts the tally fresh with no storage reset.
3. Each member calls `approve(SemaphoreProof)` with `scope == proposalId`. The pool counts validated proofs
   until `count >= ceil(frozenDenominator * thresholdBips / 10000)` (minimum 1), at which point it flips to
   `Resolved` and sets `lockedOutcome = proposalId`.
4. The creator **cannot force a payout** (FR-020b) — they only propose; the anonymous threshold of members
   locks it. All resolution actions must occur **within the resolution window** (`closedAt +
   resolutionWindow`); after it elapses the pool becomes **refund-only** so funds are never stuck
   (FR-019/SC-007).

### Claim-nullifier payout matrix

The locked outcome's preimage is a **payout matrix** — an array of `PayoutEntry { uint256 claimNullifier;
uint256 amount; }`. A winner is identified by their **claim-scope nullifier** (a deterministic function of
their identity secret under the pool's fixed claim scope), NOT by wallet or commitment. To claim:

```solidity
function claim(PayoutEntry[] calldata entries, uint256 index,
              ISemaphore.SemaphoreProof calldata proof, address recipient) external;
```

The pool enforces: `keccak256(abi.encode(entries)) == lockedOutcome` (the matrix is the locked outcome's
preimage); `proof.scope == claimScope` (= `keccak256(address(this), "ZKPOOL_CLAIM")`); `proof.message ==
uint160(recipient)` (binds the recipient, anti-front-run); `proof.nullifier == entries[index].claimNullifier`
(binds the claimant to their share); and `sum(entries) == escrowTotal` (every wei is allocated, so nothing is
stuck). `Semaphore.validateProof` consumes the claim nullifier (no double-claim). Funds pay to **any
recipient**, unlinked to the join wallet (FR-017/SC-013). `claim` (Resolved) and `refund`/`cancel` are the
**only** escrow exits (FR-022).

### 4-word BIP-39 gateway

Each pool is identified by **four BIP-39 word indices** (each 0..2047 ⇒ 2^44 space). The factory assigns a
unique, **collision-checked** tuple (`_assignPhrase` rehashes with an incrementing nonce until free) and
records it both directions: `poolByPhrase(uint32[4])` and `phraseOfPool(address)`. The **index tuple is the
canonical, language-independent identity** — the frontend renders/parses it through the active language's
BIP-39 wordlist, so the same pool resolves regardless of a member's chosen language (en, es, ja, fr, …).

### Client-side nicknames (never on-chain)

Two-word nicknames (e.g. "Prismatic Fox") are derived **client-side** by hashing a member's **public
identity commitment** (not the secret), so any member can reproduce every member's nickname for a
leaderboard. They are a pure display function — **never emitted or stored on-chain** — with a short
commitment-derived suffix to disambiguate rare in-pool collisions, and a versioned adjective/noun word set
(changing the arrays changes everyone's nickname). The `Joined` event carries only the
`identityCommitment` — never a nickname or wallet.

### Compliance reuse (real wallet, before anonymization)

Pools reuse the platform's shared singletons against the **real wallet** at create and join (FR-021),
identical to `WagerRegistry`:

- **Sanctions** — `ISanctionsGuard.checkBlocked(account)` via the factory's `screen(account)`.
- **Membership** — `IMembershipManager.checkCanCreate(account, POOL_PARTICIPANT_ROLE)` via the factory's
  `requireMembership(account)`, under a **dedicated `POOL_PARTICIPANT_ROLE`** (distinct from
  `WAGER_PARTICIPANT_ROLE`) so pool activity is gated independently.

When `screeningRequired` is set (value-bearing networks), **both guards MUST be configured** — create/join
revert if screening cannot be performed (FR-021a). `address(0)` (disable) is permitted **only** on
local/dev/test.

> **v1 membership gating is gate-only / view-only.** The pool/factory call **only** `checkCanCreate` (a
> `view` on `MembershipManager`); they do **not** call the `onlyAuthorized` hooks `recordCreate` /
> `recordClose`. So `POOL_PARTICIPANT_ROLE` enforces a tier/eligibility check at the door but does **not**
> consume concurrent/monthly counters, and **no `MembershipManager.setAuthorizedCaller` grant is required**
> for the factory (see the deploy runbook). If a future version tracks pool counters, it must balance
> `recordCreate`/`recordClose` across **every** terminal state and be authorized then.

## Key files

| Path | Role |
|------|------|
| `contracts/pools/ZKWagerPoolFactory.sol` | UUPS factory: screen, assign phrase, createGroup, clone, registry; `PoolCreated` |
| `contracts/pools/ZKWagerPool.sol` | immutable clone: join/close/propose/approve/claim/refund/cancel; escrow |
| `contracts/pools/interfaces/IZKWagerPoolFactory.sol` | `CreatePoolParams`, `PoolCreated`, factory surface |
| `contracts/pools/interfaces/IZKWagerPool.sol` | `PoolState`, `PayoutEntry`, pool surface + events |
| `contracts/pools/interfaces/ISemaphore.sol` | `SemaphoreProof`, `createGroup`/`addMember`/`validateProof` |
| `contracts/interfaces/ISanctionsGuard.sol`, `IMembershipManager.sol` | REUSED compliance interfaces |
| `contracts/upgradeable/UUPSManaged.sol` | REUSED base for the factory |
| `contracts/mocks/{MockSemaphore,MockUSDCPermit,MockPoolCompliance}.sol` | test-only |
| `scripts/deploy/deploy-zk-wager-pool-factory.js` | append-only deploy (pool template + UUPS factory) |
| `scripts/deploy/lib/zkPoolConfig.js` | per-network Semaphore/USDC config + `MERKLE_TREE_DEPTH`/`MAX_MEMBERS_CAP` |
| `test/helpers/zkpool.js`, `test/helpers/semaphore.js` | test fixtures (deployPoolFactory, createPool, proof, claimScope, matrixHash) |
| `frontend/src/lib/pools/*` | gateway, identity, nickname, semaphoreProof, poolContracts |

## Frontend flow

All addresses/ABIs/network config come from the generated sync artifacts via `getContractAddressForChain`
(`zkWagerPoolFactory`, `paymentToken`) — **never hardcoded**.

- **Identity** (`lib/pools/identity.js`) — a member's Semaphore identity is derived deterministically from a
  wallet signature over a pool-scoped, domain-separated message, so the same wallet always reproduces the
  same in-pool identity (commitment + nickname) with no server. The secret never leaves the device.
- **Gateway** (`lib/pools/gateway.js`) — `indicesToPhrase` / `phraseToIndices` render/parse the 4-word
  phrase in the active language; `resolvePool(factory, indices)` resolves it to a pool address via
  `poolByPhrase`. A `WordListLanguageSelector` (Account utilities) picks the wordlist language (device
  preference, default `en`).
- **Create** — `createPool(CreatePoolParams)` after the wallet passes screening; the returned
  `wordIndices` are the shareable phrase.
- **Join** — derive identity → `join(identityCommitment)` (P1: caller approves USDC and pays gas) or
  `joinWithAuthorization(...)` (P2: gasless EIP-3009; relayer pays gas, re-screening the wallet at the
  relay boundary).
- **Approve / claim** — `lib/pools/semaphoreProof.js` lazy-loads `@semaphore-protocol/{group,proof}` and
  generates the proof in-browser (≈2–15s, behind a spinner). The group is reconstructed from member
  commitments (read from the subgraph). Approve uses `scope = proposalId`; claim uses the pool claim scope
  with `message = recipient`.
- **Nicknames / leaderboard** (`lib/pools/nickname.js`, `components/pools/PoolLeaderboard.jsx`) — derived
  from each member's public commitment; interim (pre-resolution) leaderboards are explicitly marked
  **non-final / off-chain** (FR-031).

The subgraph indexes pools dynamically via a static `ZKWagerPoolFactory` data source (`PoolCreated`) that
spawns a `Pool` template, mirroring the `TokenFactory` → `TokenInstance` precedent.
</content>
</invoke>
