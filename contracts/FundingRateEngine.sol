// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FundingRateEngine
 * @notice Advanced funding rate calculation engine for perpetual futures
 * @dev Provides sophisticated funding rate mechanisms including:
 * - Time-weighted average price (TWAP) based funding
 * - Interest rate component
 * - Premium/discount calculation
 * - Dynamic funding rate adjustments
 *
 * The funding rate mechanism keeps perpetual futures prices
 * anchored to the underlying index price through periodic payments
 * between long and short position holders.
 */
contract FundingRateEngine is Ownable {
    // ============ Constants ============

    uint256 public constant PRECISION = 1e18;
    uint256 public constant RATE_PRECISION = 1e6;
    uint256 public constant HOUR = 3600;
    uint256 public constant FUNDING_PERIOD = 8 hours;

    // ============ Structs ============

    /// @notice Price observation for TWAP calculation
    struct PriceObservation {
        uint256 timestamp;
        uint256 indexPrice;
        uint256 markPrice;
        uint256 cumulativeIndex;
        uint256 cumulativeMark;
    }

    /// @notice Funding rate configuration
    struct FundingConfig {
        uint256 fundingInterval;     // Time between funding settlements (default 8 hours)
        int256 interestRate;         // Base interest rate component
        uint256 maxFundingRate;      // Maximum funding rate cap
        uint256 dampingFactor;       // Damping factor for rate changes (prevents spikes)
        uint256 twapWindow;          // TWAP window for price averaging
        bool useTimeWeightedAverage; // Whether to use TWAP or spot prices
    }

    /// @notice Funding rate state for a market
    struct FundingState {
        int256 currentRate;           // Current funding rate
        int256 previousRate;          // Previous funding rate
        uint256 lastSettlementTime;   // Last settlement timestamp
        uint256 nextSettlementTime;   // Next scheduled settlement
        int256 cumulativeFunding;     // Cumulative funding index
        uint256 observationIndex;     // Current observation index
    }

    // ============ State Variables ============

    /// @notice Default funding configuration
    FundingConfig public defaultConfig;

    /// @notice Market ID => FundingConfig
    mapping(uint256 => FundingConfig) public marketConfigs;

    /// @notice Market ID => FundingState
    mapping(uint256 => FundingState) public fundingStates;

    /// @notice Market ID => Price observations array
    mapping(uint256 => PriceObservation[]) public priceObservations;

    /// @notice Maximum observations to store per market
    uint256 public constant MAX_OBSERVATIONS = 1000;

    /// @notice Authorized price updaters
    mapping(address => bool) public priceUpdaters;

    /// @notice Authorized market contracts
    mapping(address => bool) public authorizedMarkets;

    // ============ Events ============

    event FundingRateCalculated(
        uint256 indexed marketId,
        int256 fundingRate,
        int256 premium,
        int256 interestComponent,
        uint256 timestamp
    );

    event FundingSettled(
        uint256 indexed marketId,
        int256 fundingRate,
        int256 cumulativeFunding,
        uint256 timestamp
    );

    event PriceObserved(
        uint256 indexed marketId,
        uint256 indexPrice,
        uint256 markPrice,
        uint256 timestamp
    );

    event ConfigUpdated(
        uint256 indexed marketId,
        uint256 fundingInterval,
        int256 interestRate,
        uint256 maxFundingRate
    );

    event PriceUpdaterUpdated(address indexed updater, bool authorized);
    event MarketAuthorized(address indexed market, bool authorized);

    // ============ Modifiers ============

    modifier onlyPriceUpdater() {
        require(priceUpdaters[msg.sender] || msg.sender == owner(), "Not authorized price updater");
        _;
    }

    modifier onlyAuthorizedMarket() {
        require(authorizedMarkets[msg.sender] || msg.sender == owner(), "Not authorized market");
        _;
    }

    // ============ Constructor ============

    constructor() Ownable(msg.sender) {
        // Set default configuration
        defaultConfig = FundingConfig({
            fundingInterval: FUNDING_PERIOD,        // 8 hours
            interestRate: 100,                      // 0.01% base rate
            maxFundingRate: 10000,                  // 1% max rate
            dampingFactor: 500,                     // 50% damping
            twapWindow: 1 hours,                    // 1 hour TWAP window
            useTimeWeightedAverage: true            // Use TWAP by default
        });

        // Authorize owner as price updater
        priceUpdaters[msg.sender] = true;
    }

    // ============ Admin Functions ============

    /**
     * @notice Set price updater authorization
     * @param updater Address of the price updater
     * @param authorized Whether to authorize or revoke
     */
    function setPriceUpdater(address updater, bool authorized) external onlyOwner {
        priceUpdaters[updater] = authorized;
        emit PriceUpdaterUpdated(updater, authorized);
    }

    /**
     * @notice Authorize a market contract
     * @param market Address of the market contract
     * @param authorized Whether to authorize or revoke
     */
    function setMarketAuthorization(address market, bool authorized) external onlyOwner {
        authorizedMarkets[market] = authorized;
        emit MarketAuthorized(market, authorized);
    }

    /**
     * @notice Update default funding configuration
     * @param config New default configuration
     */
    function setDefaultConfig(FundingConfig calldata config) external onlyOwner {
        require(config.fundingInterval >= 1 hours, "Funding interval too short");
        require(config.maxFundingRate <= 100000, "Max rate too high"); // 10% max
        defaultConfig = config;
    }

    /**
     * @notice Set configuration for a specific market
     * @param marketId Market identifier
     * @param config Market-specific configuration
     */
    function setMarketConfig(uint256 marketId, FundingConfig calldata config) external onlyOwner {
        require(config.fundingInterval >= 1 hours, "Funding interval too short");
        require(config.maxFundingRate <= 100000, "Max rate too high");
        marketConfigs[marketId] = config;
        emit ConfigUpdated(
            marketId,
            config.fundingInterval,
            config.interestRate,
            config.maxFundingRate
        );
    }

    /**
     * @notice Initialize funding state for a new market
     * @param marketId Market identifier
     */
    function initializeMarket(uint256 marketId) external onlyOwner {
        require(fundingStates[marketId].lastSettlementTime == 0, "Market already initialized");

        FundingConfig memory config = _getConfig(marketId);

        fundingStates[marketId] = FundingState({
            currentRate: 0,
            previousRate: 0,
            lastSettlementTime: block.timestamp,
            nextSettlementTime: block.timestamp + config.fundingInterval,
            cumulativeFunding: 0,
            observationIndex: 0
        });
    }

    // ============ Price Observation Functions ============

    /**
     * @notice Record a price observation for TWAP calculation
     * @param marketId Market identifier
     * @param indexPrice Current index price
     * @param markPrice Current mark price
     */
    function recordPriceObservation(
        uint256 marketId,
        uint256 indexPrice,
        uint256 markPrice
    ) external onlyPriceUpdater {
        require(indexPrice > 0 && markPrice > 0, "Prices must be positive");

        PriceObservation[] storage observations = priceObservations[marketId];
        FundingState storage state = fundingStates[marketId];

        uint256 cumulativeIndex = 0;
        uint256 cumulativeMark = 0;

        if (observations.length > 0) {
            PriceObservation memory lastObs = observations[observations.length - 1];
            uint256 timeDelta = block.timestamp - lastObs.timestamp;
            cumulativeIndex = lastObs.cumulativeIndex + (indexPrice * timeDelta);
            cumulativeMark = lastObs.cumulativeMark + (markPrice * timeDelta);
        }

        PriceObservation memory newObs = PriceObservation({
            timestamp: block.timestamp,
            indexPrice: indexPrice,
            markPrice: markPrice,
            cumulativeIndex: cumulativeIndex,
            cumulativeMark: cumulativeMark
        });

        // Circular buffer - overwrite old observations
        if (observations.length < MAX_OBSERVATIONS) {
            observations.push(newObs);
        } else {
            observations[state.observationIndex] = newObs;
        }

        state.observationIndex = (state.observationIndex + 1) % MAX_OBSERVATIONS;

        emit PriceObserved(marketId, indexPrice, markPrice, block.timestamp);
    }

    // ============ Funding Calculation Functions ============

    /**
     * @notice Calculate the current funding rate for a market
     * @param marketId Market identifier
     * @param currentIndexPrice Current index price (spot)
     * @param currentMarkPrice Current mark price (perp)
     * @return fundingRate The calculated funding rate
     */
    function calculateFundingRate(
        uint256 marketId,
        uint256 currentIndexPrice,
        uint256 currentMarkPrice
    ) external view returns (int256 fundingRate) {
        FundingConfig memory config = _getConfig(marketId);

        int256 premium;
        if (config.useTimeWeightedAverage) {
            // Use TWAP for premium calculation
            (uint256 twapIndex, uint256 twapMark) = getTWAP(marketId, config.twapWindow);
            if (twapIndex > 0) {
                premium = _calculatePremium(twapIndex, twapMark);
            } else {
                // Fallback to spot prices if TWAP unavailable
                premium = _calculatePremium(currentIndexPrice, currentMarkPrice);
            }
        } else {
            // Use spot prices
            premium = _calculatePremium(currentIndexPrice, currentMarkPrice);
        }

        // Add interest rate component
        int256 interestComponent = config.interestRate;

        // Calculate raw funding rate
        fundingRate = premium + interestComponent;

        // Apply damping if needed
        FundingState memory state = fundingStates[marketId];
        if (config.dampingFactor > 0 && state.previousRate != 0) {
            int256 rateChange = fundingRate - state.previousRate;
            int256 dampedChange = (rateChange * int256(config.dampingFactor)) / int256(RATE_PRECISION);
            fundingRate = state.previousRate + dampedChange;
        }

        // Cap at maximum rate
        int256 maxRate = int256(config.maxFundingRate);
        if (fundingRate > maxRate) {
            fundingRate = maxRate;
        } else if (fundingRate < -maxRate) {
            fundingRate = -maxRate;
        }

        return fundingRate;
    }

    /**
     * @notice Settle funding for a market
     * @param marketId Market identifier
     * @param indexPrice Current index price
     * @param markPrice Current mark price
     * @return fundingRate The settled funding rate
     */
    function settleFunding(
        uint256 marketId,
        uint256 indexPrice,
        uint256 markPrice
    ) external onlyAuthorizedMarket returns (int256 fundingRate) {
        FundingState storage state = fundingStates[marketId];
        FundingConfig memory config = _getConfig(marketId);

        require(block.timestamp >= state.nextSettlementTime, "Settlement not due");

        // Calculate funding rate
        fundingRate = this.calculateFundingRate(marketId, indexPrice, markPrice);

        // Update state
        state.previousRate = state.currentRate;
        state.currentRate = fundingRate;
        state.cumulativeFunding += fundingRate;
        state.lastSettlementTime = block.timestamp;
        state.nextSettlementTime = block.timestamp + config.fundingInterval;

        emit FundingSettled(
            marketId,
            fundingRate,
            state.cumulativeFunding,
            block.timestamp
        );

        emit FundingRateCalculated(
            marketId,
            fundingRate,
            _calculatePremium(indexPrice, markPrice),
            config.interestRate,
            block.timestamp
        );

        return fundingRate;
    }

    /**
     * @notice Calculate funding payment for a position
     * @param marketId Market identifier
     * @param positionSize Size of the position
     * @param isLong Whether the position is long
     * @param lastFundingIndex Last cumulative funding index for the position
     * @return payment The funding payment (positive = receive, negative = pay)
     */
    function calculateFundingPayment(
        uint256 marketId,
        uint256 positionSize,
        bool isLong,
        int256 lastFundingIndex
    ) external view returns (int256 payment) {
        FundingState memory state = fundingStates[marketId];

        // Calculate funding delta since position was opened/last updated
        int256 fundingDelta = state.cumulativeFunding - lastFundingIndex;

        // Calculate payment based on position size
        payment = (fundingDelta * int256(positionSize)) / int256(RATE_PRECISION);

        // Long positions pay positive funding, receive negative funding
        // Short positions receive positive funding, pay negative funding
        if (isLong) {
            payment = -payment;
        }

        return payment;
    }

    // ============ View Functions ============

    /**
     * @notice Get TWAP prices for a market
     * @param marketId Market identifier
     * @param window Time window for TWAP calculation
     * @return twapIndex Time-weighted average index price
     * @return twapMark Time-weighted average mark price
     */
    function getTWAP(
        uint256 marketId,
        uint256 window
    ) public view returns (uint256 twapIndex, uint256 twapMark) {
        PriceObservation[] storage observations = priceObservations[marketId];

        if (observations.length == 0) {
            return (0, 0);
        }

        uint256 targetTime = block.timestamp - window;
        uint256 startIndex = 0;
        uint256 endIndex = observations.length - 1;

        // Find the observation at or before the target time
        for (uint256 i = observations.length; i > 0; i--) {
            if (observations[i - 1].timestamp <= targetTime) {
                startIndex = i - 1;
                break;
            }
        }

        PriceObservation memory startObs = observations[startIndex];
        PriceObservation memory endObs = observations[endIndex];

        uint256 timeDelta = endObs.timestamp - startObs.timestamp;
        if (timeDelta == 0) {
            return (endObs.indexPrice, endObs.markPrice);
        }

        uint256 cumulativeIndexDelta = endObs.cumulativeIndex - startObs.cumulativeIndex;
        uint256 cumulativeMarkDelta = endObs.cumulativeMark - startObs.cumulativeMark;

        twapIndex = cumulativeIndexDelta / timeDelta;
        twapMark = cumulativeMarkDelta / timeDelta;

        return (twapIndex, twapMark);
    }

    /**
     * @notice Get funding state for a market
     * @param marketId Market identifier
     * @return FundingState struct
     */
    function getFundingState(uint256 marketId) external view returns (FundingState memory) {
        return fundingStates[marketId];
    }

    /**
     * @notice Get configuration for a market
     * @param marketId Market identifier
     * @return FundingConfig struct
     */
    function getMarketConfig(uint256 marketId) external view returns (FundingConfig memory) {
        return _getConfig(marketId);
    }

    /**
     * @notice Get current cumulative funding for a market
     * @param marketId Market identifier
     * @return Cumulative funding index
     */
    function getCumulativeFunding(uint256 marketId) external view returns (int256) {
        return fundingStates[marketId].cumulativeFunding;
    }

    /**
     * @notice Get time until next funding settlement
     * @param marketId Market identifier
     * @return Time in seconds until next settlement
     */
    function getTimeUntilFunding(uint256 marketId) external view returns (uint256) {
        FundingState memory state = fundingStates[marketId];
        if (block.timestamp >= state.nextSettlementTime) {
            return 0;
        }
        return state.nextSettlementTime - block.timestamp;
    }

    /**
     * @notice Check if funding settlement is due
     * @param marketId Market identifier
     * @return Whether funding settlement is due
     */
    function isFundingDue(uint256 marketId) external view returns (bool) {
        return block.timestamp >= fundingStates[marketId].nextSettlementTime;
    }

    /**
     * @notice Get number of price observations for a market
     * @param marketId Market identifier
     * @return Number of observations
     */
    function getObservationCount(uint256 marketId) external view returns (uint256) {
        return priceObservations[marketId].length;
    }

    /**
     * @notice Get latest price observation for a market
     * @param marketId Market identifier
     * @return Latest PriceObservation
     */
    function getLatestObservation(uint256 marketId) external view returns (PriceObservation memory) {
        PriceObservation[] storage observations = priceObservations[marketId];
        require(observations.length > 0, "No observations");
        return observations[observations.length - 1];
    }

    // ============ Internal Functions ============

    /**
     * @notice Get configuration for a market (market-specific or default)
     * @param marketId Market identifier
     * @return Configuration to use
     */
    function _getConfig(uint256 marketId) internal view returns (FundingConfig memory) {
        FundingConfig memory marketConfig = marketConfigs[marketId];
        if (marketConfig.fundingInterval == 0) {
            return defaultConfig;
        }
        return marketConfig;
    }

    /**
     * @notice Calculate premium from prices
     * @param indexPrice Index price
     * @param markPrice Mark price
     * @return Premium as a rate
     */
    function _calculatePremium(uint256 indexPrice, uint256 markPrice) internal pure returns (int256) {
        if (indexPrice == 0) return 0;

        // Premium = (markPrice - indexPrice) / indexPrice * RATE_PRECISION
        return ((int256(markPrice) - int256(indexPrice)) * int256(RATE_PRECISION)) / int256(indexPrice);
    }
}
