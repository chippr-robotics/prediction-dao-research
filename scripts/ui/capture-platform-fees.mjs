/**
 * Visual capture harness for the spec-060 platform-fee DISCLOSURE surfaces — the "actor" half of
 * the actor-critic screenshot loop. It renders the real Earn deposit sheet and the real AdminPanel
 * Fees tab in a real browser and writes PNGs for a reviewer to critique; fixes land in the
 * components/CSS and the loop repeats until a whole round is clean. Final shots and the findings
 * README live in `specs/060-platform-fee-wrapper/screenshots/`.
 *
 * Usage:
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
 *     PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright     # once
 *   npm run dev --workspace frontend -- --port 5199 --strictPort &
 *   NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-platform-fees.mjs [outDir]
 *
 * Playwright is resolved from wherever the operator installed it, NEVER from a workspace manifest
 * — spec 075 documents why a screenshot harness does not justify lockfile exposure. Chromium ships
 * at /opt/pw-browsers; CHROMIUM_PATH overrides.
 *
 * WHAT IS REAL AND WHAT IS POSED. The components, their CSS and the real theme tokens are under
 * review and are untouched. What is posed is the world behind them, at the app's own seams:
 *
 *   · chain reads go through the spec-069 MEMBER RPC OVERRIDE to a loopback stub — the supported
 *     way to point this app's reads somewhere, never a build-default rewrite;
 *   · the wallet is a pre-authorized EIP-1193/EIP-6963 provider on Polygon (a trimmed port of
 *     cypress's mockWeb3Provider);
 *   · Morpho's public vault API is fulfilled from this file, because there is no vault list
 *     without it and the list is not what is under review.
 *
 * THE RATE IS THE VARIABLE. Each scenario changes exactly one thing — what the FeeRouter answers —
 * because the three member-facing states (a rate that applies, a rate of zero, a rate that could
 * not be read) are supposed to look meaningfully different, and whether they do is the review.
 *
 * Every request that is neither the dev server, the stub, nor the Morpho fulfilment is aborted, so
 * a shot can never quietly depend on the internet.
 */
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PORT = Number(process.env.HARNESS_PORT || 5199)
const BASE = `http://127.0.0.1:${PORT}`
const STUB_PORT = Number(process.env.STUB_PORT || 5197)
const STUB_ORIGIN = `http://127.0.0.1:${STUB_PORT}`
const OUT = resolve(process.argv[2] || join(REPO, 'specs/060-platform-fee-wrapper/screenshots'))

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 390, height: 844 }

/* Real addresses: the app resolves them from its own config, so a stub that answered for anything
 * else would be answering a question the app never asked. */
const ACCOUNT = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
const FEE_ROUTER_137 = '0xf8161fc26172621e9fbcc6c39500bb14b0902b35'
const POLYGON_USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'
const VAULT_137 = '0x781fb7f6d845e3be129289833b04d43aa8558c42'
const TREASURY_137 = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'

const USDC_DECIMALS = 6
const WALLET_BALANCE = 500_000_000n // 500 USDC

/** Selectors verified with `ethers.id(sig).slice(0, 10)`. */
const SELECTOR = {
  getService: '0xda47d856',
  serviceCount: '0x06237526',
  serviceAt: '0x36523e68',
  treasury: '0x61d027b3',
  maxWrappedFeeBps: '0x5a2330f1',
  hasRole: '0x91d14854',
  balanceOf: '0x70a08231',
  maxDeposit: '0x402d267d',
  allowance: '0xdd62ed3e',
}

/** keccak256 of each registered service label. */
const SERVICE_IDS = {
  'earn.lend': '0x775c3db7836aba902f26689de8429f1af00198b865b0512297ff25c6767dc6ea',
  'polymarket.taker': '0x39b50a4ce30d002216dd7b686f90aff5647079567f2ba170cde1a2f69eba6197',
  'polymarket.maker': '0xc3ce994b63a6d861614a48bfdb317059c7dfa5e5d3ae3466dc9613469953818f',
}

