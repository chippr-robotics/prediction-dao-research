/**
 * PerpetualFuturesMarket Contract ABI
 *
 * Individual perpetual futures market for leveraged trading
 */
export const PERPETUAL_MARKET_ABI = [
  // View functions
  'function marketId() view returns (uint256)',
  'function marketName() view returns (string)',
  'function underlyingAsset() view returns (string)',
  'function indexPrice() view returns (uint256)',
  'function markPrice() view returns (uint256)',
  'function status() view returns (uint8)',
  'function paused() view returns (bool)',
  'function positionCount() view returns (uint256)',
  'function insuranceFund() view returns (uint256)',
  'function getPosition(uint256 positionId) view returns (tuple(address trader, uint8 side, uint256 size, uint256 collateral, uint256 entryPrice, uint256 leverage, int256 unrealizedPnL, int256 accumulatedFunding, uint256 lastFundingTime, uint256 openedAt, bool isOpen))',
  'function getTraderPositions(address trader) view returns (uint256[])',
  'function getUnrealizedPnL(uint256 positionId) view returns (int256)',
  'function isLiquidatable(uint256 positionId) view returns (bool)',
  'function getLiquidationPrice(uint256 positionId) view returns (uint256)',
  'function getCurrentFundingRate() view returns (int256)',
  'function getMetrics() view returns (tuple(uint256 totalLongPositions, uint256 totalShortPositions, uint256 totalLongSize, uint256 totalShortSize, uint256 openInterest, int256 netFunding, uint256 totalVolume, uint256 lastFundingTime, int256 currentFundingRate))',
  'function getConfig() view returns (tuple(uint256 maxLeverage, uint256 initialMarginRate, uint256 maintenanceMarginRate, uint256 liquidationFeeRate, uint256 tradingFeeRate, uint256 fundingInterval, uint256 maxFundingRate))',

  // Write functions
  'function openPosition(uint8 side, uint256 size, uint256 collateralAmount, uint256 leverage) returns (uint256)',
  'function closePosition(uint256 positionId)',
  'function addCollateral(uint256 positionId, uint256 amount)',
  'function removeCollateral(uint256 positionId, uint256 amount)',
  'function liquidatePosition(uint256 positionId)',

  // Events
  'event PositionOpened(uint256 indexed positionId, address indexed trader, uint8 side, uint256 size, uint256 collateral, uint256 leverage, uint256 entryPrice, uint256 timestamp)',
  'event PositionClosed(uint256 indexed positionId, address indexed trader, uint256 exitPrice, int256 realizedPnL, uint256 fee, uint256 timestamp)',
  'event PositionLiquidated(uint256 indexed positionId, address indexed trader, address indexed liquidator, uint256 liquidationPrice, uint256 liquidationFee, uint256 timestamp)'
]
