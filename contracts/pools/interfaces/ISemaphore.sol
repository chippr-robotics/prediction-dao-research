// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISemaphore (Semaphore V4 surface)
/// @notice Minimal local mirror of the Semaphore V4 `ISemaphore` surface used by ZK-Wager Pools
///         (spec 034). It matches the canonical "semaphore-protocol/contracts" V4 ABI exactly so it
///         can be swapped for the canonical "semaphore-protocol/contracts" package import when the
///         pool/factory are wired against the real, self-hosted/canonical Semaphore deployment (research.md §1).
/// @dev    V4 renamed V3's `signal -> message` and `externalNullifier -> scope`. For pool resolution
///         `scope = proposalId` (one approval per member per proposal) and `message` carries the vote
///         choice. The deployed Semaphore is a permissionless singleton, so our contracts MUST own
///         group-admin rights and be the only path to `addMember`.
interface ISemaphore {
    /// @notice The V4 proof struct (do not reorder — must match the package ABI).
    struct SemaphoreProof {
        uint256 merkleTreeDepth;
        uint256 merkleTreeRoot;
        uint256 nullifier;
        uint256 message; // vote choice
        uint256 scope;   // proposalId
        uint256[8] points;
    }

    /// @notice Create a group with `msg.sender` as admin.
    function createGroup() external returns (uint256 groupId);

    /// @notice Create a group with an explicit admin.
    function createGroup(address admin) external returns (uint256 groupId);

    /// @notice Create a group with an explicit admin and merkle-tree duration.
    function createGroup(address admin, uint256 merkleTreeDuration) external returns (uint256 groupId);

    /// @notice Insert an identity commitment as a new group member (admin only).
    function addMember(uint256 groupId, uint256 identityCommitment) external;

    /// @notice Batch insert identity commitments (admin only).
    function addMembers(uint256 groupId, uint256[] calldata identityCommitments) external;

    /// @notice Verify a proof without recording its nullifier (view).
    function verifyProof(uint256 groupId, SemaphoreProof calldata proof) external view returns (bool);

    /// @notice Verify a proof and record its nullifier; reverts if the nullifier was already used in
    ///         the group (one vote per member per scope).
    function validateProof(uint256 groupId, SemaphoreProof calldata proof) external;
}
