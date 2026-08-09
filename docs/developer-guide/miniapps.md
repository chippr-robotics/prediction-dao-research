# Mini-apps (spec 073)

The **Apps** section serves third-party packages: self-contained React bundles published to IPFS,
curated on-chain by the `MiniAppRegistry`, fetched and hash-verified by the host, and executed from
a Blob URL inside a restricted context object.

This guide serves two readers. Sections marked **[host]** are for a FairWins engineer maintaining
the platform side; sections marked **[vendor]** are for anyone building a package. Everything under
"The runtime contract" is read by both — it is the interface between them, and neither side may
change it alone.

- Contract: `contracts/apps/MiniAppRegistry.sol` (interface `contracts/interfaces/IMiniAppRegistry.sol`)
- Spec: [`specs/073-miniapp-platform/`](../../specs/073-miniapp-platform/); normative runtime
  contract in [`contracts/host-context.md`](../../specs/073-miniapp-platform/contracts/host-context.md)
- Starter repo: <https://github.com/chippr-robotics/chippr-miniapp-template>
- Operator runbook:
  [`docs/runbooks/miniapp-registry-operations.md`](../runbooks/miniapp-registry-operations.md) — the
  other half of spec 073 T045. Curator procedures (review, suspension, deprecation, the role
  handoff, gateway config, diagnostics) live there; this guide describes them in outline only.

Where this guide and `contracts/host-context.md` disagree on a detail, this guide matches the code:
the spec's interface block predates `host.networks()`, types `store.set` as `void`, and omits
`store.get`'s `fallback` argument.

## The trust model

**A mini-app is untrusted third-party code running in the member's page, in the member's origin.**
There is no iframe and no worker — the package is imported into the host realm, so it shares the
DOM, the network stack and the origin's storage with the host. That is a deliberate v1 choice
(spec §Assumptions: "curation is the trust boundary"), and it fixes what everything else has to do:

1. **Curation is enforced on-chain.** Only a package a curator approved, at a content hash the
   curator committed to, is ever fetched.
2. **Integrity is verified before execution.** keccak256 of the manifest bytes against the registry,
   then SHA-256 of every file against the manifest — then, and only then, a Blob URL.
3. **The `host` object is the entire privileged surface.** Everything a package can do that a plain
   script could not, it does through `host`. There is no signer, no wagmi context, no storage
   handle, no router — only wrappers. Adding a key to `host` grants it permanently to every
   third-party package that will ever be approved, so additions are a specification decision, not a
   convenience.

What this model does **not** claim: a package that gets approved can still read the DOM, hit the
network, and burn CPU. The registry is the defence, and curation review is a real review.

## Repository map

| Concern | Path |
|---|---|
| Registry contract | `contracts/apps/MiniAppRegistry.sol`, `contracts/interfaces/IMiniAppRegistry.sol` |
| Registry reads (catalog + launch) | `frontend/src/lib/miniapps/registryClient.js` |
| Curator authority read | `frontend/src/lib/miniapps/registryAuthority.js` |
| Manifest schema + validation | `frontend/src/lib/miniapps/manifest.js` |
| Hash verification | `frontend/src/lib/miniapps/integrity.js` |
| Fetch → verify → import | `frontend/src/lib/miniapps/loader.js` |
| Shared-module scope | `frontend/src/lib/miniapps/hostScope.js` (installed in `frontend/src/main.jsx`) |
| The `host` object | `frontend/src/lib/miniapps/hostContext.jsx` |
| Namespaced store | `frontend/src/lib/miniapps/store.js` |
| Catalog / workspace / submit surfaces | `frontend/src/components/miniapps/` |
| Curator review tab | `frontend/src/components/admin/MiniAppReviewTab.jsx` |
| Audit entries | `frontend/src/data/ledger/sources/miniAppSource.js` |
| Build preset | `tools/miniapp-build/` |
| Publish script | `scripts/miniapps/publish.js` |
| First-party packages | `frontend/miniapps/token-mint/`, `frontend/miniapps/clearpath/` |
| Package cache | `frontend/public/sw.js` (`fairwins-miniapp-packages-v1`) |
| Store artwork + store bar (spec 077) | `frontend/src/components/miniapps/appArt.jsx` + `appArtwork.js`, `StoreBar.jsx`, `storeViews.js` |

## The store surface **[host]** (spec 077)

The catalog's visual layer. Three rules keep it from becoming a trust surface:

- **Artwork is host-curated, full stop.** Card illustrations live in
  `appArt.jsx` (the SVG components) behind `appArtwork.js` (the slug map), keyed by the same
  slug the launch route uses, with a deliberate generic
  fallback — `artworkFor()` is total over any input. Nothing on-chain, in a manifest, or in a
  package may supply catalog imagery: an on-chain icon field would widen the registry's trust
  surface, package art would move keccak-committed bytes, and either would hand vendors a
  self-served image channel into the store. Adding an app's art is an ordinary reviewed host
  change. All of it is decorative (`aria-hidden`); the card's text is the identity.
- **The "On-chain verified market" badge is a factual claim**, so it renders only over a
  verified listing — never the stale snapshot, the outage, or the registry gap. If you touch the
  header, keep that gate; `storeRedesign.test.jsx` pins it across every state. The badge is the
  ONLY trust copy on the surface (iteration 2): the explanation prose was removed deliberately —
  do not reintroduce it; this guide and the runbooks are where the depth lives.
- **Rows promise nothing the sheet walks back.** Catalog entries are tappable store rows; the
  launch affordance, the My Apps toggle, and both launch-refusal explanations live in the
  app-details sheet (`AppSheet.jsx`), gated on the SAME `verified`/slug pair the cards used.
  `appSheet.test.jsx` pins the dialog mechanics (labelling, Escape/backdrop/close, focus
  restoration to the invoking row).
- **Store navigation is presentation state, not navigation.** Market / My Apps / Search ride the
  Apps tab's existing `?view=` seam (`storeViews.js` resolves it, totally — unknown values are
  the market; `view=submit` keeps its exclusive surface). Every sub-view is a lens over the ONE
  fetched listing: My Apps is favorites ∩ the launchable-filtered list and inherits the market's
  launch rules; nothing refetches on a view switch. The host's global navigation (spec 069)
  is untouched.

## The registry **[host]**

`MiniAppRegistry` is a fund-free UUPS proxy (`UUPSManaged`), deployment keys `miniAppRegistry` /
`miniAppRegistryImpl`. It holds no value, has no oracle path, and has no `…WithSig` twins — vendor
and curator actions are infrequent and are paid by their own actors.

### One home per cohort

