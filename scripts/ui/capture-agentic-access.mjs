/**
 * Visual capture harness for spec 095 — the member API access card, the assistant preferences card,
 * the assistant launcher and its panel. The "actor" half of the actor-critic screenshot loop: it
 * renders the REAL components in a real browser and writes PNGs for the critic to read. Final shots
 * live in `specs/095-member-api-agentic-access/screenshots/`.
 *
 * Usage:
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
 *     PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright     # once
 *   NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-agentic-access.mjs [outDir]
 *
 * Playwright is resolved from wherever the operator installed it, NEVER from a workspace manifest
 * (spec 075: a screenshot harness does not justify lockfile exposure). Chromium ships at
 * /opt/pw-browsers; CHROMIUM_PATH overrides.
 *
 * WHAT IS STUBBED, AND WHERE THE SEAM IS
 *
 *   the wallet      `hooks/useWalletManagement` — a fixed account plus a signer whose
 *                   `signTypedData` is bridged to Node and answered with a REAL ethers EIP-712
 *                   signature. The `fw1.…` token in the reveal shot is therefore a token that
 *                   actually verifies; a hand-painted string would photograph a different app.
 *   the membership  `hooks/useRoleDetails` — the ONLY way to pose the three gating states the card
 *                   is built around (pending / unreadable / active). Everything downstream of it —
 *                   the card, its copy, its CSS — is real.
 *   the gateway     a loopback HTTP server reached through the real `VITE_RELAYER_URL`, so
 *                   `assistantClient` runs unmodified and its three honest failure states
 *                   (reply / unreachable / assistant_unconfigured) come from real responses.
 *
 * NOT stubbed, because it is what is under review: the four spec-095 components, their CSS, the
 * accordion and action-sheet shells they sit in, the theme tokens, the real `SectionIconNav` the
 * launcher measures itself against, and the real signing/token/storage libraries.
 *
 * Every non-loopback request is aborted, so a shot can never quietly depend on the internet.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Wallet } from 'ethers'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FRONTEND = join(REPO, 'frontend')
const PORT = Number(process.env.HARNESS_PORT || 5199)
const BASE = `http://127.0.0.1:${PORT}`
const GATEWAY_PORT = Number(process.env.HARNESS_GATEWAY_PORT || 9799)
const GATEWAY = `http://127.0.0.1:${GATEWAY_PORT}`
const OUT = resolve(process.argv[2] || join(REPO, 'specs/095-member-api-agentic-access/screenshots'))

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 390, height: 844 }

/** The posed member. One address, shared by the wallet stub and every seeded storage key. */
const ACCOUNT = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
/** Throwaway key — it signs nothing but harness fixtures, and never leaves this file. */
const SIGNING_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const signerWallet = new Wallet(SIGNING_KEY)

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

// ---- the stub gateway ---------------------------------------------------------------------------

/**
 * `gatewayMode` decides what `POST /v1/member/assistant/chat` does, which is what separates the
 * panel's honest states:
 *   'reply'         a real 200 with a reply that mentions in-app paths (link chips + disclaimer)
 *   'unreachable'   the socket is destroyed — a transport failure, NOT a refusal
 *   'unconfigured'  503 assistant_unconfigured — the assistant is off on this gateway
 */
let gatewayMode = 'reply'

const REPLY_TEXT =
  'Your membership is Bronze and runs until 12 March 2027. To extend it or move up a tier, open ' +
  '/wallet?tab=membership and pick one — the confirmation there shows the price before you sign, ' +
  'and I never sign anything for you. If you would rather switch me off, the toggle is in ' +
  '/wallet?tab=settings.'

