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
///           I2 `submitUpdate` writes `proposed` only, and `approveApp` — the sole promotion path — is
///              CONTENT-COMMITTED: the curator names the exact `manifestHash` they reviewed and the call
///              reverts if the record no longer holds it. Naming the id alone would be a time-of-check /
///              time-of-use hole: a multisig approval is public for as long as it takes to collect
///              signatures, and a vendor who lands `submitUpdate` inside that window (or simply front-runs
///              the approval transaction) would otherwise have unreviewed bytes promoted under a curator's
///              signature — and the host's integrity chain would happily execute them, because the tampered
///              manifest hashes correctly. Binding the approval to content is what makes "only reviewed
///              bytes can become servable" true rather than merely intended;
///           I3 Deprecated is terminal — every mutating call on a Deprecated record reverts;
///           I4 vendor metadata edits also force `status = Pending` (reviewed fields changed ⇒ re-review);
///           I5 vendor-only submit/update, curator-only lifecycle, admin-only gate config.
///
///         SERVING vs REVIEW STATE. `status` is the REVIEW state; it is not by itself the answer to "may a
///         host run this?". Ask `isLaunchable(id)` (also surfaced as `AppView.launchable`), which is true
///         exactly when the record holds an approved package and is neither Suspended nor Deprecated. A
///         listing whose vendor has an update in review is therefore Pending AND launchable — it keeps
///         serving the last reviewed package (FR-003). Deriving launchability from `status == Approved`
///         instead would hand every vendor an offline switch for their own live app: submitting any update
///         would pull a reviewed, working package out of the catalog until a curator got around to it.
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
    /// @notice Holders may approve / reject / suspend / deprecate listings. Held by the compliance multisig.
    ///         SELF-ADMINISTERING: `initialize` sets this role as its own admin, so only a curator can add or
    ///         remove a curator. Without that, the separation from DEFAULT_ADMIN_ROLE would be decorative —
    ///         OpenZeppelin defaults every role's admin to DEFAULT_ADMIN_ROLE, so the gate administrator
    ///         could self-grant curation in one transaction and the "trust boundary" would be a comment.
    /// @dev    The trade-off is deliberate: if every curator key is lost, curation freezes and the only way
    ///         back is a UUPS upgrade. That is the loud, visible, auditable recovery path — preferable to a
    ///         quiet one that doubles as a bypass. UPGRADER_ROLE remains a strict superset of this role by
    ///         construction (it can install logic that writes anything), which is why the deploy runbook puts
    ///         it on the multisig/timelock rather than an EOA.
    bytes32 public constant APP_CURATOR_ROLE = keccak256("APP_CURATOR_ROLE");

    // ---- Bounded inputs (caps per-write storage + event size; loosening one is an upgrade, never a setter) ----
    uint256 public constant MAX_NAME_LENGTH = 64;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 512;
    /// @dev CIDv1 base32 is ~60 chars; the bound is generous (BackupPointerRegistry precedent) and only
    ///      exists so a submission cannot bloat storage or logs.
    uint256 public constant MAX_CID_LENGTH = 256;
    /// @notice Hard ceiling on `getAppsPaged` page size. Larger requests are CLAMPED, not rejected: a view
    ///         that silently truncates is honest as long as the caller can keep paging by `offset`.
    /// @dev    Sized against the WORST case, not the typical one: each entry can carry a 64-byte name, a
    ///         512-byte description and two 256-byte CIDs, all vendor-controlled, so a page of 100 could
    ///         approach ~180 KB of ABI-encoded return data and blow past the `eth_call` gas caps public RPC
    ///         providers actually enforce — the catalog would fail on exactly the networks members use.
    ///         25 keeps a worst-case page inside a comfortable margin.
    uint256 public constant MAX_PAGE_LIMIT = 25;

    struct AppRecord {
        address vendor; // immutable after submission; the only account that may update the listing
        Category category;
        Status status;
        uint64 submittedAt;
        uint64 approvedAt;
        uint64 updatedAt;
        /// @dev High-water mark of every version ever ISSUED for this app, including ones that were
        ///      rejected or superseded before approval. Derived state (max of the two tuples) would fall
        ///      back the moment `proposed` is cleared, so a rejected v2 would be followed by a second,
        ///      different v2 — and a compliance log that records "v2 rejected" then "v2 approved" cannot
        ///      be read honestly. Packs with the timestamps above; costs no extra slot.
        uint64 lastVersion;
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
    /// @param admin DEFAULT_ADMIN_ROLE + UPGRADER_ROLE holder (gate configuration and upgrades only).
    /// @param curator The first APP_CURATOR_ROLE holder. REQUIRED and non-zero: the curator role administers
    ///        itself, so a registry initialized without one could never be granted a curator at all and every
    ///        listing would be stuck Pending forever. The deploy script passes the deployer here to seed the
    ///        first-party catalog, then grants the compliance multisig and renounces.
    /// @param membershipManager_ Membership proxy, or address(0) to launch with the vendor tier gate off.
    /// @param membershipRole_ Role whose active tier is checked; must be non-zero when a manager is set.
    /// @param minTier_ Minimum `IMembershipManager.Tier` ordinal a vendor must hold (0 = None ⇒ no floor).
    /// @param sanctionsGuard_ Sanctions guard, or address(0) to disable screening.
    function initialize(
        address admin,
        address curator,
        address membershipManager_,
        bytes32 membershipRole_,
        uint8 minTier_,
        address sanctionsGuard_
    ) external initializer {
        if (admin == address(0) || curator == address(0)) revert ZeroAddress();
        __UUPSManaged_init(admin);

        // Curation administers itself — see APP_CURATOR_ROLE. This MUST precede the grant below, and the
        // grant MUST happen here: once the role admin is the role itself, an empty curator set is terminal.
        _setRoleAdmin(APP_CURATOR_ROLE, APP_CURATOR_ROLE);
        _grantRole(APP_CURATOR_ROLE, curator);

        _setMembershipGate(membershipManager_, membershipRole_, minTier_);
        if (sanctionsGuard_ != address(0) && sanctionsGuard_.code.length == 0) revert InvalidGateConfig();
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
        rec.proposed = PackageRef({cid: cid, manifestHash: manifestHash, version: _issueVersion(rec)});
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

        uint64 version = _issueVersion(rec);
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

        emit AppMetadataUpdated(id, name, description, category);
    }

    // =========================================================================
    // Curator lifecycle (FR-002/004/022) — APP_CURATOR_ROLE only
    // =========================================================================

    /// @inheritdoc IMiniAppRegistry
    /// @dev The ONLY promotion path (invariant I2), and it is CONTENT-COMMITTED: `expectedManifestHash` is
    ///      the hash the curator actually reviewed, and the call reverts with {StaleProposal} if the record
    ///      no longer holds it. This is the whole defence against a vendor swapping `proposed` out from
    ///      under an in-flight approval — by front-running the transaction, or during the hours-to-days a
    ///      multisig spends collecting signatures on public calldata. Never relax this to an id-only call.
    ///
    ///      Two shapes, one function: with a `proposed` tuple it promotes that; with none (a metadata-only
    ///      re-review) it reinstates the retained `approved` tuple. Either way the curator names the hash,
    ///      so "reinstate what was already approved" cannot silently promote a proposal that happens to be
    ///      armed — to reinstate while a proposal is outstanding, {rejectProposal} it first.
    function approveApp(uint256 id, bytes32 expectedManifestHash) external onlyRole(APP_CURATOR_ROLE) {
        AppRecord storage rec = _requireApp(id);
        if (rec.status == Status.Deprecated) revert AppDeprecatedError(); // I3
        // Nothing to promote and nothing to reinstate: approving again would emit a lifecycle event that
        // reported no change. Reject rather than log a lie.
        if (rec.status == Status.Approved) revert InvalidStatus();

        PackageRef memory served = rec.proposed;
        bool promoting = bytes(served.cid).length != 0;
        if (!promoting) {
            served = rec.approved;
            // Invariant I1: an Approved record must always have a servable package. Structurally
            // unreachable today (`submitApp` always writes `proposed`), kept as the guard that makes the
            // invariant hold for any future entrypoint rather than an unlaunchable catalog entry.
            if (bytes(served.cid).length == 0) revert NothingProposed();
        }
        // The time-of-check / time-of-use guard. Checked BEFORE any state change.
        if (served.manifestHash != expectedManifestHash) {
            revert StaleProposal(expectedManifestHash, served.manifestHash);
        }

        if (promoting) {
            rec.approved = served;
            delete rec.proposed;
        }
        rec.status = Status.Approved;
        rec.approvedAt = uint64(block.timestamp);
        rec.updatedAt = uint64(block.timestamp);

        emit AppApproved(id, msg.sender, served.cid, served.manifestHash, served.version);
    }

    /// @inheritdoc IMiniAppRegistry
    /// @dev The review outcome that has to exist: "this package must not ship". Without it a curator's only
    ///      options are to leave the tuple armed for the next approval, suspend the listing (which delists a
    ///      known-good approved package as collateral damage), or deprecate it (terminal, for a fixable
    ///      submission) — so a rejected proposal would linger as a trap. Content-committed for the same
    ///      reason as {approveApp}: a vendor must not be able to swap in a different tuple and have it
    ///      quietly discarded, or discard a fresh good-faith submission the curator has not seen.
    ///
    ///      A record that has been approved before returns to Approved and keeps serving its reviewed
    ///      package; one that never has stays Pending with nothing servable. Either way the vendor may
    ///      submit again.
    function rejectProposal(uint256 id, bytes32 expectedManifestHash) external onlyRole(APP_CURATOR_ROLE) {
        AppRecord storage rec = _requireApp(id);
        if (rec.status == Status.Deprecated) revert AppDeprecatedError(); // I3

        PackageRef memory rejected = rec.proposed;
        if (bytes(rejected.cid).length == 0) revert NothingProposed();
        if (rejected.manifestHash != expectedManifestHash) {
            revert StaleProposal(expectedManifestHash, rejected.manifestHash);
        }

        delete rec.proposed;
        // Suspended is a curator decision about the LISTING and outranks a proposal outcome — rejecting a
        // proposal must not quietly un-suspend an app.
        if (rec.status != Status.Suspended && bytes(rec.approved.cid).length != 0) {
            rec.status = Status.Approved;
        }
        rec.updatedAt = uint64(block.timestamp);

        emit AppProposalRejected(id, msg.sender, rejected.cid, rejected.manifestHash, rejected.version);
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
    /// @dev Same contract-code check as the membership gate: a non-contract guard would make
    ///      `isAllowed` return empty data and brick every submission with an undecodable revert.
    function setSanctionsGuard(address guard) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (guard != address(0) && guard.code.length == 0) revert InvalidGateConfig();
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
    /// @dev THE serving decision, expressed once on-chain so every host does not re-derive it (and get it
    ///      subtly wrong). True exactly when the record holds a curator-approved package and the listing is
    ///      neither Suspended nor Deprecated. Note a Pending record CAN be launchable: that is a live app
    ///      with an update in review, still serving the last reviewed bytes (FR-003).
    function isLaunchable(uint256 id) public view returns (bool) {
        AppRecord storage rec = _apps[id];
        if (rec.vendor == address(0)) return false;
        if (rec.status == Status.Suspended || rec.status == Status.Deprecated) return false;
        return bytes(rec.approved.cid).length != 0;
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
        // An EOA (or a wrong-network address) answers `getActiveTier` with empty returndata, which the
        // ABI decoder then rejects — every submission would revert with NO decodable reason and the
        // registry would look broken rather than misconfigured. Cheap to catch here, miserable to
        // diagnose in production.
        if (manager != address(0) && manager.code.length == 0) revert InvalidGateConfig();

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

    /// @dev A name must be non-empty AFTER normalization — otherwise " " (or any run of spaces) passes a
    ///      raw length check, normalizes to the empty key, and the first such submission claims the key
    ///      keccak256("") that every later blank name would collide with. Control bytes are rejected
    ///      outright: they are invisible in a catalog card, so they would let two listings render
    ///      identically to a member while holding different keys.
    function _checkMetadata(string calldata name, string calldata description) internal pure {
        bytes memory raw = bytes(name);
        if (raw.length == 0 || raw.length > MAX_NAME_LENGTH) {
            if (raw.length == 0) revert EmptyName();
            revert StringTooLong();
        }
        bool hasVisible = false;
        for (uint256 i = 0; i < raw.length; i++) {
            uint8 char = uint8(raw[i]);
            if (char < 0x20 || char == 0x7f) revert InvalidName(); // C0 controls + DEL
            if (char != 0x20) hasVisible = true;
        }
        if (!hasVisible) revert EmptyName();
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

    /// @dev Versions are monotonic per app and NEVER reused — including across rejections. Reads the
    ///      persisted high-water mark rather than deriving one from the live tuples, because clearing
    ///      `proposed` (on rejection, or on promotion) would otherwise let the next submission reissue a
    ///      number that already appeared in a lifecycle event.
    function _issueVersion(AppRecord storage rec) internal returns (uint64 next) {
        unchecked {
            next = rec.lastVersion + 1; // uint64 exhaustion is unreachable: one increment per submission
        }
        rec.lastVersion = next;
    }

    /// @dev Uniqueness key = keccak256 of the name lower-cased (ASCII) with runs of spaces collapsed and
    ///      leading/trailing spaces dropped, so "Token Mint", "token  mint" and " TOKEN MINT " are ONE
    ///      listing. Folding case alone would leave the cheapest lookalikes — an extra space or a leading
    ///      one — registrable as separate names, which is exactly the impersonation a duplicate-name guard
    ///      is supposed to make expensive.
    ///
    ///      Deliberately ASCII-only beyond that: bytes >= 0x80 pass through untouched, so no Unicode case
    ///      folding or confusable mapping is attempted on-chain (the spec routes lookalike display names to
    ///      human reviewers, which is where that judgement belongs). This guard raises the cost of trivial
    ///      collisions; it is NOT impersonation protection, and the review panel must not present it as one.
    ///      Enforced identically on every write and on `idByName`.
    function _nameKey(string memory name) internal pure returns (bytes32) {
        bytes memory raw = bytes(name); // memory copy of the argument — safe to fold in place
        bytes memory out = new bytes(raw.length);
        uint256 n = 0;
        bool pendingSpace = false;
        for (uint256 i = 0; i < raw.length; i++) {
            uint8 char = uint8(raw[i]);
            if (char == 0x20) {
                if (n != 0) pendingSpace = true; // never leading; collapses runs
                continue;
            }
            if (pendingSpace) {
                out[n++] = 0x20;
                pendingSpace = false;
            }
            if (char >= 0x41 && char <= 0x5a) char += 32; // ASCII 'A'-'Z' -> lower
            out[n++] = bytes1(char);
        }
        // Trailing run discarded with `pendingSpace`. Shrink to the used prefix before hashing.
        assembly {
            mstore(out, n)
        }
        return keccak256(out);
    }

    function _toView(uint256 id, AppRecord storage rec) internal view returns (AppView memory) {
        return AppView({
            id: id,
            vendor: rec.vendor,
            name: rec.name,
            description: rec.description,
            category: rec.category,
            status: rec.status,
            // Carried in the view so a catalog page answers "may I run this?" without a second call per
            // record — and so no client has to reimplement the rule.
            launchable: isLaunchable(id),
            approved: rec.approved,
            proposed: rec.proposed,
            submittedAt: rec.submittedAt,
            approvedAt: rec.approvedAt,
            updatedAt: rec.updatedAt
        });
    }
}
