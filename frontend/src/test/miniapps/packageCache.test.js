/**
 * Spec 073 T044 — the mini-app package cache in the service worker (T043, R10).
 *
 * These tests load and evaluate the SHIPPED `public/sw.js`, rather than a copy
 * of its logic living in `src/`. A service worker is a classic script that
 * cannot be imported, and the usual workaround — reimplementing the policy in a
 * testable module — would test the reimplementation. The file that runs in the
 * member's browser is the file asserted here.
 *
 * The properties that matter:
 *   - only content-addressed package URLs are cache-first (nothing else may be);
 *   - a new version is a new CID is a new URL, so an old cache entry can never
 *     serve a new package;
 *   - the cache is bounded, and the bound is enforced by an index that survives
 *     worker termination;
 *   - `activate` does not delete the package cache (the sweep is by ownership,
 *     not by shell version).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SW_PATH = path.resolve(__dirname, '../../../public/sw.js')

/** A minimal in-memory Cache/CacheStorage good enough for the worker's use. */
function makeCaches() {
  const stores = new Map()
  const keyOf = (req) => (typeof req === 'string' ? req : req.url)
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const store = stores.get(name)
    return {
      match: async (req) => store.get(keyOf(req)) ?? undefined,
      put: async (req, res) => { store.set(keyOf(req), res) },
      delete: async (req) => store.delete(keyOf(req)),
      addAll: async () => {},
      _store: store,
    }
  }
  return {
    api: {
      open,
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
      match: async (req) => {
        for (const store of stores.values()) {
          const hit = store.get(keyOf(req))
          if (hit) return hit
        }
        return undefined
      },
    },
    stores,
    open,
  }
}

/**
 * Evaluate sw.js with worker globals injected and hand back its internals.
 * The listeners it registers land on the fake `self` and are simply unused.
 */
function loadWorker({ fetchImpl } = {}) {
  const source = fs.readFileSync(SW_PATH, 'utf8')
  const cachesHarness = makeCaches()
  const self = {
    addEventListener: () => {},
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
    registration: {},
  }
  const factory = new Function(
    'self', 'caches', 'fetch', 'Response', 'Request', 'URL', 'console',
    `${source}
     return {
       isMiniAppPackageUrl, touchMiniAppIndex, serveMiniAppPackage,
       readMiniAppIndex, recordMiniAppUse,
       MINIAPP_CACHE, MINIAPP_CACHE_MAX_ENTRIES, MINIAPP_INDEX_URL,
       OWNED_CACHES, CACHE_VERSION,
     }`,
  )
  const api = factory(
    self,
    cachesHarness.api,
    fetchImpl || (async () => new Response('', { status: 200 })),
    Response,
    Request,
    URL,
    console,
  )
  return { ...api, caches: cachesHarness }
}

let sw
beforeEach(() => { sw = loadWorker() })

const CID_V1 = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
const CID_V0 = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
const GATEWAY = 'https://gateway.example'

describe('URL classification', () => {
  it('matches a package file on any gateway, for both CID versions', () => {
    expect(sw.isMiniAppPackageUrl(`${GATEWAY}/ipfs/${CID_V1}/entry.js`)).toBe(true)
    expect(sw.isMiniAppPackageUrl(`${GATEWAY}/ipfs/${CID_V0}/manifest.json`)).toBe(true)
    // A member's own node (spec 069 bring-your-own-node) is classified the same.
    expect(sw.isMiniAppPackageUrl(`http://127.0.0.1:8080/ipfs/${CID_V1}/entry.js`)).toBe(true)
    expect(sw.isMiniAppPackageUrl(`${GATEWAY}/ipfs/${CID_V1}/nested/style.css`)).toBe(true)
  })

  it('does not match anything that is not a content-addressed package file', () => {
    for (const url of [
      `${GATEWAY}/ipfs/${CID_V1}`,               // directory, not a named file
      `${GATEWAY}/ipfs/not-a-cid/entry.js`,      // path shape without a real CID
      `${GATEWAY}/ipns/example.com/entry.js`,    // IPNS is MUTABLE — never cache-first
      'https://fairwins.app/assets/index.js',    // the app's own bundle
      'https://fairwins.app/index.html',
      `ftp://x/ipfs/${CID_V1}/entry.js`,
      'not a url',
      '',
      null,
    ]) {
      expect(sw.isMiniAppPackageUrl(url), String(url)).toBe(false)
    }
  })

  it('rejects a CID-shaped segment that is the wrong length', () => {
    expect(sw.isMiniAppPackageUrl(`${GATEWAY}/ipfs/Qmtooshort/entry.js`)).toBe(false)
    expect(sw.isMiniAppPackageUrl(`${GATEWAY}/ipfs/bshort/entry.js`)).toBe(false)
  })
})

