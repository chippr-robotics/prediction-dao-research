# Research: Distributed Mini-App Platform (073)

**Date**: 2026-08-01 · **Input**: `spec.md` + codebase exploration (frontend seams, contract patterns)

Each decision below resolves a Technical Context unknown. Format: Decision / Rationale / Alternatives considered.

## R1. Remote module loading: fetch → verify → Blob-URL `import()`

**Decision**: Mini-app packages are plain ESM bundles. The host loader fetches the entry
bundle bytes itself (ordinary `fetch` from the gateway), verifies integrity (see R3)
**before any code exists in the module graph**, then creates an `Object URL` from a
`Blob` of the verified bytes and `import()`s it. Nothing is ever imported directly from
a gateway URL.

**Rationale**:
- Integrity-before-execution is the spec's hard rule (FR-011). A direct
  `import('https://gateway/...')` executes whatever the gateway serves; fetch-first is
  the only pattern where the hash check structurally precedes execution.
- CSP impact is minimal and auditable: `script-src` gains only `blob:` (both nginx
  configs + a gating test, mirroring `nginxCspConnectSrc.test.js`). Blob URLs can only
  be minted by our loader after verification, so `blob:` does not admit third-party
  origins. Importing remote URLs instead would force `https:` into `script-src` —
  explicitly forbidden territory (spec 069 confined the scheme-wide grant to
  `connect-src`).
- Gateway origins for the fetch ride the existing `connect-src` allowlist
  (`https://ipfs.fairwins.app` is already whitelisted).

**Alternatives considered**:
- **Webpack Module Federation** (named in the design notes): host is Vite, not webpack;
  `@originjs/vite-plugin-federation` / `@module-federation/vite` load remote scripts
  directly (no pre-execution hash check possible) and would require loosening
  `script-src` to the gateway origin. Rejected — wrong stack and weaker integrity story.
  The *goal* behind the note (shared-dep dedup) is met by R2.
- **Iframe + postMessage**: explicit spec non-goal for v1.
- **SystemJS**: extra runtime dependency, same integrity work still needed, no benefit
  over native ESM + Blob.

## R2. Shared dependency dedup: host module scope, not import maps

**Decision**: The host exposes its own singleton copies of shared libraries (React,
ReactDOM, `react/jsx-runtime`, ethers) plus the mini-app SDK on a frozen global scope:
`globalThis[Symbol.for('fairwins.miniapp.host')]`. Mini-apps are built with a shared
build preset (`tools/miniapp-build/`) that externalizes those bare imports and rewrites
them to host-scope reads. A mini-app bundle therefore contains **no copy of React** and
executes against the host's instances (required anyway — two React copies cannot share
one tree).

**Rationale**: Deterministic, framework-agnostic, no CSP or timing constraints, and
testable in Vitest (populate the scope, import a built fixture). Version compatibility is
declared in the manifest (`hostApi` version) and checked at load.

**Alternatives considered**:
- **Import maps**: must be installed before the first module resolution; Vite controls
  the initial graph, multiple/late import maps have uneven browser support, and mapping
  bare specifiers to hashed host chunk filenames is fragile across builds. Rejected.
- **Module federation shared scope**: see R1.
- **Bundling React into each app**: breaks context/hooks across the boundary and bloats
  payloads. Rejected.

## R3. Integrity chain: on-chain keccak256(manifest) → per-file SHA-256

**Decision**: A package is an IPFS directory: `manifest.json` + `entry.js` (+ optional
`style.css`, assets). On-chain, the registry stores the directory **CID (bounded
string)** and `manifestHash = keccak256(manifest.json bytes)`. The manifest carries
`sha256` digests (hex) and paths for every executable/style file plus the entry point.
Launch verification: fetch `manifest.json` → `keccak256(bytes) == registry.manifestHash`
→ fetch entry (and css) → `sha256(bytes) == manifest.files[path].sha256` → only then
Blob-import. The gateway is therefore **untrusted**; CID format validation
(`isValidCid`) remains a cheap pre-check but is not the integrity boundary.

**Rationale**: keccak256 is free to verify on-chain-side and native to Solidity tooling;
per-file SHA-256 via `@noble/hashes` (already a dependency) covers every executed byte.
Full CID re-computation (UnixFS DAG) would add `multiformats`/`ipfs-unixfs` complexity
for no additional guarantee beyond the manifest-hash chain.

## R4. Registry contract: `MiniAppRegistry is IMiniAppRegistry, UUPSManaged`

**Decision**: New standalone, fund-free UUPS registry at `contracts/apps/MiniAppRegistry.sol`,
modeled on `ExternalDAORegistry` (id-keyed entries, duplicate guards, vendor index) with
`CallsignRegistry` conventions (roles, bounded params, append-only storage + `__gap`,
EthTrust-SL2 NatSpec). Interface `contracts/interfaces/IMiniAppRegistry.sol` holds the
`Status` enum, structs, events, and errors. Key design points:

