import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Regression guard for the CSP img-src token-logo allowlist (Spec 034, FR-024).
//
// Registry token logos render via <img>. The browser blocks any image host not in
// img-src. Only allowlisted hosts are permitted: raw.githubusercontent.com (ETCswap /
// Trust Wallet logos) and ipfs.io (Uniswap ipfs:// logos, rewritten client-side). The
// application-level guard is tokenLogo.js#resolveLogoSrc; this is the CSP defense layer.
//
// Like nginxCspConnectSrc.test.js / nginxCameraPolicy.test.js, this asserts BOTH nginx
// configs stay in sync: nginx.conf (frontend/Dockerfile) and nginx.conf.template
// (root Dockerfile / production deploy). The two silently diverged once before.

const __dirname = dirname(fileURLToPath(import.meta.url))

const CONFIGS = [
  resolve(__dirname, '../../nginx.conf'),
  resolve(__dirname, '../../nginx.conf.template'),
]

const REQUIRED_IMG_HOSTS = [
  'https://raw.githubusercontent.com', // ETCswap + Trust Wallet token logos
  'https://ipfs.io', // Uniswap ipfs:// logos rewritten to the gateway
]

describe('nginx CSP img-src token-logo allowlist', () => {
  it.each(CONFIGS)('%s allowlists every trusted token-logo host', (path) => {
    const conf = readFileSync(path, 'utf8')
    const cspLine = conf
      .split('\n')
      .find((l) => l.includes('add_header Content-Security-Policy'))
    expect(cspLine, `${path} is missing a Content-Security-Policy header`).toBeTruthy()

    // Isolate the img-src directive so a host listed only under connect-src can't
    // satisfy the assertion.
    const imgSrc = cspLine.match(/img-src\s+([^;]*)/)?.[1]
    expect(imgSrc, `${path} CSP has no img-src directive`).toBeTruthy()

    for (const host of REQUIRED_IMG_HOSTS) {
      expect(
        imgSrc,
        `${path} img-src is missing ${host} — registry token logos will be blocked by CSP`,
      ).toContain(host)
    }
  })
})
