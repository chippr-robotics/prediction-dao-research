// Spec 054 — WagerTagRegistry (%tag naming registry) read/write surface.
// Hand-maintained (the repo does not auto-generate frontend ABIs; sync only does addresses). Refresh from
// the compiled artifact after contract changes.

// TagStatus: 0 NONE, 1 ACTIVE, 2 REPOINTING, 3 QUARANTINED, 4 SUSPENDED, 5 LAPSED_RECLAIMABLE.
export const TagStatus = {
  NONE: 0,
  ACTIVE: 1,
  REPOINTING: 2,
  QUARANTINED: 3,
  SUSPENDED: 4,
  LAPSED_RECLAIMABLE: 5,
}

const TAG_INFO =
  '(address owner, string tag, uint8 status, bool verified, address pendingOwner, uint64 repointEffectiveAt, uint64 quarantinedUntil)'

export const WAGER_TAG_REGISTRY_ABI = [
  // Resolution (views)
  `function resolve(string tag) view returns (${TAG_INFO})`,
  'function tagOf(address account) view returns (string)',
  `function getTagInfoByHash(bytes32 tagHash) view returns (${TAG_INFO})`,
  'function isAvailable(string tag) view returns (bool)',
  'function makeCommitment(string tag, address owner, bytes32 salt) pure returns (bytes32)',

  // Registration lifecycle (self-submit)
  'function commit(bytes32 commitment)',
  'function register(string tag, bytes32 salt)',
  'function changeTag(string newTag, bytes32 salt)',
  'function release()',
  'function requestRepoint(address newOwner)',
  'function cancelRepoint()',
  'function finalizeRepoint(bytes32 tagHash)',
  'function reclaimLapsed(bytes32 tagHash)',

  // Gasless twins
  'function commitWithSig(address owner, bytes32 commitment, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function registerWithSig(address owner, string tag, bytes32 salt, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function changeTagWithSig(address owner, string newTag, bytes32 salt, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function releaseWithSig(address owner, bytes32 tagHash, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function requestRepointWithSig(address owner, bytes32 tagHash, address newOwner, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function cancelRepointWithSig(address owner, bytes32 tagHash, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',

  // Config views
  'function membershipRole() view returns (bytes32)',
  'function minTier() view returns (uint8)',

  // Events
  'event TagRegistered(bytes32 indexed tagHash, string tag, address indexed owner)',
  'event TagReleased(bytes32 indexed tagHash, address indexed owner, uint64 quarantinedUntil)',
  'event TagChanged(bytes32 indexed oldTagHash, bytes32 indexed newTagHash, address indexed owner)',
  'event TagRepointRequested(bytes32 indexed tagHash, address indexed from, address indexed to, uint64 effectiveAt)',
  'event TagRepointFinalized(bytes32 indexed tagHash, address indexed from, address indexed to)',

  // Errors (surfaced to the user; note the Gold-specific message must NOT reuse the Silver wording)
  'error InsufficientMembershipTier()',
  'error TagIsReserved()',
  'error TagUnavailable()',
  'error AlreadyHasTag()',
  'error InvalidTagFormat()',
  'error NoCommitment()',
  'error CommitmentTooNew()',
  'error CommitmentExpired()',
  'error CommitmentPending()',
  'error ChangeCooldownActive(uint64 nextAllowedAt)',
  'error SanctionedAccount()',
]
