// Spec 043 — SafeProposalHub ABI, hand-maintained. Events-only broadcaster of Safe transaction preimages for
// serverless co-owner discovery. Holds no funds and no authority; integrity is enforced by clients recomputing
// the Safe transaction hash from the emitted params before approving. Refresh from the compiled artifact after
// contract changes. Address is filled per-network by `npm run sync:frontend-contracts` (key: safeProposalHub).

export const SAFE_PROPOSAL_HUB_ABI = [
  'function propose(address safe, address to, uint256 value, bytes data, uint8 operation, uint256 nonce, bytes32 safeTxHash)',
  'function cancel(address safe, bytes32 safeTxHash)',
  'event Proposed(address indexed safe, address indexed proposer, bytes32 indexed safeTxHash, address to, uint256 value, bytes data, uint8 operation, uint256 nonce)',
  'event Cancelled(address indexed safe, address indexed proposer, bytes32 indexed safeTxHash)',
]

export default SAFE_PROPOSAL_HUB_ABI
