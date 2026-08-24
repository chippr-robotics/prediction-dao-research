/**
 * Spec 088 — the code and the IAM must describe the same thing.
 *
 * `scripts/secrets/registry.js` says which secrets the workstation tooling reads.
 * `infra/terraform/environments/prod/terraform.tfvars` says which secrets the workstation identity
 * is GRANTED. Nothing structural ties them together: they are two lists in two languages.
 *
 * The failure that makes this test worth having is silent and slow. Someone adds a secret to the
 * registry, ships it, and never touches Terraform. The grant is simply absent, so the fetch fails
 * with PERMISSION_DENIED — which is indistinguishable from a broken login or an expired
 * credential, and sends the next person to debug gcloud auth for an hour. The reverse drift is
 * quieter still: a secret left in `workstation_secret_ids` after the registry drops it is standing
 * over-permission that no test would otherwise report.
 *
 * The tfvars is parsed textually rather than with an HCL library, deliberately: adding an HCL
 * parser dependency to this repo re-resolves the root lockfile, which is a documented hazard here
 * (see the monorepo-workspace skill). The lists are plain quoted strings, so a regex is sufficient
 * and has no failure mode worse than "the test cannot find the block", which it asserts against.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allSecretIds } from '../registry.js'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const TFVARS = join(REPO_ROOT, 'infra', 'terraform', 'environments', 'prod', 'terraform.tfvars')

/** Extract a `name = [ "a", "b" ]` list from HCL, ignoring `#` comments inside it. */
function hclList(source, name) {
  const re = new RegExp(`^${name}\\s*=\\s*\\[([\\s\\S]*?)^\\]`, 'm')
  const m = re.exec(source)
  assert.ok(m, `could not find the ${name} list in terraform.tfvars — has the file been restructured?`)
  return m[1]
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((l) => l.replace(/^"/, '').replace(/",?$/, ''))
    .filter(Boolean)
}

const tfvars = readFileSync(TFVARS, 'utf8')

test('every registry secret is granted to the workstation identity', () => {
  const granted = new Set(hclList(tfvars, 'workstation_secret_ids'))
  const missing = allSecretIds().filter((id) => !granted.has(id))
  assert.deepEqual(
    missing,
    [],
    `these secrets are in the registry but not granted in terraform.tfvars, so reading them will `
      + `fail with PERMISSION_DENIED at use time: ${missing.join(', ')}`,
  )
})

test('the workstation is granted nothing the registry does not declare', () => {
  const declared = new Set(allSecretIds())
  const extra = hclList(tfvars, 'workstation_secret_ids').filter((id) => !declared.has(id))
  assert.deepEqual(
    extra,
    [],
    `these grants exist in terraform.tfvars with nothing in the registry needing them — standing `
      + `over-permission: ${extra.join(', ')}`,
  )
})

test('every workstation secret has a managed container, so prevent_destroy covers it', () => {
  // A granted-but-unmanaged secret is readable and unprotected: nothing stops it being deleted, and
  // deleting a container destroys every version in it.
  const managed = new Set(hclList(tfvars, 'managed_secret_ids'))
  const unmanaged = allSecretIds().filter((id) => !managed.has(id))
  assert.deepEqual(
    unmanaged,
    [],
    `these secrets are read by the tooling but not under management, so they carry no `
      + `prevent_destroy: ${unmanaged.join(', ')}`,
  )
})

test('the parity check can actually fail', () => {
  // A gate that passes on everything looks identical from outside to one that works. This asserts
  // the extractor finds real content, so the two tests above are comparing something.
  const granted = hclList(tfvars, 'workstation_secret_ids')
  assert.ok(granted.length >= 12, `expected the workstation grant list to be populated, got ${granted.length}`)
  assert.ok(granted.every((id) => /^fairwins-/.test(id)), 'parsed entries do not look like secret ids')
})
