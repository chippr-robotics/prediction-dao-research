// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IChainlinkAggregator.sol";

/**
 * @title MockChainlinkAggregator
 * @notice Mock implementation of Chainlink AggregatorV3 for testing
 */
contract MockChainlinkAggregator is IChainlinkAggregator {
    uint8 private _decimals;
    string private _description;
    uint256 private _version;

    int256 private _latestAnswer;
    uint256 private _latestTimestamp;
    uint80 private _latestRoundId;

    // Historical round data
    struct RoundData {
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }
    mapping(uint80 => RoundData) public rounds;

    constructor(
        uint8 decimals_,
        string memory description_,
        int256 initialAnswer
    ) {
        _decimals = decimals_;
        _description = description_;
        _version = 1;
        _latestAnswer = initialAnswer;
        _latestTimestamp = block.timestamp;
        _latestRoundId = 1;

        rounds[1] = RoundData({
            answer: initialAnswer,
            startedAt: block.timestamp,
            updatedAt: block.timestamp,
            answeredInRound: 1
        });
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external view override returns (uint256) {
        return _version;
    }

    function getRoundData(uint80 roundId) external view override returns (
        uint80 roundId_,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        RoundData storage round = rounds[roundId];
        return (
            roundId,
            round.answer,
            round.startedAt,
            round.updatedAt,
            round.answeredInRound
        );
    }

    function latestRoundData() external view override returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        RoundData storage round = rounds[_latestRoundId];
        return (
            _latestRoundId,
            _latestAnswer,
            round.startedAt,
            _latestTimestamp,
            _latestRoundId
        );
    }

    // ========== Test Helpers ==========

    /**
     * @notice Update the price
     * @param newAnswer The new price answer
     */
    function updateAnswer(int256 newAnswer) external {
        _latestRoundId++;
        _latestAnswer = newAnswer;
        _latestTimestamp = block.timestamp;

        rounds[_latestRoundId] = RoundData({
            answer: newAnswer,
            startedAt: block.timestamp,
            updatedAt: block.timestamp,
            answeredInRound: _latestRoundId
        });
    }

    /**
     * @notice Update the timestamp (for staleness testing)
     * @param newTimestamp The new timestamp
     */
    function setTimestamp(uint256 newTimestamp) external {
        _latestTimestamp = newTimestamp;
        rounds[_latestRoundId].updatedAt = newTimestamp;
    }

    /**
     * @notice Get the latest answer directly
     */
    function getLatestAnswer() external view returns (int256) {
        return _latestAnswer;
    }

    /**
     * @notice Get the latest round ID
     */
    function getLatestRoundId() external view returns (uint80) {
        return _latestRoundId;
    }
}
