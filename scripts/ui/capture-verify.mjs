/**
 * Visual capture harness for Protect ▸ Verify — the "actor" half of the actor-critic screenshot
 * loop. It renders the real surface in a real browser and writes PNGs for a reviewer to critique
 * against the style kit; fixes land in `Verify.css` / the forms and the loop repeats until the
 * shots are clean. Final shots live in `specs/084-message-signing-verify/screenshots/`.
 *
 * Usage:
 *   npm run dev --workspace frontend -- --port 5199        # terminal 1
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
 *     PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright  # once
 *   NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-verify.mjs [baseUrl]
 *
 * Playwright is resolved from wherever the operator installed it, NEVER from a workspace manifest
 * — spec 075 documents why a screenshot harness does not justify lockfile exposure (see
 * capture-nav-drawer.mjs). Chromium ships at /opt/pw-browsers; CHROMIUM_PATH overrides.
 *
 * TWO STUBS, both local, because this surface is worthless photographed empty:
 *
 *   the wallet   an EIP-1193 provider whose `personal_sign` is bridged to Node via
 *                `exposeFunction` and answered with a REAL ethers signature over the real
 *                message. A faked signature would photograph a "Signed" panel whose document
 *                does not verify — a picture of something that does not work.
 *   the chain    a loopback JSON-RPC server reached through the spec-069 member endpoint
 *                override, answering `eth_getCode`/`eth_call` so the ERC-1271 leg can produce
 *                each of its three verdicts on demand.
 *
 * Fixtures come from `frontend/src/test/fixtures/signedMessages.js` — the same module the vitest
 * suites use. A screenshot posed with its own hand-written signature is a screenshot of a
 * different app than the one under test.
 *
 * Every non-loopback request is aborted, so a shot can never quietly depend on the internet.
 */
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

import { Wallet, hashMessage } from 'ethers'

import {
  MESSAGE,
  SIGNER_KEY,
  SIGNER_ADDRESS,
  OTHER_ADDRESS,
  EIP191_DOCUMENT_JSON,
} from '../../frontend/src/test/fixtures/signedMessages.js'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const BASE = process.argv[2] || 'http://127.0.0.1:5199'
const OUT = resolve(process.cwd(), 'specs/084-message-signing-verify/screenshots')
const RPC_PORT = 9798
const RPC_ORIGIN = `http://127.0.0.1:${RPC_PORT}`
const CHAIN_ID = 137

const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 390, height: 844 }

const wallet = new Wallet(SIGNER_KEY)

/** The pre-installed Chromium; the launcher's own default would want a download. */
function chromiumExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  const dir = readdirSync(root).find((name) => /^chromium-\d+$/.test(name))
  if (!dir) return undefined
  const candidates = [join(root, dir, 'chrome-linux', 'chrome'), join(root, dir, 'chrome-linux64', 'chrome')]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}

// ---- stub chain ---------------------------------------------------------------------------------

/**
 * `chainMode` decides what the claimed address looks like on-chain, which is what separates the
 * three verdicts:
 *   'eoa'          no code → a mismatching recovery is a DEFINITE negative
 *   'contract-ok'  code + magic value → valid via ERC-1271
 *   'down'         every read fails → unverifiable (and must NOT read as a forgery)
 */
let chainMode = 'eoa'

const ERC1271_MAGIC = '0x1626ba7e'

/** Answer one JSON-RPC call. */
function answer(method) {
  switch (method) {
    case 'eth_chainId':
      return `0x${CHAIN_ID.toString(16)}`
    case 'net_version':
      return String(CHAIN_ID)
    case 'eth_blockNumber':
      return '0x1'
    case 'eth_getCode':
      return chainMode === 'contract-ok' ? '0x60806040' : '0x'
    case 'eth_call':
      return chainMode === 'contract-ok' ? `${ERC1271_MAGIC}${'0'.repeat(56)}` : '0x'
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
      if (chainMode === 'down') {
        res.writeHead(503)
        return res.end('node unavailable')
      }
      let payload
      try {
        payload = JSON.parse(body)
      } catch {
        res.writeHead(400)
        return res.end('bad json')
      }
      // ethers v6 BATCHES concurrent calls into one array request on every chain outside
      // NO_BATCH_CHAIN_IDS (61/63) — and Polygon is not one of them. Answering a batch with a
      // single object makes every read fail, which is how the first pass filed a screenshot of
      // "could not be reached" under the name `check-invalid`: a stub that is wrong in the same
      // direction as the honest degradation is the easiest kind of fixture bug to miss.
      const one = (call) => ({ jsonrpc: '2.0', id: call?.id ?? 1, result: answer(call?.method) })
      const out = Array.isArray(payload) ? payload.map(one) : one(payload)
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
      res.end(JSON.stringify(out))
    })
  })
  return new Promise((ok) => server.listen(RPC_PORT, '127.0.0.1', () => ok(server)))
}

