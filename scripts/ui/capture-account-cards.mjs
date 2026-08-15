/**
 * Visual capture harness for the unified account cards (spec 086) — the actor half of the
 * actor-critic loop (see .claude/skills/actor-critic-screens). Photographs the My Account
 * carousel's glass cards (default + customized), the Customize sheet, and the header avatar
 * carrying a member-set picture. Final shots live in `specs/086-account-cards/screenshots/`.
 *
 * Usage:
 *   npm run dev --workspace frontend -- --port 5199        # terminal 1
 *   NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-account-cards.mjs [baseUrl]
 *
 * Accounts are seeded through the app's own device stores (legacy + hardware + vault reference
 * + cosmetics), so the carousel renders real switcher output. Every non-loopback request is
 * aborted; the acting identity stays personal (acting-as needs a real unlock/device ceremony —
 * documented as not photographed).
 */
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const BASE = process.argv[2] || 'http://127.0.0.1:5199'
const OUT = resolve(process.cwd(), 'specs/086-account-cards/screenshots')
const RPC_PORT = 9801
const RPC_ORIGIN = `http://127.0.0.1:${RPC_PORT}`
const CHAIN_ID = 137

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 390, height: 844 }

const ACCOUNT = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
const LEGACY = '0x0e35000000000000000000000000000000000c0b'
const HARDWARE = '0xaaa0000000000000000000000000000000000001'
const VAULT = '0x8Cc5000000000000000000000000000000000000'

