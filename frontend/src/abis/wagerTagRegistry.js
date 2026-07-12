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

  // Config + policy views (operator screen)
  'function membershipRole() view returns (bytes32)',
  'function minTier() view returns (uint8)',
  'function membershipManager() view returns (address)',
  'function sanctionsGuard() view returns (address)',
  'function minCommitmentAge() view returns (uint64)',
  'function maxCommitmentAge() view returns (uint64)',
  'function quarantinePeriod() view returns (uint64)',
  'function changeCooldown() view returns (uint64)',
  'function repointDelay() view returns (uint64)',
  'function lapseGrace() view returns (uint64)',
  'function reserved(bytes32 tagHash) view returns (bool)',
  'function quarantinedUntil(bytes32 tagHash) view returns (uint64)',
  'function tagHashOf(address account) view returns (bytes32)',

  // Roles (AccessControl) — operator gating + role admin
  'function REGISTRY_CURATOR_ROLE() view returns (bytes32)',
  'function MODERATOR_ROLE() view returns (bytes32)',
  'function VERIFIER_ROLE() view returns (bytes32)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function getRoleAdmin(bytes32 role) view returns (bytes32)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',

  // Moderation / curation / verification (role-gated writes)
  'function setReserved(bytes32[] tagHashes, bool isReserved)',
  'function setSuspended(bytes32 tagHash, bool isSuspended)',
  'function setVerified(bytes32 tagHash, bool isVerified)',

  // Admin policy (DEFAULT_ADMIN_ROLE)
  'function setPolicyParams(uint64 minCommitmentAge, uint64 maxCommitmentAge, uint64 quarantinePeriod, uint64 changeCooldown, uint64 repointDelay, uint64 lapseGrace)',
  'function setMembershipGate(bytes32 role, uint8 tier)',
  'function setMembershipManager(address manager)',
  'function setSanctionsGuard(address guard)',

  // Events (registration + lifecycle + moderation + policy — the operator metrics scan reads these)
  'event TagCommitted(bytes32 indexed commitment, uint64 committedAt)',
  'event TagRegistered(bytes32 indexed tagHash, string tag, address indexed owner)',
  'event TagReleased(bytes32 indexed tagHash, address indexed owner, uint64 quarantinedUntil)',
  'event TagChanged(bytes32 indexed oldTagHash, bytes32 indexed newTagHash, address indexed owner)',
  'event TagRepointRequested(bytes32 indexed tagHash, address indexed from, address indexed to, uint64 effectiveAt)',
  'event TagRepointCancelled(bytes32 indexed tagHash)',
  'event TagRepointFinalized(bytes32 indexed tagHash, address indexed from, address indexed to)',
  'event TagReclaimed(bytes32 indexed tagHash, address indexed formerOwner)',
  'event TagSuspended(bytes32 indexed tagHash, bool suspended)',
  'event TagVerificationSet(bytes32 indexed tagHash, bool verified)',
  'event TagReserved(bytes32 indexed tagHash, bool reserved)',
  'event PolicyParamsSet(uint64 minCommitmentAge, uint64 maxCommitmentAge, uint64 quarantinePeriod, uint64 changeCooldown, uint64 repointDelay, uint64 lapseGrace)',
  'event MembershipGateSet(bytes32 role, uint8 minTier)',

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