function startStubGateway() {
  const server = createServer((req, res) => {
    if (gatewayMode === 'unreachable') {
      // A destroyed socket is a transport failure, which is exactly the fault `assistantClient`
      // must report as 'unreachable' rather than as an answer.
      req.socket.destroy()
      return
    }
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const cors = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'POST,GET,OPTIONS',
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors)
        return res.end()
      }
      if (gatewayMode === 'unconfigured') {
        res.writeHead(503, { ...cors, 'content-type': 'application/json' })
        return res.end(
          JSON.stringify({
            error: {
              code: 'assistant_unconfigured',
              reason: 'The assistant is not enabled on this gateway.',
            },
          })
        )
      }
      res.writeHead(200, { ...cors, 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          reply: REPLY_TEXT,
          model: 'harness-fixture',
          usage: { inputTokens: 84, outputTokens: 71 },
        })
      )
    })
  })
  return new Promise((ok) => server.listen(GATEWAY_PORT, '127.0.0.1', () => ok(server)))
}

// ---- throwaway harness files --------------------------------------------------------------------

const HARNESS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agentic access harness</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/dev/__agenticHarness.jsx"></script>
  </body>
</html>
`

const STUB_WALLET = `/* Written by capture-agentic-access.mjs; deleted on exit.
   The signer's signTypedData is bridged to Node, which answers with a REAL EIP-712 signature — so
   the token in the reveal shot is one the gateway would actually accept. */
const ACCOUNT = '${ACCOUNT}'

const signer = {
  address: ACCOUNT,
  getAddress: async () => ACCOUNT,
  signTypedData: async (domain, types, message) =>
    window.__fwSignTyped(JSON.stringify({ domain, types, message })),
}

const wallet = {
  address: ACCOUNT,
  account: ACCOUNT,
  isConnected: true,
  loginMethod: 'injected',
  chainId: 137,
  signer,
  provider: null,
  balances: {},
  hasRole: () => true,
}

export const useWallet = () => wallet
export const useWalletAddress = () => ({ address: ACCOUNT, account: ACCOUNT, isConnected: true })
export const useWalletBalances = () => ({ balances: {}, isLoading: false })
export default useWallet
`

const STUB_ROLE_DETAILS = `/* Written by capture-agentic-access.mjs; deleted on exit.
   Poses the three membership states the API-access card is built around. \`null\` is the pending
   read (not an answer), \`readable: false\` is "the reference chain would not answer", and neither
   is the same as "not a member". */
const q = new URLSearchParams(window.location.search)
const mode = q.get('membership') || 'active'

const base = {
  roleName: 'WAGER_PARTICIPANT',
  tier: 0,
  tierName: 'None',
  tierColor: '#666',
  expiration: null,
  expirationDate: null,
  isActive: false,
  isExpired: false,
  daysRemaining: null,
  hasRole: false,
  readable: true,
}

const DETAILS = {
  pending: null,
  unreadable: { ...base, readable: false },
  none: { ...base },
  active: {
    ...base,
    tier: 1,
    tierName: 'Bronze',
    isActive: true,
    hasRole: true,
    daysRemaining: 203,
    expiration: 1804000000,
    expirationDate: new Date(1804000000000),
  },
}

