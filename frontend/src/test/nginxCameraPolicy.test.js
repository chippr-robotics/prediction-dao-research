import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Regression guard for the in-app QR scanner camera permission.
//
// The browser blocks getUserMedia outright (no permission prompt) when the
// origin serves `Permissions-Policy: camera=()`. The scanner therefore needs
// `camera=(self)` on EVERY nginx config that can reach production.
//
// History: PR #644 fixed `nginx.conf` (used by frontend/Dockerfile) but the
// production deploy uses the root Dockerfile -> `nginx.conf.template`, which
// still served `camera=()`. The two files silently diverged and the live
// scanner kept failing with "Unable to access camera". This test asserts both
// files stay in sync so that divergence can't recur.

const __dirname = dirname(fileURLToPath(import.meta.url))

const CONFIGS = [
  resolve(__dirname, '../../nginx.conf'),
  resolve(__dirname, '../../nginx.conf.template'),
]

describe('nginx Permissions-Policy camera scope', () => {
  it.each(CONFIGS)('%s allows camera=(self) and not camera=()', (path) => {
    const conf = readFileSync(path, 'utf8')
    const policyLine = conf
      .split('\n')
      .find((l) => l.includes('add_header Permissions-Policy'))
    expect(policyLine, `${path} is missing a Permissions-Policy header`).toBeTruthy()
    expect(policyLine).toContain('camera=(self)')
    // The empty allowlist blocks getUserMedia with no prompt — never ship it.
    expect(policyLine).not.toMatch(/camera=\(\)/)
  })
})
