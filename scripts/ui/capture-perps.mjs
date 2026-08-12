/**
 * Visual capture harness for the Perps view (spec 082) — the "actor" half of the actor-critic
 * screenshot loop: it renders the real view in a real browser and writes PNGs for a reviewer
 * (human or agent) to critique against the style kit; fixes land in Perps.css and the loop
 * repeats until the shots are clean. Final shots live in
 * `specs/082-perps-trade-view/screenshots/`.
 *
 * Self-contained upstream: the script starts a tiny STUB relay-gateway on 127.0.0.1:9797 serving
 * fixture /v1/perps/* responses (shapes from contracts/gateway-perps-api.md), so no real gateway
 * or venue is touched. The dev server must be started with the stub as its gateway:
 *
 *   VITE_RELAYER_URL=http://127.0.0.1:9797 npm run dev --workspace frontend -- --port 5199
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
 *     PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright   # once (or use a global install)
 *   NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-perps.mjs [baseUrl]
 *
 * Playwright is resolved from wherever the operator installed it, NEVER from a workspace
 * manifest — spec 075 documents why a screenshot harness does not justify lockfile exposure
 * (see capture-nav-drawer.mjs). Chromium ships at /opt/pw-browsers; CHROMIUM_PATH overrides.
 */
import { createServer } from 'node:http'
import { mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const BASE = process.argv[2] || 'http://127.0.0.1:5199'
const STUB_PORT = 9797
const OUT = resolve(process.cwd(), 'specs/082-perps-trade-view/screenshots')

/** The pre-installed Chromium; the launcher's own default would want a download. */
function chromiumExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  const dir = readdirSync(root).find((name) => /^chromium-\d+$/.test(name))
  return dir ? join(root, dir, 'chrome-linux', 'chrome') : undefined
}

// ---- fixture gateway ----------------------------------------------------------------------------

const PAIRS = [
  ['BTC/USD', 'gains', 137, 118432.5, 0.0000072, 8_400_000, 150, null],
  ['ETH/USD', 'gains', 42161, 4180.25, -0.0000031, 5_100_000, 150, null],
  ['SOL/USD', 'gains', 8453, 212.4, 0.0000119, 1_950_000, 100, null],
  ['EUR/USD', 'gains', 42161, 1.0841, 0.0000008, 3_200_000, 1000, null],
  ['BTC/USD', 'gmx', 42161, 118431.0, 0.0000049, 82_000_000, null, null, 'WBTC.b-USDC'],
  ['ETH/USD', 'gmx', 42161, 4180.4, -0.0000021, 64_500_000, null, null, 'WETH-USDC'],
  ['LINK/USD', 'gmx', 42161, 31.85, 0.0000094, 6_800_000, null, null, 'LINK-USDC'],
  ['BTC/USD', 'hyperliquid', null, 118433.5, 0.0000125, 1_920_000_000, 40, 2_310_525_977],
  ['ETH/USD', 'hyperliquid', null, 4180.1, -0.0000063, 890_000_000, 25, 1_150_000_000],
  ['SOL/USD', 'hyperliquid', null, 212.5, 0.0000381, 310_000_000, 20, 640_000_000],
  ['DOGE/USD', 'hyperliquid', null, 0.31842, 0.0000125, 96_000_000, 10, 120_000_000],
].map(([symbol, venue, chainId, price, fundingRate, oi, maxLeverage, vol, variant], i) => ({
  id: `${venue}:${chainId ?? 'l1'}:${symbol}:${i}`,
  venue,
  chainId,
  symbol,
  base: symbol.split('/')[0],
  quote: symbol.split('/')[1],
  variant: variant ?? null,
  price,
  fundingRate,
  fundingIntervalHours: 1,
  openInterestUsd: oi,
  maxLeverage,
  volume24hUsd: vol,
}))

const SOURCES_HEALTHY = {
  gains: { status: 'read', chains: [42161, 8453, 137], stale: false },
  gmx: { status: 'read', chains: [42161], stale: false },
  hyperliquid: { status: 'read', chains: [], stale: false },
}
const SOURCES_DEGRADED = {
  ...SOURCES_HEALTHY,
  gmx: { status: 'degraded', chains: [], stale: false },
}

const CONFIG_BODY = {
  attribution: {
    gains: { referrer: '0x2222222222222222222222222222222222222222' },
    gmx: { refCode: 'fairwins' },
    hyperliquid: { builderAddress: '0x3333333333333333333333333333333333333333' },
  },
  hyperliquidBuilderFee: { bps: 5, capBps: 10, source: 'chain' },
}

let degradedMode = false

