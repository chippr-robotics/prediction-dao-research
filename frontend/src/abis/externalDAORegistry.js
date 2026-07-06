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
  // Spec 031 — per-user vote eligibility + execute timing for the activity system. Standard OZ IGovernor
  // views (reads only; no contract change). A Governor that omits one degrades honestly (see daoSource).
  'function hasVoted(uint256 proposalId, address account) view returns (bool)',
  'function getVotes(address account, uint256 timepoint) view returns (uint256)',
  'function proposalEta(uint256 proposalId) view returns (uint256)',
  'function proposalSnapshot(uint256 proposalId) view returns (uint256)',
]

/** Minimal ERC-20/721 metadata read for a Governor's voting token. */
export const VOTING_TOKEN_READ_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
]

/** Minimal ERC-20 balance read (for treasury USDC balances). */
export const ERC20_BALANCE_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

/** Per-proposal reads for the live (subgraph-less) indexer. */
export const GOVERNOR_PROPOSAL_ABI = [
  'function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)',
  'function proposalSnapshot(uint256 proposalId) view returns (uint256)',
  'function proposalDeadline(uint256 proposalId) view returns (uint256)',
  'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)',
]

/** User-signed management actions (US5) — constructed for the user to sign against the DAO's own contract. */
export const GOVERNOR_WRITE_ABI = [
  'function castVote(uint256 proposalId, uint8 support) returns (uint256)',
  'function castVoteWithReason(uint256 proposalId, uint8 support, string reason) returns (uint256)',
  'function queue(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) returns (uint256)',
  'function execute(address[] targets, uint256[] values, bytes[] calldatas, bytes32 descriptionHash) payable returns (uint256)',
  'function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)',
]

/** Vote support values. OZ GovernorCountingSimple AND Compound GovernorBravo both use 0 Against, 1 For, 2 Abstain. */
export const VOTE_SUPPORT = { Against: 0, For: 1, Abstain: 2 }

// --- Spec 042: GovernorBravo / Compound read+write surface (Uniswap and any Bravo-style DAO) ---
// Bravo differs from OZ IGovernor: proposals()/getReceipt() carry the tallies + per-voter receipt, queue/execute
// take only the proposal id, propose carries an extra `signatures` array, and voting power is read from the
// TOKEN's getPriorVotes(). The `ProposalCreated` event has the SAME signature/topic as OZ, so the OZ log parser
// is reused. The token getter is non-standard across forks (comp()/uni()/token()), so the connector probes all.

/** GovernorBravo read surface. */
export const BRAVO_READ_ABI = [
  'function name() view returns (string)',
  'function proposalCount() view returns (uint256)',
  'function quorumVotes() view returns (uint256)',
  'function proposalThreshold() view returns (uint256)',
  'function votingDelay() view returns (uint256)',
  'function votingPeriod() view returns (uint256)',
  'function timelock() view returns (address)',
  'function state(uint256 proposalId) view returns (uint8)',
  'function proposals(uint256 proposalId) view returns (uint256 id, address proposer, uint256 eta, uint256 startBlock, uint256 endBlock, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, bool canceled, bool executed)',
  'function getReceipt(uint256 proposalId, address voter) view returns (bool hasVoted, uint8 support, uint96 votes)',
  'function getActions(uint256 proposalId) view returns (address[] targets, uint256[] values, string[] signatures, bytes[] calldatas)',
  // Non-standard token getters — probed in order; the first that answers wins.
  'function token() view returns (address)',
  'function comp() view returns (address)',
  'function uni() view returns (address)',
]

/** GovernorBravo governance token — voting power at a past block. */
export const BRAVO_TOKEN_ABI = [
  'function getPriorVotes(address account, uint256 blockNumber) view returns (uint96)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
]

/** GovernorBravo user-signed actions (id-based queue/execute; propose carries `signatures`). */
export const BRAVO_WRITE_ABI = [
  'function castVote(uint256 proposalId, uint8 support) returns (uint256)',
  'function castVoteWithReason(uint256 proposalId, uint8 support, string reason)',
  'function queue(uint256 proposalId)',
  'function execute(uint256 proposalId) payable',
  'function propose(address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, string description) returns (uint256)',
]

/** Frameworks ClearPath connects to (matches the on-chain enum order for 0; 1 is a frontend-only mirror). */
export const DAO_FRAMEWORK = { OZGovernor: 0, GovernorBravo: 1 }
export const DAO_FRAMEWORK_LABEL = { 0: 'OpenZeppelin Governor', 1: 'Governor Bravo' }

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
