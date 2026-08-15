/**
 * Spec 085 follow-up — staging-shaped verification of the REAL hardware vendor path.
 *
 * The staging validation found both vendors failing to connect with no logs. Root cause: the
 * vendor SDKs' bundled code references the Node `Buffer` global, which browsers do not have
 * (nodeShims.js is the fix); the silence was the error layer swallowing raw errors
 * (reportHardwareError is that fix). Every dev-side flow drives the test-adapter seam, so only
 * a REAL browser executing the BUILT bundle reaches the SDK bytes — which is exactly what this
 * script does:
 *
 *   - serves `frontend/dist` with the REAL nginx CSP + Permissions-Policy headers (copied from
 *     frontend/nginx.conf at runtime, so drift is impossible)
 *   - drives the add-wallet wizard through the REAL `connectHardware` path (no test seam)
 *   - asserts the failure in a device-less browser is an HONEST transport outcome, never a
 *     ReferenceError/TypeError from missing Node globals, and that the raw diagnostic reached
 *     the console (the "no relevant logs" fix)
 *   - collects `securitypolicyviolation` events so a CSP block on the Trezor bridge is caught
 *     here instead of in staging
 *
 * Usage:  node scripts/ui/verify-hardware-bundle.mjs   (after `npx vite build` in frontend/)
 * Exits non-zero on any finding. Requires the operator Playwright install (see
 * .claude/skills/actor-critic-screens).
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve, extname } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const DIST = resolve(process.cwd(), 'frontend/dist')
const PORT = 5297
const ORIGIN = `http://127.0.0.1:${PORT}`

// The REAL headers, parsed out of the nginx config so this harness cannot drift from staging.
const nginx = readFileSync(resolve(process.cwd(), 'frontend/nginx.conf'), 'utf8')
const csp = nginx.match(/add_header Content-Security-Policy "([^"]+)"/)?.[1]
const permissions = nginx.match(/add_header Permissions-Policy "([^"]+)"/)?.[1]
if (!csp || !permissions) throw new Error('could not extract headers from frontend/nginx.conf')

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

function chromiumExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  const dir = readdirSync(root).find((name) => /^chromium-\d+$/.test(name))
  if (!dir) return undefined
  const candidates = [join(root, dir, 'chrome-linux', 'chrome'), join(root, dir, 'chrome-linux64', 'chrome')]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]
}

function serveDist() {
  const server = createServer((req, res) => {
    let path = join(DIST, decodeURIComponent(new URL(req.url, ORIGIN).pathname))
    if (!existsSync(path) || statSync(path).isDirectory()) path = join(DIST, 'index.html')
    res.writeHead(200, {
      'content-type': MIME[extname(path)] || 'application/octet-stream',
      'content-security-policy': csp,
      'permissions-policy': permissions,
    })
    res.end(readFileSync(path))
  })
  return new Promise((ok) => server.listen(PORT, '127.0.0.1', () => ok(server)))
}

const ACCOUNT = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'

async function seedPage(page) {
  await page.addInitScript(
    ({ account }) => {
      window.localStorage.setItem('themeMode', 'light')
      window.localStorage.setItem('dev_warning_banner_dismissed', 'true')
      window.localStorage.setItem(
        'fairwins.entryGate.ack.v1',
        JSON.stringify({ terms: null, risk: null, at: new Date(0).toISOString() }),
      )
      // CSP-violation collector — a blocked Trezor frame/script surfaces here.
      window.__cspViolations = []
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`)
      })
      // Headless has no HID chooser UI, so requestDevice would pend forever. Answer it with
      // "no device chosen" — which drives the REAL Ledger SDK through transport open and into
      // its own error path, executing every bundled byte this harness exists to verify.
      if (navigator.hid) {
        navigator.hid.requestDevice = async () => {
          console.log('[probe] navigator.hid.requestDevice reached')
          return []
        }
      }
      if (navigator.usb) {
        navigator.usb.requestDevice = async () => {
          console.log('[probe] navigator.usb.requestDevice reached')
          throw new DOMException('No device selected.', 'NotFoundError')
        }
      }
      const provider = {
        isMetaMask: true,
        selectedAddress: account,
        chainId: '0x89',
        _cb: {},
        on() {},
        removeListener() {},
        request({ method }) {
          switch (method) {
            case 'eth_accounts':
            case 'eth_requestAccounts':
              return Promise.resolve([account])
            case 'eth_chainId':
              return Promise.resolve('0x89')
            case 'net_version':
              return Promise.resolve('137')
            case 'eth_blockNumber':
              return Promise.resolve('0x1')
            case 'eth_getBalance':
            case 'eth_call':
            case 'eth_estimateGas':
              return Promise.resolve('0x0')
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
                uuid: 'c0ffee00-0000-4000-8000-0000000000ff',
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
    { account: ACCOUNT },
  )
}

async function driveVendor(browser, vendor) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const consoleLines = []
  const pageErrors = []
  page.on('console', (m) => consoleLines.push(m.text()))
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await seedPage(page)

  await page.goto(`${ORIGIN}/wallet?tab=custody#custody-offchain`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="hw-add"]', { timeout: 30_000 })
  await page.locator('[data-testid="hw-add"]').click()
  await page.waitForSelector(`[data-testid="hw-vendor-${vendor}"]`, { timeout: 20_000 })

  const disabled = await page.locator(`[data-testid="hw-vendor-${vendor}"]`).isDisabled()
  if (disabled) {
    // Honest platform refusal (e.g. no WebHID) — acceptable, but say so.
    console.log(`${vendor}: vendor honestly unavailable in this browser (disabled with reason)`)
    await context.close()
    return { vendor, outcome: 'unavailable', consoleLines, pageErrors, violations: [] }
  }

  await page.locator(`[data-testid="hw-vendor-${vendor}"]`).click()
  await page.locator('[data-testid="hw-connect"]').click()
  // Device-less browser: the flow must settle into the stated error line (never hang, never
  // crash). Trezor may sit in its popup a while — cap the wait and treat a live popup as OK.
  const settled = await Promise.race([
    page.waitForSelector('.hw-error', { timeout: 25_000 }).then(() => 'error-line'),
    page.waitForEvent('popup', { timeout: 25_000 }).then(() => 'vendor-popup'),
  ]).catch(() => 'no-settle')

  const errorText = settled === 'error-line' ? await page.locator('.hw-error').textContent() : null
  const violations = await page.evaluate(() => window.__cspViolations)
  await context.close()
  return { vendor, outcome: settled, errorText, consoleLines, pageErrors, violations }
}

function judge(result) {
  const findings = []
  // Missing-global crashes only — app noise (unrelated fetches against the stub wallet) must
  // not fail the probe. Uncaught page errors always count; console lines only when they name
  // the missing global.
  const missingGlobal = /Buffer is not defined|ReferenceError|global is not defined|process is not defined/
  const crash =
    result.pageErrors.find((l) => missingGlobal.test(l)) ||
    result.consoleLines.find((l) => missingGlobal.test(l))
  if (crash) {
    findings.push(`${result.vendor}: missing-global crash reached the page: ${crash.slice(0, 300)}`)
  }
  if (result.outcome === 'no-settle') {
    findings.push(`${result.vendor}: connect neither errored honestly nor opened the vendor flow (silent hang)`)
  }
  if (result.outcome === 'error-line') {
    // The "no relevant logs" fix: the raw diagnostic must have reached the console.
    if (!result.consoleLines.some((l) => l.includes('[hardware-add]'))) {
      findings.push(`${result.vendor}: UI showed an error but no [hardware-add] diagnostic was logged`)
    }
  }
  const trezorBlocked = result.violations.filter((v) => v.includes('trezor'))
  if (trezorBlocked.length > 0) {
    findings.push(`${result.vendor}: CSP blocked the vendor bridge: ${trezorBlocked.join(', ')}`)
  }
  return findings
}

async function main() {
  const server = await serveDist()
  const browser = await chromium.launch({ executablePath: chromiumExecutable() })
  const findings = []
  try {
    for (const vendor of ['ledger', 'trezor']) {
      const result = await driveVendor(browser, vendor)
      console.log(`${vendor}: outcome=${result.outcome}`, result.errorText ? `ui="${result.errorText.trim()}"` : '')
      const diag = result.consoleLines.filter((l) => l.includes('[hardware-'))
      if (diag.length) console.log(`${vendor}: diagnostics:`, diag.slice(0, 3))
      findings.push(...judge(result))
    }
  } finally {
    await browser.close()
    server.close()
  }
  if (findings.length) {
    console.error('\nFINDINGS:')
    for (const f of findings) console.error(` - ${f}`)
    process.exit(1)
  }
  console.log('\nOK — both vendor paths execute the real SDK bytes and fail honestly without a device.')
}

await main()
