# Contract Surface: `IMiniAppRegistry`

Solidity interface (`contracts/interfaces/IMiniAppRegistry.sol`) holding the enum,
structs, events, and errors; implemented by `contracts/apps/MiniAppRegistry.sol`
(`is IMiniAppRegistry, UUPSManaged`). Fund-free; EthTrust-SL2 target. Data shapes and
invariants: [data-model.md](../data-model.md).

## Types

```solidity
enum Status { Pending, Approved, Suspended, Deprecated }
enum Category { TradeSettlement, Reconciliation, TreasuryLiquidity, IdentityCompliance, AssetServicing, ReportingAudit }

struct PackageRef { string cid; bytes32 manifestHash; uint64 version; }

struct AppView {
    uint256 id; address vendor; string name; string description;
    Category category; Status status;
    PackageRef approved;   // only tuple hosts may serve
    PackageRef proposed;   // pending re-approval, may be empty
    uint64 submittedAt; uint64 approvedAt; uint64 updatedAt;
}
```

## Roles

- `APP_CURATOR_ROLE` — approve/suspend/deprecate (compliance multisig; granted post-deploy).
- `DEFAULT_ADMIN_ROLE` — gating config (`setMembershipGate`, `setSanctionsGuard`), bounded-param edits.
- `UPGRADER_ROLE` — UUPS upgrades (inherited from `UUPSManaged`).

## Functions

```solidity
// Vendor actions (membership-gated when configured; sanctions-screened when guard set)
function submitApp(string name, string description, Category category,
                   string cid, bytes32 manifestHash) external returns (uint256 id);
function submitUpdate(uint256 id, string cid, bytes32 manifestHash) external;      // vendor only; status -> Pending; approved untouched
function updateMetadata(uint256 id, string name, string description, Category category) external; // vendor only; status -> Pending

// Curator lifecycle
function approveApp(uint256 id) external;    // promotes proposed -> approved (or re-activates a Suspended app with no proposed change)
function suspendApp(uint256 id) external;    // Approved -> Suspended (reversible)
function deprecateApp(uint256 id) external;  // terminal; clears proposed

// Admin config
function setMembershipGate(address manager, bytes32 role, uint8 minTier) external;
function setSanctionsGuard(address guard) external;                                 // address(0) = disabled

// Views (indexer-free catalog reads)
function appCount() external view returns (uint256);
function getApp(uint256 id) external view returns (AppView memory);
function getAppsPaged(uint256 offset, uint256 limit) external view returns (AppView[] memory);
function appIdsByVendor(address vendor) external view returns (uint256[] memory);
function idByName(string calldata name) external view returns (uint256);            // 0 = unused
```

## Events

```solidity
event AppSubmitted(uint256 indexed id, address indexed vendor, string name, Category category, string cid, bytes32 manifestHash, uint64 version);
event AppUpdateSubmitted(uint256 indexed id, address indexed vendor, string cid, bytes32 manifestHash, uint64 version);
event AppMetadataUpdated(uint256 indexed id, string name, Category category);
event AppApproved(uint256 indexed id, address indexed curator, string cid, bytes32 manifestHash, uint64 version);
event AppSuspended(uint256 indexed id, address indexed curator);
event AppDeprecated(uint256 indexed id, address indexed curator);
event MembershipGateChanged(address manager, bytes32 role, uint8 minTier);
event SanctionsGuardChanged(address guard);
```

## Errors

```solidity
error AppNotFound();            error NotVendor();
error InvalidStatus();          error AppDeprecatedError();
error DuplicateName();          error EmptyCid();
error StringTooLong();          error NothingProposed();
error InsufficientMembershipTier();  error SanctionedAccount();
```

## Deployment / ops registration

- Deploy: `scripts/deploy/deploy-miniapp-registry.js` (callsign-pattern: prerequisite
  reads, abort-if-exists, `deployProxy`, self-grant `APP_CURATOR_ROLE` to deployer for
  seeding, then transfer to the compliance multisig; append `miniAppRegistry` +
  `miniAppRegistryImpl` + deploy block, `saveDeployment`).
- `check:storage-layout`: append `{ name: "MiniAppRegistry", deploymentsKey: "miniAppRegistry" }`.
- Frontend sync: `sync-frontend-contracts.js` mapping + tenant `keys` entry;
  `frontend/src/abis/miniAppRegistry.js` (hand-maintained) → generated `.json`;
  `DEPLOYMENT_BLOCKS_BY_CHAIN` entry.
- Chain residency: resolve via `getContractAddressForChain('miniAppRegistry', miniAppChainId())`.
