/**
 * Perps venue ABI fragments (spec 083). Hand-maintained, ethers v6 human-readable, verified
 * against the deployed venue contracts — see each module's header for what was checked and when.
 *
 * Addresses do NOT live here: they are per-chain configuration in `config/perps.js`
 * (`gainsDiamondFor` / `gmxAddressesFor`). An ABI is a shape; an address is a deployment.
 */
export {
  GAINS_DIAMOND_ABI,
  GAINS_TRADING_ACTIVATED,
  GAINS_TRADE_TYPE,
  GAINS_PENDING_ORDER_TYPE,
  GAINS_CANCEL_REASON,
  GAINS_SCALES,
} from './gainsDiamond'

export {
  GMX_EXCHANGE_ROUTER_ABI,
  GMX_EVENT_EMITTER_ABI,
  GMX_ORDER_TYPE,
  GMX_DECREASE_POSITION_SWAP_TYPE,
  GMX_ORDER_EVENT_NAMES,
  GMX_SCALES,
} from './gmxExchangeRouter'

export { GMX_READER_ABI } from './gmxReader'
export { GMX_DATA_STORE_ABI } from './gmxDataStore'
