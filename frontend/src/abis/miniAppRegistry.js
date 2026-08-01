// Spec 073 — MiniAppRegistry (mini-app catalog + curation authority) read/write surface.
// Hand-maintained (the repo does not auto-generate frontend ABIs; sync only does addresses). Refresh from
// the compiled artifact after contract changes.

// AppStatus is the REVIEW state, NOT the answer to "may a host run this?" — read `launchable` (or call
// isLaunchable) for that. A Pending record is launchable when it has been approved before: that is a live
// app with an update in review, still serving its last reviewed package (FR-003). Gating launches on
// `status === APPROVED` would hand every vendor an offline switch for their own live app.
// Suspended and Deprecated records stay readable so the host can explain a refusal instead of showing a
// member a blank surface.
export const AppStatus = {
  PENDING: 0,
  APPROVED: 1,
  SUSPENDED: 2,
  DEPRECATED: 3,
}

// Operational categories (spec FR-008). Order is the on-chain enum order — never reorder, only append.
export const AppCategory = {
  TRADE_SETTLEMENT: 0,
  RECONCILIATION: 1,
  TREASURY_LIQUIDITY: 2,
  IDENTITY_COMPLIANCE: 3,
  ASSET_SERVICING: 4,
  REPORTING_AUDIT: 5,
}

// Display labels for the catalog filters, keyed by the enum ordinal above.
export const APP_CATEGORY_LABELS = {
  [AppCategory.TRADE_SETTLEMENT]: 'Trade Settlement',
  [AppCategory.RECONCILIATION]: 'Reconciliation',
  [AppCategory.TREASURY_LIQUIDITY]: 'Treasury & Liquidity',
  [AppCategory.IDENTITY_COMPLIANCE]: 'Identity & Compliance',
  [AppCategory.ASSET_SERVICING]: 'Asset Servicing',
  [AppCategory.REPORTING_AUDIT]: 'Reporting & Audit',
}

// The curator role id (keccak256("APP_CURATOR_ROLE")) — the platform's supply-chain trust boundary.
// Read authority from the registry itself (hasRole) rather than from app-wide admin flags.
export const APP_CURATOR_ROLE = '0xc242262718134333007a37a2e61483e7143f44e0144fb041a7006aa0eb456392'

export const MINI_APP_REGISTRY_ABI = [
  // ---- Catalog reads (indexer-free; the launch path always re-reads the single record it runs) ----
  'function appCount() view returns (uint256)',
  'function getApp(uint256 id) view returns ((uint256 id, address vendor, string name, string description, uint8 category, uint8 status, bool launchable, (string cid, bytes32 manifestHash, uint64 version) approved, (string cid, bytes32 manifestHash, uint64 version) proposed, uint64 submittedAt, uint64 approvedAt, uint64 updatedAt))',
  'function getAppsPaged(uint256 offset, uint256 limit) view returns ((uint256 id, address vendor, string name, string description, uint8 category, uint8 status, bool launchable, (string cid, bytes32 manifestHash, uint64 version) approved, (string cid, bytes32 manifestHash, uint64 version) proposed, uint64 submittedAt, uint64 approvedAt, uint64 updatedAt)[] apps)',
  'function appIdsByVendor(address vendor) view returns (uint256[])',
  'function idByName(string name) view returns (uint256)',
  // THE serving decision, on-chain. A Pending record CAN be launchable: a live app with an update in
  // review keeps serving its last reviewed package (FR-003). Never derive this from status alone.
  'function isLaunchable(uint256 id) view returns (bool)',

  // ---- Vendor submissions ----
  'function submitApp(string name, string description, uint8 category, string cid, bytes32 manifestHash) returns (uint256 id)',
  'function submitUpdate(uint256 id, string cid, bytes32 manifestHash)',
  'function updateMetadata(uint256 id, string name, string description, uint8 category)',

  // ---- Curator lifecycle (APP_CURATOR_ROLE) ----
  // Content-committed: the curator names the manifestHash they REVIEWED, so a vendor cannot swap the
  // package under an in-flight approval. Always pass the hash the reviewer actually saw.
  'function approveApp(uint256 id, bytes32 expectedManifestHash)',
  'function rejectProposal(uint256 id, bytes32 expectedManifestHash)',
  'function suspendApp(uint256 id)',
  'function deprecateApp(uint256 id)',

  // ---- Gate config + authority reads ----
  'function setMembershipGate(address manager, bytes32 role, uint8 minTier_)',
  'function setSanctionsGuard(address guard)',
  'function membershipManager() view returns (address)',
  'function membershipRole() view returns (bytes32)',
  'function minTier() view returns (uint8)',
  'function sanctionsGuard() view returns (address)',
  'function APP_CURATOR_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',

  // ---- Bounds (clients pre-validate against the same limits the chain enforces) ----
  'function MAX_NAME_LENGTH() view returns (uint256)',
  'function MAX_DESCRIPTION_LENGTH() view returns (uint256)',
  'function MAX_CID_LENGTH() view returns (uint256)',
  'function MAX_PAGE_LIMIT() view returns (uint256)',

  // ---- Events ----
  'event AppSubmitted(uint256 indexed id, address indexed vendor, string name, uint8 category, string cid, bytes32 manifestHash, uint64 version)',
  'event AppUpdateSubmitted(uint256 indexed id, address indexed vendor, string cid, bytes32 manifestHash, uint64 version)',
  'event AppMetadataUpdated(uint256 indexed id, string name, string description, uint8 category)',
  'event AppApproved(uint256 indexed id, address indexed curator, string cid, bytes32 manifestHash, uint64 version)',
  'event AppProposalRejected(uint256 indexed id, address indexed curator, string cid, bytes32 manifestHash, uint64 version)',
  'event AppSuspended(uint256 indexed id, address indexed curator)',
  'event AppDeprecated(uint256 indexed id, address indexed curator)',
  'event MembershipGateChanged(address manager, bytes32 role, uint8 minTier)',
  'event SanctionsGuardChanged(address guard)',

  // ---- Errors (surfaced verbatim so a refusal explains itself) ----
  'error AppNotFound()',
  'error NotVendor()',
  'error InvalidStatus()',
  'error AppDeprecatedError()',
  'error DuplicateName()',
  'error EmptyCid()',
  'error EmptyName()',
  'error InvalidName()',
  'error StaleProposal(bytes32 expected, bytes32 actual)',
  'error EmptyManifestHash()',
  'error StringTooLong()',
  'error NothingProposed()',
  'error InsufficientMembershipTier()',
  'error SanctionedAccount()',
  'error InvalidGateConfig()',
  'error ZeroAddress()',
  'error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)',
]
