#!/usr/bin/env node
/**
 * Render docs/developer-guide/e2e-coverage-matrix.md from the machine-readable matrix
 * (frontend/cypress/coverage/matrix.json). Spec 094, FR-001..FR-005.
 *
 * The document is GENERATED AND COMMITTED, like infra/grafana/: a hand-edit is drift, and
 * `--check` fails on it naming the command that fixes it. Prose cannot be gated; a JSON file can,
 * which is the whole reason the source of truth is not the table itself.
 *
 * Usage:
 *   node scripts/e2e/generate-coverage-matrix.js            # write
 *   node scripts/e2e/generate-coverage-matrix.js --check    # diff only, exit 1 on drift
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const MATRIX = path.join(ROOT, 'frontend', 'cypress', 'coverage', 'matrix.json')

/** Ordered so the document leads with what costs a member money. */
const RISK_ORDER = ['custody', 'disclosure', 'access', 'information', 'none']
const RISK_TITLES = {
  custody: 'Custody — member funds are escrowed, moved, bridged, swept or sent',
  disclosure: 'Disclosure — a member consents to a cost',
  access: 'Access — gating, identity and permission',
  information: 'Information — read-only surfaces',
  none: 'No member consequence',
}
const STATUS_ICON = { covered: '🟢', partial: '🟡', absent: '🔴', 'out-of-scope': '⚪' }
const DEPTH_ORDER = ['none', 'smoke', 'flow', 'settled']

const readMatrix = () => JSON.parse(fs.readFileSync(MATRIX, 'utf8'))

/** Every flow in the file, each carrying the spec it came from. */
function allFlows(matrix) {
  return matrix.specs.flatMap((spec) =>
    (spec.flows || []).map((flow) => ({ ...flow, specId: spec.id, specTitle: spec.title }))
  )
}

const count = (flows, pred) => flows.filter(pred).length

/**
 * The number this document exists to make visible: rows a naive reading would call covered, whose
 * tests do not actually prove an outcome. Counting specs is what let 33 vacuous branches read as
 * coverage.
 */
const shallowCovered = (flows) =>
  flows.filter((f) => f.status === 'covered' && DEPTH_ORDER.indexOf(f.depth) < DEPTH_ORDER.indexOf('flow'))

/**
 * Compact the evidence list: one entry per spec file with its test ids after it. The raw refs are
 * absolute paths, and repeating the path per id makes the table unreadable in the very column a
 * reader consults to check a claim.
 */
function renderEvidence(tests) {
  const byFile = new Map()
  for (const ref of tests) {
    const [file, id] = ref.split('::')
    const name = file.split('/').pop()
    if (!byFile.has(name)) byFile.set(name, [])
    if (id) byFile.get(name).push(id)
  }
  return [...byFile.entries()]
    .map(([file, ids]) => (ids.length ? `\`${file}\` (${ids.join(', ')})` : `\`${file}\``))
    .join('; ')
}

function renderFlowRow(flow) {
  const where = flow.tier === 'none' ? `— (proposed: ${flow.proposedTier})` : `\`${flow.tier}\``
  const evidence =
    flow.tests && flow.tests.length
      ? renderEvidence(flow.tests)
      : flow.issue
        ? flow.issue
        : '—'
  const note = flow.missing || flow.reason || ''
  return `| \`${flow.id}\` | ${flow.name} | ${STATUS_ICON[flow.status]} ${flow.status} | ${flow.depth} | ${where} | ${evidence} | ${note} |`
}

