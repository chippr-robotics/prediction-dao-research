/**
 * scripts/secrets/fetch.js — read secret payloads from Google Secret Manager on an operator
 * workstation. Spec 088.
 *
 * WHY THE `gcloud` CLI AND NOT `@google-cloud/secret-manager`:
 * adding an npm dependency to this repo re-resolves the root lockfile, and an incremental npm
 * install here silently drops the platform-specific rolldown binary from both node_modules AND the
 * lockfile (npm/cli#4828) — which breaks every Vite build including the on-chain mini-app release
 * path, and cannot be repaired by re-running install. See the monorepo-workspace skill. The VM
 * already reads secrets with exactly this mechanism (`infra/vm/common/fetch-secrets.sh`), so using
 * it here means one mechanism and one set of failure modes across both surfaces, at zero dependency
 * cost.
 *
 * SECURITY PROPERTIES, all of which are enforced rather than documented:
 *
 *   - NEVER ON ARGV. `/proc/<pid>/cmdline` is world-readable on this host. Payloads are read from
 *     the child's stdout and passed to the consuming process through its environment block, never
 *     as an argument. `execFile` (not `exec`) is used throughout, so nothing reaches a shell.
 *   - NEVER TO DISK. There is no cache file and no temp file. The cache is a process-lifetime Map.
 *   - NEVER LOGGED. No code path interpolates a payload into a string that is printed. `describe()`
 *     exists so callers have something safe to print.
 *   - BYTE-EXACT. stdout is captured as a Buffer and converted once, with no trimming. A payload
 *     whose trailing newline is stripped is a different credential; that is how a PEM stops working
 *     at first use rather than at fetch time.
 */

import { execFile } from 'node:child_process'
import { CLASS, PROJECT_ID, secretsForProfile } from './registry.js'

/** Process-lifetime cache keyed by `id@version`. Never persisted. */
const cache = new Map()

/** A payload can be large (a JWT, a JSON key set); 4 MiB is far above anything we store. */
const MAX_BUFFER = 4 * 1024 * 1024

/**
 * Optional service-account impersonation. The recommended posture on a workstation: the operator
 * authenticates as themselves (`gcloud auth application-default login`) and impersonates the ops
 * service account, so no service-account key file ever exists on this machine. Set by the
 * Terraform-provisioned `FW_SECRETS_IMPERSONATE`.
 */
function impersonationArgs() {
  const sa = process.env.FW_SECRETS_IMPERSONATE
  return sa ? ['--impersonate-service-account', sa] : []
}

/** Run gcloud, resolving with stdout as a Buffer. Rejects with a message that never contains stdout. */
function gcloud(args) {
  return new Promise((resolve, reject) => {
    execFile(
      'gcloud',
      args,
      { encoding: 'buffer', maxBuffer: MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err) {
          const detail = stderr?.toString('utf8').trim().split('\n').slice(-3).join('; ')
          if (err.code === 'ENOENT') {
            return reject(
              new Error(
                'gcloud is not installed or not on PATH. Install the Google Cloud CLI, then run '
                  + '`gcloud auth application-default login`.',
              ),
            )
          }
          return reject(new Error(detail || err.message))
        }
        resolve(stdout)
      },
    )
  })
}

/** Human-safe description of a secret. Contains no payload — use this anywhere you want to print. */
export function describe(entry) {
  return `${entry.id}@${entry.version} -> ${entry.env.join(', ')} [${entry.class}]`
}

/**
 * Fetch one secret's payload.
 *
 * @param {import('./registry.js').SecretEntry} entry
 * @returns {Promise<string>} the payload, byte-exact
 */
export async function fetchSecret(entry) {
  const key = `${entry.id}@${entry.version}`
  if (cache.has(key)) return cache.get(key)

  const stdout = await gcloud([
    'secrets',
    'versions',
    'access',
    entry.version,
    `--secret=${entry.id}`,
    `--project=${PROJECT_ID}`,
    ...impersonationArgs(),
  ])

  const payload = stdout.toString('utf8')
  cache.set(key, payload)
  return payload
}

/**
 * Decide whether a missing secret may fall back to whatever is already in `process.env`.
 *
 * The rule is deliberately asymmetric. A token or endpoint falling back degrades a feature and is
 * recoverable. KEY and PASSWORD material falling back means signing with a key the operator did not
 * choose — so it requires an explicit, separate opt-in (`FW_ALLOW_ENV_SECRETS=true`) on top of the
 * caller's own `allowEnvFallback`, and is refused outright when a public network is the target.
 */
export function mayFallBack(entry, { allowEnvFallback, network }) {
  if (!allowEnvFallback) return false
  const sensitive = entry.class === CLASS.KEY || entry.class === CLASS.PASSWORD
  if (!sensitive) return true
  if (process.env.FW_ALLOW_ENV_SECRETS !== 'true') return false
  // Dev chains only. Anything else is a real network with real value on it.
  return network === undefined || ['hardhat', 'localhost'].includes(network)
}

/**
 * Resolve a whole profile into a flat `{ VAR: value }` map ready to merge into an environment.
 *
 * @param {string} profile           registry profile name
 * @param {object} [opts]
 * @param {boolean} [opts.allowEnvFallback=false]  permit `process.env` to satisfy a miss
 * @param {string}  [opts.network]                 hardhat network name, for the fallback rule
 * @param {(msg: string) => void} [opts.log]       progress sink; never receives a payload
 * @returns {Promise<{ env: Record<string,string>, missing: string[], fellBack: string[] }>}
 */
export async function loadProfile(profile, opts = {}) {
  const { allowEnvFallback = false, network, log = () => {} } = opts
  const entries = secretsForProfile(profile)

  const env = {}
  const missing = []
  const fellBack = []

  // Fetched in parallel: gcloud round-trips dominate, and a deploy profile is several seconds
  // serially. Failures are captured per entry so one missing optional secret cannot mask the rest.
  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        return { entry, payload: await fetchSecret(entry) }
      } catch (err) {
        return { entry, error: err }
      }
    }),
  )

  for (const { entry, payload, error } of results) {
    if (error) {
      if (mayFallBack(entry, { allowEnvFallback, network }) && entry.env.some((n) => process.env[n])) {
        fellBack.push(entry.id)
        log(`  ${entry.id}: unavailable, using the value already in the environment`)
        continue
      }
      missing.push(entry.id)
      log(`  ${entry.id}: UNAVAILABLE — ${error.message}`)
      continue
    }

    if (entry.json) {
      // A malformed payload must name the secret. Without this, JSON.parse throws
      // "Unexpected token" with no indication of which credential is broken.
      let parsed
      try {
        parsed = JSON.parse(payload)
      } catch {
        throw new Error(`Secret ${entry.id} is declared json:true but its payload is not valid JSON.`)
      }
      if (!Array.isArray(parsed) || parsed.length !== entry.expand.length) {
        throw new Error(
          `Secret ${entry.id} must be a JSON array of ${entry.expand.length} items `
            + `(got ${Array.isArray(parsed) ? parsed.length : typeof parsed}).`,
        )
      }
      entry.expand.forEach((name, i) => {
        env[name] = String(parsed[i])
      })
      log(`  ${entry.id}: ok -> ${entry.expand.length} variables`)
    } else {
      for (const name of entry.env) env[name] = payload
      log(`  ${entry.id}: ok -> ${entry.env.join(', ')}`)
    }
  }

  return { env, missing, fellBack }
}
