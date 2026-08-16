/**
 * Visual capture harness for the Chippr brand alignment (spec 089) — the "actor" half of the
 * actor-critic screenshot loop. It renders the REAL app in a real browser across the surfaces a
 * member actually touches and writes PNGs for a critic to judge against the brand contract; fixes
 * land in the token layer or the component CSS and the loop repeats until a full round is clean.
 * Final shots live in `specs/089-chippr-brand-alignment/screenshots/`.
 *
 * Usage:
 *   npm run dev --workspace frontend -- --port 5199 --strictPort   # terminal 1
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
 *     PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright          # once
 *   NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-brand.mjs [baseUrl]
 *
 * Playwright is resolved from wherever the operator installed it, NEVER from a workspace manifest
 * — spec 075 documents why a screenshot harness does not justify lockfile exposure.
 *
 * WHY THIS HARNESS IS BROAD WHERE THE OTHERS ARE DEEP
 * The other capture-*.mjs harnesses photograph one surface in many states. A palette and type
 * change is the opposite shape: shallow per surface, but it can go wrong on ANY of them, and it
 * goes wrong most often on the surface nobody thought to look at. So this walks the nav.
 *
 * A SWATCH PAGE WOULD NOT DO. Rendering the tokens on a grid photographs the tokens, which the
 * contrast audit already checks by arithmetic and more reliably than a picture. What only a
 * screenshot can catch is a control whose background now equals the card it sits on — the spec-085
 * finding. That needs the real surfaces.
 *
 * Every non-loopback request is aborted, so a shot can never quietly depend on the internet.
 */
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

// Positional base URL, ignoring flags — so `--only=` may be passed in any position.
const BASE = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://127.0.0.1:5199'
const OUT = resolve(process.cwd(), 'specs/089-chippr-brand-alignment/screenshots')
const RPC_PORT = 9799
const RPC_ORIGIN = `http://127.0.0.1:${RPC_PORT}`
const CHAIN_ID = 137
const ACCOUNT = '0x1111111111111111111111111111111111111111'

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 390, height: 844 }

/** Only shots naming a filter are narrowed; `--only=nav,home` runs those two. */
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '')

function chromiumExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  const dir = readdirSync(root).find((name) => /^chromium-\d+$/.test(name))
  if (!dir) return undefined
  const candidates = [
    join(root, dir, 'chrome-linux', 'chrome'),
    join(root, dir, 'chrome-linux64', 'chrome'),
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}

// ---- stub chain ---------------------------------------------------------------------------------

/**
 * A minimal always-answering node. This harness is not testing chain logic — it is testing that
 * surfaces render on-brand — but a surface whose reads all fail renders its DEGRADED state, and a
 * screenshot of an error banner tells you nothing about the palette of the table it replaced.
 */
const word = (hex) => hex.replace(/^0x/, '').padStart(64, '0')
const uint = (n) => `0x${word(BigInt(n).toString(16))}`

/** ABI-encode a short string as a dynamic `string` return. */
function abiString(text) {
  const bytes = Buffer.from(text, 'utf8').toString('hex')
  return `0x${word('20')}${word(text.length.toString(16))}${bytes.padEnd(64, '0')}`
}

/**
 * Answer an `eth_call` by its 4-byte selector.
 *
 * Round 1 of the screenshot loop returned `0x` for every call, so Portfolio and
 * Earn photographed as skeleton loaders that never resolved — which says nothing
 * about the palette of the rows they were standing in for, and those rows are
 * the densest colour surfaces in the app. A shot of a spinner is not a shot of
 * the feature.
 */
function callAnswer(data = '') {
  switch (data.slice(0, 10).toLowerCase()) {
    case '0x70a08231': // balanceOf(address)
      return uint(1234n * 10n ** 6n)
    case '0x313ce567': // decimals()
      return uint(6)
    case '0x95d89b41': // symbol()
      return abiString('USDC')
    case '0x06fdde03': // name()
      return abiString('USD Coin')
    case '0x18160ddd': // totalSupply()
      return uint(10n ** 15n)
    case '0xdd62ed3e': // allowance(address,address)
      return uint(0)
    default:
      return '0x'
  }
}

