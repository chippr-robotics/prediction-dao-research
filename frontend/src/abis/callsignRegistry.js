// Spec 054 — CallsignRegistry (%callsign naming registry) read/write surface.
// Hand-maintained (the repo does not auto-generate frontend ABIs; sync only does addresses). Refresh from
// the compiled artifact after contract changes.

// CallsignStatus: 0 NONE, 1 ACTIVE, 2 REPOINTING, 3 QUARANTINED, 4 SUSPENDED, 5 LAPSED_RECLAIMABLE.
export const CallsignStatus = {
  NONE: 0,
  ACTIVE: 1,
  REPOINTING: 2,
  QUARANTINED: 3,
  SUSPENDED: 4,
  LAPSED_RECLAIMABLE: 5,
}

const CALLSIGN_INFO =
  '(address owner, string callsign, uint8 status, bool verified, address pendingOwner, uint64 repointEffectiveAt, uint64 quarantinedUntil)'

export const CALLSIGN_REGISTRY_ABI = [
  // Resolution (views)
  `function resolve(string callsign) view returns (${CALLSIGN_INFO})`,
  'function callsignOf(address account) view returns (string)',
  `function getCallsignInfoByHash(bytes32 callsignHash) view returns (${CALLSIGN_INFO})`,
  'function isAvailable(string callsign) view returns (bool)',
  'function makeCommitment(string callsign, address owner, bytes32 salt) pure returns (bytes32)',

  // Registration lifecycle (self-submit)
  'function commit(bytes32 commitment)',
  'function register(string callsign, bytes32 salt)',
  'function changeCallsign(string newCallsign, bytes32 salt)',
  'function release()',
  'function requestRepoint(address newOwner)',
  'function cancelRepoint()',
  'function finalizeRepoint(bytes32 callsignHash)',
  'function reclaimLapsed(bytes32 callsignHash)',

  // Gasless twins
  'function commitWithSig(address owner, bytes32 commitment, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function registerWithSig(address owner, string callsign, bytes32 salt, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function changeCallsignWithSig(address owner, string newCallsign, bytes32 salt, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function releaseWithSig(address owner, bytes32 callsignHash, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function requestRepointWithSig(address owner, bytes32 callsignHash, address newOwner, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',
  'function cancelRepointWithSig(address owner, bytes32 callsignHash, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig)',

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
  'function reserved(bytes32 callsignHash) view returns (bool)',
  'function quarantinedUntil(bytes32 callsignHash) view returns (uint64)',
  'function callsignHashOf(address account) view returns (bytes32)',

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
  'function setReserved(bytes32[] callsignHashes, bool isReserved)',
  'function setSuspended(bytes32 callsignHash, bool isSuspended)',
  'function setVerified(bytes32 callsignHash, bool isVerified)',

  // Admin policy (DEFAULT_ADMIN_ROLE)
  'function setPolicyParams(uint64 minCommitmentAge, uint64 maxCommitmentAge, uint64 quarantinePeriod, uint64 changeCooldown, uint64 repointDelay, uint64 lapseGrace)',
  'function setMembershipGate(bytes32 role, uint8 tier)',
  'function setMembershipManager(address manager)',
  'function setSanctionsGuard(address guard)',

  // Events (registration + lifecycle + moderation + policy — the operator metrics scan reads these)
  'event CallsignCommitted(bytes32 indexed commitment, uint64 committedAt)',
  'event CallsignRegistered(bytes32 indexed callsignHash, string callsign, address indexed owner)',
  'event CallsignReleased(bytes32 indexed callsignHash, address indexed owner, uint64 quarantinedUntil)',
  'event CallsignChanged(bytes32 indexed oldCallsignHash, bytes32 indexed newCallsignHash, address indexed owner)',
  'event CallsignRepointRequested(bytes32 indexed callsignHash, address indexed from, address indexed to, uint64 effectiveAt)',
  'event CallsignRepointCancelled(bytes32 indexed callsignHash)',
  'event CallsignRepointFinalized(bytes32 indexed callsignHash, address indexed from, address indexed to)',
  'event CallsignReclaimed(bytes32 indexed callsignHash, address indexed formerOwner)',
  'event CallsignSuspended(bytes32 indexed callsignHash, bool suspended)',
  'event CallsignVerificationSet(bytes32 indexed callsignHash, bool verified)',
  'event CallsignReserved(bytes32 indexed callsignHash, bool reserved)',
  'event PolicyParamsSet(uint64 minCommitmentAge, uint64 maxCommitmentAge, uint64 quarantinePeriod, uint64 changeCooldown, uint64 repointDelay, uint64 lapseGrace)',
  'event MembershipGateSet(bytes32 role, uint8 minTier)',

  // Errors (surfaced to the user; note the Gold-specific message must NOT reuse the Silver wording)
  'error InsufficientMembershipTier()',
  'error CallsignIsReserved()',
  'error CallsignUnavailable()',
  'error AlreadyHasCallsign()',
  'error InvalidCallsignFormat()',
  'error NoCommitment()',
  'error CommitmentTooNew()',
  'error CommitmentExpired()',
  'error CommitmentPending()',
  'error ChangeCooldownActive(uint64 nextAllowedAt)',
  'error SanctionedAccount()',
]
