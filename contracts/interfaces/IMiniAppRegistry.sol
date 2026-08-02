// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IMiniAppRegistry (spec 073)
/// @notice On-chain source of truth for the distributed mini-app platform: who published a mini-app, what it
///         is, where its package lives, and whether compliance has cleared it to execute. The registry is the
///         trust boundary — no off-chain system decides what operations staff may run — and it is fund-free:
///         it escrows nothing and holds no authority over anything but its own listings.
/// @dev    Every record carries TWO package tuples and the difference between them is the whole point:
///         `approved` is the ONLY tuple a host may ever fetch, hash-verify, and execute; `proposed` is a
///         vendor submission still awaiting review. A vendor update writes `proposed` and resets `status` to
///         Pending — it NEVER touches `approved` — so the version users are already running keeps running
///         until a curator promotes the new one (FR-003, data-model invariant I2).
///         See specs/073-miniapp-platform/ (data-model.md §1 for invariants I1–I5).
interface IMiniAppRegistry {
    /// @notice Compliance lifecycle of a listing. Only Approved listings are catalogued and launchable;
    ///         Deprecated is TERMINAL (every mutating call on a Deprecated record reverts).
    enum Status {
        Pending, // 0 — submitted or re-submitted, awaiting curator review
        Approved, // 1 — cleared to run; `approved` tuple is served
        Suspended, // 2 — pulled from the catalog by a curator; reversible via approveApp
        Deprecated // 3 — permanently retired; terminal
    }

    /// @notice Operational categories the catalog filters on (FR-008). Append-only: adding a category is
    ///         additive, but never reorder — the ordinal is what is stored on-chain and rendered off-chain.
    enum Category {
        TradeSettlement, // 0 — Trade Settlement
        Reconciliation, // 1 — Reconciliation
        TreasuryLiquidity, // 2 — Treasury & Liquidity
        IdentityCompliance, // 3 — Identity & Compliance
        AssetServicing, // 4 — Asset Servicing
        ReportingAudit // 5 — Reporting & Audit
    }

    /// @notice A content-addressed package release: where the bytes are and what they must hash to.
    /// @dev The gateway serving `cid` is UNTRUSTED — `manifestHash` (keccak256 of the package's
    ///      `manifest.json` bytes) is the integrity anchor the host checks before any code executes (FR-011),
    ///      and the manifest in turn carries per-file SHA-256 digests. `version` is monotonic per app.
    struct PackageRef {
        string cid;
        bytes32 manifestHash;
        uint64 version;
    }

    /// @notice Full public projection of a listing, shaped for indexer-free catalog and review reads (R6).
    /// @dev `approved` is what hosts serve; `proposed` is disclosure for reviewers and the vendor's own
    ///      status view — a host that fetches `proposed` is executing unreviewed code and is wrong.
    struct AppView {
        uint256 id;
        address vendor;
        string name;
        string description;
        Category category;
        Status status; // REVIEW state — not the serving decision; see `launchable`
        bool launchable; // may a host run this? (approved package present, not Suspended/Deprecated)
        PackageRef approved; // only tuple hosts may serve; empty until the first approval
        PackageRef proposed; // awaiting curator promotion; empty when nothing is in review
        uint64 submittedAt;
        uint64 approvedAt;
        uint64 updatedAt;
    }

    // ---- Vendor submissions (membership-gated when configured; sanctions-screened when a guard is set) ----
    function submitApp(
        string calldata name,
        string calldata description,
        Category category,
        string calldata cid,
        bytes32 manifestHash
    ) external returns (uint256 id);

    function submitUpdate(uint256 id, string calldata cid, bytes32 manifestHash) external;
    function updateMetadata(uint256 id, string calldata name, string calldata description, Category category) external;

