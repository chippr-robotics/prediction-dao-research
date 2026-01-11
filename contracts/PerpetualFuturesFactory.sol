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
 * @dev Creates and tracks PerpetualFuturesMarket contracts with centralized management
 *
 * Key Features:
 * - Deploy new perpetual futures markets
 * - Centralized market registry and discovery
 * - Integration with FundingRateEngine for funding calculations
 * - Role-based access control via IRoleManager
 * - Market creation fees and limits
 *
 * Market Types:
 * - Crypto assets (BTC, ETH, etc.)
 * - Prediction outcomes (linked to conditional markets)
 * - Custom assets (commodities, indices, etc.)
 */
contract PerpetualFuturesFactory is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Enums ============

    /// @notice Market category for organization
    enum MarketCategory {
        Crypto,
        PredictionOutcome,
        Commodity,
        Index,
        Custom
    }

    // ============ Structs ============

    /// @notice Market metadata
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
        uint256 linkedConditionalMarketId; // For prediction outcome markets
    }

    /// @notice Market creation parameters
    struct MarketCreationParams {
        string name;
        string underlyingAsset;
        address collateralToken;
        MarketCategory category;
        uint256 initialIndexPrice;
        uint256 initialMarkPrice;
        uint256 linkedConditionalMarketId; // 0 if not linked
        PerpetualFuturesMarket.MarketConfig config;
    }

    // ============ State Variables ============

    /// @notice Counter for market IDs
    uint256 public marketCount;

    /// @notice Market ID => Market info
    mapping(uint256 => MarketInfo) public markets;

    /// @notice Market address => Market ID
    mapping(address => uint256) public marketAddressToId;

    /// @notice Category => Market IDs
    mapping(MarketCategory => uint256[]) private marketsByCategory;

    /// @notice Underlying asset => Market IDs
    mapping(string => uint256[]) private marketsByAsset;

    /// @notice Linked conditional market => Perp market IDs
    mapping(uint256 => uint256[]) private marketsByConditionalMarket;

    /// @notice Funding rate engine
    FundingRateEngine public fundingRateEngine;

    /// @notice Role manager for access control
    IRoleManager public roleManager;

    /// @notice Fee recipient for market creation fees
    address public feeRecipient;

    /// @notice Market creation fee (in native token)
    uint256 public creationFee;

    /// @notice Maximum markets per creator (0 = unlimited)
    uint256 public maxMarketsPerCreator;

    /// @notice Creator => market count
    mapping(address => uint256) public creatorMarketCount;

    /// @notice Paused state
    bool public paused;

    /// @notice Allowed collateral tokens
    mapping(address => bool) public allowedCollateralTokens;

    /// @notice Default collateral token
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

    event MarketPaused(
        uint256 indexed marketId,
        address indexed pausedBy,
        uint256 timestamp
    );

    event MarketUnpaused(
        uint256 indexed marketId,
        address indexed unpausedBy,
        uint256 timestamp
    );

    event MarketDeactivated(
        uint256 indexed marketId,
        address indexed deactivatedBy,
        uint256 timestamp
    );

    event FundingRateEngineUpdated(
        address indexed previousEngine,
        address indexed newEngine
    );

    event CreationFeeUpdated(
        uint256 previousFee,
        uint256 newFee
    );

    event CollateralTokenUpdated(
        address indexed token,
        bool allowed
    );

    event FeeRecipientUpdated(
        address indexed previousRecipient,
        address indexed newRecipient
    );

    // ============ Modifiers ============

    modifier whenNotPaused() {
        require(!paused, "Factory is paused");
        _;
    }

    modifier validMarketId(uint256 marketId) {
        require(marketId < marketCount, "Invalid market ID");
        _;
    }

    modifier onlyMarketMaker() {
        if (address(roleManager) != address(0)) {
            require(
                roleManager.hasRole(roleManager.MARKET_MAKER_ROLE(), msg.sender) ||
                msg.sender == owner(),
                "Requires MARKET_MAKER_ROLE"
            );
        }
        _;
    }

    // ============ Constructor ============

    constructor(
        address _fundingRateEngine,
        address _feeRecipient,
        address _defaultCollateralToken
    ) Ownable(msg.sender) {
        require(_feeRecipient != address(0), "Invalid fee recipient");

        if (_fundingRateEngine != address(0)) {
            fundingRateEngine = FundingRateEngine(_fundingRateEngine);
        }

        feeRecipient = _feeRecipient;
        creationFee = 0.5 ether; // 0.5 ETC default creation fee

        if (_defaultCollateralToken != address(0)) {
            defaultCollateralToken = _defaultCollateralToken;
            allowedCollateralTokens[_defaultCollateralToken] = true;
        }
    }

    // ============ Market Creation Functions ============

    /**
     * @notice Create a new perpetual futures market
     * @param params Market creation parameters
     * @return marketId The ID of the newly created market
     * @return marketAddress The address of the deployed market contract
     */
    function createMarket(MarketCreationParams calldata params)
        external
        payable
        nonReentrant
        whenNotPaused
        onlyMarketMaker
        returns (uint256 marketId, address marketAddress)
    {
        // Validate parameters
        require(bytes(params.name).length > 0, "Name required");
        require(bytes(params.underlyingAsset).length > 0, "Asset required");
        require(params.collateralToken != address(0), "Invalid collateral token");
        require(allowedCollateralTokens[params.collateralToken], "Collateral token not allowed");
        require(params.initialIndexPrice > 0, "Invalid index price");
        require(params.initialMarkPrice > 0, "Invalid mark price");

        // Check creation fee
        require(msg.value >= creationFee, "Insufficient creation fee");

        // Check creator limits
        if (maxMarketsPerCreator > 0) {
            require(
                creatorMarketCount[msg.sender] < maxMarketsPerCreator,
                "Max markets per creator reached"
            );
        }

        // Generate market ID
        marketId = marketCount++;

        // Deploy new market contract
        PerpetualFuturesMarket newMarket = new PerpetualFuturesMarket(
            marketId,
            params.name,
            params.underlyingAsset,
            params.collateralToken,
            feeRecipient,
            address(roleManager)
        );

        marketAddress = address(newMarket);

        // Apply custom configuration if provided
        if (params.config.maxLeverage > 0) {
            newMarket.updateConfig(params.config);
        }

        // Set initial prices
        newMarket.updatePrices(params.initialIndexPrice, params.initialMarkPrice);

        // Initialize in funding rate engine
        if (address(fundingRateEngine) != address(0)) {
            fundingRateEngine.initializeMarket(marketId);
            fundingRateEngine.setMarketAuthorization(marketAddress, true);
        }

        // Authorize the creator as a price updater for the market
        newMarket.setPriceUpdater(msg.sender, true);

        // Store market info
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

        if (params.linkedConditionalMarketId > 0) {
            marketsByConditionalMarket[params.linkedConditionalMarketId].push(marketId);
        }

        creatorMarketCount[msg.sender]++;

        // Transfer creation fee
        if (creationFee > 0 && msg.value > 0) {
            payable(feeRecipient).transfer(creationFee);
        }

        // Refund excess
        if (msg.value > creationFee) {
            payable(msg.sender).transfer(msg.value - creationFee);
        }

        emit MarketCreated(
            marketId,
            marketAddress,
            params.name,
            params.underlyingAsset,
            params.category,
            params.collateralToken,
            msg.sender,
            block.timestamp
        );

        return (marketId, marketAddress);
    }

    /**
     * @notice Create a market linked to a conditional prediction market
     * @param conditionalMarketId ID of the conditional market to link to
     * @param name Name for the perp market
     * @param collateralToken Collateral token address
     * @param initialPrice Initial price for the outcome
     * @return marketId The ID of the newly created market
     * @return marketAddress The address of the deployed market contract
     */
    function createPredictionOutcomeMarket(
        uint256 conditionalMarketId,
        string calldata name,
        address collateralToken,
        uint256 initialPrice
    )
        external
        payable
        nonReentrant
        whenNotPaused
        onlyMarketMaker
        returns (uint256 marketId, address marketAddress)
    {
        MarketCreationParams memory params = MarketCreationParams({
            name: name,
            underlyingAsset: string(abi.encodePacked("OUTCOME_", _uint2str(conditionalMarketId))),
            collateralToken: collateralToken,
            category: MarketCategory.PredictionOutcome,
            initialIndexPrice: initialPrice,
            initialMarkPrice: initialPrice,
            linkedConditionalMarketId: conditionalMarketId,
            config: PerpetualFuturesMarket.MarketConfig({
                maxLeverage: 10 * 10000,        // 10x max for prediction outcomes
                initialMarginRate: 1000,         // 10% initial margin
                maintenanceMarginRate: 500,      // 5% maintenance margin
                liquidationFeeRate: 100,         // 1% liquidation fee
                tradingFeeRate: 20,              // 0.2% trading fee
                fundingInterval: 4 hours,        // 4 hour funding for faster convergence
                maxFundingRate: 5000             // 0.5% max funding rate
            })
        });

        return this.createMarket{value: msg.value}(params);
    }

    // ============ Market Management Functions ============

    /**
     * @notice Pause a market
     * @param marketId ID of the market to pause
     */
    function pauseMarket(uint256 marketId) external onlyOwner validMarketId(marketId) {
        MarketInfo storage info = markets[marketId];
        require(info.active, "Market not active");

        PerpetualFuturesMarket(info.marketAddress).pause();

        emit MarketPaused(marketId, msg.sender, block.timestamp);
    }

    /**
     * @notice Unpause a market
     * @param marketId ID of the market to unpause
     */
    function unpauseMarket(uint256 marketId) external onlyOwner validMarketId(marketId) {
        MarketInfo storage info = markets[marketId];
        require(info.active, "Market not active");

        PerpetualFuturesMarket(info.marketAddress).unpause();

        emit MarketUnpaused(marketId, msg.sender, block.timestamp);
    }

    /**
     * @notice Deactivate a market permanently
     * @param marketId ID of the market to deactivate
     */
    function deactivateMarket(uint256 marketId) external onlyOwner validMarketId(marketId) {
        MarketInfo storage info = markets[marketId];
        require(info.active, "Market already inactive");

        info.active = false;

        PerpetualFuturesMarket market = PerpetualFuturesMarket(info.marketAddress);
        market.pause();
        market.setStatus(PerpetualFuturesMarket.MarketStatus.Settled);

        emit MarketDeactivated(marketId, msg.sender, block.timestamp);
    }

    /**
     * @notice Update prices for a market
     * @param marketId ID of the market
     * @param indexPrice New index price
     * @param markPrice New mark price
     */
    function updateMarketPrices(
        uint256 marketId,
        uint256 indexPrice,
        uint256 markPrice
    ) external onlyOwner validMarketId(marketId) {
        MarketInfo storage info = markets[marketId];
        PerpetualFuturesMarket(info.marketAddress).updatePrices(indexPrice, markPrice);

        // Record observation in funding rate engine
        if (address(fundingRateEngine) != address(0)) {
            fundingRateEngine.recordPriceObservation(marketId, indexPrice, markPrice);
        }
    }

    /**
     * @notice Settle funding for a market
     * @param marketId ID of the market
     */
    function settleFunding(uint256 marketId) external validMarketId(marketId) {
        MarketInfo storage info = markets[marketId];
        require(info.active, "Market not active");

        PerpetualFuturesMarket market = PerpetualFuturesMarket(info.marketAddress);
        market.settleFunding();
    }

    /**
     * @notice Batch update prices for multiple markets
     * @param marketIds Array of market IDs
     * @param indexPrices Array of index prices
     * @param markPrices Array of mark prices
     */
    function batchUpdatePrices(
        uint256[] calldata marketIds,
        uint256[] calldata indexPrices,
        uint256[] calldata markPrices
    ) external onlyOwner {
        require(
            marketIds.length == indexPrices.length &&
            marketIds.length == markPrices.length,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < marketIds.length; i++) {
            if (marketIds[i] < marketCount && markets[marketIds[i]].active) {
                PerpetualFuturesMarket(markets[marketIds[i]].marketAddress)
                    .updatePrices(indexPrices[i], markPrices[i]);

                if (address(fundingRateEngine) != address(0)) {
                    fundingRateEngine.recordPriceObservation(
                        marketIds[i],
                        indexPrices[i],
                        markPrices[i]
                    );
                }
            }
        }
    }

    /**
     * @notice Withdraw from a market's insurance fund
     * @param marketId ID of the market
     * @param amount Amount to withdraw
     * @param recipient Address to receive the funds
     */
    function withdrawFromMarketInsuranceFund(
        uint256 marketId,
        uint256 amount,
        address recipient
    ) external onlyOwner validMarketId(marketId) {
        MarketInfo storage info = markets[marketId];
        PerpetualFuturesMarket(info.marketAddress).withdrawFromInsuranceFund(amount, recipient);
    }

    // ============ Admin Functions ============

    /**
     * @notice Set the funding rate engine
     * @param _fundingRateEngine Address of the funding rate engine
     */
    function setFundingRateEngine(address _fundingRateEngine) external onlyOwner {
        address previousEngine = address(fundingRateEngine);
        fundingRateEngine = FundingRateEngine(_fundingRateEngine);
        emit FundingRateEngineUpdated(previousEngine, _fundingRateEngine);
    }

    /**
     * @notice Set the role manager
     * @param _roleManager Address of the role manager
     */
    function setRoleManager(address _roleManager) external onlyOwner {
        roleManager = IRoleManager(_roleManager);
    }

    /**
     * @notice Set the creation fee
     * @param _creationFee New creation fee in wei
     */
    function setCreationFee(uint256 _creationFee) external onlyOwner {
        uint256 previousFee = creationFee;
        creationFee = _creationFee;
        emit CreationFeeUpdated(previousFee, _creationFee);
    }

    /**
     * @notice Set the fee recipient
     * @param _feeRecipient New fee recipient address
     */
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid recipient");
        address previousRecipient = feeRecipient;
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(previousRecipient, _feeRecipient);
    }

    /**
     * @notice Set maximum markets per creator
     * @param _maxMarketsPerCreator New limit (0 = unlimited)
     */
    function setMaxMarketsPerCreator(uint256 _maxMarketsPerCreator) external onlyOwner {
        maxMarketsPerCreator = _maxMarketsPerCreator;
    }

    /**
     * @notice Set allowed collateral token
     * @param token Token address
     * @param allowed Whether to allow the token
     */
    function setAllowedCollateralToken(address token, bool allowed) external onlyOwner {
        require(token != address(0), "Invalid token");
        allowedCollateralTokens[token] = allowed;
        emit CollateralTokenUpdated(token, allowed);
    }

    /**
     * @notice Set default collateral token
     * @param token Token address
     */
    function setDefaultCollateralToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(allowedCollateralTokens[token], "Token not allowed");
        defaultCollateralToken = token;
    }

    /**
     * @notice Pause the factory
     */
    function pause() external onlyOwner {
        paused = true;
    }

    /**
     * @notice Unpause the factory
     */
    function unpause() external onlyOwner {
        paused = false;
    }

    /**
     * @notice Emergency withdraw stuck funds
     * @param token Token address (address(0) for native)
     * @param amount Amount to withdraw
     * @param recipient Recipient address
     */
    function emergencyWithdraw(
        address token,
        uint256 amount,
        address recipient
    ) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");

        if (token == address(0)) {
            payable(recipient).transfer(amount);
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    // ============ View Functions ============

    /**
     * @notice Get market info by ID
     * @param marketId Market ID
     * @return MarketInfo struct
     */
    function getMarket(uint256 marketId) external view returns (MarketInfo memory) {
        require(marketId < marketCount, "Invalid market ID");
        return markets[marketId];
    }

    /**
     * @notice Get market info by address
     * @param marketAddress Market contract address
     * @return MarketInfo struct
     */
    function getMarketByAddress(address marketAddress) external view returns (MarketInfo memory) {
        uint256 marketId = marketAddressToId[marketAddress];
        require(markets[marketId].marketAddress == marketAddress, "Market not found");
        return markets[marketId];
    }

    /**
     * @notice Get all markets by category
     * @param category Market category
     * @return Array of market IDs
     */
    function getMarketsByCategory(MarketCategory category) external view returns (uint256[] memory) {
        return marketsByCategory[category];
    }

    /**
     * @notice Get all markets by underlying asset
     * @param asset Underlying asset symbol
     * @return Array of market IDs
     */
    function getMarketsByAsset(string calldata asset) external view returns (uint256[] memory) {
        return marketsByAsset[asset];
    }

    /**
     * @notice Get perp markets linked to a conditional market
     * @param conditionalMarketId Conditional market ID
     * @return Array of perp market IDs
     */
    function getMarketsByConditionalMarket(uint256 conditionalMarketId) external view returns (uint256[] memory) {
        return marketsByConditionalMarket[conditionalMarketId];
    }

    /**
     * @notice Get all active markets with pagination
     * @param offset Starting index
     * @param limit Maximum results
     * @return marketIds Array of market IDs
     * @return hasMore Whether more results exist
     */
    function getActiveMarkets(
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory marketIds, bool hasMore) {
        // Count active markets
        uint256 activeCount = 0;
        for (uint256 i = 0; i < marketCount; i++) {
            if (markets[i].active) {
                activeCount++;
            }
        }

        if (offset >= activeCount) {
            return (new uint256[](0), false);
        }

        uint256 resultCount = activeCount - offset;
        if (resultCount > limit) {
            resultCount = limit;
            hasMore = true;
        }

        marketIds = new uint256[](resultCount);
        uint256 currentIndex = 0;
        uint256 skipCount = offset;

        for (uint256 i = 0; i < marketCount && currentIndex < resultCount; i++) {
            if (markets[i].active) {
                if (skipCount > 0) {
                    skipCount--;
                } else {
                    marketIds[currentIndex] = i;
                    currentIndex++;
                }
            }
        }

        return (marketIds, hasMore);
    }

    /**
     * @notice Get total number of markets
     * @return Total market count
     */
    function getTotalMarkets() external view returns (uint256) {
        return marketCount;
    }

    /**
     * @notice Check if a market is active
     * @param marketId Market ID
     * @return Whether the market is active
     */
    function isMarketActive(uint256 marketId) external view returns (bool) {
        if (marketId >= marketCount) return false;
        return markets[marketId].active;
    }

    // ============ Internal Functions ============

    /**
     * @notice Convert uint to string
     * @param value Value to convert
     * @return String representation
     */
    function _uint2str(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    /**
     * @notice Receive function to accept ETH
     */
    receive() external payable {}
}