```js
// frontend/src/config/networks.js
const MINIAPP_TESTNET_CHAIN_ID = 63          // Mordor — NOT TESTNET_CHAIN_ID (Amoy)
export function miniAppChainId() {
  return buildIsTestnet() ? MINIAPP_TESTNET_CHAIN_ID : MAINNET_CHAIN_ID
}
```

Deployment targets are **Polygon 137 and Mordor 63 only**. Amoy is deliberately not one, which is
why this is the single reference chain in the estate that does **not** derive from
`TESTNET_CHAIN_ID` — deriving it would resolve every testnet build to a chain with no registry.
Never hardcode `137`: the catalog decides which packages the host *executes*, so crossing the cohort
boundary would run mainnet-curated code against testnet wallets. `miniAppChainId()` is not
runtime-configurable, on purpose.

Live addresses:

| Chain | `miniAppRegistry` | Implementation | Deploy block |
|---|---|---|---|
| Polygon 137 | `0x5a168Cc9FeFaf40e7BC536C8C61669e6d547A0A2` | `0x41858006aD6dd0788b84F9fb17A28d8167C7b331` | 91265680 |
| Mordor 63 | `0xFEd626025225A3B1aB3BA72D429B8c9C74cb5058` | `0xc8Dd8601b35aDa3AF367C9E41f24Fd0503Ced674` | 16685064 |

### `launchable` IS the serving decision — never `status`

```solidity
function isLaunchable(uint256 id) public view returns (bool) {
    AppRecord storage rec = _apps[id];
    if (rec.vendor == address(0)) return false;
    if (rec.status == Status.Suspended || rec.status == Status.Deprecated) return false;
    return bytes(rec.approved.cid).length != 0;
}
```

A **Pending record with a prior approval is a LIVE app whose update is in review** (FR-003).
`status` is the *review* state; `launchable` is the *serving* state, and every `AppView` carries it.
Gating on `status === Approved` would let any vendor take their own live app offline by submitting
anything at all. `registryClient.normalizeApp` reads the chain's `launchable`; never re-derive it
client-side.

### Approval is content-committed

```solidity
function approveApp(uint256 id, bytes32 expectedManifestHash) external onlyRole(APP_CURATOR_ROLE);
function rejectProposal(uint256 id, bytes32 expectedManifestHash) external onlyRole(APP_CURATOR_ROLE);
```

The hash is compared **before any state change** and reverts `StaleProposal(expected, actual)`.
The original `approveApp(id)` read the proposed tuple at execution time, which let a vendor swap the
package after review — by front-running the transaction, or during a multisig signing window — and
get unreviewed code marked Approved. The integrity chain does not help: the substituted manifest
hashes correctly against itself. **There is deliberately no id-only overload. Never add one.**

### Lifecycle

| Action | Caller | Effect |
|---|---|---|
| `submitApp(name, description, category, cid, manifestHash)` | any eligible vendor | new record, `proposed` set, `status = Pending`, version 1 |
| `submitUpdate(id, cid, manifestHash)` | vendor | writes `proposed` only, `status = Pending`. **Never touches `approved`** — the live package keeps serving |
| `updateMetadata(id, name, description, category)` | vendor | re-keys the name, forces `status = Pending` (metadata is reviewed too) |
| `approveApp(id, expectedManifestHash)` | `APP_CURATOR_ROLE` | promotes `proposed → approved` (or reinstates a retained `approved` after suspension) |
| `rejectProposal(id, expectedManifestHash)` | `APP_CURATOR_ROLE` | clears `proposed`; returns to Approved only if not Suspended and an approved tuple exists |
| `suspendApp(id)` | `APP_CURATOR_ROLE` | reversible; reachable from Pending as well as Approved |
| `deprecateApp(id)` | `APP_CURATOR_ROLE` | **terminal**; keeps `approved` and the name reservation |
| `setMembershipGate(manager, role, minTier)` / `setSanctionsGuard(guard)` | `DEFAULT_ADMIN_ROLE` | both gates optional; a non-contract address is refused (`InvalidGateConfig`) |

`APP_CURATOR_ROLE` **administers itself** (`_setRoleAdmin(APP_CURATOR_ROLE, APP_CURATOR_ROLE)`), so
`DEFAULT_ADMIN_ROLE` cannot self-grant curation. The consequence is real: losing every curator key
is recoverable only through a UUPS upgrade. The role is seeded in `initialize`, where `curator` is a
required, non-zero parameter.

Vendor eligibility is the membership gate (`getActiveTier(vendor, membershipRole) >= minTier`,
default Silver) plus the sanctions guard, and both are **skipped when unconfigured, never failed**.
The tier is read only — submitting never consumes a creation quota.

Bounds: name ≤ 64 bytes, description ≤ 512 bytes, CID ≤ 256 bytes, `getAppsPaged` clamps `limit` to
`MAX_PAGE_LIMIT = 25` rather than reverting. Names are folded (ASCII lower-case, runs of spaces
collapsed, ends trimmed) before keying, and `idByName` applies the same folding so a client can
pre-check a collision. Versions come from a persisted `lastVersion` high-water mark and are never
reused, including across rejections.

### Authority state, stated plainly

All three roles (`APP_CURATOR_ROLE`, `DEFAULT_ADMIN_ROLE`, `UPGRADER_ROLE`) are still held by the
deployer EOA `0x52502d…F6e1` on **both** networks. Handover to the compliance multisig is pending,
so the curation trust boundary is not yet real — `UPGRADER_ROLE` is a strict superset of curation.
`scripts/deploy/deploy-miniapp-registry.js` prints the handover sequence: grant to the multisig
first, verify the curator grant landed, then renounce curator, upgrader, and `DEFAULT_ADMIN_ROLE`
last.

## The runtime contract (`hostApi: 2`)

A package's entry module default-exports one React component. The host mounts it inside
`MiniAppHostProvider` and passes a frozen `host` object, also reachable via `useMiniAppHost()` from
the shared SDK. **Ten keys, and that is the whole grant:**

```js
Object.freeze({
  appId,          // 'app-<chainId>-<registryId>' — the store namespace + audit attribution
  wallet: Object.freeze({
    address, connectedAddress, chainId, isConnected,
    submit, requestConnect, switchChain,
  }),
  readProvider,   // (chainId?) => guarded ethers Provider   — THROWS
  contracts,      // (name, chainId?) => string | null       — THROWS for undeclared names
  network,        // (chainId?) => descriptor | null
  networks,       // () => frozen number[] (this build's cohort)
  store,          // { get, set, subscribe } — namespaced to appId
  audit,          // { log(kind, refs) }
  toast,          // { show(message, type) }
  navigate,       // (to) => void
})
```

`appId` is **not** the URL slug. Names are editable and re-registrable; registry ids are neither, so
the namespace is keyed on `app-${chainId}-${registryId}` (`appNamespaceKey`). Renaming an app never
loses its member's data, and re-registering a released name never inherits it.

