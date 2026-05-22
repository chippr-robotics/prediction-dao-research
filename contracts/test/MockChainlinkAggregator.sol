// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @notice Mutable AggregatorV3Interface mock for tests.
contract MockChainlinkAggregator is AggregatorV3Interface {
    uint8 private _decimals;
    int256 private _answer;
    uint256 private _updatedAt;
    uint80 private _roundId;

    constructor(int256 answer_, uint8 decimals_, uint256 updatedAt_) {
        _answer = answer_;
        _decimals = decimals_;
        _updatedAt = updatedAt_;
        _roundId = 1;
    }

    function setAnswer(int256 answer_, uint256 updatedAt_) external {
        _answer = answer_;
        _updatedAt = updatedAt_;
        _roundId += 1;
    }

    function decimals() external view returns (uint8) { return _decimals; }
    function description() external pure returns (string memory) { return "MockChainlinkAggregator"; }
    function version() external pure returns (uint256) { return 1; }

    function getRoundData(uint80) external view returns (uint80, int256, uint256, uint256, uint80) {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }
}
