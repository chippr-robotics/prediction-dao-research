// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../oracles/IOracleAdapter.sol";

/**
 * @title MockOracleAdapter
 * @notice Mock implementation of IOracleAdapter for testing
 */
contract MockOracleAdapter is IOracleAdapter {
    string private _oracleType;
    bool private _isAvailable = true;
    uint256 private _chainId;

    // Condition ID => supported
    mapping(bytes32 => bool) public conditionSupported;

    // Condition ID => resolved
    mapping(bytes32 => bool) public conditionResolved;

    // Condition ID => outcome data
    struct OutcomeData {
        bool outcome;
        uint256 confidence;
        uint256 resolvedAt;
    }
    mapping(bytes32 => OutcomeData) public outcomes;

    // Condition ID => metadata
    struct MetadataData {
        string description;
        uint256 expectedResolutionTime;
    }
    mapping(bytes32 => MetadataData) public metadata;

    constructor(string memory oracleTypeName) {
        _oracleType = oracleTypeName;
        _chainId = block.chainid;
    }

    // ========== IOracleAdapter Implementation ==========

    function oracleType() external view override returns (string memory) {
        return _oracleType;
    }

    function isAvailable() external view override returns (bool available) {
        return _isAvailable;
    }

    function getConfiguredChainId() external view override returns (uint256 chainId) {
        return _chainId;
    }

    function isConditionSupported(bytes32 conditionId) external view override returns (bool supported) {
        return conditionSupported[conditionId];
    }

    function isConditionResolved(bytes32 conditionId) external view override returns (bool resolved) {
        return conditionResolved[conditionId];
    }

    function getOutcome(bytes32 conditionId) external view override returns (
        bool outcome,
        uint256 confidence,
        uint256 resolvedAt
    ) {
        OutcomeData storage data = outcomes[conditionId];
        return (data.outcome, data.confidence, data.resolvedAt);
    }

    function getConditionMetadata(bytes32 conditionId) external view override returns (
        string memory description,
        uint256 expectedResolutionTime
    ) {
        MetadataData storage data = metadata[conditionId];
        return (data.description, data.expectedResolutionTime);
    }

    // ========== Test Helpers ==========

    function setConditionSupported(bytes32 conditionId, bool supported) external {
        conditionSupported[conditionId] = supported;
        if (supported) {
            emit ConditionRegistered(conditionId, "", 0);
        }
    }

    function setConditionResolved(bytes32 conditionId, bool resolved) external {
        conditionResolved[conditionId] = resolved;
    }

    function setOutcome(
        bytes32 conditionId,
        bool outcome,
        uint256 confidence,
        uint256 resolvedAt
    ) external {
        outcomes[conditionId] = OutcomeData({
            outcome: outcome,
            confidence: confidence,
            resolvedAt: resolvedAt
        });
        conditionResolved[conditionId] = true;
        emit ConditionResolved(conditionId, outcome, confidence, resolvedAt);
    }

    function setMetadata(
        bytes32 conditionId,
        string memory description,
        uint256 expectedResolutionTime
    ) external {
        metadata[conditionId] = MetadataData({
            description: description,
            expectedResolutionTime: expectedResolutionTime
        });
    }

    function setAvailable(bool available) external {
        _isAvailable = available;
    }

    function setChainId(uint256 newChainId) external {
        _chainId = newChainId;
    }
}
