/**
 * Minimal Lido V2 Withdrawal Queue (WithdrawalQueueERC721) ABI for staking
 * (spec 065). Requesting a withdrawal mints an ERC-721 claim ticket; a request
 * is claimable once `isFinalized && !isClaimed`.
 */
export const LIDO_WITHDRAWAL_QUEUE_ABI = [
  'function requestWithdrawals(uint256[] _amounts, address _owner) returns (uint256[] requestIds)',
  'function requestWithdrawalsWstETH(uint256[] _amounts, address _owner) returns (uint256[] requestIds)',
  'function claimWithdrawal(uint256 _requestId)',
  'function claimWithdrawals(uint256[] _requestIds, uint256[] _hints)',
  'function getWithdrawalRequests(address _owner) view returns (uint256[] requestIds)',
  'function getWithdrawalStatus(uint256[] _requestIds) view returns (tuple(uint256 amountOfStETH, uint256 amountOfShares, address owner, uint256 timestamp, bool isFinalized, bool isClaimed)[] statuses)',
  'function getClaimableEther(uint256[] _requestIds, uint256[] _hints) view returns (uint256[] claimableEthValues)',
  'function findCheckpointHints(uint256[] _requestIds, uint256 _firstIndex, uint256 _lastIndex) view returns (uint256[] hintIds)',
  'function getLastCheckpointIndex() view returns (uint256)',
  'function getLastFinalizedRequestId() view returns (uint256)',
  'function approve(address to, uint256 tokenId)',
]

export default LIDO_WITHDRAWAL_QUEUE_ABI
