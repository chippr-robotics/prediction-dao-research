/**
 * Tenant scoping of the gateway (spec 072, T023 / US2.5).
 *
 * One gateway process serves one tenant: TENANT_ID resolves the records dir to
 * deployments/tenants/<id>/ and the existing FR-025 startup allowlist becomes
 * the tenant boundary — another tenant's contract addresses simply do not
 * exist in this process's config, so intents targeting them are refused by the
 * same path that refuses any unknown target.
 */
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from '../src/config/index.js'
import { DEPLOYMENTS_DIR } from './helpers.js'

const TENANT = 'acme-test'
let tmpRoot

beforeAll(() => {
  // Fabricate a tenant estate: a records tree with deployments/tenants/<id>/
  // holding a valid record for chain 137 with DIFFERENT addresses than the
  // shared estate.
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-gateway-'))
  const tenantDir = path.join(tmpRoot, 'tenants', TENANT)
  fs.mkdirSync(tenantDir, { recursive: true })
  const shared = JSON.parse(
    fs.readFileSync(path.join(DEPLOYMENTS_DIR, 'polygon-chain137-v2.json'), 'utf8')
  )
  const tenantRecord = JSON.parse(JSON.stringify(shared))
  tenantRecord.contracts.wagerRegistry = '0x1111111111111111111111111111111111111111'
  tenantRecord.contracts.membershipManager = '0x2222222222222222222222222222222222222222'
  fs.writeFileSync(path.join(tenantDir, 'polygon-chain137-v2.json'), JSON.stringify(tenantRecord))
})

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('gateway tenant scoping (spec 072)', () => {
  it('TENANT_ID resolves records from the tenant estate, not the shared one', () => {
    const config = loadConfig({
      ENABLED_CHAIN_IDS: '137',
      TENANT_ID: TENANT,
      DEPLOYMENTS_DIR: path.join(tmpRoot, 'tenants', TENANT),
    })
    expect(config.tenantId).toBe(TENANT)
    expect(config.chains[137].targetsByKey.wagerRegistry).toBe('0x1111111111111111111111111111111111111111')
  })

  it("the shared estate's addresses are NOT in a tenant-scoped allowlist (US2.5)", () => {
    const config = loadConfig({
      ENABLED_CHAIN_IDS: '137',
      TENANT_ID: TENANT,
      DEPLOYMENTS_DIR: path.join(tmpRoot, 'tenants', TENANT),
    })
    const shared = JSON.parse(
      fs.readFileSync(path.join(DEPLOYMENTS_DIR, 'polygon-chain137-v2.json'), 'utf8')
    )
    const allowlisted = Object.keys(config.chains[137].targets)
    expect(allowlisted).not.toContain(shared.contracts.wagerRegistry.toLowerCase())
  })

  it('a tenant with no records refuses to start (FR-025 unchanged)', () => {
    expect(() =>
      loadConfig({
        ENABLED_CHAIN_IDS: '137',
        TENANT_ID: 'ghost-tenant',
        DEPLOYMENTS_DIR: path.join(tmpRoot, 'tenants', 'ghost-tenant'),
      })
    ).toThrow(/cannot read deployments dir|no deployment record/)
  })

  it('invalid TENANT_ID fails loudly', () => {
    expect(() => loadConfig({ ENABLED_CHAIN_IDS: '137', TENANT_ID: 'Not Valid!' })).toThrow(
      /invalid TENANT_ID/
    )
  })

  it('unset TENANT_ID keeps the shared estate (default behavior unchanged)', () => {
    const config = loadConfig(
      { ENABLED_CHAIN_IDS: '137,80002,63', ENGINE_URL: 'http://engine.test.invalid' },
      { deploymentsDir: DEPLOYMENTS_DIR }
    )
    expect(config.tenantId).toBe(null)
    expect(config.chains[137].targetsByKey.wagerRegistry).toBeTruthy()
  })
})
