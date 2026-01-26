// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./PerpetualFuturesMarket.sol";
import "./FundingRateEngine.sol";
import "./interfaces/IRoleManager.sol";

/**
 * @title PerpetualFuturesFactory
 * @notice Factory contract for deploying and managing perpetual futures markets
 * @dev Optimized for contract size - some view functions moved to external indexer
 */
contract PerpetualFuturesFactory is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Enums ============

    enum MarketCategory { Crypto, PredictionOutcome, Commodity, Index, Custom }

    // ============ Structs ============

    struct MarketInfo {
        uint256 marketId;
        address marketAddress;
        string name;
        string underlyingAsset;
        address collateralToken;
        MarketCategory category;
        uint256 createdAt;
        address creator;
        bool active;
        uint256 linkedConditionalMarketId;
    }

    struct MarketCreationParams {
        string name;
        string underlyingAsset;
        address collateralToken;
        MarketCategory category;
        uint256 initialIndexPrice;
        uint256 initialMarkPrice;
        uint256 linkedConditionalMarketId;
        PerpetualFuturesMarket.MarketConfig config;
    }

    // ============ State Variables ============

    uint256 public marketCount;
    mapping(uint256 => MarketInfo) public markets;
    mapping(address => uint256) public marketAddressToId;
    mapping(MarketCategory => uint256[]) private marketsByCategory;
    mapping(string => uint256[]) private marketsByAsset;

    FundingRateEngine public fundingRateEngine;
    IRoleManager public roleManager;
    address public feeRecipient;
    uint256 public creationFee;
    uint256 public maxMarketsPerCreator;
    mapping(address => uint256) public creatorMarketCount;
    bool public paused;
    mapping(address => bool) public allowedCollateralTokens;
    address public defaultCollateralToken;

    // ============ Events ============

    event MarketCreated(
        uint256 indexed marketId,
        address indexed marketAddress,
        string name,
        string underlyingAsset,
        MarketCategory category,
        address collateralToken,
        address indexed creator,
        uint256 timestamp
    );
    event MarketPaused(uint256 indexed marketId, address indexed pausedBy, uint256 timestamp);
    event MarketUnpaused(uint256 indexed marketId, address indexed unpausedBy, uint256 timestamp);
    event MarketDeactivated(uint256 indexed marketId, address indexed deactivatedBy, uint256 timestamp);
    event FundingRateEngineUpdated(address indexed previousEngine, address indexed newEngine);
    event CreationFeeUpdated(uint256 previousFee, uint256 newFee);
    event CollateralTokenUpdated(address indexed token, bool allowed);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);

    // ============ Modifiers ============

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    modifier validMarketId(uint256 marketId) {
        require(marketId < marketCount, "Invalid ID");
        _;
    }

    modifier onlyMarketMaker() {
        if (address(roleManager) != address(0)) {
            require(
                roleManager.hasRole(roleManager.MARKET_MAKER_ROLE(), msg.sender) || msg.sender == owner(),
                "Not authorized"
            );
        }
        _;
    }

    // ============ Constructor ============

    constructor(
        address _owner,
        address _fundingRateEngine,
        address _feeRecipient,
        address _defaultCollateralToken
    ) Ownable(_owner) {
        require(_feeRecipient != address(0), "Invalid recipient");

        if (_fundingRateEngine != address(0)) {
            fundingRateEngine = FundingRateEngine(_fundingRateEngine);
        }

        feeRecipient = _feeRecipient;
        creationFee = 0.5 ether;

        if (_defaultCollateralToken != address(0)) {
            defaultCollateralToken = _defaultCollateralToken;
            allowedCollateralTokens[_defaultCollateralToken] = true;
        }
    }

    // ============ Market Creation ============

    function createMarket(MarketCreationParams calldata params)
        external
        payable
        nonReentrant
        whenNotPaused
        onlyMarketMaker
        returns (uint256 marketId, address marketAddress)
    {
        require(bytes(params.name).length > 0, "Name required");
        require(bytes(params.underlyingAsset).length > 0, "Asset required");
        require(params.collateralToken != address(0), "Invalid collateral");
        require(allowedCollateralTokens[params.collateralToken], "Collateral not allowed");
        require(params.initialIndexPrice > 0 && params.initialMarkPrice > 0, "Invalid price");
        require(msg.value >= creationFee, "Insufficient fee");

        if (maxMarketsPerCreator > 0) {
            require(creatorMarketCount[msg.sender] < maxMarketsPerCreator, "Max markets reached");
        }

        marketId = marketCount++;

        PerpetualFuturesMarket newMarket = new PerpetualFuturesMarket(
            marketId,
            params.name,
            params.underlyingAsset,
            params.collateralToken,
            feeRecipient,
            address(roleManager)
        );

        marketAddress = address(newMarket);

        if (params.config.maxLeverage > 0) {
            newMarket.updateConfig(params.config);
        }

        newMarket.updatePrices(params.initialIndexPrice, params.initialMarkPrice);

        if (address(fundingRateEngine) != address(0)) {
            fundingRateEngine.initializeMarket(marketId);
            fundingRateEngine.setMarketAuthorization(marketAddress, true);
        }

        newMarket.setPriceUpdater(msg.sender, true);

        markets[marketId] = MarketInfo({
            marketId: marketId,
            marketAddress: marketAddress,
            name: params.name,
            underlyingAsset: params.underlyingAsset,
            collateralToken: params.collateralToken,
            category: params.category,
            createdAt: block.timestamp,
            creator: msg.sender,
            active: true,
            linkedConditionalMarketId: params.linkedConditionalMarketId
        });

        marketAddressToId[marketAddress] = marketId;
        marketsByCategory[params.category].push(marketId);
        marketsByAsset[params.underlyingAsset].push(marketId);
        creatorMarketCount[msg.sender]++;

        if (creationFee > 0 && msg.value > 0) {
            payable(feeRecipient).transfer(creationFee);
        }

        if (msg.value > creationFee) {
            payable(msg.sender).transfer(msg.value - creationFee);
        }

        emit MarketCreated(
            marketId, marketAddress, params.name, params.underlyingAsset,
            params.category, params.collateralToken, msg.sender, block.timestamp
        );
    }

    // ============ Market Management ============

    function pauseMarket(uint256 marketId) external onlyOwner validMarketId(marketId) {
        MarketInfo storage info = markets[marketId];
        require(info.active, "Not active");
        PerpetualFuturesMarket(info.marketAddress).pause();
        emit MarketPaused(marketId, msg.sender, block.timestamp);
    }

    function unpauseMarket(uint256 marketId) external onlyOwner validMarketId(marketId) {
        MarketInfo storage info = markets[marketId];
        require(info.active, "Not active");
        PerpetualFuturesMarket(info.marketAddress).unpause();
        emit MarketUnpaused(marketId, msg.sender, block.timestamp);
    }

    function deactivateMarket(uint256 marketId) external onlyOwner validMarketId(marketId) {
        MarketInfo storage info = markets[marketId];
        require(info.active, "Already inactive");
        info.active = false;
        PerpetualFuturesMarket market = PerpetualFuturesMarket(info.marketAddress);
        market.pause();
        market.setStatus(PerpetualFuturesMarket.MarketStatus.Settled);
        emit MarketDeactivated(marketId, msg.sender, block.timestamp);
    }

    function updateMarketPrices(uint256 marketId, uint256 indexPrice, uint256 markPrice)
        external onlyOwner validMarketId(marketId)
    {
        MarketInfo storage info = markets[marketId];
        PerpetualFuturesMarket(info.marketAddress).updatePrices(indexPrice, markPrice);
        if (address(fundingRateEngine) != address(0)) {
            fundingRateEngine.recordPriceObservation(marketId, indexPrice, markPrice);
        }
    }

    function settleFunding(uint256 marketId) external validMarketId(marketId) {
        MarketInfo storage info = markets[marketId];
        require(info.active, "Not active");
        PerpetualFuturesMarket(info.marketAddress).settleFunding();
    }

    function withdrawFromMarketInsuranceFund(uint256 marketId, uint256 amount, address recipient)
        external onlyOwner validMarketId(marketId)
    {
        MarketInfo storage info = markets[marketId];
        PerpetualFuturesMarket(info.marketAddress).withdrawFromInsuranceFund(amount, recipient);
    }

    // ============ Admin Functions ============

    function setFundingRateEngine(address _fundingRateEngine) external onlyOwner {
        address prev = address(fundingRateEngine);
        fundingRateEngine = FundingRateEngine(_fundingRateEngine);
        emit FundingRateEngineUpdated(prev, _fundingRateEngine);
    }

    function setRoleManager(address _roleManager) external onlyOwner {
        roleManager = IRoleManager(_roleManager);
    }

    function setCreationFee(uint256 _creationFee) external onlyOwner {
        uint256 prev = creationFee;
        creationFee = _creationFee;
        emit CreationFeeUpdated(prev, _creationFee);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid");
        address prev = feeRecipient;
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(prev, _feeRecipient);
    }

    function setMaxMarketsPerCreator(uint256 _max) external onlyOwner {
        maxMarketsPerCreator = _max;
    }

    function setAllowedCollateralToken(address token, bool allowed) external onlyOwner {
        require(token != address(0), "Invalid");
        allowedCollateralTokens[token] = allowed;
        emit CollateralTokenUpdated(token, allowed);
    }

    function setDefaultCollateralToken(address token) external onlyOwner {
        require(token != address(0) && allowedCollateralTokens[token], "Invalid");
        defaultCollateralToken = token;
    }

    function pause() external onlyOwner { paused = true; }
    function unpause() external onlyOwner { paused = false; }

    function emergencyWithdraw(address token, uint256 amount, address recipient) external onlyOwner {
        require(recipient != address(0), "Invalid");
        if (token == address(0)) {
            payable(recipient).transfer(amount);
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    // ============ View Functions ============

    function getMarket(uint256 marketId) external view returns (MarketInfo memory) {
        require(marketId < marketCount, "Invalid ID");
        return markets[marketId];
    }

    function getMarketsByCategory(MarketCategory category) external view returns (uint256[] memory) {
        return marketsByCategory[category];
    }

    function getMarketsByAsset(string calldata asset) external view returns (uint256[] memory) {
        return marketsByAsset[asset];
    }

    function getActiveMarkets(uint256 offset, uint256 limit)
        external view returns (uint256[] memory marketIds, bool hasMore)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < marketCount; i++) {
            if (markets[i].active) count++;
        }

        if (offset >= count) return (new uint256[](0), false);

        uint256 resultCount = count - offset;
        if (resultCount > limit) {
            resultCount = limit;
            hasMore = true;
        }

        marketIds = new uint256[](resultCount);
        uint256 idx = 0;
        uint256 skip = offset;

        for (uint256 i = 0; i < marketCount && idx < resultCount; i++) {
            if (markets[i].active) {
                if (skip > 0) skip--;
                else marketIds[idx++] = i;
            }
        }
    }

    function isMarketActive(uint256 marketId) external view returns (bool) {
        return marketId < marketCount && markets[marketId].active;
    }

    receive() external payable {}
}
