/**
 * MiniAppRegistry read client (spec 073) — the only path from the app to the mini-app catalog.
 *
 * Everything the host eventually EXECUTES is decided by what this module reports: which listings
 * exist, which are Approved, and which on-chain `(cid, manifestHash)` tuple the loader is allowed to
 * fetch and verify (FR-010/FR-011). That makes this a trust boundary rather than a data-access
 * convenience, and three rules follow from it.
 *
 * 1. **ABSENCE AND FAILURE ARE DIFFERENT ANSWERS, AND NEITHER OF THEM IS AN EMPTY CATALOG.**
 *    `{ status: 'not-deployed' }` is a FACT about this build: no registry address is configured for
 *    the cohort's registry chain, so there is no catalog to have an opinion about. `{ status:
 *    'unreachable' }` is the ABSENCE of a fact: a registry exists and we could not read it. Those
 *    lead to different copy and different affordances, so they are different outcomes — the
 *    `fetchFeeQuote` distinction (spec 060/067), applied to listings instead of rates.
 *
 *    Collapsing either into `apps: []` would be a lie with teeth: an empty catalog reads to a member
 *    as "nothing is approved", so an RPC outage would render exactly like a curator having suspended
 *    every app — and a *single* unreadable page would render exactly like one app having been
 *    suspended. So no failure path in this module ever produces an `apps` array at all, and a
 *    partial page read fails the WHOLE catalog rather than presenting a subset as the complete
 *    curated list (spec.md edge case: "states it cannot verify listings", never stale-as-verified).
 *
 * 2. **THE CACHE NEVER DECIDES WHAT EXECUTES.** `fetchCatalog` memoises its result so browsing does
 *    not re-page the registry on every keystroke, and stamps `fetchedAt` so a surface can disclose
 *    how old the list is. The launch path does not use it: `fetchApp` always re-reads the single
 *    record it is about to run (FR-010), because the window this closes is precisely the one a
 *    curator uses — suspending a compromised app between a member opening the catalog and clicking
 *    Launch. A cached snapshot is offered on failure only under the `stale` key, never as `apps`, so
 *    no caller can render it as verified by accident.
 *
 * 3. **ONE CHAIN, RESOLVED HERE.** The registry lives on the cohort's single reference chain
 *    (`miniAppChainId()`, FR-025) and is read through `getReadProvider` so the member's own RPC
 *    route applies (spec 069). Callers never pass a chain id or a provider: a mini-app catalog read
 *    against the wrong chain would approve packages under an authority this build must not trust.
 */
import { Contract } from 'ethers'
import { AppStatus, MINI_APP_REGISTRY_ABI } from '../../abis/miniAppRegistry'
import { getContractAddressForChain } from '../../config/contracts'
import { miniAppChainId } from '../../config/networks'
import { getReadProvider } from '../../utils/rpcProvider'

/** Discriminants every function in this module returns. Never a bare value, never a bare array. */
export const REGISTRY_STATUS = Object.freeze({
  /** The registry answered. */
  OK: 'ok',
  /** No registry address is configured for this build's registry chain. */
  NOT_DEPLOYED: 'not-deployed',
  /** A registry IS configured and we could not read it. Not evidence that anything is unapproved. */
  UNREACHABLE: 'unreachable',
  /** The registry answered and holds no such record. Only `fetchApp`/`fetchAppByName` return it. */
  NOT_FOUND: 'not-found',
})

/** Why an `unreachable` outcome happened, so a surface can be specific without guessing. */
export const UNREACHABLE_REASON = Object.freeze({
  /** No read route to the registry chain at all (no member endpoint, no build default). */
  NO_ROUTE: 'no-route',
  /** The call failed: RPC down, request rejected, wrong/undeployed bytecode at the address. */
  READ_FAILED: 'read-failed',
  /** The call succeeded but returned something no healthy registry could have produced. */
  BAD_RESPONSE: 'bad-response',
})

