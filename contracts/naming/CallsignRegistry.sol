// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import {SignerIntentBase} from "../upgradeable/SignerIntentBase.sol";
import {ICallsignRegistry} from "../interfaces/ICallsignRegistry.sol";
import {IMembershipManager} from "../interfaces/IMembershipManager.sol";
import {ISanctionsGuard} from "../interfaces/ISanctionsGuard.sol";

/// @title CallsignRegistry (spec 054)
/// @notice In-house, on-chain naming registry. Gold-tier-or-above members OPTIONALLY register a unique,
///         normalized `%callsign` handle bound to their wallet; the callsign resolves to the owner's address for
///         identity lookup and address entry across the app. Registration is opt-in — no account is ever
///         required to hold a callsign, and the registry holds NO funds.
/// @dev    UUPS (UUPSManaged) + gasless intents (SignerIntentBase). Append-only storage with a trailing
///         `__gap`; registered in `npm run check:storage-layout`. EthTrust-SL2 target: no fund custody;
///         highest-risk surfaces are the Gold-tier gate, commit–reveal anti-snipe, the delayed repoint
///         (payout-redirect defense), and moderation that can NEVER reassign a callsign to a different owner.
/// @dev    Security review (spec 054, T048) hardened two MEDIUM findings and is otherwise SL2-clean:
///         (1) `finalizeRepoint` now requires the INCOMING owner to be Gold-eligible so a non-member can't
///         ring-repoint to reset the lapse anchor and hoard names for free (FR-021); it also clears the
///         `verified` marker so verification never rides along to a new owner. (2) `_commit` rejects
///         re-committing an unexpired (public) commitment, closing a reveal-griefing DoS. All external
///         calls to membership/sanctions are view (staticcall) → reentrancy-immune; access control is
///         role-gated on every privileged entrypoint; the forward==reverse and single-owner/one-callsign
///         invariants hold across register/change/release/repoint/reclaim.
contract CallsignRegistry is ICallsignRegistry, UUPSManaged, SignerIntentBase {
    // ---- Roles (least privilege — none can reassign a callsign) ----
    bytes32 public constant REGISTRY_CURATOR_ROLE = keccak256("REGISTRY_CURATOR_ROLE");
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    // ---- EIP-712 intent typehashes (byte-identical to intentTypes.js / relay-gateway) ----
    bytes32 private constant COMMIT_CALLSIGN_TYPEHASH =
        keccak256("CommitCallsignIntent(address owner,bytes32 commitment,bytes32 nonce,uint256 validAfter,uint256 validBefore)");
    bytes32 private constant REGISTER_CALLSIGN_TYPEHASH =
        keccak256("RegisterCallsignIntent(address owner,string callsign,bytes32 salt,bytes32 nonce,uint256 validAfter,uint256 validBefore)");
    bytes32 private constant CHANGE_CALLSIGN_TYPEHASH =
        keccak256("ChangeCallsignIntent(address owner,string newCallsign,bytes32 salt,bytes32 nonce,uint256 validAfter,uint256 validBefore)");
    bytes32 private constant RELEASE_CALLSIGN_TYPEHASH =
        keccak256("ReleaseCallsignIntent(address owner,bytes32 callsignHash,bytes32 nonce,uint256 validAfter,uint256 validBefore)");
    bytes32 private constant REQUEST_REPOINT_TYPEHASH =
        keccak256("RequestRepointIntent(address owner,bytes32 callsignHash,address newOwner,bytes32 nonce,uint256 validAfter,uint256 validBefore)");
    bytes32 private constant CANCEL_REPOINT_TYPEHASH =
        keccak256("CancelRepointIntent(address owner,bytes32 callsignHash,bytes32 nonce,uint256 validAfter,uint256 validBefore)");

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

    struct CallsignRecord {
        address owner;
        string callsign; // canonical form
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

    mapping(bytes32 => CallsignRecord) private _records; // callsignHash => record
    mapping(address => bytes32) public callsignHashOf; // reverse index; 0x0 = no callsign
    mapping(bytes32 => uint64) public quarantinedUntil; // callsignHash => quarantine end
    mapping(bytes32 => bool) public reserved; // callsignHash => reserved term
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
        // membershipRole_ zero would brick eligibility (everyone below Gold) — reject the misconfig.
        if (admin_ == address(0) || membershipManager_ == address(0) || membershipRole_ == bytes32(0)) {
            revert ZeroAddress();
        }
        __UUPSManaged_init(admin_);
        __EIP712_init("FairWins CallsignRegistry", "1"); // signer-attributed intents (spec 035)

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

    /// @inheritdoc ICallsignRegistry
    function makeCommitment(string calldata callsign, address owner, bytes32 salt) external pure returns (bytes32) {
        (bool ok, bytes32 h,) = _validate(callsign);
        if (!ok) revert InvalidCallsignFormat();
        return _commitmentHash(h, owner, salt);
    }

    /// @inheritdoc ICallsignRegistry
    function commit(bytes32 commitment) external {
        _commit(commitment);
    }

    /// @inheritdoc ICallsignRegistry
    function register(string calldata callsign, bytes32 salt) external {
        _register(msg.sender, callsign, salt);
    }

    /// @inheritdoc ICallsignRegistry
    function changeCallsign(string calldata newCallsign, bytes32 salt) external {
        _changeCallsign(msg.sender, newCallsign, salt);
    }

    /// @inheritdoc ICallsignRegistry
    function release() external {
        _release(msg.sender);
    }

    function _commit(bytes32 commitment) internal {
        // The commitment value is public calldata, so a free timestamp refresh would let ANYONE replay a
        // victim's commitment to reset its age and grief their reveal (CommitmentTooNew forever). Reject
        // re-committing a still-unexpired commitment — re-commit is allowed only once the prior one has
        // expired (ENS anti-snipe pattern, research R3).
        uint64 existing = commitments[commitment];
        if (existing != 0 && block.timestamp <= uint256(existing) + maxCommitmentAge) revert CommitmentPending();
        commitments[commitment] = uint64(block.timestamp);
        emit CallsignCommitted(commitment, uint64(block.timestamp));
    }

    function _register(address owner, string calldata callsign, bytes32 salt) internal {
        (bool ok, bytes32 h, string memory canonical) = _validate(callsign);
        if (!ok) revert InvalidCallsignFormat();
        if (reserved[h]) revert CallsignIsReserved();
        if (callsignHashOf[owner] != bytes32(0)) revert AlreadyHasCallsign();
        if (_statusOf(h) != CallsignStatus.NONE) revert CallsignUnavailable();
        _requireEligible(owner);
        _consumeCommitment(h, owner, salt);
        _writeRecord(h, owner, canonical);
        emit CallsignRegistered(h, canonical, owner);
    }

    function _changeCallsign(address owner, string calldata newCallsign, bytes32 salt) internal {
        bytes32 oldH = callsignHashOf[owner];
        if (oldH == bytes32(0)) revert NoCallsign();
        uint64 nextAllowed = lastChangeAt[owner] + changeCooldown;
        if (lastChangeAt[owner] != 0 && block.timestamp < nextAllowed) revert ChangeCooldownActive(nextAllowed);

        (bool ok, bytes32 newH, string memory canonical) = _validate(newCallsign);
        if (!ok) revert InvalidCallsignFormat();
        if (newH == oldH) revert CallsignUnavailable();
        if (reserved[newH]) revert CallsignIsReserved();
        if (_statusOf(newH) != CallsignStatus.NONE) revert CallsignUnavailable();
        _requireEligible(owner);
        _consumeCommitment(newH, owner, salt);

        _quarantine(oldH, owner); // release old into quarantine (clears callsignHashOf[owner])
        _writeRecord(newH, owner, canonical);
        lastChangeAt[owner] = uint64(block.timestamp);
        emit CallsignChanged(oldH, newH, owner);
    }

    function _release(address owner) internal {
        bytes32 h = callsignHashOf[owner];
        if (h == bytes32(0)) revert NoCallsign();
        _quarantine(h, owner);
        emit CallsignReleased(h, owner, quarantinedUntil[h]);
    }

    // =========================================================================
    // Repointing (owner-authorized, delayed — FR-022). Tier-EXEMPT.
    // =========================================================================

    /// @inheritdoc ICallsignRegistry
    function requestRepoint(address newOwner) external {
        _requestRepoint(msg.sender, newOwner);
    }

    /// @inheritdoc ICallsignRegistry
    function cancelRepoint() external {
        _cancelRepoint(msg.sender);
    }

    /// @inheritdoc ICallsignRegistry
    function finalizeRepoint(bytes32 callsignHash) external {
        CallsignRecord storage r = _records[callsignHash];
        address from = r.owner;
        address to = r.pendingOwner;
        if (to == address(0)) revert NoPendingRepoint();
        if (block.timestamp < r.repointEffectiveAt) revert RepointNotReady();
        if (callsignHashOf[to] != bytes32(0)) revert TargetHasCallsign();
        // The incoming owner must itself be an eligible (Gold+, unsanctioned) identity BEFORE the callsign
        // moves. Repointing is tier-exempt for the OUTGOING owner (a lapsed owner isn't stranded) but the
        // destination must meet the standard — otherwise a non-member could repoint in a ring to reset the
        // lapse anchor indefinitely and hoard premium names for free, defeating FR-021. Finalize stays
        // permissionless; it simply cannot complete until `to` holds Gold.
        _requireEligible(to);

        delete callsignHashOf[from];
        r.owner = to;
        r.pendingOwner = address(0);
        r.repointEffectiveAt = 0;
        // Fresh ownership anchor for the now-Gold destination (belt-and-suspenders alongside its own
        // membership `expiresAt` in the grace calculation).
        r.registeredAt = uint64(block.timestamp);
        // A verification marker is granted to a specific reviewed identity — it must NOT ride along to a
        // different owner. Force re-verification after any owner change (mirrors changeCallsign, which also
        // resets `verified`). Suspension deliberately persists so moderation can't be shed by repointing.
        r.verified = false;
        callsignHashOf[to] = callsignHash;
        emit CallsignRepointFinalized(callsignHash, from, to);
    }

    function _requestRepoint(address owner, address newOwner) internal {
        if (newOwner == address(0) || newOwner == owner) revert BadRepointTarget();
        bytes32 h = callsignHashOf[owner];
        if (h == bytes32(0)) revert NoCallsign();
        if (callsignHashOf[newOwner] != bytes32(0)) revert TargetHasCallsign();
        CallsignRecord storage r = _records[h];
        r.pendingOwner = newOwner;
        r.repointEffectiveAt = uint64(block.timestamp) + repointDelay;
        emit CallsignRepointRequested(h, owner, newOwner, r.repointEffectiveAt);
    }

    function _cancelRepoint(address owner) internal {
        bytes32 h = callsignHashOf[owner];
        if (h == bytes32(0)) revert NoCallsign();
        CallsignRecord storage r = _records[h];
        if (r.pendingOwner == address(0)) revert NoPendingRepoint();
        r.pendingOwner = address(0);
        r.repointEffectiveAt = 0;
        emit CallsignRepointCancelled(h);
    }

    // =========================================================================
    // Lapse reclamation (permissionless, FR-021)
    // =========================================================================

    /// @inheritdoc ICallsignRegistry
    function reclaimLapsed(bytes32 callsignHash) external {
        CallsignRecord storage rec = _records[callsignHash];
        address owner = rec.owner;
        if (owner == address(0)) revert NoCallsign();
        if (!_isLapsed(owner, rec.registeredAt)) revert NotLapsed();
        _quarantine(callsignHash, owner);
        emit CallsignReclaimed(callsignHash, owner);
    }

    // =========================================================================
    // Resolution (FR-008/010)
    // =========================================================================

    /// @inheritdoc ICallsignRegistry
    function resolve(string calldata callsign) external view returns (CallsignInfo memory) {
        (bool ok, bytes32 h,) = _validate(callsign);
        if (!ok) return _emptyInfo();
        return _info(h);
    }

    /// @inheritdoc ICallsignRegistry
    function callsignOf(address account) external view returns (string memory) {
        bytes32 h = callsignHashOf[account];
        if (h == bytes32(0)) return "";
        // Reverse only reports a callsign whose forward resolution is ACTIVE (FR-008 integrity, FR-016).
        if (_statusOf(h) != CallsignStatus.ACTIVE) return "";
        return _records[h].callsign;
    }

    /// @inheritdoc ICallsignRegistry
    function getCallsignInfoByHash(bytes32 callsignHash) external view returns (CallsignInfo memory) {
        return _info(callsignHash);
    }

    /// @inheritdoc ICallsignRegistry
    function isAvailable(string calldata callsign) external view returns (bool) {
        (bool ok, bytes32 h,) = _validate(callsign);
        if (!ok) return false;
        return !reserved[h] && _statusOf(h) == CallsignStatus.NONE;
    }

    // =========================================================================
    // Gasless twins (SignerIntentBase) — self-submit fallbacks above
    // =========================================================================

    /// @inheritdoc ICallsignRegistry
    function commitWithSig(address owner, bytes32 commitment, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external {
        _verifyIntent(
            keccak256(abi.encode(COMMIT_CALLSIGN_TYPEHASH, owner, commitment, nonce, validAfter, validBefore)),
            owner, nonce, validAfter, validBefore, sig
        );
        _commit(commitment);
    }

    /// @inheritdoc ICallsignRegistry
    function registerWithSig(address owner, string calldata callsign, bytes32 salt, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external {
        _verifyIntent(
            keccak256(abi.encode(REGISTER_CALLSIGN_TYPEHASH, owner, keccak256(bytes(callsign)), salt, nonce, validAfter, validBefore)),
            owner, nonce, validAfter, validBefore, sig
        );
        _register(owner, callsign, salt);
    }

    /// @inheritdoc ICallsignRegistry
    function changeCallsignWithSig(address owner, string calldata newCallsign, bytes32 salt, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external {
        _verifyIntent(
            keccak256(abi.encode(CHANGE_CALLSIGN_TYPEHASH, owner, keccak256(bytes(newCallsign)), salt, nonce, validAfter, validBefore)),
            owner, nonce, validAfter, validBefore, sig
        );
        _changeCallsign(owner, newCallsign, salt);
    }

    /// @inheritdoc ICallsignRegistry
    function releaseWithSig(address owner, bytes32 callsignHash, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external {
        _verifyIntent(
            keccak256(abi.encode(RELEASE_CALLSIGN_TYPEHASH, owner, callsignHash, nonce, validAfter, validBefore)),
            owner, nonce, validAfter, validBefore, sig
        );
        if (callsignHashOf[owner] != callsignHash) revert NoCallsign(); // intent pins the exact callsign
        _release(owner);
    }

    /// @inheritdoc ICallsignRegistry
    function requestRepointWithSig(address owner, bytes32 callsignHash, address newOwner, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external {
        _verifyIntent(
            keccak256(abi.encode(REQUEST_REPOINT_TYPEHASH, owner, callsignHash, newOwner, nonce, validAfter, validBefore)),
            owner, nonce, validAfter, validBefore, sig
        );
        if (callsignHashOf[owner] != callsignHash) revert NoCallsign();
        _requestRepoint(owner, newOwner);
    }

    /// @inheritdoc ICallsignRegistry
    function cancelRepointWithSig(address owner, bytes32 callsignHash, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig) external {
        _verifyIntent(
            keccak256(abi.encode(CANCEL_REPOINT_TYPEHASH, owner, callsignHash, nonce, validAfter, validBefore)),
            owner, nonce, validAfter, validBefore, sig
        );
        if (callsignHashOf[owner] != callsignHash) revert NoCallsign();
        _cancelRepoint(owner);
    }

    // =========================================================================
    // Moderation / curation / verification (roles; never reassigns a callsign)
    // =========================================================================

    /// @inheritdoc ICallsignRegistry
    function setReserved(bytes32[] calldata callsignHashes, bool isReserved) external onlyRole(REGISTRY_CURATOR_ROLE) {
        for (uint256 i = 0; i < callsignHashes.length; i++) {
            reserved[callsignHashes[i]] = isReserved;
            emit CallsignReserved(callsignHashes[i], isReserved);
        }
    }

    /// @inheritdoc ICallsignRegistry
    function setSuspended(bytes32 callsignHash, bool isSuspended) external onlyRole(MODERATOR_ROLE) {
        _records[callsignHash].suspended = isSuspended;
        emit CallsignSuspended(callsignHash, isSuspended);
    }

    /// @inheritdoc ICallsignRegistry
    function setVerified(bytes32 callsignHash, bool isVerified) external onlyRole(VERIFIER_ROLE) {
        _records[callsignHash].verified = isVerified;
        emit CallsignVerificationSet(callsignHash, isVerified);
    }

    // =========================================================================
    // Admin (bounded policy params)
    // =========================================================================

    /// @inheritdoc ICallsignRegistry
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

    /// @inheritdoc ICallsignRegistry
    function setMembershipGate(bytes32 role, IMembershipManager.Tier tier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (uint8(tier) < uint8(IMembershipManager.Tier.Gold)) revert TierBelowFloor(); // never relax below Gold
        membershipRole = role;
        minTier = tier;
        emit MembershipGateSet(role, tier);
    }

    /// @inheritdoc ICallsignRegistry
    function setMembershipManager(address manager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (manager == address(0)) revert ZeroAddress();
        membershipManager = IMembershipManager(manager);
    }

    /// @inheritdoc ICallsignRegistry
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
    ///      grace runs from max(membership `expiresAt`, the callsign's ownership `anchor`). Using the ownership
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
        _records[h] = CallsignRecord({
            owner: owner,
            callsign: canonical,
            registeredAt: uint64(block.timestamp),
            pendingOwner: address(0),
            repointEffectiveAt: 0,
            suspended: false,
            verified: false
        });
        callsignHashOf[owner] = h;
        delete quarantinedUntil[h];
    }

    /// @dev Release `h` from `owner` into the quarantine window (clears the record + reverse index).
    function _quarantine(bytes32 h, address owner) internal {
        delete _records[h];
        delete callsignHashOf[owner];
        quarantinedUntil[h] = uint64(block.timestamp) + quarantinePeriod;
    }

    function _statusOf(bytes32 h) internal view returns (CallsignStatus) {
        CallsignRecord storage r = _records[h];
        if (r.owner == address(0)) {
            if (block.timestamp < quarantinedUntil[h]) return CallsignStatus.QUARANTINED;
            return CallsignStatus.NONE;
        }
        if (r.suspended) return CallsignStatus.SUSPENDED;
        if (r.pendingOwner != address(0) && block.timestamp < r.repointEffectiveAt) return CallsignStatus.REPOINTING;
        if (_isLapsed(r.owner, r.registeredAt)) return CallsignStatus.LAPSED_RECLAIMABLE;
        return CallsignStatus.ACTIVE;
    }

    function _info(bytes32 h) internal view returns (CallsignInfo memory) {
        CallsignRecord storage r = _records[h];
        return CallsignInfo({
            owner: r.owner,
            callsign: r.callsign,
            status: _statusOf(h),
            verified: r.verified,
            pendingOwner: r.pendingOwner,
            repointEffectiveAt: r.repointEffectiveAt,
            quarantinedUntil: quarantinedUntil[h]
        });
    }

    function _emptyInfo() internal pure returns (CallsignInfo memory) {
        return CallsignInfo(address(0), "", CallsignStatus.NONE, false, address(0), 0, 0);
    }

    function _commitmentHash(bytes32 callsignHash, address owner, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(callsignHash, owner, salt));
    }

    /// @dev Canonical-form validation (FR-003/005): 3–20 chars, `a-z0-9` + single interior hyphen; no
    ///      leading/trailing/consecutive hyphen; uppercase rejected (clients normalize before submitting).
    ///      Non-reverting: returns (ok, keccak256(callsign), callsign). ASCII whitelist is the homoglyph defense.
    function _validate(string calldata callsign) internal pure returns (bool ok, bytes32 h, string memory canonical) {
        bytes calldata b = bytes(callsign);
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
        return (true, keccak256(b), callsign);
    }
}
