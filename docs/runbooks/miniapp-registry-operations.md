# Runbook: Mini-App Registry operations (spec 073)

Operating the `MiniAppRegistry` — the on-chain catalog and curation authority for the Apps
section. Design background: [miniapps.md](../developer-guide/miniapps.md).

The registry decides **which third-party code a member's browser executes**. That is the whole
of its job, and it is why every procedure below is written to fail closed. A curator's approval
is not a listing decision; it is the platform saying "run this".

> **What it is.** One UUPS proxy per cohort (`UUPSManaged`), holding no funds. Each record
> carries up to two package tuples — `approved` (the only one ever served) and `proposed` (an
> update awaiting review) — plus metadata and a lifecycle `status`. Vendor eligibility is a
> membership tier gate; curation is `APP_CURATOR_ROLE`, which **administers itself**.

## What operators can and cannot do

**Can**: approve, reject, suspend and deprecate listings; grant and revoke curation (as a
curator); change the vendor gate and sanctions guard (as admin); deploy and upgrade the
registry.

**Cannot**: edit a vendor's metadata or package, un-deprecate anything, delete a record, free a
name once used (only its vendor can, by renaming its own listing), take a package off IPFS, or
reach into a member's mini-app data. There is also
**no global kill switch and no batch suspension** — taking N apps offline is N transactions.

---

## 1. Where the registry lives, and confirming it before you write

One registry per environment cohort, resolved by `miniAppChainId()`
(`frontend/src/config/networks.js`). The cohort follows the build's network
(`VITE_NETWORK_ID`): a mainnet build curates on Polygon, a testnet build on Mordor.

| Cohort | Chain | `miniAppRegistry` | `miniAppRegistryImpl` | deployBlock |
|---|---|---|---|---|
| mainnet | **Polygon 137** | `0x5a168Cc9FeFaf40e7BC536C8C61669e6d547A0A2` | `0x41858006aD6dd0788b84F9fb17A28d8167C7b331` | 91265680 |
| testnet | **Mordor 63** | `0xFEd626025225A3B1aB3BA72D429B8c9C74cb5058` | `0xc8Dd8601b35aDa3AF367C9E41f24Fd0503Ced674` | 16685064 |

Recorded in `deployments/polygon-chain137-v2.json` and `deployments/mordor-chain63-v2.json`.

**Amoy is deliberately not a deployment target**, which is why the testnet registry chain does
not derive from `TESTNET_CHAIN_ID`. Amoy and hardhat do carry an empty `miniAppRegistry` in
`frontend/src/config/contracts.js`, but nothing reads those entries: `miniAppChainId()` sends
*every* testnet build — Amoy and local Hardhat included — to Mordor, so those builds curate and
launch against the Mordor registry rather than reporting the Apps section absent.

### Confirm the chain before every write

Reads are always against the cohort's registry chain regardless of where your wallet is. Writes
are not — and the wrong chain is the one mistake here that cannot be fully undone, because a
record can never be deleted. It leaves a permanent junk listing on that registry. (The *name* is
recoverable: its vendor can vacate the key by renaming the listing — `updateMetadata` frees the
old name — but only before the record is deprecated.)

- **In the console** (`/admin` → Compliance → **Mini-App Review**): every control names the
  chain — *"Approve v1 on Polygon"*, *"…recorded on the mini-app registry on Ethereum Classic
  Mordor"*. If your wallet is elsewhere the tab says so and disables the decision buttons; it
  re-checks `chainId` at click time, not just at render.
- **From a terminal**, read the address you are about to write to out of the deployment record
  rather than pasting one:
  ```bash
  npx hardhat console --network polygon
  > const rec = require('./deployments/polygon-chain137-v2.json')
  > const reg = await ethers.getContractAt('MiniAppRegistry', rec.contracts.miniAppRegistry)
  > await reg.appCount()
  ```

### Verified live state — 2026-08-02

Read directly from both chains while writing this runbook; re-check with the snippet above
rather than trusting the date.

