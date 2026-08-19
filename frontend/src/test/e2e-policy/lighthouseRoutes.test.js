import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * Spec 094 — the budgeted route set lives in `frontend/lighthouse-routes.json`, and both LHCI
 * configs must collect exactly it.
 *
 * Checked HERE, in the unit job, as well as inside the Lighthouse job: the Lighthouse workflow only
 * runs on frontend-path pull requests, so drift introduced from any other direction would sit
 * undetected until someone happened to touch the frontend. And drift is quiet by nature — a route
 * present in one config and absent from the other still produces a green Lighthouse run, just one
 * measuring a different thing than the report check claims.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../../../..')

describe('lighthouse route configuration', () => {
  it('collects exactly the routes lighthouse-routes.json declares, on both profiles', () => {
    expect(() =>
      execFileSync('node', ['scripts/e2e/check-lighthouse-coverage.js', '--routes-only'], {
        cwd: ROOT,
        stdio: 'pipe',
      })
    ).not.toThrow()
  })
})
