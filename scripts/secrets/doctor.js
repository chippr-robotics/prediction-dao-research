#!/usr/bin/env node
/**
 * scripts/secrets/doctor.js — diagnose workstation access to Secret Manager. Spec 088.
 *
 *   npm run secrets:doctor
 *
 * Answers, per secret, the question `with-secrets` can only answer as "unavailable": is gcloud
 * installed, is there an active credential, does the container exist, and does this principal hold
 * accessor on it. Those four failures need four different fixes and are indistinguishable from the
 * error a fetch produces, which is why this exists separately.
 *
 * It prints payload SIZES and never payloads.
 */

import { execFile } from 'node:child_process'
import { PROJECT_ID, SECRETS, PROFILES } from './registry.js'
import { describe } from './fetch.js'

const log = (m) => process.stdout.write(`${m}\n`)

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.toString('utf8').trim() || err.message))
      resolve(stdout)
    })
  })
}

const impersonate = process.env.FW_SECRETS_IMPERSONATE
const extra = impersonate ? ['--impersonate-service-account', impersonate] : []

async function main() {
  log('FairWins secrets doctor (spec 097)')
  log(`  project      : ${PROJECT_ID}`)
  log(`  impersonating: ${impersonate || '(none — acting as your own principal)'}`)
  log('')

  // 1. gcloud present?
  try {
    const v = (await run('gcloud', ['--version'])).toString('utf8').split('\n')[0]
    log(`gcloud: ${v.trim()}`)
  } catch {
    log('gcloud: NOT FOUND. Install the Google Cloud CLI and re-run.')
    process.exitCode = 1
    return
  }

  // 2. an active credential?
  try {
    const who = (await run('gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)']))
      .toString('utf8').trim()
    log(who ? `active account: ${who}` : 'active account: NONE — run `gcloud auth login`')
    if (!who) {
      process.exitCode = 1
      return
    }
  } catch (err) {
    log(`active account: could not determine (${err.message})`)
  }
  log('')

  // 3. per-secret reachability
  let bad = 0
  for (const entry of SECRETS) {
    try {
      const out = await run('gcloud', [
        'secrets', 'versions', 'access', entry.version,
        `--secret=${entry.id}`, `--project=${PROJECT_ID}`, ...extra,
      ])
      log(`  ok       ${describe(entry)} (${out.length} bytes)`)
    } catch (err) {
      bad += 1
      const msg = err.message
      // The two failures that matter are told apart, because the fixes are unrelated: one is a
      // migration that has not run, the other is an IAM grant that has not been applied.
      const hint = /NOT_FOUND|was not found/i.test(msg)
        ? 'container does not exist — run `npm run secrets:migrate -- --apply`'
        : /PERMISSION_DENIED|does not have|Permission/i.test(msg)
          ? 'no secretAccessor for this principal — apply infra/terraform (ops-workstation module)'
          : msg.split('\n')[0]
      log(`  FAILED   ${describe(entry)}`)
      log(`           ${hint}`)
    }
  }

  log('')
  log(`profiles: ${PROFILES.join(', ')}`)
  log(bad === 0 ? 'All secrets reachable.' : `${bad} secret(s) unreachable.`)
  if (bad) process.exitCode = 1
}

main().catch((err) => {
  process.stderr.write(`doctor: ${err.message}\n`)
  process.exit(1)
})
