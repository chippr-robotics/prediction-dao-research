import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Regression guard for the CSP script-src WebAssembly grant.
//
// Spec 034's Group Pools redesign dropped Semaphore (and its in-browser Groth16 proof generation)
// entirely, so the bundle no longer compiles or instantiates any `.wasm`. The narrow
// `'wasm-unsafe-eval'` token was removed from script-src along with it, re-tightening the production
// CSP. This guard asserts it stays gone: if a future change re-adds a WASM grant it must come with a
// deliberate justification, not silently ride back in.
//
// The broader `'unsafe-eval'` must never ship either — the bundle uses no dynamic eval()/new Function().
//
// Like nginxCspConnectSrc.test.js, this asserts BOTH nginx configs stay in sync: nginx.conf
// (frontend/Dockerfile) and nginx.conf.template (root Dockerfile — the PRODUCTION deploy). They
// diverged once on exactly this token: the fix landed in nginx.conf only, so fairwins.app stayed broken.

const __dirname = dirname(fileURLToPath(import.meta.url))

const CONFIGS = [
  resolve(__dirname, '../../nginx.conf'),
  resolve(__dirname, '../../nginx.conf.template'),
]

/** The script-src directive value of a config's Content-Security-Policy header. */
function scriptSrcOf(path) {
  const conf = readFileSync(path, 'utf8')
  const cspLine = conf
    .split('\n')
    .find((l) => l.includes('add_header Content-Security-Policy'))
  expect(cspLine, `${path} is missing a Content-Security-Policy header`).toBeTruthy()

  const scriptSrc = cspLine.match(/script-src\s+([^;]*)/)?.[1]
  expect(scriptSrc, `${path} CSP has no script-src directive`).toBeTruthy()
  return scriptSrc.trim()
}

describe('nginx CSP script-src WebAssembly grant', () => {
  it.each(CONFIGS)('%s no longer carries a WASM grant (Semaphore removed in spec 034)', (path) => {
    const conf = readFileSync(path, 'utf8')
    const cspLine = conf
      .split('\n')
      .find((l) => l.includes('add_header Content-Security-Policy'))
    expect(cspLine, `${path} is missing a Content-Security-Policy header`).toBeTruthy()

    const scriptSrc = cspLine.match(/script-src\s+([^;]*)/)?.[1]
    expect(scriptSrc, `${path} CSP has no script-src directive`).toBeTruthy()

    // Spec 034 dropped Semaphore + its in-browser Groth16 proofs, so no .wasm is compiled anymore.
    // The narrow 'wasm-unsafe-eval' token was removed with it — re-adding a WASM grant must be a
    // deliberate, justified change, not a silent regression.
    expect(
      scriptSrc,
      `${path} script-src should not carry 'wasm-unsafe-eval' — Semaphore/WASM was removed in spec 034`,
    ).not.toContain("'wasm-unsafe-eval'")

    // The broad grant must never ship — it would also permit eval()/new Function().
    expect(
      scriptSrc,
      `${path} script-src must not contain the broad 'unsafe-eval'`,
    ).not.toContain("'unsafe-eval'")
  })
})

// Spec 073 (T019) — the mini-app package grant.
//
// Mini-app packages are fetched as BYTES over connect-src, verified against the on-chain
// manifestHash and the manifest's per-file sha256 digests, and only then wrapped in a Blob and
// dynamically imported (src/lib/miniapps/loader.js, research R1). Without `blob:` in script-src the
// browser blocks that import and every launch dies on a CSP violation the member cannot act on.
//
// The more important half is what script-src must NEVER carry. A bare `https:` scheme-source here
// would mean ANY origin may serve executable code to this app — turning a compromised or hostile
// gateway into remote code execution and dissolving the whole verify-before-execute chain the loader
// exists to enforce. Spec 069 accepted the scheme-wide grant for `connect-src` alone (members run
// their own RPC nodes); script-src is where that line is drawn, and this is what keeps it drawn.
// `blob:` is safe in a way `https:` is not: a blob URL can only be minted by this app's own code,
// after verification, so it admits no third party at all.
describe('nginx CSP script-src mini-app package grant (spec 073)', () => {
  it.each(CONFIGS)('%s grants blob: so verified mini-app packages can be imported', (path) => {
    expect(
      scriptSrcOf(path).split(/\s+/),
      `${path} script-src is missing blob: — every mini-app launch would be blocked by CSP`,
    ).toContain('blob:')
  })

  it.each(CONFIGS)('%s never grants a scheme-wide script source', (path) => {
    const sources = scriptSrcOf(path).split(/\s+/)
    // Scheme-sources (no host) let any origin serve script. Named hosts such as
    // https://*.cloudflareinsights.com are a different thing and unaffected by this assertion.
    for (const scheme of ['https:', 'http:', 'data:', '*']) {
      expect(
        sources,
        `${path} script-src must not carry a bare ${scheme} grant — any origin could serve executable code`,
      ).not.toContain(scheme)
    }
  })

  it('keeps script-src byte-identical across both configs', () => {
    const [first, ...rest] = CONFIGS.map(scriptSrcOf)
    for (const value of rest) expect(value).toBe(first)
  })

  it.each(CONFIGS)('%s adds blob: to script-src only, not to frame-src', (path) => {
    // img-src already carries blob: (avatars/QR codes render from object URLs). frame-src must stay
    // narrow: spec 073 sandboxes nothing in an iframe, so a blob: frame source could only be an
    // unreviewed new capability riding in on this change.
    const conf = readFileSync(path, 'utf8')
    const cspLine = conf
      .split('\n')
      .find((l) => l.includes('add_header Content-Security-Policy'))
    const frameSrc = cspLine.match(/frame-src\s+([^;]*)/)?.[1] || ''
    expect(frameSrc.split(/\s+/), `${path} frame-src must not carry blob:`).not.toContain('blob:')
  })
})
