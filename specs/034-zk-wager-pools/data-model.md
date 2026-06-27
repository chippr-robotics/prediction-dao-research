# Phase 1 Data Model: ZK-Wager Pools

**Feature**: 034-zk-wager-pools | **Date**: 2026-06-27

Entities span four layers: **on-chain contract state**, **Semaphore protocol state**,
**subgraph (GraphQL) entities**, and **off-chain/client state**. Field types are indicative;
exact Solidity types are finalized during implementation. Storage for the upgradeable factory
is **append-only with a trailing `__gap`** (constitution / CLAUDE.md upgrade rules); the pool
clones are immutable (non-upgradeable).

---

## 1. On-chain: `ZKWagerPoolFactory` (UUPS proxy)

Upgradeable singleton at a stable address (mirrors `TokenFactory`). Owns master/template
addresses and the pool + phrase registries.

| Field | Type | Notes |
|-------|------|-------|
| `poolImpl` | `address` | Master `ZKWagerPool` implementation cloned per pool. Replaceable by admin (`setTemplate`). |
| `semaphore` | `address` | Semaphore V4 singleton for this network (self-deployed on ETC). |
| `sanctionsGuard` | `ISanctionsGuard` | Shared screening singleton; `address(0)` disables (per-network). |
| `membershipManager` | `IMembershipManager` | Shared membership gating proxy. |
| `poolCount` | `uint256` | Sequential id allocator (ids start at 1). |
| `_pools` | `mapping(uint256 => address)` | poolId → clone address. |
| `poolAddressToId` | `mapping(address => uint256)` | Reverse lookup (0 = unknown). |
| `_phraseToPool` | `mapping(bytes32 => address)` | `keccak256(wordIndices)` → pool (gateway resolution, uniqueness). |
| `_poolToPhrase` | `mapping(address => uint32[4])` | pool → 4 BIP-39 indices (display). |
| `usePermissionedCreate` | `bool` | Optional gate on who may create pools (default open, membership-gated). |
| `__gap` | `uint256[N]` | Append-only reserve. |

**Events** (subgraph-facing):
- `PoolCreated(uint256 indexed poolId, address indexed pool, address indexed creator, uint32[4] wordIndices, address token, uint256 buyIn, uint32 maxMembers, uint16 thresholdBips, uint64 joinDeadline)`

**Key behaviors**: `createPool(params)` → screen creator (`checkBlocked`) + membership
(`checkCanCreate`/`recordCreate`) → allocate id → assign unique word-index tuple
(collision-checked) → `createGroup` on Semaphore (factory/pool as admin) →
`cloneDeterministicWithImmutableArgs(poolImpl, args, salt)` with `args = (factory, token,
semaphore)` and `salt = keccak256(poolId, creator, nonce)` → `pool.initialize(seed)` →
register → emit `PoolCreated`.

---

## 2. On-chain: `ZKWagerPool` (immutable ERC-1167 clone)

One isolated instance per group. Immutable references via clone args; mutable seed via
`initialize`.

### Immutable (clone args, read from code)
| Field | Type | Notes |
|-------|------|-------|
| `factory` | `address` | Deploying factory. |
| `token` | `IERC20` (USDC, permit/3009) | Buy-in currency. |
| `semaphore` | `ISemaphore` | Anonymity/voting primitive. |

### Mutable state (set in `initialize`, then bounded)
| Field | Type | Notes |
|-------|------|-------|
| `groupId` | `uint256` | This pool's Semaphore group. |
| `creator` | `address` | Pool creator (sole payout-proposer, FR-020). |
| `buyIn` | `uint256` | Per-member stake (equal for all). |
| `maxMembers` | `uint32` | ≤ protocol cap (~1,000), FR-002a. |
| `joinDeadline` | `uint64` | Backstop close time (FR-007a). |
| `thresholdBips` | `uint16` | Approval threshold as a fraction of joined members (e.g. 6000 = 60%), FR-001/FR-013. |
| `resolutionWindow` | `uint64` | Time after close before refund/timeout is claimable (FR-019). |
| `memberCount` | `uint32` | Increments on join. |
| `joiningClosed` | `bool` | Set when full / creator-closes / deadline passes (FR-007a). |
| `frozenDenominator` | `uint32` | `memberCount` captured when joining closes (FR-013 denominator). |
| `state` | `enum PoolState` | `JoiningOpen, JoiningClosed, Resolved, Cancelled`. |
| `currentProposalId` | `bytes32` | Creator's active payout-outcome proposal (FR-020). |
| `proposalApprovals` | `mapping(bytes32 => uint32)` | proposalId → validated approval count. |
| `lockedOutcome` | `bytes32` | Set when a proposal reaches threshold (FR-016). |
| `escrowBalance` | `uint256` | Sum of buy-ins held (derivable; tracked for safety). |
| `claimed` | `mapping(uint256 => bool)` | Per winning-share/nullifier claim guard (no double-claim, FR-017). |
| `refunded` | `mapping(address => bool)` | Refund guard on timeout/cancel (FR-019/FR-023). |

**Bounded-state note (FR-002)**: no unbounded arrays. Members live in the Semaphore tree;
votes are nullifier-gated in Semaphore + counted in `proposalApprovals`; payouts validate
against `lockedOutcome` (a commitment to the payout matrix), not a stored list.

### Lifecycle / state transitions

