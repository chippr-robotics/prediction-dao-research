# Data Model: Distributed Mini-App Platform (073)

## 1. On-chain: `MiniAppRegistry` (cohort reference chain)

### AppRecord (`mapping(uint256 => AppRecord)`, ids start at 1)

| Field | Type | Notes |
|---|---|---|
| `vendor` | `address` | Immutable after submission; only account allowed to submit updates |
| `name` | `string` | Bounded (`MAX_NAME_LENGTH`); display identity, uniqueness on `nameKey = keccak256(lowercase)` |
| `description` | `string` | Bounded (`MAX_DESCRIPTION_LENGTH`) |
| `category` | `uint8` (`Category` enum) | TradeSettlement, Reconciliation, TreasuryLiquidity, IdentityCompliance, AssetServicing, ReportingAudit |
| `status` | `uint8` (`Status` enum) | Pending, Approved, Suspended, Deprecated — the REVIEW state, not the serving decision (see `isLaunchable`) |
| `approved` | `PackageRef` | **The only tuple ever served.** Zeroed until first approval |
| `proposed` | `PackageRef` | Set by submit/update; zeroed on promotion, rejection, or deprecation |
| `submittedAt` / `approvedAt` / `updatedAt` | `uint64` | Block timestamps |
| `lastVersion` | `uint64` | High-water mark of every version ever issued, including rejected ones (I6). Packs with the timestamps |

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

Every curator action on a package names the `manifestHash` it reviewed (`h`), and reverts
`StaleProposal` if the record no longer holds it — see I2.

```text
(none) --submitApp(vendor)--------------------> Pending   [proposed = tuple, approved = ∅]
Pending --approveApp(curator, h)--------------> Approved  [approved = proposed; proposed = ∅; approvedAt]
Approved --submitUpdate(vendor)---------------> Pending   [proposed = new tuple; approved UNCHANGED — STILL SERVED]
Pending(w/ approved) --approveApp(curator, h)-> Approved  [promote proposed]
any(w/ proposed) --rejectProposal(curator, h)-> Approved if previously approved, else Pending [proposed = ∅]
Approved|Pending --suspendApp(curator)--------> Suspended [approved retained, NOT served]
Suspended --approveApp(curator, h)------------> Approved  [reversible; reject an armed proposal first]
any except Deprecated --deprecateApp(curator)-> Deprecated [terminal; proposed = ∅]
```

**Serving is not the same question as status.** `isLaunchable(id)` (mirrored as `AppView.launchable`)
is the on-chain serving decision: `approved.cid != ""` AND status ∉ {Suspended, Deprecated}. A Pending
record **can** be launchable — that is a live app with an update in review, still serving its last
reviewed package (FR-003). Deriving launchability from `status == Approved` would hand every vendor an
offline switch for their own live app.

Invariants:
- I1: `approved.cid` non-empty ⇔ the app has ever been Approved; hosts serve **only** `approved`.
- I2: `submitUpdate` never touches `approved`, and `approveApp` — the only promotion path — is
  **content-committed**: the curator passes the reviewed `manifestHash` and the call reverts if the
  record has changed. An id-only approval is a time-of-check/time-of-use hole: multisig calldata is
  public for as long as signatures take to collect, so a vendor could swap the tuple (or simply
  front-run) and have unreviewed bytes promoted under a curator's signature. `rejectProposal` carries
  the same guard so a fresh submission cannot be discarded by a stale rejection.
- I3: Deprecated is terminal — every mutating call on a Deprecated app reverts.
- I4: metadata edits (name/description/category) by vendor also force `status = Pending`.
- I5: vendor-only for submit/update; curator-only for approve/reject/suspend/deprecate; admin-only for
  gating config. `APP_CURATOR_ROLE` **administers itself** (`_setRoleAdmin`), so the gate admin cannot
  self-grant curation — without that, the separation would be decorative, since OpenZeppelin defaults
  every role's admin to `DEFAULT_ADMIN_ROLE`. `UPGRADER_ROLE` remains a strict superset by construction.
- I6: versions are monotonic per app and **never reused**, including across rejections — a persisted
  high-water mark (`lastVersion`), not a value derived from the live tuples, so a compliance log cannot
  say "v2 rejected" and later "v2 approved" about different bytes.

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