function startStubGateway() {
  const server = createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('content-type', 'application/json')
    const url = new URL(req.url, `http://127.0.0.1:${STUB_PORT}`)
    if (url.pathname === '/v1/perps/pairs') {
      const sources = degradedMode ? SOURCES_DEGRADED : SOURCES_HEALTHY
      const pairs = degradedMode ? PAIRS.filter((p) => p.venue !== 'gmx') : PAIRS
      res.end(JSON.stringify({ pairs, sources, asOf: new Date().toISOString() }))
    } else if (url.pathname === '/v1/perps/config') {
      res.end(JSON.stringify(CONFIG_BODY))
    } else if (url.pathname === '/v1/perps/positions') {
      res.end(
        JSON.stringify({
          positions: [
            {
              id: 'gains:42161:7',
              venue: 'gains',
              chainId: 42161,
              symbol: 'BTC/USD',
              direction: 'long',
              sizeUsd: 1000,
              collateralUsd: 100,
              entryPrice: 117210.5,
              leverage: 10,
              unrealizedPnlUsd: null,
            },
            {
              id: 'hyperliquid:ETH:short',
              venue: 'hyperliquid',
              chainId: null,
              symbol: 'ETH/USD',
              direction: 'short',
              sizeUsd: 4500,
              collateralUsd: 450,
              entryPrice: 4232.1,
              leverage: 10,
              unrealizedPnlUsd: 55.8,
            },
          ],
          sources: { gains: { status: 'read', chains: [42161] }, hyperliquid: { status: 'read', chains: [] } },
        }),
      )
    } else {
      res.statusCode = 404
      res.end(JSON.stringify({ error: { code: 'not_found', reason: 'stub' } }))
    }
  })
  return new Promise((resolveStart) => server.listen(STUB_PORT, '127.0.0.1', () => resolveStart(server)))
}

// ---- capture ------------------------------------------------------------------------------------

const SHOTS = [
  { name: 'perps-desktop-light', theme: 'light', viewport: { width: 1280, height: 900 } },
  { name: 'perps-desktop-dark', theme: 'dark', viewport: { width: 1280, height: 900 } },
  { name: 'perps-mobile-light', theme: 'light', viewport: { width: 390, height: 844 } },
  { name: 'perps-mobile-dark', theme: 'dark', viewport: { width: 390, height: 844 } },
  { name: 'perps-degraded-venue', theme: 'light', viewport: { width: 1280, height: 900 }, degraded: true },
]

async function main() {
  mkdirSync(OUT, { recursive: true })
  const stub = await startStubGateway()
  const browser = await chromium.launch({ executablePath: chromiumExecutable() })
  try {
    for (const shot of SHOTS) {
      degradedMode = Boolean(shot.degraded)
      const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 2 })
      const page = await context.newPage()
      await page.addInitScript((theme) => {
        // Pre-paint seeding: theme, the spec-007 entry gate, and the dev banner — the shot is of
        // the Perps view, not the gates in front of it.
        window.localStorage.setItem('themeMode', theme)
        window.localStorage.setItem('dev_warning_banner_dismissed', 'true')
        window.localStorage.setItem(
          'fairwins.entryGate.ack.v1',
          JSON.stringify({ at: 1754870400000, termsVersion: 'capture-harness' }),
        )

        // Minimal pre-authorized EIP-1193 + EIP-6963 wallet on Polygon so the wallet-connected
        // Trade content renders (a trimmed port of cypress mockWeb3Provider with preAuthorized).
        const ACCOUNT = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
        const provider = {
          isMetaMask: true,
          selectedAddress: ACCOUNT,
          chainId: '0x89',
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
                return Promise.resolve([ACCOUNT])
              case 'eth_chainId':
                return Promise.resolve('0x89')
              case 'net_version':
                return Promise.resolve('137')
              case 'eth_blockNumber':
                return Promise.resolve('0x1')
              case 'eth_getBalance':
                return Promise.resolve('0xde0b6b3a7640000')
              case 'eth_call':
              case 'eth_estimateGas':
                return Promise.resolve('0x')
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
                  uuid: 'c0ffee00-0000-4000-8000-000000000082',
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
      }, shot.theme)
      // domcontentloaded, not networkidle — the app polls external price feeds that never settle
      // (and are unreachable in a sandboxed run); the selector wait below is the real readiness.
      await page.goto(`${BASE}/wallet?tab=trade&view=perps`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.perps-view', { timeout: 15000 })
      // Let fonts/badges settle before the shot.
      await page.waitForTimeout(500)
      await page.screenshot({ path: join(OUT, `${shot.name}.png`), fullPage: true })
      console.log(`captured ${shot.name}.png`)
      await context.close()
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
