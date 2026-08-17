/**
 * Visual capture harness for the spec-093 admin mini-apps — the "actor" half of the
 * actor-critic screenshot loop. Renders the real Control Room and real admin app screens
 * (shell, rail, dashboards, chart kit, theme tokens all real) in a real browser and writes
 * PNGs for the critic to read. Final shots live in `specs/093-admin-mini-apps/screenshots/`.
 *
 * Usage:
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
 *     PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright     # once
 *   NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-admin-apps.mjs [outDir]
 *
 * What is stubbed (via throwaway vite aliases, written on start and deleted on exit):
 * the DATA hooks — roles, wallet, fee estate, gateway status, registry catalog/authority,
 * membership stats, callsign metrics — so each scenario can pose populated, partial and
 * unreadable states deliberately. What is NOT stubbed is the part under review: the admin
 * components, their CSS, the chart kit, and the real theme tokens.
 *
 * On-chain reads that live inside the components themselves (the incident pause sweep, the
 * liquidity router sweep, the reference-chain membership read) go through the aborted network
 * and photograph their honest unreadable/not-deployed states — that is deliberate; those states
 * are part of what the critic reviews.
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
const PORT = Number(process.env.HARNESS_PORT || 5199)
const BASE = `http://127.0.0.1:${PORT}`
const OUT = resolve(process.argv[2] || join(REPO, 'specs/093-admin-mini-apps/screenshots'))

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 390, height: 844 }

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

// ---- throwaway harness files -----------------------------------------------------------------

const HARNESS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin apps harness</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/dev/__adminHarness.jsx"></script>
  </body>
</html>
`

const STUB_ROLES = `/* Written by capture-admin-apps.mjs; deleted on exit. */
const q = new URLSearchParams(window.location.search)
const roles = (q.get('roles') || '').split(',').filter(Boolean)
const sweep = q.get('sweep') || 'ok' // ok | dark
const HELD = new Set(roles)
const NAME = {
  admin: 'ADMIN', guardian: 'GUARDIAN', moderator: 'ACCOUNT_MODERATOR',
  rolemanager: 'ROLE_MANAGER', sanctions: 'SANCTIONS_ADMIN', feeadmin: 'FEE_ADMIN',
  staking: 'STAKING_ADMIN', liquidity: 'LIQUIDITY_ADMIN',
}
const has = (role) => [...HELD].some((k) => NAME[k] === role)
export const useRoles = () => ({
  hasRole: has,
  hasAnyRole: (rs) => rs.some(has),
  estateRead: sweep === 'dark'
    ? { read: [], unreadable: [63, 80002], swept: true }
    : { read: [63, 80002], unreadable: [], swept: true },
  chainsForRole: (r) => (has(r) ? [63] : []),
  loadRoles: () => {},
})
export default useRoles
`

const STUB_WEB3 = `export const useWeb3 = () => ({
  account: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  signer: null,
  provider: null,
  chainId: 63,
})
export default useWeb3
`

const STUB_UI = `export const useNotification = () => ({ showNotification: () => {} })
export const useAnnouncement = () => ({ announce: () => {} })
export const useModal = () => ({ openModal: () => {}, closeModal: () => {} })
`

const STUB_ENS = `export const useEnsResolution = () => ({ resolvedAddress: '', isEns: false, isLoading: false })
export default useEnsResolution
`

const STUB_CHAIN_TOKENS = `export const useChainTokens = () => ({
  native: 'METC',
  stable: 'USC',
  capabilities: {},
})
export default useChainTokens
`

const STUB_FEE_ESTATE = `/* Posed estate: one read, one not-deployed, one unreadable — the honest spread. */
import { readOk, notDeployed, unreadable, aggregate } from '../lib/chains/chainReadResult'
const USC = { symbol: 'USC', decimals: 6 }
const USDC = { symbol: 'USDC', decimals: 6 }
const accrued = [readOk(63, 1284500000n, USC, Date.now()), unreadable(80002, 'endpoint timed out')]
const received = [readOk(63, 8523100000n, USC, Date.now()), notDeployed(80002)]
export const feeUnitFor = (id) => (Number(id) === 63 ? USC : USDC)
export const useFeeEstate = () => ({
  accrued,
  received,
  accruedTotals: aggregate(accrued),
  receivedTotals: aggregate(received),
  refresh: () => {},
})
`

const STUB_GATEWAY = `export const gatewayBaseUrl = () => 'https://gateway.example'
export const parseGatewayStatus = (d) => d
export const useGatewayStatus = () => ({
  configured: true,
  status: {
    ok: true,
    killSwitch: false,
    hasOperatorTelemetry: true,
    chains: [
      { chainId: 63, rpc: 'up', gasWalletRunwayHrs: 340, paymasterDepositRunwayHrs: 120 },
      { chainId: 80002, rpc: 'down', gasWalletRunwayHrs: null, paymasterDepositRunwayHrs: null },
    ],
  },
  lastError: null,
  refresh: () => {},
})
`

const STUB_AUTHORITY = `const q = new URLSearchParams(window.location.search)
const held = (q.get('roles') || '').split(',').includes('curator')
export const CURATOR_AUTHORITY = Object.freeze({
  NOT_DEPLOYED: 'not-deployed', NO_ACCOUNT: 'no-account', UNVERIFIED: 'unverified',
  HELD: 'held', NOT_HELD: 'not-held',
})
export const UNVERIFIED_REASON = Object.freeze({ NO_ROUTE: 'no-route', READ_FAILED: 'read-failed' })
export const readCuratorRoleAdmin = async () => ({ outcome: 'unverified' })
export const readCuratorAuthority = async () => ({ held, outcome: held ? 'held' : 'not-held' })
`

const STUB_REGISTRY = `export const REGISTRY_STATUS = Object.freeze({
  OK: 'ok', NOT_DEPLOYED: 'not-deployed', UNREACHABLE: 'unreachable', NOT_FOUND: 'not-found',
})
export const UNREACHABLE_REASON = Object.freeze({ RPC: 'rpc', BAD_RESPONSE: 'bad-response' })
export const appNamespaceKey = (chainId, id) => 'app-' + chainId + '-' + id
export const appSlug = (name) => String(name || '').toLowerCase().replace(/\\s+/g, '-')
export const registryLocation = () => ({ chainId: 63, registryAddress: '0xFEd626025225A3B1aB3BA72D429B8c9C74cb5058' })
const app = (id, name, status, launchable, proposed, category, description) => ({
  id, name, status, launchable,
  category: category ?? 0,
  description: description || name + ' — a registry mini-app.',
  vendor: '0x52502d9C7C2d63f7a4f0a612ce1B0e4Bfd80F6e1',
  proposed: { present: Boolean(proposed) },
  approved: { present: true, version: '1.4.2' },
  submittedAt: 0, approvedAt: 0, updatedAt: 0,
})
const ALL = [
  app(1, 'Token Mint', 1, true, false, 4, 'Deploy and manage ERC-20 tokens.'),
  app(2, 'ClearPath', 1, true, true, 5, 'DAO transparency and treasury reporting.'),
  app(3, 'LedgerLens', 0, false, true, 1),
  app(4, 'OldTool', 3, false, false, 2),
]
export const fetchCatalog = async () => ({
  status: 'ok',
  ageMs: 0,
  fetchedAt: 1755388800000,
  apps: ALL.filter((a) => a.launchable),
  allApps: ALL,
})
export const clearCatalogCache = () => {}
export const fetchApp = async () => ({ status: 'not-found' })
export const fetchAppByName = async () => ({ status: 'not-found' })
export const fetchAppBySlug = async () => ({ status: 'not-found' })
export const fetchVendorApps = async () => ({ status: 'ok', apps: [] })
export const miniAppRegistryAddress = () => '0xFEd626025225A3B1aB3BA72D429B8c9C74cb5058'
export const CATALOG_CACHE_TTL_MS = 60000
export const CATALOG_PAGE_SIZE = 25
export const MINIAPP_MAX_PAGE_LIMIT = 25
`

const STUB_OPERATOR_FLAGS = `/* Written by capture-admin-apps.mjs; deleted on exit. */
const q = new URLSearchParams(window.location.search)
const roles = (q.get('roles') || '').split(',').filter(Boolean)
const NAME = {
  admin: 'isAdmin', guardian: 'isGuardian', moderator: 'isAccountModerator',
  rolemanager: 'isRoleManager', sanctions: 'isSanctionsAdmin', feeadmin: 'isFeeAdmin',
  staking: 'isStakingAdmin', liquidity: 'isLiquidityAdmin',
}
const flags = {}
for (const key of roles) if (NAME[key]) flags[NAME[key]] = true
export const useOperatorFlags = () => ({ isOperator: Object.keys(flags).length > 0, flags })
`

const STUB_MTO_STATS = `/* Posed membership stats for the treasury sparkline + bars. */
export const fmtUsdc = (v) => (Number(v) / 1e6).toFixed(2)
const series = Array.from({ length: 14 }, (_, i) => ({
  block: 4_200_000 + i * 9000,
  cumulative: BigInt(Math.round((i + 1) * (i + 1) * 41e6)),
}))
export const useMembershipTreasuryStats = () => ({
  loading: false,
  error: null,
  data: {
    truncated: true,
    members: { active: 412, everMembers: 561, byTier: { 1: 210, 2: 121, 3: 64, 4: 17 } },
    counts: { purchased: 388, granted: 41, redeemed: 12, extended: 96, upgraded: 33, revoked: 9 },
    revenue: {
      total: series[13].cumulative,
      withdrawn: 3_100_000_000n,
      purchases: 5_420_000_000n,
      extensions: 1_310_000_000n,
      upgrades: 1_300_000_000n,
    },
    revenueByTier: { 1: 1_010_000_000n, 2: 2_380_000_000n, 3: 3_240_000_000n, 4: 1_400_000_000n },
    series,
  },
  refresh: () => {},
})
`

const STUB_CALLSIGNS = `const recent = Array.from({ length: 24 }, (_, i) => ({
  type: i % 5 === 3 ? 'CallsignChanged' : 'CallsignRegistered',
  callsignHash: '0x' + String(i).padStart(2, '0'),
  callsign: '%pilot' + i,
  owner: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  block: 4_100_000 + i * 3500,
}))
export const useCallsignRegistryMetrics = () => ({
  loading: false,
  error: null,
  truncated: true,
  data: {
    counts: { registered: 19, changed: 5, released: 2, reclaimed: 1, repointRequested: 0, repointFinalized: 0, repointCancelled: 0, committed: 26 },
    netRegistrations: 16,
    suspended: [], verified: [], reserved: [],
    recent,
    truncated: true,
    totalEvents: 27,
  },
  refresh: () => {},
})
`

const HARNESS_CONFIG = `import { mergeConfig } from 'vite'
import base from './vite.config.js'

