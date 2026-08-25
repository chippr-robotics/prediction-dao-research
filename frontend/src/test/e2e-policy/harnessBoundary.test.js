import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative } from 'node:path'

/**
 * Spec 094 — `axe-core` is a TEST-TIME ruleset, injected into the app window by the Cypress
 * harness. It must never be imported by shipped code: it is ~600 KB of rules that would ride into
 * every production bundle, and constitution III's "no test scaffolding in shipped paths" applies to
 * a linting engine as much as to mock data.
 *
 * Component-level accessibility tests use `vitest-axe` and live under src/test/, which is excluded
 * here — those files are not part of any bundle.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../../../..')
const SRC = resolve(ROOT, 'frontend/src')
const TEST_DIR = resolve(SRC, 'test')

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name)
    if (full === TEST_DIR) return []
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name) ? [full] : []
  })
}

describe('e2e harness boundary', () => {
  it('never imports axe-core from shipped frontend code', () => {
    const offenders = sourceFiles(SRC).filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /from\s+'axe-core'|require\(\s*'axe-core'\s*\)|import\(\s*'axe-core'\s*\)/.test(source)
    })

    expect(
      offenders.map((f) => relative(ROOT, f)),
      [
        'axe-core is injected by the Cypress harness (frontend/cypress/support/a11y.js) and must not',
        'be imported by shipped code — it would ride into the production bundle.',
        '',
      ].join('\n')
    ).toEqual([])
  })
})
