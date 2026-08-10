// Spec 068 — SafePolicyGuardV2 (ordered policy engine) ABI.
// Human-readable fragments curated from contracts/custody/SafePolicyGuardV2.sol; includes every
// custom error so violation revert data decodes to a typed, rule-numbered message
// (FR-012/SC-003) in frontend/src/lib/custody/policyV2.js.
//
// PolicyGuardSetup is guard-agnostic and unchanged — reuse POLICY_GUARD_SETUP_ABI from
// ./SafePolicyGuard.

/** Rule tuple as encoded on-chain; field order is load-bearing for encode/decode. */
export const RULE_TUPLE =
  '(address asset, uint128 perTxLimit, uint128 windowLimit, uint8 approvalsRequired, bool banded, address[] approvers, address[] targets)'

export const SAFE_POLICY_GUARD_V2_ABI = [
  // guard hooks (present for completeness; the app never calls these directly)
  'function checkTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures, address msgSender)',
  'function checkAfterExecution(bytes32 txHash, bool success)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',

  // configuration (called by the vault itself as a threshold-approved self-transaction).
  // Full replacement, so add/edit/remove/REORDER are all one proposal.
  `function setRules(${RULE_TUPLE}[] rules, uint32 cooldown)`,

  // views
  'function WINDOW() view returns (uint256)',
  'function MAX_COOLDOWN() view returns (uint32)',
  'function MAX_RULES() view returns (uint256)',
  'function MAX_APPROVERS() view returns (uint256)',
  'function MAX_TARGETS() view returns (uint256)',
  'function ANY_ASSET() view returns (address)',
  `function getRules(address safe) view returns (${RULE_TUPLE}[] rules, uint32 cooldown)`,
  'function ruleCount(address safe) view returns (uint256)',
  'function getMeta(address safe) view returns (uint32 cooldown, uint64 lastCountedTxAt, uint32 rulesVersion, bool hasApproverRules)',
  'function getRuleAccounting(address safe, uint256 index) view returns (uint128 spentInWindow, uint64 windowStart, uint256 remaining)',
  'function nextAllowedAt(address safe) view returns (uint64)',
  'function matchTransaction(address safe, address to, uint256 value, bytes data) view returns (bool matched, uint256 ruleIndex)',
  'function previewTransaction(address safe, address to, uint256 value, bytes data, uint8 operation, address executor, bytes32 approvedTxHash) view returns (bool ok, bytes revertData)',

  // events (policy history + notification feed)
  'event RulesSet(address indexed safe, uint256 ruleCount, uint32 cooldown, uint32 rulesVersion)',
  'event RuleConfigured(address indexed safe, uint256 indexed index, address asset, uint128 perTxLimit, uint128 windowLimit, uint8 approvalsRequired, bool banded, address[] approvers, address[] targets)',

  // typed errors (decoded by decodePolicyErrorV2)
  'error DelegatecallBlocked()',
  'error GasRefundBlocked()',
  'error ValueToGuardBlocked()',
  'error NoRuleMatches()',
  'error CooldownActive(uint64 nextAllowedAt)',
  'error RuleApproversMissing(uint256 ruleIndex, uint256 have, uint256 need)',
  'error RulePerTxExceeded(uint256 ruleIndex, address asset, uint256 amount, uint256 limit)',
  'error RuleWindowExceeded(uint256 ruleIndex, address asset, uint256 attempted, uint256 remaining)',
  'error TooManyRules()',
  'error TooManyApprovers()',
  'error TooManyTargets()',
  'error CooldownTooLong()',
  'error BadApprovalsRequired()',
  'error BandedNeedsLimit()',
  'error DuplicateApprover()',
  'error DuplicateTarget()',
]

export default SAFE_POLICY_GUARD_V2_ABI
