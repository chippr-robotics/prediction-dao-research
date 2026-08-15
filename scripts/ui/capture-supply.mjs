/**
 * Visual capture harness for Earn ▸ Supply — the "actor" half of the actor-critic screenshot
 * loop. It renders the real `SupplyView` in a real browser and writes PNGs for a reviewer to
 * critique; fixes land in `Supply.css` / the component and the loop repeats until the shots are
 * clean. Final shots live in `specs/067-bridge-pool-liquidity/screenshots/`.
 *
 * Usage:
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
 *     PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright     # once
 *   NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-supply.mjs [outDir]
 *
 * Playwright is resolved from wherever the operator installed it, NEVER from a workspace manifest
 * — spec 075 documents why a screenshot harness does not justify lockfile exposure. Chromium
 * ships at /opt/pw-browsers; CHROMIUM_PATH overrides.
 *
 * WHY THIS ONE BOOTS ITS OWN SERVER. The pool list is fed by `useLiquidityCatalog`, which reads a
 * `LiquidityRouter` — and the router is deployed on NO network yet (issue #966), so against the
 * ordinary dev server this surface can only ever photograph its empty state. The data therefore
 * comes through `SupplyView`'s own `catalog` prop, the seam its vitest suite already uses, from a
 * throwaway page this script writes, serves, and deletes:
 *
 *   frontend/supply-harness.html        the entry
 *   frontend/src/dev/__supplyHarness.*  the page + two hook stubs (wallet, asset list) that would
 *                                       otherwise drag in the whole app shell
 *   frontend/vite.harness.config.js     the base config plus aliases pointing at those stubs
 *
 * All four are written on start and removed on exit, so nothing dev-only is left in the app tree
 * or the build. What is NOT stubbed is the part under review: the component, `Supply.css`, and the
 * real theme tokens from `theme.css`.
 *
 * Every request that is not the harness server is aborted, so a shot can never quietly depend on
 * the internet.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FRONTEND = join(REPO, 'frontend')
const PORT = Number(process.env.HARNESS_PORT || 5198)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = resolve(process.argv[2] || join(REPO, 'specs/067-bridge-pool-liquidity/screenshots'))

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 390, height: 844 }

/** The pre-installed Chromium; the launcher's own default would want a download. */
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

// ---- the throwaway harness page ------------------------------------------------------------

const HARNESS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Supply harness</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/dev/__supplyHarness.jsx"></script>
  </body>
</html>
`

const STUB_WALLET = `export const useWallet = () => ({
  address: '0x1111111111111111111111111111111111111111',
  chainId: 1,
  isConnected: true,
})
export default useWallet
`

const STUB_ASSETS = `export const useSelectableAssets = () => ({ options: [], defaultKey: null })
export default useSelectableAssets
`

const HARNESS_CONFIG = `import { mergeConfig } from 'vite'
import base from './vite.config.js'

/* Written by scripts/ui/capture-supply.mjs; deleted when it exits. Stubs the two hooks that
   would drag the whole app shell into a single-component page. */