| | Polygon 137 | Mordor 63 |
|---|---|---|
| `appCount()` | **0** — nothing listed | 3 |
| `minTier()` | 2 (Silver) | 2 (Silver) |
| `membershipManager()` | `0xEfd1a880…D557a` | `0x68bCBA10…5d541` |
| `membershipRole()` | `WAGER_PARTICIPANT_ROLE` | `WAGER_PARTICIPANT_ROLE` |
| `sanctionsGuard()` | `0x2Dc53d91…7BC76` | `0xdF41355d…C13B3` |
| curator / admin / upgrader | all three on `0x52502d049571C7893447b86c4d8B38e6184bF6e1` | all three on the same EOA |
| `getRoleAdmin(APP_CURATOR_ROLE)` | itself | itself |

Mordor's three listings:

| id | name | status | launchable | package |
|---|---|---|---|---|
| 1 | `Smoke 1785602984210` | Approved | yes | `bafybeihdwd…vyku` on-chain v2 — **a deploy smoke test (its on-chain description is literally "post-deploy verification", submitted 68s after the deploy block); its CID has no `manifest.json` (gateway 404)** |
| 2 | Token Mint | Approved | yes | `bafybeiacl6…33bq` on-chain v1 (manifest `1.0.0`, `hostApi` 2) |
| 3 | ClearPath | Approved | yes | `bafybeiglnx…efia` on-chain v1 (manifest `1.0.0`, `hostApi` 2) |

**Action item:** id 1 is exactly the failure mode this runbook warns about below — Approved,
`launchable`, and unfetchable. Every testnet member sees it in the catalog and any launch fails
at the gateway. Suspend it (`suspendApp(1)`); deprecate only if you accept that the name is then
reserved forever, which for a junk name is fine.

---

## 2. Reviewing a submission

The queue is `/admin` → Compliance → **Mini-App Review**. It reads
`fetchCatalog({ force: true })` every time — never a cache, because a memo would hide a
submission filed a minute ago — and splits records into *awaiting a decision* and *settled*.
Reading works from any chain; only writing needs the wallet on the registry chain.

### 2.1 Verify the package before you approve it

Press **Verify proposed package**. This runs `verifyMiniAppPackage()`
(`frontend/src/lib/miniapps/loader.js`) — the same fetch-and-hash chain the member's host runs at
launch, plus a check of **every** file the manifest declares, and with the execution step removed:
there is no `importImpl` parameter on that path, no Blob is minted, and the entry bytes are
discarded. Verifying a package never runs it.

The result gates the approve button:

| Verification | Approve button | Why |
|---|---|---|
| not run | withheld | "Verify the package before approving it." |
| `ok` | offered | The bytes at that CID hash to the hash on the record. |
| `integrity` | **blocked, no override** | Proven disagreement: nothing could ever launch from this tuple, so approving it would record a lie. Ask the vendor to re-publish and submit again. |
| `gateway` / `manifest` / `host_api` / `unexpected` | offered behind an explicit checkbox | "We could not establish that", not "it is wrong". A gateway outage must not make approvals impossible — but you say so on the record. |

Verification state is keyed by **manifest hash**, not record id: if the vendor replaces the
package, your verification and your acknowledgement silently stop applying.

### 2.2 The approval call

```solidity
approveApp(uint256 id, bytes32 expectedManifestHash)
```

The hash is the tuple the contract is about to serve — the **proposed** tuple when one is
present, otherwise the retained **approved** tuple (which is how a suspended app is reinstated).
The console mirrors that choice for you (`decisionTuple`); if you are calling by hand, read it
immediately before you send:

```bash
npx hardhat console --network mordor
> const rec = require('./deployments/mordor-chain63-v2.json')
> const reg = await ethers.getContractAt('MiniAppRegistry', rec.contracts.miniAppRegistry)
> const app = await reg.getApp(2)
> const h = app.proposed.cid !== '' ? app.proposed.manifestHash : app.approved.manifestHash
> await (await reg.approveApp(2, h)).wait()
```

