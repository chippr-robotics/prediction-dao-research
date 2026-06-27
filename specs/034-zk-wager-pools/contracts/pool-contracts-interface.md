# Contract Interface: ZKWagerPoolFactory & ZKWagerPool

**Feature**: 034-zk-wager-pools | Phase 1 | Solidity ^0.8.23 (Semaphore V4 pragma)

This is the **interface contract** (signatures + invariants), not the implementation.
Bodies, CEI ordering, and reentrancy guards are produced in `/speckit-implement`. All
value-bearing paths follow checks-effects-interactions and target EthTrust-SL ≥ L2.

---

## ISanctionsGuard / IMembershipManager (reused — do not re-roll)

```solidity
interface ISanctionsGuard {
    function checkBlocked(address account) external view;       // reverts SanctionedAddress
    function isAllowed(address account) external view returns (bool);
}

interface IMembershipManager {
    function checkCanCreate(address user, bytes32 role) external view returns (bool);
    function recordCreate(address user, bytes32 role) external; // onlyAuthorized
    function recordClose(address user, bytes32 role) external;  // onlyAuthorized
}
```

Pool create + join screen the **real wallet** via `checkBlocked` and gate via
`checkCanCreate`/`recordCreate`; every terminal path calls `recordClose` (FR-021, FR-010 note).

---

## ZKWagerPoolFactory (UUPS proxy, inherits UUPSManaged)

```solidity
struct CreatePoolParams {
    address token;          // must be allowlisted USDC for the network
    uint256 buyIn;          // > 0, equal per member
    uint32  maxMembers;     // 2..~1000 (protocol cap FR-002a)
    uint16  thresholdBips;  // (0,10000], fraction of joined members (FR-001/FR-013)
    uint64  joinDeadline;   // > block.timestamp (FR-007a backstop)
    uint64  resolutionWindow; // refund/timeout horizon after close (FR-019)
}

interface IZKWagerPoolFactory {
    event PoolCreated(
        uint256 indexed poolId,
        address indexed pool,
        address indexed creator,
        uint32[4] wordIndices,   // BIP-39 indices (language-independent identity, FR-003)
        address token,
        uint256 buyIn,
        uint32  maxMembers,
        uint16  thresholdBips,
        uint64  joinDeadline
    );

    /// Screens creator (sanctions+membership), assigns a unique 4-word tuple,
    /// creates a Semaphore group, clones an immutable pool, registers + emits.
    function createPool(CreatePoolParams calldata p) external returns (uint256 poolId, address pool);

    // Gateway resolution (FR-004): both directions
    function poolByPhrase(uint32[4] calldata wordIndices) external view returns (address pool);
    function phraseOfPool(address pool) external view returns (uint32[4] memory wordIndices);

    function poolById(uint256 poolId) external view returns (address pool);
    function poolCount() external view returns (uint256);

    // Admin (DEFAULT_ADMIN_ROLE / UPGRADER_ROLE via UUPSManaged)
    function setTemplate(address newPoolImpl) external;
    function setSanctionsGuard(address guard) external;   // address(0) disables per-network
}
```

**Invariants**
- A `wordIndices` tuple maps to at most one **active** pool; collision-checked on assign
  (FR-003, SC-003).
- `createPool` screens + records membership **before** cloning; reverts roll back the id.
- Factory (or the pool it creates) is the **Semaphore group admin** — joins are only ever
  added through the pool's `join` (research §1 invariant).
- Storage append-only + `__gap`; registered in `check:storage-layout`.

---

## ZKWagerPool (immutable ERC-1167 clone)

```solidity
import { ISemaphore } from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

enum PoolState { JoiningOpen, JoiningClosed, Resolved, Cancelled }

interface IZKWagerPool {
    // immutable args (read from clone code)
    function factory() external view returns (address);
    function token() external view returns (address);
    function semaphore() external view returns (address);

    // seeded state
    function groupId() external view returns (uint256);
    function state() external view returns (PoolState);
    function memberCount() external view returns (uint32);
    function frozenDenominator() external view returns (uint32);
    function thresholdBips() external view returns (uint16);
    function lockedOutcome() external view returns (bytes32);

    // ---- Join (P1: caller pays gas) ----
    /// Screen msg.sender (sanctions+membership), pull buyIn, addMember(commitment).
    function join(uint256 identityCommitment) external;            // requires prior approve

    // ---- Join (P2: gasless, called by relayer with token authorization) ----
    /// Verifies an EIP-3009 receiveWithAuthorization that pulls buyIn from `from`,
    /// re-screens `from`, then addMember. Relayer pays gas; `from` pays no native gas.
    function joinWithAuthorization(
        uint256 identityCommitment,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external;

    // ---- Close joining (FR-007a) ----
    function closeJoining() external;          // creator-initiated; also auto on full/deadline
    function pokeDeadline() external;           // anyone: closes if joinDeadline passed

    // ---- Resolution (FR-020: creator proposes, members approve) ----
    /// Creator sets/revises the payout-matrix commitment; revising resets approvals (FR-020a).
    function proposeOutcome(bytes32 proposalId) external;          // onlyCreator, while JoiningClosed

    /// Anonymous approval of currentProposalId. scope = proposalId, message = choice.
    /// Reverts on reused nullifier (FR-014); locks outcome at threshold (FR-016).
    function approve(ISemaphore.SemaphoreProof calldata proof) external;

    // ---- Payout / refund ----
    /// Winner proves ownership of a winning in-pool identity; paid to `recipient`
    /// (any address, unlinkable to join wallet). One claim per share (FR-017/FR-018/SC-013).
    function claim(bytes calldata winShareProof, address recipient) external;

    /// Self-refund when Cancelled, or JoiningClosed + resolutionWindow elapsed w/o lock
    /// (FR-019/FR-020b/FR-023). At most once per member; funds never stuck (SC-007).
    function refund() external;

    /// Creator cancels before fill → all members refundable (FR-023).
    function cancel() external;                 // onlyCreator, while JoiningOpen

    event Joined(uint256 indexed identityCommitment, bytes32 nicknameHash);
    event JoiningClosed_(uint32 frozenDenominator);
    event OutcomeProposed(bytes32 indexed proposalId);
    event Approved(bytes32 indexed proposalId, uint256 nullifier, uint256 message);
    event OutcomeLocked(bytes32 indexed proposalId);
    event Claimed(bytes32 indexed shareRef, address recipient, uint256 amount);
    event Refunded(address indexed member, uint256 amount);
    event Cancelled_();
}
```

**Invariants (security-critical)**
- **No escrow release except `claim` (Resolved) or `refund`/cancel** (FR-022). The creator
  cannot move other members' stakes (FR-020b).
- `join` only while `JoiningOpen`, `memberCount < maxMembers`, wallet passes sanctions +
  membership (FR-006/FR-007/FR-021).
- `approve` only while `JoiningClosed`; `validateProof` enforces one approval per member per
  proposal (FR-014/FR-015).
- Lock when `proposalApprovals[id] >= ceil(frozenDenominator * thresholdBips / 10000)`
  (FR-016); locked outcome is final.
- `claim`/`refund` are idempotent per share/member (no double pay).
- `initialize` callable once, only by factory; constructor `_disableInitializers()`.

**Open implementation question (resolve in tasks/implement, not blocking the plan)**: the
exact winning-share proof in `claim` — whether reuse a second Semaphore proof with a payout
`scope`, or a Merkle proof of the member's leaf against `lockedOutcome`. Both preserve
anonymity (claim to any address); chosen during implementation against the Semaphore claim
patterns. Tracked as a design spike in tasks.
