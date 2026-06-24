// Spec 030 — ClearPath external-DAO registry + the standard IGovernor read surface.
// Hand-maintained (the repo does not auto-generate frontend ABIs; sync only does addresses). Refresh from the
// compiled artifact after contract changes.

/** ExternalDAORegistry (UUPS) — register/track DAOs deployed by other platforms (Olympia + any OZ Governor). */
export const EXTERNAL_DAO_REGISTRY_ABI = [
  'function registerExternalDAO(address dao, uint8 framework, string label) returns (uint256 id)',
  'function getExternalDAO(uint256 id) view returns (address dao, uint8 framework, string label, address registrant, uint64 registeredAt)',
  'function externalCount() view returns (uint256)',
  'function isRegistered(address dao) view returns (bool)',
  'function getExternalDAOsByRegistrant(address who) view returns (uint256[])',
  'function DAO_MEMBER_ROLE() view returns (bytes32)',
]

/** Standard OZ IGovernor read surface — works for native ClearPath DAOs and external Governor DAOs alike. */
export const GOVERNOR_READ_ABI = [
  'function name() view returns (string)',
  'function token() view returns (address)',
  'function timelock() view returns (address)',
  'function votingDelay() view returns (uint256)',
  'function votingPeriod() view returns (uint256)',
  'function proposalThreshold() view returns (uint256)',
  'function COUNTING_MODE() view returns (string)',
  'function CLOCK_MODE() view returns (string)',
  'function clock() view returns (uint48)',
  'function quorum(uint256 timepoint) view returns (uint256)',
  'function state(uint256 proposalId) view returns (uint8)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
]

/** Minimal ERC-20/721 metadata read for a Governor's voting token. */
export const VOTING_TOKEN_READ_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
]

/** Frameworks the registry recognizes (matches the on-chain enum order). */
export const DAO_FRAMEWORK = { OZGovernor: 0 }
export const DAO_FRAMEWORK_LABEL = { 0: 'OpenZeppelin Governor' }

/** OZ IGovernor.ProposalState enum (for rendering proposal status when available). */
export const PROPOSAL_STATE_LABEL = {
  0: 'Pending',
  1: 'Active',
  2: 'Canceled',
  3: 'Defeated',
  4: 'Succeeded',
  5: 'Queued',
  6: 'Expired',
  7: 'Executed',
}