**There is no `approveApp(id)` overload, and one must never be added.** Adversarial review found
that reading the proposed tuple at execution time let a vendor swap the package after review —
by front-running the approval, or inside a multisig signing window — and have unreviewed code
marked Approved. The host's integrity chain cannot catch that: the substituted manifest hashes
correctly against itself. The hash is compared before any state changes; a moved tuple reverts
`StaleProposal(expected, actual)`.

`StaleProposal` is a first-class outcome in the console, not an error toast: it decodes the two
hashes, tells you the vendor replaced the package, clears your verification and acknowledgement,
and re-reads the record. **Review the new package from the start.** Do not re-send with the new
hash because the transaction "just needs the current value" — that is the attack succeeding
politely.

### 2.3 When the package cannot be fetched

`gateway` verification failure, or `all_gateways_failed`. Before deciding, establish whether the
problem is the package or the gateway — the distinction is the whole judgement:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://gateway.pinata.cloud/ipfs/<cid>/manifest.json
curl -s https://gateway.pinata.cloud/ipfs/<cid>/manifest.json | sha256sum   # does anything come back at all
```

- **Other packages verify fine, this one 404s** → the vendor's pin has not propagated or was
  never pinned. Leave it Pending and tell them. Approving it produces a listing that is Approved
  and unlaunchable, and the failure then surfaces to every member instead of to you.
- **Nothing verifies** → the gateway is down (§5). Wait. If a decision genuinely cannot wait,
  the acknowledgement checkbox exists for that, and it is recorded.

Never approve an unfetchable package to "unblock the vendor". Rejection costs them a
resubmission; a bad approval costs the catalog its meaning.

### 2.4 When the hash does not match

`integrity` — the bytes served under that CID do not hash to the manifest hash on the record.
This is not a network condition and does not clear by retrying. The registry stores
`keccak256(manifest.json bytes)`, and the usual innocent cause is a vendor who re-serialized the
manifest instead of hashing the file on disk (`scripts/miniapps/publish.js` exists precisely so
that cannot happen). The malicious cause is a gateway serving different content under a CID.

Either way: **do not approve, and there is no override.** Tell the vendor to re-run
`node scripts/miniapps/publish.js --app <appId>` and submit the tuple it prints. If the CID was
already approved and now serves different bytes, that is a supply-chain incident — suspend the
app first (§4), then investigate.

### 2.5 Rejecting

```solidity
rejectProposal(uint256 id, bytes32 expectedManifestHash)
```

Same anti-swap guard as approval. It discards the proposed tuple **only**: any previously
approved package keeps serving and the vendor can submit again. Use it instead of suspension for
a bad update to a good app. Without it, a refused package just stays queued and gets promoted by
the next approval.

---

## 3. The update path — a Pending record can be live

**`launchable` is the serving decision. `status` is the review state.** They are different
questions and the registry answers the first one directly (`isLaunchable(id)`, and
`AppView.launchable` on every read).

When a vendor calls `submitUpdate`, the record goes to Pending and the **approved tuple is not
touched**. So a Pending record with a prior approval is a **live app whose update is in review**,
and members keep launching the old version until you promote the new one. The same applies to a
metadata edit: it forces Pending without disturbing what is being served.

Operational consequences, all of which have bitten someone somewhere:

- **A Pending queue is not an outage queue.** Most Pending records are serving members right now.
  Nothing is down while you take your time; take it.
- **Suspending is not "reject".** Suspension takes the *live* app offline. If your objection is
  to the new package, use `rejectProposal` — the app stays up.
- **You cannot approve "the app".** Approval names a package. If a record has been sitting in the
  queue, re-verify before deciding: the tuple you looked at yesterday may not be on-chain today,
  and `StaleProposal` will tell you so.
- **Never gate serving on `status === Approved`** anywhere in code or tooling. Any vendor could
  then take their own live app offline by submitting anything at all.

---

## 4. Suspend, reinstate, deprecate

All three are curator-only and take effect the moment the transaction mines. `suspendApp` and
`deprecateApp` take only an id; reinstatement is `approveApp`, so it names a hash like any other
approval.

| Action | Record | Catalog | A member who tries to launch |
|---|---|---|---|
| `suspendApp(id)` | `status = Suspended`, `launchable = false`; both tuples retained | entry disappears | *"This app is suspended … none of its package was downloaded. Anything you saved in it is untouched."* |
| `approveApp(id, hash)` on a suspended record | reinstates the retained approved tuple, `status = Approved` | reappears | launches the previously approved package |
| `deprecateApp(id)` | `status = Deprecated`, **terminal**; proposed cleared, approved and the **name reservation** kept | gone permanently | *"This app has been retired … the app itself will not return."* |

Notes that matter in the moment:

- **Suspension reaches Pending records too.** A vendor cannot shield a live package from a
  curator by keeping an update open.
- **Suspension is the reversible lever. Reach for it first.** Reinstatement is `approveApp` with
  the retained approved tuple's hash — the console labels that button **Reinstate**.
- **Deprecation cannot be undone by anyone, including an upgrade of your intent.** The record
  accepts no further lifecycle changes and the name stays reserved so nobody can take the app's
  identity. The console makes it a two-step confirmation that says so in words.
- **Member data survives both.** The per-app store is namespaced client-side and is never touched
  by a lifecycle action.
- **A mounted session is not force-unmounted.** The check happens at launch: a member already
  inside the app when you suspend it keeps that mounted instance until they navigate or reload.
  If you need someone out of an app *now*, tell them; the registry cannot.

---

## 5. Gateways

### How the list is resolved

`resolveMiniAppGateways()` (`frontend/src/lib/miniapps/loader.js`), read at call time:

1. `VITE_MINIAPP_GATEWAY` — one or more bases, comma-separated;
2. then `IPFS_GATEWAY` (`VITE_IPFS_GATEWAY` → `VITE_PINATA_GATEWAY` → `https://gateway.pinata.cloud`).