describe('LRU policy (pure)', () => {
  it('moves a touched url to the head', () => {
    const { index } = sw.touchMiniAppIndex(['a', 'b', 'c'], 'c', 10)
    expect(index).toEqual(['c', 'a', 'b'])
  })

  it('never duplicates an entry it re-touches', () => {
    const { index } = sw.touchMiniAppIndex(['a', 'b'], 'a', 10)
    expect(index).toEqual(['a', 'b'])
  })

  it('evicts the least recently used once past the ceiling', () => {
    const { index, evict } = sw.touchMiniAppIndex(['b', 'c'], 'a', 2)
    expect(index).toEqual(['a', 'b'])
    expect(evict).toEqual(['c']) // 'c' was the coldest
  })

  it('evicts everything past the ceiling, not just one entry', () => {
    const { index, evict } = sw.touchMiniAppIndex(['b', 'c', 'd', 'e'], 'a', 2)
    expect(index).toEqual(['a', 'b'])
    expect(evict).toEqual(['c', 'd', 'e'])
  })

  it('tolerates a damaged index — it is a hint, never data', () => {
    expect(sw.touchMiniAppIndex(null, 'a', 3).index).toEqual(['a'])
    expect(sw.touchMiniAppIndex(['a', 42, null, 'b'], 'a', 3).index).toEqual(['a', 'b'])
  })

  it('never evicts to nothing, even given a nonsensical ceiling', () => {
    expect(sw.touchMiniAppIndex([], 'a', 0).index).toEqual(['a'])
  })
})

describe('cache-first serving', () => {
  const url = `${GATEWAY}/ipfs/${CID_V1}/entry.js`

  it('caches a miss and serves the cached copy next time without refetching', async () => {
    let fetches = 0
    const worker = loadWorker({
      fetchImpl: async () => { fetches += 1; return new Response('bytes', { status: 200 }) },
    })
    expect(await (await worker.serveMiniAppPackage(new Request(url))).text()).toBe('bytes')
    expect(fetches).toBe(1)
    expect(await (await worker.serveMiniAppPackage(new Request(url))).text()).toBe('bytes')
    expect(fetches).toBe(1) // second launch never touched the network
  })

  it('A NEW CID BYPASSES THE OLD CACHE — the property the whole design rests on', async () => {
    let served = 0
    const worker = loadWorker({
      fetchImpl: async () => { served += 1; return new Response(`v${served}`, { status: 200 }) },
    })
    const v1 = `${GATEWAY}/ipfs/${CID_V1}/entry.js`
    const v2 = `${GATEWAY}/ipfs/${CID_V0}/entry.js` // an approved update = a different CID

    expect(await (await worker.serveMiniAppPackage(new Request(v1))).text()).toBe('v1')
    // The new version is a different URL, so the cache cannot answer it. A
    // curator-approved update can never be shadowed by a cached old package.
    expect(await (await worker.serveMiniAppPackage(new Request(v2))).text()).toBe('v2')
    expect(served).toBe(2)
  })

  it('does not cache a failed response', async () => {
    let fetches = 0
    const worker = loadWorker({
      fetchImpl: async () => { fetches += 1; return new Response('nope', { status: 504 }) },
    })
    await worker.serveMiniAppPackage(new Request(url))
    await worker.serveMiniAppPackage(new Request(url))
    expect(fetches).toBe(2) // a gateway outage must not become a permanent one
  })

  it('does not cache an opaque response', async () => {
    let fetches = 0
    const worker = loadWorker({
      fetchImpl: async () => {
        const res = new Response('', { status: 200 })
        Object.defineProperty(res, 'type', { value: 'opaque' })
        return res
      },
    })
    const wrapped = async () => { fetches += 1; return worker.serveMiniAppPackage(new Request(url)) }
    await wrapped()
    await wrapped()
    expect(fetches).toBe(2)
  })

  it('bounds the cache and drops the coldest package', async () => {
    const worker = loadWorker({ fetchImpl: async () => new Response('bytes', { status: 200 }) })
    const max = worker.MINIAPP_CACHE_MAX_ENTRIES
    const at = (i) => `${GATEWAY}/ipfs/${CID_V1}/f${i}.js`

    for (let i = 0; i < max; i += 1) await worker.serveMiniAppPackage(new Request(at(i)))
    await worker.serveMiniAppPackage(new Request(at(0))) // keep the oldest warm
    await worker.serveMiniAppPackage(new Request(at(max))) // one over the ceiling

    const cache = await worker.caches.open(worker.MINIAPP_CACHE)
    expect(await cache.match(at(max))).toBeDefined()
    expect(await cache.match(at(0))).toBeDefined()  // re-touched, so it survived
    expect(await cache.match(at(1))).toBeUndefined() // coldest, evicted
  })

  it('keeps the index inside the cache, so it survives worker termination', async () => {
    const worker = loadWorker({ fetchImpl: async () => new Response('bytes', { status: 200 }) })
    await worker.serveMiniAppPackage(new Request(url))
    const cache = await worker.caches.open(worker.MINIAPP_CACHE)
    // An in-memory index would reset every time the browser killed the worker,
    // and the cache would grow unbounded while believing it was empty.
    expect(await worker.readMiniAppIndex(cache)).toEqual([url])
  })

  it('serves the cached copy when revalidation is impossible (offline)', async () => {
    let online = true
    const worker = loadWorker({
      fetchImpl: async () => {
        if (!online) throw new Error('offline')
        return new Response('bytes', { status: 200 })
      },
    })
    await worker.serveMiniAppPackage(new Request(url))
    online = false
    expect(await (await worker.serveMiniAppPackage(new Request(url))).text()).toBe('bytes')
  })
})

