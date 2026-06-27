// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISemaphore} from "./ISemaphore.sol";

/// @notice Pool lifecycle (FR-007a/FR-016/FR-019/FR-023).
enum PoolState {
    JoiningOpen,
    JoiningClosed,
    Resolved,
    Cancelled
}

/// @notice One row of the payout matrix (FR-018). A winner is identified by their **claim-scope
///         Semaphore nullifier** (= a deterministic function of their identity secret under the
///         pool's fixed claim scope), so only the secret-holder can claim the matching share, and
///         no wallet/commitment is revealed. The matrix preimage hashes to the locked outcome.
struct PayoutEntry {
    uint256 claimNullifier;
    uint256 amount;
}

/// @title IZKWagerPool
/// @notice Surface for an isolated, immutable group-wager pool clone (spec 034). Members buy in with
///         USDC and join a per-pool Semaphore group; the creator proposes a payout outcome that members
///         anonymously approve to a fraction-of-joined threshold; winners claim to any address.
/// @dev    See specs/034-zk-wager-pools/contracts/pool-contracts-interface.md. Security-critical
///         invariants: no escrow release outside {claim} (Resolved) or {refund}/{cancel} (FR-022);
///         the creator cannot force a payout (FR-020b); funds are never stuck (FR-019). Nicknames are
///         client-side only and never emitted on-chain (FR-009).
interface IZKWagerPool {
    // ---- Immutable refs (read from clone args) ----
    function factory() external view returns (address);
    function token() external view returns (address);
    function semaphore() external view returns (address);

    // ---- Seeded / bounded state ----
    function groupId() external view returns (uint256);
    function creator() external view returns (address);
    function state() external view returns (PoolState);
    function memberCount() external view returns (uint32);
    function maxMembers() external view returns (uint32);
    function frozenDenominator() external view returns (uint32);
    function thresholdBips() external view returns (uint16);
    function lockedOutcome() external view returns (bytes32);

    // ---- Join (P1: caller pays gas; requires prior ERC-20 approve) ----
    function join(uint256 identityCommitment) external;

    // ---- Join (P2: gasless via EIP-3009; relayer pays gas) ----
    function joinWithAuthorization(
        uint256 identityCommitment,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    // ---- Close joining (FR-007a) ----
    function closeJoining() external; // creator-initiated; also auto on full
    function pokeDeadline() external; // anyone: closes if joinDeadline passed

    // ---- Resolution (FR-020: creator proposes, members approve) ----
    function proposeOutcome(bytes32 proposalId) external; // onlyCreator, while JoiningClosed
    function approve(ISemaphore.SemaphoreProof calldata proof) external;

    // ---- Payout / refund ----
    /// @notice Claim a winning share to any `recipient`. The caller proves ownership of the winning
    ///         in-pool identity with a Semaphore proof under the pool's claim scope whose `message`
    ///         binds `recipient` (anti-front-run) and whose `nullifier` equals `entries[index]
    ///         .claimNullifier` (binds the claimant to their share). Semaphore's nullifier-reuse rule
    ///         prevents double-claims. `entries` is the payout-matrix preimage; its hash MUST equal
    ///         `lockedOutcome`. Pays to an address unlinked to the join wallet (FR-017/SC-013).
    function claim(
        PayoutEntry[] calldata entries,
        uint256 index,
        ISemaphore.SemaphoreProof calldata proof,
        address recipient
    ) external;

    function refund() external;
    function cancel() external; // onlyCreator, while JoiningOpen

    // ---- Events ----
    event Joined(uint256 indexed identityCommitment); // nickname is client-side only, never on-chain (FR-009)
    event JoiningClosedEvent(uint32 frozenDenominator);
    event OutcomeProposed(bytes32 indexed proposalId);
    event Approved(bytes32 indexed proposalId, uint256 nullifier, uint256 message);
    event OutcomeLocked(bytes32 indexed proposalId);
    event Claimed(bytes32 indexed shareRef, address recipient, uint256 amount);
    event Refunded(address indexed member, uint256 amount);
    event PoolCancelled();
}