Duplicates collapse, trailing slashes are stripped, and only `https:` survives — plus `http:` on
`localhost` / `127.0.0.1` for a dev gateway. Anything else is dropped silently, so an `http://`
corporate gateway is not "misconfigured", it is absent.

### The state of it today

**`VITE_MINIAPP_GATEWAY` is not plumbed into the production image.** The root `Dockerfile` and
`cloudbuild.yaml` declare no build arg for it, so the deployed SPA resolves exactly one gateway:
`https://gateway.pinata.cloud`, from `VITE_IPFS_GATEWAY`. Failover is implemented and tested; in
production it currently has nothing to fail over to.

Adding a second gateway is a build change, not a config change: add `ARG`/`ENV
VITE_MINIAPP_GATEWAY` to `Dockerfile` (and `frontend/Dockerfile` for the standalone image), pass
`--build-arg VITE_MINIAPP_GATEWAY=…` in `cloudbuild.yaml`, and rebuild. Vite inlines `VITE_*` at
build time — setting it as a Cloud Run runtime variable does nothing.

CSP is already permissive enough: packages travel over `connect-src`, which carries the
scheme-wide `https:` grant from spec 069. A new gateway host needs no CSP edit.

### What an outage looks like — and what it does not

| | Gateway outage | Integrity failure |
|---|---|---|
| Member sees | *"The app package could not be downloaded — every configured gateway is unreachable. Check your network or VPN connection and try again."* | *"This app package does not match the version approved on-chain, so it was not run. Nothing from it was executed. Please report this to the platform team."* |
| Retry offered | yes | no |
| Scope | every app at once | one package |
| Clears by itself | yes | never |
| Ledger | — | `miniapp_integrity_failed` |

