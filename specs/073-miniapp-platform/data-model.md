# Data Model: Distributed Mini-App Platform (073)

## 1. On-chain: `MiniAppRegistry` (cohort reference chain)

### AppRecord (`mapping(uint256 => AppRecord)`, ids start at 1)

| Field | Type | Notes |
|---|---|---|
| `vendor` | `address` | Immutable after submission; only account allowed to submit updates |
| `name` | `string` | Bounded (`MAX_NAME_LENGTH`); display identity, uniqueness on `nameKey = keccak256(lowercase)` |
| `description` | `string` | Bounded (`MAX_DESCRIPTION_LENGTH`) |
| `category` | `uint8` (`Category` enum) | TradeSettlement, Reconciliation, TreasuryLiquidity, IdentityCompliance, AssetServicing, ReportingAudit |
| `status` | `uint8` (`Status` enum) | Pending, Approved, Suspended, Deprecated |
| `approved` | `PackageRef` | **The only tuple ever served.** Zeroed until first approval |
| `proposed` | `PackageRef` | Set by submit/update; zeroed on promotion or rejection-by-deprecate |
| `submittedAt` / `approvedAt` / `updatedAt` | `uint64` | Block timestamps |

### PackageRef

| Field | Type | Notes |
|---|---|---|
| `cid` | `string` | IPFS directory CID, bounded (`MAX_CID_LENGTH`, CIDv1 base32 ~60 chars — `BackupPointerRegistry` precedent) |
| `manifestHash` | `bytes32` | `keccak256(manifest.json bytes)` |
| `version` | `uint64` | Monotonic per app; bumped by every submitUpdate |

### Auxiliary state

- `appCount: uint256` — id allocator.
- `idByNameKey: mapping(bytes32 => uint256)` — duplicate-name guard.
- `appsByVendor: mapping(address => uint256[])` — vendor's submissions index.
- Gating config (admin-mutable, `ExternalDAORegistry` pattern): `membershipManager`,
  `membershipRole` (`bytes32`), `minTier` (`uint8`), `sanctionsGuard`
  (`address(0)` ⇒ screening disabled).
- Append-only storage block, trailing `__gap` (sized per slots used).

### State transitions

```text
(none) --submitApp(vendor)--------------------> Pending   [proposed = tuple, approved = ∅]
Pending --approveApp(curator)-----------------> Approved  [approved = proposed; proposed = ∅; approvedAt]
Approved --submitUpdate(vendor)---------------> Pending   [proposed = new tuple; approved UNCHANGED — still served]
Pending(w/ approved) --approveApp(curator)----> Approved  [promote proposed]
Approved --suspendApp(curator)----------------> Suspended [approved retained, not served]
Suspended --approveApp(curator)---------------> Approved  [reversible]
any except Deprecated --deprecateApp(curator)-> Deprecated [terminal; proposed = ∅]
```

Invariants:
- I1: `approved.cid` non-empty ⇔ the app has ever been Approved; hosts serve **only** `approved`.
- I2: `submitUpdate` never touches `approved`; `approveApp` is the only promotion path.
- I3: Deprecated is terminal — every mutating call on a Deprecated app reverts.
- I4: metadata edits (name/description/category) by vendor also force `status = Pending`.
- I5: vendor-only for submit/update; curator-only for approve/suspend/deprecate; admin-only for gating config.

## 2. Package: manifest schema (`manifest.json`, hashed on-chain)

```jsonc
{
  "schema": "fairwins-miniapp-manifest/1",
  "id": "token-mint",                  // stable app slug; must match catalog/registry expectations
  "name": "Token Mint",
  "version": "3.1.0",                  // display version (registry uint64 is authoritative ordering)
  "entry": "entry.js",                 // ESM entry, default-exports the mount component
  "styles": ["style.css"],             // optional, injected scoped by the host
  "hostApi": 1,                        // host-context contract version the app was built against
  "sharedDeps": ["react", "react-dom", "react/jsx-runtime", "ethers"],  // resolved from host scope
  "permissions": ["wallet:submit", "store", "audit", "toast", "navigate"],  // declared capability use
  "storeKeys": ["tracked", "drafts"],  // declared shared-state keys (documentation + audit)
  "files": {                           // integrity chain: SHA-256 (hex) of every listed file
    "entry.js":  { "sha256": "…" },
    "style.css": { "sha256": "…" }
  }
}
```

Rules: `keccak256(manifest bytes) == registry approved.manifestHash` gates everything;
every fetched file must be listed in `files` with a matching digest; unknown `schema`
or `hostApi` newer than the host supports ⇒ refuse launch with a clear message.

## 3. Client-side records

### Namespaced app store (host-provided)

- Key: `userStorage` feature key `miniapp_<appId>_v1` (localStorage), per account.
- Shape: `{ version: 1, data: { <storeKey>: any } }`; defensive shape-check resets on
  mismatch; writes never throw into the app (ledgerClientStore conventions).
- Backup: one `syncedObjects.js` entry `miniAppState` (`networkScoped: false` — app data
  is chain-agnostic unless an app namespaces its own keys), merge = per-app shallow union.

### Audit entries (client ledger)

- New `LEDGER_CLASS` value: `miniapp` (append-only enum extension in
  `data/ledger/constants.js`); source `miniAppSource.js` registered in
  `data/ledger/index.js`.
- Kinds (host-emitted, no app cooperation): `miniapp_launched`, `miniapp_tx_submitted`,
  `miniapp_integrity_failed`, `miniapp_state_changed`, `miniapp_app_logged` (app-contextual
  via `audit.log`).
- `entryId`: `clientEntryId('miniapp:<appId>:<kind>:<discriminator>')` — stable/idempotent;
  tx records fold into `oc:` entries by txHash per existing merge rules. Never key
  material, never package bytes.

### Catalog cache (in-memory only)

`{ fetchedAt, apps: AppRecord[] }` — bounded staleness disclosed in UI; the launch path
always re-reads the single record it executes (FR-010). SW package cache
(`fairwins-miniapp-packages-v1`) stores raw gateway responses keyed by CID URL —
immutable, LRU-evicted, and always re-verified by the loader after retrieval.
