// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IMembershipManager} from "./IMembershipManager.sol";

/// @title IWagerTagRegistry (spec 054)
/// @notice In-house on-chain naming registry: Gold-tier-or-above members OPTIONALLY register a unique
///         `%tag` handle bound to their wallet, resolvable for identity lookup and address entry.
///         See specs/054-wager-tag-registry/.
interface IWagerTagRegistry {
    /// @notice Computed resolution status (view-level, never stale). Only ACTIVE resolves for value.
    enum TagStatus {
        NONE, // no record (or released and quarantine expired) — "no such tag"
        ACTIVE, // resolves to owner
        REPOINTING, // pending address change within the security delay — "address changing"
        QUARANTINED, // released/changed/reclaimed, inside the quarantine window
        SUSPENDED, // moderator-suspended (ownership untouched)
        LAPSED_RECLAIMABLE // Gold coverage ended past the grace window — reclaimable by anyone
    }

    /// @notice Full public view of a tag record + its computed status.
    struct TagInfo {
        address owner;
        string tag; // canonical form, no '%'
        TagStatus status;
        bool verified;
        address pendingOwner; // nonzero only while REPOINTING
        uint64 repointEffectiveAt;
        uint64 quarantinedUntil; // nonzero only while QUARANTINED
    }

    // ---- Registration (commit–reveal) ----
    function makeCommitment(string calldata tag, address owner, bytes32 salt) external pure returns (bytes32);
    function commit(bytes32 commitment) external;
    function register(string calldata tag, bytes32 salt) external;
    function changeTag(string calldata newTag, bytes32 salt) external;
    function release() external;

    // ---- Repointing ----
    function requestRepoint(address newOwner) external;
    function cancelRepoint() external;
    function finalizeRepoint(bytes32 tagHash) external;

    // ---- Lapse reclamation (permissionless) ----
    function reclaimLapsed(bytes32 tagHash) external;

    // ---- Resolution ----
    function resolve(string calldata tag) external view returns (TagInfo memory);
    function tagOf(address account) external view returns (string memory);
    function getTagInfoByHash(bytes32 tagHash) external view returns (TagInfo memory);
    function isAvailable(string calldata tag) external view returns (bool);

    // ---- Gasless twins (SignerIntentBase) ----
    function commitWithSig(address owner, bytes32 commitment, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function registerWithSig(address owner, string calldata tag, bytes32 salt, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function changeTagWithSig(address owner, string calldata newTag, bytes32 salt, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function releaseWithSig(address owner, bytes32 tagHash, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function requestRepointWithSig(address owner, bytes32 tagHash, address newOwner, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;
    function cancelRepointWithSig(address owner, bytes32 tagHash, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external;

    // ---- Moderation / curation / verification ----
    function setReserved(bytes32[] calldata tagHashes, bool isReserved) external;
    function setSuspended(bytes32 tagHash, bool isSuspended) external;
    function setVerified(bytes32 tagHash, bool isVerified) external;

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
    event TagCommitted(bytes32 indexed commitment, uint64 committedAt);
    event TagRegistered(bytes32 indexed tagHash, string tag, address indexed owner);
    event TagReleased(bytes32 indexed tagHash, address indexed owner, uint64 quarantinedUntil);
    event TagChanged(bytes32 indexed oldTagHash, bytes32 indexed newTagHash, address indexed owner);
    event TagRepointRequested(bytes32 indexed tagHash, address indexed from, address indexed to, uint64 effectiveAt);
    event TagRepointCancelled(bytes32 indexed tagHash);
    event TagRepointFinalized(bytes32 indexed tagHash, address indexed from, address indexed to);
    event TagReclaimed(bytes32 indexed tagHash, address indexed formerOwner);
    event TagSuspended(bytes32 indexed tagHash, bool suspended);
    event TagVerificationSet(bytes32 indexed tagHash, bool verified);
    event TagReserved(bytes32 indexed tagHash, bool reserved);
    event PolicyParamsSet(uint64 minCommitmentAge, uint64 maxCommitmentAge, uint64 quarantinePeriod, uint64 changeCooldown, uint64 repointDelay, uint64 lapseGrace);
    event MembershipGateSet(bytes32 role, IMembershipManager.Tier minTier);

    // ---- Errors ----
    error ZeroAddress();
    error InvalidTagFormat();
    error TagIsReserved();
    error TagUnavailable();
    error AlreadyHasTag();
    error NoTag();
    error InsufficientMembershipTier();
    error SanctionedAccount();
    error NoCommitment();
    error CommitmentTooNew();
    error CommitmentExpired();
    error CommitmentPending();
    error ChangeCooldownActive(uint64 nextAllowedAt);
    error BadRepointTarget();
    error TargetHasTag();
    error NoPendingRepoint();
    error RepointNotReady();
    error NotLapsed();
    error ParamOutOfBounds();
    error TierBelowFloor();
}