- Roles: inherited `DEFAULT_ADMIN_ROLE`/`UPGRADER_ROLE` + `APP_CURATOR_ROLE`
  (approve/suspend/deprecate — held by the compliance multisig, granted post-deploy in
  the deploy script per the callsign pattern).
- Lifecycle: submit → Pending; curator approve → Approved (records `approvedAt`,
  `approvedVersion` fields); curator suspend ⇄ Approved (reversible); deprecate is
  terminal. Vendor `submitUpdate` (new CID/manifestHash/metadata) bumps `version`,
  stores the new artifact as **pending fields**, resets status handling such that the
  **last approved CID+hash remain served** until re-approval (FR-003) — i.e. the record
  keeps `{current: approved artifact, proposed: pending artifact}`.
- Vendor gate: optional membership gate via mutable
  `(membershipManager, membershipRole, minTier)` exactly like `ExternalDAORegistry`
  (no quota hooks — listing confers no value power); optional `ISanctionsGuard`
  (`address(0)` ⇒ disabled, the Mordor-safe convention) checked on vendor submission.
- Bounded strings (name/description/category/CID length caps), `AppSubmitted` /
  `AppUpdated` / `AppApproved` / `AppSuspended` / `AppDeprecated` events carrying enough
  data for indexer-free UI reads.
- **No `SignerIntentBase` in v1**: curator actions are multisig transactions and vendor
  submissions are rare, self-submitted admin-ish actions; the never-stranded rule
  applies to member value actions. `FeeRouter`/`ExternalDAORegistry`/`BridgeRouter` are
  the precedent for skipping it. `submitApp/submitUpdate` are the future `…WithSig`
  candidates if needed.
- Registration: one-line append to `UPGRADEABLE_CONTRACTS` in
  `scripts/deploy/check-storage-layout.js`; Slither coverage is automatic; Medusa
  harness optional (stateful but fund-free — add a fuzz harness only if review asks).

## R5. Chain residency: one registry chain per cohort (`miniAppChainId()`)

**Decision**: The registry lives on exactly one chain per environment cohort, resolved
by a new `miniAppChainId()` in `config/networks.js` **derived from the existing
`MAINNET_CHAIN_ID`/`TESTNET_CHAIN_ID` pair** (the spec-071 `membershipChainId()`
pattern — never a second literal). All registry reads use
`getReadProvider(miniAppChainId())`; lifecycle writes require the wallet on that chain.
Deployment keys: `miniAppRegistry` / `miniAppRegistryImpl` (seeded across
`config/contracts.js` per-chain objects + `sync-frontend-contracts.js` mapping + tenant
`keys` array), plus `DEPLOYMENT_BLOCKS_BY_CHAIN` entries so event scans are bounded.
The "permissioned subnet" of the design notes maps to this cohort machinery plus
spec-072 dedicated-tenant contract sets — no new network concept is introduced.

## R6. Catalog reads: direct RPC, no subgraph

**Decision**: No subgraph data source. The catalog enumerates apps via registry view
functions (`appCount` + paged `getApp(id)` reads, or `getAppsPaged`) against
`getReadProvider(miniAppChainId())`, cached in memory with a bounded-staleness note; the
launch path always re-reads the single record it is about to execute (FR-010).

**Rationale**: Direct precedent — CallsignRegistry, FeeRouter, ExternalDAORegistry,
StakingRouter et al. are all indexer-free; the spec itself demands the platform work
with direct reads only. Catalog scale (curated enterprise list, tens of apps) does not
need The Graph. An indexer remains a documented future optimization.

## R7. Package hosting: existing Pinata/gateway seam; publish script; no relay-gateway module

**Decision**: Packages are pinned via the existing Pinata path (`@pinata/sdk` dev-dep,
nginx `/api/pinata` proxy for browser uploads) by a Node publish script
(`scripts/miniapps/publish.js`: build → hash → pin → print CID + manifestHash for the
on-chain submission). Fetching uses a gateway list resolved as
**tenant/env config → default** (`VITE_MINIAPP_GATEWAY` primary + existing
`IPFS_GATEWAY` fallbacks), tried in order (FR-012), all origins already CSP-permitted in
`connect-src`. No relay-gateway module in v1 — the browser talks to the gateway
directly, and integrity comes from R3, not from trusting the gateway. If a *private
authenticated* gateway is later required, the relay-gateway optional-module pattern
(`bitcoin/`-style env-gated router) is the documented seam.

## R8. Host context: one provider wrapping existing seams

**Decision**: `frontend/src/lib/miniapps/hostContext.jsx` builds a frozen per-app
context object handed to the mounted module:

| Capability | Backing seam |
|---|---|
| `wallet` (address, chainId, connect status, `submit(payload)`) | `useActiveAccount()` — routes personal/vault/legacy identities; never exposes a raw signer or key |
| `readProvider(chainId)` | `getReadProvider` (spec-069 endpoint resolution) |
| `store` (get/set/subscribe, namespaced) | `userStorage` key `miniapp_<appId>_v1` (localStorage), joined to backup via one `syncedObjects.js` entry |
| `audit.log(kind, refs)` | `appendClientRecord` with new `LEDGER_CLASS` value `miniapp` + stable `clientEntryId('miniapp:<appId>:…')` |
| `toast` | `useNotification().showNotification` |
| `navigate(to)` | router `useNavigate`, restricted to in-app paths |

The host **automatically** audit-logs launches, transaction submissions (wrapping
`submit`), and integrity failures (FR-019) — mini-app cooperation not required. A new
ledger source (`data/ledger/sources/miniAppSource.js`) is registered in
`data/ledger/index.js` so entries surface in Reporting (an unregistered source is
unreachable, per the file's own contract).

## R9. Surfaces: catalog tab + workspace route; nav & deep-link migration

**Decision**:
- The Apps nav group collapses to one item: `{ id: 'apps', label: 'Apps' }` →
  `/wallet?tab=apps` (Catalog panel: search, six category filters, app cards, developer
  submission entry point). New tenant feature id `miniapps` gates it
  (`tenants/features.json` + `NAV_FEATURE_IDS`); first-party catalog entries also honor
  their existing per-app feature ids (`clearpath`, `token-mint`, `wagers`).
- Launch mounts at absolute route `/apps/:appId` (workspace) inside `AppLayout`, wrapped
  in an error boundary (FR-015) with unmount/remount-safe state (FR-016, R8 store).
- Legacy deep links (FR-009): `TAB_ALIASES` (WalletPage + AppNavDrawer, kept in parity)
  gains redirect handling so `?tab=clearpath` → `/apps/clearpath`, `?tab=tokens` →
  `/apps/token-mint`; `/wagers` continues to resolve (see R11 phasing).
- Compliance review: AdminPanel **Compliance** group gains a `miniapp-review` tab
  (`adminNav.js` + the three-edit AdminPanel pattern), gated by a new
  `ROLES.MINIAPP_CURATOR` whose authority is read from the registry contract itself
  (spec-067 `readRouterAuthority` precedent — per-contract authority, not app-wide
  flags), with the "no chain answered" vs "not held" distinction preserved.

## R10. PWA package cache: extend the hand-rolled SW

**Decision**: Extend `public/sw.js` with a second, versioned cache
(`fairwins-miniapp-packages-v1`) for gateway package fetches: cache-first (CIDs are
immutable → deterministic), LRU-bounded, evicted on `activate` sweeps. The registry
read at launch (network) decides *which* CID to load; the cache only accelerates
fetching bytes whose hashes are still verified on every launch — so a stale cache can
never bypass FR-010/FR-011 (verification happens in the loader, after cache retrieval).
Host-shell precache and the update-prompt flow
(`serviceWorkerUpdate.js`/`usePwaUpdate`/`PwaUpdateNotification`) already satisfy
FR-027/FR-029 and are unchanged.

## R11. First-party conversions: SDK-first, phased by entanglement

**Decision**: First-party mini-apps live as in-repo packages under
`frontend/miniapps/<appId>/` built by the shared preset (R2) and published like any
vendor package (R7) — same registry, same verification, no privileged imports (FR-030).
Conversion order follows measured entanglement:

1. **Token Mint** (~1.8k LOC, cleanest tree, no local store) — first conversion, proves
   the runtime contract.
2. **ClearPath** (~2.8k LOC, mostly self-contained) — second; its raw-localStorage
   `trackedDaoStore` migrates to the namespaced host store (fixing a known
   backup-registry gap), and its notification adapter (`daoSource.js`) stays host-side.
3. **Wagers** (~13.5k LOC, entangled: global `FriendMarketsProvider` in `main.jsx`,
   `TradePanel` shared with the Trade tab, `HomeScreen` imports) — **explicitly the last
   phase**, preceded by refactor tasks that split shared pieces (TradePanel, HomeScreen
   dependencies) out of `components/fairwins/` and scope the provider. Until that phase
   lands, `/wagers` keeps serving the host-native surface and the catalog lists Wagers
   as launching there — the catalog never lies about what is a verified package
   (Constitution III).

**Dev/test honesty**: local development serves *built, hashed* packages from a Vite
middleware ("dev gateway") through the same loader/verification path — no mock loader
in shipped code; Vitest exercises the loader against built fixtures.

## R12. Out-of-scope confirmations

- **Enterprise SSO**: deployment-infrastructure assumption (spec) — on-chain
  `APP_CURATOR_ROLE` is the enforcement boundary; no SSO code in v1.
- **Iframe sandboxing, permissionless listing, cross-app messaging, multi-chain
  catalog**: spec non-goals, unchanged.
- **Custody-provider integrations (Fireblocks/Copper)**: existing wallet options
  (injected/WalletConnect/passkey + Safe vaults via `useActiveAccount`) are the v1
  custody surface.