**Do not treat these as the same report.** One is availability and resolves; the other means the
bytes behind an approved CID changed, which is a supply-chain event. If a member reports the
integrity wording for an app that used to work, suspend it before you finish reading the ticket.

The loader's rule, worth knowing when you read a bug report: *unreachable ⇒ fail over; tampered ⇒
stop.* A hash mismatch is never retried against another gateway, because a second opinion on
tampered bytes is not a second opinion.

---

## 6. Curator role: granting, revoking, and the handoff

`APP_CURATOR_ROLE` = `0xc242262718134333007a37a2e61483e7143f44e0144fb041a7006aa0eb456392`.

**The role administers itself** (`_setRoleAdmin(APP_CURATOR_ROLE, APP_CURATOR_ROLE)`), verified
on both chains. Three consequences:

1. `DEFAULT_ADMIN_ROLE` **cannot** grant curation. An administrator who could grant itself
   curation would make the trust boundary decorative.
2. Only an existing curator can add or remove one.
3. **If the last curator renounces or is lost, curation is unrecoverable short of a UUPS
   upgrade.** There is no other path.

Grant and revoke from a curator key. There is no script and no admin-panel control for this:

```bash
npx hardhat console --network polygon
> const rec = require('./deployments/polygon-chain137-v2.json')
> const reg = await ethers.getContractAt('MiniAppRegistry', rec.contracts.miniAppRegistry)
> const CURATOR = await reg.APP_CURATOR_ROLE()
> await (await reg.grantRole(CURATOR, '<new curator>')).wait()
> await reg.hasRole(CURATOR, '<new curator>')     // confirm from the chain, not from the receipt
> await (await reg.revokeRole(CURATOR, '<old curator>')).wait()
```

The console reads this same authority per-account (`readCuratorAuthority`) and distinguishes
*"you do not hold the role"* from *"we could not ask"* — during an RPC outage it withholds the
controls and says the question could not be put, rather than telling a curator their grant never
landed.

### Handoff status: not done

**All three roles — `APP_CURATOR_ROLE`, `DEFAULT_ADMIN_ROLE`, `UPGRADER_ROLE` — are still on the
deployer EOA `0x52502d049571C7893447b86c4d8B38e6184bF6e1` on both Polygon and Mordor**
(verified 2026-08-02). Until they move, the curation trust boundary is not real: `UPGRADER_ROLE`
is a strict superset of curation, since an upgrader can install logic that marks anything
Approved without emitting a lifecycle event.

The deploy script prints the exact sequence; the general procedure and its hazards are
[admin-role-handoff.md](./admin-role-handoff.md). The order is not stylistic:

```
grantRole(APP_CURATOR_ROLE, <multisig>)      # from the deployer — nobody else can
grantRole(DEFAULT_ADMIN_ROLE, <multisig>)
grantRole(UPGRADER_ROLE,     <timelock>)
# verify each grant by reading hasRole from the chain, then:
renounceRole(APP_CURATOR_ROLE, deployer)
renounceRole(UPGRADER_ROLE,    deployer)
renounceRole(DEFAULT_ADMIN_ROLE, deployer)   # LAST
```

Confirm the multisig's **curator** grant landed before renouncing anything. Once the deployer
holds no curator role it can never grant one again.

---

## 7. Publishing and listing a first-party package

Operator-side, for packages the platform ships itself (`frontend/miniapps/token-mint`,
`frontend/miniapps/clearpath`).

```bash
export PINATA_JWT=…                 # publish.js does NOT read .env — export it yourself
node scripts/miniapps/publish.js --app token-mint          # build → verify digests → hash → pin → re-verify
node scripts/miniapps/publish.js --app token-mint --dev    # same pipeline, staged locally, nothing pinned
```

It prints a copyable `{appId, cid, manifestHash, version, entry}` block plus the exact
`submitApp` / `submitUpdate` arguments and the category ordinals. Two of its behaviours are
worth knowing when it fails on you:

- It re-reads the manifest **from the gateway** after pinning and re-hashes it. A 404 there is
  reported as `unconfirmed` (ordinary propagation). Bytes that hash differently are **fatal** —
  it refuses to print a submission block and says "Do NOT submit this tuple".
- Credentials are checked before the build, and scrubbed from the build subprocess. A published
  package is public bytes served to every member; nothing from the build environment is inlined
  into it.

Then list and approve:

```bash
MINIAPP_CID=<cid> \
MINIAPP_MANIFEST_HASH=<0x…> \
MINIAPP_NAME="Token Mint" \
MINIAPP_CATEGORY=2 \
MINIAPP_APPROVE=1 \
npx hardhat run scripts/miniapps/submit-and-approve.js --network mordor
```

It fetches the manifest from a public gateway (Pinata, then ipfs.io, then cloudflare-ipfs.com)
and aborts unless the wire bytes hash to `MINIAPP_MANIFEST_HASH`; calls `submitApp` or
`submitUpdate` by `idByName`; and — with `MINIAPP_APPROVE=1` — checks `hasRole(APP_CURATOR_ROLE,
signer)` and re-reads `getApp(id).proposed.manifestHash` immediately before approving. If that
re-read does **not** equal `MINIAPP_MANIFEST_HASH` it refuses outright (`proposed tuple moved …
refusing to approve`) rather than approving whatever is now on the record. Omit
`MINIAPP_APPROVE` to leave the listing Pending for a separate reviewer, which is the right shape
once curation is on a multisig.

Categories: `0` TradeSettlement · `1` Reconciliation · `2` TreasuryLiquidity ·
`3` IdentityCompliance · `4` AssetServicing · `5` ReportingAudit.

Statuses: `0` Pending · `1` Approved · `2` Suspended · `3` Deprecated.

---

## 8. Known blockers

### Polygon publication is blocked on membership, not code

`submitApp` on Polygon reverts `InsufficientMembershipTier` (`0xb83f500d`) for the operator key.
The registry's vendor floor is **Silver (tier 2)** and `0x52502d…F6e1` holds **tier 0** on
Polygon's MembershipManager `0xEfd1a880…D557a` (it holds Silver on Mordor). The gate is working
exactly as designed.

Confirm before doing anything:

```bash
npx hardhat console --network polygon
> const mm = await ethers.getContractAt('MembershipManager', '0xEfd1a880c6BfBf38A661A3F5fF6d5ECB296D557a')
> await mm.getActiveTier('<vendor>', ethers.id('WAGER_PARTICIPANT_ROLE'))   // 0 None … 4 Platinum
```

Three ways out, in the order they should be preferred:

1. **Give the publishing address a real membership.** A purchase through the normal member flow,
   or `grantMembership(user, WAGER_PARTICIPANT_ROLE, tier, durationDays)` from a key holding
   `ROLE_MANAGER_ROLE` on the MembershipManager. `0x52502d…F6e1` *does* hold `ROLE_MANAGER_ROLE`
   on the Polygon manager (read 2026-08-02), so it can grant itself the tier in one transaction —
   which is exactly why this is a membership decision and not an engineering one.
2. **Publish from a different vendor address that already holds Silver.** The vendor address is
   recorded immutably per app, so choose it deliberately — there is no vendor rotation.
3. **Lower the floor** — `setMembershipGate(manager, role, minTier)` from `DEFAULT_ADMIN_ROLE`.
   Available, and the weakest option: the floor is what makes listing a deliberate act. Do not
   set it to 0 to unblock one publish.

Until this is resolved **Token Mint and ClearPath are unavailable to Polygon members**, because
their host tabs are gone (`?tab=tokens` and `?tab=clearpath` redirect to `/apps/token-mint` and
`/apps/clearpath`) and the Polygon catalog is empty. That is a member-visible gap, not a latent
one.

### Other gaps, accepted and unfixed

- No global kill switch and no batch suspension.
- No operator can free a name, and no record can ever be deleted. Only the *vendor* can vacate a
  name, by renaming its own listing (`updateMetadata` deletes the old key and forces re-review) —
  and never once the record is Deprecated or Suspended, so a deprecated app's name is reserved
  forever.