```
            createPool                join (escrow + addMember)
   (none) ───────────► JoiningOpen ───────────────────────────► JoiningOpen
                            │  full ▼ / creator close / deadline
                            ▼
                       JoiningClosed ──(creator proposes; members approve)──┐
                            │                                               │
            threshold reached ▼                            timeout/window ▼ │
                         Resolved ◄──────── lockedOutcome           (refund eligible)
                            │ claim(proof) → payout to any address
   cancel (pre-fill) ──► Cancelled ── refund all
```

- **JoiningOpen → JoiningClosed**: pool full OR creator closes OR `joinDeadline` passes;
  `frozenDenominator = memberCount` (FR-007a, FR-013).
- **JoiningClosed → Resolved**: a `currentProposalId` reaches
  `ceil(frozenDenominator * thresholdBips / 10000)` approvals (FR-016). Creator may revise
  `currentProposalId` while unresolved; revising resets `proposalApprovals` for the new id
  (FR-020a).
- **JoiningClosed → (refund eligible)**: `resolutionWindow` elapses with no locked outcome →
  members self-refund their buy-in (FR-019, FR-020b). Funds never stuck (SC-007).
- **JoiningOpen → Cancelled**: creator cancels before fill → all members refundable
  (FR-023).

---

## 3. Semaphore protocol state (external singleton)

| Concept | Where | Notes |
|---------|-------|-------|
| Group | `Semaphore` singleton, `groupId` per pool | Admin = our pool/factory; isolated LeanIMT (depth 16). |
| Identity commitment | tree leaf | Inserted on join via `addMember`; derived from member's local identity secret. |
| Nullifier | per `(group, scope)` | `scope = proposalId`; prevents double-approval per proposal (FR-014). |
| `SemaphoreProof` | calldata to `validateProof` | `{merkleTreeDepth, merkleTreeRoot, nullifier, message, scope, points[8]}`. `message` = vote choice. |

---

## 4. Subgraph (GraphQL) entities

Indexed via factory data source + dynamic `Pool` template.

- **Pool**: `id` (address), `poolId`, `creator`, `token`, `buyIn`, `maxMembers`,
  `thresholdBips`, `joinDeadline`, `wordIndices` ([Int!]!), `state`, `memberCount`,
  `frozenDenominator`, `createdAtBlock/Timestamp`, `lockedOutcome`, `escrowBalance`.
- **Join**: `id`, `pool`, `memberCommitment` (or index), `blockTimestamp`. The
  nickname is **not** indexed/stored — it is derived client-side from
  `memberCommitment` for display (FR-009/FR-011). (No wallet address indexed for the
  in-pool footprint — see privacy boundary.)
- **Proposal**: `id` (poolId-proposalId), `pool`, `proposalId`, `approvalCount`,
  `lockedAt` (nullable).
- **VoteEvent**: `id`, `pool`, `proposalId`, `nullifier`, `message` (choice), `blockTimestamp`.
- **Payout**: `id`, `pool`, `shareRef`, `amount`, `claimedAtTimestamp`. Recipient address is
  the claim target only (unlinkable to join wallet, FR-017/SC-013).

**Network scoping (FR-033)**: each deployment indexes one network; addresses/startBlocks in
`subgraph/networks.json`. No cross-network leakage.

---

## 5. Off-chain / client state

| Entity | Storage | Notes |
|--------|---------|-------|
| **Semaphore Identity** | client-held secret (local) | Source of commitment, nullifiers, and nickname. Member-custodied (FR / Assumptions: lost secret is out of scope). |
| **Two-Word Nickname** | derived, not stored, **never on-chain** | `hash(publicIdentityCommitment) → (adjective, noun)` indices so any member can render it; versioned word arrays; in-pool disambiguation suffix (FR-009/FR-011/FR-012). |
| **Word-List Language Preference** | localStorage (device) or per-wallet pref | Selected BIP-39 language; precedent = `utils/qrColorPreference.js` (curated enum, graceful fallback) or `UserPreferencesContext`. Default English (FR Assumptions). |
| **Leaderboard State (P3)** | off-chain, creator-maintained | Interim standings by nickname; explicitly non-final (FR-029/FR-031). Not on-chain. |
| **Gasless Join Request (P2)** | transient, Payload Packer | `{wallet, identityCommitment, EIP-3009 authorization}`; validated + re-screened (sanctions + membership), never persisted with secrets. |
| **Payout Matrix (proposal preimage)** | shared off-chain, hashed on-chain | Maps anonymous in-pool identities → shares; `proposalId = hash(matrix)`. Winners claim by proving ownership of a winning identity (FR-018/FR-020). |

---

## 6. Validation rules (from requirements)

- `thresholdBips ∈ (0, 10000]`; `maxMembers ∈ [2, ~1000]` (FR-002a); `buyIn > 0`;
  `joinDeadline > now`.
- Join allowed only while `state == JoiningOpen` and `memberCount < maxMembers` and wallet
  passes sanctions + membership (FR-006/FR-007/FR-021). The **sanctions guard MUST be
  configured** on value-bearing networks (reject if unset; FR-021a); membership is gated via a
  dedicated **`POOL_PARTICIPANT_ROLE`** (FR-021b).
- Approve allowed only while `state == JoiningClosed`, proof valid, nullifier unused
  (FR-014/FR-015).
- Lock when `proposalApprovals[id] >= ceil(frozenDenominator * thresholdBips / 10000)`
  (FR-016).
- Claim only when `state == Resolved`, share ∈ `lockedOutcome`, not already claimed
  (FR-017/FR-018).
- Refund only when (`Cancelled`) or (`JoiningClosed` and `resolutionWindow` elapsed without
  lock); each member at most once (FR-019/FR-023).
- No path releases escrow except claim or refund (FR-022).
