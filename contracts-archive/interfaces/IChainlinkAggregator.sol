// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IChainlinkAggregator
 * @notice Interface for Chainlink AggregatorV3 price feeds
 * @dev Standard interface for querying Chainlink oracle data
 */
interface IChainlinkAggregator {
    /**
     * @notice Returns the number of decimals for the feed
     */
    function decimals() external view returns (uint8);

    /**
     * @notice Returns a description of the feed
     */
    function description() external view returns (string memory);

    /**
     * @notice Returns the version of the aggregator
     */
    function version() external view returns (uint256);

    /**
     * @notice Get round data for a specific round
     * @param _roundId The round ID to query
     * @return roundId The round ID
     * @return answer The price answer
     * @return startedAt Timestamp when round started
     * @return updatedAt Timestamp when round was updated
     * @return answeredInRound The round ID in which the answer was computed
     */
    function getRoundData(uint80 _roundId) external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );

    /**
     * @notice Get latest round data
     * @return roundId The round ID
     * @return answer The price answer
     * @return startedAt Timestamp when round started
     * @return updatedAt Timestamp when round was updated
     * @return answeredInRound The round ID in which the answer was computed
     */
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}