/** capBps / feeBps / kind per service. `earn.lend`'s rate is what each scenario varies. */
const SERVICE_TABLE = {
  'earn.lend': { capBps: 250, feeBps: 100, kind: 1 },
  'polymarket.taker': { capBps: 100, feeBps: 50, kind: 2 },
  'polymarket.maker': { capBps: 50, feeBps: 0, kind: 2 },
}

const word = (n) => BigInt(n).toString(16).padStart(64, '0')
const hex = (n) => `0x${Number(n).toString(16)}`

/** Mutable per-scenario world. */
let earnLendBps = 100
let routerReadable = true

function encodeService({ capBps, feeBps, kind }) {
  return `0x${word(capBps)}${word(feeBps)}${word(kind)}`
}

function serviceFor(serviceId) {
  const label = Object.keys(SERVICE_IDS).find((key) => SERVICE_IDS[key] === serviceId?.toLowerCase())
  if (!label) return { capBps: 0, feeBps: 0, kind: 0 } // Unregistered — the honest answer
  const svc = SERVICE_TABLE[label]
  return label === 'earn.lend' ? { ...svc, feeBps: earnLendBps } : svc
}

function ethCall({ to, data }) {
  const selector = String(data || '').slice(0, 10).toLowerCase()
  const target = String(to || '').toLowerCase()
  const arg = (i) => `0x${String(data).slice(10 + i * 64, 10 + (i + 1) * 64)}`

  if (target === FEE_ROUTER_137) {
    /*
     * The unreadable world answers EVERY router read with '0x'. Making only `getService` fail
     * would pose a state the app cannot actually be in, and would let the admin tab render a
     * treasury it could not have read.
     */
    if (!routerReadable) return '0x'
    switch (selector) {
      case SELECTOR.getService:
        return encodeService(serviceFor(arg(0)))
      case SELECTOR.serviceCount:
        return `0x${word(Object.keys(SERVICE_IDS).length)}`
      case SELECTOR.serviceAt:
        return Object.values(SERVICE_IDS)[Number(BigInt(arg(0)))] ?? `0x${word(0)}`
      case SELECTOR.treasury:
        return `0x${word(BigInt(TREASURY_137))}`
      case SELECTOR.maxWrappedFeeBps:
        return `0x${word(250)}`
      case SELECTOR.hasRole:
        return `0x${word(1)}` // the operator scenarios are OF the authorized surface
      default:
        return '0x'
    }
  }

  switch (selector) {
    case SELECTOR.balanceOf:
      // Which contract was asked decides the answer: shares on the vault, USDC on the token. A
      // nonzero share balance would pull in convertToAssets/maxWithdraw, which this world does
      // not answer — and the sheet would sit on "Loading your balances…" forever.
      return target === VAULT_137 ? `0x${word(0)}` : `0x${word(WALLET_BALANCE)}`
    case SELECTOR.maxDeposit:
      return `0x${word(2n ** 255n)}`
    case SELECTOR.allowance:
      return `0x${word(0)}`
    case SELECTOR.hasRole:
      return `0x${word(1)}`
    default:
      // Honestly unanswerable. '0x' makes ethers reject the decode, which every caller in this app
      // turns into an explicit unavailable state rather than a fabricated number.
      return '0x'
  }
}

function rpcResult({ method, params }) {
  switch (method) {
    case 'eth_chainId':
      return '0x89'
    case 'net_version':
      return '137'
    case 'eth_blockNumber':
      return hex(71_000_500)
    case 'eth_getCode':
      return '0x60806040'
    case 'eth_getLogs':
      // No fee changes in the lookback window. The tab says so in words, which is a state worth
      // photographing — a fabricated history would photograph a screen no fresh network has.
      return []
    case 'eth_call':
      return ethCall(params?.[0] || {})
    case 'eth_getBalance':
      return '0x0'
    case 'eth_estimateGas':
      return '0x5208'
    case 'eth_gasPrice':
    case 'eth_maxPriorityFeePerGas':
      return '0x3b9aca00'
    case 'eth_getTransactionCount':
      return '0x1'
    default:
      return null
  }
}

function readBody(req) {
  return new Promise((done) => {
    let text = ''
    req.on('data', (chunk) => {
      text += chunk
    })
    req.on('end', () => done(text))
  })
}