function answer(method, params) {
  switch (method) {
    case 'eth_chainId':
      return `0x${CHAIN_ID.toString(16)}`
    case 'net_version':
      return String(CHAIN_ID)
    case 'eth_blockNumber':
      return '0x1312d00'
    case 'eth_getBalance':
      return '0x1bc16d674ec80000' // 2 native units
    case 'eth_getCode':
      // Token contracts must look like contracts, or the client discards the
      // balance reads above before making them.
      return '0x60806040'
    case 'eth_call':
      return callAnswer(params?.[0]?.data)
    case 'eth_gasPrice':
      return '0x6fc23ac00'
    default:
      return null
  }
}

function startStubChain() {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'POST,OPTIONS',
        })
        return res.end()
      }
      let payload
      try {
        payload = JSON.parse(body)
      } catch {
        res.writeHead(400)
        return res.end('bad json')
      }
      // ethers v6 batches concurrent calls into one array request on Polygon. Answering a batch
      // with a single object makes every read fail — a stub wrong in the same direction as an
      // honest degradation is the easiest fixture bug to miss (learned in capture-verify.mjs).
      const one = (call) => ({ jsonrpc: '2.0', id: call?.id ?? 1, result: answer(call?.method, call?.params) })
      const out = Array.isArray(payload) ? payload.map(one) : one(payload)
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
      res.end(JSON.stringify(out))
    })
  })
  return new Promise((ok) => server.listen(RPC_PORT, '127.0.0.1', () => ok(server)))
}

// ---- scenarios ----------------------------------------------------------------------------------

/**
 * Two groups, because they answer different questions.
 *
 *   BRAND surfaces — is the palette and the type actually here, everywhere?
 *   HONESTY surfaces — are success / warning / error / destructive still telling four different
 *   stories now that brand emphasis moved onto teal? (FR-008/FR-009, and the part of this change
 *   that could actually cause a member to take a wrong action.)
 */
const SHOTS = [
  // --- brand reach -------------------------------------------------------------------------
  {
    name: 'landing',
    url: '/',
    wait: '.app-shell',
    frame: null,
    note: 'Landing page — the first Chippr-palette surface anyone sees, and the one carrying the dark hero header override',
  },
  {
    name: 'home',
    url: '/app',
    wait: '.app-shell',
    frame: null,
    note: 'Home — headings in Space Grotesk, wager surfaces, primary CTA in Chippr Teal',
  },
  {
    name: 'portfolio',
    url: '/wallet?tab=portfolio',
    wait: '.app-shell',
    frame: null,
    note: 'Portfolio — balances, asset rows, the mono face on amounts and addresses',
  },
  {
    name: 'transfer',
    url: '/wallet?tab=paytransfer',
    wait: '.app-shell',
    frame: null,
    note: 'Transfer — form controls, inputs, the address field in JetBrains Mono',
  },
  {
    name: 'earn',
    url: '/wallet?tab=earn',
    wait: '.app-shell',
    frame: null,
    note: 'Earn — rate tables and data-dense rows, where a teal-on-teal collapse would show first',
  },
  {
    name: 'trade',
    url: '/wallet?tab=trade',
    wait: '.app-shell',
    frame: null,
    note: 'Trade — swap controls and the token picker',
  },
  {
    name: 'protect',
    url: '/wallet?tab=custody',
    wait: '.app-shell',
    frame: null,
    note: 'Protect — accordion sections, the surface whose buttons vanished into their own card in spec 085',
  },
  {
    name: 'recovery',
    url: '/wallet?tab=security',
    wait: '.app-shell',
    frame: null,
    note: 'Recovery — cards, and the destructive/danger affordances that must not read as ordinary',
  },
  {
    name: 'account',
    url: '/wallet?tab=account',
    wait: '.app-shell',
    frame: null,
    note: 'My Account — the spec-086 glass account cards and their tint palette on the new neutrals',
  },
  {
    name: 'reporting',
    url: '/wallet?tab=reports',
    wait: '.app-shell',
    frame: null,
    note: 'Reporting — charts and the categorical series ramp',
  },
  {
    name: 'apps',
    url: '/wallet?tab=apps',
    wait: '.app-shell',
    frame: null,
    note: 'Apps — the mini-app catalog, whose published packages are pinned and do NOT restyle with the host',
  },
  {
    name: 'nav-drawer',
    url: '/app',
    wait: '.app-shell',
    openNav: true,
    note: 'Nav drawer open — every section heading and row against the new surfaces',
  },
  {
    name: 'settings',
    url: '/wallet?tab=settings',
    wait: '.app-shell',
    frame: null,
    note: 'Settings — dense preference cards and toggles',
  },
  {
    name: 'network',
    url: '/wallet?tab=network',
    wait: '.app-shell',
    frame: null,
    note: 'Network endpoints — inputs, and the honest save/failure messaging (spec 069)',
  },
]

