#!/usr/bin/env node
/**
 * The FinOps coverage gate (spec 089, FR-019…FR-023).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *  THIS IS THE FEATURE'S LOAD-BEARING PIECE.
 *
 *  The brief said: "Any time a new cost or revenue source is added to the platform we MUST update
 *  the dashboard." Every comparable invariant in this repository that survived was made a CI gate —
 *  check:storage-layout, check:iac, check:deps, TypehashParity. A prose rule asking future authors
 *  to remember the dashboard would be the one rule with no enforcement, and it would be broken
 *  within two specs.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Five checks. A new fee service fails at least three of them.
 *
 *   C1  catalogue schema is valid                          (FR-002)
 *   C2  every on-chain fee service has a catalogue entry    (FR-019)
 *   C3  every catalogued metric is one a collector emits    (FR-021)
 *   C4  every catalogued source has a dashboard panel       (FR-020)
 *   C5  committed dashboards match a fresh generation       (regenerate-and-diff)
 *
 * Every failure message names the exact file and the edit that resolves it (FR-023). A gate that
 * fails without saying how to satisfy it is a gate somebody disables.
 *
 * Usage: node scripts/finops/check-finops-coverage.js [--json]
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { SOURCES, FEE_SERVICE_LABELS, validateCatalogue, METRIC_FAMILIES } from '../../packages/finops-catalogue/src/index.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const CATALOGUE = 'packages/finops-catalogue/src/sources.js'

const violations = []
const fail = (check, message, fix) => violations.push({ check, message, fix })

const readIfExists = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : null)

// ── C1: schema ───────────────────────────────────────────────────────────────────────────────

for (const problem of validateCatalogue(SOURCES)) {
  fail('C1', problem, `Edit ${CATALOGUE}.`)
}

// ── C2: on-chain fee services vs the catalogue (FR-019) ──────────────────────────────────────
//
// The fee services are read from TWO independent places and both must agree with the catalogue:
// the frontend's FEE_SERVICES table and the gateway's FEE_SERVICE_IDS. Checking only one would let
// a service that exists in the contracts but in just one client slip through — and the frontend
// table is itself checked against the contracts by the spec-060 suite, so this closes the loop.

/** Extract `keccakId('some.label')` / `ethers.id('some.label')` preimages from a source file. */
function extractServiceLabels(text) {
  if (!text) return []
  const out = new Set()
  for (const m of text.matchAll(/(?:keccakId|ethers\.id|\bid)\(\s*['"]([a-z][a-z0-9.]*\.[a-z0-9.]+)['"]\s*\)/g)) {
    out.add(m[1])
  }
  return [...out]
}

const frontendFees = extractServiceLabels(readIfExists('frontend/src/lib/fees/feeQuote.js'))
const gatewayFees = extractServiceLabels(readIfExists('services/relay-gateway/src/fees/onchain.js'))
const platformFees = new Set([...frontendFees, ...gatewayFees])
const catalogued = new Set(FEE_SERVICE_LABELS)

for (const label of [...platformFees].sort()) {
  if (!catalogued.has(label)) {
    fail(
      'C2',
      `FeeRouter service '${label}' exists in the platform but has NO catalogue entry, so it earns revenue that appears on no dashboard.`,
      `Add an entry to the FEE_SERVICES array in ${CATALOGUE} with serviceLabel: '${label}', then run \`npm run finops:generate\`.`,
    )
  }
}

// The reverse: a catalogued service the platform no longer has. Its panel would render "No data"
// forever, which on a revenue dashboard is indistinguishable from "no revenue".
for (const label of [...catalogued].sort()) {
  if (platformFees.size && !platformFees.has(label)) {
    fail(
      'C2',
      `Catalogued fee service '${label}' is not referenced by the frontend fee table or the gateway fee reader. Its panel will show "No data" forever, which reads as "earned nothing".`,
      `Either restore the service in the platform, or set that entry's status to 'retired' in ${CATALOGUE}.`,
    )
  }
}

// ── C3: catalogued metrics vs what the exporter can emit (FR-021) ────────────────────────────
//
// A panel querying a metric no collector emits renders "No data". On a revenue dashboard that is
// indistinguishable from "no revenue", which is precisely the confusion this whole feature exists
// to prevent — so it is a build failure, not a display quirk.

const COLLECTOR_DIR = 'services/finops-exporter/src/collectors'
const collectorFiles = existsSync(join(ROOT, COLLECTOR_DIR)) ? readdirSync(join(ROOT, COLLECTOR_DIR)) : []
const collectorNames = new Set(collectorFiles.map((f) => f.replace(/\.js$/, '')))
collectorNames.add('none') // the sentinel used by `planned` sources

// Every metric family the exporter's registry and collectors can actually produce.
const exporterSources = [
  ...collectorFiles.map((f) => readIfExists(`${COLLECTOR_DIR}/${f}`)),
  readIfExists('services/finops-exporter/src/registry.js'),
  readIfExists('services/finops-exporter/src/server.js'),
].filter(Boolean).join('\n')

// `registry.record` emits `source.metric` verbatim, so any family declared in the schema and
// reachable through record() counts as emitted; families emitted directly appear as string literals.
const emittedDirectly = new Set(
  [...exporterSources.matchAll(/emit\(\s*['"]([a-z_]+)['"]/g)].map((m) => `fairwins_finops_${m[1]}`),
)
const emitsViaRecord = /registry\.record\(|\.record\(source/.test(exporterSources)

for (const source of SOURCES) {
  if (!source.metric) continue // planned sources declare none, by design

  if (!METRIC_FAMILIES.includes(source.metric)) {
    fail(
      'C3',
      `Source '${source.id}' declares metric '${source.metric}', which is not a declared metric family.`,
      `Add it to METRIC_FAMILIES in packages/finops-catalogue/src/schema.js and to specs/089-finops-dashboard/contracts/metrics.md, or fix the typo in ${CATALOGUE}.`,
    )
  }
  if (!emittedDirectly.has(source.metric) && !emitsViaRecord) {
    fail(
      'C3',
      `Source '${source.id}' declares metric '${source.metric}', but no collector emits it. Its panel would render "No data" forever.`,
      `Emit it from ${COLLECTOR_DIR}/${source.collector}.js, or correct the metric in ${CATALOGUE}.`,
    )
  }
  if (!collectorNames.has(source.collector)) {
    fail(
      'C3',
      `Source '${source.id}' names collector '${source.collector}', which does not exist.`,
      `Create ${COLLECTOR_DIR}/${source.collector}.js, or point the entry at an existing collector in ${CATALOGUE}.`,
    )
  }
}

// ── C4: every source has a panel (FR-020) ────────────────────────────────────────────────────

const dashboardDir = join(ROOT, 'infra/grafana/dashboards')
const dashboards = existsSync(dashboardDir)
  ? readdirSync(dashboardDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dashboardDir, f), 'utf8')))
  : []

/**
 * Collect what each panel actually BINDS to.
 *
 * The dashboards are parsed rather than substring-matched. Raw JSON escapes the quotes inside a
 * PromQL selector (`source=\"gcp\"`), so a naive `text.includes('source="gcp"')` never matches and
 * the gate reports every source as unpanelled — a false failure that would teach everyone to ignore
 * it. Parsing is also what makes "bound by a query" mean the query, not a coincidental substring.
 */
const panelQueries = []
const panelProse = []
for (const dash of dashboards) {
  for (const panel of dash.panels ?? []) {
    for (const target of panel.targets ?? []) {
      if (target.expr) panelQueries.push(target.expr)
    }
    if (panel.title) panelProse.push(panel.title)
    if (panel.options?.content) panelProse.push(panel.options.content)
  }
}

if (!dashboards.length) {
  fail('C4', 'No generated dashboards found in infra/grafana/dashboards/.', 'Run `npm run finops:generate` and commit the result.')
} else {
  for (const source of SOURCES) {
    if (source.status === 'retired') continue
    // A live source is bound by a query naming it; a planned one by its explanatory panel. Both
    // must be present, because "not yet live" is information an operator needs to see.
    const bound = source.status === 'planned'
      ? panelProse.some((t) => t.includes(source.label))
      : panelQueries.some((q) => q.includes(`source="${source.id}"`))
    if (!bound) {
      fail(
        'C4',
        `Source '${source.id}' has a catalogue entry but NO dashboard panel. It would be invisible to operators.`,
        'Run `npm run finops:generate` and commit the result.',
      )
    }
  }
}

// ── C5: committed dashboards match a fresh generation ────────────────────────────────────────

try {
  execFileSync('node', [join(ROOT, 'scripts/finops/generate-dashboards.js'), '--check'], {
    cwd: ROOT,
    stdio: 'pipe',
  })
} catch (err) {
  const detail = (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '')
  fail(
    'C5',
    `Committed dashboards do not match a fresh generation.\n${detail.trim()}`,
    'Run `npm run finops:generate` and commit the result.',
  )
}

// ── report ───────────────────────────────────────────────────────────────────────────────────

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2))
  process.exit(violations.length ? 1 : 0)
}

if (!violations.length) {
  const live = SOURCES.filter((s) => s.status === 'live').length
  const planned = SOURCES.filter((s) => s.status === 'planned').length
  console.log(`FinOps coverage OK — ${live} live source(s), ${planned} planned, all catalogued, emitted and panelled.`)
  process.exit(0)
}

console.error(`\nFinOps coverage gate FAILED with ${violations.length} violation(s):\n`)
for (const v of violations) {
  console.error(`  [${v.check}] ${v.message}`)
  console.error(`         FIX: ${v.fix}\n`)
}
console.error('Why this gate exists: a revenue or cost source that reaches production without a dashboard')
console.error('entry is money moving that nobody is watching. See specs/089-finops-dashboard/spec.md FR-019.\n')
process.exit(1)