function startStubChain() {
  const server = createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-headers', '*')
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
    res.setHeader('content-type', 'application/json')
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    let body = null
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      body = null
    }
    const answer = (entry) => ({ jsonrpc: '2.0', id: entry?.id ?? 1, result: rpcResult(entry || {}) })
    res.end(JSON.stringify(Array.isArray(body) ? body.map(answer) : answer(body)))
  })
  server.listen(STUB_PORT, '127.0.0.1')
  return server
}

/*
 * The member's own RPC routes (spec 069) — the ONLY supported way to point the app's reads at the
 * stub. The failover is ours too: without one, `resolveRpcEndpoints` puts the BUILD DEFAULT behind
 * the override and a shot would depend on a public endpoint being reachable.
 */
const MEMBER_ENDPOINTS = Object.fromEntries(
  [1, 137].map((chainId) => [
    chainId,
    { url: `${STUB_ORIGIN}/rpc/${chainId}`, failoverUrl: `${STUB_ORIGIN}/rpc/${chainId}?failover=1` },
  ]),
)

const MORPHO_VAULTS = {
  data: {
    vaults: {
      items: [
        {
          address: VAULT_137,
          symbol: 'steakUSDC',
          name: 'Steakhouse USDC',
          listed: true,
          state: {
            totalAssetsUsd: 42_000_000,
            apy: 0.061,
            netApy: 0.055,
            curators: [{ name: 'Steakhouse Financial' }],
            allRewards: [],
          },
          asset: { name: 'USD Coin', address: POLYGON_USDC, decimals: USDC_DECIMALS, symbol: 'USDC' },
          chain: { id: 137 },
        },
      ],
    },
  },
}

/* --------------------------------------------------------------------------------------------- *
 * The shot matrix
 * --------------------------------------------------------------------------------------------- */

async function openDepositSheet(page) {
  await page.waitForSelector('.earn-vault-row', { timeout: 30000 })
  await page.locator('.earn-vault-row').first().click()
  await page.waitForSelector('.earn-vault-sheet', { timeout: 30000 })
  // The balances read has to land, or the sheet photographs its loading state under a name that
  // claims otherwise.
  await page.waitForSelector('.earn-vault-sheet-facts', { timeout: 30000 })
  await page.locator('#earn-amount').fill('100')
}

const SCENARIOS = [
  {
    name: 'deposit-fee-charged',
    world: { bps: 100, readable: true },
    path: '/wallet?tab=earn&view=lend',
    prepare: async (page) => {
      await openDepositSheet(page)
      // The disclosure itself — refuse to photograph a sheet that failed to render it.
      await page.waitForSelector('.earn-vault-sheet-facts >> text=/FairWins platform fee/i', {
        timeout: 15000,
      })
    },
  },
  {
    name: 'deposit-fee-zero',
    world: { bps: 0, readable: true },
    path: '/wallet?tab=earn&view=lend',
    prepare: async (page) => {
      await openDepositSheet(page)
      if (await page.locator('.earn-vault-sheet-facts', { hasText: /platform fee/i }).count()) {
        throw new Error('a fee line rendered at a rate of zero — the shot would state the opposite of the rule')
      }
    },
  },
  {
    name: 'deposit-fee-unreadable',
    world: { bps: 0, readable: false },
    path: '/wallet?tab=earn&view=lend',
    prepare: async (page) => {
      await openDepositSheet(page)
      await page.waitForSelector('.earn-vault-sheet >> text=/could not be confirmed/i', { timeout: 15000 })
    },
  },
  {
    name: 'admin-fees',
    world: { bps: 100, readable: true },
    path: '/admin/membership-revenue?view=fees',
    // A PAGE, not a sheet: the live table, the change form and the audit history are the surface,
    // and two of the three are below the fold at either viewport.
    fullPage: true,
    prepare: async (page) => {
      await page.waitForSelector('table[aria-label="Registered fee services"]', { timeout: 30000 })
      // The rate-change form is the control this surface exists for; a shot that stopped above it
      // would review the read-only half only.
      await page.waitForSelector('text=/Change a fee rate/i', { timeout: 15000 })
    },
  },
]

