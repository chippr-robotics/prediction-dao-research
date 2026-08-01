// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import {IMiniAppRegistry} from "../interfaces/IMiniAppRegistry.sol";
import {IMembershipManager} from "../interfaces/IMembershipManager.sol";
import {ISanctionsGuard} from "../interfaces/ISanctionsGuard.sol";

/// @title MiniAppRegistry (spec 073)
/// @notice The curated catalog of the distributed mini-app platform, and the only authority on what operations
///         staff are allowed to run. A vendor submits a listing (metadata + a content-addressed package tuple)
///         which lands Pending; a curator multisig approves, suspends, or deprecates it. Hosts read this
///         registry at launch time, fetch ONLY the record's `approved` tuple, verify its manifest hash before
///         a single byte of package code executes, and refuse anything else.
/// @dev    Fund-free registry: it never holds, moves, or approves value, so there is no custody, oracle, or
///         payout surface. UUPS (UUPSManaged); append-only storage with a trailing `__gap`; registered in
///         `npm run check:storage-layout`.
///
///         EthTrust-SL2 target. Risk reasoning: the highest-value surfaces here are (a) the curator gate —
///         `APP_CURATOR_ROLE` is the platform's entire supply-chain trust boundary, held by the compliance
///         multisig and granted post-deploy, never in `initialize`; and (b) the approved/proposed split.
///         Invariants enforced by this contract (data-model.md §1):
///           I1 `approved.cid` is non-empty exactly when the app has ever been Approved, and it is the only
///              tuple a host may serve — `approveApp` can never leave an Approved record with no package;
///           I2 `submitUpdate` writes `proposed` only; `approveApp` is the sole promotion path, so a vendor
///              can never swap the bytes users are already running;
///           I3 Deprecated is terminal — every mutating call on a Deprecated record reverts;
///           I4 vendor metadata edits also force `status = Pending` (reviewed fields changed ⇒ re-review);
///           I5 vendor-only submit/update, curator-only lifecycle, admin-only gate config.
///         A Suspended listing is frozen for its vendor as well: allowing `submitUpdate` to move it back to
///         Pending would let a vendor clear a compliance suspension unilaterally.
///         Checks-effects-interactions is trivial — there are no external value calls at all. The only
///         external calls are `view` (membership tier, sanctions screen), i.e. staticcalls, so reentrancy is
///         impossible and no guard is needed.
///
///         No `SignerIntentBase` in v1 (research R4): the never-stranded rule protects member VALUE actions,
///         and nothing here moves value. Curator actions are multisig transactions and vendor submissions are
///         rare, self-submitted, admin-ish actions — the same reasoning that keeps `FeeRouter`,
///         `ExternalDAORegistry`, and `BridgeRouter` intent-free. `submitApp`/`submitUpdate` are the natural
///         `…WithSig` candidates if a gasless vendor rail is ever asked for.
contract MiniAppRegistry is IMiniAppRegistry, UUPSManaged {
    /// @notice Holders may approve / suspend / deprecate listings. Held by the compliance multisig; granted
    ///         post-deploy by the deploy script (the deployer self-grants only to seed the first-party apps,
    ///         then hands the role over). Deliberately separate from DEFAULT_ADMIN_ROLE: configuring the
    ///         gates and deciding what code may execute are different privileges.
    bytes32 public constant APP_CURATOR_ROLE = keccak256("APP_CURATOR_ROLE");

    // ---- Bounded inputs (caps per-write storage + event size; loosening one is an upgrade, never a setter) ----
    uint256 public constant MAX_NAME_LENGTH = 64;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 512;
    /// @dev CIDv1 base32 is ~60 chars; the bound is generous (BackupPointerRegistry precedent) and only
    ///      exists so a submission cannot bloat storage or logs.
    uint256 public constant MAX_CID_LENGTH = 256;
    /// @notice Hard ceiling on `getAppsPaged` page size. Larger requests are CLAMPED, not rejected: a view
    ///         that silently truncates is honest as long as the caller can keep paging by `offset`.
    uint256 public constant MAX_PAGE_LIMIT = 100;

    struct AppRecord {
        address vendor; // immutable after submission; the only account that may update the listing
        Category category;
        Status status;
        uint64 submittedAt;
        uint64 approvedAt;
        uint64 updatedAt;
        string name;
        string description;
        PackageRef approved; // the only tuple hosts may serve
        PackageRef proposed; // awaiting curator promotion
    }

    // ---- Append-only storage (never insert/reorder/remove above __gap) ----
    /// @notice Optional vendor tier gate. address(0) ⇒ gate disabled (anyone may submit a listing).
    IMembershipManager public membershipManager;
    /// @notice Role whose active tier is checked when the gate is enabled.
    bytes32 public membershipRole;
    /// @notice Minimum eligible `IMembershipManager.Tier` ordinal. Packs into the slot with `sanctionsGuard`.
    uint8 public minTier;
    /// @notice Optional sanctions screen. address(0) ⇒ screening disabled (the Mordor convention: networks
    ///         with no oracle degrade honestly rather than reverting every submission).
    ISanctionsGuard public sanctionsGuard;
    /// @notice Id allocator; ids start at 1 so 0 stays "no such app" in every index.
    uint256 public appCount;

    mapping(uint256 => AppRecord) private _apps;
    mapping(bytes32 => uint256) private _idByNameKey; // 0 = unused (ids start at 1)
    mapping(address => uint256[]) private _appsByVendor;

    uint256[43] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // UUPSManaged constructor already calls _disableInitializers().
    }

    /// @notice One-time initializer (replaces the constructor for the UUPS proxy).
    /// @param admin DEFAULT_ADMIN_ROLE + UPGRADER_ROLE holder. APP_CURATOR_ROLE is NOT granted here — the
    ///        deploy script grants it explicitly so the curator set is always a deliberate, recorded act.
    /// @param membershipManager_ Membership proxy, or address(0) to launch with the vendor tier gate off.
    /// @param membershipRole_ Role whose active tier is checked; must be non-zero when a manager is set.
    /// @param minTier_ Minimum `IMembershipManager.Tier` ordinal a vendor must hold (0 = None ⇒ no floor).
    /// @param sanctionsGuard_ Sanctions guard, or address(0) to disable screening.
    function initialize(
        address admin,
        address membershipManager_,
        bytes32 membershipRole_,
        uint8 minTier_,
        address sanctionsGuard_
    ) external initializer {
        if (admin == address(0)) revert ZeroAddress();
        __UUPSManaged_init(admin);

        _setMembershipGate(membershipManager_, membershipRole_, minTier_);
        sanctionsGuard = ISanctionsGuard(sanctionsGuard_); // may be zero
        // Emitted from the initializer too, so an indexer can reconstruct the full gate history from logs
        // alone without a special-cased "deployment defaults" read.
        emit SanctionsGuardChanged(sanctionsGuard_);
    }

    // =========================================================================
    // Vendor submissions (FR-001/006/021)
    // =========================================================================

    /// @inheritdoc IMiniAppRegistry
    function submitApp(
        string calldata name,
        string calldata description,
        Category category,
        string calldata cid,
        bytes32 manifestHash
    ) external returns (uint256 id) {
        _requireEligibleVendor(msg.sender);
        _checkMetadata(name, description);
        _checkPackage(cid, manifestHash);

        bytes32 nameKey = _nameKey(name);
        if (_idByNameKey[nameKey] != 0) revert DuplicateName();

        id = ++appCount;
        AppRecord storage rec = _apps[id];
        rec.vendor = msg.sender; // recorded immutably (FR-006)
        rec.name = name;
        rec.description = description;
        rec.category = category;
        rec.status = Status.Pending;
        // `approved` stays zeroed: a brand-new listing has nothing servable until a curator promotes this
        // tuple (invariant I1).
        rec.proposed = PackageRef({cid: cid, manifestHash: manifestHash, version: 1});
        rec.submittedAt = uint64(block.timestamp);
        rec.updatedAt = uint64(block.timestamp);

        _idByNameKey[nameKey] = id;
        _appsByVendor[msg.sender].push(id);

        emit AppSubmitted(id, msg.sender, name, category, cid, manifestHash, 1);
    }

    /// @inheritdoc IMiniAppRegistry
    /// @dev The core of FR-003 / invariant I2: this writes `proposed` and resets `status`, and it does NOT
    ///      touch `approved`. Members mid-session keep running the last approved package until a curator
    ///      promotes this one — a vendor can never hot-swap executing code.
    function submitUpdate(uint256 id, string calldata cid, bytes32 manifestHash) external {
        AppRecord storage rec = _requireVendorEditable(id);
        _requireEligibleVendor(msg.sender);
        _checkPackage(cid, manifestHash);

        uint64 version = _nextVersion(rec);
        rec.proposed = PackageRef({cid: cid, manifestHash: manifestHash, version: version});
        rec.status = Status.Pending;
        rec.updatedAt = uint64(block.timestamp);

        emit AppUpdateSubmitted(id, msg.sender, cid, manifestHash, version);
    }

    /// @inheritdoc IMiniAppRegistry
    /// @dev Invariant I4: name/description/category are REVIEWED fields, so editing them sends the listing
    ///      back to the queue exactly like a package change. `approved` is untouched, so the currently
    ///      approved package keeps serving while the new metadata awaits review.
    function updateMetadata(uint256 id, string calldata name, string calldata description, Category category)
        external
    {
        AppRecord storage rec = _requireVendorEditable(id);
        _requireEligibleVendor(msg.sender);
        _checkMetadata(name, description);

        bytes32 newKey = _nameKey(name);
        bytes32 oldKey = _nameKey(rec.name);
        if (newKey != oldKey) {
            if (_idByNameKey[newKey] != 0) revert DuplicateName();
            delete _idByNameKey[oldKey]; // the vacated name becomes claimable again
            _idByNameKey[newKey] = id;
        }

        rec.name = name;
        rec.description = description;
        rec.category = category;
        rec.status = Status.Pending;
        rec.updatedAt = uint64(block.timestamp);

        emit AppMetadataUpdated(id, name, category);
    }

    // =========================================================================
    // Curator lifecycle (FR-002/004/022) — APP_CURATOR_ROLE only
    // =========================================================================

    /// @inheritdoc IMiniAppRegistry
    /// @dev The ONLY promotion path (invariant I2). Two shapes, one function: with a `proposed` tuple it
    ///      promotes it and clears the slot; with none (a metadata-only re-review, or a suspension being
    ///      lifted) it simply reinstates the retained `approved` tuple.
    function approveApp(uint256 id) external onlyRole(APP_CURATOR_ROLE) {
        AppRecord storage rec = _requireApp(id);
        if (rec.status == Status.Deprecated) revert AppDeprecatedError(); // I3
        // Nothing to promote and nothing to reinstate: approving again would emit a lifecycle event that
        // reported no change. Reject rather than log a lie.
        if (rec.status == Status.Approved) revert InvalidStatus();

        PackageRef memory served = rec.proposed;
        if (bytes(served.cid).length != 0) {
            rec.approved = served;
            delete rec.proposed;
        } else {
            served = rec.approved;
            // Invariant I1: an Approved record must always have a servable package. Structurally
            // unreachable today (`submitApp` always writes `proposed`), kept as the guard that makes the
            // invariant hold for any future entrypoint rather than an unlaunchable catalog entry.
            if (bytes(served.cid).length == 0) revert NothingProposed();
        }

        rec.status = Status.Approved;
        rec.approvedAt = uint64(block.timestamp);
        rec.updatedAt = uint64(block.timestamp);

        emit AppApproved(id, msg.sender, served.cid, served.manifestHash, served.version);
    }

    /// @inheritdoc IMiniAppRegistry
    /// @dev Reachable from Pending as well as Approved, on purpose: a listing whose vendor has an update in
    ///      review is still Pending while its previously approved package continues to serve (FR-003), so
    ///      restricting suspension to Approved would let a vendor shield a live package from a curator by
    ///      keeping an update open. Reversible via `approveApp`.
    function suspendApp(uint256 id) external onlyRole(APP_CURATOR_ROLE) {
        AppRecord storage rec = _requireApp(id);
        if (rec.status == Status.Deprecated) revert AppDeprecatedError(); // I3
        if (rec.status == Status.Suspended) revert InvalidStatus();

        rec.status = Status.Suspended;
        rec.updatedAt = uint64(block.timestamp);

        emit AppSuspended(id, msg.sender);
    }

    /// @inheritdoc IMiniAppRegistry
    /// @dev Terminal (invariant I3). The pending submission is cleared because it will never be reviewed;
    ///      `approved` and the name reservation are deliberately KEPT — the record stays as the explanation
    ///      for members who used the app, and releasing the name would let someone else claim the identity
    ///      of a retired listing.
    function deprecateApp(uint256 id) external onlyRole(APP_CURATOR_ROLE) {
        AppRecord storage rec = _requireApp(id);
        if (rec.status == Status.Deprecated) revert AppDeprecatedError();

        rec.status = Status.Deprecated;
        delete rec.proposed;
        rec.updatedAt = uint64(block.timestamp);

        emit AppDeprecated(id, msg.sender);
    }

    // =========================================================================
    // Admin config (gates only — never lifecycle)
    // =========================================================================

    /// @inheritdoc IMiniAppRegistry
    function setMembershipGate(address manager, bytes32 role, uint8 minTier_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setMembershipGate(manager, role, minTier_);
    }

    /// @inheritdoc IMiniAppRegistry
    function setSanctionsGuard(address guard) external onlyRole(DEFAULT_ADMIN_ROLE) {
        sanctionsGuard = ISanctionsGuard(guard); // zero allowed (disable screening)
        emit SanctionsGuardChanged(guard);
    }

    // =========================================================================
    // Views (indexer-free catalog + review reads, R6)
    // =========================================================================

    /// @inheritdoc IMiniAppRegistry
    function getApp(uint256 id) external view returns (AppView memory) {
        return _toView(id, _requireApp(id));
    }

    /// @inheritdoc IMiniAppRegistry
    /// @dev `offset` is zero-based over ids 1..appCount. Both bounds are clamped (`limit` to
    ///      MAX_PAGE_LIMIT, the window to `appCount`) so a catalog page can never revert on an over-eager
    ///      request; an out-of-range `offset` returns an empty page.
    function getAppsPaged(uint256 offset, uint256 limit) external view returns (AppView[] memory apps) {
        uint256 total = appCount;
        if (offset >= total || limit == 0) return new AppView[](0);
        if (limit > MAX_PAGE_LIMIT) limit = MAX_PAGE_LIMIT;

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 n = end - offset;

        apps = new AppView[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 id = offset + i + 1; // ids start at 1
            apps[i] = _toView(id, _apps[id]);
        }
    }

    /// @inheritdoc IMiniAppRegistry
    function appIdsByVendor(address vendor) external view returns (uint256[] memory) {
        return _appsByVendor[vendor];
    }

    /// @inheritdoc IMiniAppRegistry
    /// @dev Applies the same normalization as every write, so a client can pre-check a display name for a
    ///      collision before paying for a submission.
    function idByName(string calldata name) external view returns (uint256) {
        return _idByNameKey[_nameKey(name)];
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    function _setMembershipGate(address manager, bytes32 role, uint8 tier) internal {
        // A configured manager with no role would gate every vendor on a role nobody can hold; a tier
        // ordinal above the enum's top value can never be reached by `getActiveTier`. Either misconfig
        // bricks submissions silently, so reject both loudly.
        if (manager != address(0) && role == bytes32(0)) revert InvalidGateConfig();
        if (tier > uint8(IMembershipManager.Tier.Platinum)) revert InvalidGateConfig();

        membershipManager = IMembershipManager(manager); // may be zero (gate disabled)
        membershipRole = role;
        minTier = tier;

        emit MembershipGateChanged(manager, role, tier);
    }

    /// @dev Vendor eligibility for any submission. Both gates are optional and each is skipped — never
    ///      failed — when unconfigured, so a network without membership or a sanctions oracle degrades to
    ///      an open registry instead of a dead one. The tier is READ only: listing an app moves no value
    ///      and grants no creation power, so (like `ExternalDAORegistry`) this never calls `recordCreate`
    ///      and never consumes a member's creation quota.
    function _requireEligibleVendor(address vendor) internal view {
        IMembershipManager manager = membershipManager;
        if (
            address(manager) != address(0) &&
            uint8(manager.getActiveTier(vendor, membershipRole)) < minTier
        ) revert InsufficientMembershipTier();

        ISanctionsGuard guard = sanctionsGuard;
        if (address(guard) != address(0) && !guard.isAllowed(vendor)) revert SanctionedAccount();
    }

    function _requireApp(uint256 id) internal view returns (AppRecord storage rec) {
        rec = _apps[id];
        // `vendor` is written once at submission and never cleared, so a zero vendor means "no such id".
        if (rec.vendor == address(0)) revert AppNotFound();
    }

    /// @dev Vendor-only (I5) and only while the listing is in the review loop. Deprecated is terminal (I3),
    ///      and a Suspended listing stays frozen until a curator acts — letting `submitUpdate` move it back
    ///      to Pending would let a vendor clear a compliance suspension unilaterally, which is precisely
    ///      what the suspension exists to prevent.
    function _requireVendorEditable(uint256 id) internal view returns (AppRecord storage rec) {
        rec = _requireApp(id);
        if (rec.vendor != msg.sender) revert NotVendor();
        if (rec.status == Status.Deprecated) revert AppDeprecatedError();
        if (rec.status == Status.Suspended) revert InvalidStatus();
    }

    function _checkMetadata(string calldata name, string calldata description) internal pure {
        uint256 nameLength = bytes(name).length;
        if (nameLength == 0) revert EmptyName();
        if (nameLength > MAX_NAME_LENGTH) revert StringTooLong();
        if (bytes(description).length > MAX_DESCRIPTION_LENGTH) revert StringTooLong();
    }

    /// @dev A package tuple must be able to anchor a launch: an empty CID has nothing to fetch and a zero
    ///      manifest hash could never match a real `keccak256`, so either one would produce a listing that
    ///      can only ever fail integrity verification.
    function _checkPackage(string calldata cid, bytes32 manifestHash) internal pure {
        uint256 cidLength = bytes(cid).length;
        if (cidLength == 0) revert EmptyCid();
        if (cidLength > MAX_CID_LENGTH) revert StringTooLong();
        if (manifestHash == bytes32(0)) revert EmptyManifestHash();
    }

    /// @dev Versions are monotonic per app and never reused. The last issued number is whichever tuple holds
    ///      the higher one: promotion moves `proposed` into `approved` and zeroes `proposed`, so no separate
    ///      counter (and no extra storage slot) is needed.
    function _nextVersion(AppRecord storage rec) internal view returns (uint64) {
        uint64 approvedVersion = rec.approved.version;
        uint64 proposedVersion = rec.proposed.version;
        return (approvedVersion >= proposedVersion ? approvedVersion : proposedVersion) + 1;
    }

    /// @dev Uniqueness key = keccak256 of the name with ASCII 'A'–'Z' folded to lower case. The rule is
    ///      deliberately ASCII-only: bytes >= 0x80 pass through untouched, so no Unicode case folding or
    ///      confusable mapping is attempted on-chain (the spec routes display-name lookalikes to human
    ///      reviewers, which is where that judgement belongs). Enforced identically on every write and on
    ///      `idByName`, so "Token Mint" and "token mint" are one listing.
    function _nameKey(string memory name) internal pure returns (bytes32) {
        bytes memory raw = bytes(name); // memory copy of the argument — safe to fold in place
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 char = raw[i];
            if (char >= 0x41 && char <= 0x5a) raw[i] = bytes1(uint8(char) + 32);
        }
        return keccak256(raw);
    }

    function _toView(uint256 id, AppRecord storage rec) internal view returns (AppView memory) {
        return AppView({
            id: id,
            vendor: rec.vendor,
            name: rec.name,
            description: rec.description,
            category: rec.category,
            status: rec.status,
            approved: rec.approved,
            proposed: rec.proposed,
            submittedAt: rec.submittedAt,
            approvedAt: rec.approvedAt,
            updatedAt: rec.updatedAt
        });
    }
}