function expand() {
  const wanted = ONLY ? new Set(ONLY.split(',')) : null
  const out = []
  for (const shot of SHOTS) {
    if (wanted && !wanted.has(shot.name)) continue
    for (const viewport of [DESKTOP, MOBILE]) {
      for (const theme of ['light', 'dark']) {
        out.push({
          ...shot,
          name: `brand-${shot.name}-${viewport === MOBILE ? 'mobile' : 'desktop'}-${theme}`,
          theme,
          viewport,
        })
      }
    }
  }
  return out
}

// ---- page seeding -------------------------------------------------------------------------------

async function seedPage(page, shot) {
  await page.addInitScript(
    ({ theme, account, chainIdHex, chainId, rpcOrigin }) => {
      window.localStorage.setItem('themeMode', theme)
      window.localStorage.setItem('themePlatform', 'fairwins')
      window.localStorage.setItem('dev_warning_banner_dismissed', 'true')
      window.localStorage.setItem(
        'fairwins.entryGate.ack.v1',
        JSON.stringify({ terms: null, risk: null, at: new Date(0).toISOString() })
      )
      // The member's own RPC route (spec 069) is the ONLY supported way to point reads at the
      // stub — makeReadProvider resolves member-first. The failover must also be ours, or
      // resolveRpcEndpoints leaves the BUILD DEFAULT behind the override and the shot ends up
      // depending on a public endpoint the isolation route then aborts.
      window.localStorage.setItem(
        'fw_global_prefs',
        JSON.stringify({
          network_endpoints: {
            [chainId]: { url: rpcOrigin, failoverUrl: `${rpcOrigin}/failover` },
          },
        })
      )

      const provider = {
        isMetaMask: true,
        selectedAddress: account,
        chainId: chainIdHex,
        _callbacks: {},
        on(event, cb) {
          ;(this._callbacks[event] = this._callbacks[event] || []).push(cb)
        },
        removeListener(event, cb) {
          this._callbacks[event] = (this._callbacks[event] || []).filter((f) => f !== cb)
        },
        request({ method }) {
          switch (method) {
            case 'eth_accounts':
            case 'eth_requestAccounts':
              return Promise.resolve([account])
            case 'eth_chainId':
              return Promise.resolve(chainIdHex)
            case 'net_version':
              return Promise.resolve(String(chainId))
            case 'eth_blockNumber':
              return Promise.resolve('0x1312d00')
            case 'eth_getBalance':
              return Promise.resolve('0x1bc16d674ec80000')
            case 'eth_estimateGas':
              return Promise.resolve('0x5208')
            default:
              return Promise.resolve(null)
          }
        },
      }
      window.ethereum = provider
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({
              info: {
                uuid: 'c0ffee00-0000-4000-8000-000000000089',
                name: 'Capture Wallet',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                rdns: 'app.fairwins.capture',
              },
              provider,
            }),
          })
        )
      window.addEventListener('eip6963:requestProvider', announce)
      announce()
    },
    {
      theme: shot.theme,
      account: ACCOUNT,
      chainIdHex: `0x${CHAIN_ID.toString(16)}`,
      chainId: CHAIN_ID,
      rpcOrigin: RPC_ORIGIN,
    }
  )
}

