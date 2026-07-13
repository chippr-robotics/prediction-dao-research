/**
 * Wager tag registry client module (spec 054). Optional, opt-in `%tag` identity layer:
 * normalization/formatting (mirrors on-chain rules) + soft-failing forward/reverse resolution.
 */
export {
  normalizeTag,
  isTagLike,
  isValidTag,
  formatTag,
  TagFormatError,
  TAG_MIN,
  TAG_MAX,
} from './normalizeTag'

export {
  resolveTag,
  lookupTagOf,
  isResolvableForValue,
  statusMessage,
  TagStatus,
} from './resolveTag'