/**
 * `SHOT_FILTER=admin` narrows a run to the scenarios whose name contains it — a sixteen-shot
 * round is slow to iterate on when only one cell is being fixed. It never changes what a shot
 * asserts, and an unfiltered run is what the loop's exit criteria are measured on.
 */
const SHOT_FILTER = process.env.SHOT_FILTER || ''

function expandShots() {
  const out = []
  for (const scenario of SCENARIOS.filter((s) => s.name.includes(SHOT_FILTER))) {
    for (const [size, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
      for (const theme of ['light', 'dark']) {
        out.push({ ...scenario, name: `fees-${scenario.name}-${size}-${theme}`, theme, viewport })
      }
    }
  }
  return out
}

/**
 * The pre-installed Chromium; the launcher's own default would want a download.
 *
 * Every "not here" answer is `undefined`, which hands the choice back to Playwright's own
 * resolution — and, when that also comes up empty, to Playwright's own error, which already says
 * to run `npx playwright install`. A MISSING browsers root is one of those answers, not a crash:
 * `/opt/pw-browsers` is this image's layout, and on a machine where the operator installed
 * browsers the ordinary way it simply does not exist. Without the guard `readdirSync` threw
 * ENOENT before the launcher was ever reached, which reads as a broken harness rather than as a
 * different install location. CHROMIUM_PATH still wins outright.
 */
function chromiumExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  if (!existsSync(root)) return undefined
  const dir = readdirSync(root).find((name) => /^chromium-\d+$/.test(name))
  if (!dir) return undefined
  const candidates = [
    join(root, dir, 'chrome-linux', 'chrome'),
    join(root, dir, 'chrome-linux64', 'chrome'),
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}

async function seedPage(page, shot) {
  await page.addInitScript(
    ({ theme, endpoints, account, rpcUrl }) => {
      // Pre-paint seeding: theme, the spec-007 entry gate and the dev banner — the shots are of
      // the fee surfaces, not of the gates in front of them.
      window.localStorage.setItem('themeMode', theme)
      window.localStorage.setItem('dev_warning_banner_dismissed', 'true')
      window.localStorage.setItem(
        'fairwins.entryGate.ack.v1',
        JSON.stringify({ at: 1754870400000, termsVersion: 'capture-harness' }),
      )
      window.localStorage.setItem('fw_global_prefs', JSON.stringify({ network_endpoints: endpoints }))

      const provider = {
        isMetaMask: true,
        selectedAddress: account,
        chainId: '0x89',
        _callbacks: {},
        on(event, cb) {
          ;(this._callbacks[event] = this._callbacks[event] || []).push(cb)
        },
        removeListener(event, cb) {
          this._callbacks[event] = (this._callbacks[event] || []).filter((f) => f !== cb)
        },
        request({ method, params }) {
          switch (method) {
            case 'eth_accounts':
            case 'eth_requestAccounts':
              return Promise.resolve([account])
            case 'eth_chainId':
              return Promise.resolve('0x89')
            case 'net_version':
              return Promise.resolve('137')
            case 'eth_getBalance':
              return Promise.resolve('0xde0b6b3a7640000')
            default:
              /*
               * FORWARDED, not answered with null. `readProviderFor` hands an admin surface the
               * WALLET's provider when the scoped chain is the wallet's own — so a provider that
               * returned null for eth_call made the Fees tab render "Could not read the FeeRouter"
               * on a world where the router answers perfectly. The wallet rail and the read rail
               * have to see the same chain, which is what forwarding to the same stub means.
               */
              return fetch(rpcUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || [] }),
              })
                .then((r) => r.json())
                .then((data) => {
                  if (data?.error) throw Object.assign(new Error(data.error.message), { code: data.error.code })
                  return data.result
                })
          }
        },
      }
      window.ethereum = provider
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({
              info: {
                uuid: 'c0ffee00-0000-4000-8000-000000000060',
                name: 'Capture Wallet',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                rdns: 'app.fairwins.capture',
              },
              provider,
            }),
          }),
        )
      window.addEventListener('eip6963:requestProvider', announce)
      announce()
    },
    { theme: shot.theme, endpoints: MEMBER_ENDPOINTS, account: ACCOUNT, rpcUrl: `${STUB_ORIGIN}/rpc/137` },
  )
}