/**
 * Records per `getAppsPaged` call. Deliberately well under the contract's `MAX_PAGE_LIMIT` (100).
 *
 * An `AppView` is mostly bounded STRINGS, so a page is far heavier than the record count suggests:
 * worst case per record is name 64 B + description 512 B + two package tuples at 256 B of CID each,
 * which ABI-encodes to roughly 1.8 KB and travels as ~3.6 KB of JSON-RPC hex. A full 100-record page
 * is therefore ~180 KB encoded / ~360 KB on the wire from a single `eth_call` — enough to hit
 * response-size ceilings and view-gas caps on ordinary public endpoints (and on a member's own node,
 * whose limits we do not control, spec 069). Twenty-five keeps a worst-case page near 45 KB / 90 KB,
 * which every endpoint we target serves comfortably.
 *
 * Paging cost is not the trade-off it looks like: the catalog is a curated enterprise list of tens of
 * apps, so this is one or two round trips either way.
 */
export const CATALOG_PAGE_SIZE = 25

/**
 * How long a catalog snapshot is served from memory before the next `fetchCatalog` re-reads.
 *
 * Short on purpose. This governs only BROWSING (what the catalog grid shows); it governs nothing
 * about what runs, because the launch path re-reads (rule 2 above). A minute is long enough to make
 * typing in the search box free and short enough that a curator action shows up while the member is
 * still looking at the page.
 */
export const CATALOG_CACHE_TTL_MS = 60_000

/**
 * The most listings we will believe `appCount()` about.
 *
 * A wrong address in the deployment record can decode an unrelated storage word as a `uint256`, and
 * paging to that number would issue millions of requests against the member's endpoint. This is a
 * loudness guard, not a truncation: exceeding it yields `unreachable` (we cannot present a catalog),
 * never a silently shortened list presented as the complete curated set.
 */
const MAX_PLAUSIBLE_APP_COUNT = 10_000

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const ZERO_HASH = `0x${'0'.repeat(64)}`

/** chainId -> { registryAddress, fetchedAt, apps, allApps }. Module-scoped; see rule 2. */
const catalogCache = new Map()

/**
 * The registry address for this build's registry chain, or null when there is none.
 *
 * A blank or malformed entry both mean the same thing to a caller — this build has no usable
 * registry — and both are configuration facts rather than runtime failures, so both read as
 * not-deployed rather than as an outage.
 *
 * @param {number} [chainId] defaults to the cohort registry chain
 * @returns {string|null}
 */
export function miniAppRegistryAddress(chainId = miniAppChainId()) {
  const address = getContractAddressForChain('miniAppRegistry', chainId)
  return address && ADDRESS_RE.test(address) ? address : null
}

/** Where this build reads the catalog from — for "the catalog lives on X" disclosure. */
export function registryLocation() {
  const chainId = miniAppChainId()
  return { chainId, registryAddress: miniAppRegistryAddress(chainId) }
}

/** Drop the memoised catalog. Call after a curator/vendor write, or when the account context changes. */
export function clearCatalogCache() {
  catalogCache.clear()
}

function notDeployed(chainId) {
  return { status: REGISTRY_STATUS.NOT_DEPLOYED, chainId, registryAddress: null }
}

/**
 * Build an `unreachable` outcome, attaching the last good snapshot (if any) under `stale`.
 *
 * `stale` is deliberately NOT `apps`: spec.md allows a previously verified list to be shown only
 * behind an explicit "verification unavailable" disclosure, and a caller has to reach for a
 * differently-named key to do that. A caller that renders `result.apps` gets nothing, which is the
 * correct default.
 */