// A member-set profile picture: small inline SVG (the store takes any data:image/*). Saturated
// and high-contrast on purpose — round 1 posed a pale image that read as an EMPTY avatar at
// 24px in the light header, which made a working feature photograph as broken.
const PROFILE_IMG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#7b2ff7'/><stop offset='0.5' stop-color='#f72f8e'/><stop offset='1' stop-color='#f7a12f'/></linearGradient></defs><rect width='128' height='128' fill='url(#g)'/><circle cx='64' cy='64' r='34' fill='none' stroke='rgba(20,20,40,0.75)' stroke-width='10'/><circle cx='64' cy='64' r='14' fill='rgba(20,20,40,0.75)'/></svg>`,
)}`

function chromiumExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  const dir = readdirSync(root).find((name) => /^chromium-\d+$/.test(name))
  if (!dir) return undefined
  const candidates = [join(root, dir, 'chrome-linux', 'chrome'), join(root, dir, 'chrome-linux64', 'chrome')]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}

// Loopback stub chain (batch-aware — see capture-verify.mjs).
function answer(method) {
  switch (method) {
    case 'eth_chainId':
      return `0x${CHAIN_ID.toString(16)}`
    case 'net_version':
      return String(CHAIN_ID)
    case 'eth_blockNumber':
      return '0x1'
    case 'eth_getBalance':
      return '0xde0b6b3a7640000'
    case 'eth_getCode':
      return '0x'
    case 'eth_call':
      return '0x'
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
      const one = (call) => ({ jsonrpc: '2.0', id: call?.id ?? 1, result: answer(call?.method) })
      const out = Array.isArray(payload) ? payload.map(one) : one(payload)
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
      res.end(JSON.stringify(out))
    })
  })
  return new Promise((ok) => server.listen(RPC_PORT, '127.0.0.1', () => ok(server)))
}

const SHOTS = [
  {
    name: 'cards-default',
    note: 'The carousel with no cosmetics: glass chrome, kind tags (Personal/Recovered/Hardware/Multisig), defaults everywhere',
  },
  {
    name: 'cards-customized',
    cosmetics: true,
    fullPage: true,
    note: 'Member cosmetics: profile picture on the personal card + header avatar, tints and patterns on the others',
  },
  {
    name: 'customize-sheet',
    cosmetics: true,
    sheet: true,
    note: 'The one Customize surface: live preview, picture controls, shade + pattern swatches, reset',
  },
]

function expand() {
  const out = []
  for (const shot of SHOTS) {
    for (const viewport of [DESKTOP, MOBILE]) {
      for (const theme of ['light', 'dark']) {
        out.push({
          ...shot,
          name: `account-cards-${shot.name}-${viewport === MOBILE ? 'mobile' : 'desktop'}-${theme}`,
          theme,
          viewport,
        })
      }
    }
  }
  return out
}

async function seedPage(page, shot) {
  await page.addInitScript(
    ({ theme, account, chainIdHex, chainId, rpcOrigin, legacy, hardware, vault, profileImg, cosmetics }) => {
      window.localStorage.setItem('themeMode', theme)
      window.localStorage.setItem('dev_warning_banner_dismissed', 'true')
      window.localStorage.setItem(
        'fairwins.entryGate.ack.v1',
        JSON.stringify({ terms: null, risk: null, at: new Date(0).toISOString() }),
      )
      window.localStorage.setItem(
        'fw_global_prefs',
        JSON.stringify({
          network_endpoints: { [chainId]: { url: rpcOrigin, failoverUrl: `${rpcOrigin}/failover` } },
        }),
      )

      // The member's other accounts, through the app's own stores.
      window.localStorage.setItem(
        `fw_user_${account}_legacy_recovered_keys`,
        JSON.stringify({
          [legacy]: { address: legacy, ct: 'AAECAwQF', iv: 'AAAB', salt: 'AAAC', kind: 'privateKey', protection: 'passphrase', importedAt: 1755000000000 },
        }),
      )
      window.localStorage.setItem(
        `fw_user_${account}_hardware_accounts`,
        JSON.stringify({
          [hardware]: { address: hardware, vendor: 'ledger', path: "m/44'/60'/0'/0/0", label: 'Cold storage', addedAt: 1755100000000 },
        }),
      )
      window.localStorage.setItem(
        `fw_user_${account}_custody_vault_references`,
        JSON.stringify([{ address: vault, chainId, label: 'Team vault', addedAt: 1755200000000 }]),
      )

      if (cosmetics) {
        window.localStorage.setItem(
          'fw_account_profiles_v1',
          JSON.stringify({
            [account]: { image: profileImg, tint: 'mint', updatedAt: 1 },
            [legacy]: { tint: 'amber', pattern: 'waves', updatedAt: 1 },
            [hardware]: { tint: 'violet', pattern: 'rings', updatedAt: 1 },
            [vault.toLowerCase()]: { tint: 'sky', pattern: 'grid', updatedAt: 1 },
          }),
        )
      }

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
                uuid: 'c0ffee00-0000-4000-8000-000000000086',
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
    {
      theme: shot.theme,
      account: ACCOUNT,
      chainIdHex: `0x${CHAIN_ID.toString(16)}`,
      chainId: CHAIN_ID,
      rpcOrigin: RPC_ORIGIN,
      legacy: LEGACY,
      hardware: HARDWARE,
      vault: VAULT,
      profileImg: PROFILE_IMG,
      cosmetics: Boolean(shot.cosmetics),
    },
  )
}

async function isolate(context, baseOrigin) {
  await context.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith(baseOrigin) || url.startsWith(RPC_ORIGIN)) return route.continue()
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
    return route.abort()
  })
}

async function captureOnce(browser, baseOrigin, shot) {
  const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 2 })
  await isolate(context, baseOrigin)
  const page = await context.newPage()
  await seedPage(page, shot)

  try {
    await page.goto(`${BASE}/wallet?tab=account`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.account-cards-track', { timeout: 30_000 })
    await page.addStyleTag({
      content: '.dev-warning-banner, .notification { display: none !important; }',
    })
    const connectClose = page.locator('.connect-modal__close')
    if (await connectClose.count()) await connectClose.first().click()

    // All four kinds present — the shot is about the cards, so their absence is a failure.
    await page.waitForSelector('.account-card--legacy', { timeout: 20_000 })
    await page.waitForSelector('.account-card--hardware', { timeout: 20_000 })

    if (shot.sheet) {
      await page.locator('[data-testid="account-customize-open"]').click()
      await page.waitForSelector('[data-testid="account-customize"]', { timeout: 20_000 })
    }

    mkdirSync(OUT, { recursive: true })
    await page.waitForTimeout(400)
    if (shot.sheet || shot.fullPage) {
      await page.screenshot({ path: join(OUT, `${shot.name}.png`) })
    } else {
      await page.locator('.account-cards').screenshot({ path: join(OUT, `${shot.name}.png`) })
    }
    console.log(`wrote ${shot.name}.png — ${shot.note}`)
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
