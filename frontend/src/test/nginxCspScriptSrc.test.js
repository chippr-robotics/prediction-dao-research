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
