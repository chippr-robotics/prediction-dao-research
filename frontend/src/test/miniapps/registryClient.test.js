/**
 * MiniAppRegistry read client (spec 073, T015).
 *
 * The behaviour under test is the honesty contract, not the plumbing: "no registry on this build",
 * "the registry could not be read", and "the registry says nothing is approved" are three different
 * answers, and only the last one is an empty catalog. Plus the FR-010 rule that the launch read
 * never sees the browsing memo.
 *
 * The registry address, the registry chain, and the read provider are all mocked so the module is
 * exercised against a scripted chain rather than a deployment — none of the three exists on any
 * network yet, and `getContractAddressForChain('miniAppRegistry', …)` returns '' everywhere.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const m = vi.hoisted(() => ({
  /** Contract method name -> implementation. Unset methods throw, so a test can't pass by accident. */
  fns: {},
  address: null,
  chainId: 137,
  provider: {},
  /** Every contract call, in order — proves paging offsets and cache bypass. */
  calls: [],
}))

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  function FakeContract(address, _abi, provider) {
    m.calls.push({ method: 'new Contract', args: [address, provider] })
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') return undefined // not a thenable
          const key = String(prop)
          return (...args) => {
            m.calls.push({ method: key, args })
            const fn = m.fns[key]
            if (!fn) throw new Error(`unmocked contract method: ${key}`)
            return fn(...args)
          }
        },
      },
    )
  }
  return { ...actual, Contract: vi.fn(FakeContract) }
})

vi.mock('../../config/contracts', () => ({
  getContractAddressForChain: vi.fn(() => m.address),
}))

vi.mock('../../config/networks', () => ({
  miniAppChainId: vi.fn(() => m.chainId),
}))

vi.mock('../../utils/rpcProvider', () => ({
  getReadProvider: vi.fn(() => m.provider),
}))

import { AppStatus, AppCategory } from '../../abis/miniAppRegistry'
import {
  CATALOG_CACHE_TTL_MS,
  CATALOG_PAGE_SIZE,
  REGISTRY_STATUS,
  UNREACHABLE_REASON,
  appIdsByVendor,
  clearCatalogCache,
  fetchApp,
  fetchAppByName,
  fetchCatalog,
  fetchVendorApps,
  miniAppRegistryAddress,
  registryLocation,
} from '../../lib/miniapps/registryClient'

const REGISTRY = '0x1111111111111111111111111111111111111111'
const VENDOR = '0x2222222222222222222222222222222222222222'
const HASH = `0x${'ab'.repeat(32)}`
const ZERO_HASH = `0x${'0'.repeat(64)}`

/** A raw `AppView` tuple as ethers hands it back (named properties on a Result). */
function appView({
  id,
  status = AppStatus.APPROVED,
  name = `App ${id}`,
  vendor = VENDOR,
  approved,
  proposed,
  launchable,
} = {}) {
  const approvedRef = approved ?? { cid: `bafy-approved-${id}`, manifestHash: HASH, version: 2n }
  return {
    id: BigInt(id),
    vendor,
    name,
    description: `${name} description`,
    category: AppCategory.RECONCILIATION,
    status,
    // The contract computes this (isLaunchable) and ships it in the AppView; the client reads it
    // rather than re-deriving. Default here mirrors the on-chain rule EXACTLY — note a Pending
    // record with a prior approval IS launchable (a live app with an update in review, FR-003).
    launchable:
      launchable ??
      (Boolean(approvedRef.cid) &&
        status !== AppStatus.SUSPENDED &&
        status !== AppStatus.DEPRECATED),
    approved: approvedRef,
    proposed: proposed ?? { cid: '', manifestHash: ZERO_HASH, version: 0n },
    submittedAt: 1_700_000_000n,
    approvedAt: 1_700_000_500n,
    updatedAt: 1_700_000_900n,
  }
}

/** Script `appCount` + `getAppsPaged` over a fixed record list, honouring offset/limit like the contract. */
function serveCatalog(records) {
  m.fns.appCount = async () => BigInt(records.length)
  m.fns.getAppsPaged = async (offset, limit) => {
    const start = Number(offset)
    if (start >= records.length || Number(limit) === 0) return []
    return records.slice(start, start + Number(limit))
  }
}

/** ethers' decoded custom-error shape for `AppNotFound()`. */
function appNotFoundError() {
  const err = new Error('execution reverted (unknown custom error)')
  err.code = 'CALL_EXCEPTION'
  err.revert = { name: 'AppNotFound', signature: 'AppNotFound()', args: [] }
  return err
}