- No vendor-address rotation.
- `appIdsByVendor` is unbounded.
- `getAppsPaged` clamps `limit` to `MAX_PAGE_LIMIT` (25) rather than reverting; the catalog pages
  at exactly 25 and a **partial page read fails the whole catalog** rather than showing a subset.
- Spec 073 tasks still open: **T047** accessibility pass, **T048** contract security review,
  **T049** full-suite gates. The registry has not had a formal security review.

---

## 9. Diagnostics

### The catalog looks wrong

Three different states, deliberately worded so they cannot be confused. Read the member's screen
before theorising:

| Member sees | State | Meaning | Fix |
|---|---|---|---|
| *"Apps aren't available here."* … "a deployment gap rather than an outage: retrying will not change it" | `not-deployed` | No registry address configured for the cohort chain in this build | Deploy, then `npm run sync:frontend-contracts` and rebuild. Not an incident. |
| *"Listings can't be verified right now."* (alert) | `unreachable` | A registry is configured and could not be read — no route, or it did not answer. **Launches are refused.** A previously verified snapshot may be shown, labelled with its age, with no launch affordance | RPC / endpoint problem. Self-clears. |
| *"No apps are approved yet."* — "The registry answered — it simply holds no approved apps for this environment." Refresh and **Submit an app** are offered; search and filters are not (nothing to narrow) | verified and empty | The registry answered and nothing is launchable | Check `appCount()`; on Polygon today the honest answer is zero (§1) |

The middle case is deliberate: an app suspended for a security problem and an app that was never
listed look identical once the registry goes quiet, so the catalog refuses to guess.

Operator check, from the registry chain:

```bash
npx hardhat console --network mordor
> const rec = require('./deployments/mordor-chain63-v2.json')
> const reg = await ethers.getContractAt('MiniAppRegistry', rec.contracts.miniAppRegistry)
> const n = await reg.appCount()
> for (let i = 1n; i <= n; i++) { const a = await reg.getApp(i);
    console.log(i, a.name, 'status', Number(a.status), 'launchable', a.launchable, a.approved.cid) }
```

### One app will not launch

| Refusal (`data-refusal`) | Cause | Operator action |
|---|---|---|
| `suspended` / `deprecated` | A curator's decision | None — the message is correct |
| `never-approved` | Listed, nothing ever promoted | Review it |
| `registry-unreachable` | Could not confirm the record | RPC; retryable |
| `gateway` | Every configured gateway failed for this package | §5 — check whether it is one package or all |
| `integrity` | Bytes ≠ approved hash | **Suspend, then investigate** |
| `identity-mismatch` | `manifest.id` ≠ the launched app's slug | Vendor packaging error; reject |
| `host-api` | Package declares a `hostApi` newer than the host supports (host is at **2**) | The member's host is old, or the package targets an unreleased host |
| `unexpected` | Anything unrecognised — including **a CSP that lost `blob:` in `script-src`**, which fails at the Blob import with a console violation | Check `frontend/nginx.conf` / `frontend/nginx.conf.template`; both must carry `script-src 'self' 'unsafe-inline' blob: …`, gated by `frontend/src/test/nginxCspScriptSrc.test.js` |

### Suspicion of a stale cached package

The service worker cache `fairwins-miniapp-packages-v1` (LRU, 60 entries) is cache-first because
CIDs are immutable, and it is **not a trust boundary**: the loader re-verifies the manifest keccak
and the sha256 of every file it retrieves, cached or not, and the launch always re-reads the
registry first. A poisoned or superseded cache entry therefore cannot execute and cannot
resurrect a suspended app. If you still want it gone from one device: DevTools → Application →
Cache Storage → delete that cache, or clear site data.

### Common reverts

