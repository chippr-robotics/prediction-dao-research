import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Regression guard for the CSP img-src allowlist (spec 055 collectibles).
//
// The Collectibles grid and detail sheet render item images straight from
// OpenSea's image CDN (`display_image_url`/`image_url`, served from
// *.seadn.io / openseauserdata.com). The browser blocks any <img> host not
// listed in `img-src`, and the panel's onError fallback then renders every
// card as a placeholder — which is exactly how images broke at launch.
//
// Like nginxCspConnectSrc.test.js, this asserts BOTH nginx configs stay in
// sync: nginx.conf (frontend/Dockerfile) and nginx.conf.template (root
// Dockerfile, used by the production deploy).

const __dirname = dirname(fileURLToPath(import.meta.url))

const CONFIGS = [
  resolve(__dirname, '../../../nginx.conf'),
  resolve(__dirname, '../../../nginx.conf.template'),
]

const REQUIRED_IMG_HOSTS = ['https://*.seadn.io', 'https://openseauserdata.com']

describe.each(CONFIGS)('CSP img-src allowlist (%s)', (configPath) => {
  const config = readFileSync(configPath, 'utf8')
  const csp = config.match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? ''
  const imgSrc = csp.match(/img-src ([^;]+);/)?.[1] ?? ''

  it.each(REQUIRED_IMG_HOSTS)('allows OpenSea image host %s', (host) => {
    expect(imgSrc).toContain(host)
  })
})
