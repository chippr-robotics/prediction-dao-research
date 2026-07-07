// Spec 043 — Safe (v1.4.1) multisig ABI, hand-maintained (the repo does not auto-generate frontend ABIs; the
// sync script only fills addresses). Only the methods/events the custody feature uses are included. These are
// the canonical Safe v1.4.1 selectors; refresh from the official artifact if the targeted version changes.
//
// On-chain-only flow (no Safe Transaction Service): compute getTransactionHash → each owner approveHash →
// any owner execTransaction with pre-validated signatures once threshold approvals exist.

export const SAFE_ABI = [
  // --- reads ---
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function nonce() view returns (uint256)',
  'function isOwner(address owner) view returns (bool)',
  'function VERSION() view returns (string)',
  'function domainSeparator() view returns (bytes32)',
  'function approvedHashes(address owner, bytes32 hash) view returns (uint256)',
  'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)',
  // --- writes ---
  'function approveHash(bytes32 hashToApprove)',
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool success)',
  // --- governance (each is an ordinary Safe transaction targeting the Safe itself) ---
  'function addOwnerWithThreshold(address owner, uint256 _threshold)',
  'function removeOwner(address prevOwner, address owner, uint256 _threshold)',
  'function swapOwner(address prevOwner, address oldOwner, address newOwner)',
  'function changeThreshold(uint256 _threshold)',
  // --- events ---
  'event ApproveHash(bytes32 indexed approvedHash, address indexed owner)',
  'event ExecutionSuccess(bytes32 indexed txHash, uint256 payment)',
  'event ExecutionFailure(bytes32 indexed txHash, uint256 payment)',
  'event AddedOwner(address indexed owner)',
  'event RemovedOwner(address indexed owner)',
  'event ChangedThreshold(uint256 threshold)',
]

export default SAFE_ABI