### Refusal codes

Every refusal is a `MiniAppHostError` carrying `.reason` (one of `HOST_REFUSAL`) and `.userMessage`
(a member-facing sentence — prefer it to `.message` when you surface an error).

| Code | Raised by | Meaning |
|---|---|---|
| `wallet_absent` | `submit` | no wallet, or the acting identity has no address here |
| `wrong_chain` | `submit` | the wallet, or the acting identity, is not on the chain the payload names |
| `identity_locked` | `submit` | a recovered legacy account exists but cannot sign right now |
| `bad_payload` | `submit`, `switchChain`, `wait()` | the call does not match the contract (missing/invalid `chainId`, bad `to`/`data`/`value`, or `wait()` on a proposal / a result with no hash) |
| `no_write_rail` | `submit` | the session has no signer **and** no `sendCalls` — distinct from "no wallet" and from "locked" |
| `sanctioned_account` | `submit` | the acting account screened positively restricted; nothing was sent |
| `undeclared_contract` | `contracts` | the name is not in the package manifest's allowlist |
| `no_read_provider` | `readProvider`, `wait()` | no RPC endpoint is configured for that chain (spec 069 resolution) |
| `provider_member_blocked` | guarded provider | `destroy` / `removeAllListeners`, or any attempt to mutate the shared provider |
| `switch_refused` | `switchChain` | the wallet declined, or cannot reach that chain |
| `external_target` | `navigate` | the target leaves the host |

**Throw vs. warn is deliberate.** `submit`, `switchChain`, `navigate`, `contracts` and
`readProvider` throw. `audit.log` and `toast.show` warn to the console and drop; `store.set`
returns `false`. Bookkeeping and chrome must never abort the flow they are describing.

### `wallet.submit` — and why it is not confirmation

```js
submit(payload: { to, data?, value?, chainId }): Promise<SubmitResult>
```

The sequence, in order, because the order is the security property:

1. Payload must be an object; `chainId` must be a positive-integer EVM id — **never guessed**
   (Bitcoin's string network ids are rejected here).
2. Wallet present, wallet chain equals the requested chain, acting identity permitted.
3. The payload is **rebuilt, not forwarded**. Only `to` (a plain 40-hex address), `data` (whole
   0x-bytes, default `'0x'`) and `value` (bigint, safe integer, or an exact decimal/hex string)
   survive. `batch` and `operation` (Safe `DELEGATECALL`) stop here.
4. **The host screens the acting account for sanctions**, live, at submit time. Only a positive
   `restricted` refuses; an unreachable screening endpoint yields `uncertain` and the transaction
   proceeds. Your app does nothing and cannot opt out — screening in the app layer would be optional
   in practice, and the packages most worth screening are the least likely to cooperate.
5. The host picks the rail: **identity first, rail second.** A vault or legacy identity always goes
   through the active-account path, so a passkey member acting as a Safe vault gets a *proposal*, not
   a UserOp from their own account. A passkey personal session writes through `sendCalls`; a classic
   personal session through its signer. `sendCalls` and `loginMethod` are deliberately absent from
   `host`, so a package has nothing to branch on and needs nothing.

`SubmitResult` is `{ kind: 'sent' | 'proposed', txHash, safeTxHash }` plus a **non-enumerable**
`wait(confirmations = 1)`. Non-enumerable so the result stays plain and serialisable.

**`submit` resolves at BROADCAST.** `kind: 'sent'` means the network accepted the transaction — not
that it mined, and not that it succeeded. `kind: 'proposed'` means nothing moved at all. An app that
awaits `submit` and tells the member the action is done is lying. This is Token Mint's create path,
`frontend/miniapps/token-mint/src/useTokenFactory.js`:

```js
// Encoding only — no signer is involved, and none is reachable from a
// package. The host turns this call into whichever rail the member's
// session actually has.
const iface = new ethers.Interface(TOKEN_FACTORY_ABI)
const data = iface.encodeFunctionData(method, args)
const result = await host.wallet.submit({ to: factoryAddress, data, value: 0n, chainId })

// A vault action is a PROPOSAL: nothing has moved, no token exists yet,
// and there is no hash to wait on.
if (result.kind === 'proposed') {
  setStatus('success')
  return { proposed: true, safeTxHash: result.safeTxHash }
}

setLastTxHash(result.txHash)

// `submit` resolves at BROADCAST. Confirmation is this app's job.
let receipt = null
try {
  receipt = await result.wait()
} catch {
  // Either the rail reported no hash, or the read endpoint could not
  // see the transaction. It was still SENT — report that honestly.
  setStatus('success')
  return { txHash: result.txHash }
}
if (receipt && receipt.status === 0) {
  throw new Error('The token creation transaction reverted on-chain.')
}
```

`wait()` takes a confirmation count and **no timeout**, so the caller imposes one. The host waits
through the *member's* read endpoint, which is a different endpoint from the one the wallet
broadcast through, so "not mined yet" and "not visible here yet" are indistinguishable and waiting
forever is a real outcome. ClearPath's helper (`frontend/miniapps/clearpath/src/useClearPath.js`) is
the shape to copy:

```js
const CONFIRM_TIMEOUT_MS = 120000

async function waitWithTimeout(result) {
  let timer
  try {
    return await Promise.race([
      result.wait(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const e = new Error('confirmation timed out')
          e.code = 'TIMEOUT'
          reject(e)
        }, CONFIRM_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
```

A timeout is **not** a failure — report "may still confirm", never "failed". `wait()` also does not
follow a wallet-side speed-up or cancel the way `TransactionResponse.wait()` would, and on the
passkey rail `txHash` may be a UserOp hash or an intent id (taken in decreasing order of finality,
never fabricated — `null` if the rail returned nothing).

### `wallet.switchChain`

The companion to `submit`'s `wrong_chain` refusal: without it an app can name the problem and never
offer the fix, which matters for anything that browses across chains. It grants no authority — the
member still approves in their own wallet, and a decline is a typed `switch_refused` so the button
can return to the right state. From `frontend/miniapps/clearpath/src/ExternalDaoView.jsx`:

```js
const handleSwitch = useCallback(async () => {
  setSwitching(true)
  try {
    await host.wallet.switchChain(chainId)
  } catch (e) {
    // The host's refusal already carries a member-facing sentence; prefer it to the raw message.
    showNotification(e?.userMessage || e?.message || 'Could not switch network.', 'error')
  } finally {
    setSwitching(false)
  }
}, [host, chainId, showNotification])
```

### `contracts(name, chainId?)`

A package **cannot carry the address book** (see "Why host config cannot be bundled"), so the host
answers instead. The manifest declares both the capability and the specific names:

```json
{ "permissions": ["contracts", "network"], "contracts": ["tokenFactory"] }
```

The two negative answers are different and must stay different:

| Situation | Result |
|---|---|
| Name not in the manifest allowlist | **throws** `undeclared_contract` |
| Name declared, no deployment on that chain | returns `null` (never `''`) |

Answering `null` for an undeclared name would let "you are not approved for this" pass as "it is not
deployed here". A workspace that omits the allowlist gets `EMPTY_CONTRACTS` — the gate fails closed.

```js
// frontend/miniapps/token-mint/src/useTokenFactory.js
const factoryAddress = useMemo(() => {
  // Declared in the manifest's `contracts` allowlist; the host throws for a
  // name this package never declared, which would be a packaging bug.
  try {
    return host.contracts('tokenFactory', chainId)
  } catch {
    return null
  }
}, [host, chainId])
```

### `network(chainId?)` and `networks()`

`network()` is a flat **value projection** —
`{ chainId, name, isTestnet, nativeCurrency: { symbol, decimals }, explorer: { name, baseUrl } | null, subgraphUrl }`
— never the `NETWORKS` entry, which also carries `rpcUrl`, `dex`, Polymarket and passkey config.
Wrappers, never handles. An unknown chain is `null`, **not** `getNetwork()`'s default-network
fallback: an app must be able to say "unknown network", and must never render one chain's explorer
link against another chain's data.

`networks()` returns `cohortChainIds()` frozen — this build's cohort, never
`listSupportedChainIds()`, because constitution III forbids a read crossing the testnet/mainnet
boundary and that boundary is the host's to enforce. It was declined once (for one informational
card) and added for ClearPath, which is network-agnostic by design: freezing a chain roster into an
immutable package would mean a new network cannot appear without a re-publish, re-review and
re-approve.

