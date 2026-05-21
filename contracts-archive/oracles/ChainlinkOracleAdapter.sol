// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IChainlinkAggregator.sol";
import "./IOracleAdapter.sol";

/**
 * @title ChainlinkOracleAdapter
 * @notice Oracle adapter for price-based conditions using Chainlink price feeds
 * @dev Enables P2P wagers based on asset prices (e.g., "ETH > $5000 by Dec 2025")
 *
 * KEY FEATURES:
 * - Create price threshold conditions (above/below target price)
 * - Support multiple Chainlink price feeds
 * - Automatic resolution when deadline passes
 * - High confidence scores from Chainlink's decentralized oracle network
 *
 * CONDITION TYPES:
 * - ABOVE: Pass if price >= target at or before deadline
 * - BELOW: Pass if price <= target at or before deadline
 *
 * EXAMPLE USE CASES:
 * - "ETH will be above $10,000 by end of 2025"
 * - "BTC will stay below $100,000 through Q1"
 * - "LINK price doubles from current level"
 */
contract ChainlinkOracleAdapter is IOracleAdapter, Ownable {

    // ========== Types ==========

    enum ComparisonType {
        ABOVE,  // Pass if price >= target
        BELOW   // Pass if price <= target
    }

    struct PriceCondition {
        address priceFeed;           // Chainlink aggregator address
        int256 targetPrice;          // Target price (in feed decimals)
        ComparisonType comparison;   // Above or below
        uint256 deadline;            // When condition can be resolved
        string description;          // Human-readable description
        bool registered;             // Whether condition exists
    }

    struct Resolution {
        bool resolved;
        bool outcome;           // True if condition passed
        int256 priceAtResolution;
        uint256 resolvedAt;
    }

    // ========== Storage ==========

    // Condition ID => PriceCondition
    mapping(bytes32 => PriceCondition) public conditions;

    // Condition ID => Resolution
    mapping(bytes32 => Resolution) public resolutions;

    // Price feed address => supported status
    mapping(address => bool) public supportedFeeds;

    // List of supported feed addresses
    address[] public feedList;

    // Staleness threshold (how old feed data can be)
    uint256 public stalenessThreshold = 1 hours;

    // ========== Events ==========

    event PriceFeedAdded(address indexed feed, string description);
    event PriceFeedRemoved(address indexed feed);
    event PriceConditionCreated(
        bytes32 indexed conditionId,
        address indexed priceFeed,
        int256 targetPrice,
        ComparisonType comparison,
        uint256 deadline
    );
    event PriceConditionResolved(
        bytes32 indexed conditionId,
        bool outcome,
        int256 priceAtResolution,
        uint256 resolvedAt
    );
    event StalenessThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    // ========== Errors ==========

    error FeedNotSupported();
    error FeedAlreadySupported();
    error ConditionAlreadyExists();
    error ConditionNotFound();
    error ConditionNotResolved();
    error DeadlineNotReached();
    error DeadlineInPast();
    error InvalidTargetPrice();
    error StalePrice();
    error InvalidFeed();

    // ========== Constructor ==========

    constructor(address _owner) Ownable(_owner) {}

    // ========== Admin Functions ==========

    /**
     * @notice Add a supported Chainlink price feed
     * @param feed Address of the Chainlink aggregator
     */
    function addPriceFeed(address feed) external onlyOwner {
        if (feed == address(0)) revert InvalidFeed();
        if (supportedFeeds[feed]) revert FeedAlreadySupported();

        supportedFeeds[feed] = true;
        feedList.push(feed);

        string memory desc = IChainlinkAggregator(feed).description();
        emit PriceFeedAdded(feed, desc);
    }

    /**
     * @notice Remove a supported price feed
     * @param feed Address of the feed to remove
     */
    function removePriceFeed(address feed) external onlyOwner {
        if (!supportedFeeds[feed]) revert FeedNotSupported();

        supportedFeeds[feed] = false;

        // Remove from list
        for (uint256 i = 0; i < feedList.length; i++) {
            if (feedList[i] == feed) {
                feedList[i] = feedList[feedList.length - 1];
                feedList.pop();
                break;
            }
        }

        emit PriceFeedRemoved(feed);
    }

    /**
     * @notice Update staleness threshold
     * @param newThreshold New threshold in seconds
     */
    function setStalenessThreshold(uint256 newThreshold) external onlyOwner {
        uint256 oldThreshold = stalenessThreshold;
        stalenessThreshold = newThreshold;
        emit StalenessThresholdUpdated(oldThreshold, newThreshold);
    }

    // ========== Condition Management ==========

    /**
     * @notice Create a new price condition
     * @param priceFeed Chainlink price feed address
     * @param targetPrice Target price threshold
     * @param comparison Whether price must be above or below target
     * @param deadline When the condition can be resolved
     * @param description Human-readable description
     * @return conditionId The unique condition identifier
     */
    function createCondition(
        address priceFeed,
        int256 targetPrice,
        ComparisonType comparison,
        uint256 deadline,
        string calldata description
    ) external returns (bytes32 conditionId) {
        if (!supportedFeeds[priceFeed]) revert FeedNotSupported();
        if (deadline <= block.timestamp) revert DeadlineInPast();
        if (targetPrice <= 0) revert InvalidTargetPrice();

        // Generate unique condition ID
        conditionId = keccak256(abi.encodePacked(
            priceFeed,
            targetPrice,
            comparison,
            deadline,
            msg.sender,
            block.timestamp
        ));

        if (conditions[conditionId].registered) revert ConditionAlreadyExists();

        conditions[conditionId] = PriceCondition({
            priceFeed: priceFeed,
            targetPrice: targetPrice,
            comparison: comparison,
            deadline: deadline,
            description: description,
            registered: true
        });

        emit PriceConditionCreated(conditionId, priceFeed, targetPrice, comparison, deadline);
        emit ConditionRegistered(conditionId, description, deadline);

        return conditionId;
    }

    /**
     * @notice Resolve a price condition
     * @param conditionId The condition to resolve
     */
    function resolveCondition(bytes32 conditionId) external {
        PriceCondition storage condition = conditions[conditionId];
        if (!condition.registered) revert ConditionNotFound();
        if (resolutions[conditionId].resolved) return; // Already resolved
        if (block.timestamp < condition.deadline) revert DeadlineNotReached();

        // Get current price
        (int256 price, uint256 updatedAt) = getLatestPrice(condition.priceFeed);
        if (block.timestamp - updatedAt > stalenessThreshold) revert StalePrice();

        // Determine outcome
        bool outcome;
        if (condition.comparison == ComparisonType.ABOVE) {
            outcome = price >= condition.targetPrice;
        } else {
            outcome = price <= condition.targetPrice;
        }

        // Store resolution
        resolutions[conditionId] = Resolution({
            resolved: true,
            outcome: outcome,
            priceAtResolution: price,
            resolvedAt: block.timestamp
        });

        emit PriceConditionResolved(conditionId, outcome, price, block.timestamp);
        emit ConditionResolved(conditionId, outcome, 10000, block.timestamp);
    }

    // ========== IOracleAdapter Implementation ==========

    /**
     * @notice Returns the oracle type
     */
    function oracleType() external pure override returns (string memory) {
        return "Chainlink";
    }

    /**
     * @notice Check if Chainlink oracle is available on this network
     * @dev Returns true if at least one price feed is configured
     * @return available True if oracle can be used for resolution
     */
    function isAvailable() external view override returns (bool available) {
        // Chainlink is available if we have at least one supported feed
        // and that feed is responding (has valid data)
        if (feedList.length == 0) return false;

        // Check if at least one feed is working
        for (uint256 i = 0; i < feedList.length; i++) {
            try IChainlinkAggregator(feedList[i]).latestRoundData() returns (
                uint80, int256 price, uint256, uint256 updatedAt, uint80
            ) {
                if (price > 0 && block.timestamp - updatedAt <= stalenessThreshold) {
                    return true;
                }
            } catch {
                // Feed not responding, try next
            }
        }
        return false;
    }

    /**
     * @notice Get the chain ID this adapter is configured for
     * @return chainId Current chain ID (Chainlink feeds are chain-specific)
     */
    function getConfiguredChainId() external view override returns (uint256 chainId) {
        return block.chainid;
    }

    /**
     * @notice Check if a condition is supported
     */
    function isConditionSupported(bytes32 conditionId) external view override returns (bool supported) {
        return conditions[conditionId].registered;
    }

    /**
     * @notice Check if a condition is resolved
     */
    function isConditionResolved(bytes32 conditionId) external view override returns (bool resolved) {
        return resolutions[conditionId].resolved;
    }

    /**
     * @notice Get the outcome of a resolved condition
     */
    function getOutcome(bytes32 conditionId) external view override returns (
        bool outcome,
        uint256 confidence,
        uint256 resolvedAt
    ) {
        Resolution storage res = resolutions[conditionId];
        if (!res.resolved) {
            return (false, 0, 0);
        }
        // Chainlink is highly reliable, so we return 100% confidence
        return (res.outcome, 10000, res.resolvedAt);
    }

    /**
     * @notice Get metadata about a condition
     */
    function getConditionMetadata(bytes32 conditionId) external view override returns (
        string memory description,
        uint256 expectedResolutionTime
    ) {
        PriceCondition storage condition = conditions[conditionId];
        return (condition.description, condition.deadline);
    }

    // ========== View Functions ==========

    /**
     * @notice Get latest price from a feed
     * @param feed The price feed address
     * @return price The latest price
     * @return updatedAt When the price was last updated
     */
    function getLatestPrice(address feed) public view returns (int256 price, uint256 updatedAt) {
        if (!supportedFeeds[feed]) revert FeedNotSupported();

        (, int256 answer, , uint256 timestamp, ) = IChainlinkAggregator(feed).latestRoundData();
        return (answer, timestamp);
    }

    /**
     * @notice Get condition details
     */
    function getCondition(bytes32 conditionId) external view returns (
        address priceFeed,
        int256 targetPrice,
        ComparisonType comparison,
        uint256 deadline,
        string memory description,
        bool registered
    ) {
        PriceCondition storage c = conditions[conditionId];
        return (c.priceFeed, c.targetPrice, c.comparison, c.deadline, c.description, c.registered);
    }

    /**
     * @notice Get resolution details
     */
    function getResolution(bytes32 conditionId) external view returns (
        bool resolved,
        bool outcome,
        int256 priceAtResolution,
        uint256 resolvedAt
    ) {
        Resolution storage r = resolutions[conditionId];
        return (r.resolved, r.outcome, r.priceAtResolution, r.resolvedAt);
    }

    /**
     * @notice Check if a condition can be resolved now
     */
    function canResolve(bytes32 conditionId) external view returns (bool) {
        PriceCondition storage condition = conditions[conditionId];
        if (!condition.registered) return false;
        if (resolutions[conditionId].resolved) return false;
        if (block.timestamp < condition.deadline) return false;
        return true;
    }

    /**
     * @notice Get all supported price feeds
     */
    function getSupportedFeeds() external view returns (address[] memory) {
        return feedList;
    }

    /**
     * @notice Get number of supported feeds
     */
    function getFeedCount() external view returns (uint256) {
        return feedList.length;
    }
}
