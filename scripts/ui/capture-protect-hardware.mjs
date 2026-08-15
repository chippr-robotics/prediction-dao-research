/**
 * Visual capture harness for Protect ▸ hardware wallets (spec 085) — the "actor" half of the
 * actor-critic screenshot loop. It renders the real surface in a real browser and writes PNGs for
 * a reviewer to critique; fixes land in `HardwareWallet.css` / `Custody.css` / the components and
 * the loop repeats until the shots are clean. Final shots live in
 * `specs/085-hardware-wallet-protect/screenshots/`.
 *
 * Usage:
 *   npm run dev --workspace frontend -- --port 5199        # terminal 1
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
 *     PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright  # once
 *   NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-protect-hardware.mjs [baseUrl]
 *
 * Playwright is resolved from wherever the operator installed it, NEVER from a workspace manifest
 * (spec 075 — see capture-verify.mjs). Chromium ships at /opt/pw-browsers; CHROMIUM_PATH overrides.
 *
 * The device is the DEV-only adapter seam (`window.__fwHardwareTestAdapter__`, adapters.js) —
 * the same seam the Cypress fast specs drive, alive only on the dev server these shots run
 * against. Balances in the picker are real reads against a loopback stub chain routed through the
 * spec-069 member endpoint override, so the pick step photographs the surface actually working.
 * Every non-loopback request is aborted — a shot can never quietly depend on the internet.
 */
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const BASE = process.argv[2] || 'http://127.0.0.1:5199'
const OUT = resolve(process.cwd(), 'specs/085-hardware-wallet-protect/screenshots')
const RPC_PORT = 9799
const RPC_ORIGIN = `http://127.0.0.1:${RPC_PORT}`
const CHAIN_ID = 137

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 390, height: 844 }

const ACCOUNT = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'

// Deterministic fake device addresses, index-derived (same convention as the Cypress spec).
const HW_ADDRESSES = Array.from({ length: 10 }, (_, i) => `0x${(i + 1).toString(16).padStart(2, '0')}${'ab'.repeat(19)}`)

/** Saved entries for the list shots — what a member with real cold storage sees. */
const SEEDED = {
  [HW_ADDRESSES[0]]: {
    address: HW_ADDRESSES[0],
    vendor: 'ledger',
    path: "m/44'/60'/0'/0/0",
    label: 'Cold storage',
    addedAt: 1755200000000,
  },
  [HW_ADDRESSES[1]]: {
    address: HW_ADDRESSES[1],
    vendor: 'trezor',
    path: "m/44'/60'/0'/0/1",
    label: 'Family savings',
    addedAt: 1755210000000,
  },
}

function chromiumExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  const dir = readdirSync(root).find((name) => /^chromium-\d+$/.test(name))
  if (!dir) return undefined
  const candidates = [join(root, dir, 'chrome-linux', 'chrome'), join(root, dir, 'chrome-linux64', 'chrome')]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}

// ---- stub chain (batch-aware — ethers v6 batches on Polygon; see capture-verify.mjs) -----------

