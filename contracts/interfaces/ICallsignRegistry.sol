// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMembershipManager} from "./IMembershipManager.sol";

/// @title ICallsignRegistry (spec 054)
/// @notice In-house on-chain naming registry: Gold-tier-or-above members OPTIONALLY register a unique
///         `%callsign` handle bound to their wallet, resolvable for identity lookup and address entry.
///         See specs/054-callsign-registry/.
interface ICallsignRegistry {
    /// @notice Computed resolution status (view-level, never stale). Only ACTIVE resolves for value.
    enum CallsignStatus {
        NONE, // no record (or released and quarantine expired) — "no such callsign"
        ACTIVE, // resolves to owner
        REPOINTING, // pending address change within the security delay — "address changing"
        QUARANTINED, // released/changed/reclaimed, inside the quarantine window
        SUSPENDED, // moderator-suspended (ownership untouched)
        LAPSED_RECLAIMABLE // Gold coverage ended past the grace window — reclaimable by anyone
    }

    /// @notice Full public view of a callsign record + its computed status.
    struct CallsignInfo {
        address owner;
        string callsign; // canonical form, no '%'
        CallsignStatus status;
        bool verified;
        address pendingOwner; // nonzero only while REPOINTING
        uint64 repointEffectiveAt;
        uint64 quarantinedUntil; // nonzero only while QUARANTINED
    }

    // ---- Registration (commit–reveal) ----
    function makeCommitment(string calldata callsign, address owner, bytes32 salt) external pure returns (bytes32);
    function commit(bytes32 commitment) external;
    function register(string calldata callsign, bytes32 salt) external;
    function changeCallsign(string calldata newCallsign, bytes32 salt) external;
    function release() external;

    // ---- Repointing ----
    function requestRepoint(address newOwner) external;
    function cancelRepoint() external;
    function finalizeRepoint(bytes32 callsignHash) external;

    // ---- Lapse reclamation (permissionless) ----
    function reclaimLapsed(bytes32 callsignHash) external;

    // ---- Resolution ----
    function resolve(string calldata callsign) external view returns (CallsignInfo memory);
    function callsignOf(address account) external view returns (string memory);
    function getCallsignInfoByHash(bytes32 callsignHash) external view returns (CallsignInfo memory);
    function isAvailable(string calldata callsign) external view returns (bool);

    // ---- Gasless twins (SignerIntentBase) ----
    function commitWithSig(address owner, bytes32 commitment, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function registerWithSig(address owner, string calldata callsign, bytes32 salt, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function changeCallsignWithSig(address owner, string calldata newCallsign, bytes32 salt, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function releaseWithSig(address owner, bytes32 callsignHash, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function requestRepointWithSig(address owner, bytes32 callsignHash, address newOwner, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function cancelRepointWithSig(address owner, bytes32 callsignHash, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;

    // ---- Moderation / curation / verification ----
    function setReserved(bytes32[] calldata callsignHashes, bool isReserved) external;
    function setSuspended(bytes32 callsignHash, bool isSuspended) external;
    function setVerified(bytes32 callsignHash, bool isVerified) external;

    // ---- Admin ----
    function setPolicyParams(
        uint64 minCommitmentAge,
        uint64 maxCommitmentAge,
        uint64 quarantinePeriod,
        uint64 changeCooldown,
        uint64 repointDelay,
        uint64 lapseGrace
    ) external;
    function setMembershipGate(bytes32 role, IMembershipManager.Tier tier) external;
    function setMembershipManager(address manager) external;
    function setSanctionsGuard(address guard) external;

    // ---- Events (audit trail, FR-023) ----
    event CallsignCommitted(bytes32 indexed commitment, uint64 committedAt);
    event CallsignRegistered(bytes32 indexed callsignHash, string callsign, address indexed owner);
    event CallsignReleased(bytes32 indexed callsignHash, address indexed owner, uint64 quarantinedUntil);
    event CallsignChanged(bytes32 indexed oldCallsignHash, bytes32 indexed newCallsignHash, address indexed owner);
    event CallsignRepointRequested(bytes32 indexed callsignHash, address indexed from, address indexed to, uint64 effectiveAt);
    event CallsignRepointCancelled(bytes32 indexed callsignHash);
    event CallsignRepointFinalized(bytes32 indexed callsignHash, address indexed from, address indexed to);
    event CallsignReclaimed(bytes32 indexed callsignHash, address indexed formerOwner);
    event CallsignSuspended(bytes32 indexed callsignHash, bool suspended);
    event CallsignVerificationSet(bytes32 indexed callsignHash, bool verified);
    event CallsignReserved(bytes32 indexed callsignHash, bool reserved);
    event PolicyParamsSet(uint64 minCommitmentAge, uint64 maxCommitmentAge, uint64 quarantinePeriod, uint64 changeCooldown, uint64 repointDelay, uint64 lapseGrace);
    event MembershipGateSet(bytes32 role, IMembershipManager.Tier minTier);

    // ---- Errors ----
    error ZeroAddress();
    error InvalidCallsignFormat();
    error CallsignIsReserved();
    error CallsignUnavailable();
    error AlreadyHasCallsign();
    error NoCallsign();
    error InsufficientMembershipTier();
    error SanctionedAccount();
    error NoCommitment();
    error CommitmentTooNew();
    error CommitmentExpired();
    error CommitmentPending();
    error ChangeCooldownActive(uint64 nextAllowedAt);
    error BadRepointTarget();
    error TargetHasCallsign();
    error NoPendingRepoint();
    error RepointNotReady();
    error NotLapsed();
    error ParamOutOfBounds();
    error TierBelowFloor();
}
