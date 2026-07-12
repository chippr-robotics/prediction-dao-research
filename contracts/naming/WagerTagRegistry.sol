// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import {SignerIntentBase} from "../upgradeable/SignerIntentBase.sol";
import {IWagerTagRegistry} from "../interfaces/IWagerTagRegistry.sol";
import {IMembershipManager} from "../interfaces/IMembershipManager.sol";
import {ISanctionsGuard} from "../interfaces/ISanctionsGuard.sol";

/// @title WagerTagRegistry (spec 054)
/// @notice In-house, on-chain naming registry. Gold-tier-or-above members OPTIONALLY register a unique,
///         normalized `%tag` handle bound to their wallet; the tag resolves to the owner's address for
///         identity lookup and address entry across the app. Registration is opt-in — no account is ever
///         required to hold a tag, and the registry holds NO funds.
/// @dev    UUPS (UUPSManaged) + gasless intents (SignerIntentBase). Append-only storage with a trailing
///         `__gap`; registered in `npm run check:storage-layout`. EthTrust-SL2 target: no fund custody;
///         highest-risk surfaces are the Gold-tier gate, commit–reveal anti-snipe, the delayed repoint
///         (payout-redirect defense), and moderation that can NEVER reassign a tag to a different owner.
contract WagerTagRegistry is IWagerTagRegistry, UUPSManaged, SignerIntentBase {
    // ---- Roles (least privilege — none can reassign a tag) ----
    bytes32 public constant REGISTRY_CURATOR_ROLE = keccak256("REGISTRY_CURATOR_ROLE");
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    // ---- EIP-712 intent typehashes (byte-identical to intentTypes.js / relay-gateway) ----
    bytes32 private constant COMMIT_TAG_TYPEHASH =
        keccak256("CommitTagIntent(address owner,bytes32 commitment,bytes32 nonce,uint256 validAfter,uint256 validBefore)");
    bytes32 private constant REGISTER_TAG_TYPEHASH =
        keccak256("RegisterTagIntent(address owner,string tag,bytes32 salt,bytes32 nonce,uint256 validAfter,uint256 validBefore)");
    bytes32 private constant CHANGE_TAG_TYPEHASH =
        keccak256("ChangeTagIntent(address owner,string newTag,bytes32 salt,bytes32 nonce,uint256 validAfter,uint256 validBefore)");
    bytes32 private constant RELEASE_TAG_TYPEHASH =
        keccak256("ReleaseTagIntent(address owner,bytes32 tagHash,bytes32 nonce,uint256 validAfter,uint256 validBefore)");
    bytes32 private constant REQUEST_REPOINT_TYPEHASH =
        keccak256("RequestRepointIntent(address owner,bytes32 tagHash,address newOwner,bytes32 nonce,uint256 validAfter,uint256 validBefore)");
    bytes32 private constant CANCEL_REPOINT_TYPEHASH =
        keccak256("CancelRepointIntent(address owner,bytes32 tagHash,bytes32 nonce,uint256 validAfter,uint256 validBefore)");

    // ---- Policy-param hard bounds (tuning never disables a protection) ----
    uint64 private constant MIN_COMMIT_AGE_FLOOR = 1 minutes;
    uint64 private constant MIN_COMMIT_AGE_CEIL = 1 days;
    uint64 private constant MAX_COMMIT_AGE_CEIL = 7 days;
    uint64 private constant QUARANTINE_FLOOR = 30 days;
    uint64 private constant QUARANTINE_CEIL = 365 days;
    uint64 private constant COOLDOWN_FLOOR = 1 days;
    uint64 private constant COOLDOWN_CEIL = 365 days;
    uint64 private constant REPOINT_DELAY_FLOOR = 24 hours;
    uint64 private constant REPOINT_DELAY_CEIL = 14 days;
    uint64 private constant LAPSE_GRACE_FLOOR = 30 days;
    uint64 private constant LAPSE_GRACE_CEIL = 3650 days;

    struct TagRecord {
        address owner;
        string tag; // canonical form
        uint64 registeredAt;
        address pendingOwner; // nonzero only while a repoint is pending
        uint64 repointEffectiveAt;
        bool suspended;
        bool verified;
    }

    // ---- Append-only storage (never insert/reorder/remove above __gap) ----
    IMembershipManager public membershipManager;
    ISanctionsGuard public sanctionsGuard; // address(0) ⇒ screening disabled (e.g. Mordor without an oracle)
    bytes32 public membershipRole; // role whose active tier is checked (WAGER_PARTICIPANT_ROLE)
    IMembershipManager.Tier public minTier; // minimum eligible tier (Gold); hard-floored at Gold

    uint64 public minCommitmentAge;
    uint64 public maxCommitmentAge;
    uint64 public quarantinePeriod;
    uint64 public changeCooldown;
    uint64 public repointDelay;
    uint64 public lapseGrace;

    mapping(bytes32 => TagRecord) private _records; // tagHash => record
    mapping(address => bytes32) public tagHashOf; // reverse index; 0x0 = no tag
    mapping(bytes32 => uint64) public quarantinedUntil; // tagHash => quarantine end
    mapping(bytes32 => bool) public reserved; // tagHash => reserved term
    mapping(bytes32 => uint64) public commitments; // commitment => commit timestamp
    mapping(address => uint64) public lastChangeAt; // change-cooldown anchor

    uint256[43] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // UUPSManaged constructor already calls _disableInitializers().
    }

    /// @notice One-time initializer (replaces the constructor for the UUPS proxy).
    /// @param admin_ DEFAULT_ADMIN_ROLE + UPGRADER_ROLE holder.
    /// @param membershipManager_ Membership proxy (eligibility gate).
    /// @param sanctionsGuard_ Sanctions guard, or address(0) to disable screening.
    /// @param membershipRole_ Role whose active tier is checked (WAGER_PARTICIPANT_ROLE).
    function initialize(
        address admin_,
        address membershipManager_,
        address sanctionsGuard_,
        bytes32 membershipRole_
    ) external initializer {
        if (admin_ == address(0) || membershipManager_ == address(0)) revert ZeroAddress();
        __UUPSManaged_init(admin_);
        __EIP712_init("FairWins WagerTagRegistry", "1"); // signer-attributed intents (spec 035)

        membershipManager = IMembershipManager(membershipManager_);
        sanctionsGuard = ISanctionsGuard(sanctionsGuard_); // may be zero
        membershipRole = membershipRole_;
        minTier = IMembershipManager.Tier.Gold;

        minCommitmentAge = 1 minutes;
        maxCommitmentAge = 1 days;
        quarantinePeriod = 90 days;
        changeCooldown = 30 days;
        repointDelay = 48 hours;
        lapseGrace = 365 days;
    }

    // =========================================================================
    // Registration (commit–reveal, FR-001/002/006)
    // =========================================================================

    /// @inheritdoc IWagerTagRegistry
    function makeCommitment(string calldata tag, address owner, bytes32 salt) external pure returns (bytes32) {
        (bool ok, bytes32 h,) = _validate(tag);
        if (!ok) revert InvalidTagFormat();
        return _commitmentHash(h, owner, salt);
    }

    /// @inheritdoc IWagerTagRegistry
    function commit(bytes32 commitment) external {
        _commit(commitment);
    }

    /// @inheritdoc IWagerTagRegistry
    function register(string calldata tag, bytes32 salt) external {
        _register(msg.sender, tag, salt);
    }

    /// @inheritdoc IWagerTagRegistry
    function changeTag(string calldata newTag, bytes32 salt) external {
        _changeTag(msg.sender, newTag, salt);
    }

    /// @inheritdoc IWagerTagRegistry
    function release() external {
        _release(msg.sender);
    }

    function _commit(bytes32 commitment) internal {
        // Overwriting refreshes the timestamp; harmless (the commitment already binds tag+owner+salt).
        commitments[commitment] = uint64(block.timestamp);
        emit TagCommitted(commitment, uint64(block.timestamp));
    }

    function _register(address owner, string calldata tag, bytes32 salt) internal {
        (bool ok, bytes32 h, string memory canonical) = _validate(tag);
        if (!ok) revert InvalidTagFormat();
        if (reserved[h]) revert TagIsReserved();
        if (tagHashOf[owner] != bytes32(0)) revert AlreadyHasTag();
        if (_statusOf(h) != TagStatus.NONE) revert TagUnavailable();
        _requireEligible(owner);
        _consumeCommitment(h, owner, salt);
        _writeRecord(h, owner, canonical);
        emit TagRegistered(h, canonical, owner);
    }

    function _changeTag(address owner, string calldata newTag, bytes32 salt) internal {
        bytes32 oldH = tagHashOf[owner];
        if (oldH == bytes32(0)) revert NoTag();
        uint64 nextAllowed = lastChangeAt[owner] + changeCooldown;
        if (lastChangeAt[owner] != 0 && block.timestamp < nextAllowed) revert ChangeCooldownActive(nextAllowed);

        (bool ok, bytes32 newH, string memory canonical) = _validate(newTag);
        if (!ok) revert InvalidTagFormat();
        if (newH == oldH) revert TagUnavailable();
        if (reserved[newH]) revert TagIsReserved();
        if (_statusOf(newH) != TagStatus.NONE) revert TagUnavailable();
        _requireEligible(owner);
        _consumeCommitment(newH, owner, salt);

        _quarantine(oldH, owner); // release old into quarantine (clears tagHashOf[owner])
        _writeRecord(newH, owner, canonical);
        lastChangeAt[owner] = uint64(block.timestamp);
        emit TagChanged(oldH, newH, owner);
    }

    function _release(address owner) internal {
        bytes32 h = tagHashOf[owner];
        if (h == bytes32(0)) revert NoTag();
        _quarantine(h, owner);
        emit TagReleased(h, owner, quarantinedUntil[h]);
    }

    // =========================================================================
    // Repointing (owner-authorized, delayed — FR-022). Tier-EXEMPT.
    // =========================================================================

    /// @inheritdoc IWagerTagRegistry
    function requestRepoint(address newOwner) external {
        _requestRepoint(msg.sender, newOwner);
    }

    /// @inheritdoc IWagerTagRegistry
    function cancelRepoint() external {
        _cancelRepoint(msg.sender);
    }

    /// @inheritdoc IWagerTagRegistry
    function finalizeRepoint(bytes32 tagHash) external {
        TagRecord storage r = _records[tagHash];
        address from = r.owner;
        address to = r.pendingOwner;
        if (to == address(0)) revert NoPendingRepoint();
        if (block.timestamp < r.repointEffectiveAt) revert RepointNotReady();
        if (tagHashOf[to] != bytes32(0)) revert TargetHasTag();

        delete tagHashOf[from];
        r.owner = to;
        r.pendingOwner = address(0);
        r.repointEffectiveAt = 0;
        // Reset the lapse-grace anchor: a migrated owner gets a full grace window to establish Gold
        // at the new address (membership is per-address). Without this, repointing to a fresh wallet
        // would flip the tag to LAPSED_RECLAIMABLE immediately — hostile to the migration use case.
        r.registeredAt = uint64(block.timestamp);
        tagHashOf[to] = tagHash;
        emit TagRepointFinalized(tagHash, from, to);
    }

    function _requestRepoint(address owner, address newOwner) internal {
        if (newOwner == address(0) || newOwner == owner) revert BadRepointTarget();
        bytes32 h = tagHashOf[owner];
        if (h == bytes32(0)) revert NoTag();
        if (tagHashOf[newOwner] != bytes32(0)) revert TargetHasTag();
        TagRecord storage r = _records[h];
        r.pendingOwner = newOwner;
        r.repointEffectiveAt = uint64(block.timestamp) + repointDelay;
        emit TagRepointRequested(h, owner, newOwner, r.repointEffectiveAt);
    }

    function _cancelRepoint(address owner) internal {
        bytes32 h = tagHashOf[owner];
        if (h == bytes32(0)) revert NoTag();
        TagRecord storage r = _records[h];
        if (r.pendingOwner == address(0)) revert NoPendingRepoint();
        r.pendingOwner = address(0);
        r.repointEffectiveAt = 0;
        emit TagRepointCancelled(h);
    }

    // =========================================================================
    // Lapse reclamation (permissionless, FR-021)
    // =========================================================================

    /// @inheritdoc IWagerTagRegistry
    function reclaimLapsed(bytes32 tagHash) external {
        TagRecord storage rec = _records[tagHash];
        address owner = rec.owner;
        if (owner == address(0)) revert NoTag();
        if (!_isLapsed(owner, rec.registeredAt)) revert NotLapsed();
        _quarantine(tagHash, owner);
        emit TagReclaimed(tagHash, owner);
    }

    // =========================================================================
    // Resolution (FR-008/010)
    // =========================================================================

    /// @inheritdoc IWagerTagRegistry
    function resolve(string calldata tag) external view returns (TagInfo memory) {
        (bool ok, bytes32 h,) = _validate(tag);
        if (!ok) return _emptyInfo();
        return _info(h);
    }

    /// @inheritdoc IWagerTagRegistry
    function tagOf(address account) external view returns (string memory) {
        bytes32 h = tagHashOf[account];
        if (h == bytes32(0)) return "";
        // Reverse only reports a tag whose forward resolution is ACTIVE (FR-008 integrity, FR-016).
        if (_statusOf(h) != TagStatus.ACTIVE) return "";
        return _records[h].tag;
    }

    /// @inheritdoc IWagerTagRegistry
    function getTagInfoByHash(bytes32 tagHash) external view returns (TagInfo memory) {
        return _info(tagHash);
    }

    /// @inheritdoc IWagerTagRegistry
    function isAvailable(string calldata tag) external view returns (bool) {
        (bool ok, bytes32 h,) = _validate(tag);
        if (!ok) return false;
        return !reserved[h] && _statusOf(h) == TagStatus.NONE;
    }

    // =========================================================================
    // Gasless twins (SignerIntentBase) — self-submit fallbacks above
    // =========================================================================

    /// @inheritdoc IWagerTagRegistry
    function commitWithSig(address owner, bytes32 commitment, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external {
        _verifyIntent(
            keccak256(abi.encode(COMMIT_TAG_TYPEHASH, owner, commitment, nonce, validAfter, validBefore)),
            owner, nonce, validAfter, validBefore, sig
        );
        _commit(commitment);
    }

    /// @inheritdoc IWagerTagRegistry
    function registerWithSig(address owner, string calldata tag, bytes32 salt, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external {
        _verifyIntent(
            keccak256(abi.encode(REGISTER_TAG_TYPEHASH, owner, keccak256(bytes(tag)), salt, nonce, validAfter, validBefore)),
            owner, nonce, validAfter, validBefore, sig
        );
        _register(owner, tag, salt);
    }

    /// @inheritdoc IWagerTagRegistry
    function changeTagWithSig(address owner, string calldata newTag, bytes32 salt, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external {
        _verifyIntent(
            keccak256(abi.encode(CHANGE_TAG_TYPEHASH, owner, keccak256(bytes(newTag)), salt, nonce, validAfter, validBefore)),
            owner, nonce, validAfter, validBefore, sig
        );
        _changeTag(owner, newTag, salt);
    }

    /// @inheritdoc IWagerTagRegistry
    function releaseWithSig(address owner, bytes32 tagHash, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external {
        _verifyIntent(
            keccak256(abi.encode(RELEASE_TAG_TYPEHASH, owner, tagHash, nonce, validAfter, validBefore)),
            owner, nonce, validAfter, validBefore, sig
        );
        if (tagHashOf[owner] != tagHash) revert NoTag(); // intent pins the exact tag
        _release(owner);
    }

    /// @inheritdoc IWagerTagRegistry
    function requestRepointWithSig(address owner, bytes32 tagHash, address newOwner, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external {
        _verifyIntent(
            keccak256(abi.encode(REQUEST_REPOINT_TYPEHASH, owner, tagHash, newOwner, nonce, validAfter, validBefore)),
            owner, nonce, validAfter, validBefore, sig
        );
        if (tagHashOf[owner] != tagHash) revert NoTag();
        _requestRepoint(owner, newOwner);
    }

    /// @inheritdoc IWagerTagRegistry
    function cancelRepointWithSig(address owner, bytes32 tagHash, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external {
        _verifyIntent(
            keccak256(abi.encode(CANCEL_REPOINT_TYPEHASH, owner, tagHash, nonce, validAfter, validBefore)),
            owner, nonce, validAfter, validBefore, sig
        );
        if (tagHashOf[owner] != tagHash) revert NoTag();
        _cancelRepoint(owner);
    }

    // =========================================================================
    // Moderation / curation / verification (roles; never reassigns a tag)
    // =========================================================================

    /// @inheritdoc IWagerTagRegistry
    function setReserved(bytes32[] calldata tagHashes, bool isReserved) external onlyRole(REGISTRY_CURATOR_ROLE) {
        for (uint256 i = 0; i < tagHashes.length; i++) {
            reserved[tagHashes[i]] = isReserved;
            emit TagReserved(tagHashes[i], isReserved);
        }
    }

    /// @inheritdoc IWagerTagRegistry
    function setSuspended(bytes32 tagHash, bool isSuspended) external onlyRole(MODERATOR_ROLE) {
        _records[tagHash].suspended = isSuspended;
        emit TagSuspended(tagHash, isSuspended);
    }

    /// @inheritdoc IWagerTagRegistry
    function setVerified(bytes32 tagHash, bool isVerified) external onlyRole(VERIFIER_ROLE) {
        _records[tagHash].verified = isVerified;
        emit TagVerificationSet(tagHash, isVerified);
    }

    // =========================================================================
    // Admin (bounded policy params)
    // =========================================================================

    /// @inheritdoc IWagerTagRegistry
    function setPolicyParams(
        uint64 minCommitmentAge_,
        uint64 maxCommitmentAge_,
        uint64 quarantinePeriod_,
        uint64 changeCooldown_,
        uint64 repointDelay_,
        uint64 lapseGrace_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (minCommitmentAge_ < MIN_COMMIT_AGE_FLOOR || minCommitmentAge_ > MIN_COMMIT_AGE_CEIL) revert ParamOutOfBounds();
        if (maxCommitmentAge_ <= minCommitmentAge_ || maxCommitmentAge_ > MAX_COMMIT_AGE_CEIL) revert ParamOutOfBounds();
        if (quarantinePeriod_ < QUARANTINE_FLOOR || quarantinePeriod_ > QUARANTINE_CEIL) revert ParamOutOfBounds();
        if (changeCooldown_ < COOLDOWN_FLOOR || changeCooldown_ > COOLDOWN_CEIL) revert ParamOutOfBounds();
        if (repointDelay_ < REPOINT_DELAY_FLOOR || repointDelay_ > REPOINT_DELAY_CEIL) revert ParamOutOfBounds();
        if (lapseGrace_ < LAPSE_GRACE_FLOOR || lapseGrace_ > LAPSE_GRACE_CEIL) revert ParamOutOfBounds();

        minCommitmentAge = minCommitmentAge_;
        maxCommitmentAge = maxCommitmentAge_;
        quarantinePeriod = quarantinePeriod_;
        changeCooldown = changeCooldown_;
        repointDelay = repointDelay_;
        lapseGrace = lapseGrace_;
        emit PolicyParamsSet(minCommitmentAge_, maxCommitmentAge_, quarantinePeriod_, changeCooldown_, repointDelay_, lapseGrace_);
    }

    /// @inheritdoc IWagerTagRegistry
    function setMembershipGate(bytes32 role, IMembershipManager.Tier tier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (uint8(tier) < uint8(IMembershipManager.Tier.Gold)) revert TierBelowFloor(); // never relax below Gold
        membershipRole = role;
        minTier = tier;
        emit MembershipGateSet(role, tier);
    }

    /// @inheritdoc IWagerTagRegistry
    function setMembershipManager(address manager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (manager == address(0)) revert ZeroAddress();
        membershipManager = IMembershipManager(manager);
    }

    /// @inheritdoc IWagerTagRegistry
    function setSanctionsGuard(address guard) external onlyRole(DEFAULT_ADMIN_ROLE) {
        sanctionsGuard = ISanctionsGuard(guard); // zero allowed (disable screening)
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    /// @dev Gold-tier gate + sanctions screen for a voluntary register/change (FR-001/007).
    function _requireEligible(address user) internal view {
        if (uint8(membershipManager.getActiveTier(user, membershipRole)) < uint8(minTier)) {
            revert InsufficientMembershipTier();
        }
        ISanctionsGuard guard = sanctionsGuard;
        if (address(guard) != address(0) && !guard.isAllowed(user)) revert SanctionedAccount();
    }

    /// @dev True once the owner's Gold coverage has ended past the grace window. Observable-state only:
    ///      grace runs from max(membership `expiresAt`, the tag's ownership `anchor`). Using the ownership
    ///      anchor gives a freshly-migrated owner (per-address membership, expiresAt 0) a full grace window
    ///      to establish Gold; an active-but-downgraded membership is honored until its term ends.
    function _isLapsed(address owner, uint64 anchor) internal view returns (bool) {
        if (uint8(membershipManager.getActiveTier(owner, membershipRole)) >= uint8(minTier)) return false;
        uint64 exp = membershipManager.getMembership(owner, membershipRole).expiresAt;
        uint64 graceAnchor = exp > anchor ? exp : anchor;
        return block.timestamp > uint256(graceAnchor) + lapseGrace;
    }

    function _consumeCommitment(bytes32 h, address owner, bytes32 salt) internal {
        bytes32 commitment = _commitmentHash(h, owner, salt);
        uint64 committedAt = commitments[commitment];
        if (committedAt == 0) revert NoCommitment();
        if (block.timestamp < committedAt + minCommitmentAge) revert CommitmentTooNew();
        if (block.timestamp > committedAt + maxCommitmentAge) revert CommitmentExpired();
        delete commitments[commitment];
    }

    function _writeRecord(bytes32 h, address owner, string memory canonical) internal {
        _records[h] = TagRecord({
            owner: owner,
            tag: canonical,
            registeredAt: uint64(block.timestamp),
            pendingOwner: address(0),
            repointEffectiveAt: 0,
            suspended: false,
            verified: false
        });
        tagHashOf[owner] = h;
        delete quarantinedUntil[h];
    }

    /// @dev Release `h` from `owner` into the quarantine window (clears the record + reverse index).
    function _quarantine(bytes32 h, address owner) internal {
        delete _records[h];
        delete tagHashOf[owner];
        quarantinedUntil[h] = uint64(block.timestamp) + quarantinePeriod;
    }

    function _statusOf(bytes32 h) internal view returns (TagStatus) {
        TagRecord storage r = _records[h];
        if (r.owner == address(0)) {
            if (block.timestamp < quarantinedUntil[h]) return TagStatus.QUARANTINED;
            return TagStatus.NONE;
        }
        if (r.suspended) return TagStatus.SUSPENDED;
        if (r.pendingOwner != address(0) && block.timestamp < r.repointEffectiveAt) return TagStatus.REPOINTING;
        if (_isLapsed(r.owner, r.registeredAt)) return TagStatus.LAPSED_RECLAIMABLE;
        return TagStatus.ACTIVE;
    }

    function _info(bytes32 h) internal view returns (TagInfo memory) {
        TagRecord storage r = _records[h];
        return TagInfo({
            owner: r.owner,
            tag: r.tag,
            status: _statusOf(h),
            verified: r.verified,
            pendingOwner: r.pendingOwner,
            repointEffectiveAt: r.repointEffectiveAt,
            quarantinedUntil: quarantinedUntil[h]
        });
    }

    function _emptyInfo() internal pure returns (TagInfo memory) {
        return TagInfo(address(0), "", TagStatus.NONE, false, address(0), 0, 0);
    }

    function _commitmentHash(bytes32 tagHash, address owner, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(tagHash, owner, salt));
    }

    /// @dev Canonical-form validation (FR-003/005): 3–20 chars, `a-z0-9` + single interior hyphen; no
    ///      leading/trailing/consecutive hyphen; uppercase rejected (clients normalize before submitting).
    ///      Non-reverting: returns (ok, keccak256(tag), tag). ASCII whitelist is the homoglyph defense.
    function _validate(string calldata tag) internal pure returns (bool ok, bytes32 h, string memory canonical) {
        bytes calldata b = bytes(tag);
        uint256 len = b.length;
        if (len < 3 || len > 20) return (false, bytes32(0), "");
        bool prevHyphen = false;
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool isLower = (c >= 0x61 && c <= 0x7a); // a-z
            bool isDigit = (c >= 0x30 && c <= 0x39); // 0-9
            bool isHyphen = (c == 0x2d); // '-'
            if (isHyphen) {
                if (i == 0 || i == len - 1 || prevHyphen) return (false, bytes32(0), "");
                prevHyphen = true;
            } else {
                if (!isLower && !isDigit) return (false, bytes32(0), "");
                prevHyphen = false;
            }
        }
        return (true, keccak256(b), tag);
    }
}
