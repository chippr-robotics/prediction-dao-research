// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/IWagerRegistry.sol";
import "../interfaces/IMembershipManager.sol";
import "../oracles/IOracleAdapter.sol";

/// @title WagerRegistry
/// @notice Peer-to-peer wager escrow. Each wager has a named creator and opponent,
///         a stake in an allowlisted ERC20 (USDC or WMATIC), and one of five
///         resolution types: Either / Creator / Opponent / ThirdParty / Polymarket.
contract WagerRegistry is IWagerRegistry, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant FRIEND_MARKET_ROLE = keccak256("FRIEND_MARKET_ROLE");

    uint64 public constant MAX_ACCEPT_WINDOW = 30 days;
    uint64 public constant MAX_RESOLVE_WINDOW = 180 days;

    IMembershipManager public membershipManager;
    IOracleAdapter public polymarketAdapter;

    mapping(address => bool) private _allowedTokens;
    mapping(uint256 => Wager) private _wagers;
    uint256 private _nextWagerId = 1;

    event MembershipManagerUpdated(address indexed manager);
    event PolymarketAdapterUpdated(address indexed adapter);
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

    constructor(
        address admin,
        address membershipManager_,
        address polymarketAdapter_,
        address[] memory initialTokens
    ) Ownable(admin) {
        if (admin == address(0) || membershipManager_ == address(0)) revert ZeroAddress();
        membershipManager = IMembershipManager(membershipManager_);
        polymarketAdapter = IOracleAdapter(polymarketAdapter_); // may be zero to disable
        for (uint256 i = 0; i < initialTokens.length; i++) {
            address t = initialTokens[i];
            if (t == address(0)) revert ZeroAddress();
            _allowedTokens[t] = true;
            emit TokenAllowed(t, true);
        }
    }

    // ---------- Admin ----------

    function setMembershipManager(address manager) external onlyOwner {
        if (manager == address(0)) revert ZeroAddress();
        membershipManager = IMembershipManager(manager);
        emit MembershipManagerUpdated(manager);
    }

    function setPolymarketAdapter(address adapter) external onlyOwner {
        polymarketAdapter = IOracleAdapter(adapter); // zero disables Polymarket type
        emit PolymarketAdapterUpdated(adapter);
    }

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        _allowedTokens[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

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
        bytes32 metadataHash
    ) external nonReentrant whenNotPaused returns (uint256 wagerId) {
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
        } else {
            if (polymarketConditionId != bytes32(0)) revert PolymarketDisallowed();
        }

        // Membership gate
        if (!membershipManager.checkCanCreate(msg.sender, FRIEND_MARKET_ROLE)) revert MembershipDenied();

        // Pull creator stake first (CEI: external call before state change)
        IERC20(token).safeTransferFrom(msg.sender, address(this), creatorStake);

        // Record creation in membership AFTER the transferFrom succeeds (avoids counter-revert race)
        membershipManager.recordCreate(msg.sender, FRIEND_MARKET_ROLE);

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

        emit WagerCreated(wagerId, msg.sender, opponent, token, creatorStake, opponentStake, resolutionType, metadataHash);
        if (resolutionType == ResolutionType.Polymarket) {
            emit PolymarketLinked(wagerId, polymarketConditionId, creatorIsYes);
        }
    }

    function acceptWager(uint256 wagerId) external nonReentrant whenNotPaused {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Open) revert NotOpen();
        if (msg.sender != w.opponent) revert NotOpponent();
        if (block.timestamp > w.acceptDeadline) revert AcceptExpired();

        w.status = Status.Active;
        IERC20(w.token).safeTransferFrom(msg.sender, address(this), w.opponentStake);

        emit WagerAccepted(wagerId, msg.sender);
    }

    function cancelOpen(uint256 wagerId) external nonReentrant {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Open) revert NotOpen();
        if (msg.sender != w.creator) revert NotCreator();

        w.status = Status.Cancelled;
        // Close membership counter
        membershipManager.recordClose(w.creator, FRIEND_MARKET_ROLE);

        IERC20(w.token).safeTransfer(w.creator, w.creatorStake);
        emit WagerCancelled(wagerId);
    }

    function declareWinner(uint256 wagerId, address winner) external nonReentrant {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Active) revert NotActive();
        if (block.timestamp > w.resolveDeadline) revert ResolveExpired();
        if (winner != w.creator && winner != w.opponent) revert WinnerNotParticipant();
        if (w.resolutionType == ResolutionType.Polymarket) revert NotAuthorized();

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
        membershipManager.recordClose(w.creator, FRIEND_MARKET_ROLE);

        emit WagerResolved(wagerId, winner, msg.sender);
    }

    function autoResolveFromPolymarket(uint256 wagerId) external nonReentrant {
        Wager storage w = _wagers[wagerId];
        if (w.status != Status.Active) revert NotActive();
        if (w.resolutionType != ResolutionType.Polymarket) revert NotAuthorized();
        if (address(polymarketAdapter) == address(0)) revert AdapterNotSet();

        (bool outcome, , uint256 resolvedAt) = polymarketAdapter.getOutcome(w.polymarketConditionId);
        if (resolvedAt == 0) revert ConditionNotResolved();

        // creatorIsYes maps Polymarket outcome to winner:
        //   creatorIsYes=true, outcome=true  → creator wins
        //   creatorIsYes=true, outcome=false → opponent wins
        //   creatorIsYes=false, outcome=true → opponent wins
        //   creatorIsYes=false, outcome=false→ creator wins
        address winner = (outcome == w.creatorIsYes) ? w.creator : w.opponent;
        w.status = Status.Resolved;
        w.winner = winner;
        membershipManager.recordClose(w.creator, FRIEND_MARKET_ROLE);

        emit WagerResolved(wagerId, winner, msg.sender);
    }

    function claimPayout(uint256 wagerId) external nonReentrant {
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
    function claimRefund(uint256 wagerId) external nonReentrant {
        Wager storage w = _wagers[wagerId];
        if (w.status == Status.Open) {
            if (block.timestamp <= w.acceptDeadline) revert NotRefundable();
            w.status = Status.Refunded;
            membershipManager.recordClose(w.creator, FRIEND_MARKET_ROLE);
            IERC20(w.token).safeTransfer(w.creator, w.creatorStake);
            emit WagerRefunded(wagerId, w.creator, address(0));
        } else if (w.status == Status.Active) {
            if (block.timestamp <= w.resolveDeadline) revert NotRefundable();
            w.status = Status.Refunded;
            membershipManager.recordClose(w.creator, FRIEND_MARKET_ROLE);
            IERC20 token = IERC20(w.token);
            token.safeTransfer(w.creator, w.creatorStake);
            token.safeTransfer(w.opponent, w.opponentStake);
            emit WagerRefunded(wagerId, w.creator, w.opponent);
        } else {
            revert NotRefundable();
        }
    }

    // ---------- Views ----------

    function getWager(uint256 wagerId) external view returns (Wager memory) {
        return _wagers[wagerId];
    }

    function isAllowedToken(address token) external view returns (bool) {
        return _allowedTokens[token];
    }

    function nextWagerId() external view returns (uint256) {
        return _nextWagerId;
    }
}