beforeEach(() => {
  m.fns = {}
  m.address = REGISTRY
  m.chainId = 137
  m.provider = {}
  m.calls = []
  clearCatalogCache()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('registry resolution', () => {
  it('reports the registry location for disclosure', () => {
    expect(registryLocation()).toEqual({ chainId: 137, registryAddress: REGISTRY })
  })

  it('treats a blank or malformed configured address as not deployed, not as an outage', () => {
    m.address = ''
    expect(miniAppRegistryAddress()).toBeNull()
    m.address = '0xnot-an-address'
    expect(miniAppRegistryAddress()).toBeNull()
  })
})

describe('fetchCatalog — the registry answered', () => {
  it('surfaces every launchable record in the catalog list and every record in allApps', async () => {
    const EMPTY_PKG = { cid: '', manifestHash: ZERO_HASH, version: 0n }
    serveCatalog([
      // Never approved — nothing servable, so it is not offered.
      appView({ id: 1, status: AppStatus.PENDING, approved: EMPTY_PKG }),
      appView({ id: 2, status: AppStatus.APPROVED }),
      appView({ id: 3, status: AppStatus.SUSPENDED }),
      appView({ id: 4, status: AppStatus.DEPRECATED }),
      // Approved on paper but nothing was ever promoted: launching it could only fail, so the
      // catalog must not offer it even though its status says Approved.
      appView({ id: 5, status: AppStatus.APPROVED, approved: EMPTY_PKG }),
      // A LIVE app whose vendor has an update in review: Pending, but still serving its last
      // reviewed package (FR-003). Dropping this from the catalog would let any vendor take their
      // own live app offline just by submitting something.
      appView({ id: 6, status: AppStatus.PENDING }),
    ])

    const result = await fetchCatalog()

    expect(result.status).toBe(REGISTRY_STATUS.OK)
    expect(result.apps.map((a) => a.id)).toEqual([2, 6])
    expect(result.allApps.map((a) => a.id)).toEqual([1, 2, 3, 4, 5, 6])
    expect(result.cached).toBe(false)
    expect(typeof result.fetchedAt).toBe('number')
    expect(result.ageMs).toBe(0)
  })

  it('trusts the chain for launchability rather than re-deriving it from status', async () => {
    // If the client recomputed `launchable` locally it would disagree with the registry the moment
    // the on-chain rule changed — and the registry is the authority on what may execute.
    serveCatalog([appView({ id: 1, status: AppStatus.APPROVED, launchable: false })])
    const result = await fetchCatalog()
    expect(result.apps).toEqual([])
    expect(result.allApps[0].launchable).toBe(false)
  })

  it('normalizes a record into plain JS the loader can act on', async () => {
    serveCatalog([appView({ id: 7, name: 'Recon' })])

    const { apps } = await fetchCatalog()

    expect(apps[0]).toMatchObject({
      id: 7,
      vendor: VENDOR,
      name: 'Recon',
      category: AppCategory.RECONCILIATION,
      status: AppStatus.APPROVED,
      approved: { cid: 'bafy-approved-7', manifestHash: HASH, version: 2, present: true },
      proposed: { cid: '', version: 0, present: false },
      submittedAt: 1_700_000_000,
      launchable: true,
    })
  })

  it('freezes shared records so one surface cannot corrupt another’s snapshot', async () => {
    serveCatalog([appView({ id: 1 })])
    const { apps } = await fetchCatalog()
    expect(() => {
      apps[0].approved.cid = 'bafy-attacker'
    }).toThrow()
  })

  it('an empty registry is an honest empty catalog', async () => {
    serveCatalog([])
    const result = await fetchCatalog()
    expect(result.status).toBe(REGISTRY_STATUS.OK)
    expect(result.apps).toEqual([])
    expect(result.allApps).toEqual([])
  })

  it('pages until the registry runs out, one page at a time', async () => {
    const records = Array.from({ length: CATALOG_PAGE_SIZE * 2 + 3 }, (_, i) => appView({ id: i + 1 }))
    serveCatalog(records)

    const result = await fetchCatalog()

    expect(result.allApps).toHaveLength(records.length)
    expect(result.allApps.map((a) => a.id)).toEqual(records.map((_, i) => i + 1))
    const pages = m.calls.filter((c) => c.method === 'getAppsPaged').map((c) => c.args.map(Number))
    expect(pages).toEqual([
      [0, CATALOG_PAGE_SIZE],
      [CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE],
      [CATALOG_PAGE_SIZE * 2, CATALOG_PAGE_SIZE],
    ])
  })

  it('stops after a short page without asking for one more', async () => {
    serveCatalog(Array.from({ length: CATALOG_PAGE_SIZE - 1 }, (_, i) => appView({ id: i + 1 })))
    await fetchCatalog()
    expect(m.calls.filter((c) => c.method === 'getAppsPaged')).toHaveLength(1)
  })

  it('requests a page well under the contract’s MAX_PAGE_LIMIT of 100', () => {
    expect(CATALOG_PAGE_SIZE).toBeLessThan(100)
  })
})

describe('fetchCatalog — not deployed', () => {
  it('is a distinct outcome carrying no app list at all', async () => {
    m.address = ''
    const result = await fetchCatalog()
    expect(result).toEqual({ status: REGISTRY_STATUS.NOT_DEPLOYED, chainId: 137, registryAddress: null })
    // Not "there are no apps" — there is no key a caller could render as a catalog.
    expect(result.apps).toBeUndefined()
    expect(result.allApps).toBeUndefined()
  })

  it('does not reach for a provider when there is nothing to read', async () => {
    m.address = ''
    await fetchCatalog()
    expect(m.calls).toHaveLength(0)
  })
})

describe('fetchCatalog — unreachable', () => {
  it('never renders as an empty catalog when the read fails', async () => {
    const boom = new Error('missing revert data')
    m.fns.appCount = async () => {
      throw boom
    }

    const result = await fetchCatalog()

    expect(result.status).toBe(REGISTRY_STATUS.UNREACHABLE)
    expect(result.reason).toBe(UNREACHABLE_REASON.READ_FAILED)
    expect(result.error).toBe(boom)
    expect(result.apps).toBeUndefined()
    expect(result.allApps).toBeUndefined()
  })

  it('fails the whole catalog when one page is unreadable rather than serving a subset as complete', async () => {
    const records = Array.from({ length: CATALOG_PAGE_SIZE + 2 }, (_, i) => appView({ id: i + 1 }))
    m.fns.appCount = async () => BigInt(records.length)
    m.fns.getAppsPaged = async (offset) => {
      if (Number(offset) === 0) return records.slice(0, CATALOG_PAGE_SIZE)
      throw new Error('rpc timeout on page 2')
    }

    const result = await fetchCatalog()

    expect(result.status).toBe(REGISTRY_STATUS.UNREACHABLE)
    expect(result.apps).toBeUndefined()
  })

  it('distinguishes "no route to the registry chain" from a failed call', async () => {
    m.provider = null
    const result = await fetchCatalog()
    expect(result.status).toBe(REGISTRY_STATUS.UNREACHABLE)
    expect(result.reason).toBe(UNREACHABLE_REASON.NO_ROUTE)
    expect(result.error.message).toMatch(/no read endpoint for chain 137/)
    // Nothing was even constructed — there was nothing to talk to.
    expect(m.calls).toHaveLength(0)
  })

  it('refuses an implausible appCount instead of paging against it', async () => {
    m.fns.appCount = async () => 10n ** 18n
    const result = await fetchCatalog()
    expect(result.status).toBe(REGISTRY_STATUS.UNREACHABLE)
    expect(result.reason).toBe(UNREACHABLE_REASON.BAD_RESPONSE)
    expect(m.calls.filter((c) => c.method === 'getAppsPaged')).toHaveLength(0)
  })

  it('offers the last good snapshot under `stale`, never as `apps`', async () => {
    serveCatalog([appView({ id: 1 })])
    const first = await fetchCatalog()
    expect(first.status).toBe(REGISTRY_STATUS.OK)

    m.fns.appCount = async () => {
      throw new Error('rpc down')
    }
    const result = await fetchCatalog({ force: true })

    expect(result.status).toBe(REGISTRY_STATUS.UNREACHABLE)
    expect(result.apps).toBeUndefined()
    expect(result.stale.apps.map((a) => a.id)).toEqual([1])
    expect(result.stale.fetchedAt).toBe(first.fetchedAt)
    expect(result.stale.ageMs).toBeGreaterThanOrEqual(0)
  })

  it('has no stale snapshot to offer when nothing was ever read', async () => {
    m.fns.appCount = async () => {
      throw new Error('rpc down')
    }
    const result = await fetchCatalog()
    expect(result.stale).toBeNull()
  })
})

describe('fetchCatalog — memoisation', () => {
  it('serves the memo within the TTL and marks it as such', async () => {
    serveCatalog([appView({ id: 1 })])
    const first = await fetchCatalog()
    m.calls = []

    const second = await fetchCatalog()

    expect(second.status).toBe(REGISTRY_STATUS.OK)
    expect(second.cached).toBe(true)
    expect(second.fetchedAt).toBe(first.fetchedAt)
    expect(second.apps).toBe(first.apps)
    expect(m.calls).toHaveLength(0)
  })

  it('re-reads once the snapshot ages out', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'))
    serveCatalog([appView({ id: 1 })])
    await fetchCatalog()
    m.calls = []

    vi.setSystemTime(new Date('2026-08-01T00:00:00Z').getTime() + CATALOG_CACHE_TTL_MS + 1)
    const result = await fetchCatalog()

    expect(result.cached).toBe(false)
    expect(m.calls.filter((c) => c.method === 'appCount')).toHaveLength(1)
  })

  it('force re-reads immediately — the path a curator write takes', async () => {
    serveCatalog([appView({ id: 1, status: AppStatus.APPROVED })])
    await fetchCatalog()
    serveCatalog([appView({ id: 1, status: AppStatus.SUSPENDED })])

    const result = await fetchCatalog({ force: true })

    expect(result.cached).toBe(false)
    expect(result.apps).toEqual([])
    expect(result.allApps[0].status).toBe(AppStatus.SUSPENDED)
  })

  it('does not serve a snapshot taken against a different registry address', async () => {
    serveCatalog([appView({ id: 1 })])
    await fetchCatalog()

    m.address = '0x3333333333333333333333333333333333333333'
    m.calls = []
    const result = await fetchCatalog()

    expect(result.cached).toBe(false)
    expect(result.registryAddress).toBe('0x3333333333333333333333333333333333333333')
  })
})

describe('fetchApp — the launch read (FR-010)', () => {
  it('bypasses the catalog memo and reads the record from the chain', async () => {
    // Member browses: the app is Approved and the snapshot is memoised.
    serveCatalog([appView({ id: 1, status: AppStatus.APPROVED })])
    const browsed = await fetchCatalog()
    expect(browsed.apps[0].launchable).toBe(true)

    // A curator suspends it in the window between browsing and clicking Launch.
    m.fns.getApp = async () => appView({ id: 1, status: AppStatus.SUSPENDED })
    m.calls = []

    const launch = await fetchApp(1)

    expect(launch.status).toBe(REGISTRY_STATUS.OK)
    expect(launch.app.status).toBe(AppStatus.SUSPENDED)
    expect(launch.app.launchable).toBe(false)
    expect(m.calls.filter((c) => c.method === 'getApp')).toHaveLength(1)

    // …and the memo is untouched, so browsing keeps its own (disclosed) staleness rather than
    // being silently rewritten by a single-record read.
    const stillCached = await fetchCatalog()
    expect(stillCached.cached).toBe(true)
    expect(stillCached.apps[0].status).toBe(AppStatus.APPROVED)
  })

  it('returns not-found when the registry says the record does not exist', async () => {
    m.fns.getApp = async () => {
      throw appNotFoundError()
    }
    const result = await fetchApp(42)
    expect(result.status).toBe(REGISTRY_STATUS.NOT_FOUND)
    expect(result.id).toBe(42)
  })

  it('treats an undecodable failure as unreachable, never as "no such app"', async () => {
    m.fns.getApp = async () => {
      throw new Error('could not coalesce error')
    }
    const result = await fetchApp(42)
    expect(result.status).toBe(REGISTRY_STATUS.UNREACHABLE)
    expect(result.reason).toBe(UNREACHABLE_REASON.READ_FAILED)
  })

  it('resolves a malformed route id to not-found without calling the chain', async () => {
    const result = await fetchApp('token-mint')
    expect(result.status).toBe(REGISTRY_STATUS.NOT_FOUND)
    expect(m.calls.filter((c) => c.method === 'getApp')).toHaveLength(0)
  })

  it('reports not-deployed rather than not-found when this build has no registry', async () => {
    m.address = ''
    const result = await fetchApp(1)
    expect(result.status).toBe(REGISTRY_STATUS.NOT_DEPLOYED)
  })
})

describe('fetchAppByName', () => {
  it('resolves a name to its record, passing the name through unfolded', async () => {
    m.fns.idByName = async () => 3n
    m.fns.getApp = async (id) => appView({ id: Number(id), name: 'Token Mint' })

    const result = await fetchAppByName('Token Mint')

    expect(result.status).toBe(REGISTRY_STATUS.OK)
    expect(result.app.name).toBe('Token Mint')
    expect(m.calls.find((c) => c.method === 'idByName').args[0]).toBe('Token Mint')
  })

  it('translates the registry’s zero id into an explicit not-found', async () => {
    m.fns.idByName = async () => 0n
    const result = await fetchAppByName('Unclaimed')
    expect(result.status).toBe(REGISTRY_STATUS.NOT_FOUND)
    expect(result.name).toBe('Unclaimed')
  })

  it('is unreachable, not free, when the name lookup fails', async () => {
    m.fns.idByName = async () => {
      throw new Error('rpc down')
    }
    const result = await fetchAppByName('Token Mint')
    expect(result.status).toBe(REGISTRY_STATUS.UNREACHABLE)
  })
})

describe('appIdsByVendor', () => {
  it('returns the vendor’s ids as numbers', async () => {
    m.fns.appIdsByVendor = async () => [1n, 4n, 9n]
    const result = await appIdsByVendor(VENDOR)
    expect(result).toMatchObject({ status: REGISTRY_STATUS.OK, ids: [1, 4, 9] })
  })

  it('an empty list means the registry answered and this vendor has submitted nothing', async () => {
    m.fns.appIdsByVendor = async () => []
    const result = await appIdsByVendor(VENDOR)
    expect(result.status).toBe(REGISTRY_STATUS.OK)
    expect(result.ids).toEqual([])
  })

  it('reports the read failure instead of an empty list', async () => {
    m.fns.appIdsByVendor = async () => {
      throw new Error('rpc down')
    }
    const result = await appIdsByVendor(VENDOR)
    expect(result.status).toBe(REGISTRY_STATUS.UNREACHABLE)
    expect(result.ids).toBeUndefined()
  })

  it('throws on a malformed vendor address — a caller bug, not a runtime state', async () => {
    await expect(appIdsByVendor('not-an-address')).rejects.toThrow(/vendor must be a 0x address/)
    await expect(appIdsByVendor(null)).rejects.toThrow(/vendor must be a 0x address/)
  })

  it('is not-deployed when this build has no registry', async () => {
    m.address = ''
    const result = await appIdsByVendor(VENDOR)
    expect(result.status).toBe(REGISTRY_STATUS.NOT_DEPLOYED)
  })
})

describe('fetchVendorApps', () => {
  it('returns the vendor’s own records across every lifecycle state', async () => {
    m.fns.appIdsByVendor = async () => [1n, 2n]
    m.fns.getApp = async (id) =>
      appView({ id: Number(id), status: Number(id) === 1 ? AppStatus.PENDING : AppStatus.APPROVED })

    const result = await fetchVendorApps(VENDOR)

    expect(result.status).toBe(REGISTRY_STATUS.OK)
    expect(result.apps.map((a) => a.status)).toEqual([AppStatus.PENDING, AppStatus.APPROVED])
  })

  it('does not read the catalog memo — a vendor’s newest submission must show immediately', async () => {
    serveCatalog([appView({ id: 1, status: AppStatus.APPROVED })])
    await fetchCatalog()
    m.fns.appIdsByVendor = async () => [1n, 2n]
    m.fns.getApp = async (id) => appView({ id: Number(id), status: AppStatus.PENDING })

    const result = await fetchVendorApps(VENDOR)

    expect(result.apps.map((a) => a.id)).toEqual([1, 2])
    expect(result.apps.every((a) => a.status === AppStatus.PENDING)).toBe(true)
  })

  it('fails the whole list when one record cannot be read', async () => {
    m.fns.appIdsByVendor = async () => [1n, 2n]
    m.fns.getApp = async (id) => {
      if (Number(id) === 2) throw new Error('rpc down')
      return appView({ id: 1 })
    }

    const result = await fetchVendorApps(VENDOR)

    expect(result.status).toBe(REGISTRY_STATUS.UNREACHABLE)
    expect(result.apps).toBeUndefined()
  })

  it('propagates not-deployed from the id lookup', async () => {
    m.address = ''
    const result = await fetchVendorApps(VENDOR)
    expect(result.status).toBe(REGISTRY_STATUS.NOT_DEPLOYED)
  })
})