/**
 * Nothing may leave this machine. The one non-local URL that is answered rather than aborted is
 * Morpho's vault API — there is no vault list without it, and it is not what is under review.
 */
async function isolate(context, baseOrigin) {
  await context.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('https://api.morpho.org/')) {
      const query = String(route.request().postData() || '')
      const body = query.includes('EarnPositions')
        ? { data: { userByAddress: null } }
        : MORPHO_VAULTS
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    }
    if (url.startsWith(baseOrigin) || url.startsWith(STUB_ORIGIN)) return route.continue()
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
    return route.abort()
  })
}

/**
 * One shot, with ONE retry on a transient failure. A dev server under HMR occasionally re-mounts
 * mid-wait, and losing a sixteen-shot run to that is a bad tool. The retry repeats the same
 * scenario, so a REAL failure (a missing fee line, a fee line that should not exist) fails twice
 * and still stops the run. It never softens an assertion.
 */
async function captureShot(browser, baseOrigin, shot) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await captureOnce(browser, baseOrigin, shot)
      return
    } catch (error) {
      lastError = error
      if (attempt === 0) console.warn(`retrying ${shot.name}: ${error?.message?.split('\n')[0] ?? error}`)
    }
  }
  throw lastError
}

async function captureOnce(browser, baseOrigin, shot) {
  earnLendBps = shot.world.bps
  routerReadable = shot.world.readable
  const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 2 })
  try {
    await isolate(context, baseOrigin)
    const page = await context.newPage()
    await seedPage(page, shot)
    // domcontentloaded, not networkidle — the app polls sources this harness never settles; the
    // selector waits in `prepare` are the real readiness signal.
    await page.goto(`${BASE}${shot.path}`, { waitUntil: 'domcontentloaded' })
    /* THE ONE THING HIDDEN, AND WHY. The spec-031 activity poller reads FairWins' own contracts on
     * every cohort chain; this harness has no chain behind them, so it raises "Couldn't refresh
     * some activity" over the top-right corner. That toast is an artifact of the fixture, not of
     * the surface under review, and it lands on top of the sheet. Nothing else is hidden: every
     * fee state renders inline, so none of them can be suppressed here by accident. */
    await page.addStyleTag({ content: '.notification[role="alert"] { display: none !important; }' })
    await shot.prepare(page)

    /*
     * The one critic check a reviewer cannot make from the PNG. A table wider than the phone is
     * either clipped (the column is unreachable) or it pushes the whole PAGE sideways — and the
     * screenshot looks the same either way, because a full-page shot is taken at the document's
     * own width. Round 1 found exactly this on the fee-services table, where the clipped column
     * was Enforcement: the one that says whether a rate COSTS a member money. Asserted here so it
     * cannot come back silently; wide content belongs in its own scrolling container.
     */
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    if (overflow.scrollWidth > overflow.clientWidth) {
      throw new Error(
        `${shot.name}: the page scrolls horizontally (${overflow.scrollWidth}px of content in ` +
          `${overflow.clientWidth}px) — something wide is not inside its own scroll container`,
      )
    }
    await page.waitForTimeout(500)
    /*
     * Framing follows the surface. A deposit sheet is a fixed-position modal capped at 85vh, so it
     * is shot at the VIEWPORT — whether its content fits one screen is exactly what is under
     * review, and a full-page shot would paint it once over a tall page. The admin tab is an
     * ordinary page and is shot in full.
     */
    await page.screenshot({ path: join(OUT, `${shot.name}.png`), fullPage: Boolean(shot.fullPage) })
    console.log(`captured ${shot.name}.png`)
  } finally {
    await context.close()
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const baseOrigin = new URL(BASE).origin
  const stub = startStubChain()
  const browser = await chromium.launch({ executablePath: chromiumExecutable() })
  try {
    for (const shot of expandShots()) {
      await captureShot(browser, baseOrigin, shot)
    }
  } finally {
    await browser.close()
    stub.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