/**
 * Connect through the REAL modal rather than pre-seeding wagmi storage.
 *
 * Almost every surface here is behind the connect gate, and an unconnected app photographs the
 * same "Connect Your Wallet" card fourteen times — which would say nothing about Portfolio, Earn
 * or Protect. Driving the actual connector also means the shots show the app in the state a member
 * reaches by doing what members do, instead of a state assembled by writing to localStorage.
 */
async function connectWallet(page) {
  const modal = page.locator('.connect-modal')
  if (!(await modal.count())) return

  const option = page.locator('.connect-modal__option:not(.unavailable)').filter({
    hasText: /capture wallet|injected|browser wallet|metamask/i,
  })
  const target = (await option.count()) ? option.first() : page.locator('.connect-modal__option:not([disabled])').first()

  if (await target.count()) {
    await target.click().catch(() => {})
    // Gone = connected. If it lingers the connector refused, and the shot should show the app as
    // it actually is rather than wait forever for a state that is not coming.
    await modal.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})
  }

  const close = page.locator('.connect-modal__close')
  if (await close.count()) await close.first().click().catch(() => {})
  await page.waitForTimeout(500)
}

/** Nothing may leave this machine — an offline run must fail fast, not photograph a stale cache. */
async function isolate(context, baseOrigin) {
  await context.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith(baseOrigin) || url.startsWith(RPC_ORIGIN)) return route.continue()
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
    return route.abort()
  })
}

// ---- capture ------------------------------------------------------------------------------------

async function captureOnce(browser, baseOrigin, shot) {
  const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 2 })
  await isolate(context, baseOrigin)
  const page = await context.newPage()
  await seedPage(page, shot)

  try {
    await page.goto(`${BASE}${shot.url}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(shot.wait, { timeout: 30_000 })

    // The dev banner and the activity engine's retry toast are harness artifacts (the isolation
    // route aborts the subgraph). Hidden here, never by changing app code.
    await page.addStyleTag({
      content: '.dev-warning-banner, .notification { display: none !important; }',
    })

    await connectWallet(page)

    if (shot.openNav) {
      const trigger = page
        .locator('button[aria-label*="menu" i], button[aria-label*="navigation" i], .nav-drawer-trigger')
        .first()
      if (await trigger.count()) {
        await trigger.click()
        await page.waitForSelector('.app-nav-drawer', { timeout: 10_000 }).catch(() => {})
      }
    }

    // Webfonts must be settled before the shutter: a shot taken mid-swap photographs the fallback
    // stack and would make the typography half of this change look like it did not land.
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(600)

    mkdirSync(OUT, { recursive: true })
    if (shot.frame) {
      await page.locator(shot.frame).screenshot({ path: join(OUT, `${shot.name}.png`) })
    } else {
      await page.screenshot({ path: join(OUT, `${shot.name}.png`) })
    }
    console.log(`wrote ${shot.name}.png`)
  } finally {
    await context.close()
  }
}

async function main() {
  const baseOrigin = new URL(BASE).origin
  const chain = await startStubChain()
  const browser = await chromium.launch({ executablePath: chromiumExecutable() })
  try {
    for (const shot of expand()) {
      // ONE retry: a dev server under HMR occasionally re-mounts mid-wait, and losing a long run
      // to that is a bad tool. A real failure fails twice and stops the run.
      try {
        await captureOnce(browser, baseOrigin, shot)
      } catch (error) {
        console.warn(`retrying ${shot.name}: ${String(error?.message ?? error).split('\n')[0]}`)
        await captureOnce(browser, baseOrigin, shot)
      }
    }
  } finally {
    await browser.close()
    chain.close()
  }
}

await main()