function unreachable({ chainId, registryAddress, reason, error }) {
  const entry = catalogCache.get(chainId)
  const stale =
    entry && entry.registryAddress === registryAddress
      ? {
          apps: entry.apps,
          allApps: entry.allApps,
          fetchedAt: entry.fetchedAt,
          ageMs: Date.now() - entry.fetchedAt,
        }
      : null
  return {
    status: REGISTRY_STATUS.UNREACHABLE,
    chainId,
    registryAddress,
    reason,
    error: error instanceof Error ? error : new Error(String(error?.message || error || reason)),
    stale,
  }
}

/**
 * Resolve chain + address + provider, or the outcome explaining why we cannot read.
 *
 * The `!provider` case is UNREACHABLE, not not-deployed: a registry that exists on a chain this
 * build currently has no route to is an unread registry, and reporting it as absent would tell a
 * member the platform has no apps when it has a catalog they simply cannot reach right now.
 */
function resolveRegistry() {
  const chainId = miniAppChainId()
  const registryAddress = miniAppRegistryAddress(chainId)
  if (!registryAddress) return { outcome: notDeployed(chainId) }

  const provider = getReadProvider(chainId)
  if (!provider) {
    return {
      outcome: unreachable({
        chainId,
        registryAddress,
        reason: UNREACHABLE_REASON.NO_ROUTE,
        error: new Error(`no read endpoint for chain ${chainId}, where the mini-app registry lives`),
      }),
    }
  }

  return { chainId, registryAddress, contract: new Contract(registryAddress, MINI_APP_REGISTRY_ABI, provider) }
}

/**
 * Normalize one on-chain `PackageRef`.
 *
 * `present` is the load-bearing field. Solidity zero-fills, so an app that has never been approved
 * carries an `approved` tuple of `("", 0x00…, 0)` rather than nothing at all — and a loader handed
 * that would fetch the empty CID. Both halves must be non-empty for the tuple to name a package.
 */
function normalizePackageRef(raw) {
  const cid = typeof raw?.cid === 'string' ? raw.cid : ''
  const manifestHash = raw?.manifestHash ? String(raw.manifestHash) : ZERO_HASH
  return Object.freeze({
    cid,
    manifestHash,
    // uint64, monotonic from 1 — never near the float-safe ceiling.
    version: Number(raw?.version ?? 0),
    present: cid.length > 0 && manifestHash !== ZERO_HASH,
  })
}

/**
 * Normalize one `AppView` tuple into plain, frozen JS.
 *
 * Frozen because these objects are shared out of the cache: an in-place `apps.sort()` by one surface
 * would otherwise reorder another's snapshot, and a mutated `approved.cid` would change what the
 * loader fetches. Callers copy before sorting (`[...apps].sort(…)`); a mutation attempt throws
 * rather than silently corrupting a shared read.
 *
 * `launchable` is the catalog's admission test and comes FROM THE CHAIN (`AppView.launchable`) — it is
 * deliberately NOT re-derived here. It is not the same question as `status === Approved`: a live app
 * whose vendor has an update in review is Pending AND launchable, still serving its last reviewed
 * package (FR-003). Deriving it from status would drop that app out of the catalog the moment its
 * vendor submitted anything — handing every vendor an offline switch for their own live app.
 *
 * The local `&& approved.present` is a belt-and-braces agreement check, not a second opinion: if the
 * chain ever said launchable with no servable tuple we would be offering a launch that can only fail,
 * so we decline it rather than trust it.
 */
export function normalizeApp(raw) {
  const status = Number(raw?.status)
  const approved = normalizePackageRef(raw?.approved)
  return Object.freeze({
    // uint256 ids are allocated sequentially from 1 — Number is exact for any real catalog.
    id: Number(raw?.id ?? 0),
    vendor: raw?.vendor ?? null,
    name: raw?.name ?? '',
    description: raw?.description ?? '',
    category: Number(raw?.category),
    status,
    approved,
    proposed: normalizePackageRef(raw?.proposed),
    submittedAt: Number(raw?.submittedAt ?? 0),
    approvedAt: Number(raw?.approvedAt ?? 0),
    updatedAt: Number(raw?.updatedAt ?? 0),
    launchable: Boolean(raw?.launchable) && approved.present,
  })
}