// ---- scenarios ----------------------------------------------------------------------------------

/** A document from an address that is NOT the one it claims — the definite-negative shot. */
const FORGED_DOCUMENT_JSON = JSON.stringify(
  { ...JSON.parse(EIP191_DOCUMENT_JSON), address: OTHER_ADDRESS },
  null,
  2,
)

const SHOTS = [
  {
    name: 'area',
    panel: null,
    note: 'The area itself: two entry rows, both sheets closed — the whole cost of Verify on the Protect page',
  },
  {
    name: 'sign-ready',
    panel: 'sign',
    type: MESSAGE,
    note: 'Sign panel, message entered, ready to sign',
  },
  {
    name: 'sign-signed',
    panel: 'sign',
    type: MESSAGE,
    sign: true,
    note: 'Signed — the portable document and its copy controls',
  },
  {
    name: 'check-valid',
    panel: 'check',
    paste: EIP191_DOCUMENT_JSON,
    verify: true,
    chain: 'eoa',
    note: 'Valid: document pasted, every field auto-filled, wallet signature confirmed',
  },
  {
    name: 'check-offline-unsettled',
    panel: 'check',
    paste: FORGED_DOCUMENT_JSON,
    verify: true,
    chain: 'eoa',
    note: 'Offline result: states who actually produced the bytes, and offers the on-chain escalation rather than accusing',
  },
  {
    name: 'check-invalid',
    panel: 'check',
    paste: FORGED_DOCUMENT_JSON,
    verify: true,
    escalate: true,
    chain: 'eoa',
    note: 'Definite negative, reached only after the member asked the account: the chain confirms the claimed address holds no contract',
  },
  {
    name: 'check-unverifiable',
    panel: 'check',
    paste: FORGED_DOCUMENT_JSON,
    verify: true,
    escalate: true,
    chain: 'down',
    note: 'Third state: the member asked, the node was unreachable, and the offline fact is repeated rather than lost',
  },
  {
    name: 'check-bad-document',
    panel: 'check',
    paste: '{"format":"fairwins-signed-message/1","message":"hello"}',
    note: 'Unreadable document: the error replaces the verdict, and Check stays disabled',
  },
]

/*
 * NOT photographed, deliberately: the withdrawn-signing state (`capability.canSign === false`).
 *
 * All three of its causes need a session this harness cannot fabricate honestly — Protect itself
 * sits behind the connect gate, so "no wallet" never reaches the surface at all, and reaching a
 * vault or a locked recovered identity needs a real Safe / a real unlocked key. The layout is one
 * notice paragraph plus the header's "Unavailable" chip, and its three sentences are asserted in
 * `frontend/src/test/verify/VerifySection.test.jsx`. A posed screenshot of a session that cannot
 * occur would be a worse record than saying so here.
 */

