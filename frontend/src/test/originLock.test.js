import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Regression guard for the nginx origin-lock template (Spec 007, FR-007/FR-008).
// Renders the template the way docker-entrypoint.sh does (envsubst of the 3 vars) and
// asserts the map + per-location guards are structured so that:
//   - enforcement OFF (no secret)  => allow everything (dev/local not bricked)
//   - enforcement ON  (secret set) => only an exact X-Origin-Auth match is allowed
// Full runtime behavior (no-hdr→403, wrong→403, correct→200, healthz→200) was verified
// against nginx during implementation and is documented in infra/cloudflare/origin-lock.md.

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = resolve(__dirname, '../../nginx.conf.template')

function render(vars) {
  let s = readFileSync(TEMPLATE, 'utf8')
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`\${${k}}`, v)
  }
  return s
}

describe('nginx origin-lock template (T011)', () => {
  it('has an unauthenticated /healthz exemption and an edge-aware access log', () => {
    const tpl = readFileSync(TEMPLATE, 'utf8')
    expect(tpl).toMatch(/location\s*=\s*\/healthz/)
    expect(tpl).toContain('$http_cf_ipcountry')
    expect(tpl).toContain('$http_cf_connecting_ip')
  })

  it('guards every served location with $origin_denied', () => {
    const tpl = readFileSync(TEMPLATE, 'utf8')
    const guards = tpl.match(/if \(\$origin_denied\) \{ return 403; \}/g) || []
    // SPA `/`, static-assets regex, and the /api/pinata proxy
    expect(guards.length).toBeGreaterThanOrEqual(3)
  })

  it('ENABLED=0 (no secret) allows everything via the ~^0: branch', () => {
    const out = render({ ORIGIN_LOCK_ENABLED: '0', ORIGIN_LOCK_SECRET: '', VITE_PINATA_JWT: 'x' })
    expect(out).toContain('map "0:$http_x_origin_auth" $origin_denied')
    expect(out).toMatch(/"~\^0:"\s+0;/)
  })

  it('ENABLED=1 allows ONLY an exact secret match; default denies', () => {
    const out = render({ ORIGIN_LOCK_ENABLED: '1', ORIGIN_LOCK_SECRET: 's3cr3t', VITE_PINATA_JWT: 'x' })
    expect(out).toContain('map "1:$http_x_origin_auth" $origin_denied')
    expect(out).toMatch(/"1:s3cr3t"\s+0;/)
    expect(out).toMatch(/default\s+1;/)
  })

  it('never substitutes the secret into a logged directive (no secret in log_format)', () => {
    const out = render({ ORIGIN_LOCK_ENABLED: '1', ORIGIN_LOCK_SECRET: 's3cr3t', VITE_PINATA_JWT: 'x' })
    const logLine = out.split('\n').find((l) => l.includes('log_format fairwins_edge')) || ''
    expect(logLine).not.toContain('s3cr3t')
    expect(out).not.toMatch(/access_log[^\n]*s3cr3t/)
  })
})