| Revert | Meaning |
|---|---|
| `StaleProposal(expected, actual)` | The tuple moved between review and decision — **re-review** (§2.2) |
| `NothingProposed` | `approveApp` with nothing to promote and no retained approved tuple to reinstate; or `rejectProposal` with no proposed tuple at all |
| `InvalidStatus` | Approving an already-Approved record, suspending a Suspended one — or a vendor trying to submit/edit while their listing is Suspended |
| `AppDeprecatedError` | Terminal record; no lifecycle change is possible |
| `DuplicateName` | The normalized name is taken — including by a deprecated app |
| `InsufficientMembershipTier` | Vendor below `minTier()` on the registry's chain (§8) |
| `SanctionedAccount` | Vendor refused by the configured `ISanctionsGuard` |
| `AccessControlUnauthorizedAccount` | Wrong role — or the right role on the wrong chain |
| `InvalidGateConfig` | `setMembershipGate` / `setSanctionsGuard` given a non-contract address, a manager with a zero role, or a tier above Platinum |
| `EmptyName` / `InvalidName` / `StringTooLong` / `EmptyCid` / `EmptyManifestHash` | Metadata bounds: name ≤ 64 bytes, description ≤ 512, cid ≤ 256, no control characters, no zero hash |

---

## 10. Deploying to a new cohort chain, and upgrades

Prerequisites: an existing `deployments/<net>-chain<id>-v2.json` **with a `membershipManager`**
(the script aborts without one), gas for the deployer, and the floppy keystore mounted for a cold
key (`npm run floppy:mount`).

```bash
npm run compile
npm run check:storage-layout

MINIAPP_MIN_TIER=2 npx hardhat run scripts/deploy/deploy-miniapp-registry.js --network <net>
npm run sync:frontend-contracts            # or :polygon / :local
npm run verify:<net>                       # verify.js knows miniAppRegistry + miniAppRegistryImpl
```

The deploy is targeted and **append-only**: it reuses the recorded `membershipManager` and
`sanctionsGuard` (zero disables screening), appends `miniAppRegistry` / `miniAppRegistryImpl` and
a `deployBlocks.miniAppRegistry`, and **aborts if a registry is already recorded** — changing
logic is an in-place upgrade, never a redeploy, which would strand every listing.

It seeds the **deployer** as first curator. That is required, not convenient: the role administers
itself, so a registry must launch with one. Then perform the handoff (§6).

Post-deploy checklist:

- [ ] `deployments/<net>-chain<id>-v2.json` carries both keys and the deploy block.
- [ ] `frontend/src/config/contracts.js` carries the address for that chain.
- [ ] `miniAppChainId()` resolves to a chain that **has** a `miniAppRegistry` for every build in
      the cohort — pinned by `frontend/src/test/networks.miniapps.test.js`.
- [ ] A live write cycle on a throwaway listing (submit → verify → approve → suspend). On a
      **mainnet** registry, do not: no record can ever be deleted, so it leaves a permanent junk
      entry (renaming it frees the name, but not the row). Mordor is what testnets are for — and
      see §1, where exactly this left a smoke listing behind.

Upgrades follow the standard UUPS path with the storage-layout gate — see
[contract-upgrades.md](./contract-upgrades.md).

---

## References

- Design: [developer-guide/miniapps.md](../developer-guide/miniapps.md)
- Role handoff: [admin-role-handoff.md](./admin-role-handoff.md) ·
  Upgrades: [contract-upgrades.md](./contract-upgrades.md) ·
  Console: [operations-control-plane.md](./operations-control-plane.md)
- Contracts: `contracts/apps/MiniAppRegistry.sol`, `contracts/interfaces/IMiniAppRegistry.sol`
- Host + loader: `frontend/src/lib/miniapps/`
- Scripts: `scripts/deploy/deploy-miniapp-registry.js`, `scripts/miniapps/publish.js`,
  `scripts/miniapps/submit-and-approve.js`
- Spec: `specs/073-miniapp-platform/` (validation walkthrough in `quickstart.md`)
