// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import "./IOracleAdapter.sol";

/// @title ChainlinkFunctionsOracleAdapter
/// @notice IOracleAdapter that resolves binary outcomes by sending a Chainlink Functions
///         request to a DON and caching the boolean response in the fulfillment callback.
/// @dev Inherits ConfirmedOwner (instead of OZ Ownable) to avoid a constructor conflict
///      with FunctionsClient, which also takes a single immutable address argument.
contract ChainlinkFunctionsOracleAdapter is IOracleAdapter, FunctionsClient, ConfirmedOwner, ReentrancyGuard {
    struct RequestConfig {
        bytes32 sourceHash;
        bytes encodedRequest;
        uint64 subscriptionId;
        uint32 gasLimit;
        bytes32 donId;
        bool registered;
    }

    struct CachedResolution {
        bool outcome;
        uint64 resolvedAt;
        uint96 confidence;
        bool exists;
    }

    address public immutable router;

    mapping(bytes32 => RequestConfig) public conditions;
    mapping(bytes32 => bytes32) public requestToCondition;
    mapping(bytes32 => bytes32) public conditionToPendingRequest;
    mapping(bytes32 => CachedResolution) public resolutionCache;
    mapping(uint256 => bytes32) public marketToCondition;

    event MarketLinked(uint256 indexed friendMarketId, bytes32 indexed conditionId);
    event ResolutionRequested(bytes32 indexed conditionId, bytes32 indexed requestId);
    event RequestFailed(bytes32 indexed conditionId, bytes32 indexed requestId, bytes err);

    error RouterHasNoCode();
    error UnknownRequestId();
    error RequestAlreadyPending();
    error ConditionNotRegistered();
    error ConditionAlreadyRegistered();
    error InvalidResponseLength();
    error AlreadyResolved();
    error MarketAlreadyLinked();

    constructor(address _router) FunctionsClient(_router) ConfirmedOwner(msg.sender) {
        if (_router == address(0)) revert RouterHasNoCode();
        router = _router;
    }

    // ========== Admin ==========

    function registerCondition(
        bytes32 conditionId,
        bytes calldata encodedRequest,
        bytes32 sourceHash,
        uint64 subscriptionId,
        uint32 gasLimit,
        bytes32 donId
    ) external onlyOwner {
        if (conditionId == bytes32(0)) revert ConditionNotRegistered();
        if (conditions[conditionId].registered) revert ConditionAlreadyRegistered();

        conditions[conditionId] = RequestConfig({
            sourceHash: sourceHash,
            encodedRequest: encodedRequest,
            subscriptionId: subscriptionId,
            gasLimit: gasLimit,
            donId: donId,
            registered: true
        });

        emit ConditionRegistered(conditionId, "", 0);
    }

    function linkMarket(uint256 friendMarketId, bytes32 conditionId) external onlyOwner {
        if (!conditions[conditionId].registered) revert ConditionNotRegistered();
        if (marketToCondition[friendMarketId] != bytes32(0)) revert MarketAlreadyLinked();
        marketToCondition[friendMarketId] = conditionId;
        emit MarketLinked(friendMarketId, conditionId);
    }

    // ========== Resolution ==========

    /// @notice Send the registered Functions request to the DON. Anyone may call.
    /// @dev The response is delivered asynchronously via fulfillRequest below.
    function requestResolution(bytes32 conditionId) external nonReentrant returns (bytes32 requestId) {
        RequestConfig storage cfg = conditions[conditionId];
        if (!cfg.registered) revert ConditionNotRegistered();
        if (resolutionCache[conditionId].exists) revert AlreadyResolved();
        if (conditionToPendingRequest[conditionId] != bytes32(0)) revert RequestAlreadyPending();

        requestId = _sendRequest(cfg.encodedRequest, cfg.subscriptionId, cfg.gasLimit, cfg.donId);
        requestToCondition[requestId] = conditionId;
        conditionToPendingRequest[conditionId] = requestId;

        emit ResolutionRequested(conditionId, requestId);
    }

    /// @inheritdoc FunctionsClient
    function fulfillRequest(bytes32 requestId, bytes memory response, bytes memory err) internal override {
        bytes32 conditionId = requestToCondition[requestId];
        if (conditionId == bytes32(0)) revert UnknownRequestId();

        delete conditionToPendingRequest[conditionId];

        if (err.length > 0) {
            emit RequestFailed(conditionId, requestId, err);
            return;
        }

        if (response.length == 0) revert InvalidResponseLength();
        // The DON-script must return a single uint8 (0 = NO, 1 = YES).
        uint8 raw = uint8(response[response.length - 1]);
        bool outcome = raw != 0;

        resolutionCache[conditionId] = CachedResolution({
            outcome: outcome,
            resolvedAt: uint64(block.timestamp),
            confidence: 10_000,
            exists: true
        });

        emit ConditionResolved(conditionId, outcome, 10_000, block.timestamp);
    }

    // ========== IOracleAdapter ==========

    function oracleType() external pure override returns (string memory) {
        return "ChainlinkFunctions";
    }

    function isAvailable() external view override returns (bool) {
        return router.code.length > 0;
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

    function getConditionMetadata(bytes32 /* conditionId */) external pure override returns (
        string memory description,
        uint256 expectedResolutionTime
    ) {
        return ("", 0);
    }
}
