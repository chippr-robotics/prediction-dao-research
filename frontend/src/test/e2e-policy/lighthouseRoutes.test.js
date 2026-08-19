import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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

/**
 * The audits allowed to FAIL the build. All accessibility, because constitution V commits to
 * WCAG 2.1 AA and the gate-strength decision for this feature is "accessibility blocks, performance
 * reports". Anything outside this set must be `warn` or `off`.
 */
const MAY_BLOCK = new Set([
  'meta-viewport', 'document-title', 'html-has-lang', 'html-lang-valid', 'image-alt', 'label',
  'link-name', 'button-name', 'aria-allowed-attr', 'aria-required-attr', 'aria-valid-attr',
  'aria-valid-attr-value', 'duplicate-id-aria', 'tabindex',
])

describe('lighthouse route configuration', () => {
  it('collects exactly the routes lighthouse-routes.json declares, on both profiles', () => {
    expect(() =>
      execFileSync('node', ['scripts/e2e/check-lighthouse-coverage.js', '--routes-only'], {
        cwd: ROOT,
        stdio: 'pipe',
      })
    ).not.toThrow()
  })

  it('lets only accessibility audits block, and carries no preset that would override that', () => {
    /*
     * `preset: "lighthouse:recommended"` marks nearly every audit `error`. With one measured route
     * that never bit; with six it failed the job on `non-composited-animations` — a PERFORMANCE
     * audit blocking a gate whose stated design is that budgets report and only an unmeasured route
     * fails. Severity is a decision, so it is asserted rather than inherited.
     */
    for (const profile of ['desktop', 'mobile']) {
      const file = resolve(ROOT, `frontend/lighthouserc.${profile}.json`)
      const config = JSON.parse(readFileSync(file, 'utf8'))

      expect(
        config.ci.assert.preset,
        `lighthouserc.${profile}.json carries an assertion preset. A preset decides severities for ` +
          'audits nobody listed — list them instead.'
      ).toBeUndefined()

      const blocking = Object.entries(config.ci.assert.assertions)
        .filter(([, value]) => (typeof value === 'string' ? value : value[0]) === 'error')
        .map(([audit]) => audit)

      const unexpected = blocking.filter((audit) => !MAY_BLOCK.has(audit)).sort()
      expect(
        unexpected,
        [
          `lighthouserc.${profile}.json blocks the build on non-accessibility audit(s):`,
          `  ${unexpected.join(', ')}`,
          '',
          'Performance budgets REPORT — a Lighthouse score on a shared runner moves several points',
          'between runs, and a gate that mostly reports the runner is one people learn to re-run.',
          'What blocks is an unmeasured route (check-lighthouse-coverage.js) and accessibility.',
        ].join('\n')
      ).toEqual([])
    }
  })
})
