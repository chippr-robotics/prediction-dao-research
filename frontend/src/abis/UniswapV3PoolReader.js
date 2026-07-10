// Minimal Uniswap V3 factory + pool read surface for verifiable DEX spot
// prices (spec 044 v1.2 FR-022). The app's swap flow uses QuoterV2; the
// portfolio only needs the pool's current sqrtPriceX96 for a spot valuation.
export const UNISWAP_V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
]

export const UNISWAP_V3_POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function liquidity() view returns (uint128)',
]

export default { UNISWAP_V3_FACTORY_ABI, UNISWAP_V3_POOL_ABI }