export const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 }
export const TIER_NAMES = { 0: 'None', 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Platinum' }

export function useRoleDetails() {
  return {
    getRoleDetails: () => (mode in DETAILS ? DETAILS[mode] : DETAILS.active),
    roleDetails: {},
    loading: mode === 'pending',
    refresh: () => {},
  }
}
export default useRoleDetails
`

const HARNESS_CONFIG = `import { mergeConfig } from 'vite'
import base from './vite.config.js'

/* Written by scripts/ui/capture-agentic-access.mjs; deleted when it exits. Aliases the WALLET and
   the MEMBERSHIP READ so scenarios can pose states; the spec-095 components, their CSS, the
   accordion/sheet shells and the theme tokens under review stay real. */
export default async (env) => {
  const resolved = typeof base === 'function' ? await base(env) : base
  return mergeConfig(resolved, {
    resolve: {
      alias: [
        { find: /^.*hooks\\/useWalletManagement$/, replacement: '/src/dev/__stubWallet.js' },
        { find: /^.*hooks\\/useRoleDetails$/, replacement: '/src/dev/__stubRoleDetails.js' },
      ],
    },
  })
}
`

const HARNESS_PAGE = `/* Written by scripts/ui/capture-agentic-access.mjs; deleted when it exits.

   Two scaffolds, both deliberately thin:
     /settings  reproduces the Settings tab's real container chain (.wallet-page > .tab-content >
                .settings-section > AccordionGroup) so the two cards are photographed inside the
                spacing they actually ship in.
     /home      a screen that HAS a bottom nav — the real SectionIconNav, because the launcher
                MEASURES that element. The content behind it is scaffolding and is labelled as such
                in the screenshots README.
   The launcher is mounted on both, exactly as App.jsx mounts it once for every in-app route. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../contexts/ThemeContext.jsx'
import AccordionGroup from '../components/account/AccordionGroup'
import ApiAccessPanel from '../components/account/ApiAccessPanel'
import AssistantPreferencesPanel from '../components/account/AssistantPreferencesPanel'
import AssistantLauncher from '../components/assistant/AssistantLauncher'
import SectionIconNav from '../components/nav/SectionIconNav'
import '../theme.css'
import '../index.css'
import '../App.css'
import '../pages/WalletPage.css'

const q = new URLSearchParams(window.location.search)
const entry = q.get('entry') || '/settings'

function SettingsScaffold() {
  return (
    <div className="wallet-page-wrapper">
      <div className="wallet-page">
        <div className="wallet-portal wallet-portal--flat">
          <div className="wallet-portal-main">
            <div className="tab-content">
              <div className="settings-section" role="tabpanel">
                <p className="settings-section__intro">
                  How this app looks and behaves. Open a card to change it.
                </p>
                <AccordionGroup>
                  <AssistantPreferencesPanel />
                  <ApiAccessPanel />
                </AccordionGroup>
              </div>
            </div>
          </div>
        </div>
      </div>
      <AssistantLauncher />
    </div>
  )
}

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'transfer', label: 'Transfer', icon: 'transfer' },
  { id: 'earn', label: 'Earn', icon: 'sprout' },
  { id: 'trade', label: 'Trade', icon: 'trade' },
  { id: 'predict', label: 'Predict', icon: 'predict' },
]

function HomeScaffold() {
  return (
    <div className="wallet-page-wrapper">
      <div className="wallet-page">
        <div className="wallet-portal wallet-portal--flat">
          <div className="wallet-portal-main">
            <div className="tab-content">
              <div className="settings-section" role="tabpanel">
                <p className="settings-section__intro">
                  Harness scaffolding — a screen that has a bottom nav, so the launcher can be
                  photographed tethered to the real one.
                </p>
                {['Open wagers', 'Your pools', 'Recent activity'].map((title) => (
                  <section key={title} className="acc" data-open="false">
                    <h3 className="acc__heading">
                      <button type="button" className="acc__trigger">
                        <span className="acc__text">
                          <span className="acc__title">{title}</span>
                          <span className="acc__summary">Scaffolding row</span>
                        </span>
                      </button>
                    </h3>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <SectionIconNav items={NAV_ITEMS} activeId="home" onSelect={() => {}} />
      <AssistantLauncher />
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/settings" element={<SettingsScaffold />} />
          <Route path="/home" element={<HomeScaffold />} />
          <Route path="*" element={<SettingsScaffold />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  </StrictMode>,
)
`

const TEMP_FILES = [
  [join(FRONTEND, 'agentic-harness.html'), HARNESS_HTML],
  [join(FRONTEND, 'vite.agentic.config.js'), HARNESS_CONFIG],
  [join(FRONTEND, 'src/dev/__agenticHarness.jsx'), HARNESS_PAGE],
  [join(FRONTEND, 'src/dev/__stubWallet.js'), STUB_WALLET],
  [join(FRONTEND, 'src/dev/__stubRoleDetails.js'), STUB_ROLE_DETAILS],
]

function writeHarness() {
  mkdirSync(join(FRONTEND, 'src/dev'), { recursive: true })
  for (const [path, body] of TEMP_FILES) writeFileSync(path, body)
}

function removeHarness() {
  for (const [path] of TEMP_FILES) rmSync(path, { force: true })
}

async function waitForServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/agentic-harness.html`)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`harness server never came up on ${BASE}`)
}

// ---- seeded storage ------------------------------------------------------------------------------

const DAY = 86_400
const NOW = Math.floor(Date.UTC(2026, 7, 22, 12, 0, 0) / 1000)
const b32 = (n) => `0x${String(n).repeat(2).padEnd(64, '7a3f')}`.slice(0, 66)

/** Three keys, one of each lifecycle — the chips are only reviewable if all three are on screen. */
const SEEDED_KEYS = [
  {
    keyId: b32(11),
    label: 'research agent',
    scopes: ['read:fees', 'read:membership', 'read:profile', 'read:wagers'],
    issuedAt: NOW - 3 * DAY,
    expiresAt: NOW + 27 * DAY,
    revokedAt: null,
  },
  {
    keyId: b32(22),
    label: 'claude desktop',
    scopes: ['assistant:chat', 'build:intents', 'read:profile'],
    issuedAt: NOW - 40 * DAY,
    expiresAt: NOW - 10 * DAY,
    revokedAt: null,
  },
  {
    keyId: b32(33),
    label: 'old laptop',
    scopes: ['read:profile', 'read:wagers'],
    issuedAt: NOW - 20 * DAY,
    expiresAt: NOW + 70 * DAY,
    revokedAt: NOW - 2 * DAY,
  },
]

const SEEDED_MEMORY = [
  { role: 'user', content: 'What is a wager pool, and do I need one?', at: NOW * 1000 - 900_000 },
  {
    role: 'assistant',
    content:
      'A pool is a group wager: everyone puts in the same stake and the winners are agreed by the ' +
      'group afterwards. You can see yours at /pools.',
    at: NOW * 1000 - 880_000,
  },
  { role: 'user', content: 'How do people join one?', at: NOW * 1000 - 600_000 },
  {
    role: 'assistant',
    content: 'You share the pool link; each member joins with their own wallet from /pools.',
    at: NOW * 1000 - 590_000,
  },
  { role: 'user', content: 'Can you join it for me?', at: NOW * 1000 - 300_000 },
  {
    role: 'assistant',
    content: 'No — I never sign or submit anything. Joining takes your own signature on that screen.',
    at: NOW * 1000 - 290_000,
  },
]

// ---- the shot matrix -----------------------------------------------------------------------------

const API_CARD = '[data-testid="api-access-panel"]'
const PREFS_CARD = '[data-testid="assistant-prefs-panel"]'

const SCENARIOS = [
  // ---- API access card: the three gating states, then the working console.
  {
    name: 'api-checking',
    entry: '/settings',
    membership: 'pending',
    open: API_CARD,
    target: API_CARD,
    note: 'Membership read in flight — the third state, never rendered as a denial',
  },
  {
    name: 'api-upgrade',
    entry: '/settings',
    membership: 'none',
    open: API_CARD,
    target: API_CARD,
    note: 'Not a member: what keys are for, and the route to membership',
  },
  {
    name: 'api-unreadable',
    entry: '/settings',
    membership: 'unreadable',
    open: API_CARD,
    target: API_CARD,
    note: 'Reference chain would not answer — stated as a network problem, with a live retry',
  },
  {
    name: 'api-console',
    entry: '/settings',
    membership: 'active',
    keys: SEEDED_KEYS,
    open: API_CARD,
    target: API_CARD,
    note: 'The console: create form, and three keys — active, expired, revoked',
  },
  {
    name: 'api-reveal',
    entry: '/settings',
    membership: 'active',
    keys: SEEDED_KEYS,
    open: API_CARD,
    target: API_CARD,
    act: async (page) => {
      await page.locator('#api-access-label').fill('my research agent')
      await page.getByRole('button', { name: /^Create key$/ }).click()
      await page.waitForSelector('[data-testid="api-access-reveal"]', { timeout: 20_000 })
    },
    note: 'One-time reveal of a REAL signed fw1 token — shown once, never stored',
  },
  {
    name: 'api-snippet',
    entry: '/settings',
    membership: 'active',
    keys: SEEDED_KEYS,
    open: API_CARD,
    target: API_CARD,
    act: async (page) => {
      await page.getByRole('button', { name: /^Show setup snippet$/ }).click()
      await page.waitForSelector('[data-testid="api-access-snippet"]', { timeout: 20_000 })
    },
    note: 'MCP setup snippet expanded — the wide code block and its scroll behaviour',
  },
  // ---- Assistant preferences card.
  {
    name: 'prefs-off',
    entry: '/settings',
    membership: 'active',
    open: PREFS_CARD,
    target: PREFS_CARD,
    note: 'Default OFF: both switches, the disclosure, and "Nothing stored on this device"',
  },
  {
    name: 'prefs-on',
    entry: '/settings',
    membership: 'active',
    assistant: { enabled: true, retainMemory: true },
    memory: SEEDED_MEMORY,
    open: PREFS_CARD,
    target: PREFS_CARD,
    note: 'On, with a live memory count beside Clear',
  },
  // ---- Launcher: with a bottom nav, and without one.
  {
    name: 'launcher-with-nav',
    entry: '/home',
    membership: 'active',
    assistant: { enabled: true, retainMemory: true },
    waitFor: '[data-testid="assistant-launcher"]',
    note: 'Tethered above the real SectionIconNav (mobile); desktop has no bottom nav to tether to',
  },
  {
    name: 'launcher-no-nav',
    entry: '/settings',
    membership: 'active',
    assistant: { enabled: true, retainMemory: true },
    waitFor: '[data-testid="assistant-launcher"]',
    note: 'No bottom nav on Settings — base offset plus the safe-area inset',
  },
  // ---- Panel.
  {
    name: 'panel-authorize',
    entry: '/settings',
    membership: 'active',
    assistant: { enabled: true, retainMemory: true },
    openPanel: true,
    note: 'What the signature is for, before it is asked for',
  },
  {
    name: 'panel-thread',
    entry: '/settings',
    membership: 'active',
    assistant: { enabled: true, retainMemory: true },
    memory: SEEDED_MEMORY,
    openPanel: true,
    authorize: true,
    ask: 'When does my membership expire, and where do I renew it?',
    gateway: 'reply',
    note: 'A live reply from the gateway: link chips and the per-reply disclaimer',
  },
  {
    name: 'panel-unreachable',
    entry: '/settings',
    membership: 'active',
    assistant: { enabled: true, retainMemory: true },
    openPanel: true,
    authorize: true,
    ask: 'Is my key still working?',
    gateway: 'unreachable',
    note: 'Transport failure: named as unreachable, with a retry — never an invented answer',
  },
  {
    name: 'panel-unconfigured',
    entry: '/settings',
    membership: 'active',
    assistant: { enabled: true, retainMemory: true },
    openPanel: true,
    authorize: true,
    ask: 'Is my key still working?',
    gateway: 'unconfigured',
    note: '503 assistant_unconfigured: off on this gateway, so no retry is offered',
  },
]

/*
 * NOT photographed, deliberately:
 *
 *  · The PASSKEY signing path for a grant (`resolveGrantSigner` kind 'passkey'). It runs a WebAuthn
 *    ceremony against a real authenticator and an on-chain account deployment; a posed version
 *    would photograph a ceremony that cannot occur. The classic path shown here renders the same
 *    panel — only the wallet prompt differs, and that prompt is not ours.
 *  · The "no gateway configured in this build" notice inside the console (`VITE_RELAYER_URL`
 *    unset). It is one `api-access__notice--info` paragraph using the same tone as the notices
 *    already photographed, and posing it would mean running a second dev server for one paragraph.
 *  · The quota state (HTTP 429 with `Retry-After`). Its layout is the error box already
 *    photographed in `panel-unreachable` plus one hint line.
 */

function seedScript(shot, theme) {
  const lower = ACCOUNT.toLowerCase()
  return {
    theme,
    prefix: `fw_user_${lower}_`,
    assistant: shot.assistant ?? { enabled: false, retainMemory: true },
    memory: shot.memory ?? [],
    keys: shot.keys ?? [],
  }
}

async function capture(browser, viewport, shot, label, theme) {
  gatewayMode = shot.gateway ?? 'reply'
  // A FRESH CONTEXT PER SHOT. Round 1 shared one context per (theme, viewport) and the retained
  // conversation — which is localStorage, and is the point of the memory preference — leaked from
  // one scenario into the next: `panel-unreachable` photographed the previous shot's thread and
  // `panel-unconfigured` asked its question twice. A scenario that inherits the last one's storage
  // is not the scenario it is named after.
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 })
  // Nothing may leave this machine — an offline run must fail fast, never photograph a cache.
  await context.route('**/*', (route) => {
    const url = route.request().url()
    const local =
      url.startsWith(BASE) ||
      url.startsWith(GATEWAY) ||
      url.startsWith('data:') ||
      url.startsWith('blob:')
    return local ? route.continue() : route.abort()
  })
  const page = await context.newPage()
  page.on('pageerror', (err) => console.error(`[pageerror] ${shot.name}: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[console] ${shot.name}: ${msg.text()}`)
  })

  // The bridge: the page asks, Node signs with a real key. Registered before addInitScript so the
  // stub signer can call it on its first request.
  await page.exposeFunction('__fwSignTyped', async (payload) => {
    const { domain, types, message } = JSON.parse(payload)
    const clean = { ...types }
    delete clean.EIP712Domain
    return signerWallet.signTypedData(domain, clean, message)
  })

  await page.addInitScript((seed) => {
    window.localStorage.setItem('themeMode', seed.theme)
    window.localStorage.setItem('dev_warning_banner_dismissed', 'true')
    window.localStorage.setItem(`${seed.prefix}assistant_prefs`, JSON.stringify(seed.assistant))
    if (seed.memory.length > 0) {
      window.localStorage.setItem(`${seed.prefix}assistant_memory_v1`, JSON.stringify(seed.memory))
    }
    if (seed.keys.length > 0) {
      window.localStorage.setItem(`${seed.prefix}api_access_keys`, JSON.stringify(seed.keys))
    }
  }, seedScript(shot, theme))

  const query = new URLSearchParams({ entry: shot.entry, membership: shot.membership })
  await page.goto(`${BASE}/agentic-harness.html?${query}`, { waitUntil: 'networkidle' })
  await page.waitForSelector(shot.waitFor || shot.open || '.settings-section', { timeout: 20_000 })
  await page.addStyleTag({
    content: '.dev-warning-banner, .notification { display: none !important; }',
  })

  if (shot.open) {
    await page.locator(`${shot.open} .acc__trigger`).click()
    await page.waitForFunction(
      (sel) => document.querySelector(sel)?.getAttribute('data-open') === 'true',
      shot.open,
      { timeout: 10_000 }
    )
    await page.waitForTimeout(450) // the card's grid-rows open animation
  }

  if (shot.act) await shot.act(page)

  if (shot.openPanel) {
    await page.locator('[data-testid="assistant-launcher"]').click()
    await page.waitForSelector('.action-sheet.assistant-sheet', { timeout: 20_000 })
  }
  if (shot.authorize) {
    await page.locator('[data-testid="assistant-authorize-button"]').click()
    await page.waitForSelector('[data-testid="assistant-thread"]', { timeout: 20_000 })
  }
  if (shot.ask) {
    await page.locator('#assistant-input').fill(shot.ask)
    await page.getByRole('button', { name: /^Send$/ }).click()
    await page.waitForSelector(
      shot.gateway === 'reply'
        ? '.assistant-panel__message--assistant'
        : '[data-testid="assistant-error"]',
      { timeout: 60_000 }
    )
  }

  await page.waitForTimeout(500)
  const file = join(OUT, `${shot.name}-${label}-${theme}.png`)
  if (shot.target) {
    // Bring the whole card inside the viewport FIRST. An element that overhangs the fold by a few
    // dozen pixels comes back with those pixels painted as page background — round 2 filed a
    // `prefs-off` shot whose last line ("Read the Privacy Policy") was sliced in half while the DOM
    // said it was 32px clear of the card's own bottom edge. A capture artifact that looks exactly
    // like a layout bug is the worst kind, so the harness removes the condition rather than the
    // reviewer having to recognise it.
    await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.bottom > window.innerHeight) {
        window.scrollBy(0, Math.ceil(rect.bottom - window.innerHeight) + 8)
      }
    }, shot.target)
    await page.waitForTimeout(250)
    await page.locator(shot.target).screenshot({ path: file })
  } else {
    // The VIEWPORT, not an element: where a fixed launcher sits relative to the nav, and how much
    // of the screen a sheet covers, are exactly what these shots are reviewed for.
    await page.screenshot({ path: file })
  }
  await page.close()
  await context.close()
}

