// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IRoleManager.sol";

/**
 * @title PerpetualFuturesMarket
 * @notice A perpetual futures trading market for prediction outcomes
 * @dev Implements leveraged trading with funding rate mechanism
 *
 * Key Features:
 * - Long/Short positions with configurable leverage (up to 20x)
 * - Funding rate mechanism to anchor perp price to index price
 * - Initial margin and maintenance margin requirements
 * - Automatic liquidation for undercollateralized positions
 * - Real-time PnL tracking
 *
 * Integration with FairWins:
 * - Uses same collateral tokens (USC, WETC, ETC)
 * - Role-based access control via IRoleManager
 * - Oracle integration for index price feeds
 */
contract PerpetualFuturesMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Enums ============

    /// @notice Position side (Long or Short)
    enum PositionSide {
        Long,
        Short
    }

    /// @notice Market status
    enum MarketStatus {
        Active,
        Paused,
        Settled
    }

    // ============ Structs ============

    /// @notice Individual position data
    struct Position {
        address trader;
        PositionSide side;
        uint256 size;              // Position size in base units
        uint256 collateral;        // Collateral deposited
        uint256 entryPrice;        // Average entry price (scaled by PRICE_PRECISION)
        uint256 leverage;          // Leverage used (scaled by LEVERAGE_PRECISION)
        int256 unrealizedPnL;      // Current unrealized PnL
        int256 accumulatedFunding; // Accumulated funding payments
        uint256 lastFundingTime;   // Last time funding was applied
        uint256 openedAt;          // Position open timestamp
        bool isOpen;               // Whether position is active
    }

    /// @notice Market configuration
    struct MarketConfig {
        uint256 maxLeverage;           // Maximum allowed leverage (20x = 20 * LEVERAGE_PRECISION)
        uint256 initialMarginRate;     // Initial margin requirement (e.g., 5% = 500)
        uint256 maintenanceMarginRate; // Maintenance margin (e.g., 2.5% = 250)
        uint256 liquidationFeeRate;    // Fee taken on liquidation (e.g., 1% = 100)
        uint256 tradingFeeRate;        // Trading fee (e.g., 0.1% = 10)
        uint256 fundingInterval;       // Funding interval in seconds (e.g., 8 hours)
        uint256 maxFundingRate;        // Max funding rate per interval (e.g., 0.1% = 10)
    }

    /// @notice Market metrics
    struct MarketMetrics {
        uint256 totalLongPositions;
        uint256 totalShortPositions;
        uint256 totalLongSize;
        uint256 totalShortSize;
        uint256 openInterest;
        int256 netFunding;
        uint256 totalVolume;
        uint256 lastFundingTime;
        int256 currentFundingRate;
    }

    // ============ Constants ============

    uint256 public constant PRICE_PRECISION = 1e18;
    uint256 public constant LEVERAGE_PRECISION = 1e4;
    uint256 public constant RATE_PRECISION = 1e4; // 10000 = 100%
    uint256 public constant FUNDING_RATE_PRECISION = 1e6;
    uint256 public constant MAX_POSITIONS_PER_TRADER = 10;

    // ============ State Variables ============

    /// @notice Unique market identifier
    uint256 public marketId;

    /// @notice Market name/description
    string public marketName;

    /// @notice Underlying asset symbol (e.g., "BTC", "ETH", "PREDICTION_OUTCOME")
    string public underlyingAsset;

    /// @notice Collateral token (e.g., USC stablecoin)
    IERC20 public collateralToken;

    /// @notice Collateral token decimals (for normalizing calculations)
    uint8 public collateralDecimals;

    /// @notice Current market status
    MarketStatus public status;

    /// @notice Market configuration
    MarketConfig public config;

    /// @notice Market metrics
    MarketMetrics public metrics;

    /// @notice Current index price (from oracle)
    uint256 public indexPrice;

    /// @notice Current mark price (perp price)
    uint256 public markPrice;

    /// @notice Role manager for access control
    IRoleManager public roleManager;

    /// @notice Position ID counter
    uint256 public positionCount;

    /// @notice Position ID => Position
    mapping(uint256 => Position) public positions;

    /// @notice Trader => Position IDs
    mapping(address => uint256[]) private traderPositions;

    /// @notice Insurance fund balance
    uint256 public insuranceFund;

    /// @notice Fee recipient address
    address public feeRecipient;

    /// @notice Total fees collected
    uint256 public totalFeesCollected;

    /// @notice Paused state
    bool public paused;

    /// @notice Authorized price updaters
    mapping(address => bool) public priceUpdaters;

    // ============ Events ============

    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        PositionSide side,
        uint256 size,
        uint256 collateral,
        uint256 leverage,
        uint256 entryPrice,
        uint256 timestamp
    );

    event PositionClosed(
        uint256 indexed positionId,
        address indexed trader,
        uint256 exitPrice,
        int256 realizedPnL,
        uint256 fee,
        uint256 timestamp
    );

    event PositionModified(
        uint256 indexed positionId,
        address indexed trader,
        uint256 newSize,
        uint256 newCollateral,
        uint256 timestamp
    );

    event PositionLiquidated(
        uint256 indexed positionId,
        address indexed trader,
        address indexed liquidator,
        uint256 liquidationPrice,
        uint256 liquidationFee,
        uint256 timestamp
    );

    event FundingApplied(
        uint256 indexed positionId,
        int256 fundingPayment,
        int256 fundingRate,
        uint256 timestamp
    );

    event MarketFundingSettled(
        int256 fundingRate,
        uint256 longPayment,
        uint256 shortPayment,
        uint256 timestamp
    );

    event PriceUpdated(
        uint256 indexPrice,
        uint256 markPrice,
        uint256 timestamp
    );

    event MarketStatusChanged(
        MarketStatus previousStatus,
        MarketStatus newStatus,
        uint256 timestamp
    );

    event CollateralDeposited(
        uint256 indexed positionId,
        address indexed trader,
        uint256 amount,
        uint256 timestamp
    );

    event CollateralWithdrawn(
        uint256 indexed positionId,
        address indexed trader,
        uint256 amount,
        uint256 timestamp
    );

    event InsuranceFundUpdated(
        uint256 previousBalance,
        uint256 newBalance,
        uint256 timestamp
    );

    event PriceUpdaterUpdated(address indexed updater, bool authorized);

    // ============ Modifiers ============

    modifier whenNotPaused() {
        require(!paused, "Market is paused");
        _;
    }

    modifier whenActive() {
        require(status == MarketStatus.Active, "Market not active");
        _;
    }

    modifier validPosition(uint256 positionId) {
        require(positionId < positionCount, "Invalid position ID");
        require(positions[positionId].isOpen, "Position not open");
        _;
    }

    modifier onlyPositionOwner(uint256 positionId) {
        require(positions[positionId].trader == msg.sender, "Not position owner");
        _;
    }

    modifier onlyPriceUpdater() {
        require(priceUpdaters[msg.sender] || msg.sender == owner(), "Not authorized price updater");
        _;
    }

    // ============ Constructor ============

    constructor(
        uint256 _marketId,
        string memory _marketName,
        string memory _underlyingAsset,
        address _collateralToken,
        address _feeRecipient,
        address _roleManager
    ) Ownable(msg.sender) {
        require(_collateralToken != address(0), "Invalid collateral token");
        require(_feeRecipient != address(0), "Invalid fee recipient");

        marketId = _marketId;
        marketName = _marketName;
        underlyingAsset = _underlyingAsset;
        collateralToken = IERC20(_collateralToken);
        collateralDecimals = IERC20Metadata(_collateralToken).decimals();
        feeRecipient = _feeRecipient;
        status = MarketStatus.Active;

        if (_roleManager != address(0)) {
            roleManager = IRoleManager(_roleManager);
        }

        // Set default configuration
        config = MarketConfig({
            maxLeverage: 20 * LEVERAGE_PRECISION,      // 20x max leverage
            initialMarginRate: 500,                     // 5% initial margin
            maintenanceMarginRate: 250,                 // 2.5% maintenance margin
            liquidationFeeRate: 100,                    // 1% liquidation fee
            tradingFeeRate: 10,                         // 0.1% trading fee
            fundingInterval: 8 hours,                   // 8 hour funding interval
            maxFundingRate: 1000                        // 0.1% max funding rate
        });

        // Initialize metrics
        metrics.lastFundingTime = block.timestamp;
    }

    // ============ Trading Functions ============

    /**
     * @notice Open a new perpetual position
     * @param side Position side (Long or Short)
     * @param size Position size in base units
     * @param collateralAmount Collateral to deposit
     * @param leverage Desired leverage (scaled by LEVERAGE_PRECISION)
     * @return positionId The ID of the newly created position
     */
    function openPosition(
        PositionSide side,
        uint256 size,
        uint256 collateralAmount,
        uint256 leverage
    ) external nonReentrant whenNotPaused whenActive returns (uint256 positionId) {
        require(size > 0, "Size must be positive");
        require(collateralAmount > 0, "Collateral must be positive");
        require(leverage >= LEVERAGE_PRECISION, "Leverage must be >= 1x");
        require(leverage <= config.maxLeverage, "Leverage exceeds maximum");
        require(traderPositions[msg.sender].length < MAX_POSITIONS_PER_TRADER, "Max positions reached");

        // Normalize collateral to 18 decimals for margin calculations
        uint256 normalizedCollateral = _normalizeCollateral(collateralAmount);

        // Calculate required margin (all in 18 decimals)
        uint256 notionalValue = (size * markPrice) / PRICE_PRECISION;
        uint256 requiredMargin = (notionalValue * config.initialMarginRate) / RATE_PRECISION;
        require(normalizedCollateral >= requiredMargin, "Insufficient margin");

        // Verify leverage matches collateral (using normalized values)
        uint256 effectiveLeverage = (notionalValue * LEVERAGE_PRECISION) / normalizedCollateral;
        require(effectiveLeverage <= leverage, "Effective leverage exceeds requested");

        // Transfer collateral
        collateralToken.safeTransferFrom(msg.sender, address(this), collateralAmount);

        // Calculate and collect trading fee (convert from 18 decimals to token decimals)
        uint256 tradingFeeNormalized = (notionalValue * config.tradingFeeRate) / RATE_PRECISION;
        uint256 tradingFee = _denormalizeCollateral(tradingFeeNormalized);
        if (tradingFee > 0 && tradingFee < collateralAmount) {
            collateralAmount -= tradingFee;
            totalFeesCollected += tradingFee;
            collateralToken.safeTransfer(feeRecipient, tradingFee);
        }

        // Create position
        positionId = positionCount++;
        positions[positionId] = Position({
            trader: msg.sender,
            side: side,
            size: size,
            collateral: collateralAmount,
            entryPrice: markPrice,
            leverage: effectiveLeverage,
            unrealizedPnL: 0,
            accumulatedFunding: 0,
            lastFundingTime: block.timestamp,
            openedAt: block.timestamp,
            isOpen: true
        });

        traderPositions[msg.sender].push(positionId);

        // Update metrics
        if (side == PositionSide.Long) {
            metrics.totalLongPositions++;
            metrics.totalLongSize += size;
        } else {
            metrics.totalShortPositions++;
            metrics.totalShortSize += size;
        }
        metrics.openInterest += notionalValue;
        metrics.totalVolume += notionalValue;

        emit PositionOpened(
            positionId,
            msg.sender,
            side,
            size,
            collateralAmount,
            effectiveLeverage,
            markPrice,
            block.timestamp
        );
    }

    /**
     * @notice Close an existing position
     * @param positionId ID of the position to close
     */
    function closePosition(uint256 positionId)
        external
        nonReentrant
        whenNotPaused
        validPosition(positionId)
        onlyPositionOwner(positionId)
    {
        Position storage position = positions[positionId];

        // Apply any pending funding
        _applyFunding(positionId);

        // Calculate PnL
        int256 pnl = _calculatePnL(position);
        int256 totalPnL = pnl + position.accumulatedFunding;

        // Calculate exit amount
        uint256 exitAmount;
        if (totalPnL >= 0) {
            exitAmount = position.collateral + uint256(totalPnL);
        } else {
            uint256 loss = uint256(-totalPnL);
            if (loss >= position.collateral) {
                exitAmount = 0;
                // Add remaining to insurance fund
                insuranceFund += position.collateral - exitAmount;
            } else {
                exitAmount = position.collateral - loss;
            }
        }

        // Calculate and deduct trading fee (convert from 18 decimals to token decimals)
        uint256 notionalValue = (position.size * markPrice) / PRICE_PRECISION;
        uint256 tradingFeeNormalized = (notionalValue * config.tradingFeeRate) / RATE_PRECISION;
        uint256 tradingFee = _denormalizeCollateral(tradingFeeNormalized);
        if (tradingFee > 0 && tradingFee < exitAmount) {
            exitAmount -= tradingFee;
            totalFeesCollected += tradingFee;
            collateralToken.safeTransfer(feeRecipient, tradingFee);
        }

        // Update metrics
        if (position.side == PositionSide.Long) {
            metrics.totalLongPositions--;
            metrics.totalLongSize -= position.size;
        } else {
            metrics.totalShortPositions--;
            metrics.totalShortSize -= position.size;
        }
        metrics.openInterest -= (position.size * position.entryPrice) / PRICE_PRECISION;

        // Close position
        position.isOpen = false;

        // Transfer exit amount
        if (exitAmount > 0) {
            collateralToken.safeTransfer(msg.sender, exitAmount);
        }

        emit PositionClosed(
            positionId,
            msg.sender,
            markPrice,
            totalPnL,
            tradingFee,
            block.timestamp
        );
    }

    /**
     * @notice Add collateral to an existing position
     * @param positionId ID of the position
     * @param amount Amount of collateral to add
     */
    function addCollateral(uint256 positionId, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        validPosition(positionId)
        onlyPositionOwner(positionId)
    {
        require(amount > 0, "Amount must be positive");

        Position storage position = positions[positionId];
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        position.collateral += amount;

        // Recalculate leverage (using normalized collateral for calculation)
        uint256 notionalValue = (position.size * markPrice) / PRICE_PRECISION;
        uint256 normalizedCollateral = _normalizeCollateral(position.collateral);
        position.leverage = (notionalValue * LEVERAGE_PRECISION) / normalizedCollateral;

        emit CollateralDeposited(positionId, msg.sender, amount, block.timestamp);
        emit PositionModified(positionId, msg.sender, position.size, position.collateral, block.timestamp);
    }

    /**
     * @notice Remove collateral from a position (if margin allows)
     * @param positionId ID of the position
     * @param amount Amount of collateral to remove
     */
    function removeCollateral(uint256 positionId, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        validPosition(positionId)
        onlyPositionOwner(positionId)
    {
        require(amount > 0, "Amount must be positive");

        Position storage position = positions[positionId];
        require(amount < position.collateral, "Cannot remove all collateral");

        // Calculate remaining margin after removal (all calculations in 18 decimals)
        uint256 remainingCollateral = position.collateral - amount;
        uint256 normalizedRemaining = _normalizeCollateral(remainingCollateral);
        uint256 notionalValue = (position.size * markPrice) / PRICE_PRECISION;
        uint256 requiredMargin = (notionalValue * config.initialMarginRate) / RATE_PRECISION;

        // Apply pending funding before checking margin
        _applyFunding(positionId);
        int256 pnl = _calculatePnL(position);
        // Normalize PnL and funding to 18 decimals for comparison
        int256 normalizedPnl = int256(_normalizeCollateral(pnl >= 0 ? uint256(pnl) : uint256(-pnl)));
        if (pnl < 0) normalizedPnl = -normalizedPnl;
        int256 normalizedFunding = int256(_normalizeCollateral(position.accumulatedFunding >= 0 ? uint256(position.accumulatedFunding) : uint256(-position.accumulatedFunding)));
        if (position.accumulatedFunding < 0) normalizedFunding = -normalizedFunding;
        int256 effectiveCollateral = int256(normalizedRemaining) + normalizedPnl + normalizedFunding;

        require(effectiveCollateral >= int256(requiredMargin), "Insufficient margin after removal");

        // Check leverage doesn't exceed max
        uint256 newLeverage = (notionalValue * LEVERAGE_PRECISION) / normalizedRemaining;
        require(newLeverage <= config.maxLeverage, "Leverage would exceed maximum");

        position.collateral = remainingCollateral;
        position.leverage = newLeverage;

        collateralToken.safeTransfer(msg.sender, amount);

        emit CollateralWithdrawn(positionId, msg.sender, amount, block.timestamp);
        emit PositionModified(positionId, msg.sender, position.size, position.collateral, block.timestamp);
    }

    /**
     * @notice Liquidate an undercollateralized position
     * @param positionId ID of the position to liquidate
     */
    function liquidatePosition(uint256 positionId)
        external
        nonReentrant
        whenNotPaused
        validPosition(positionId)
    {
        Position storage position = positions[positionId];
        require(position.trader != msg.sender, "Cannot self-liquidate");

        // Apply pending funding
        _applyFunding(positionId);

        // Check if position is liquidatable
        require(_isLiquidatable(positionId), "Position not liquidatable");

        // Calculate liquidation values (convert from 18 decimals to token decimals)
        uint256 notionalValue = (position.size * markPrice) / PRICE_PRECISION;
        uint256 liquidationFeeNormalized = (notionalValue * config.liquidationFeeRate) / RATE_PRECISION;
        uint256 liquidationFee = _denormalizeCollateral(liquidationFeeNormalized);

        // Calculate remaining collateral after PnL
        int256 pnl = _calculatePnL(position);
        int256 totalPnL = pnl + position.accumulatedFunding;

        uint256 remainingCollateral;
        if (totalPnL >= 0) {
            remainingCollateral = position.collateral + uint256(totalPnL);
        } else {
            uint256 loss = uint256(-totalPnL);
            if (loss >= position.collateral) {
                remainingCollateral = 0;
            } else {
                remainingCollateral = position.collateral - loss;
            }
        }

        // Distribute liquidation proceeds
        uint256 liquidatorReward = liquidationFee / 2; // 50% to liquidator
        uint256 insuranceContribution = liquidationFee - liquidatorReward; // 50% to insurance

        if (remainingCollateral >= liquidationFee) {
            collateralToken.safeTransfer(msg.sender, liquidatorReward);
            insuranceFund += insuranceContribution;
        } else if (remainingCollateral > 0) {
            // Partial fee distribution
            uint256 partialReward = remainingCollateral / 2;
            collateralToken.safeTransfer(msg.sender, partialReward);
            insuranceFund += remainingCollateral - partialReward;
        }
        // If remainingCollateral == 0, use insurance fund to cover losses
        if (remainingCollateral == 0 && totalPnL < 0) {
            uint256 deficit = uint256(-totalPnL) - position.collateral;
            if (deficit <= insuranceFund) {
                insuranceFund -= deficit;
            }
        }

        // Update metrics
        if (position.side == PositionSide.Long) {
            metrics.totalLongPositions--;
            metrics.totalLongSize -= position.size;
        } else {
            metrics.totalShortPositions--;
            metrics.totalShortSize -= position.size;
        }
        metrics.openInterest -= (position.size * position.entryPrice) / PRICE_PRECISION;

        // Close position
        position.isOpen = false;

        emit PositionLiquidated(
            positionId,
            position.trader,
            msg.sender,
            markPrice,
            liquidationFee,
            block.timestamp
        );
    }

    // ============ Funding Functions ============

    /**
     * @notice Settle funding for all positions (called periodically)
     */
    function settleFunding() external nonReentrant whenNotPaused whenActive {
        require(
            block.timestamp >= metrics.lastFundingTime + config.fundingInterval,
            "Funding interval not reached"
        );

        // Calculate funding rate based on mark price vs index price
        int256 fundingRate = _calculateFundingRate();
        metrics.currentFundingRate = fundingRate;
        metrics.lastFundingTime = block.timestamp;

        // Calculate total funding payments
        uint256 longPayment = 0;
        uint256 shortPayment = 0;

        if (fundingRate > 0) {
            // Longs pay shorts
            longPayment = (metrics.totalLongSize * uint256(fundingRate)) / FUNDING_RATE_PRECISION;
            shortPayment = 0;
        } else if (fundingRate < 0) {
            // Shorts pay longs
            longPayment = 0;
            shortPayment = (metrics.totalShortSize * uint256(-fundingRate)) / FUNDING_RATE_PRECISION;
        }

        metrics.netFunding += fundingRate;

        emit MarketFundingSettled(fundingRate, longPayment, shortPayment, block.timestamp);
    }

    /**
     * @notice Apply pending funding to a specific position
     * @param positionId ID of the position
     */
    function applyFundingToPosition(uint256 positionId)
        external
        nonReentrant
        validPosition(positionId)
    {
        _applyFunding(positionId);
    }

    // ============ Price Functions ============

    /**
     * @notice Update the index price (from oracle)
     * @param newIndexPrice New index price
     */
    function updateIndexPrice(uint256 newIndexPrice) external onlyPriceUpdater {
        require(newIndexPrice > 0, "Price must be positive");
        indexPrice = newIndexPrice;
        emit PriceUpdated(indexPrice, markPrice, block.timestamp);
    }

    /**
     * @notice Update the mark price (perp price)
     * @param newMarkPrice New mark price
     */
    function updateMarkPrice(uint256 newMarkPrice) external onlyPriceUpdater {
        require(newMarkPrice > 0, "Price must be positive");
        markPrice = newMarkPrice;
        emit PriceUpdated(indexPrice, markPrice, block.timestamp);
    }

    /**
     * @notice Update both prices simultaneously
     * @param newIndexPrice New index price
     * @param newMarkPrice New mark price
     */
    function updatePrices(uint256 newIndexPrice, uint256 newMarkPrice) external onlyPriceUpdater {
        require(newIndexPrice > 0 && newMarkPrice > 0, "Prices must be positive");
        indexPrice = newIndexPrice;
        markPrice = newMarkPrice;
        emit PriceUpdated(indexPrice, markPrice, block.timestamp);
    }

    /**
     * @notice Set price updater authorization
     * @param updater Address of the price updater
     * @param authorized Whether to authorize or revoke
     */
    function setPriceUpdater(address updater, bool authorized) external onlyOwner {
        priceUpdaters[updater] = authorized;
        emit PriceUpdaterUpdated(updater, authorized);
    }

    // ============ Admin Functions ============

    /**
     * @notice Update market configuration
     * @param newConfig New market configuration
     */
    function updateConfig(MarketConfig calldata newConfig) external onlyOwner {
        require(newConfig.maxLeverage >= LEVERAGE_PRECISION, "Max leverage must be >= 1x");
        require(newConfig.maintenanceMarginRate < newConfig.initialMarginRate, "Maintenance must be < initial");
        require(newConfig.fundingInterval >= 1 hours, "Funding interval too short");
        config = newConfig;
    }

    /**
     * @notice Pause the market
     */
    function pause() external onlyOwner {
        paused = true;
    }

    /**
     * @notice Unpause the market
     */
    function unpause() external onlyOwner {
        paused = false;
    }

    /**
     * @notice Set market status
     * @param newStatus New market status
     */
    function setStatus(MarketStatus newStatus) external onlyOwner {
        MarketStatus previousStatus = status;
        status = newStatus;
        emit MarketStatusChanged(previousStatus, newStatus, block.timestamp);
    }

    /**
     * @notice Update fee recipient
     * @param newRecipient New fee recipient address
     */
    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid recipient");
        feeRecipient = newRecipient;
    }

    /**
     * @notice Deposit to insurance fund
     * @param amount Amount to deposit
     */
    function depositToInsuranceFund(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be positive");
        uint256 previousBalance = insuranceFund;
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        insuranceFund += amount;
        emit InsuranceFundUpdated(previousBalance, insuranceFund, block.timestamp);
    }

    /**
     * @notice Withdraw from insurance fund (owner only)
     * @param amount Amount to withdraw
     * @param recipient Recipient address
     */
    function withdrawFromInsuranceFund(uint256 amount, address recipient) external onlyOwner {
        require(amount <= insuranceFund, "Insufficient insurance fund");
        require(recipient != address(0), "Invalid recipient");
        uint256 previousBalance = insuranceFund;
        insuranceFund -= amount;
        collateralToken.safeTransfer(recipient, amount);
        emit InsuranceFundUpdated(previousBalance, insuranceFund, block.timestamp);
    }

    // ============ View Functions ============

    /**
     * @notice Get position details
     * @param positionId ID of the position
     * @return Position struct
     */
    function getPosition(uint256 positionId) external view returns (Position memory) {
        require(positionId < positionCount, "Invalid position ID");
        return positions[positionId];
    }

    /**
     * @notice Get all position IDs for a trader
     * @param trader Trader address
     * @return Array of position IDs
     */
    function getTraderPositions(address trader) external view returns (uint256[] memory) {
        return traderPositions[trader];
    }

    /**
     * @notice Calculate unrealized PnL for a position
     * @param positionId ID of the position
     * @return Unrealized PnL
     */
    function getUnrealizedPnL(uint256 positionId) external view returns (int256) {
        require(positionId < positionCount, "Invalid position ID");
        return _calculatePnL(positions[positionId]);
    }

    /**
     * @notice Check if a position is liquidatable
     * @param positionId ID of the position
     * @return Whether the position can be liquidated
     */
    function isLiquidatable(uint256 positionId) external view returns (bool) {
        if (positionId >= positionCount || !positions[positionId].isOpen) {
            return false;
        }
        return _isLiquidatable(positionId);
    }

    /**
     * @notice Get the liquidation price for a position
     * @param positionId ID of the position
     * @return Liquidation price
     */
    function getLiquidationPrice(uint256 positionId) external view returns (uint256) {
        require(positionId < positionCount, "Invalid position ID");
        Position memory position = positions[positionId];
        if (!position.isOpen) return 0;

        // Normalize collateral to 18 decimals for calculations
        uint256 normalizedCollateral = _normalizeCollateral(position.collateral);

        // Calculate liquidation price (all in 18 decimals)
        uint256 maintenanceMargin = (position.size * position.entryPrice * config.maintenanceMarginRate)
            / (PRICE_PRECISION * RATE_PRECISION);

        if (position.side == PositionSide.Long) {
            // Long: liquidation when price drops
            // collateral - (entryPrice - liqPrice) * size = maintenanceMargin
            // liqPrice = entryPrice - (collateral - maintenanceMargin) / size
            if (normalizedCollateral <= maintenanceMargin) return position.entryPrice;
            uint256 buffer = ((normalizedCollateral - maintenanceMargin) * PRICE_PRECISION) / position.size;
            if (buffer >= position.entryPrice) return 0;
            return position.entryPrice - buffer;
        } else {
            // Short: liquidation when price rises
            // liqPrice = entryPrice + (collateral - maintenanceMargin) / size
            if (normalizedCollateral <= maintenanceMargin) return position.entryPrice;
            uint256 buffer = ((normalizedCollateral - maintenanceMargin) * PRICE_PRECISION) / position.size;
            return position.entryPrice + buffer;
        }
    }

    /**
     * @notice Get current funding rate
     * @return Current funding rate
     */
    function getCurrentFundingRate() external view returns (int256) {
        return _calculateFundingRate();
    }

    /**
     * @notice Get market metrics
     * @return MarketMetrics struct
     */
    function getMetrics() external view returns (MarketMetrics memory) {
        return metrics;
    }

    /**
     * @notice Get market configuration
     * @return MarketConfig struct
     */
    function getConfig() external view returns (MarketConfig memory) {
        return config;
    }

    // ============ Internal Functions ============

    /**
     * @notice Normalize collateral amount to 18 decimals for calculations
     * @param amount Amount in collateral token decimals
     * @return Normalized amount in 18 decimals
     */
    function _normalizeCollateral(uint256 amount) internal view returns (uint256) {
        if (collateralDecimals == 18) return amount;
        if (collateralDecimals < 18) {
            return amount * (10 ** (18 - collateralDecimals));
        } else {
            return amount / (10 ** (collateralDecimals - 18));
        }
    }

    /**
     * @notice Denormalize amount from 18 decimals to collateral token decimals
     * @param amount Amount in 18 decimals
     * @return Denormalized amount in collateral token decimals
     */
    function _denormalizeCollateral(uint256 amount) internal view returns (uint256) {
        if (collateralDecimals == 18) return amount;
        if (collateralDecimals < 18) {
            return amount / (10 ** (18 - collateralDecimals));
        } else {
            return amount * (10 ** (collateralDecimals - 18));
        }
    }

    /**
     * @notice Calculate PnL for a position
     * @param position Position struct
     * @return PnL value
     */
    function _calculatePnL(Position memory position) internal view returns (int256) {
        if (!position.isOpen || position.size == 0) return 0;

        int256 priceDiff = int256(markPrice) - int256(position.entryPrice);
        int256 pnl;

        if (position.side == PositionSide.Long) {
            // Long profits when price goes up
            pnl = (priceDiff * int256(position.size)) / int256(PRICE_PRECISION);
        } else {
            // Short profits when price goes down
            pnl = (-priceDiff * int256(position.size)) / int256(PRICE_PRECISION);
        }

        return pnl;
    }

    /**
     * @notice Check if a position is liquidatable
     * @param positionId ID of the position
     * @return Whether the position is liquidatable
     */
    function _isLiquidatable(uint256 positionId) internal view returns (bool) {
        Position memory position = positions[positionId];

        // All calculations in 18 decimals
        int256 pnl = _calculatePnL(position);
        uint256 normalizedCollateral = _normalizeCollateral(position.collateral);
        int256 effectiveCollateral = int256(normalizedCollateral) + pnl + position.accumulatedFunding;

        uint256 notionalValue = (position.size * markPrice) / PRICE_PRECISION;
        uint256 maintenanceMargin = (notionalValue * config.maintenanceMarginRate) / RATE_PRECISION;

        return effectiveCollateral < int256(maintenanceMargin);
    }

    /**
     * @notice Calculate current funding rate
     * @return Funding rate (positive = longs pay shorts)
     */
    function _calculateFundingRate() internal view returns (int256) {
        if (indexPrice == 0) return 0;

        // Premium = (markPrice - indexPrice) / indexPrice
        int256 premium = ((int256(markPrice) - int256(indexPrice)) * int256(FUNDING_RATE_PRECISION)) / int256(indexPrice);

        // Clamp to max funding rate
        int256 maxRate = int256(config.maxFundingRate);
        if (premium > maxRate) {
            premium = maxRate;
        } else if (premium < -maxRate) {
            premium = -maxRate;
        }

        return premium;
    }

    /**
     * @notice Apply funding to a position
     * @param positionId ID of the position
     */
    function _applyFunding(uint256 positionId) internal {
        Position storage position = positions[positionId];

        if (position.lastFundingTime >= metrics.lastFundingTime) {
            return; // Funding already applied
        }

        int256 fundingRate = metrics.currentFundingRate;
        int256 fundingPayment;

        if (position.side == PositionSide.Long) {
            // Longs pay positive funding, receive negative funding
            fundingPayment = -(fundingRate * int256(position.size)) / int256(FUNDING_RATE_PRECISION);
        } else {
            // Shorts receive positive funding, pay negative funding
            fundingPayment = (fundingRate * int256(position.size)) / int256(FUNDING_RATE_PRECISION);
        }

        position.accumulatedFunding += fundingPayment;
        position.lastFundingTime = block.timestamp;

        emit FundingApplied(positionId, fundingPayment, fundingRate, block.timestamp);
    }
}
