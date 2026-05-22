// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3CallbackRecipientInterface.sol";
import "./IOracleAdapter.sol";

/// @title UMAOptimisticOracleV3Adapter
/// @notice IOracleAdapter that resolves binary outcomes via UMA's Optimistic Oracle V3
///         assertion model. An asserter posts a bond and a human-readable claim; if the
///         liveness window passes undisputed, the assertion settles as true. Disputed
///         assertions are escalated to UMA's DVM and resolved via the same callback.
contract UMAOptimisticOracleV3Adapter is
    IOracleAdapter,
    OptimisticOracleV3CallbackRecipientInterface,
    Ownable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    uint64 public constant MIN_LIVENESS = 30;

    struct AssertionConfig {
        bytes claim;
        address bondCurrency;
        uint256 bondAmount;
        uint64 liveness;
        bool registered;
    }

    struct CachedResolution {
        bool outcome;
        uint64 resolvedAt;
        uint96 confidence;
        bool exists;
    }

    OptimisticOracleV3Interface public immutable oo;

    mapping(bytes32 => AssertionConfig) public conditions;
    mapping(bytes32 => bytes32) public assertionToCondition;
    mapping(bytes32 => bytes32) public conditionToAssertion;
    mapping(bytes32 => CachedResolution) public resolutionCache;
    mapping(uint256 => bytes32) public marketToCondition;

    event MarketLinked(uint256 indexed friendMarketId, bytes32 indexed conditionId);
    event AssertionMade(bytes32 indexed conditionId, bytes32 indexed assertionId, address indexed asserter);
    event AssertionDisputed(bytes32 indexed conditionId, bytes32 indexed assertionId);

    error OOHasNoCode();
    error LivenessTooShort();
    error UnauthorizedCallback();
    error ConditionNotRegistered();
    error ConditionAlreadyRegistered();
    error AssertionAlreadyPending();
    error AlreadyResolved();
    error UnknownAssertion();
    error InvalidAddress();
    error MarketAlreadyLinked();

    modifier onlyOO() {
        if (msg.sender != address(oo)) revert UnauthorizedCallback();
        _;
    }

    constructor(address _oo) Ownable(msg.sender) {
        if (_oo == address(0)) revert InvalidAddress();
        oo = OptimisticOracleV3Interface(_oo);
    }

    // ========== Admin ==========

    function registerCondition(
        bytes32 conditionId,
        bytes calldata claim,
        address bondCurrency,
        uint256 bondAmount,
        uint64 liveness
    ) external onlyOwner {
        if (conditionId == bytes32(0)) revert ConditionNotRegistered();
        if (conditions[conditionId].registered) revert ConditionAlreadyRegistered();
        if (liveness < MIN_LIVENESS) revert LivenessTooShort();
        if (bondCurrency == address(0)) revert InvalidAddress();

        conditions[conditionId] = AssertionConfig({
            claim: claim,
            bondCurrency: bondCurrency,
            bondAmount: bondAmount,
            liveness: liveness,
            registered: true
        });

        emit ConditionRegistered(conditionId, string(claim), uint256(liveness));
    }

    function linkMarket(uint256 friendMarketId, bytes32 conditionId) external onlyOwner {
        if (!conditions[conditionId].registered) revert ConditionNotRegistered();
        if (marketToCondition[friendMarketId] != bytes32(0)) revert MarketAlreadyLinked();
        marketToCondition[friendMarketId] = conditionId;
        emit MarketLinked(friendMarketId, conditionId);
    }

    // ========== Resolution ==========

    /// @notice Post an UMA assertion that the registered claim is true.
    /// @dev Caller must approve this contract for `bondAmount` of `bondCurrency`. The bond
    ///      is pulled from the caller, escrowed by OOv3, and refunded to `asserter` at
    ///      settlement (minus DVM fees if disputed).
    function assertResolution(bytes32 conditionId, address asserter)
        external
        nonReentrant
        returns (bytes32 assertionId)
    {
        AssertionConfig storage cfg = conditions[conditionId];
        if (!cfg.registered) revert ConditionNotRegistered();
        if (resolutionCache[conditionId].exists) revert AlreadyResolved();
        if (conditionToAssertion[conditionId] != bytes32(0)) revert AssertionAlreadyPending();
        if (asserter == address(0)) revert InvalidAddress();

        IERC20 currency = IERC20(cfg.bondCurrency);
        currency.safeTransferFrom(msg.sender, address(this), cfg.bondAmount);
        currency.forceApprove(address(oo), cfg.bondAmount);

        assertionId = oo.assertTruth(
            cfg.claim,
            asserter,
            address(this),
            address(0),
            cfg.liveness,
            currency,
            cfg.bondAmount,
            oo.defaultIdentifier(),
            bytes32(0)
        );

        assertionToCondition[assertionId] = conditionId;
        conditionToAssertion[conditionId] = assertionId;

        emit AssertionMade(conditionId, assertionId, asserter);
    }

    /// @inheritdoc OptimisticOracleV3CallbackRecipientInterface
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external onlyOO {
        bytes32 conditionId = assertionToCondition[assertionId];
        if (conditionId == bytes32(0)) revert UnknownAssertion();

        resolutionCache[conditionId] = CachedResolution({
            outcome: assertedTruthfully,
            resolvedAt: uint64(block.timestamp),
            confidence: 10_000,
            exists: true
        });

        emit ConditionResolved(conditionId, assertedTruthfully, 10_000, block.timestamp);
    }

    /// @inheritdoc OptimisticOracleV3CallbackRecipientInterface
    function assertionDisputedCallback(bytes32 assertionId) external onlyOO {
        bytes32 conditionId = assertionToCondition[assertionId];
        if (conditionId == bytes32(0)) revert UnknownAssertion();
        emit AssertionDisputed(conditionId, assertionId);
    }

    // ========== IOracleAdapter ==========

    function oracleType() external pure override returns (string memory) {
        return "UMA-OOv3";
    }

    function isAvailable() external view override returns (bool) {
        return address(oo).code.length > 0;
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
        AssertionConfig storage cfg = conditions[conditionId];
        return (string(cfg.claim), uint256(cfg.liveness));
    }
}