    // ---- Curator lifecycle (APP_CURATOR_ROLE) ----
    /// @param expectedManifestHash The hash the curator REVIEWED. Reverts {StaleProposal} if the record no
    ///        longer holds it, so a vendor cannot swap the package under an in-flight (or front-run)
    ///        approval. There is deliberately no id-only overload.
    function approveApp(uint256 id, bytes32 expectedManifestHash) external;
    /// @notice Discard a proposed package without shipping it — the review outcome "this must not go live".
    /// @param expectedManifestHash The proposal the curator reviewed; same anti-swap guard as approval.
    function rejectProposal(uint256 id, bytes32 expectedManifestHash) external;
    function suspendApp(uint256 id) external;
    function deprecateApp(uint256 id) external;

    // ---- Admin config (DEFAULT_ADMIN_ROLE) ----
    function setMembershipGate(address manager, bytes32 role, uint8 minTier) external;
    function setSanctionsGuard(address guard) external;

    // ---- Views (indexer-free catalog reads) ----
    function appCount() external view returns (uint256);
    function getApp(uint256 id) external view returns (AppView memory);
    function getAppsPaged(uint256 offset, uint256 limit) external view returns (AppView[] memory);
    function appIdsByVendor(address vendor) external view returns (uint256[] memory);
    function idByName(string calldata name) external view returns (uint256);
    /// @notice THE serving decision, on-chain so no host re-derives it. A Pending record can be launchable:
    ///         a live app with an update in review keeps serving its last reviewed package (FR-003).
    function isLaunchable(uint256 id) external view returns (bool);

    // ---- Events (every mutation is indexable + reviewer-notifiable, FR-005) ----
    event AppSubmitted(
        uint256 indexed id,
        address indexed vendor,
        string name,
        Category category,
        string cid,
        bytes32 manifestHash,
        uint64 version
    );
    event AppUpdateSubmitted(
        uint256 indexed id,
        address indexed vendor,
        string cid,
        bytes32 manifestHash,
        uint64 version
    );
    /// @dev Carries `description` too: an indexer that only replays events must be able to reconstruct the
    ///      whole reviewed record (FR-005), and the description is a reviewed field.
    event AppMetadataUpdated(uint256 indexed id, string name, string description, Category category);
    /// @dev Carries the tuple that is now SERVED (the promoted `proposed`, or the retained `approved` on a
    ///      metadata-only re-review) so an indexer never has to guess which package went live.
    event AppApproved(uint256 indexed id, address indexed curator, string cid, bytes32 manifestHash, uint64 version);
    /// @dev Carries the DISCARDED tuple — the compliance record of what was refused, which is exactly the
    ///      history a reviewer needs and the one an approval-only log cannot show.
    event AppProposalRejected(
        uint256 indexed id,
        address indexed curator,
        string cid,
        bytes32 manifestHash,
        uint64 version
    );
    event AppSuspended(uint256 indexed id, address indexed curator);
    event AppDeprecated(uint256 indexed id, address indexed curator);
    event MembershipGateChanged(address manager, bytes32 role, uint8 minTier);
    event SanctionsGuardChanged(address guard);

    // ---- Errors ----
    error AppNotFound();
    error NotVendor();
    error InvalidStatus();
    /// @dev Suffixed to avoid colliding with the `AppDeprecated` event identifier.
    error AppDeprecatedError();
    error DuplicateName();
    error EmptyName();
    /// @dev Control bytes in a display name: invisible in a catalog card, so two listings could render
    ///      identically to a member while holding different uniqueness keys.
    error InvalidName();
    /// @dev The record no longer holds the package the curator reviewed — the anti-swap guard on
    ///      {approveApp} / {rejectProposal} fired. Re-review the current proposal before acting.
    error StaleProposal(bytes32 expected, bytes32 actual);
    error EmptyCid();
    error EmptyManifestHash();
    error StringTooLong();
    error NothingProposed();
    error InsufficientMembershipTier();
    error SanctionedAccount();
    error ZeroAddress();
    error InvalidGateConfig();
}
