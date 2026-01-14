/**
 * PerpetualFuturesFactory Contract ABI
 *
 * Factory contract for creating and managing perpetual futures markets
 */
export const PERP_FACTORY_ABI = [
  'function marketCount() view returns (uint256)',
  'function creationFee() view returns (uint256)',
  'function getMarket(uint256 marketId) view returns (tuple(uint256 marketId, address marketAddress, string name, string underlyingAsset, address collateralToken, uint8 category, uint256 createdAt, address creator, bool active, uint256 linkedConditionalMarketId))',
  'function getActiveMarkets(uint256 offset, uint256 limit) view returns (uint256[] marketIds, bool hasMore)',
  'function getMarketsByCategory(uint8 category) view returns (uint256[])',
  'function getMarketsByAsset(string asset) view returns (uint256[])',
  'function isMarketActive(uint256 marketId) view returns (bool)',
  'function createMarket(tuple(string name, string underlyingAsset, address collateralToken, uint8 category, uint256 initialIndexPrice, uint256 initialMarkPrice, uint256 linkedConditionalMarketId, tuple(uint256 maxLeverage, uint256 initialMarginRate, uint256 maintenanceMarginRate, uint256 liquidationFeeRate, uint256 tradingFeeRate, uint256 fundingInterval, uint256 maxFundingRate) config) params) payable returns (uint256 marketId, address marketAddress)',
  'event MarketCreated(uint256 indexed marketId, address indexed marketAddress, string name, string underlyingAsset, uint8 category, address collateralToken, address indexed creator, uint256 timestamp)'
]