describe('the cache is not a trust boundary', () => {
  const url = `${GATEWAY}/ipfs/${CID_V1}/entry.js`

  it('serves cached bytes verbatim — it never validates, and never repairs', async () => {
    const worker = loadWorker({ fetchImpl: async () => new Response('honest bytes', { status: 200 }) })
    await worker.serveMiniAppPackage(new Request(url))

    // Poison the entry, as a compromised cache or a corrupted store would.
    const cache = await worker.caches.open(worker.MINIAPP_CACHE)
    await cache.put(url, new Response('evil()', { status: 200 }))

    // The worker hands the poisoned bytes straight to the loader. That is
    // CORRECT: the worker is a transport, and making it a second, weaker
    // integrity checker would invite trusting it. Refusal belongs downstream,
    // where the manifest keccak and per-file sha256 are checked against the
    // hash the registry committed to — `loader.test.js` covers that the
    // tampered case executes nothing (FR-011).
    expect(await (await worker.serveMiniAppPackage(new Request(url))).text()).toBe('evil()')
  })

  it('caches per file, so one package\'s entry cannot answer for another\'s', async () => {
    const worker = loadWorker({
      fetchImpl: async (req) => new Response(new URL(req.url ?? req).pathname, { status: 200 }),
    })
    const entry = `${GATEWAY}/ipfs/${CID_V1}/entry.js`
    const style = `${GATEWAY}/ipfs/${CID_V1}/style.css`
    expect(await (await worker.serveMiniAppPackage(new Request(entry))).text()).toMatch(/entry\.js$/)
    expect(await (await worker.serveMiniAppPackage(new Request(style))).text()).toMatch(/style\.css$/)
  })
})

describe('cache ownership at activate', () => {
  it('owns the package cache, so the activate sweep cannot delete it', () => {
    // A bare `k !== CACHE_VERSION` filter would wipe every cached package on
    // every deploy — the package cache is deliberately NOT versioned with the
    // shell, because its entries are immutable and outlive a release.
    expect(sw.OWNED_CACHES).toContain(sw.MINIAPP_CACHE)
    expect(sw.OWNED_CACHES).toContain(sw.CACHE_VERSION)
  })

  it('names the index with an unresolvable host so it can never collide with a gateway', () => {
    expect(sw.MINIAPP_INDEX_URL).toMatch(/\.invalid\//)
    expect(sw.isMiniAppPackageUrl(sw.MINIAPP_INDEX_URL)).toBe(false)
  })
})