function render(matrix) {
  const flows = allFlows(matrix)
  const shallow = shallowCovered(flows)
  const out = []

  out.push('<!-- GENERATED FILE — do not edit by hand.')
  out.push('     Source: frontend/cypress/coverage/matrix.json')
  out.push('     Regenerate: npm run e2e:matrix -->')
  out.push('')
  out.push('# End-to-End Coverage Matrix')
  out.push('')
  out.push('Every directory under `specs/` appears here exactly once — including the ones with no member')
  out.push('surface, which carry a reason instead of flows. That is what makes the staleness gate a set')
  out.push('comparison rather than a judgement about which features "should" have been listed.')
  out.push('')
  out.push('**Status** is what exists. **Depth** is what the tests prove, and it is a separate fact: a flow')
  out.push('can be `covered` at depth `smoke`, and several are. That combination is the finding, not a')
  out.push('contradiction — a test that passes when its precondition is absent reports as coverage while')
  out.push('proving nothing.')
  out.push('')
  out.push('| Value | Status means | Depth means |')
  out.push('|---|---|---|')
  out.push('| 1 | 🟢 `covered` — tests prove the outcome | `settled` — read back from the authority that decides it (chain state, a balance) |')
  out.push('| 2 | 🟡 `partial` — a named part is unproven | `flow` — the journey completed and the interface agreed |')
  out.push('| 3 | 🔴 `absent` — nothing drives it | `smoke` — a surface rendered, a control existed |')
  out.push('| 4 | ⚪ `out-of-scope` — deliberately untested, with a reason | `none` — no test, or only assertions that cannot fail |')
  out.push('')
  out.push('See [the tiering policy](./e2e-testing-policy.md) for what belongs in which tier.')
  out.push('')
  out.push('## Totals')
  out.push('')
  out.push('| Metric | Count |')
  out.push('|---|---|')
  out.push(`| Spec directories | ${matrix.specs.length} |`)
  out.push(`| With a member-facing flow | ${count(matrix.specs, (s) => s.memberFacing)} |`)
  out.push(`| Member-facing flows | ${flows.length} |`)
  out.push(`| 🟢 covered | ${count(flows, (f) => f.status === 'covered')} |`)
  out.push(`| 🟡 partial | ${count(flows, (f) => f.status === 'partial')} |`)
  out.push(`| 🔴 absent | ${count(flows, (f) => f.status === 'absent')} |`)
  out.push(`| ⚪ out of scope | ${count(flows, (f) => f.status === 'out-of-scope')} |`)
  out.push(`| **Covered but not proven** (status \`covered\`, depth below \`flow\`) | **${shallow.length}** |`)
  out.push('')
  if (shallow.length) {
    out.push('The last row is the honest read of the suite: those flows have passing tests that do not')
    out.push('establish the outcome. They are listed in full at the end of this document.')
    out.push('')
  }

  for (const risk of RISK_ORDER) {
    const group = flows.filter((f) => f.risk === risk)
    if (!group.length) continue
    out.push(`## ${RISK_TITLES[risk]}`)
    out.push('')
    out.push(
      `${group.length} flows — ` +
        `🟢 ${count(group, (f) => f.status === 'covered')} · ` +
        `🟡 ${count(group, (f) => f.status === 'partial')} · ` +
        `🔴 ${count(group, (f) => f.status === 'absent')} · ` +
        `⚪ ${count(group, (f) => f.status === 'out-of-scope')} · ` +
        `covered-but-not-proven ${shallowCovered(group).length}`
    )
    out.push('')

    const bySpec = new Map()
    for (const flow of group) {
      if (!bySpec.has(flow.specId)) bySpec.set(flow.specId, [])
      bySpec.get(flow.specId).push(flow)
    }
    for (const [specId, specFlows] of [...bySpec.entries()].sort()) {
      out.push(`### \`${specId}\` — ${specFlows[0].specTitle}`)
      out.push('')
      out.push('| Flow | What a member does | Status | Depth | Tier | Evidence / issue | Note |')
      out.push('|---|---|---|---|---|---|---|')
      for (const flow of specFlows) out.push(renderFlowRow(flow))
      out.push('')
    }
  }

  const nonMember = matrix.specs.filter((s) => !s.memberFacing)
  if (nonMember.length) {
    out.push('## No member-facing flow')
    out.push('')
    out.push('Listed so the gate can tell "correctly omitted" from "forgotten".')
    out.push('')
    out.push('| Spec | Why there is nothing to drive |')
    out.push('|---|---|')
    for (const spec of nonMember) out.push(`| \`${spec.id}\` — ${spec.title} | ${spec.reason} |`)
    out.push('')
  }

  if (shallow.length) {
    out.push('## Covered but not proven')
    out.push('')
    out.push('Passing tests that do not establish the outcome. Each needs its assertions deepened, not')
    out.push('another test added beside it.')
    out.push('')
    out.push('| Flow | Spec | Depth | Evidence |')
    out.push('|---|---|---|---|')
    for (const flow of shallow) {
      out.push(`| \`${flow.id}\` | \`${flow.specId}\` | ${flow.depth} | ${renderEvidence(flow.tests || []) || '—'} |`)
    }
    out.push('')
  }

  return out.join('\n') + '\n'
}

function main() {
  const matrix = readMatrix()
  const target = path.join(ROOT, matrix.generatedDoc)
  const rendered = render(matrix)
  const check = process.argv.includes('--check')

  if (check) {
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
    if (existing === rendered) {
      console.log(`e2e coverage matrix: ${matrix.generatedDoc} is current.`)
      return
    }
    console.error(
      `::error::${matrix.generatedDoc} does not match frontend/cypress/coverage/matrix.json.\n` +
        'The document is generated and committed — regenerate it with `npm run e2e:matrix` rather than editing it.'
    )
    process.exit(1)
  }

  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, rendered)
  console.log(`Wrote ${matrix.generatedDoc} (${matrix.specs.length} specs, ${allFlows(matrix).length} flows).`)
}

if (require.main === module) main()

module.exports = { render, readMatrix, allFlows, shallowCovered, DEPTH_ORDER, RISK_ORDER }
