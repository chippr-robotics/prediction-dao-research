// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IWagerRegistry.sol";
import "../interfaces/IMembershipManager.sol";
import "../interfaces/ISanctionsGuard.sol";
import "../oracles/IOracleAdapter.sol";

/// @title WagerRegistry
/// @notice Peer-to-peer wager escrow. Each wager has a named creator and opponent,
///         a stake in an allowlisted ERC20 (USDC or WMATIC), and one of five
///         resolution types: Either / Creator / Opponent / ThirdParty / Polymarket.
/// @dev    Role separation:
///           DEFAULT_ADMIN_ROLE       — config (membership manager, adapter, token allowlist)
///           GUARDIAN_ROLE            — emergency pause / unpause
///           ACCOUNT_MODERATOR_ROLE   — freeze / unfreeze individual accounts
///         A frozen account cannot create, accept, cancel, declare, claim, or refund
///         on this contract. See docs/system-overview/account-moderation.md.
contract WagerRegistry is IWagerRegistry, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    bytes32 public constant WAGER_PARTICIPANT_ROLE = keccak256("WAGER_PARTICIPANT_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant ACCOUNT_MODERATOR_ROLE = keccak256("ACCOUNT_MODERATOR_ROLE");

    uint64 public constant MAX_ACCEPT_WINDOW = 30 days;
    uint64 public constant MAX_RESOLVE_WINDOW = 180 days;

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
    uint256 private _nextWagerId = 1;

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

    modifier notFrozen(address user) {
        if (_frozen[user]) revert AccountFrozenError(user);
        _;
    }

    constructor(
        address admin,
        address membershipManager_,
        address polymarketAdapter_,
        address[] memory initialTokens
    ) {
        if (admin == address(0) || membershipManager_ == address(0)) revert ZeroAddress();
        membershipManager = IMembershipManager(membershipManager_);
        polymarketAdapter = IOracleAdapter(polymarketAdapter_); // may be zero to disable
        for (uint256 i = 0; i < initialTokens.length; i++) {
            address t = initialTokens[i];
            if (t == address(0)) revert ZeroAddress();
            _allowedTokens[t] = true;
            emit TokenAllowed(t, true);
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, admin);
        _grantRole(ACCOUNT_MODERATOR_ROLE, admin);
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
        if (acceptDeadline <= block.timestamp) revert BadDeadlines();
        if (resolveDeadline <= acceptDeadline) revert BadDeadlines();
        if (acceptDeadline > block.timestamp + MAX_ACCEPT_WINDOW) revert BadDeadlines();
        if (resolveDeadline > block.timestamp + MAX_RESOLVE_WINDOW) revert BadDeadlines();

        if (resolutionType == ResolutionType.ThirdParty) {
            if (arbitrator == address(0)) revert ArbitratorRequired();
            if (arbitrator == msg.sender || arbitrator == opponent) revert ArbitratorDisallowed();
        } else {
            if (arbitrator != address(0)) revert ArbitratorDisallowed();
        }

        if (resolutionType == ResolutionType.Polymarket) {
            if (polymarketConditionId == bytes32(0)) revert PolymarketRequired();
            if (address(polymarketAdapter) == address(0)) revert AdapterNotSet();
            // Stale-condition attack mitigation
            if (polymarketAdapter.isConditionResolved(polymarketConditionId)) revert ConditionAlreadyResolved();
        } else if (_isExtensibleOracleType(resolutionType)) {
            if (polymarketConditionId == bytes32(0)) revert OracleConditionRequired();
            IOracleAdapter adapter = oracleAdapters[resolutionType];
            if (address(adapter) == address(0)) revert OracleAdapterNotSet();
            // Stale-condition attack mitigation (parity with the Polymarket branch above)
            if (adapter.isConditionResolved(polymarketConditionId)) revert ConditionAlreadyResolved();
        } else {
            if (polymarketConditionId != bytes32(0)) revert PolymarketDisallowed();
        }

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

    function acceptWager(uint256 wagerId) external nonReentrant whenNotPaused notFrozen(msg.sender) {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Open) revert NotOpen();
        if (msg.sender != w.opponent) revert NotOpponent();
        if (block.timestamp > w.acceptDeadline) revert AcceptExpired();
        // Sanctions screen both parties (Spec 007, FR-054): the accepting opponent AND the
        // creator (counterparty) — a creator listed after creation blocks acceptance.
        _screen(msg.sender);
        _screen(w.creator);
        if (!membershipManager.checkCanCreate(msg.sender, WAGER_PARTICIPANT_ROLE)) revert MembershipDenied();

        w.status = Status.Active;
        IERC20(w.token).safeTransferFrom(msg.sender, address(this), w.opponentStake);
        membershipManager.recordCreate(msg.sender, WAGER_PARTICIPANT_ROLE);

        emit WagerAccepted(wagerId, msg.sender);
    }

    function cancelOpen(uint256 wagerId) external nonReentrant notFrozen(msg.sender) {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Open) revert NotOpen();
        if (msg.sender != w.creator) revert NotCreator();

        IERC20 token = IERC20(w.token);
        uint128 refund = w.creatorStake;
        address creator = w.creator;

        membershipManager.recordClose(creator, WAGER_PARTICIPANT_ROLE);
        delete _wagers[wagerId];

        token.safeTransfer(creator, refund);
        emit WagerCancelled(wagerId);
    }

    function declineWager(uint256 wagerId) external nonReentrant notFrozen(msg.sender) {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Open) revert NotOpen();
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