/* Written by scripts/ui/capture-admin-apps.mjs; deleted when it exits. Aliases the DATA hooks
   so scenarios can pose states; the components, CSS and tokens under review stay real. */
export default async (env) => {
  const resolved = typeof base === 'function' ? await base(env) : base
  return mergeConfig(resolved, {
    resolve: {
      alias: [
        { find: /^.*hooks\\/useRoles$/, replacement: '/src/dev/__stubRoles.js' },
        { find: /^.*hooks\\/useWeb3$/, replacement: '/src/dev/__stubWeb3.js' },
        { find: /^.*hooks\\/useUI$/, replacement: '/src/dev/__stubUI.js' },
        { find: /^.*hooks\\/useEnsResolution$/, replacement: '/src/dev/__stubEns.js' },
        { find: /^.*hooks\\/useChainTokens$/, replacement: '/src/dev/__stubChainTokens.js' },
        { find: /^.*hooks\\/useFeeEstate$/, replacement: '/src/dev/__stubFeeEstate.js' },
        { find: /^.*hooks\\/useGatewayStatus$/, replacement: '/src/dev/__stubGateway.js' },
        { find: /^.*hooks\\/useMembershipTreasuryStats$/, replacement: '/src/dev/__stubMtoStats.js' },
        { find: /^.*hooks\\/useCallsignRegistryMetrics$/, replacement: '/src/dev/__stubCallsigns.js' },
        { find: /^.*lib\\/miniapps\\/registryAuthority$/, replacement: '/src/dev/__stubAuthority.js' },
        { find: /^.*lib\\/miniapps\\/registryClient$/, replacement: '/src/dev/__stubRegistry.js' },
        { find: /^.*admin\\/useOperatorFlags$/, replacement: '/src/dev/__stubOperatorFlags.js' },
      ],
    },
  })
}
`

const HARNESS_PAGE = `/* Written by scripts/ui/capture-admin-apps.mjs; deleted when it exits. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../contexts/ThemeContext.jsx'
import ControlRoom from '../components/admin/ControlRoom'
import AdminAppRoute from '../components/admin/AdminAppRoute'
import CatalogPanel from '../components/miniapps/CatalogPanel'
import '../theme.css'
import '../index.css'
import '../App.css'

const q = new URLSearchParams(window.location.search)
const entry = q.get('entry') || '/admin'
// Pre-pinned favorites for store/drawer scenarios, e.g. pins=admin-tool:maintenance
for (const pin of (q.get('pins') || '').split(',').filter(Boolean)) {
  const prefsRaw = window.localStorage.getItem('fw_global_prefs')
  const prefs = prefsRaw ? JSON.parse(prefsRaw) : {}
  const list = prefs.miniapp_favorites || []
  list.push({ id: pin, name: pin.replace(/^admin-tool:/, '').replace(/-/g, ' ') })
  prefs.miniapp_favorites = list
  window.localStorage.setItem('fw_global_prefs', JSON.stringify(prefs))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/wallet" element={<CatalogPanel />} />
          <Route path="/admin" element={<ControlRoom />} />
          <Route path="/admin/:appId" element={<AdminAppRoute />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  </StrictMode>,
)
`

const TEMP_FILES = [
  [join(FRONTEND, 'admin-harness.html'), HARNESS_HTML],
  [join(FRONTEND, 'vite.harness.config.js'), HARNESS_CONFIG],
  [join(FRONTEND, 'src/dev/__adminHarness.jsx'), HARNESS_PAGE],
  [join(FRONTEND, 'src/dev/__stubRoles.js'), STUB_ROLES],
  [join(FRONTEND, 'src/dev/__stubWeb3.js'), STUB_WEB3],
  [join(FRONTEND, 'src/dev/__stubUI.js'), STUB_UI],
  [join(FRONTEND, 'src/dev/__stubEns.js'), STUB_ENS],
  [join(FRONTEND, 'src/dev/__stubChainTokens.js'), STUB_CHAIN_TOKENS],
  [join(FRONTEND, 'src/dev/__stubFeeEstate.js'), STUB_FEE_ESTATE],
  [join(FRONTEND, 'src/dev/__stubGateway.js'), STUB_GATEWAY],
  [join(FRONTEND, 'src/dev/__stubMtoStats.js'), STUB_MTO_STATS],
  [join(FRONTEND, 'src/dev/__stubCallsigns.js'), STUB_CALLSIGNS],
  [join(FRONTEND, 'src/dev/__stubAuthority.js'), STUB_AUTHORITY],
  [join(FRONTEND, 'src/dev/__stubRegistry.js'), STUB_REGISTRY],
  [join(FRONTEND, 'src/dev/__stubOperatorFlags.js'), STUB_OPERATOR_FLAGS],
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
      const res = await fetch(`${BASE}/admin-harness.html`)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`harness server never came up on ${BASE}`)
}

// ---- the shot matrix ---------------------------------------------------------------------------

const ALL_ROLES = 'admin,guardian,moderator,rolemanager,sanctions,feeadmin,staking,liquidity,curator'

const SCENARIOS = [
  // The launcher: full estate, narrow operator, denied, unverifiable.
  { name: 'control-room-full', query: `entry=/admin&roles=${ALL_ROLES}` },
  { name: 'control-room-feeadmin', query: 'entry=/admin&roles=feeadmin' },
  { name: 'control-room-denied', query: 'entry=/admin&roles=' },
  { name: 'control-room-unverified', query: 'entry=/admin&roles=&sweep=dark' },
  // Dashboards with posed data (populated charts + honest partial/unreadable rows).
  { name: 'membership-revenue-dashboard', query: `entry=/admin/membership-revenue&roles=${ALL_ROLES}` },
  { name: 'identity-dashboard', query: `entry=/admin/identity&roles=${ALL_ROLES}` },
  { name: 'compliance-dashboard', query: `entry=/admin/compliance&roles=${ALL_ROLES}` },
  { name: 'infrastructure-dashboard', query: `entry=/admin/infrastructure&roles=${ALL_ROLES}` },
  // Deliberately degraded: the incident pause sweep runs against an aborted network, so its
  // tiles photograph the unreadable state (that state is under review, not an accident).
  { name: 'incident-dashboard-unreadable', query: `entry=/admin/incident-response&roles=${ALL_ROLES}` },
  // Interior views: rail + form + scope card.
  { name: 'incident-emergency-view', query: `entry=/admin/incident-response?view=emergency&roles=${ALL_ROLES}` },
  { name: 'access-control-view', query: `entry=/admin/access-control?view=admin-roles&roles=${ALL_ROLES}` },
  { name: 'membership-tiers-view', query: `entry=/admin/membership-revenue?view=tiers&roles=${ALL_ROLES}` },
  // Store surfacing (spec 093 follow-up): the Operator tools section beside registry rows,
  // the narrow-role variant with a pinned tool, and the member control (no section at all).
  {
    name: 'store-operator-tools',
    query: `entry=/wallet?tab=apps&roles=${ALL_ROLES}`,
    waitFor: '.miniapp-catalog',
  },
  {
    name: 'store-feeadmin-pinned',
    query: 'entry=/wallet?tab=apps&roles=feeadmin&pins=admin-tool:maintenance',
    waitFor: '.miniapp-catalog',
  },
  {
    name: 'store-member-control',
    query: 'entry=/wallet?tab=apps&roles=',
    waitFor: '.miniapp-catalog',
  },
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
        // Surface page-level failures — a blank shot with no reason is undebuggable.
        page.on('pageerror', (err) => console.error(`[pageerror] ${shot.name}: ${err.message}`))
        page.on('console', (msg) => {
          if (msg.type() === 'error') console.error(`[console] ${shot.name}: ${msg.text()}`)
        })
        for (let attempt = 0; ; attempt++) {
          try {
            await page.goto(`${BASE}/admin-harness.html?${shot.query}`, {
              waitUntil: 'networkidle',
            })
            await page.waitForSelector(shot.waitFor || '.admin-panel', { timeout: 15_000 })
            break
          } catch (err) {
            if (attempt >= 1) throw err
          }
        }
        await page.addStyleTag({
          content: '.dev-warning-banner, .notification { display: none !important; }',
        })
        // Async statuses (curator authority, catalog counts) land a beat later.
        await page.waitForTimeout(600)
        const target = (await page.$(shot.waitFor || '.admin-panel')) || page
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
