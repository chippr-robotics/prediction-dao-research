#!/usr/bin/env node
/**
 * Push the generated dashboards and alert rules to Grafana Cloud (spec 090, FR-017).
 *
 *   npm run finops:provision              apply
 *   npm run finops:provision -- --dry-run show what would change, touch nothing
 *   npm run finops:provision -- --detect-drift  report UI-authored changes, exit 1 if any
 *
 * WHY PROVISIONING IS ONE-WAY. Dashboards are edited in the repo and pushed. A dashboard edited in
 * the Grafana UI is DRIFT: it is not reviewed, it is not in any diff, and it is lost the next time
 * anyone runs this. `--detect-drift` exists so that loss is announced rather than discovered.
 *
 * CREDENTIAL. `GRAFANA_API_TOKEN` and `GRAFANA_URL` come from the environment; in operation they are
 * read from Secret Manager (`finops-grafana-cloud-token`). Nothing is committed and nothing is
 * logged — a token is never printed, not even partially.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const DASH_DIR = join(ROOT, 'infra/grafana/dashboards')
const ALERT_FILE = join(ROOT, 'infra/grafana/alerts/finops-alerts.json')

const DRY_RUN = process.argv.includes('--dry-run')
const DETECT_DRIFT = process.argv.includes('--detect-drift')

const GRAFANA_URL = process.env.GRAFANA_URL?.replace(/\/$/, '')
const TOKEN = process.env.GRAFANA_API_TOKEN
const FOLDER = process.env.GRAFANA_FOLDER ?? 'FinOps'

if (!GRAFANA_URL || !TOKEN) {
  console.error('GRAFANA_URL and GRAFANA_API_TOKEN must be set.')
  console.error('In operation both come from Secret Manager — see docs/runbooks/finops-operations.md#provisioning.')
  process.exit(2)
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${GRAFANA_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON error bodies are reported as text below */
  }
  if (!res.ok) {
    // The URL is safe to print; the token rides in a header and is never interpolated into it.
    throw new Error(`Grafana API ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`)
  }
  return parsed
}

/** Ensure the folder exists. Idempotent: an existing folder is reused, never recreated. */
async function ensureFolder() {
  const folders = await api('/api/folders')
  const existing = folders.find((f) => f.title === FOLDER)
  if (existing) return existing.uid
  if (DRY_RUN) {
    console.log(`[dry-run] would create folder '${FOLDER}'`)
    return null
  }
  const created = await api('/api/folders', { method: 'POST', body: { title: FOLDER } })
  console.log(`created folder '${FOLDER}' (${created.uid})`)
  return created.uid
}

function localDashboards() {
  if (!existsSync(DASH_DIR)) return []
  return readdirSync(DASH_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(DASH_DIR, f), 'utf8')))
}

/**
 * Compare the live dashboard against the committed one, ignoring the fields Grafana owns.
 *
 * `version`, `id` and `folderId` are assigned by the server on every save, so comparing them would
 * report drift on a dashboard nobody has touched — the classic false positive that gets a drift
 * check switched off within a week.
 */
function differs(local, remote) {
  const strip = (d) => {
    const { version, id, folderId, folderUid, ...rest } = d ?? {}
    return JSON.stringify(rest)
  }
  return strip(local) !== strip(remote)
}

async function main() {
  const dashboards = localDashboards()
  if (!dashboards.length) {
    console.error('No dashboards found. Run `npm run finops:generate` first.')
    process.exit(1)
  }

  if (DETECT_DRIFT) {
    let drifted = 0
    for (const dash of dashboards) {
      let remote = null
      try {
        remote = (await api(`/api/dashboards/uid/${dash.uid}`))?.dashboard
      } catch {
        console.log(`  MISSING  ${dash.uid} — not provisioned yet`)
        drifted++
        continue
      }
      if (differs(dash, remote)) {
        console.log(`  DRIFTED  ${dash.uid} — the live dashboard differs from the committed one`)
        drifted++
      } else {
        console.log(`  ok       ${dash.uid}`)
      }
    }
    if (drifted) {
      console.error(`\n${drifted} dashboard(s) drifted. A UI edit is NOT preserved — running`)
      console.error('`npm run finops:provision` overwrites it. Move the change into the catalogue or')
      console.error('the panel builders and regenerate, or the next provision silently discards it.\n')
      process.exit(1)
    }
    console.log('\nNo dashboard drift.')
    return
  }

  const folderUid = await ensureFolder()

  for (const dash of dashboards) {
    if (DRY_RUN) {
      console.log(`[dry-run] would upsert dashboard ${dash.uid} (${dash.title})`)
      continue
    }
    await api('/api/dashboards/db', {
      method: 'POST',
      body: {
        dashboard: { ...dash, id: null },
        folderUid,
        // The repo is the source of truth; a UI edit is drift, not an input.
        overwrite: true,
        message: 'Provisioned from prediction-dao-research (spec 090). Edit the catalogue, not the UI.',
      },
    })
    console.log(`provisioned dashboard ${dash.uid} (${dash.title})`)
  }

  // Alert rules. Grafana's provisioning API takes them one at a time; a rule that fails to apply is
  // reported and the rest continue — a single bad rule must not leave the estate with NO money
  // alerting, which is where it started.
  if (existsSync(ALERT_FILE)) {
    const { groups } = JSON.parse(readFileSync(ALERT_FILE, 'utf8'))
    let applied = 0
    let failed = 0
    for (const group of groups) {
      for (const rule of group.rules) {
        if (DRY_RUN) {
          console.log(`[dry-run] would upsert alert rule ${rule.uid} (${rule.title})`)
          continue
        }
        try {
          await api('/api/v1/provisioning/alert-rules', {
            method: 'POST',
            body: {
              ...rule,
              folderUID: folderUid,
              ruleGroup: group.name,
              orgID: 1,
              // Grafana requires an explicit interval per rule on this endpoint.
              intervalSeconds: 60,
            },
          })
          applied++
        } catch (err) {
          // An existing rule 409s; that is an update, not a failure.
          if (/409/.test(err.message)) {
            await api(`/api/v1/provisioning/alert-rules/${rule.uid}`, {
              method: 'PUT',
              body: { ...rule, folderUID: folderUid, ruleGroup: group.name, orgID: 1, intervalSeconds: 60 },
            })
            applied++
          } else {
            console.error(`  FAILED alert rule ${rule.uid}: ${err.message}`)
            failed++
          }
        }
      }
    }
    console.log(`alert rules: ${applied} applied, ${failed} failed`)
    if (failed) process.exit(1)
  }

  console.log('\nDone. Remember: dashboards edited in the Grafana UI are overwritten by this script.')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