function expand() {
  const out = []
  for (const shot of SHOTS) {
    for (const viewport of [DESKTOP, MOBILE]) {
      for (const theme of ['light', 'dark']) {
        out.push({
          ...shot,
          name: `verify-${shot.name}-${viewport === MOBILE ? 'mobile' : 'desktop'}-${theme}`,
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
  // The bridge: the page asks, Node signs with the real key. Registered BEFORE addInitScript so
  // the stub provider can call it on its first request.
  await page.exposeFunction('__fwSignPersonal', async (hexMessage) => {
    const text = Buffer.from(hexMessage.slice(2), 'hex').toString('utf8')
    return wallet.signingKey.sign(hashMessage(text)).serialized
  })

  await page.addInitScript(
    ({ theme, account, chainIdHex, chainId, rpcOrigin }) => {
      window.localStorage.setItem('themeMode', theme)
      window.localStorage.setItem('dev_warning_banner_dismissed', 'true')
      window.localStorage.setItem(
        'fairwins.entryGate.ack.v1',
        JSON.stringify({ terms: null, risk: null, at: new Date(0).toISOString() }),
      )
      // The member's own RPC route (spec 069) — the ONLY supported way to point the app's reads at
      // the stub. Never a build-default rewrite: makeReadProvider resolves member-first.
      // The stored entry shape is `{ url, failoverUrl }` per chain. A failover that is also ours
      // matters: without one, `resolveRpcEndpoints` leaves the BUILD DEFAULT behind the override
      // and the shot would depend on a public endpoint the isolation route then aborts — which is
      // exactly how the first pass photographed "could not be reached" under the `invalid` name.
      window.localStorage.setItem(
        'fw_global_prefs',
        JSON.stringify({
          network_endpoints: { [chainId]: { url: rpcOrigin, failoverUrl: `${rpcOrigin}/failover` } },
        }),
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
        request({ method, params }) {
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
            // The one call this harness exists for: a REAL signature over the real bytes, so the
            // document in the screenshot actually verifies.
            case 'personal_sign':
              return window.__fwSignPersonal(params[0])
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
                uuid: 'c0ffee00-0000-4000-8000-000000000084',
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
      account: SIGNER_ADDRESS.toLowerCase(),
      chainIdHex: `0x${CHAIN_ID.toString(16)}`,
      chainId: CHAIN_ID,
      rpcOrigin: RPC_ORIGIN,
    },
  )
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
  chainMode = shot.chain ?? 'eoa'
  const context = await browser.newContext({ viewport: shot.viewport, deviceScaleFactor: 2 })
  await isolate(context, baseOrigin)
  const page = await context.newPage()
  await seedPage(page, shot)

  try {
    await page.goto(`${BASE}/wallet?tab=custody`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.verify-area', { timeout: 30_000 })
    // The dev build's banner and the activity engine's retry toast both sit over the panel; the
    // toast is a harness artifact (the isolation route aborts the subgraph), and neither belongs
    // in a shot of this surface.
    await page.addStyleTag({
      content:
        '.dev-warning-banner, .notification { display: none !important; }',
    })
    const connectClose = page.locator('.connect-modal__close')
    if (await connectClose.count()) await connectClose.first().click()

    // The area itself is two entry rows; every form lives in an ActionSheet, so a form shot has to
    // open one first. `panel: null` photographs the area closed — which is the point of the sheet
    // pattern and the one thing a form shot cannot show.
    if (shot.panel) {
      await page.getByRole('button', { name: shot.panel === 'sign' ? /^Sign a message$/ : /^Check a signature$/ }).click()
      await page.waitForSelector('.action-sheet', { timeout: 20_000 })
    }

    if (shot.type) {
      await page.locator('#verify-sign-message').fill(shot.type)
    }
    if (shot.sign) {
      await page.getByRole('button', { name: /^sign message$/i }).click()
      await page.waitForSelector('[data-testid="signed-document"]', { timeout: 20_000 })
    }
    if (shot.paste) {
      // Through the signature box, which is where a member drops a document they were handed.
      await page.locator('#verify-check-signature').fill(shot.paste)
    }
    if (shot.verify) {
      // The offline check. No network is involved, and for a wallet signature this is the whole
      // interaction — which is the point of the shot.
      await page.getByRole('button', { name: /check signature/i }).click()
      await page.waitForSelector('[data-testid="verify-result"]', { timeout: 20_000 })
    }
    if (shot.escalate) {
      // The explicit escalation, which only exists once a result says a network could settle it.
      const select = page.locator('#verify-check-chain')
      await select.waitFor({ timeout: 20_000 })
      await select.selectOption(String(CHAIN_ID))
      await page.getByRole('button', { name: /check on-chain/i }).click()
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="verify-result"]')?.textContent?.includes('Asking'),
        { timeout: 20_000 },
      )
      await page.waitForTimeout(400)
    }

    mkdirSync(OUT, { recursive: true })
    await page.waitForTimeout(300) // let the sheet's entry transition settle
    if (shot.panel) {
      // The VIEWPORT, not the sheet element: how much of the page a sheet covers, and whether its
      // content fits inside one, is exactly what these shots are being reviewed for.
      await page.screenshot({ path: join(OUT, `${shot.name}.png`) })
    } else {
      // Frame the Protect surface — the nav and header are photographed by their own harness and
      // only shrink what this one is about.
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
      // ONE retry: a dev server under HMR occasionally re-mounts mid-wait, and losing a
      // twenty-shot run to that is a bad tool. A real failure fails twice and stops the run.
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
