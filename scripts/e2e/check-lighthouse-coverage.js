#!/usr/bin/env node
/**
 * Fail when a budgeted route produced no Lighthouse measurement (spec 094, FR-026).
 *
 * This is the half of the performance gate that BLOCKS, and it is the half worth blocking on.
 * `lhci assert` only evaluates URLs it actually collected, so a route that failed to load — a
 * crashed preview server, a renamed path, a build that never produced the page — contributes
 * nothing and leaves the job green. An unmeasured route reported as a pass is the same defect as a
 * green gate over a crashed test run, which this repo has already shipped once.
 *
 * The budgets themselves report rather than block: a Lighthouse score on a shared runner moves
 * several points between runs, and a gate that mostly reports the runner is one people learn to
 * re-run. Whether a measurement happened is not noisy.
 *
 * It also asserts that both LHCI configs measure EXACTLY the routes in lighthouse-routes.json.
 * Without that, the route set lives in three files and the check silently weakens the day they
 * disagree: a route added only to routes.json would fail as "unmeasured" for a reason that is not
 * the app's fault, and a route dropped from routes.json but still collected would stop being
 * checked at all.
 *
 * Usage:
 *   node scripts/e2e/check-lighthouse-coverage.js [--dir frontend/.lighthouseci]
 *   node scripts/e2e/check-lighthouse-coverage.js --routes-only   # config agreement only, no reports
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')
const ROUTES = path.join(ROOT, 'frontend', 'lighthouse-routes.json')
const PROFILES = ['desktop', 'mobile']
const CONFIG = (profile) => path.join(ROOT, 'frontend', `lighthouserc.${profile}.json`)

/**
 * Both configs must collect exactly the expected URLs — same set, no extras, no omissions.
 * Returns a list of human-readable disagreements; empty means they agree.
 */
function routeConfigDrift(expectedUrls) {
  const problems = []
  const want = [...expectedUrls].sort()

  for (const profile of PROFILES) {
    const file = CONFIG(profile)
    if (!fs.existsSync(file)) {
      problems.push(`lighthouserc.${profile}.json is missing`)
      continue
    }
    const config = JSON.parse(fs.readFileSync(file, 'utf8'))
    const got = [...(config.ci?.collect?.url ?? [])].sort()

    for (const url of want) {
      if (!got.includes(url)) problems.push(`lighthouserc.${profile}.json does not collect ${url}`)
    }
    for (const url of got) {
      if (!want.includes(url)) problems.push(`lighthouserc.${profile}.json collects ${url}, which lighthouse-routes.json does not list`)
    }
  }
  return problems
}

function reportsIn(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('lhr-') && f.endsWith('.json'))
    .map((f) => {
      try {
        const lhr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
        return { file: f, url: lhr.requestedUrl || lhr.finalUrl || lhr.finalDisplayedUrl }
      } catch {
        // A truncated report is not a measurement. Counting it as one is the failure mode.
        return { file: f, url: null }
      }
    })
}

function main() {
  const dirArg = process.argv.indexOf('--dir')
  const baseDir = dirArg > -1 ? process.argv[dirArg + 1] : path.join(ROOT, 'frontend', '.lighthouseci')
  const routesOnly = process.argv.includes('--routes-only')

  const { baseUrl, routes } = JSON.parse(fs.readFileSync(ROUTES, 'utf8'))
  const expected = routes.map((r) => ({ path: r.path, url: baseUrl + r.path }))

  // Checked FIRST, and independently of whether any report exists: a drifted config makes the
  // report check answer a different question than the one it appears to answer.
  const drift = routeConfigDrift(expected.map((r) => r.url))
  if (drift.length) {
    console.error(
      '::error::The Lighthouse configs and lighthouse-routes.json disagree about what is measured:\n  ' +
        drift.join('\n  ')
    )
    process.exit(1)
  }
  if (routesOnly) {
    console.log(`Lighthouse route configs agree with lighthouse-routes.json (${expected.length} route(s), ${PROFILES.length} profile(s)).`)
    return
  }

  const missing = []
  const unreadable = []

  for (const profile of PROFILES) {
    const dir = path.join(baseDir, profile)
    const reports = reportsIn(dir)
    unreadable.push(...reports.filter((r) => !r.url).map((r) => `${profile}/${r.file}`))
    const measured = new Set(reports.filter((r) => r.url).map((r) => r.url.replace(/\/$/, '')))

    for (const route of expected) {
      if (!measured.has(route.url.replace(/\/$/, ''))) missing.push(`${profile}  ${route.path}`)
    }
  }

  if (unreadable.length) {
    console.error(`::error::Lighthouse produced ${unreadable.length} unreadable report(s): ${unreadable.join(', ')}`)
  }
  if (missing.length) {
    console.error(
      `::error::${missing.length} route × profile pair(s) produced no Lighthouse measurement. ` +
        'An unmeasured route must fail, not pass quietly:\n  ' +
        missing.join('\n  ')
    )
    process.exit(1)
  }
  if (unreadable.length) process.exit(1)

  console.log(
    `Lighthouse coverage: ${expected.length} route(s) × ${PROFILES.length} profile(s) all measured.`
  )
}

if (require.main === module) main()

module.exports = { routeConfigDrift }
