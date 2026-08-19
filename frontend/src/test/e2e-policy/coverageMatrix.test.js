import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * Spec 094 — the coverage matrix must stay true, and the document rendered from it must stay
 * current.
 *
 * The gate that matters most is set equality against `specs/`. It works only because EVERY spec
 * directory gets an entry, including the ones with no member surface (they carry a reason instead
 * of flows). Without that rule no check can tell "correctly omitted" from "forgotten", which is
 * exactly how a coverage document decays into a description of last quarter.
 *
 * Runs inside the existing Frontend Unit Tests job on purpose (research R8): a new workflow is a
 * new thing to be excluded from the merge gate, and this repo has already shipped an e2e gate that
 * reported success on every run.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../../../..')
const MATRIX_PATH = resolve(ROOT, 'frontend/cypress/coverage/matrix.json')
const SPECS_DIR = resolve(ROOT, 'specs')

const STATUSES = ['covered', 'partial', 'absent', 'out-of-scope']
const DEPTHS = ['none', 'smoke', 'flow', 'settled']
const TIERS = ['no-chain', 'on-chain', 'account-native', 'none']
const RISKS = ['custody', 'disclosure', 'access', 'information', 'none']

const matrix = JSON.parse(readFileSync(MATRIX_PATH, 'utf8'))
const allFlows = matrix.specs.flatMap((s) => (s.flows || []).map((f) => ({ ...f, specId: s.id })))

/** Feature directories only — `checklists/` and friends are not features. */
const specDirs = readdirSync(SPECS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^\d{3,}-/.test(e.name))
  .map((e) => e.name)
  .sort()

describe('e2e coverage matrix', () => {
  it('has an entry for every spec directory, and no entry without one', () => {
    const listed = matrix.specs.map((s) => s.id).sort()
    const missing = specDirs.filter((d) => !listed.includes(d))
    const extra = listed.filter((id) => !specDirs.includes(id))

    expect(
      missing,
      `specs/ directories with no matrix row — add them to frontend/cypress/coverage/matrix.json:\n  ${missing.join('\n  ')}`
    ).toEqual([])
    expect(
      extra,
      `matrix rows with no specs/ directory (renamed or removed?):\n  ${extra.join('\n  ')}`
    ).toEqual([])
  })

  it('keys entries by directory name, never by number', () => {
    // 017, 041 and 050 are each used by two different features. A numeric key merges them.
    for (const spec of matrix.specs) {
      expect(spec.id, `matrix id "${spec.id}" must be a spec directory name`).toMatch(/^\d{3,}-[a-z0-9-]+$/)
    }
  })

  it('gives every non-member-facing spec a reason and no flows', () => {
    for (const spec of matrix.specs.filter((s) => !s.memberFacing)) {
      expect(spec.reason, `${spec.id}: memberFacing:false needs a reason`).toBeTruthy()
      expect(spec.flows ?? [], `${spec.id}: memberFacing:false must have no flows`).toEqual([])
    }
  })

  it('gives every member-facing spec at least one flow', () => {
    for (const spec of matrix.specs.filter((s) => s.memberFacing)) {
      expect((spec.flows || []).length, `${spec.id}: memberFacing:true needs at least one flow`).toBeGreaterThan(0)
    }
  })

  it('uses only the declared enum values', () => {
    for (const flow of allFlows) {
      expect(STATUSES, `${flow.id}: status`).toContain(flow.status)
      expect(DEPTHS, `${flow.id}: depth`).toContain(flow.depth)
      expect(TIERS, `${flow.id}: tier`).toContain(flow.tier)
      expect(RISKS, `${flow.id}: risk`).toContain(flow.risk)
    }
  })

  it('makes every flow id unique', () => {
    const seen = new Map()
    for (const flow of allFlows) {
      const prior = seen.get(flow.id)
      expect(prior, `flow id "${flow.id}" used by both ${prior} and ${flow.specId}`).toBeUndefined()
      seen.set(flow.id, flow.specId)
    }
  })

  it('requires "partial" to name what is missing, and "out-of-scope" to give a reason', () => {
    for (const flow of allFlows) {
      if (flow.status === 'partial') {
        expect(flow.missing, `${flow.id}: status "partial" must name what is missing`).toBeTruthy()
      }
      if (flow.status === 'out-of-scope') {
        expect(flow.reason, `${flow.id}: status "out-of-scope" must carry a reason`).toBeTruthy()
      }
    }
  })

  it('requires a tracking issue on every absent or partial flow', () => {
    // FR-016: no gap exists only inside a document.
    for (const flow of allFlows.filter((f) => f.status === 'absent' || f.status === 'partial')) {
      // Anchored across the WHOLE alternation. `/^#\d+|^#TBD$/` binds `^` to each branch but `$`
      // only to the second, so `#123oops` would have satisfied a gate whose entire job is to make
      // sure the reference is real.
      expect(flow.issue, `${flow.id}: ${flow.status} flows need a tracking issue`).toMatch(/^(#\d+|#TBD)$/)
    }
  })

  it('ties depth to evidence in both directions', () => {
    for (const flow of allFlows) {
      const tests = flow.tests || []
      if (flow.depth === 'none') {
        expect(tests, `${flow.id}: depth "none" must cite no tests`).toEqual([])
      } else {
        expect(tests.length, `${flow.id}: depth "${flow.depth}" must cite the tests that back it`).toBeGreaterThan(0)
      }
    }
  })

  it('cites test files that exist', () => {
    for (const flow of allFlows) {
      for (const ref of flow.tests || []) {
        // A reference is either a spec path or "path::TEST-ID".
        const filePath = ref.split('::')[0]
        expect(
          existsSync(resolve(ROOT, filePath)),
          `${flow.id}: cited test file does not exist — ${filePath}`
        ).toBe(true)
      }
    }
  })

  it('pairs tier "none" with a proposed tier and an untested status', () => {
    for (const flow of allFlows.filter((f) => f.tier === 'none')) {
      expect(['absent', 'out-of-scope'], `${flow.id}: tier "none" with status ${flow.status}`).toContain(flow.status)
      expect(TIERS, `${flow.id}: proposedTier`).toContain(flow.proposedTier)
      expect(flow.proposedTier, `${flow.id}: proposedTier must not itself be "none"`).not.toBe('none')
    }
  })

  it('keeps the generated document current', () => {
    // Regenerate-and-diff, like infra/grafana/. A hand-edited document is drift.
    expect(() =>
      execFileSync('node', ['scripts/e2e/generate-coverage-matrix.js', '--check'], {
        cwd: ROOT,
        stdio: 'pipe',
      })
    ).not.toThrow()
  })
})