/**
 * Page the whole catalog. Throws on any failure — a half-read catalog is not a catalog (rule 1).
 *
 * Pages are read SEQUENTIALLY rather than fired in parallel: each response is large (see
 * `CATALOG_PAGE_SIZE`), ethers batches concurrent calls into one request by default, and a failure
 * on page one should abort rather than leave four more heavy requests in flight against a member's
 * endpoint. The loop is bounded by `appCount` — checked for plausibility first — so it cannot spin.
 */
async function readAllRecords(contract) {
  const total = Number(await contract.appCount())
  if (!Number.isInteger(total) || total < 0 || total > MAX_PLAUSIBLE_APP_COUNT) {
    const err = new Error(`mini-app registry reported an implausible appCount (${total})`)
    err.code = UNREACHABLE_REASON.BAD_RESPONSE
    throw err
  }

  const records = []
  for (let offset = 0; offset < total; offset += CATALOG_PAGE_SIZE) {
    const page = await contract.getAppsPaged(offset, CATALOG_PAGE_SIZE)
    const length = page?.length ?? 0
    for (let i = 0; i < length; i += 1) records.push(normalizeApp(page[i]))
    // A short page means the registry has nothing more to give (it clamps the window to `appCount`),
    // which also covers a listing count that shrank between the count read and this one.
    if (length < CATALOG_PAGE_SIZE) break
  }
  return records
}

/**
 * Read the whole catalog.
 *
 * On success returns BOTH lists, because two different audiences read this registry and giving them
 * one list would force one of them to be wrong:
 *   - `apps`    — Approved and servable only. The member-facing catalog (FR-007); a Pending or
 *                 Suspended record must never appear here, and nothing in this list can be a package
 *                 the host has no approved tuple for.
 *   - `allApps` — every record, every status. Curator review queues (FR-022) and vendor status
 *                 lists (FR-023) exist precisely to look at the records the catalog hides.
 *
 * `fetchedAt` (epoch ms) and `ageMs` are for disclosure: a surface showing a cached list should say
 * how old it is rather than implying it was just verified.
 *
 * @param {{force?: boolean}} [options] `force: true` bypasses the memo (use after a lifecycle write)
 * @returns {Promise<
 *   {status:'ok', apps: object[], allApps: object[], fetchedAt: number, ageMs: number, cached: boolean, chainId: number, registryAddress: string} |
 *   {status:'not-deployed', chainId: number, registryAddress: null} |
 *   {status:'unreachable', chainId: number, registryAddress: string, reason: string, error: Error, stale: object|null}
 * >}
 */
export async function fetchCatalog({ force = false } = {}) {
  const chainId = miniAppChainId()
  const registryAddress = miniAppRegistryAddress(chainId)
  if (!registryAddress) return notDeployed(chainId)

  if (!force) {
    const entry = catalogCache.get(chainId)
    const ageMs = entry ? Date.now() - entry.fetchedAt : Infinity
    // An entry recorded against a different address belongs to a different registry (a config change
    // between reads), so it is not this catalog's snapshot at all.
    if (entry && entry.registryAddress === registryAddress && ageMs < CATALOG_CACHE_TTL_MS) {
      return {
        status: REGISTRY_STATUS.OK,
        apps: entry.apps,
        allApps: entry.allApps,
        fetchedAt: entry.fetchedAt,
        ageMs,
        cached: true,
        chainId,
        registryAddress,
      }
    }
  }

  const resolved = resolveRegistry()
  if (resolved.outcome) return resolved.outcome

  let allApps
  try {
    allApps = Object.freeze(await readAllRecords(resolved.contract))
  } catch (error) {
    return unreachable({
      chainId,
      registryAddress,
      reason: error?.code === UNREACHABLE_REASON.BAD_RESPONSE ? UNREACHABLE_REASON.BAD_RESPONSE : UNREACHABLE_REASON.READ_FAILED,
      error,
    })
  }

  const apps = Object.freeze(allApps.filter((app) => app.launchable))
  const fetchedAt = Date.now()
  catalogCache.set(chainId, { registryAddress, fetchedAt, apps, allApps })

  return { status: REGISTRY_STATUS.OK, apps, allApps, fetchedAt, ageMs: 0, cached: false, chainId, registryAddress }
}