// ---- run -----------------------------------------------------------------------------------------

writeHarness()
const gateway = await startStubGateway()
const server = spawn(
  'npx',
  ['vite', '--config', 'vite.agentic.config.js', '--port', String(PORT), '--strictPort'],
  { cwd: FRONTEND, stdio: 'ignore', env: { ...process.env, VITE_RELAYER_URL: GATEWAY } }
)

// `--serve` writes the harness, starts the server and holds it, so a finding can be measured in a
// live browser instead of inferred from a PNG. Ctrl-C tears the throwaway files down as usual.
const SERVE_ONLY = process.argv.includes('--serve')

let browser
try {
  await waitForServer()
  if (SERVE_ONLY) {
    console.log(`harness serving on ${BASE}/agentic-harness.html?entry=/settings&membership=active`)
    // BOTH signals: a SIGTERM that is not caught kills the process before the `finally` below, and
    // the throwaway files and the vite child survive it — which is how one debugging session left
    // an orphaned server on the port and five untracked files in the tree.
    await new Promise((keepAlive) => {
      process.once('SIGINT', keepAlive)
      process.once('SIGTERM', keepAlive)
    })
  }
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
  browser = await chromium.launch({ executablePath: chromiumExecutable() })

  for (const theme of ['light', 'dark']) {
    for (const [label, viewport] of [
      ['desktop', DESKTOP],
      ['mobile', MOBILE],
    ]) {
      for (const shot of SCENARIOS) {
        // ONE retry: a dev server under HMR occasionally re-mounts mid-wait, and losing a
        // fifty-shot run to that is a bad tool. A real failure fails twice and stops the run.
        try {
          await capture(browser, viewport, shot, label, theme)
        } catch (error) {
          console.warn(`retrying ${shot.name}-${label}-${theme}: ${String(error?.message ?? error).split('\n')[0]}`)
          await capture(browser, viewport, shot, label, theme)
        }
      }
    }
  }
  console.log(`shots in ${OUT}`)
} finally {
  await browser?.close()
  server.kill()
  gateway.close()
  removeHarness()
}
