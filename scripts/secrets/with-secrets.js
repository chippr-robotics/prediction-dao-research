#!/usr/bin/env node
/**
 * scripts/secrets/with-secrets.js — run a command with a secret profile injected into its
 * environment, and nothing written to disk. Spec 088.
 *
 *   node scripts/secrets/with-secrets.js --profile deploy -- npx hardhat run scripts/deploy/x.js --network polygon
 *   npm run sec -- --profile verify -- npm run verify:polygon
 *
 * WHY A WRAPPER RATHER THAN A CALL INSIDE hardhat.config.js:
 * `hardhat.config.js` resolves accounts SYNCHRONOUSLY at module load (see `loadFloppyKeysSync`).
 * Fetching a secret is a network round-trip. The options were a synchronous `execFileSync` on
 * gcloud inside the config — which pays ~1s on *every* hardhat invocation including `compile` and
 * `test`, both of which need no secrets at all — or delivering the environment from outside. The
 * wrapper keeps the no-secret paths free and leaves `hardhat.config.js` unmodified, so the floppy
 * keystore flow it already implements continues to work exactly as before and stays the preferred
 * source for admin keys.
 *
 * The child inherits stdio, so interactive tools (a hardhat console, a deploy confirmation prompt)
 * behave normally, and the child's exit code is propagated — this is transparent in a pipeline.
 */

import { spawn } from 'node:child_process'
import { loadProfile } from './fetch.js'
import { PROFILES } from './registry.js'

function usage(msg) {
  const lines = [
    msg && `error: ${msg}`,
    '',
    'usage: with-secrets.js --profile <name> [--network <net>] [--allow-env-fallback] -- <command...>',
    '',
    `profiles: ${PROFILES.join(', ')}`,
    '',
    'examples:',
    '  with-secrets.js --profile verify -- npm run verify:polygon',
    '  with-secrets.js --profile deploy --network polygon -- npx hardhat run scripts/deploy/foo.js --network polygon',
    '',
  ].filter((l) => l !== undefined && l !== null)
  console.error(lines.join('\n'))
  process.exit(msg ? 2 : 0)
}

function parseArgs(argv) {
  const sep = argv.indexOf('--')
  if (sep === -1) usage('missing `--` separator before the command to run')

  const flags = argv.slice(0, sep)
  const command = argv.slice(sep + 1)
  if (command.length === 0) usage('no command given after `--`')

  const opts = { profile: null, network: undefined, allowEnvFallback: false, quiet: false }
  for (let i = 0; i < flags.length; i += 1) {
    const f = flags[i]
    if (f === '--profile') opts.profile = flags[++i]
    else if (f === '--network') opts.network = flags[++i]
    else if (f === '--allow-env-fallback') opts.allowEnvFallback = true
    else if (f === '--quiet') opts.quiet = true
    else if (f === '--help' || f === '-h') usage()
    else usage(`unrecognised flag ${f}`)
  }
  if (!opts.profile) usage('--profile is required')
  return { opts, command }
}

async function main() {
  const { opts, command } = parseArgs(process.argv.slice(2))
  // Progress goes to stderr so it never contaminates a command whose stdout is being captured.
  const log = opts.quiet ? () => {} : (m) => process.stderr.write(`[secrets] ${m}\n`)

  log(`profile "${opts.profile}"`)
  const { env, missing, fellBack } = await loadProfile(opts.profile, {
    allowEnvFallback: opts.allowEnvFallback,
    network: opts.network,
    log,
  })

  if (missing.length) {
    process.stderr.write(
      `[secrets] FATAL: ${missing.length} secret(s) unavailable: ${missing.join(', ')}\n`
        + '[secrets] Check: gcloud auth application-default login; and that your principal holds\n'
        + '[secrets] roles/secretmanager.secretAccessor on those secrets (see infra/terraform).\n'
        + '[secrets] Run `npm run secrets:doctor` for a per-secret diagnosis.\n',
    )
    process.exit(1)
  }
  if (fellBack.length) {
    // Loud on purpose. A silent fallback is indistinguishable from a working vault.
    process.stderr.write(
      `[secrets] WARNING: used pre-existing environment values for: ${fellBack.join(', ')}\n`,
    )
  }

  const child = spawn(command[0], command.slice(1), {
    // The ONLY delivery channel: the child's environment block. Never a file, never argv.
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: false,
  })

  child.on('error', (err) => {
    process.stderr.write(`[secrets] failed to start "${command[0]}": ${err.message}\n`)
    process.exit(127)
  })
  // Signal-terminated children report a null exit code; propagate the signal number instead of
  // reporting success, which would let a killed deploy look like a clean one in CI.
  child.on('exit', (code, signal) => {
    process.exit(code === null ? 128 + (signal ? 1 : 0) : code)
  })
}

main().catch((err) => {
  process.stderr.write(`[secrets] ${err.message}\n`)
  process.exit(1)
})
