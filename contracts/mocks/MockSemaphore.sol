// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISemaphore} from "../pools/interfaces/ISemaphore.sol";

/// @title MockSemaphore
/// @notice TEST-ONLY Semaphore V4 double for ZK-Wager Pools (spec 034). Tracks groups, members, and
///         per-group nullifiers so resolution/double-vote logic can be exercised without real Groth16
///         proofs. NEVER deploy in a production path (constitution III — mocks live only under test scope).
/// @dev    `validateProof` enforces the one-nullifier-per-group rule (the real anonymity guarantee) and
///         honours a settable validity flag to simulate an invalid proof. Membership is NOT cryptographically
///         checked here — tests assert the pool's tally/threshold logic on top of this double.
contract MockSemaphore is ISemaphore {
    uint256 public groupCounter;

    /// @notice group => admin.
    mapping(uint256 => address) public groupAdmin;
    /// @notice group => member count (commitments inserted).
    mapping(uint256 => uint256) public memberCount;
    /// @notice group => identityCommitment => present.
    mapping(uint256 => mapping(uint256 => bool)) public isMember;
    /// @notice group => nullifier => used (mirrors Semaphore's per-group nullifier set).
    mapping(uint256 => mapping(uint256 => bool)) public nullifierUsed;

    /// @notice When false, {validateProof}/{verifyProof} treat proofs as invalid (simulate a bad proof).
    bool public proofValid = true;

    error NotGroupAdmin();
    error AlreadyMember();
    error UsedNullifierTwice();
    error InvalidProof();

    function setProofValid(bool valid) external {
        proofValid = valid;
    }

    function createGroup() external returns (uint256) {
        return _createGroup(msg.sender);
    }

    function createGroup(address admin) external returns (uint256) {
        return _createGroup(admin);
    }

    function createGroup(address admin, uint256) external returns (uint256) {
        return _createGroup(admin);
    }

    function _createGroup(address admin) internal returns (uint256 groupId) {
        groupId = groupCounter++;
        groupAdmin[groupId] = admin;
    }

    function addMember(uint256 groupId, uint256 identityCommitment) public {
        if (msg.sender != groupAdmin[groupId]) revert NotGroupAdmin();
        if (isMember[groupId][identityCommitment]) revert AlreadyMember();
        isMember[groupId][identityCommitment] = true;
        memberCount[groupId] += 1;
    }

    function addMembers(uint256 groupId, uint256[] calldata identityCommitments) external {
        for (uint256 i = 0; i < identityCommitments.length; i++) {
            addMember(groupId, identityCommitments[i]);
        }
    }

    function verifyProof(uint256, SemaphoreProof calldata) external view returns (bool) {
        return proofValid;
    }

    function validateProof(uint256 groupId, SemaphoreProof calldata proof) external {
        if (!proofValid) revert InvalidProof();
        if (nullifierUsed[groupId][proof.nullifier]) revert UsedNullifierTwice();
        nullifierUsed[groupId][proof.nullifier] = true;
    }
}