### `readProvider(chainId?)`

The spec-069-resolved read provider — the member's override first, the build default behind it —
resolved on **every call**, so a repointed endpoint takes effect on the next read. It **throws**
`no_read_provider` for a chain with no endpoint, which is a real condition since members own their
endpoints.

The returned Proxy has a **stable identity per underlying provider** (a `WeakMap`), so it is safe as
a React effect dependency; an earlier version minted a fresh Proxy per call and made every app that
did so spin. `destroy()` and `removeAllListeners()` return a stub that throws when called — the host
caches one provider per endpoint and every host read shares it. Writes, redefinitions and deletions
on the proxy all throw.

Packages must **never** hand-build a provider. From ClearPath:

> The read-route toggle is gone, and its absence is the correct outcome rather than a casualty.
> Host-native this offered 'public' vs 'wallet' reads and hand-built providers from
> `NETWORKS[chainId].rpcUrl` — something the platform's own guardrails forbid. A package cannot do
> it at all: no wallet provider is reachable, and no network config is bundled.

### `store`

`get(key, fallback = null)` · `set(key, value) → boolean` · `subscribe(listener) → unsubscribe`.

The namespace is **structural**: `createAppStore(account, appId)` closes over the app id, and the
returned methods take a *key* only, so no argument a package can construct reaches another app's
data. Backed by `userStorage` (`fw_user_<account>_miniapp_<appId>_v1`) through a session `Map`.

- `set` returns "did anything change" — `false` for a forbidden or malformed key, an unserializable
  value, a no-op write, or a namespace over `MAX_NAMESPACE_BYTES` (256 KB). Nothing it does throws.
- `undefined` removes a key. Values are JSON snapshots and are deep-frozen on the way out.
- The store **rides the spec-032 encrypted backup** as the non-network-scoped `miniAppState` synced
  object ("Mini-app data"), keyed by app id, up to 128 apps per bundle.
- The namespace follows the **acting identity**, so a member operating as a vault sees the vault's
  data, not their personal data. ClearPath's `trackedDaoStore.js` documents that as a real behaviour
  change from its host-native version, and it is the correct reading of "whose DAOs are these".

The host audits *significant* writes only: a change (not a refusal or no-op), with an address and a
chain, and at most once per key per 60 s (`STATE_AUDIT_WINDOW_MS`, leading edge, no timer — a
trailing debounce would lose the change made just before a tab closes). **Only the key is recorded,
never the value.**

### `audit`, `toast`, `navigate`

- `audit.log(kind, refs)` writes a `miniapp_app_logged` ledger entry. `kind` must match
  `/^[a-z][a-z0-9_.-]{0,63}$/` — lowercase and colon-free, which is exactly what reserves the
  `host:` prefix for entries the host wrote (`host:tx_proposed`, `host:tx_failed`,
  `host:app_crashed`). Refs are bounded: ≤12 keys, key pattern `[A-Za-z0-9_.-]{1,32}`, string values
  truncated at 200 chars.
- `toast.show(message, type)` — message clamped to 200 chars; `type` is one of
  `info | success | error | warning`, anything else falls back to `info`. The type becomes a CSS
  class on the host's own notification element, which is why it is clamped.
- `navigate(to)` — in-app paths only, 1–512 chars. Tabs/newlines/CRs are refused *before* the
  protocol-relative check (a URL parser strips them, so `'/\n/evil.example'` would arrive as
  `'//evil.example'`), as are `\`, anything not starting with `/`, and `//`.

### Host obligations, mini-app obligations

**[host]** Verify status and integrity before import (approved tuple only); contain app failures in
an error boundary *outside* the provider; inject `manifest.styles` scoped under the workspace root;
tolerate unmount/remount (the store survives); auto-audit launch, tx submit, integrity failure and
state changes.

**[vendor]** Default-export a mountable React component; use only `host` and the shared scope for
privileged behaviour (bundled pure libraries are fine); style through the package's own stylesheet;
stay functional after remount; surface transaction errors through `host.toast`.

## The manifest **[vendor]**

`manifest.json` is emitted by the build preset, never hand-written. Field order is the schema and
every list is sorted, so rebuilding unchanged sources reproduces the same bytes — and therefore the
same hash. `manifest.json` is never listed in its own `files` map.

```json
{
  "schema": "fairwins-miniapp-manifest/1",
  "id": "token-mint",
  "name": "Token Mint",
  "version": "1.0.0",
  "entry": "entry.js",
  "styles": ["style.css"],
  "hostApi": 2,
  "sharedDeps": ["@fairwins/miniapp-sdk", "ethers", "react", "react/jsx-runtime"],
  "permissions": ["contracts", "network", "toast", "wallet:submit"],
  "storeKeys": [],
  "contracts": ["tokenFactory"],
  "files": {
    "entry.js": { "sha256": "08b770f429e1f1b7938e5deda8f69ecf4a8972b21b18a356acdbeb0d2fff5ec2" },
    "style.css": { "sha256": "6460e7686e9bd9047d8ce380cd2fafa0f79d95f63c41001b23ec2f7715afe94e" }
  }
}
```

