// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "./IOracleAdapter.sol";

/// @title ChainlinkDataFeedOracleAdapter
/// @notice IOracleAdapter that resolves binary outcomes by reading a Chainlink price feed
///         after a configured deadline and comparing the answer to a threshold.
contract ChainlinkDataFeedOracleAdapter is IOracleAdapter, Ownable, ReentrancyGuard {
    enum Comparison { GT, GTE, LT, LTE, EQ }

    struct FeedConfig {
        address feed;
        int256 threshold;
        Comparison op;
        uint64 deadline;
        bool registered;
    }

    struct CachedResolution {
        bool outcome;
        uint64 resolvedAt;
        uint96 confidence;
        bool exists;
    }

    mapping(bytes32 => FeedConfig) public conditions;
    mapping(bytes32 => CachedResolution) public resolutionCache;
    mapping(uint256 => bytes32) public marketToCondition;
    mapping(address => bool) public allowedFeeds;

    event FeedAllowed(address indexed feed, bool allowed);
    event MarketLinked(uint256 indexed friendMarketId, bytes32 indexed conditionId);
    event ConditionEvaluated(bytes32 indexed conditionId, int256 answer, bool outcome);

    error ConditionNotRegistered();
    error ConditionAlreadyRegistered();
    error DeadlineNotReached();
    error StaleFeedData();
    error InvalidComparisonOp();
    error FeedNotAllowed();
    error AlreadyResolved();
    error InvalidAddress();
    error InvalidDeadline();
    error MarketAlreadyLinked();

    constructor(address admin) Ownable(admin) {}

    // ========== Admin ==========

    function setFeedAllowed(address feed, bool allowed) external onlyOwner {
        if (feed == address(0)) revert InvalidAddress();
        allowedFeeds[feed] = allowed;
        emit FeedAllowed(feed, allowed);
    }

    function registerCondition(
        bytes32 conditionId,
        address feed,
        int256 threshold,
        Comparison op,
        uint64 deadline
    ) external onlyOwner {
        if (conditionId == bytes32(0)) revert ConditionNotRegistered();
        if (conditions[conditionId].registered) revert ConditionAlreadyRegistered();
        if (!allowedFeeds[feed]) revert FeedNotAllowed();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (uint8(op) > uint8(Comparison.EQ)) revert InvalidComparisonOp();

        conditions[conditionId] = FeedConfig({
            feed: feed,
            threshold: threshold,
            op: op,
            deadline: deadline,
            registered: true
        });

        emit ConditionRegistered(conditionId, "", deadline);
    }

    function linkMarket(uint256 friendMarketId, bytes32 conditionId) external onlyOwner {
        if (!conditions[conditionId].registered) revert ConditionNotRegistered();
        if (marketToCondition[friendMarketId] != bytes32(0)) revert MarketAlreadyLinked();
        marketToCondition[friendMarketId] = conditionId;
        emit MarketLinked(friendMarketId, conditionId);
    }

    // ========== Resolution ==========

    /// @notice Read the underlying feed at/after the deadline and cache the boolean outcome.
    /// @dev Anyone may call once the deadline has passed; the result is purely a function of
    ///      the public feed answer.
    function evaluate(bytes32 conditionId) external nonReentrant returns (bool outcome) {
        FeedConfig storage cfg = conditions[conditionId];
        if (!cfg.registered) revert ConditionNotRegistered();
        if (resolutionCache[conditionId].exists) revert AlreadyResolved();
        if (block.timestamp < cfg.deadline) revert DeadlineNotReached();

        (, int256 answer, , uint256 updatedAt, ) = AggregatorV3Interface(cfg.feed).latestRoundData();
        if (updatedAt == 0 || updatedAt < cfg.deadline) revert StaleFeedData();

        outcome = _compare(answer, cfg.threshold, cfg.op);

        resolutionCache[conditionId] = CachedResolution({
            outcome: outcome,
            resolvedAt: uint64(block.timestamp),
            confidence: 10_000,
            exists: true
        });

        emit ConditionEvaluated(conditionId, answer, outcome);
        emit ConditionResolved(conditionId, outcome, 10_000, block.timestamp);
    }

    function _compare(int256 a, int256 b, Comparison op) internal pure returns (bool) {
        if (op == Comparison.GT)  return a >  b;
        if (op == Comparison.GTE) return a >= b;
        if (op == Comparison.LT)  return a <  b;
        if (op == Comparison.LTE) return a <= b;
        return a == b;
    }

    // ========== IOracleAdapter ==========

    function oracleType() external pure override returns (string memory) {
        return "ChainlinkDataFeed";
    }

    function isAvailable() external pure override returns (bool) {
        return true;
    }

    function getConfiguredChainId() external view override returns (uint256) {
        return block.chainid;
    }

    function isConditionSupported(bytes32 conditionId) external view override returns (bool) {
        return conditions[conditionId].registered;
    }

    function isConditionResolved(bytes32 conditionId) external view override returns (bool) {
        return resolutionCache[conditionId].exists;
    }

    function getOutcome(bytes32 conditionId) external view override returns (
        bool outcome,
        uint256 confidence,
        uint256 resolvedAt
    ) {
        CachedResolution storage c = resolutionCache[conditionId];
        if (!c.exists) return (false, 0, 0);
        return (c.outcome, c.confidence, c.resolvedAt);
    }

    function getConditionMetadata(bytes32 conditionId) external view override returns (
        string memory description,
        uint256 expectedResolutionTime
    ) {
        FeedConfig storage cfg = conditions[conditionId];
        return ("", cfg.deadline);
    }
}
