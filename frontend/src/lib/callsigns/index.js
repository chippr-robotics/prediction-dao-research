/**
 * Callsign registry client module (spec 054). Optional, opt-in `%callsign` identity layer:
 * normalization/formatting (mirrors on-chain rules) + soft-failing forward/reverse resolution.
 */
export {
  normalizeCallsign,
  isCallsignLike,
  isValidCallsign,
  formatCallsign,
  CallsignFormatError,
  CALLSIGN_MIN,
  CALLSIGN_MAX,
} from './normalizeCallsign'

export {
  resolveCallsign,
  lookupCallsignOf,
  isResolvableForValue,
  statusMessage,
  CallsignStatus,
} from './resolveCallsign'
