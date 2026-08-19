import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative } from 'node:path'

/**
 * Spec 094 — gates on the assertion shapes that produced coverage the suite did not have.
 *
 * The finding these exist for: 33 branches across four money-path specs end in
 * `expect(true).to.be.true` behind a guard like
 *
 *     if (rows.length > 0) { …the actual test… } else { expect(true).to.be.true }
 *
 * A test that passes when its precondition is absent is WORSE than a missing test, because it
 * reports as coverage. RES-10 was exactly this — it hoped a resolvable wager was lying around from
 * an earlier test and passed when one was not. Per-test chain isolation is what finally exposed it.
 *
 * The pattern has ONE legitimate use — an outcome that genuinely may go either way — so this gate
 * does not ban it. It requires a `// EITHER-WAY:` comment naming the outcome, which keeps the
 * exceptions countable rather than letting them accumulate invisibly.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../../../..')
const E2E_DIR = resolve(ROOT, 'frontend/cypress/e2e')

/** Every `*.cy.js` under cypress/e2e, at any depth. */
function specFiles(dir = E2E_DIR) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) return specFiles(full)
    return entry.name.endsWith('.cy.js') ? [full] : []
  })
}

const FILES = specFiles().sort()
const read = (file) => readFileSync(file, 'utf8').split('\n')
const rel = (file) => relative(ROOT, file)

/**
 * Assertions that cannot fail. Deliberately narrow: these are the literal-vs-itself forms, not
 * "assertions that look weak". A broad heuristic here would produce noise, and a noisy gate gets
 * an exemption comment rather than a fix.
 */
const UNCONDITIONAL = [
  /expect\(true\)\s*\.to\.be\.true/,
  /expect\(false\)\s*\.to\.be\.false/,
  /expect\((\d+)\)\s*\.to\.(equal|eq)\(\1\)/,
  /assert\.isTrue\(true\)/,
]

/** Terms a "did it work" assertion accepts. Both lists present in one assertion is the defect. */
const SUCCESS_TERMS = /'(resolved|settled|success|succeeded|confirmed|complete[d]?|active|accepted|created|claimed)'/
const FAILURE_TERMS = /'(error|failed|failure|reverted|rejected|denied)'/

/**
 * Two annotations, and the difference between them is the point.
 *
 *   // EITHER-WAY: <reason>          the outcome genuinely may go either way — a legitimate use
 *   // ASSERTION-DEBT: #NNNN         a known-weak assertion awaiting rewrite, tracked by that issue
 *
 * Calling the 33 existing vacuous branches "either-way" would have been a lie that made the count
 * meaningless. They are debt, they say so, and the issue they name is where they get fixed.
 */
const EITHER_WAY = /\/\/\s*EITHER-WAY:\s*\S+/
const DEBT = /\/\/\s*ASSERTION-DEBT:\s*#\d+/

/**
 * Lines that are prose, not code. Comments explaining the anti-pattern — including the ones in this
 * repo's own commit messages and file headers — quote it verbatim, and a gate that fires on a
 * description of the bug rather than the bug is a gate people route around. Caught exactly that way:
 * staging's CLM-10 rewrite documents the two fall-throughs it removed, and this flagged the prose.
 */
const isProse = (line) => {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

/** Look back a few lines for an annotation; a comment two lines up still reads as attached. */
function annotation(lines, index) {
  const preceding = lines.slice(Math.max(0, index - 3), index).join('\n')
  if (EITHER_WAY.test(preceding)) return 'either-way'
  if (DEBT.test(preceding)) return 'debt'
  return null
}

describe('e2e assertion depth', () => {
  it('finds spec files to check', () => {
    // A gate that silently matched nothing is the failure mode this whole feature exists to remove.
    expect(FILES.length, 'no cypress specs found — has the suite moved?').toBeGreaterThan(10)
  })

  it('allows an unconditional truth only with a stated reason or a tracked debt', () => {
    const offenders = []
    let eitherWay = 0
    let debt = 0

    for (const file of FILES) {
      const lines = read(file)
      lines.forEach((line, i) => {
        if (isProse(line)) return
        if (!UNCONDITIONAL.some((re) => re.test(line))) return
        const note = annotation(lines, i)
        if (note === 'either-way') return eitherWay++
        if (note === 'debt') return debt++
        offenders.push(`${rel(file)}:${i + 1}  ${line.trim()}`)
      })
    }

    // Always reported, not only on failure: the debt number is the honest read of the suite and
    // is supposed to be watched going down.
    // eslint-disable-next-line no-console
    console.log(
      `e2e assertion ledger — unconditional truths: ${debt} tracked as debt, ${eitherWay} genuinely either-way.`
    )

    expect(
      offenders,
      [
        `${offenders.length} assertion(s) that cannot fail, with no stated reason.`,
        '',
        'An assertion like `expect(true).to.be.true` behind a precondition guard reports as',
        'coverage while proving nothing — see docs/developer-guide/e2e-testing-policy.md,',
        'anti-pattern 7. Assert the outcome; or, where the outcome is genuinely either-way, put a',
        '`// EITHER-WAY: <reason>` above it; or, for a known weak assertion awaiting rewrite,',
        '`// ASSERTION-DEBT: #NNNN` naming the issue that fixes it.',
        '',
        `Currently: ${debt} tracked as debt, ${eitherWay} either-way.`,
        '',
        ...offenders,
      ].join('\n')
    ).toEqual([])
  })

  it('reports success assertions that also accept failure wording', () => {
    const offenders = []
    let tracked = 0

    for (const file of FILES) {
      const lines = read(file)
      lines.forEach((line, i) => {
        if (isProse(line)) return
        if (!(SUCCESS_TERMS.test(line) && FAILURE_TERMS.test(line))) return
        if (annotation(lines, i)) return tracked++
        offenders.push(`${rel(file)}:${i + 1}  ${line.trim()}`)
      })
    }

    // eslint-disable-next-line no-console
    console.log(`e2e assertion ledger — contradictory accepted-terms: ${tracked} tracked.`)

    expect(
      offenders,
      [
        `${offenders.length} assertion(s) accept both success and failure wording, so they pass`,
        'whether the operation worked or not. Split them, or assert the outcome from chain state.',
        `Known ones awaiting rewrite carry \`// ASSERTION-DEBT: #NNNN\` (currently ${tracked}).`,
        '',
        ...offenders,
      ].join('\n')
    ).toEqual([])
  })

  it('requires every accessibility suppression to name its tracking issue', () => {
    const offenders = []

    for (const file of FILES) {
      const source = readFileSync(file, 'utf8')
      // Each entry inside a disableRules array must carry an issue reference.
      const blocks = source.match(/disableRules\s*:\s*\[[^\]]*\]/gs) || []
      for (const block of blocks) {
        for (const entry of block.match(/\{[^}]*\}/g) || []) {
          if (!/issue\s*:\s*'#\d+'/.test(entry)) {
            offenders.push(`${rel(file)}  ${entry.replace(/\s+/g, ' ').trim()}`)
          }
        }
      }
    }

    expect(
      offenders,
      [
        'Every accessibility suppression must name the issue tracking it, so the exceptions stay',
        "countable: { rule: 'color-contrast', issue: '#1019' }.",
        '',
        ...offenders,
      ].join('\n')
    ).toEqual([])
  })
})