| Field | Rule |
|---|---|
| `schema` | exactly `fairwins-miniapp-manifest/1`; anything else is refused |
| `id` | `/^[a-z][a-z0-9-]{1,30}$/`, and must equal the slug the host resolved (`identity_mismatch` otherwise) |
| `version` | semver-shaped `/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/`; display only — the registry's own version counter is authoritative |
| `entry` | must appear in `files` |
| `styles` | ≤8, each must appear in `files` |
| `hostApi` | integer; `> SUPPORTED_HOST_API` raises `HostApiError` (a distinct class — the remedy is "update the host", not "the package is broken") |
| `sharedDeps` | subset of `react`, `react-dom`, `react/jsx-runtime`, `ethers`, `@fairwins/miniapp-sdk` |
| `permissions` | subset of `wallet:submit`, `store`, `audit`, `toast`, `navigate`, `contracts`, `network` |
| `storeKeys` | ≤32, each `/^[A-Za-z0-9_.-]{1,64}$/` |
| `contracts` | ≤16 names matching `/^[a-zA-Z][a-zA-Z0-9]{1,63}$/`; **non-empty without the `contracts` permission is a refusal** — a manifest that misdescribes itself is worse than one that asks for too much |
| `files` | ≤64 entries, each a 64-hex SHA-256 (`normalizeDigestHex`: case-insensitive, an optional `0x` tolerated, stored lower-cased); paths pass `isSafePackagePath` (≤8 segments, ≤200 chars, no scheme, no leading `/`, no `\`, no whitespace or control characters) |

`parseManifest` takes **bytes, never text** (a string is refused as `not_bytes`) and decodes with
`TextDecoder('utf-8', { fatal: true })`. The full refusal vocabulary is `MANIFEST_REFUSAL` in
`frontend/src/lib/miniapps/manifest.js`.

Declare permissions honestly. Token Mint declares `storeKeys: []` with the comment "listing a
storeKey it never writes would over-declare to a reviewer", and ClearPath declares `sanctionsGuard`
under `contracts` for a **read only**, noting that the screening decision is the host's. A curator
reads one line instead of diffing a bundled table; make that line true.

## The build preset **[vendor]**

`tools/miniapp-build/` is the only supported way to build a package. A package's whole
`vite.config.js` is a call to `createMiniAppConfig`:

```js
// frontend/miniapps/clearpath/vite.config.js
import react from '@vitejs/plugin-react'
import { createMiniAppConfig } from '../../../tools/miniapp-build/index.js'

export default createMiniAppConfig({
  appId: 'clearpath',
  name: 'ClearPath',
  version: '1.0.0',
  root: import.meta.dirname,
  entry: 'src/entry.jsx',
  permissions: [
    'wallet:submit', // register, propose, vote, queue, execute
    'toast',
    'store',         // device-tracked DAOs, on networks with no on-chain registry
    'contracts',     // ExternalDAORegistry / paymentToken / sanctionsGuard, per chain
    'network',       // the chain roster, explorer links, network names
  ],
  storeKeys: ['tracked', 'trackedMigratedAt'],
  contracts: ['externalDAORegistry', 'paymentToken', 'sanctionsGuard'],
  plugins: [react()],
})
```

The entry is the whole package's front door and stays a one-line adapter:

```jsx
// frontend/miniapps/token-mint/src/entry.jsx
import TokensPanel from './TokensPanel'

export default function TokenMintApp() {
  return <TokensPanel />
}
```

What the preset guarantees:

- **One ES module.** Lib mode, `format: 'es'`, `inlineDynamicImports`, no content hashes: output is
  exactly `entry.js` (+ `style.css` if any CSS exists). The manifest plugin fails the build unless
  there is exactly one chunk — the host imports one verified Blob URL, so there must be no second
  chunk it could fetch unverified.
- **No host-owned dependency inside it.** `hostScopePlugin` rewrites `react`, `react-dom`,
  `react/jsx-runtime`, `ethers` and `@fairwins/miniapp-sdk` into shims that read
  `globalThis[Symbol.for('fairwins.miniapp.host')]`. A *subpath* of a shared package
  (`react-dom/client`, `react/jsx-dev-runtime`) is a build **error** rather than a bundled second
  copy. `generateBundle` then proves the promise: any module resolved from a shared package's
  install directory fails the build.
  A shim rather than `rollupOptions.external` because a Blob URL import has no import map — a
  leftover bare specifier could not resolve at runtime.
- **A manifest that describes the real bytes.** Digests are taken from the files **on disk** in
  `writeBundle`.

### Why host config cannot be bundled

Two independent mechanisms, and both are load-bearing:

1. `config/contracts.js` reaches `config/tenant.js`, which imports `virtual:tenant` — a module
   supplied by a Vite plugin the mini-app preset does not register. **Hard build failure.**
2. The preset sets `envPrefix` to `'__MINIAPP_NO_INLINE_ENV__'`, a prefix nothing uses, so **every
   `import.meta.env.VITE_*` read in a package compiles to `undefined`.** A bundled `NETWORKS` would
   therefore report every subgraph as absent — telling a Polygon member "this network has no
   subgraph", which is a fabricated fact, not an outage.

A hand-copied address table is worse than it looks anyway: frozen into immutable bytes, it turns a
routine redeploy into a re-publish/re-review/re-approve cycle for every installed app. Packages take
configuration from the host at runtime, and a redeploy is a host release.

### Nothing in `frontend/miniapps/` may import from `frontend/src/`

A package is built separately and frozen at an immutable CID. A bundled copy of a React context is a
**different context** — the provider the host mounted would never be found. Pure data and pure logic
may be copied (Token Mint carries its own `tokenFactoryAbi.js` and `useClipboard.js`, and says why
in its config header): no host state, no context identity, no singleton requirement.

## Publishing, end to end

### 1. Build and pin **[vendor]**

```bash
# real pin (credentials from the environment only)
export PINATA_JWT=…                     # or PINATA_API_KEY + PINATA_SECRET_KEY
node scripts/miniapps/publish.js --app token-mint

# local staging — same bytes, same verification, no pin
node scripts/miniapps/publish.js --app token-mint --dev
```

The pipeline is **build → verify digests → hash manifest → publish → re-verify → print**, and each
stage exists for a reason:

- The hash is `keccak256` of the **raw manifest bytes on disk**, never of a re-serialized object —
  re-`JSON.stringify`-ing would normalize whitespace and key order and produce a hash no host could
  reproduce. The package would build cleanly, submit cleanly, and refuse to launch everywhere.
- Nothing is printed that was not verified first, and the manifest is re-read and re-hashed from the
  published location afterwards. A vendor pays for an on-chain submission; finding the mismatch
  after is the expensive way.
- Credentials are read from the environment only, never printed, and stripped from the build
  subprocess. The script does **not** load `.env` — export the JWT yourself.
- The gateway probe is honest about the two failures it can see: a 404 or timeout is `unconfirmed`
  and non-fatal (propagation takes time); **bytes that hash differently are fatal**, and the script
  says "Do NOT submit this tuple".
- `--dev` stages to `frontend/miniapps/dist/ipfs/<cid>/…` — the literal URL shape the loader builds,
  already gitignored — with a `dev`-prefixed alphanumeric id (the loader's `CID_PATTERN` would refuse
  a hyphen). Serve that directory and point `VITE_MINIAPP_GATEWAY` at it.

Unrecognised flags fail rather than being ignored: silently dropping a mistyped `--devv` would pin a
package meant to stay local.

The script prints the exact `submitApp` / `submitUpdate` argument lists, the category ordinals, and
the sentence that matters most on an update: *the listing lands Pending; the previously approved
package keeps serving until a curator approves this one.*

### 2. Submit on-chain **[vendor]**

Through the **Submit an app** panel (`/wallet?tab=apps&view=submit`), which encodes `submitApp`,
`submitUpdate` and `updateMetadata`, checks the wallet is on the registry chain at submit time, and
pre-fetches your manifest from the configured gateways to compare its keccak against the hash you
typed. A proven mismatch is the only client-side finding that blocks submission, and then only
behind an explicit acknowledgement — everything else (CID shape, name/slug advisories) is advisory,
because the chain is authoritative and the panel is not.

All length checks in the panel are **byte** lengths, matching the contract's `bytes(name).length`.
There is no version field: `lastVersion` is private state with no getter and can exceed both live
tuples after a rejection, so the panel refuses to predict what version you will be issued.

For scripted first-party publishing there is `scripts/miniapps/submit-and-approve.js`
(`npx hardhat run … --network mordor`, driven by `MINIAPP_CID`, `MINIAPP_MANIFEST_HASH`,
`MINIAPP_NAME`, `MINIAPP_DESCRIPTION`, `MINIAPP_CATEGORY`, `MINIAPP_APPROVE`). It fetches the
manifest, hashes the raw wire bytes, aborts on a mismatch, and — when approving — re-reads
`getApp(id).proposed.manifestHash` immediately before the call and passes **the hash it actually
saw**, never the one it was told to expect.

### 3. Curator review **[host]**

AdminPanel → Compliance → **Mini-App Review** (`miniapp-review`), offered when
`readCuratorAuthority()` reports `held` — and to `DEFAULT_ADMIN_ROLE` as well, for transparency, but
read-only. Authority is asked of the registry itself (`hasRole(APP_CURATOR_ROLE, account)`) and never
derived from app-wide role flags — the curator role administers itself, so `DEFAULT_ADMIN_ROLE`
implies nothing, and every decision control is separately gated on `isCurator && onRegistryChain`
rather than on having reached the tab. The read has five outcomes (`not-deployed`, `no-account`,
`unverified`, `held`, `not-held`) and an unread registry never renders as "you are not a curator".

The tab reads the queue with `fetchCatalog({ force: true })` — a memo would hide a just-filed
submission — and per record offers verification before any decision:

`verifyMiniAppPackage({ cid, manifestHash })` runs the **same fetch-and-verify path as a launch**,
with `verifyAllDeclaredFiles: true`, and **never imports anything** — no Blob, entry bytes discarded.
It takes a tuple rather than a record, because a proposed tuple is by definition not launchable. It
returns an outcome and never throws. The gate on the approve button:

| Verification | Approve |
|---|---|
| not run | not offered |
| `ok` | allowed |
| `VERIFICATION_FAILURE.INTEGRITY` | **blocked, no override** — this is a proven disagreement between the bytes and the hash |
| gateway / manifest / host-api / unexpected | allowed behind an explicit acknowledgement — a gateway outage must not make approval impossible |

Verification state is keyed by **manifest hash**, not record id, so a replaced package silently
invalidates a stale verification. `StaleProposal` is a first-class outcome: decoded, shown as a
readable sentence, and it clears the verification, the acknowledgement and any confirmation before
forcing a refresh. Every successful decision writes a ledger entry keyed on the tx hash and
attributed to `app-<chainId>-<id>` — the immutable id, never the display name.

### 4. Launchable

Once `approveApp` lands, `launchable` is true and the app appears in the catalog
(`/wallet?tab=apps`) and at `/apps/<slug>`. The slug is derived from the folded registry name
(`appSlug`), and is `null` — catalogued but not URL-launchable, with the surface saying so — when the
folded name is empty, already contains a hyphen (injectivity), or fails a round-trip check.

### Published today

Both cohorts carry the same two first-party packages at v1.0.0, Approved and `launchable`.

**Polygon 137** (`appCount() == 2`) — published 2026-08-02:

| App | Id | CID | Manifest hash |
|---|---|---|---|
| Token Mint | 1 | `bafybeiacl6rrcqxt55gpkguekpa3uinzfbfyzigp4mrzzeek6gnlx433bq` | `0x5ec326f6…8c8b19ad` |
| ClearPath | 2 | `bafybeiglnxswaxkdpvno6w7srohlcvc3clzqcydzu2umjomlga4i4jefia` | `0x7e511007…81caefdb` |

**Mordor 63** (`appCount() == 3`):

| App | Id | Status | CID |
|---|---|---|---|
| `Smoke 1785602984210` | 1 | **Suspended** | `bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku` |
| Token Mint | 2 | Approved | `bafybeiacl6rrcqxt55gpkguekpa3uinzfbfyzigp4mrzzeek6gnlx433bq` |
| ClearPath | 3 | Approved | `bafybeiglnxswaxkdpvno6w7srohlcvc3clzqcydzu2umjomlga4i4jefia` |

The ids differ between cohorts because ids are per-registry and Mordor was written to first — never
address a package by id across chains; resolve by name (`idByName`) or slug.

**Mordor id 1 is a deploy smoke test, not a product**, and it is listed here rather than quietly
omitted. It was left Approved and `launchable` while its CID serves no `manifest.json`, so for a
while every testnet member saw a catalog card that could only ever fail at the gateway. It was
suspended on 2026-08-02; the record itself is permanent, because names are never released and
deprecation is terminal. That permanence is exactly why **no equivalent smoke write was made on
Polygon** — and why the Polygon catalog above contains only real products.

## Integrity and serving

The launch path, in order — the order *is* the security property:

1. **Registry read, every mount, straight to the chain.** `fetchAppBySlug` never consults the
   catalog memo (FR-010). A cached listing can never authorise an execution.
2. **`launchable` only.** `approvedPackageRef` reads `record.launchable`, falls back to
   `status === Approved` only when `launchable` is not a boolean, and refuses an absent decision
   exactly like a negative one. `record.proposed` is never read here — no branch can select it.
   `status` is read afterwards *only to explain* a refusal (`suspended` / `deprecated` /
   `never-approved`).
3. **Fetch the manifest** from the configured gateways in order, with per-attempt timeout
   (`GATEWAY_TIMEOUT_MS = 15_000`), `credentials: 'omit'`, and a size ceiling
   (`MAX_MANIFEST_BYTES = 64 KB`, `MAX_FILE_BYTES = 8 MB`) checked before and after the read.
4. **`verifyManifestBytes` before parsing.** keccak256 of the received bytes against the registry's
   `manifestHash`. A malformed or zero expected hash is a **refusal**, not a pass.
5. **Parse and check identity** — `manifest.id` must equal the slug that asked for it.
6. **Per-file SHA-256.** Entry, then styles; `manifestFileDigest` gates *what may be fetched at all*,
   so an unlisted path is never requested.
7. **Only now, a Blob.** `URL.createObjectURL(new Blob([entryBytes], { type: 'text/javascript' }))`,
   dynamic `import()`, `revokeObjectURL` in a `finally`. This is the one place in the codebase that
   mints a Blob URL for execution. A default export that is not a function is refused.

Refusal policy: **unreachable ⇒ fail over; tampered ⇒ stop** (a hash mismatch is never retried
against another gateway); **unverifiable ⇒ never fetched**; **cancelled ⇒ `LoadCancelledError`**,
never an availability error. An `IntegrityError` writes `miniapp_integrity_failed` before the
refusal renders.

Styles are wrapped in `@scope (#<rootId>) { … }` and a sheet whose braces do not balance is dropped
rather than injected — a dropped sheet never blocks a launch.

### CSP

`frontend/nginx.conf` and `frontend/nginx.conf.template` carry, identically:

```
script-src 'self' 'unsafe-inline' blob: https://*.cloudflareinsights.com
```

`blob:` is the whole of the spec-073 CSP change. Packages travel as **bytes over `connect-src`**
(which already carries spec 069's scheme-wide `https:` grant for member-supplied RPC endpoints) and
become executable only as a Blob the app itself minted after verification. `https:` in `script-src`
— any origin may serve executable code — was the rejected alternative, and remains the line.
`frontend/src/test/nginxCspScriptSrc.test.js` gates both files and asserts they stay in sync.

### The service worker cache is not a trust boundary

`fairwins-miniapp-packages-v1`, cache-first (CIDs are immutable), bounded to 60 entries by an LRU
index stored *inside* the cache at an RFC 2606 `.invalid` host so it can never collide with a real
gateway URL. Package URLs are classified by **shape** (`/ipfs/<cid>/<path>`, ≥3 segments), not by a
gateway allowlist, because members bring their own nodes.

The cache can neither execute poisoned bytes nor resurrect a suspended app: after **every**
retrieval, cached or not, the loader re-checks keccak(manifest bytes) against the chain and the
SHA-256 of every byte it is about to execute or inject — the entry and the declared stylesheets.
Every launch re-reads the registry first.

Be precise about the scope, because it is narrower than "every file in the manifest" and
deliberately so: a launch does not fetch files it will not use (`verifyAllDeclaredFiles` is `false`
in `fetchVerifiedPackage`), since downloading unused assets would slow every launch and could refuse
one over a file the host never runs. A curator review passes `true` and checks the whole package —
"do the per-file digests match?" is a question about the package, not about the subset this host
happens to execute. The invariant either way is that **nothing unverified ever runs**, not that
everything declared is downloaded.

## hostApi versioning

`SUPPORTED_HOST_API = 2` (`frontend/src/lib/miniapps/manifest.js`), re-exported as
`HOST_API_VERSION` from `hostScope.js` — derived, never restated.

```js
export function isHostApiSupported(hostApi) {
  return Number.isInteger(hostApi) && hostApi >= 1 && hostApi <= HOST_API_VERSION
}
```

**Older contracts stay supported.** A package built against `hostApi: 1` keeps running on a v2 host;
only a package declaring a version **newer** than the host is refused, with `HostApiError` and a
version message, because it expects capabilities that do not exist and would fail somewhere the
member cannot diagnose.

What a bump costs, and therefore when to spend one:

- **Additive changes bump the version and break nothing.** hostApi 2 added `contracts`, `network`,
  `networks`, `wallet.switchChain` and `SubmitResult.wait()`. Existing v1 packages neither know nor
  care.
- **A removal or a semantic change cannot be shipped this way at all.** Every published package is
  frozen at an immutable CID; there is no way to patch one. Removing a key would break approved apps
  with no remedy short of every vendor re-publishing and every re-publish being re-reviewed. Treat
  `host` as append-only in practice.
- **Every new key is a permanent grant to every package that will ever be approved.** That is the
  bar a proposal has to clear; `networks()` was declined once against it before ClearPath made the
  case.

Changing hostApi touches, at minimum: `manifest.js` (`SUPPORTED_HOST_API`),
`tools/miniapp-build/constants.js` (`HOST_API_VERSION` — the preset is Node tooling and duplicates
the rules by necessity; `frontend/src/test/miniapps/buildPreset.test.js` asserts they agree),
`specs/073-miniapp-platform/contracts/host-context.md`, this guide, and the template repo's vendored
copies.

## Starting a package **[vendor]**

<https://github.com/chippr-robotics/chippr-miniapp-template> — public, Apache-2.0, a GitHub template
repository. `npm install && npm test && npm run build && npm run verify` works from a clean clone.

It **vendors** `tools/miniapp-build/` as a mirrored copy, because the preset is not published to npm
and a template whose build does not run is not a starting point. `tools/miniapp-build/VENDORED.md`
records the upstream commit. Drift fails loudly rather than silently — the host refuses an unknown
`schema`, an unknown permission, or a `hostApi` newer than it supports — but **re-copy the preset and
bump `VENDORED.md` whenever it changes materially.**

Also worth knowing:

- `src/__tests__/_host.jsx` is a stub host deliberately **as strict as the real one**: it throws for
  undeclared contract names, returns `null` for unknown chains, and keeps `wait()` non-enumerable. A
  permissive stub lets a developer ship code the real host refuses. Two traps came out of the
  ClearPath conversion, one on each side of that line: a stub that returned a fresh object per call
  where the real code returns from a static map turned it into a changing effect dependency and
  OOM'd two suites at 6 GB, presenting as a hang — and chasing that exposed a genuine host bug,
  `readProvider()` minting a fresh guard Proxy per call, fixed with the `WeakMap` described above.
- `src/testing/miniapp-sdk.js` is the test-time stand-in that `vitest.config.js` aliases
  `@fairwins/miniapp-sdk` to. It is never shipped; the preset externalises the real specifier. (In
  this repo the equivalent alias is `frontend/src/lib/miniapps/sdkTestShim.js`, wired in
  `frontend/vite.config.js` for Vitest only, and it re-exports the *real* `useMiniAppHost`.)
- `scripts/verify-package.js` checks a build the way the host will and prints the `manifestHash`; it
  also catches an emitted-but-unlisted file, which a digest check alone cannot see.
- `docs/HOST-CONTRACT.md` is a copy of `specs/073-miniapp-platform/contracts/host-context.md` —
  re-copy it whenever hostApi changes.

## Why Wagers is not a mini-app

It was planned as the third conversion and was cut during implementation (the FR-030 amendment in
`spec.md`; tasks T030–T033).

Scoping measured **69% of the `/wagers` file closure — 22 of 32 files at the time — as shared** with
the host-retained home and trade surfaces: the wager list (`WagerTable`), `wagerVm`,
`wagerCardHelpers`, and the create/accept/resolve flows, because `HomeScreen`, which `App.jsx`
renders at `/`, is itself a wager surface. A package may not import from `frontend/src/` and is
frozen at an immutable CID, so converting would mean the host and the package each carrying their
own copy of those files: two
edits and a re-publish for every wager fix, with guaranteed drift. That is a worse outcome for
members than not converting.

Wagers moved into **Finance ▸ Transfer** as a third view beside Transfer and Bridge — the three ways
money leaves that section (`WAGERS_VIEW` / `WAGERS_PATH` in `frontend/src/config/appNav.js`, rendered
by `PayTransferPanel.jsx`). `/wagers` redirects there; `WagersPage.jsx` is gone. **The catalog never
lists Wagers**, because listing a package that does not exist would be the catalog lying about
absence.

The general lesson for future conversions: a feature is a good package candidate when its file
closure is *its own*. Shared UI is the disqualifier, not size.

## Configuration and environment

| Variable | Side | Purpose |
|---|---|---|
| `VITE_MINIAPP_GATEWAY` | frontend | comma-separated gateway bases, ordered ahead of `IPFS_GATEWAY` from `constants/ipfs.js`. Read at call time, not module load. `https:` only, plus `http:` on `localhost`/`127.0.0.1` |
| `MINIAPP_MIN_TIER` | deploy | vendor membership floor, default `2` (Silver) |
| `PINATA_JWT`, or `PINATA_API_KEY` + `PINATA_SECRET_KEY` | publish | pinning credentials; env only, never printed, stripped from the build subprocess |
| `MINIAPP_CID`, `MINIAPP_MANIFEST_HASH`, `MINIAPP_NAME`, `MINIAPP_DESCRIPTION`, `MINIAPP_CATEGORY`, `MINIAPP_APPROVE` | script | `submit-and-approve.js` |

Deploy:

```bash
npx hardhat run scripts/deploy/deploy-miniapp-registry.js --network <mordor|polygon>
npm run sync:frontend-contracts
npm run check:storage-layout      # the miniAppRegistry pair is registered
```

The deploy script **appends** to an existing deployment record and aborts if `miniAppRegistry` is
already present, directing you to an in-place upgrade instead. It wires that network's recorded
`membershipManager` (on `WAGER_PARTICIPANT_ROLE`) and `sanctionsGuard`, seeds the deployer as first
curator, and prints the handover sequence.

## Testing

```bash
# contracts
npx hardhat test test/miniAppRegistry.test.js test/upgradeable/MiniAppRegistry.upgrade.test.js
npm run check:storage-layout

# frontend — scope local runs; the full suite OOMs this environment
cd frontend
npx vitest run src/test/miniapps/
npx vitest run src/test/ledger/ src/test/nginxCspScriptSrc.test.js src/test/networks.miniapps.test.js
```

`src/test/miniapps/` covers the loader (against real built-and-hashed tamper fixtures), integrity,
manifest, store isolation, the registry client, curator authority, slug folding, the build preset's
agreement with the frontend validator, the SW cache policy as pure functions, and the four surfaces
(catalog, workspace, submit, review).
`src/test/networks.miniapps.test.js` pins the reference chain: whichever chain `miniAppChainId()`
resolves to must carry a `miniAppRegistry` address, for every build chain in either cohort.

End-to-end validation, including the tamper, suspension and update-honesty scenarios:
[`specs/073-miniapp-platform/quickstart.md`](../../specs/073-miniapp-platform/quickstart.md).

## Not done yet

Stated plainly rather than implied (`specs/073-miniapp-platform/tasks.md` §Phase 9):

- **T045** — both halves are now written (this guide and
  [`docs/runbooks/miniapp-registry-operations.md`](../runbooks/miniapp-registry-operations.md)), but
  `tasks.md` still carries the task unchecked.
- **T047** — the accessibility pass over the Catalog / Workspace / Review surfaces (axe + Lighthouse,
  WCAG 2.1 AA).
- **T048** — the contract security review over `contracts/apps/` and
  `contracts/interfaces/IMiniAppRegistry.sol`. Adversarial review has run and its findings landed
  (the content-committed approval among them); the formal agent review has not.
- **T049** — full-suite gates and an end-to-end quickstart run.
- **Role handover** — curator/admin/upgrader are still on one deployer EOA on both networks.
- **Mordor id 1** — the deploy smoke listing is Approved, `launchable` and unfetchable, so it sits
  in the testnet catalog as a card that always fails to launch. It needs `suspendApp(1)`.
- Known, accepted, unfixed: name reservations are permanently unreclaimable, there is no
  vendor-address rotation, no global kill switch or batch suspension, and `appIdsByVendor` is
  unbounded.

## Related

- Specs: [`specs/073-miniapp-platform/`](../../specs/073-miniapp-platform/) — `spec.md`, `plan.md`,
  `research.md` (decisions R1–R12), `data-model.md`, `contracts/host-context.md`, `quickstart.md`
- [`../runbooks/miniapp-registry-operations.md`](../runbooks/miniapp-registry-operations.md) — the
  operator side: curator procedures, live cohort state, gateways, diagnostics, upgrades
- [`upgradeable-contracts.md`](./upgradeable-contracts.md) — the UUPS rules the registry follows
- [`network-endpoints.md`](./network-endpoints.md) — spec 069, what `host.readProvider` resolves
- [`passkey-accounts.md`](./passkey-accounts.md) — the second write rail `wallet.submit` chooses
- [`white-label-tenants.md`](./white-label-tenants.md) — `virtual:tenant`, and why the Apps section
  is feature-gated per tenant
- [`activity-ledger.md`](./activity-ledger.md) — the ledger the `miniapp` class writes into
