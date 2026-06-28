// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import "../interfaces/IWagerRegistry.sol";
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
///         A frozen account cannot create, accept, cancel, declare, claim, or refund
///         on this contract. See docs/system-overview/account-moderation.md.
contract WagerRegistry is IWagerRegistry, UUPSManaged, ReentrancyGuardUpgradeable, PausableUpgradeable, EIP712Upgradeable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;
    using ECDSA for bytes32;

    bytes32 public constant WAGER_PARTICIPANT_ROLE = keccak256("WAGER_PARTICIPANT_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant ACCOUNT_MODERATOR_ROLE = keccak256("ACCOUNT_MODERATOR_ROLE");

    uint64 public constant MAX_ACCEPT_WINDOW = 30 days;
    uint64 public constant MAX_RESOLVE_WINDOW = 2160 days; // 72 months — supports elections and long-term contracts

    /// @notice EIP-712 typehash for an open-challenge acceptance. Binding `taker` (= msg.sender) to the
    ///         signature is the front-running defense (FR-011): a copied signature is useless to anyone else.
    bytes32 private constant OPEN_ACCEPT_TYPEHASH = keccak256("OpenAccept(uint256 wagerId,address taker)");

    IMembershipManager public membershipManager;
    IOracleAdapter public polymarketAdapter;

    /// @notice Non-bypassable on-chain sanctions guard (Spec 007, FR-054). When unset
    ///         (address(0)) screening is skipped — the production deploy wires it in.
    ISanctionsGuard public sanctionsGuard;

    /// @notice Generic registry for non-Polymarket oracle adapters keyed by ResolutionType.
    ///         Polymarket retains its dedicated `polymarketAdapter` slot for ABI compatibility.
    mapping(ResolutionType => IOracleAdapter) public oracleAdapters;

    mapping(address => bool) private _allowedTokens;
    mapping(uint256 => Wager) private _wagers;
    mapping(address => bool) private _frozen;

    /// @notice Governing T&C version hash bound to a wager at creation (Spec 007, FR-056/
    ///         FR-057). 0 ⇒ legacy/unbound (governed by the launch version). Set only via
    ///         createWagerWithTerms; never re-bound (prospective-only).
    mapping(uint256 => bytes32) public wagerTermsVersionHash;
    /// @dev Initialized to 1 in {initialize} (NOT inline — inline initializers run in constructor context
    ///      and are ignored behind a proxy, which would start wager ids at 0).
    uint256 private _nextWagerId;

    /// @notice Per-wager draw-consent bitmask for participant resolution types
    ///         (Either/Creator/Opponent). bit0 = creator agreed, bit1 = opponent
    ///         agreed. A draw settles only once both bits are set; cleared on
    ///         settle or revoke. Kept out of the Wager struct so getWager's ABI
    ///         is unchanged. Not used for ThirdParty (arbitrator settles solo)
    ///         or oracle types (a draw arises only from the oracle tie).
    mapping(uint256 => uint8) private _drawConsent;
    uint8 private constant _CONSENT_CREATOR = 1;
    uint8 private constant _CONSENT_OPPONENT = 2;
    uint8 private constant _CONSENT_BOTH = 3;

    /// @notice Append-only per-user index of every wager a participant has been part of.
    ///         Populated in `createWager` for both creator and opponent; never removed.
    ///         Enables O(N_user) lookup without log scans (avoids `eth_getLogs` block-range limits).
    mapping(address => EnumerableSet.UintSet) private _userWagerIds;

    // ---- Open challenges (feature 024), appended after all prior state (consumes 2 __gap slots) ----
    /// @notice Code-derived address committed to an open challenge. 0 ⇒ not an open challenge. Set in
    ///         createOpenWager; cleared when the wager leaves Open (accept / cancel / expire / refund).
    mapping(uint256 => address) public claimAuthority;
    /// @notice Reverse index: the single Open open-challenge for a claim authority (0 ⇒ none). Powers code
    ///         discovery (FR-007) and active-uniqueness (FR-006a).
    mapping(address => uint256) public openWagerIdByClaim;

    /// @dev Trailing storage reserve for append-only upgrades. Reduced 50 → 48 when the two open-challenge
    ///      mappings above were appended (feature 024). Never insert or reorder existing state above this gap.
    uint256[48] private __gap;

    event MembershipManagerUpdated(address indexed manager);
    event PolymarketAdapterUpdated(address indexed adapter);
    event SanctionsGuardUpdated(address indexed guard);
    event WagerTermsBound(uint256 indexed wagerId, bytes32 indexed termsVersionHash);
    event TokenAllowed(address indexed token, bool allowed);

    error ZeroAddress();
    error SelfWager();
    error NotAllowedToken();
    error ZeroStake();
    error BadDeadlines();
    error ArbitratorRequired();
    error ArbitratorDisallowed();
    error PolymarketRequired();
    error PolymarketDisallowed();
    error AdapterNotSet();
    error OracleAdapterNotSet();
    error OracleConditionRequired();
    error UnsupportedOracleResolutionType();
    error ConditionNotResolved();
    error ConditionAlreadyResolved();
    error MembershipDenied();
    error NotOpponent();
    error NotOpen();
    error NotActive();
    error AcceptExpired();
    error ResolveExpired();
    error NotAuthorized();
    error EitherRequiresEqualStakes();
    error WinnerNotParticipant();
    error NotWinner();
    error NotResolved();
    error AlreadyPaid();
    error NotRefundable();
    error NotCreator();
    error NotParticipant();
    error DrawNotApplicable();
    error NoDrawProposal();
    error AccountFrozenError(address user);
    // Open challenges (feature 024)
    error ZeroClaimAuthority();
    error ClaimAuthorityInUse();
    error OpenResolutionTypeNotAllowed();
    error NotOpenChallenge();
    error BadClaimSignature();
    error ArbitratorCannotTake();
    error InsufficientMembershipTier();
    error DeclineNotAllowedForOpenChallenge();

    modifier notFrozen(address user) {
        if (_frozen[user]) revert AccountFrozenError(user);
        _;
    }

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

    /// @dev Sanctions screen (Spec 007, FR-054). No-op when the guard is unset; otherwise
    ///      reverts ISanctionsGuard.SanctionedAddress(account) for a listed/sanctioned
    ///      address. Called read-only during the Checks phase (before effects/transfers).
    function _screen(address account) internal view {
        ISanctionsGuard guard = sanctionsGuard;
        if (address(guard) != address(0)) guard.checkBlocked(account);
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

    function _isExtensibleOracleType(ResolutionType rt) internal pure returns (bool) {
        return rt == ResolutionType.ChainlinkDataFeed
            || rt == ResolutionType.ChainlinkFunctions
            || rt == ResolutionType.UMA;
    }

    function _isOracleResolvedType(ResolutionType rt) internal pure returns (bool) {
        return rt == ResolutionType.Polymarket || _isExtensibleOracleType(rt);
    }

    /// @dev Shared deadline checks for both create paths (named-opponent and open challenge).
    function _checkDeadlines(uint64 acceptDeadline, uint64 resolveDeadline) internal view {
        if (acceptDeadline <= block.timestamp) revert BadDeadlines();
        if (resolveDeadline <= acceptDeadline) revert BadDeadlines();
        if (acceptDeadline > block.timestamp + MAX_ACCEPT_WINDOW) revert BadDeadlines();
        if (resolveDeadline > block.timestamp + MAX_RESOLVE_WINDOW) revert BadDeadlines();
    }

    /// @dev Shared oracle-condition validation/linkage for both create paths. For oracle types the condition
    ///      must be set, the adapter configured, and the condition not already resolved (stale-condition
    ///      mitigation); non-oracle types must not carry a condition.
    function _checkOracleLinkage(ResolutionType resolutionType, bytes32 conditionId) internal view {
        if (resolutionType == ResolutionType.Polymarket) {
            if (conditionId == bytes32(0)) revert PolymarketRequired();
            if (address(polymarketAdapter) == address(0)) revert AdapterNotSet();
            if (polymarketAdapter.isConditionResolved(conditionId)) revert ConditionAlreadyResolved();
        } else if (_isExtensibleOracleType(resolutionType)) {
            if (conditionId == bytes32(0)) revert OracleConditionRequired();
            IOracleAdapter adapter = oracleAdapters[resolutionType];
            if (address(adapter) == address(0)) revert OracleAdapterNotSet();
            if (adapter.isConditionResolved(conditionId)) revert ConditionAlreadyResolved();
        } else {
            if (conditionId != bytes32(0)) revert PolymarketDisallowed();
        }
    }

    /// @dev Shared accept-time gauntlet for both accept paths: sanctions-screen the taker (msg.sender) and
    ///      the creator, then enforce the membership gate on the taker. (Spec 007 FR-054 + membership.)
    function _runAcceptGuard(address creator) internal view {
        _screen(msg.sender);
        _screen(creator);
        if (!membershipManager.checkCanCreate(msg.sender, WAGER_PARTICIPANT_ROLE)) revert MembershipDenied();
    }

    /// @dev Shared accept tail for both accept paths: escrow the opponent's stake, charge the membership
    ///      counter, and emit {WagerAccepted}. Status/opponent effects happen at the call site first.
    function _settleAccept(uint256 wagerId, address token, uint128 opponentStake) internal {
        IERC20(token).safeTransferFrom(msg.sender, address(this), opponentStake);
        membershipManager.recordCreate(msg.sender, WAGER_PARTICIPANT_ROLE);
        emit WagerAccepted(wagerId, msg.sender);
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
        return _createWager(opponent, arbitrator, token, creatorStake, opponentStake, acceptDeadline, resolveDeadline, resolutionType, polymarketConditionId, creatorIsYes, metadataHash, metadataUri, bytes32(0));
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
        return _createWager(opponent, arbitrator, token, creatorStake, opponentStake, acceptDeadline, resolveDeadline, resolutionType, polymarketConditionId, creatorIsYes, metadataHash, metadataUri, termsVersionHash);
    }

    function _createWager(
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
    ) internal returns (uint256 wagerId) {
        // Sanctions screen (Spec 007, FR-054) — first Check, before any effects/transfers.
        _screen(msg.sender);
        if (opponent == address(0)) revert ZeroAddress();
        if (opponent == msg.sender) revert SelfWager();
        if (!_allowedTokens[token]) revert NotAllowedToken();
        if (creatorStake == 0 || opponentStake == 0) revert ZeroStake();
        _checkDeadlines(acceptDeadline, resolveDeadline);

        // "Either side submits the outcome" (ResolutionType.Either) is a mutual-trust
        // resolution path — no oracle, no arbitrator, and whoever calls declareWinner
        // first decides the result. That is only sound on a level peer-to-peer wager
        // where both sides stake the same amount. On an asymmetric "Offer" (leveraged)
        // wager the side risking less could self-declare and seize the larger
        // counterparty stake, so restrict Either to equal-stakes (non-leveraged) bets.
        if (resolutionType == ResolutionType.Either && creatorStake != opponentStake) {
            revert EitherRequiresEqualStakes();
        }

        if (resolutionType == ResolutionType.ThirdParty) {
            if (arbitrator == address(0)) revert ArbitratorRequired();
            if (arbitrator == msg.sender || arbitrator == opponent) revert ArbitratorDisallowed();
        } else {
            if (arbitrator != address(0)) revert ArbitratorDisallowed();
        }

        _checkOracleLinkage(resolutionType, polymarketConditionId);

        // Membership gate
        if (!membershipManager.checkCanCreate(msg.sender, WAGER_PARTICIPANT_ROLE)) revert MembershipDenied();

        // Effects
        wagerId = _nextWagerId++;
        Wager storage w = _wagers[wagerId];
        w.creator = msg.sender;
        w.opponent = opponent;
        w.arbitrator = arbitrator;
        w.token = token;
        w.creatorStake = creatorStake;
        w.opponentStake = opponentStake;
        w.acceptDeadline = acceptDeadline;
        w.resolveDeadline = resolveDeadline;
        w.resolutionType = resolutionType;
        w.status = Status.Open;
        w.creatorIsYes = creatorIsYes;
        w.metadataHash = metadataHash;
        w.polymarketConditionId = polymarketConditionId;
        w.metadataUri = metadataUri;

        _userWagerIds[msg.sender].add(wagerId);
        _userWagerIds[opponent].add(wagerId);
        // Spec Kit 005: index the arbitrator too (ThirdParty wagers set a non-zero
        // arbitrator) so they can discover the wagers they oversee via
        // getUserWagers(arbitrator) — enabling third-party resolution end-to-end.
        if (arbitrator != address(0)) {
            _userWagerIds[arbitrator].add(wagerId);
        }
        // Spec 007 (FR-056/FR-057): bind the governing T&C version (Effect, before
        // interactions). 0 ⇒ legacy/unbound. Prospective-only — never re-bound elsewhere.
        if (termsVersionHash != bytes32(0)) {
            wagerTermsVersionHash[wagerId] = termsVersionHash;
        }

        // Interactions
        IERC20(token).safeTransferFrom(msg.sender, address(this), creatorStake);
        membershipManager.recordCreate(msg.sender, WAGER_PARTICIPANT_ROLE);

        emit WagerCreated(wagerId, msg.sender, opponent, token, creatorStake, opponentStake, resolutionType, metadataHash, metadataUri);
        if (resolutionType == ResolutionType.Polymarket) {
            emit PolymarketLinked(wagerId, polymarketConditionId, creatorIsYes);
        } else if (_isExtensibleOracleType(resolutionType)) {
            emit OracleConditionLinked(wagerId, resolutionType, polymarketConditionId, creatorIsYes);
        }
        if (termsVersionHash != bytes32(0)) {
            emit WagerTermsBound(wagerId, termsVersionHash);
        }
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
        Wager storage w = _wagers[wagerId];
        address authority = claimAuthority[wagerId];
        if (w.status != Status.Open || authority == address(0)) revert NotOpenChallenge();
        if (block.timestamp > w.acceptDeadline) revert AcceptExpired();

        // Front-running resistant: the signature is only valid for this exact taker (= msg.sender). ECDSA
        // .recover rejects malleable/invalid signatures (never returns address(0) to collide with an unset slot).
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(OPEN_ACCEPT_TYPEHASH, wagerId, msg.sender)));
        if (digest.recover(signature) != authority) revert BadClaimSignature();

        if (msg.sender == w.creator) revert SelfWager();
        if (w.resolutionType == ResolutionType.ThirdParty && msg.sender == w.arbitrator) revert ArbitratorCannotTake();

        _runAcceptGuard(w.creator); // no tier floor — any active member may take (FR-013)

        // Effects
        w.opponent = msg.sender;
        w.status = Status.Active;
        _clearClaim(wagerId); // free the code for reuse (FR-006a) before interactions
        _userWagerIds[msg.sender].add(wagerId);
        _settleAccept(wagerId, w.token, w.opponentStake);
    }

    /// @dev Clear the claim-authority mappings when an open challenge leaves the Open state, freeing the code
    ///      for reuse. Called from acceptOpenWager, cancelOpen, the Open branch of claimRefund, and
    ///      batchExpireOpen. No-op for non-open-challenge wagers.
    function _clearClaim(uint256 wagerId) internal {
        address a = claimAuthority[wagerId];
        if (a != address(0)) {
            delete openWagerIdByClaim[a];
            delete claimAuthority[wagerId];
        }
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
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Open) revert NotOpen();
        if (msg.sender != w.opponent) revert NotOpponent();
        if (block.timestamp > w.acceptDeadline) revert AcceptExpired();
        // Sanctions screen both parties (Spec 007, FR-054) + membership gate on the accepting opponent.
        _runAcceptGuard(w.creator);

        w.status = Status.Active;
        _settleAccept(wagerId, w.token, w.opponentStake);
    }

    function cancelOpen(uint256 wagerId) external nonReentrant notFrozen(msg.sender) {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Open) revert NotOpen();
        if (msg.sender != w.creator) revert NotCreator();

        IERC20 token = IERC20(w.token);
        uint128 refund = w.creatorStake;
        address creator = w.creator;

        membershipManager.recordClose(creator, WAGER_PARTICIPANT_ROLE);
        _clearClaim(wagerId); // free the code if this was an open challenge (no-op otherwise)
        delete _wagers[wagerId];

        token.safeTransfer(creator, refund);
        emit WagerCancelled(wagerId);
    }

    function declineWager(uint256 wagerId) external nonReentrant notFrozen(msg.sender) {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Open) revert NotOpen();
        // Decline is a named-opponent action; an open challenge has no bound opponent. Reject it outright so
        // no party other than the creator (via cancelOpen) can release an unaccepted open challenge (FR-023).
        if (claimAuthority[wagerId] != address(0)) revert DeclineNotAllowedForOpenChallenge();
        if (msg.sender != w.opponent) revert NotOpponent();

        IERC20 token = IERC20(w.token);
        uint128 refund = w.creatorStake;
        address creator = w.creator;

        membershipManager.recordClose(creator, WAGER_PARTICIPANT_ROLE);
        delete _wagers[wagerId];

        token.safeTransfer(creator, refund);
        emit WagerDeclined(wagerId, msg.sender);
    }

    function declareWinner(uint256 wagerId, address winner) external nonReentrant notFrozen(msg.sender) {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Active) revert NotActive();
        if (block.timestamp > w.resolveDeadline) revert ResolveExpired();
        if (winner != w.creator && winner != w.opponent) revert WinnerNotParticipant();
        if (_isOracleResolvedType(w.resolutionType)) revert NotAuthorized();

        bool authorized;
        if (w.resolutionType == ResolutionType.Either) {
            authorized = (msg.sender == w.creator || msg.sender == w.opponent);
        } else if (w.resolutionType == ResolutionType.Creator) {
            authorized = (msg.sender == w.creator);
        } else if (w.resolutionType == ResolutionType.Opponent) {
            authorized = (msg.sender == w.opponent);
        } else if (w.resolutionType == ResolutionType.ThirdParty) {
            authorized = (msg.sender == w.arbitrator);
        }
        if (!authorized) revert NotAuthorized();

        w.status = Status.Resolved;
        w.winner = winner;
        membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
        membershipManager.recordClose(w.opponent, WAGER_PARTICIPANT_ROLE);

        emit WagerResolved(wagerId, winner, msg.sender);
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
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Active) revert NotActive();
        if (block.timestamp > w.resolveDeadline) revert ResolveExpired();
        if (_isOracleResolvedType(w.resolutionType)) revert DrawNotApplicable();

        if (w.resolutionType == ResolutionType.ThirdParty) {
            if (msg.sender != w.arbitrator) revert NotAuthorized();
            _settleDraw(wagerId, w);
            return;
        }

        // Participant types: accumulate mutual consent; settle only when both agree.
        uint8 bit;
        if (msg.sender == w.creator) {
            bit = _CONSENT_CREATOR;
        } else if (msg.sender == w.opponent) {
            bit = _CONSENT_OPPONENT;
        } else {
            revert NotParticipant();
        }

        uint8 consent = _drawConsent[wagerId];
        if ((consent & bit) == 0) {
            consent |= bit;
            _drawConsent[wagerId] = consent;
            emit DrawProposed(wagerId, msg.sender);
        }
        if (consent == _CONSENT_BOTH) {
            _settleDraw(wagerId, w);
        }
    }

    /// @notice Withdraw the caller's pending draw consent (participant types).
    ///         A one-sided proposal never locks the wager; this just clears the
    ///         caller's bit so they no longer agree to a draw.
    function revokeDraw(uint256 wagerId) external nonReentrant notFrozen(msg.sender) {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Active) revert NotActive();

        uint8 bit;
        if (msg.sender == w.creator) {
            bit = _CONSENT_CREATOR;
        } else if (msg.sender == w.opponent) {
            bit = _CONSENT_OPPONENT;
        } else {
            revert NotParticipant();
        }

        uint8 consent = _drawConsent[wagerId];
        if ((consent & bit) == 0) revert NoDrawProposal();
        _drawConsent[wagerId] = consent & ~bit;
        emit DrawRevoked(wagerId, msg.sender);
    }

    /// @dev Shared draw settlement: each party gets their own stake back, no
    ///      winner. Checks-effects-interactions — status and consent are cleared
    ///      before any token transfer (parity with claimRefund).
    function _settleDraw(uint256 wagerId, Wager storage w) internal {
        w.status = Status.Draw;
        delete _drawConsent[wagerId];
        membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
        membershipManager.recordClose(w.opponent, WAGER_PARTICIPANT_ROLE);

        IERC20 token = IERC20(w.token);
        token.safeTransfer(w.creator, w.creatorStake);
        token.safeTransfer(w.opponent, w.opponentStake);

        emit WagerDrawn(wagerId, w.creator, w.opponent, msg.sender);
    }

    function autoResolveFromPolymarket(uint256 wagerId) external nonReentrant {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Active) revert NotActive();
        if (w.resolutionType != ResolutionType.Polymarket) revert NotAuthorized();
        if (address(polymarketAdapter) == address(0)) revert AdapterNotSet();

        (bool outcome, , uint256 resolvedAt) = polymarketAdapter.getOutcome(w.polymarketConditionId);
        if (resolvedAt == 0) {
            // getOutcome returns resolvedAt==0 for BOTH "not resolved" and a
            // "resolved tie" (equal payout numerators). Disambiguate: a resolved
            // tie settles a DRAW immediately (both stakes back); a genuinely
            // unresolved market reverts (unchanged behavior).
            if (polymarketAdapter.isConditionResolved(w.polymarketConditionId)) {
                _settleDraw(wagerId, w);
                return;
            }
            revert ConditionNotResolved();
        }
        _settleOracleWin(wagerId, w, outcome);
    }

    /// @notice Generic resolve path for ChainlinkDataFeed / ChainlinkFunctions / UMA wagers.
    ///         Reads the cached outcome from the wager's configured adapter and sets the winner.
    function autoResolveFromOracle(uint256 wagerId) external nonReentrant {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Active) revert NotActive();
        if (!_isExtensibleOracleType(w.resolutionType)) revert NotAuthorized();

        IOracleAdapter adapter = oracleAdapters[w.resolutionType];
        if (address(adapter) == address(0)) revert OracleAdapterNotSet();

        (bool outcome, , uint256 resolvedAt) = adapter.getOutcome(w.polymarketConditionId);
        if (resolvedAt == 0) revert ConditionNotResolved();
        _settleOracleWin(wagerId, w, outcome);
    }

    /// @dev Shared body for oracle-driven settlement. creatorIsYes maps outcome to winner:
    ///      creatorIsYes=true,  outcome=true  -> creator wins
    ///      creatorIsYes=true,  outcome=false -> opponent wins
    ///      creatorIsYes=false, outcome=true  -> opponent wins
    ///      creatorIsYes=false, outcome=false -> creator wins
    function _settleOracleWin(uint256 wagerId, Wager storage w, bool outcome) internal {
        address winner = (outcome == w.creatorIsYes) ? w.creator : w.opponent;
        w.status = Status.Resolved;
        w.winner = winner;
        membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
        membershipManager.recordClose(w.opponent, WAGER_PARTICIPANT_ROLE);

        emit WagerResolved(wagerId, winner, msg.sender);
    }

    function claimPayout(uint256 wagerId) external nonReentrant notFrozen(msg.sender) {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Resolved) revert NotResolved();
        if (msg.sender != w.winner) revert NotWinner();
        if (w.paid) revert AlreadyPaid();

        w.paid = true;
        // Compute as uint256 to avoid uint128 overflow on sum
        uint256 payout = uint256(w.creatorStake) + uint256(w.opponentStake);
        IERC20(w.token).safeTransfer(w.winner, payout);

        emit PayoutClaimed(wagerId, w.winner, payout);
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
        Wager storage w = _wagers[wagerId];
        if (w.status == Status.Open) {
            if (block.timestamp <= w.acceptDeadline) revert NotRefundable();
            w.status = Status.Refunded;
            membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
            _clearClaim(wagerId); // free the code if this was an open challenge (no-op otherwise)
            IERC20(w.token).safeTransfer(w.creator, w.creatorStake);
            emit WagerRefunded(wagerId, w.creator, address(0));
        } else if (w.status == Status.Active) {
            if (block.timestamp <= w.resolveDeadline) revert NotRefundable();
            w.status = Status.Refunded;
            membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
            membershipManager.recordClose(w.opponent, WAGER_PARTICIPANT_ROLE);
            IERC20 token = IERC20(w.token);
            token.safeTransfer(w.creator, w.creatorStake);
            token.safeTransfer(w.opponent, w.opponentStake);
            emit WagerRefunded(wagerId, w.creator, w.opponent);
        } else {
            revert NotRefundable();
        }
    }

    // ---------- Batch expire ----------

    /// @notice Expire Open wagers whose accept deadline has passed, refund the
    ///         creator's stake, and release the concurrent-limit slot on
    ///         MembershipManager. Any address may call this (the refund always
    ///         goes to the original creator). Silently skips wager IDs that are
    ///         not eligible (wrong status, deadline not yet reached, etc.).
    function batchExpireOpen(uint256[] calldata wagerIds) external nonReentrant whenNotPaused {
        for (uint256 i = 0; i < wagerIds.length; i++) {
            Wager storage w = _wagers[wagerIds[i]];
            if (w.status != Status.Open) continue;
            if (block.timestamp <= w.acceptDeadline) continue;

            w.status = Status.Refunded;
            membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
            _clearClaim(wagerIds[i]); // free the code if this was an open challenge (no-op otherwise)
            IERC20(w.token).safeTransfer(w.creator, w.creatorStake);
            emit WagerRefunded(wagerIds[i], w.creator, address(0));
        }
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