export default async (env) => {
  const resolved = typeof base === 'function' ? await base(env) : base
  return mergeConfig(resolved, {
    resolve: {
      alias: [
        { find: /^.*hooks\\/useWalletManagement$/, replacement: '/src/dev/__stubWallet.js' },
        { find: /^.*hooks\\/useSelectableAssets$/, replacement: '/src/dev/__stubAssets.js' },
      ],
    },
  })
}
`

const HARNESS_PAGE = `/* Written by scripts/ui/capture-supply.mjs; deleted when it exits. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../contexts/ThemeContext.jsx'
import SupplyView from '../components/earn/SupplyView'
import { POOL_KIND } from '../lib/liquidity/liquidityRouter'
import { partialWithdrawalCopy } from '../lib/liquidity/liquidityCopy'
import '../theme.css'
import '../index.css'
import '../App.css'
import '../components/earn/Earn.css'

const USDC = { address: '0xc1', symbol: 'USDC', decimals: 6 }
const WETH = { address: '0xe1', symbol: 'WETH', decimals: 18 }
const USDT = { address: '0xt1', symbol: 'USDT', decimals: 6 }
const DAI = { address: '0xd1', symbol: 'DAI', decimals: 18 }

const trading = (key, networkName, chainId, assets, parts, over = {}) => ({
  key,
  poolId: key,
  chainId,
  networkName,
  kind: POOL_KIND.TRADING_LP,
  protocol: 'Uniswap',
  listing: { poolId: key, poolAddress: '0xpool', token0: assets[0].address, token1: assets[1].address },
  assets,
  feeTier: 500,
  estimatedReturnApr: null,
  totalSuppliedParts: parts,
  totalSuppliedLabel: parts.join(' + '),
  enabled: true,
  available: true,
  unavailableReason: null,
  feeBps: 25,
  feeAvailable: true,
  ...over,
})

const POOLS = [
  trading('a', 'Ethereum', 1, [USDC, WETH], ['32.8M USDC', '35K WETH']),
  trading('b', 'Ethereum', 1, [WETH, USDT], ['26K WETH', '30.2M USDT']),
  trading('c', 'Base', 8453, [USDC, DAI], ['4.1M USDC', '3.9M DAI'], {
    available: false,
    enabled: false,
    unavailableReason: 'retired',
  }),
  {
    key: 'd',
    poolId: 'd',
    chainId: 1,
    networkName: 'Ethereum',
    kind: POOL_KIND.BRIDGE_LP,
    protocol: 'Across',
    listing: { poolId: 'd', poolAddress: '0xhub', token0: USDC.address, token1: null },
    assets: [USDC],
    feeTier: null,
    estimatedReturnApr: null,
    totalSuppliedParts: ['8.4M USDC'],
    totalSuppliedLabel: '8.4M USDC',
    enabled: true,
    available: true,
    unavailableReason: null,
    feeBps: 0,
    feeAvailable: false,
  },
]

const POSITIONS = [
  {
    key: 'p1',
    pool: POOLS[0],
    currentValueLabel: '500 USDC + 0.12 WETH',
    earningsLabel: '3.2 USDC + 0.001 WETH',
    compositionLabel: '62% USDC / 38% WETH',
    partialNote: null,
    isEstimate: true,
  },
  {
    key: 'p2',
    pool: POOLS[3],
    currentValueLabel: '1,000 USDC',
    earningsLabel: null,
    compositionLabel: null,
    partialNote: partialWithdrawalCopy('400 USDC'),
    isEstimate: true,
  },
]

const catalog = (over = {}) => ({
  status: 'ready',
  pools: POOLS,
  positions: [],
  networks: [{ chainId: 1, name: 'Ethereum', status: 'ready', poolsComplete: true }],
  asOf: Date.UTC(2026, 0, 1, 14, 32),
  refresh: () => {},
  ...over,
})

const scenario = new URLSearchParams(window.location.search).get('scenario') || 'list'
const DATA = {
  list: catalog(),
  positions: catalog({ positions: POSITIONS }),
  empty: catalog({ pools: [] }),
}[scenario]

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <div className="wallet-page" style={{ padding: '1rem', maxWidth: 900, margin: '0 auto' }}>
        <div className="earn-panel section">
          <SupplyView catalog={DATA} />
        </div>
      </div>
    </ThemeProvider>
  </StrictMode>,
)
`

const TEMP_FILES = [
  [join(FRONTEND, 'supply-harness.html'), HARNESS_HTML],
  [join(FRONTEND, 'vite.harness.config.js'), HARNESS_CONFIG],
  [join(FRONTEND, 'src/dev/__supplyHarness.jsx'), HARNESS_PAGE],
  [join(FRONTEND, 'src/dev/__stubWallet.js'), STUB_WALLET],
  [join(FRONTEND, 'src/dev/__stubAssets.js'), STUB_ASSETS],
]

function writeHarness() {
  mkdirSync(join(FRONTEND, 'src/dev'), { recursive: true })
  for (const [path, body] of TEMP_FILES) writeFileSync(path, body)
}

function removeHarness() {
  for (const [path] of TEMP_FILES) rmSync(path, { force: true })
}

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/supply-harness.html`)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`harness server never came up on ${BASE}`)
}

// ---- the shot matrix -------------------------------------------------------------------------

const SCENARIOS = [
  { name: 'list', scenario: 'list' },
  { name: 'positions', scenario: 'positions' },
  {
    name: 'searching',
    scenario: 'list',
    act: async (page) => {
      await page.getByRole('searchbox').fill('usdc')
      await page.getByRole('button', { name: 'Trading', exact: true }).click()
    },
  },
  {
    name: 'no-match',
    scenario: 'list',
    act: (page) => page.getByRole('searchbox').fill('solana'),
  },
  {
    name: 'availability-open',
    scenario: 'list',
    act: (page) => page.getByText('Where pools are available').click(),
  },
  { name: 'empty', scenario: 'empty' },
]

writeHarness()
const server = spawn(
  'npx',
  ['vite', '--config', 'vite.harness.config.js', '--port', String(PORT), '--strictPort'],
  { cwd: FRONTEND, stdio: 'ignore' },
)

let browser
try {
  await waitForServer()
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
  browser = await chromium.launch({ executablePath: chromiumExecutable() })

  for (const theme of ['light', 'dark']) {
    for (const [label, viewport] of [
      ['desktop', DESKTOP],
      ['mobile', MOBILE],
    ]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 2 })
      await context.route('**/*', (route) => {
        const url = route.request().url()
        const local = url.startsWith(BASE) || url.startsWith('data:') || url.startsWith('blob:')
        return local ? route.continue() : route.abort()
      })
      await context.addInitScript((mode) => window.localStorage.setItem('themeMode', mode), theme)

      for (const shot of SCENARIOS) {
        const page = await context.newPage()
        // One retry: the dev server can re-mount mid-wait while it warms up.
        for (let attempt = 0; ; attempt++) {
          try {
            await page.goto(`${BASE}/supply-harness.html?scenario=${shot.scenario}`, {
              waitUntil: 'networkidle',
            })
            await page.waitForSelector('.supply-view', { timeout: 15_000 })
            break
          } catch (err) {
            if (attempt >= 1) throw err
          }
        }
        await page.addStyleTag({
          content: '.dev-warning-banner, .notification { display: none !important; }',
        })
        if (shot.act) await shot.act(page)
        await page.waitForTimeout(300)
        const target = (await page.$('.earn-panel')) || page
        await target.screenshot({ path: join(OUT, `${shot.name}-${label}-${theme}.png`) })
        await page.close()
      }
      await context.close()
    }
  }
  console.log(`shots in ${OUT}`)
} finally {
  await browser?.close()
  server.kill()
  removeHarness()
}
