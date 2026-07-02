import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Regression guard for the CSP script-src WebAssembly grant.
//
// ZK-Wager Pools (spec 034) generate Semaphore Groth16 proofs in the browser, which compiles/
// instantiates a `.wasm` circuit witness calculator (frontend/src/lib/pools/semaphoreProof.js —
// join-time claim-code precache, approve/vote, and claim). A `script-src` WITHOUT a WASM grant makes
// every CSP-enforcing browser throw `CompileError: ... 'unsafe-eval' is not an allowed source` the
// moment a member tries to approve/claim — strictly after the identity-derivation wallet signature, so
// it presents as the "approve does nothing" bug (signs once, then silence).
//
// `'wasm-unsafe-eval'` is the NARROW grant: it permits WebAssembly compilation only, NOT eval()/
// new Function(). The broader `'unsafe-eval'` must never ship — the bundle uses no dynamic eval.
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
  it.each(CONFIGS)('%s allows WASM compilation via the narrow wasm-unsafe-eval token', (path) => {
    const conf = readFileSync(path, 'utf8')
    const cspLine = conf
      .split('\n')
      .find((l) => l.includes('add_header Content-Security-Policy'))
    expect(cspLine, `${path} is missing a Content-Security-Policy header`).toBeTruthy()

    const scriptSrc = cspLine.match(/script-src\s+([^;]*)/)?.[1]
    expect(scriptSrc, `${path} CSP has no script-src directive`).toBeTruthy()

    expect(
      scriptSrc,
      `${path} script-src is missing 'wasm-unsafe-eval' — Semaphore proof generation (pool ` +
        `approve/claim) will throw a CSP CompileError and silently fail`,
    ).toContain("'wasm-unsafe-eval'")

    // The broad grant must never ship — it would also permit eval()/new Function().
    expect(
      scriptSrc.replace("'wasm-unsafe-eval'", ''),
      `${path} script-src must not contain the broad 'unsafe-eval'`,
    ).not.toContain("'unsafe-eval'")
  })
})
