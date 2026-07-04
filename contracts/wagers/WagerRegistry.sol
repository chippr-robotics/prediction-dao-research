// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {WagerRegistryCore} from "./WagerRegistryCore.sol";
import {IWagerRegistry} from "../interfaces/IWagerRegistry.sol";
import {IWagerRegistryIntents} from "../interfaces/IWagerRegistryIntents.sol";
import "../interfaces/IMembershipManager.sol";
import "../interfaces/ISanctionsGuard.sol";
import "../oracles/IOracleAdapter.sol";

/// @title WagerRegistry
/// @notice Peer-to-peer wager escrow. Each wager has a named creator and opponent,
///         a stake in an allowlisted ERC20 (USDC or WMATIC), and a resolution type:
///         Either / Creator / Opponent / ThirdParty / Polymarket (plus extensible
///         oracle types). `Either` lets either party submit the outcome and is only
///         permitted on equal-stakes (non-leveraged) wagers — asymmetric "Offer"
///         stakes must use a single settler, an arbitrator, or an oracle.
/// @dev    Role separation:
///           DEFAULT_ADMIN_ROLE       — config (membership manager, adapter, token allowlist)
///           GUARDIAN_ROLE            — emergency pause / unpause
///           ACCOUNT_MODERATOR_ROLE   — freeze / unfreeze individual accounts
///           UPGRADER_ROLE            — implementation upgrades AND the intents extension facet
///         A frozen account cannot create, accept, cancel, declare, claim, or refund
///         on this contract. See docs/system-overview/account-moderation.md.
///
///         FACETS (spec 035): the implementation sits against the 24 KB code-size limit, so the
///         signer-attributed intent twins (and relocated cold paths like batchExpireOpen) live in
///         a second implementation, {WagerRegistryIntents}, reached through this contract's
///         fallback via delegatecall. Both facets inherit {WagerRegistryCore}, so they share one
///         storage layout and one set of internal action bodies; callers see a single contract at
///         the proxy address (one ABI, one EIP-712 domain, one event stream).
contract WagerRegistry is IWagerRegistry, WagerRegistryCore {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    event MembershipManagerUpdated(address indexed manager);
    event PolymarketAdapterUpdated(address indexed adapter);
    event SanctionsGuardUpdated(address indexed guard);
    event TokenAllowed(address indexed token, bool allowed);
    event IntentExtensionUpdated(address indexed extension);

    error UnknownFunction();

    /// @notice One-time initializer (replaces the constructor for the UUPS proxy). Behavior-identical to the
    ///         former constructor. Callable exactly once; the implementation's own initializers are disabled
    ///         by {UUPSManaged} so a bare implementation can never be initialized.
    function initialize(
        address admin,
        address membershipManager_,
        address polymarketAdapter_,
        address[] memory initialTokens
    ) external initializer {
        __UUPSManaged_init(admin); // UUPS + AccessControl; grants DEFAULT_ADMIN_ROLE + UPGRADER_ROLE to admin
        __ReentrancyGuard_init();
        __Pausable_init();
        __EIP712_init("FairWins WagerRegistry", "1"); // open-challenge accept signatures (feature 024)

        if (admin == address(0) || membershipManager_ == address(0)) revert ZeroAddress();
        membershipManager = IMembershipManager(membershipManager_);
        polymarketAdapter = IOracleAdapter(polymarketAdapter_); // may be zero to disable
        for (uint256 i = 0; i < initialTokens.length; i++) {
            address t = initialTokens[i];
            if (t == address(0)) revert ZeroAddress();
            _allowedTokens[t] = true;
            emit TokenAllowed(t, true);
        }
        _grantRole(GUARDIAN_ROLE, admin);
        _grantRole(ACCOUNT_MODERATOR_ROLE, admin);
        _nextWagerId = 1; // MOVED from the inline initializer (must run behind the proxy)
    }

    /// @notice One-time upgrade initializer for feature 024 (open challenges). Because 024 ships as an
    ///         in-place upgrade of an already-initialized proxy, the constructor-replacement {initialize}
    ///         does NOT run again — so the EIP-712 domain (used by acceptOpenWager signatures) is set here,
    ///         invoked via `upgradeToAndCall` during the upgrade. Fresh deploys set it in {initialize} and
    ///         never call this (reinitializer(2) > the version-1 initializer). Runs at most once.
    function initializeOpenChallenges() external reinitializer(2) {
        __EIP712_init("FairWins WagerRegistry", "1");
    }

    // ---------- Intents extension facet (spec 035) ----------

    /// @notice Route unknown selectors — the signer-attributed intent twins, nonce management, and
    ///         relocated cold paths — to the {WagerRegistryIntents} extension facet. Executes in THIS
    ///         proxy's storage context, so state, events, and the EIP-712 domain are the proxy's own.
    /// @dev    delegatecall to an UPGRADER_ROLE-controlled implementation — the same trust class as a
    ///         UUPS upgrade, which is why {setIntentExtension} is gated by UPGRADER_ROLE.
    /// @custom:oz-upgrades-unsafe-allow delegatecall
    fallback() external {
        address ext = intentExtension;
        if (ext == address(0)) revert UnknownFunction();
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), ext, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    /// @notice Point the fallback at a (new) {WagerRegistryIntents} implementation, or zero to disable
    ///         the intent surface. UPGRADER_ROLE only — the extension runs with full storage access, so
    ///         changing it is equivalent in authority to an implementation upgrade (floppy-signed).
    function setIntentExtension(address extension) external onlyRole(UPGRADER_ROLE) {
        intentExtension = extension;
        emit IntentExtensionUpdated(extension);
    }

    // ---------- Admin ----------

    function setMembershipManager(address manager) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (manager == address(0)) revert ZeroAddress();
        membershipManager = IMembershipManager(manager);
        emit MembershipManagerUpdated(manager);
    }

    function setPolymarketAdapter(address adapter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        polymarketAdapter = IOracleAdapter(adapter); // zero disables Polymarket type
        emit PolymarketAdapterUpdated(adapter);
    }

    /// @notice Set the on-chain sanctions guard. Pass address(0) to disable screening.
    function setSanctionsGuard(address guard) external onlyRole(DEFAULT_ADMIN_ROLE) {
        sanctionsGuard = ISanctionsGuard(guard);
        emit SanctionsGuardUpdated(guard);
    }

    /// @notice Set the adapter for one of the new (non-Polymarket) oracle resolution types.
    ///         Pass `address(0)` to disable that resolution type.
    /// @dev Rejects the legacy types — Either/Creator/Opponent/ThirdParty have no adapter,
    ///      and Polymarket continues using `setPolymarketAdapter`.
    function setOracleAdapter(ResolutionType rtype, address adapter) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_isExtensibleOracleType(rtype)) revert UnsupportedOracleResolutionType();
        oracleAdapters[rtype] = IOracleAdapter(adapter);
        emit OracleAdapterUpdated(rtype, adapter);
    }

    function setTokenAllowed(address token, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        _allowedTokens[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    function pause() external onlyRole(GUARDIAN_ROLE) { _pause(); }
    function unpause() external onlyRole(GUARDIAN_ROLE) { _unpause(); }

    // ---------- Account moderation ----------

    function freezeAccount(address user, string calldata reason)
        external
        onlyRole(ACCOUNT_MODERATOR_ROLE)
    {
        if (user == address(0)) revert ZeroAddress();
        _frozen[user] = true;
        emit AccountFrozen(user, msg.sender, reason);
    }

    function unfreezeAccount(address user) external onlyRole(ACCOUNT_MODERATOR_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        _frozen[user] = false;
        emit AccountUnfrozen(user, msg.sender);
    }

    function isFrozen(address user) external view returns (bool) {
        return _frozen[user];
    }

    // ---------- Lifecycle ----------

    function createWager(
        address opponent,
        address arbitrator,
        address token,
        uint128 creatorStake,
        uint128 opponentStake,
        uint64 acceptDeadline,
        uint64 resolveDeadline,
        ResolutionType resolutionType,
        bytes32 polymarketConditionId,
        bool creatorIsYes,
        bytes32 metadataHash,
        string calldata metadataUri
    ) external nonReentrant whenNotPaused notFrozen(msg.sender) returns (uint256 wagerId) {
        // Existing ABI preserved: no governing-terms binding (legacy path).
        return _createWager(
            msg.sender,
            IWagerRegistryIntents.CreateArgs(opponent, arbitrator, token, creatorStake, opponentStake, acceptDeadline, resolveDeadline, resolutionType, polymarketConditionId, creatorIsYes, metadataHash, metadataUri, bytes32(0), bytes32(0)),
            false,
            _emptyAuth()
        );
    }

    /// @notice Like {createWager} but binds the governing T&C version hash on-chain at
    ///         creation (Spec 007, FR-056/FR-058). The hash is the SHA-256 of the in-force
    ///         Terms; it is recorded in {wagerTermsVersionHash} and emitted via
    ///         {WagerTermsBound}, and is also bound into the wager's encrypted metadata AAD.
    function createWagerWithTerms(
        address opponent,
        address arbitrator,
        address token,
        uint128 creatorStake,
        uint128 opponentStake,
        uint64 acceptDeadline,
        uint64 resolveDeadline,
        ResolutionType resolutionType,
        bytes32 polymarketConditionId,
        bool creatorIsYes,
        bytes32 metadataHash,
        string calldata metadataUri,
        bytes32 termsVersionHash
    ) external nonReentrant whenNotPaused notFrozen(msg.sender) returns (uint256 wagerId) {
        return _createWager(
            msg.sender,
            IWagerRegistryIntents.CreateArgs(opponent, arbitrator, token, creatorStake, opponentStake, acceptDeadline, resolveDeadline, resolutionType, polymarketConditionId, creatorIsYes, metadataHash, metadataUri, termsVersionHash, bytes32(0)),
            false,
            _emptyAuth()
        );
    }

    // ---------- Open challenges (feature 024) ----------

    /// @notice Create an open challenge: a wager with NO named opponent, gated by a code-derived
    ///         `claimAuthority_`. Equal stakes only (single `stake`). Restricted to trust-minimized
    ///         resolution types (oracle / Either / ThirdParty — NOT Creator/Opponent). Silver+ to create.
    function createOpenWager(
        address claimAuthority_,
        address arbitrator,
        address token,
        uint128 stake,
        uint64 acceptDeadline,
        uint64 resolveDeadline,
        ResolutionType resolutionType,
        bytes32 oracleConditionId,
        bool creatorIsYes,
        bytes32 metadataHash,
        string calldata metadataUri
    ) external nonReentrant whenNotPaused notFrozen(msg.sender) returns (uint256 wagerId) {
        // Checks
        _screen(msg.sender);
        if (claimAuthority_ == address(0)) revert ZeroClaimAuthority();
        if (openWagerIdByClaim[claimAuthority_] != 0) revert ClaimAuthorityInUse(); // active-uniqueness (FR-006a)
        if (!_allowedTokens[token]) revert NotAllowedToken();
        if (stake == 0) revert ZeroStake();
        _checkDeadlines(acceptDeadline, resolveDeadline);

        // Resolution-type restriction (FR-016a): single-party self-resolution is barred because the taker is
        // unknown at creation — a lone unknown party must never be the sole resolver.
        if (resolutionType == ResolutionType.Creator || resolutionType == ResolutionType.Opponent) {
            revert OpenResolutionTypeNotAllowed();
        }

        if (resolutionType == ResolutionType.ThirdParty) {
            if (arbitrator == address(0)) revert ArbitratorRequired();
            // The opponent is unknown now, so the arbitrator != opponent half is enforced at accept.
            if (arbitrator == msg.sender) revert ArbitratorDisallowed();
        } else {
            if (arbitrator != address(0)) revert ArbitratorDisallowed();
        }

        _checkOracleLinkage(resolutionType, oracleConditionId);

        // Membership gate + Silver-tier-or-above creation privilege (FR-005a). Participation (accept) has no
        // tier floor; only creating an open challenge is gatekept.
        if (!membershipManager.checkCanCreate(msg.sender, WAGER_PARTICIPANT_ROLE)) revert MembershipDenied();
        if (uint8(membershipManager.getActiveTier(msg.sender, WAGER_PARTICIPANT_ROLE)) < uint8(IMembershipManager.Tier.Silver)) {
            revert InsufficientMembershipTier();
        }

        // Effects — equal stakes by construction (creatorStake == opponentStake == stake), opponent unbound.
        wagerId = _nextWagerId++;
        Wager storage w = _wagers[wagerId];
        w.creator = msg.sender;
        // w.opponent stays address(0) until acceptOpenWager binds the taker.
        w.arbitrator = arbitrator;
        w.token = token;
        w.creatorStake = stake;
        w.opponentStake = stake;
        w.acceptDeadline = acceptDeadline;
        w.resolveDeadline = resolveDeadline;
        w.resolutionType = resolutionType;
        w.status = Status.Open;
        w.creatorIsYes = creatorIsYes;
        w.metadataHash = metadataHash;
        w.polymarketConditionId = oracleConditionId;
        w.metadataUri = metadataUri;

        claimAuthority[wagerId] = claimAuthority_;
        openWagerIdByClaim[claimAuthority_] = wagerId;

        _userWagerIds[msg.sender].add(wagerId);
        if (arbitrator != address(0)) {
            _userWagerIds[arbitrator].add(wagerId);
        }

        // Interactions
        IERC20(token).safeTransferFrom(msg.sender, address(this), stake);
        membershipManager.recordCreate(msg.sender, WAGER_PARTICIPANT_ROLE);

        emit OpenWagerCreated(wagerId, msg.sender, claimAuthority_, token, stake, resolutionType, metadataHash, metadataUri);
        if (resolutionType == ResolutionType.Polymarket) {
            emit PolymarketLinked(wagerId, oracleConditionId, creatorIsYes);
        } else if (_isExtensibleOracleType(resolutionType)) {
            emit OracleConditionLinked(wagerId, resolutionType, oracleConditionId, creatorIsYes);
        }
    }

    /// @notice Accept an open challenge by proving knowledge of the claim code via an EIP-712 signature from
    ///         the code-derived key over (wagerId, msg.sender). Binds the taker as opponent; runs the same
    ///         accept-time gauntlet as {acceptWager}. No tier floor — any active member may take (FR-013).
    function acceptOpenWager(uint256 wagerId, bytes calldata signature)
        external
        nonReentrant
        whenNotPaused
        notFrozen(msg.sender)
    {
        _acceptOpenWager(msg.sender, wagerId, signature, false, _emptyAuth());
    }

    /// @notice Active open wager id for a code-derived authority, or 0 if none. Discovery entrypoint (FR-007).
    function openWagerIdForClaim(address authority) external view returns (uint256) {
        return openWagerIdByClaim[authority];
    }

    /// @notice True iff the wager is an open challenge still awaiting a taker.
    function isOpenChallenge(uint256 wagerId) external view returns (bool) {
        return claimAuthority[wagerId] != address(0) && _wagers[wagerId].status == Status.Open;
    }

    function acceptWager(uint256 wagerId) external nonReentrant whenNotPaused notFrozen(msg.sender) {
        _acceptWager(msg.sender, wagerId, false, _emptyAuth());
    }

    function cancelOpen(uint256 wagerId) external nonReentrant notFrozen(msg.sender) {
        _cancelOpen(msg.sender, wagerId);
    }

    function declineWager(uint256 wagerId) external nonReentrant notFrozen(msg.sender) {
        _declineWager(msg.sender, wagerId);
    }

    function declareWinner(uint256 wagerId, address winner) external nonReentrant notFrozen(msg.sender) {
        _declareWinner(msg.sender, wagerId, winner);
    }

    /// @notice Settle, or move toward settling, a wager as a DRAW (each party's
    ///         own stake returned, no winner). Participant types
    ///         (Either/Creator/Opponent) require BOTH participants to agree: the
    ///         first call records the caller's consent (emits DrawProposed), the
    ///         second settles. A ThirdParty arbitrator settles alone. Oracle
    ///         types cannot be drawn manually — a draw there arises only from the
    ///         oracle tie (see autoResolveFromPolymarket).
    /// @dev Not whenNotPaused: a draw is an exit path that returns funds to the
    ///      participants, so it stays available while paused (parity with
    ///      declareWinner / claimRefund). Frozen accounts cannot drive it.
    function declareDraw(uint256 wagerId) external nonReentrant notFrozen(msg.sender) {
        _declareDraw(msg.sender, wagerId);
    }

    /// @notice Withdraw the caller's pending draw consent (participant types).
    ///         A one-sided proposal never locks the wager; this just clears the
    ///         caller's bit so they no longer agree to a draw.
    function revokeDraw(uint256 wagerId) external nonReentrant notFrozen(msg.sender) {
        _revokeDraw(msg.sender, wagerId);
    }

    // NOTE (spec 035): autoResolveFromPolymarket / autoResolveFromOracle / batchExpireOpen are
    // served by the {WagerRegistryIntents} facet via the fallback — same proxy address, same ABI,
    // unchanged behavior. Relocated to keep this implementation under the 24 KB code-size limit.

    function claimPayout(uint256 wagerId) external nonReentrant notFrozen(msg.sender) {
        _claimPayout(msg.sender, wagerId);
    }

    /// @notice Refund path:
    ///   1. status==Open && now > acceptDeadline → creator gets creatorStake back.
    ///   2. status==Active && now > resolveDeadline (and not resolved) → both
    ///      participants get their respective stakes back.
    /// @dev    Refunds go to creator / opponent (recipients of the original stakes),
    ///         not to `msg.sender`. We still gate on `msg.sender` not being frozen so
    ///         a frozen account can't drive settlement; either counterparty (or a
    ///         neutral third party) can trigger a refund on a legitimate wager.
    function claimRefund(uint256 wagerId) external nonReentrant notFrozen(msg.sender) {
        _claimRefund(wagerId);
    }

    // ---------- Views ----------

    function getWager(uint256 wagerId) external view returns (Wager memory) {
        return _wagers[wagerId];
    }

    /// @notice Pending draw-consent for a wager (participant resolution types).
    ///         Both true would have already settled, so at most one is true for
    ///         a live wager; both read false once drawn, revoked, or never proposed.
    function drawConsent(uint256 wagerId) external view returns (bool creatorAgreed, bool opponentAgreed) {
        uint8 c = _drawConsent[wagerId];
        return ((c & _CONSENT_CREATOR) != 0, (c & _CONSENT_OPPONENT) != 0);
    }

    function isAllowedToken(address token) external view returns (bool) {
        return _allowedTokens[token];
    }

    function nextWagerId() external view returns (uint256) {
        return _nextWagerId;
    }

    function getUserWagerCount(address user) external view returns (uint256) {
        return _userWagerIds[user].length();
    }

    /// @notice Paginated slice of a user's wager IDs. `offset` and `limit` are clamped
    ///         to the available range so callers can safely page past the end.
    function getUserWagerIds(address user, uint256 offset, uint256 limit)
        public
        view
        returns (uint256[] memory ids)
    {
        EnumerableSet.UintSet storage set = _userWagerIds[user];
        uint256 total = set.length();
        if (offset >= total || limit == 0) return new uint256[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 n = end - offset;
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            ids[i] = set.at(offset + i);
        }
    }

    /// @notice Paginated slice of a user's wagers as full structs. Order matches
    ///         `getUserWagerIds(user, offset, limit)`.
    function getUserWagers(address user, uint256 offset, uint256 limit)
        external
        view
        returns (Wager[] memory wagers)
    {
        uint256[] memory ids = getUserWagerIds(user, offset, limit);
        wagers = new Wager[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            wagers[i] = _wagers[ids[i]];
        }
    }
}