/**
 * Read ONE record, always from the chain (FR-010).
 *
 * This is the launch read. It never consults — and never populates — the catalog memo, because the
 * whole point of re-reading at launch is to catch the change the memo would hide: a curator
 * suspending a compromised app while a member has the catalog open. A cache "hit" here would defeat
 * the requirement rather than optimise it, so there is no option to opt into one.
 *
 * A record the registry does not hold reverts `AppNotFound()`, which is a definite answer and comes
 * back as `not-found`. An undecodable failure does NOT: not knowing whether an app exists is an
 * outage, and rendering it as "no such app" would blame the member's link for our own downtime.
 *
 * `id` comes from a route parameter, so a malformed one is untrusted input rather than a caller bug:
 * it resolves to `not-found` (a 404 surface) instead of throwing.
 *
 * @param {number|string|bigint} id registry id (allocated from 1)
 * @returns {Promise<{status:'ok', app: object, fetchedAt: number, chainId: number, registryAddress: string} | {status:'not-found', id: *, chainId: number, registryAddress: string} | {status:'not-deployed'} | {status:'unreachable'}>}
 */
export async function fetchApp(id) {
  const resolved = resolveRegistry()
  if (resolved.outcome) return resolved.outcome
  const { chainId, registryAddress, contract } = resolved

  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { status: REGISTRY_STATUS.NOT_FOUND, id, chainId, registryAddress }
  }

  try {
    const raw = await contract.getApp(numericId)
    return {
      status: REGISTRY_STATUS.OK,
      app: normalizeApp(raw),
      fetchedAt: Date.now(),
      chainId,
      registryAddress,
    }
  } catch (error) {
    if (isAppNotFound(error)) return { status: REGISTRY_STATUS.NOT_FOUND, id, chainId, registryAddress }
    return unreachable({ chainId, registryAddress, reason: UNREACHABLE_REASON.READ_FAILED, error })
  }
}

/**
 * Whether a failed call was the registry saying "no such app" rather than the network saying nothing.
 *
 * ethers decodes a custom error into `error.revert.name` when the ABI carries the selector (it does —
 * `error AppNotFound()`), and older/wrapped shapes surface it as `errorName`. Anything else — missing
 * revert data, a transport error, undecodable bytes — is NOT a not-found: it is an unread record.
 */
function isAppNotFound(error) {
  return (error?.revert?.name || error?.errorName) === 'AppNotFound'
}

/**
 * Resolve a display name to its registry id, or `not-found`.
 *
 * The chain answers `0` for an unclaimed name, and ids start at 1 exactly so that zero can mean
 * "no such name" without ambiguity — so zero is translated here into an explicit outcome instead of
 * being handed back as a falsy id for callers to re-interpret.
 *
 * The name is passed through verbatim: the registry case-folds ASCII itself when computing its name
 * key, and folding again on this side would be a second, drifting definition of name equality.
 *
 * Primary use is the duplicate-name pre-check on the vendor submission form (FR-006/FR-021) — cheaper
 * and kinder than letting the submission revert.
 */
