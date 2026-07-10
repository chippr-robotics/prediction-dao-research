// Chainlink AggregatorV3Interface — minimal read surface for price feeds
// (spec 044 v1.2 FR-022). Full interface:
// https://docs.chain.link/data-feeds/api-reference
export const AGGREGATOR_V3_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
]

export default AGGREGATOR_V3_ABI