function answer(method) {
  switch (method) {
    case 'eth_chainId':
      return `0x${CHAIN_ID.toString(16)}`
    case 'net_version':
      return String(CHAIN_ID)
    case 'eth_blockNumber':
      return '0x1'
    case 'eth_getBalance':
      return '0x14d1120d7b160000' // 1.5 native — photographs as "1.5 MATIC"
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

// ---- scenarios ----------------------------------------------------------------------------------

const SHOTS = [
  {
    name: 'accordion',
    note: 'The Protect page as an accordion: On chain open, Verify and Off chain as one-line headings',
  },
  {
    name: 'offchain-empty',
    open: 'offchain',
    note: 'Off chain opened, nothing saved yet: the add action and the empty line',
  },
  {
    name: 'offchain-list',
    seed: true,
    open: 'offchain',
    note: 'Two saved accounts: vendor badges, labels, address + path, forget controls; summary counts them',
  },
  {
    name: 'sheet-vendor',
    open: 'offchain',
    wizard: 'vendor',
    note: 'Wizard step 1: pick the vendor, each option carrying its transport hint',
  },
  {
    name: 'sheet-connect',
    open: 'offchain',
    wizard: 'connect',
    note: 'Wizard step 2: the physical checklist before the browser prompt',
  },
  {
    name: 'sheet-error',
    open: 'offchain',
    wizard: 'connect',
    fail: true,
    note: 'Connect failure: the typed human sentence, and the member can retry — never a spinner',
  },
  {
    name: 'sheet-pick',
    open: 'offchain',
    wizard: 'pick',
    note: 'Wizard step 3: derived accounts with real balances, scheme toggle, paging, label field',
  },
  {
    name: 'sheet-saved',
    open: 'offchain',
    wizard: 'saved',
    note: 'Wizard step 4: what was saved and where it is now available',
  },
]

function expand() {
  const out = []
  for (const shot of SHOTS) {
    for (const viewport of [DESKTOP, MOBILE]) {
      for (const theme of ['light', 'dark']) {
        out.push({
          ...shot,
          name: `protect-hw-${shot.name}-${viewport === MOBILE ? 'mobile' : 'desktop'}-${theme}`,
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
    ({ theme, account, chainIdHex, chainId, rpcOrigin, seeded, hwAddresses, fail }) => {
      window.localStorage.setItem('themeMode', theme)
      window.localStorage.setItem('dev_warning_banner_dismissed', 'true')
      window.localStorage.setItem(
        'fairwins.entryGate.ack.v1',
        JSON.stringify({ terms: null, risk: null, at: new Date(0).toISOString() }),
      )
      // Member RPC override (spec 069) — the only supported way to point reads at the stub.
      window.localStorage.setItem(
        'fw_global_prefs',
        JSON.stringify({
          network_endpoints: { [chainId]: { url: rpcOrigin, failoverUrl: `${rpcOrigin}/failover` } },
        }),
      )
      if (seeded) {
        window.localStorage.setItem(`fw_user_${account}_hardware_accounts`, JSON.stringify(seeded))
      }

      // The DEV-only device seam (adapters.js). `fail` poses the honest-failure shot.
      window.__fwHardwareTestAdapter__ = () => {
        if (fail) throw new Error('posed transport failure')
        return {
          vendor: 'ledger',
          getAddress(path) {
            const m = path.match(/(\d+)'?\/0\/0$|0'\/0\/(\d+)$/)
            const idx = Number(m ? (m[1] ?? m[2]) : 0)
            return Promise.resolve({ address: hwAddresses[idx] || hwAddresses[0] })
          },
          getAddresses(paths) {
            return Promise.all(paths.map((p) => this.getAddress(p))).then((r) =>
              r.map((x, i) => ({ path: paths[i], address: x.address })),
            )
          },
          signPersonalMessage: () => Promise.reject(new Error('not exercised')),
          signTransaction: () => Promise.reject(new Error('not exercised')),
          close: () => Promise.resolve(),
        }
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
                uuid: 'c0ffee00-0000-4000-8000-000000000085',
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
      seeded: shot.seed ? SEEDED : null,
      hwAddresses: HW_ADDRESSES,
      fail: Boolean(shot.fail),
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

// ---- capture ------------------------------------------------------------------------------------

async function captureOnce(browser, baseOrigin, shot) {
  const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 2 })
  await isolate(context, baseOrigin)
  const page = await context.newPage()
  await seedPage(page, shot)

  try {
    await page.goto(`${BASE}/wallet?tab=custody`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.custody-panel', { timeout: 30_000 })
    await page.addStyleTag({
      content: '.dev-warning-banner, .notification { display: none !important; }',
    })
    const connectClose = page.locator('.connect-modal__close')
    if (await connectClose.count()) await connectClose.first().click()

    if (shot.open === 'offchain') {
      await page.locator('[data-testid="custody-acc-offchain"] .acc__trigger').click()
      await page.waitForSelector('[data-testid="hw-add"]', { timeout: 20_000 })
    }

    if (shot.wizard) {
      await page.locator('[data-testid="hw-add"]').click()
      await page.waitForSelector('[data-testid="hw-step-vendor"]', { timeout: 20_000 })
    }
    if (shot.wizard === 'connect' || shot.wizard === 'pick' || shot.wizard === 'saved') {
      await page.locator('[data-testid="hw-vendor-ledger"]').click()
      await page.waitForSelector('[data-testid="hw-step-connect"]', { timeout: 20_000 })
    }
    if (shot.fail) {
      await page.locator('[data-testid="hw-connect"]').click()
      await page.waitForSelector('.hw-error', { timeout: 20_000 })
    }
    if (shot.wizard === 'pick' || shot.wizard === 'saved') {
      await page.locator('[data-testid="hw-connect"]').click()
      await page.waitForSelector('[data-testid="hw-step-pick"]', { timeout: 20_000 })
      // Let the balance reads land — "—" placeholders photograph as a broken surface.
      await page.waitForSelector('.hw-account-row__balance:has-text("1.5")', { timeout: 20_000 })
    }
    if (shot.wizard === 'saved') {
      await page.locator('.hw-account-row input[type="checkbox"]').first().check()
      await page.locator('.hw-field input').fill('Cold storage')
      await page.locator('[data-testid="hw-save"]').click()
      await page.waitForSelector('[data-testid="hw-step-saved"]', { timeout: 20_000 })
    }

    mkdirSync(OUT, { recursive: true })
    await page.waitForTimeout(300)
    if (shot.wizard) {
      // The viewport: whether the sheet's content fits one screen is what is under review.
      await page.screenshot({ path: join(OUT, `${shot.name}.png`) })
    } else {
      await page.locator('.custody-panel').screenshot({ path: join(OUT, `${shot.name}.png`) })
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