export async function fetchAppByName(name) {
  const resolved = resolveRegistry()
  if (resolved.outcome) return resolved.outcome
  const { chainId, registryAddress, contract } = resolved

  if (typeof name !== 'string' || name.length === 0) {
    return { status: REGISTRY_STATUS.NOT_FOUND, name, chainId, registryAddress }
  }

  let id
  try {
    id = Number(await contract.idByName(name))
  } catch (error) {
    return unreachable({ chainId, registryAddress, reason: UNREACHABLE_REASON.READ_FAILED, error })
  }
  if (!Number.isInteger(id) || id <= 0) return { status: REGISTRY_STATUS.NOT_FOUND, name, chainId, registryAddress }
  return fetchApp(id)
}

/**
 * Assert a vendor argument is an address.
 *
 * Throws rather than returning an outcome, and the asymmetry with `fetchApp` is deliberate: a vendor
 * address comes from the connected wallet or an admin form the app controls, so a malformed one is a
 * bug in our code, not a member typing a bad URL. Returning `{ ids: [] }` for it would present "this
 * vendor has submitted nothing" — the same lie rule 1 exists to prevent.
 */
function assertVendorAddress(vendor, fnName) {
  if (typeof vendor !== 'string' || !ADDRESS_RE.test(vendor)) {
    throw new Error(`${fnName}: vendor must be a 0x address, received ${JSON.stringify(vendor)}`)
  }
}

/**
 * The registry ids a vendor has ever submitted, newest last (the contract appends on submission).
 *
 * An empty `ids` array here IS meaningful — the registry answered and this address has submitted
 * nothing — which is exactly why the failure cases are separate outcomes rather than the same
 * empty array.
 *
 * @returns {Promise<{status:'ok', ids: number[], chainId: number, registryAddress: string} | {status:'not-deployed'} | {status:'unreachable'}>}
 */
export async function appIdsByVendor(vendor) {
  assertVendorAddress(vendor, 'appIdsByVendor')
  const resolved = resolveRegistry()
  if (resolved.outcome) return resolved.outcome
  const { chainId, registryAddress, contract } = resolved

  try {
    const raw = await contract.appIdsByVendor(vendor)
    const ids = Array.from(raw ?? [], (value) => Number(value))
    return { status: REGISTRY_STATUS.OK, ids, chainId, registryAddress }
  } catch (error) {
    return unreachable({ chainId, registryAddress, reason: UNREACHABLE_REASON.READ_FAILED, error })
  }
}

/**
 * A vendor's own submissions with their full lifecycle state (FR-023).
 *
 * Reads the vendor index and then each record directly, rather than filtering the catalog: the
 * catalog memo can be a minute old and the vendor's most likely reason for opening this list is that
 * they just submitted something. It also carries every status by construction — a vendor's Pending
 * and Suspended listings are the ones they most need to see, and those are exactly what the catalog
 * omits.
 *
 * A single unreadable record fails the whole list. A vendor shown four of their five submissions
 * would reasonably conclude the fifth was never recorded (FR-021), which is worse than being told
 * the registry could not be read.
 *
 * @returns {Promise<{status:'ok', apps: object[], fetchedAt: number, chainId: number, registryAddress: string} | {status:'not-deployed'} | {status:'unreachable'}>}
 */
export async function fetchVendorApps(vendor) {
  const idsOutcome = await appIdsByVendor(vendor)
  if (idsOutcome.status !== REGISTRY_STATUS.OK) return idsOutcome
  const { chainId, registryAddress, ids } = idsOutcome

  const resolved = resolveRegistry()
  if (resolved.outcome) return resolved.outcome

  try {
    const raws = await Promise.all(ids.map((id) => resolved.contract.getApp(id)))
    return {
      status: REGISTRY_STATUS.OK,
      apps: raws.map((raw) => normalizeApp(raw)),
      fetchedAt: Date.now(),
      chainId,
      registryAddress,
    }
  } catch (error) {
    // A vendor's own index cannot legitimately point at a missing record, so even `AppNotFound` here
    // means the read is not to be trusted — never that the submission is gone.
    return unreachable({ chainId, registryAddress, reason: UNREACHABLE_REASON.READ_FAILED, error })
  }
}
